-- When a parent generates a check-in or pickup code, it should reach both
-- the room's staff (already did, via notify_room_staff) AND the org's
-- admin(s) — visibility only, not an action: the classroom teacher is still
-- the only one who can actually accept/activate it (two-sided confirmation
-- is unchanged — a code never changes status by itself, and admin has no
-- new capability here, just a notification).

create or replace function public.notify_org_admins(p_org_id uuid, p_type text, p_title text, p_body text, p_session_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin_id uuid;
begin
  for v_admin_id in
    select id from public.profiles where org_id = p_org_id and role = 'admin'
  loop
    perform public.create_notification(v_admin_id, p_type, p_title, p_body, p_session_id);
  end loop;
end;
$$;

revoke execute on function public.notify_org_admins(uuid, text, text, text, uuid) from anon, authenticated, public;

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
  perform public.notify_org_admins(v_org_id, 'checkin_requested', 'New check-in request', v_child.full_name || ' is waiting to be checked in', v_session.id);

  return jsonb_build_object('session', public.session_payload(v_session, true), 'code', v_code);
end;
$$;

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
  v_child_name text;
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

  select full_name into v_child_name from public.children where id = v_session.child_id;

  perform public.notify_session_update(v_session);
  perform public.notify_room_staff(v_session.room_id, 'checkout_requested', 'Pickup requested', v_child_name || ' — pickup code generated, waiting for staff to confirm', v_session.id);
  perform public.notify_org_admins(v_session.org_id, 'checkout_requested', 'Pickup requested', v_child_name || ' — pickup code generated, waiting for staff to confirm', v_session.id);

  return jsonb_build_object('session', public.session_payload(v_session, true), 'code', v_code);
end;
$$;
