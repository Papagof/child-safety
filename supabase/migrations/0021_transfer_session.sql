-- session_payload gains staff names (spec.md §3.5: "parent's app confirms with
-- a timestamp, staff name, and room") and transfer metadata.
create or replace function public.session_payload(p_session public.sessions, p_include_codes boolean)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_child jsonb;
  v_requester jsonb;
  v_checkin_staff_name text;
  v_checkout_staff_name text;
begin
  select jsonb_build_object(
    'id', c.id,
    'fullName', c.full_name,
    'dob', c.dob,
    'age', public.age_from_dob(c.dob),
    'photoUrl', c.photo_url,
    'medicalNotes', c.medical_notes,
    'guardianId', c.guardian_id,
    'guardianName', p.full_name,
    'guardianPhone', p.phone,
    'guardianPhotoUrl', p.photo_url
  )
  into v_child
  from public.children c
  join public.profiles p on p.id = c.guardian_id
  where c.id = p_session.child_id;

  if p_session.checkout_requested_by_type = 'guardian' then
    select jsonb_build_object(
      'type', 'guardian',
      'id', p.id,
      'fullName', p.full_name,
      'photoUrl', p.photo_url,
      'relationship', 'Parent/Guardian',
      'phone', p.phone
    )
    into v_requester
    from public.profiles p
    where p.id = p_session.checkout_requested_by_id;
  elsif p_session.checkout_requested_by_type = 'pickup_person' then
    select jsonb_build_object(
      'type', 'pickup_person',
      'id', pp.id,
      'fullName', pp.full_name,
      'photoUrl', pp.photo_url,
      'relationship', pp.relationship,
      'status', pp.status
    )
    into v_requester
    from public.pickup_people pp
    where pp.id = p_session.checkout_requested_by_id;
  else
    v_requester := null;
  end if;

  select full_name into v_checkin_staff_name from public.profiles where id = p_session.checkin_staff_id;
  select full_name into v_checkout_staff_name from public.profiles where id = p_session.checkout_staff_id;

  return jsonb_build_object(
    'id', p_session.id,
    'status', p_session.status,
    'roomId', p_session.room_id,
    'serviceDate', p_session.service_date,
    'child', v_child,
    'checkinRequestedAt', p_session.checkin_requested_at,
    'checkinAcceptedAt', p_session.checkin_accepted_at,
    'checkinCodeExpiresAt', p_session.checkin_code_expires_at,
    'checkinDeclineReason', p_session.checkin_decline_reason,
    'checkinStaffName', v_checkin_staff_name,
    'checkoutRequestedAt', p_session.checkout_requested_at,
    'checkoutCodeExpiresAt', p_session.checkout_code_expires_at,
    'checkoutApprovedAt', p_session.checkout_approved_at,
    'checkoutStaffName', v_checkout_staff_name,
    'requester', v_requester,
    'isTransfer', p_session.is_transfer,
    'transferredFromSessionId', p_session.transferred_from_session_id
  ) || case when p_include_codes
    then jsonb_build_object('checkinCode', p_session.checkin_code, 'checkoutCode', p_session.checkout_code)
    else '{}'::jsonb
  end;
end;
$$;

-- accept_checkin: skip code/expiry checks for a transfer-created session (no
-- code exists for a staff-to-staff handoff — the guardian isn't involved).
create or replace function public.accept_checkin(p_session_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.sessions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_approved_staff() then raise exception 'Staff account is not yet approved by an admin'; end if;

  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;

  if not public.is_staff_assigned_to_room(auth.uid(), v_session.room_id) then
    raise exception 'You are not assigned to this room';
  end if;

  if v_session.status <> 'pending_checkin' then
    raise exception 'Session is not pending check-in (current status: %)', v_session.status;
  end if;

  if not v_session.is_transfer then
    if v_session.checkin_code_expires_at < now() then
      raise exception 'Check-in code has expired';
    end if;

    if v_session.checkin_code <> p_code then
      insert into public.audit_log (session_id, actor_id, actor_role, action, details)
      values (v_session.id, auth.uid(), 'staff', 'checkin_code_mismatch', jsonb_build_object('attempted', p_code));
      return jsonb_build_object('error', 'code_mismatch');
    end if;
  end if;

  update public.sessions
    set status = 'checked_in', checkin_accepted_at = now(), checkin_staff_id = auth.uid()
    where id = v_session.id
    returning * into v_session;

  insert into public.chat_threads (session_id, guardian_id, room_id)
  select v_session.id, c.guardian_id, v_session.room_id
  from public.children c where c.id = v_session.child_id
  on conflict (session_id) do nothing;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_session.id, auth.uid(), 'staff', 'checkin_accepted', '{}'::jsonb);

  perform public.notify_session_update(v_session);

  return jsonb_build_object('session', public.session_payload(v_session, false));
end;
$$;

-- transfer_session: unifies spec.md §3.1 ("room editable by staff if needed")
-- and §10.4 (mid-service transfer). Works on pending_checkin OR checked_in.
-- Always creates a NEW session in the destination room requiring that room's
-- staff to separately accept it — never moves custody unilaterally.
create or replace function public.transfer_session(p_session_id uuid, p_new_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_old public.sessions;
  v_new_room public.rooms;
  v_new public.sessions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_approved_staff() then raise exception 'Staff account is not yet approved by an admin'; end if;

  select * into v_old from public.sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;

  if not public.is_staff_assigned_to_room(auth.uid(), v_old.room_id) then
    raise exception 'You are not assigned to this room';
  end if;

  if v_old.status not in ('pending_checkin', 'checked_in') then
    raise exception 'Session cannot be transferred (current status: %)', v_old.status;
  end if;

  select * into v_new_room from public.rooms where id = p_new_room_id and active = true;
  if not found then raise exception 'Destination room not found or inactive'; end if;
  if v_new_room.id = v_old.room_id then
    raise exception 'Cannot transfer to the same room';
  end if;

  update public.sessions set status = 'transferred' where id = v_old.id returning * into v_old;

  insert into public.sessions (child_id, room_id, service_date, status, checkin_requested_at, is_transfer, transferred_from_session_id, created_at)
  values (v_old.child_id, p_new_room_id, v_old.service_date, 'pending_checkin', now(), true, v_old.id, now())
  returning * into v_new;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_old.id, auth.uid(), 'staff', 'session_transferred_out', jsonb_build_object('newRoomId', p_new_room_id, 'newSessionId', v_new.id));
  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_new.id, auth.uid(), 'staff', 'session_transferred_in', jsonb_build_object('oldRoomId', v_old.room_id, 'oldSessionId', v_old.id));

  perform public.notify_session_update(v_old);
  perform public.notify_session_update(v_new);

  return jsonb_build_object('oldSession', public.session_payload(v_old, false), 'newSession', public.session_payload(v_new, false));
end;
$$;

grant execute on function public.transfer_session(uuid, uuid) to authenticated;
revoke execute on function public.transfer_session(uuid, uuid) from anon, public;
