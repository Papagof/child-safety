-- Step 9: org-validate the RPCs that create/move sessions. request_checkin
-- and transfer_session both do a security-definer lookup on `rooms`, which
-- bypasses RLS entirely (it runs as the function owner) — so the org check
-- has to be explicit in the function body, RLS alone won't catch it here.
-- Reuses the existing "not found" wording for a cross-org mismatch rather
-- than a distinguishable error, so cross-org existence can't be probed.

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
  v_org_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  v_org_id := public.get_my_org_id();

  select * into v_child from public.children where id = p_child_id and guardian_id = auth.uid();
  if not found then raise exception 'Child not found'; end if;

  select * into v_room from public.rooms where id = p_room_id and active = true;
  if not found or v_room.org_id <> v_org_id then raise exception 'Room not found or inactive'; end if;

  v_code := public.generate_code();

  begin
    insert into public.sessions (
      child_id, room_id, service_date, status, org_id,
      checkin_code, checkin_code_expires_at, checkin_requested_at, created_at
    ) values (
      p_child_id, p_room_id, public.today_service_date(), 'pending_checkin', v_org_id,
      v_code, now() + interval '4 hours', now(), now()
    )
    returning * into v_session;
  exception when unique_violation then
    raise exception 'This child already has an active check-in/checkout session today';
  end;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_session.id, auth.uid(), 'guardian', 'checkin_requested', jsonb_build_object('childId', p_child_id, 'roomId', p_room_id));

  perform public.notify_session_update(v_session);
  perform public.notify_room_staff(p_room_id, 'checkin_requested', 'New check-in request', v_child.full_name || ' is waiting to be checked in', v_session.id);

  return jsonb_build_object('session', public.session_payload(v_session, true), 'code', v_code);
end;
$$;

create or replace function public.accept_checkin(p_session_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.sessions;
  v_child_name text;
  v_guardian_id uuid;
  v_staff_name text;
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

  if not v_session.is_transfer and v_session.checkin_code_expires_at < now() then
    raise exception 'Check-in code has expired';
  end if;

  if not v_session.is_transfer and v_session.checkin_code <> p_code then
    insert into public.audit_log (session_id, actor_id, actor_role, action, details)
    values (v_session.id, auth.uid(), 'staff', 'checkin_code_mismatch', jsonb_build_object('attempted', p_code));
    return jsonb_build_object('error', 'code_mismatch');
  end if;

  update public.sessions
    set status = 'checked_in', checkin_accepted_at = now(), checkin_staff_id = auth.uid()
    where id = v_session.id
    returning * into v_session;

  insert into public.chat_threads (session_id, guardian_id, room_id, org_id)
  select v_session.id, c.guardian_id, v_session.room_id, v_session.org_id
  from public.children c where c.id = v_session.child_id
  on conflict (session_id) do nothing;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_session.id, auth.uid(), 'staff', 'checkin_accepted', '{}'::jsonb);

  select c.full_name, c.guardian_id into v_child_name, v_guardian_id from public.children c where c.id = v_session.child_id;
  select full_name into v_staff_name from public.profiles where id = auth.uid();

  perform public.notify_session_update(v_session);
  perform public.create_notification(v_guardian_id, 'checkin_accepted', v_child_name || ' has been checked in', 'Checked in by ' || coalesce(v_staff_name, 'staff'), v_session.id);

  return jsonb_build_object('session', public.session_payload(v_session, false));
end;
$$;

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
  if not found or v_new_room.org_id <> v_old.org_id then raise exception 'Destination room not found or inactive'; end if;
  if v_new_room.id = v_old.room_id then
    raise exception 'Cannot transfer to the same room';
  end if;

  update public.sessions set status = 'transferred' where id = v_old.id returning * into v_old;

  insert into public.sessions (child_id, room_id, service_date, status, checkin_requested_at, checkin_code_expires_at, is_transfer, transferred_from_session_id, org_id, created_at)
  values (v_old.child_id, p_new_room_id, v_old.service_date, 'pending_checkin', now(), now() + interval '4 hours', true, v_old.id, v_old.org_id, now())
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
