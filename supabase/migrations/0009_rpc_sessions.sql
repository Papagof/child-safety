-- Internal payload builder: a direct port of fullSessionPayload() in
-- server/src/routes/sessions.ts. Codes are only ever included when the
-- caller has already been verified (by the calling RPC) as the owning
-- guardian — this function itself does no authorization, it only formats.
create or replace function public.session_payload(p_session public.sessions, p_include_codes boolean)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_child jsonb;
  v_requester jsonb;
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
    'checkoutRequestedAt', p_session.checkout_requested_at,
    'checkoutCodeExpiresAt', p_session.checkout_code_expires_at,
    'checkoutApprovedAt', p_session.checkout_approved_at,
    'requester', v_requester
  ) || case when p_include_codes
    then jsonb_build_object('checkinCode', p_session.checkin_code, 'checkoutCode', p_session.checkout_code)
    else '{}'::jsonb
  end;
end;
$$;

revoke execute on function public.session_payload(public.sessions, boolean) from public;

-- Internal broadcaster: room/admin get the codes-free payload, the owning
-- guardian's channel gets the codes-included one. Called from inside the
-- same transaction as the mutation, so a rolled-back mismatch never broadcasts.
create or replace function public.notify_session_update(p_session public.sessions)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guardian_id uuid;
  v_no_codes jsonb;
  v_with_codes jsonb;
begin
  select c.guardian_id into v_guardian_id from public.children c where c.id = p_session.child_id;
  v_no_codes := public.session_payload(p_session, false);
  v_with_codes := public.session_payload(p_session, true);

  perform realtime.send(jsonb_build_object('type','session_updated','session', v_no_codes), 'session_updated', 'room:' || p_session.room_id, true);
  perform realtime.send(jsonb_build_object('type','session_updated','session', v_no_codes), 'session_updated', 'admin', true);
  perform realtime.send(jsonb_build_object('type','session_updated','session', v_with_codes), 'session_updated', 'guardian:' || v_guardian_id, true);
end;
$$;

revoke execute on function public.notify_session_update(public.sessions) from public;

-- request_checkin ------------------------------------------------------------
create or replace function public.request_checkin(p_child_id uuid, p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_child public.children;
  v_room public.rooms;
  v_session public.sessions;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_child from public.children where id = p_child_id and guardian_id = auth.uid();
  if not found then raise exception 'Child not found'; end if;

  select * into v_room from public.rooms where id = p_room_id and active = true;
  if not found then raise exception 'Room not found or inactive'; end if;

  v_code := public.generate_code();

  begin
    insert into public.sessions (
      child_id, room_id, service_date, status,
      checkin_code, checkin_code_expires_at, checkin_requested_at, created_at
    ) values (
      p_child_id, p_room_id, public.today_service_date(), 'pending_checkin',
      v_code, now() + interval '4 hours', now(), now()
    )
    returning * into v_session;
  exception when unique_violation then
    raise exception 'This child already has an active check-in/checkout session today';
  end;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_session.id, auth.uid(), 'guardian', 'checkin_requested', jsonb_build_object('childId', p_child_id, 'roomId', p_room_id));

  perform public.notify_session_update(v_session);

  return jsonb_build_object('session', public.session_payload(v_session, true), 'code', v_code);
end;
$$;

grant execute on function public.request_checkin(uuid, uuid) to authenticated;

-- accept_checkin ---------------------------------------------------------------
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

  if v_session.checkin_code_expires_at < now() then
    raise exception 'Check-in code has expired';
  end if;

  -- Mismatch must permanently record the audit row without rolling back, so
  -- it returns a structured result instead of raising.
  if v_session.checkin_code <> p_code then
    insert into public.audit_log (session_id, actor_id, actor_role, action, details)
    values (v_session.id, auth.uid(), 'staff', 'checkin_code_mismatch', jsonb_build_object('attempted', p_code));
    return jsonb_build_object('error', 'code_mismatch');
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

grant execute on function public.accept_checkin(uuid, text) to authenticated;

-- decline_checkin ---------------------------------------------------------------
create or replace function public.decline_checkin(p_session_id uuid, p_reason text default null)
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

  update public.sessions
    set status = 'declined', checkin_decline_reason = p_reason
    where id = v_session.id
    returning * into v_session;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_session.id, auth.uid(), 'staff', 'checkin_declined', jsonb_build_object('reason', p_reason));

  perform public.notify_session_update(v_session);

  return jsonb_build_object('session', public.session_payload(v_session, false));
end;
$$;

grant execute on function public.decline_checkin(uuid, text) to authenticated;

-- request_checkout ---------------------------------------------------------------
create or replace function public.request_checkout(p_session_id uuid, p_pickup_person_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.sessions;
  v_pp public.pickup_people;
  v_code text;
  v_requested_by_type text;
  v_requested_by_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select s.* into v_session
  from public.sessions s
  join public.children c on c.id = s.child_id
  where s.id = p_session_id and c.guardian_id = auth.uid();
  if not found then raise exception 'Session not found'; end if;

  if v_session.status <> 'checked_in' then
    raise exception 'Session is not checked in (current status: %)', v_session.status;
  end if;

  if p_pickup_person_id is not null then
    select * into v_pp from public.pickup_people where id = p_pickup_person_id and child_id = v_session.child_id;
    if not found then raise exception 'Pickup person not found'; end if;

    if v_pp.status = 'blocked' then
      return jsonb_build_object('blocked', true, 'reason', v_pp.blocked_reason);
    elsif v_pp.status <> 'active' then
      raise exception 'This person is not currently an active authorized pickup contact';
    end if;

    v_requested_by_type := 'pickup_person';
    v_requested_by_id := v_pp.id;
  else
    v_requested_by_type := 'guardian';
    v_requested_by_id := auth.uid();
  end if;

  v_code := public.generate_code();

  update public.sessions
    set status = 'pending_checkout',
        checkout_code = v_code,
        checkout_code_expires_at = now() + interval '30 minutes',
        checkout_requested_at = now(),
        checkout_requested_by_type = v_requested_by_type,
        checkout_requested_by_id = v_requested_by_id
    where id = v_session.id
    returning * into v_session;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_session.id, auth.uid(), 'guardian', 'checkout_requested', jsonb_build_object('requestedByType', v_requested_by_type, 'requestedById', v_requested_by_id));

  perform public.notify_session_update(v_session);

  return jsonb_build_object('session', public.session_payload(v_session, true), 'code', v_code);
end;
$$;

grant execute on function public.request_checkout(uuid, uuid) to authenticated;

-- approve_checkout ---------------------------------------------------------------
create or replace function public.approve_checkout(p_session_id uuid, p_code text)
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

  if v_session.status <> 'pending_checkout' then
    raise exception 'Session is not pending checkout (current status: %)', v_session.status;
  end if;

  if v_session.checkout_code_expires_at < now() then
    raise exception 'Checkout code has expired';
  end if;

  if v_session.checkout_code <> p_code then
    insert into public.audit_log (session_id, actor_id, actor_role, action, details)
    values (v_session.id, auth.uid(), 'staff', 'checkout_code_mismatch', jsonb_build_object('attempted', p_code));
    return jsonb_build_object('error', 'code_mismatch');
  end if;

  update public.sessions
    set status = 'checked_out', checkout_approved_at = now(), checkout_staff_id = auth.uid()
    where id = v_session.id
    returning * into v_session;

  update public.chat_threads set status = 'archived' where session_id = v_session.id;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_session.id, auth.uid(), 'staff', 'checkout_approved', '{}'::jsonb);

  perform public.notify_session_update(v_session);

  return jsonb_build_object('session', public.session_payload(v_session, false));
end;
$$;

grant execute on function public.approve_checkout(uuid, text) to authenticated;

-- flag_pickup_mismatch ---------------------------------------------------------------
create or replace function public.flag_pickup_mismatch(p_session_id uuid, p_description text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.sessions;
  v_incident_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_approved_staff() then raise exception 'Staff account is not yet approved by an admin'; end if;

  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;

  if not public.is_staff_assigned_to_room(auth.uid(), v_session.room_id) then
    raise exception 'You are not assigned to this room';
  end if;

  insert into public.incidents (session_id, room_id, type, description, reported_by, status)
  values (v_session.id, v_session.room_id, 'failed_pickup', p_description, auth.uid(), 'open')
  returning id into v_incident_id;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_session.id, auth.uid(), 'staff', 'checkout_mismatch_flagged', jsonb_build_object('description', p_description));

  perform realtime.send(jsonb_build_object('type','incident_created','incidentId', v_incident_id), 'incident_created', 'admin', true);

  return jsonb_build_object('incidentId', v_incident_id);
end;
$$;

grant execute on function public.flag_pickup_mismatch(uuid, text) to authenticated;

-- Reads ---------------------------------------------------------------------
create or replace function public.get_my_sessions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  return coalesce((
    select jsonb_agg(public.session_payload(s, true) order by s.created_at desc)
    from (
      select s.* from public.sessions s
      join public.children c on c.id = s.child_id
      where c.guardian_id = auth.uid()
      order by s.created_at desc
      limit 100
    ) s
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_sessions() to authenticated;

create or replace function public.get_session(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_session public.sessions;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select s.* into v_session
  from public.sessions s
  join public.children c on c.id = s.child_id
  where s.id = p_id and c.guardian_id = auth.uid();
  if not found then raise exception 'Session not found'; end if;
  return public.session_payload(v_session, true);
end;
$$;

grant execute on function public.get_session(uuid) to authenticated;

create or replace function public.get_room_sessions(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_approved_staff() then raise exception 'Staff account is not yet approved by an admin'; end if;
  if not public.is_staff_assigned_to_room(auth.uid(), p_room_id) then
    raise exception 'You are not assigned to this room';
  end if;

  return coalesce((
    select jsonb_agg(public.session_payload(s, false) order by s.checkin_requested_at asc)
    from public.sessions s
    where s.room_id = p_room_id
      and s.service_date = public.today_service_date()
      and s.status in ('pending_checkin','checked_in','pending_checkout')
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_room_sessions(uuid) to authenticated;

create or replace function public.list_sessions(p_date date default null, p_room_id uuid default null, p_status text default null, p_child_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  return coalesce((
    select jsonb_agg(public.session_payload(s, false) order by s.created_at desc)
    from (
      select * from public.sessions s
      where (p_date is null or s.service_date = p_date)
        and (p_room_id is null or s.room_id = p_room_id)
        and (p_status is null or s.status = p_status)
        and (p_child_id is null or s.child_id = p_child_id)
      order by s.created_at desc
      limit 500
    ) s
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.list_sessions(date, uuid, text, uuid) to authenticated;

create or replace function public.get_live_sessions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  return coalesce((
    select jsonb_agg(public.session_payload(s, false))
    from public.sessions s
    where s.service_date = public.today_service_date()
      and s.status in ('pending_checkin','checked_in','pending_checkout')
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_live_sessions() to authenticated;

-- Replaces both the old sessions.ts /live (full rows) and staffAdmin.ts /live
-- (counts) endpoints' service-date computation with one shared source.
create or replace function public.get_live_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  return coalesce((
    select jsonb_object_agg(status, cnt)
    from (
      select status, count(*) as cnt
      from public.sessions
      where service_date = public.today_service_date()
      group by status
    ) t
  ), '{}'::jsonb);
end;
$$;

grant execute on function public.get_live_counts() to authenticated;
