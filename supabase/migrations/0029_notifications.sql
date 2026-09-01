-- Persistent notification inbox (spec §9). Previously deferred in favor of
-- realtime broadcasts covering an open tab only; this adds durable per-user
-- rows plus a live push on insert, so a notification survives a closed tab.
-- Same zero-direct-grant pattern as sessions/audit_log: every write goes
-- through a security-definer function, never a client insert/update.
create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());
-- No insert/update/delete policies — writes only via create_notification()
-- (internal) and mark_notification_read()/mark_all_notifications_read()
-- (security definer, both hard-scoped to auth.uid()).

-- Internal: create one notification row + push it over the per-user realtime
-- topic, mirroring notify_session_update's insert-then-broadcast shape.
create or replace function public.create_notification(p_user_id uuid, p_type text, p_title text, p_body text, p_session_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_notification public.notifications;
begin
  insert into public.notifications (user_id, session_id, type, title, body)
  values (p_user_id, p_session_id, p_type, p_title, p_body)
  returning * into v_notification;

  perform realtime.send(
    jsonb_build_object(
      'type', 'notification_created',
      'notification', jsonb_build_object(
        'id', v_notification.id,
        'sessionId', v_notification.session_id,
        'type', v_notification.type,
        'title', v_notification.title,
        'body', v_notification.body,
        'readAt', v_notification.read_at,
        'createdAt', v_notification.created_at
      )
    ),
    'notification_created',
    'notifications:' || p_user_id,
    true
  );
end;
$$;

revoke execute on function public.create_notification(uuid, text, text, text, uuid) from public;

-- Internal: fan a notification out to every approved staff member currently
-- assigned to a room — "reflects in the staff assigned to the class."
create or replace function public.notify_room_staff(p_room_id uuid, p_type text, p_title text, p_body text, p_session_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff_id uuid;
begin
  for v_staff_id in
    select sr.staff_id
    from public.staff_rooms sr
    join public.staff_details sd on sd.user_id = sr.staff_id
    where sr.room_id = p_room_id and sd.approval_status = 'approved'
  loop
    perform public.create_notification(v_staff_id, p_type, p_title, p_body, p_session_id);
  end loop;
end;
$$;

revoke execute on function public.notify_room_staff(uuid, text, text, text, uuid) from public;

-- Client-facing reads/writes, all hard-scoped to auth.uid() -----------------
create or replace function public.list_notifications(p_limit int default 50)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'sessionId', n.session_id,
    'type', n.type,
    'title', n.title,
    'body', n.body,
    'readAt', n.read_at,
    'createdAt', n.created_at
  ) order by n.created_at desc), '[]'::jsonb)
  from (
    select * from public.notifications
    where user_id = auth.uid()
    order by created_at desc
    limit p_limit
  ) n;
$$;

grant execute on function public.list_notifications(int) to authenticated;

create or replace function public.get_unread_notification_count()
returns int
language sql
stable
security definer
set search_path = public, extensions
as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null;
$$;

grant execute on function public.get_unread_notification_count() to authenticated;

create or replace function public.mark_notification_read(p_id uuid)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.notifications set read_at = now() where id = p_id and user_id = auth.uid() and read_at is null;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

-- Realtime Authorization for the new per-user topic, same shape as guardian:%
-- in 0012_realtime_authorization.sql ('notifications:' is 14 chars).
create policy realtime_messages_select_notifications on realtime.messages
  for select
  to authenticated
  using (
    topic like 'notifications:%'
    and substring(topic from 15) = auth.uid()::text
  );

-- Wire the inbox into the existing session lifecycle RPCs ------------------

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

  -- Mismatch must permanently record the audit row without rolling back, so
  -- it returns a structured result instead of raising. A transfer has no
  -- code at all — nothing to match against.
  if not v_session.is_transfer and v_session.checkin_code <> p_code then
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

  select c.full_name, c.guardian_id into v_child_name, v_guardian_id from public.children c where c.id = v_session.child_id;
  select full_name into v_staff_name from public.profiles where id = auth.uid();

  perform public.notify_session_update(v_session);
  perform public.create_notification(v_guardian_id, 'checkin_accepted', v_child_name || ' has been checked in', 'Checked in by ' || coalesce(v_staff_name, 'staff'), v_session.id);

  return jsonb_build_object('session', public.session_payload(v_session, false));
end;
$$;

create or replace function public.decline_checkin(p_session_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.sessions;
  v_child_name text;
  v_guardian_id uuid;
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

  select c.full_name, c.guardian_id into v_child_name, v_guardian_id from public.children c where c.id = v_session.child_id;

  perform public.notify_session_update(v_session);
  perform public.create_notification(v_guardian_id, 'checkin_declined', v_child_name || ' — check-in declined', p_reason, v_session.id);

  return jsonb_build_object('session', public.session_payload(v_session, false));
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

  return jsonb_build_object('session', public.session_payload(v_session, true), 'code', v_code);
end;
$$;

create or replace function public.approve_checkout(p_session_id uuid, p_code text)
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

  select c.full_name, c.guardian_id into v_child_name, v_guardian_id from public.children c where c.id = v_session.child_id;
  select full_name into v_staff_name from public.profiles where id = auth.uid();

  perform public.notify_session_update(v_session);
  perform public.create_notification(v_guardian_id, 'checkout_approved', v_child_name || ' has been picked up', 'Confirmed by ' || coalesce(v_staff_name, 'staff'), v_session.id);
  perform public.notify_room_staff(v_session.room_id, 'checkout_approved', v_child_name || ' — pickup confirmed', 'Confirmed by ' || coalesce(v_staff_name, 'staff'), v_session.id);

  return jsonb_build_object('session', public.session_payload(v_session, false));
end;
$$;

-- create or replace preserves the existing grants on all five functions
-- above (unaffected by this migration) — only their bodies changed.
