-- Step 13: every is_admin()-only reporting/list RPC gets an org_id filter.
-- purge_old_records is the most severe of these — it's destructive, and
-- today any admin can permanently delete every other org's historical data.

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
      where s.org_id = public.get_my_org_id()
        and (p_date is null or s.service_date = p_date)
        and (p_room_id is null or s.room_id = p_room_id)
        and (p_status is null or s.status = p_status)
        and (p_child_id is null or s.child_id = p_child_id)
      order by s.created_at desc
      limit 500
    ) s
  ), '[]'::jsonb);
end;
$$;

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
    where s.org_id = public.get_my_org_id()
      and s.service_date = public.today_service_date()
      and s.status in ('pending_checkin','checked_in','pending_checkout')
  ), '[]'::jsonb);
end;
$$;

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
      where org_id = public.get_my_org_id()
        and service_date = public.today_service_date()
      group by status
    ) t
  ), '{}'::jsonb);
end;
$$;

create or replace function public.list_audit_log(
  p_session_id uuid default null,
  p_actor_role text default null,
  p_action text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_room_id uuid default null,
  p_child_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id,
      'sessionId', t.session_id,
      'actorId', t.actor_id,
      'actorName', t.actor_name,
      'actorRole', t.actor_role,
      'action', t.action,
      'details', t.details,
      'createdAt', t.created_at
    ) order by t.created_at desc)
    from (
      select a.id, a.session_id, a.actor_id, a.actor_role, a.action, a.details, a.created_at,
             p.full_name as actor_name
      from public.audit_log a
      left join public.sessions s on s.id = a.session_id
      left join public.profiles p on p.id = a.actor_id
      where a.org_id = public.get_my_org_id()
        and (p_session_id is null or a.session_id = p_session_id)
        and (p_actor_role is null or a.actor_role = p_actor_role)
        and (p_action is null or a.action = p_action)
        and (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at <= p_to)
        and (p_room_id is null or s.room_id = p_room_id)
        and (p_child_id is null or s.child_id = p_child_id)
      order by a.created_at desc
      limit 500
    ) t
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_attendance_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'date', s.service_date, 'roomId', s.room_id, 'roomName', r.name, 'count', count(*)
    ) order by s.service_date, r.name)
    from public.sessions s
    join public.rooms r on r.id = s.room_id
    where s.org_id = public.get_my_org_id()
      and s.checkin_accepted_at is not null
      and s.service_date between p_from and p_to
    group by s.service_date, s.room_id, r.name
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_pickup_time_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid;
  v_overall_avg_minutes numeric;
  v_by_room jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  v_org_id := public.get_my_org_id();

  select avg(extract(epoch from (checkout_approved_at - checkin_accepted_at)) / 60)
  into v_overall_avg_minutes
  from public.sessions
  where org_id = v_org_id
    and status = 'checked_out'
    and checkin_accepted_at is not null
    and checkout_approved_at is not null
    and service_date between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
    'roomId', room_id, 'roomName', room_name, 'avgMinutes', avg_minutes, 'count', cnt
  ) order by room_name), '[]'::jsonb)
  into v_by_room
  from (
    select s.room_id, r.name as room_name,
           avg(extract(epoch from (s.checkout_approved_at - s.checkin_accepted_at)) / 60) as avg_minutes,
           count(*) as cnt
    from public.sessions s
    join public.rooms r on r.id = s.room_id
    where s.org_id = v_org_id
      and s.status = 'checked_out'
      and s.checkin_accepted_at is not null
      and s.checkout_approved_at is not null
      and s.service_date between p_from and p_to
    group by s.room_id, r.name
  ) t;

  return jsonb_build_object('overallAvgMinutes', v_overall_avg_minutes, 'byRoom', v_by_room);
end;
$$;

create or replace function public.get_incidents_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'date', d, 'type', t, 'count', c
    ) order by d, t)
    from (
      select created_at::date as d, type as t, count(*) as c
      from public.incidents
      where org_id = public.get_my_org_id()
        and created_at::date between p_from and p_to
      group by created_at::date, type
    ) grouped
  ), '[]'::jsonb);
end;
$$;

create or replace function public.purge_old_records(p_before date)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid;
  v_session_ids uuid[];
  v_sessions_count int := 0;
  v_audit_count int := 0;
  v_incidents_count int := 0;
  v_chat_messages_count int := 0;
  v_chat_threads_count int := 0;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  v_org_id := public.get_my_org_id();

  select array_agg(id) into v_session_ids
  from public.sessions
  where org_id = v_org_id
    and status in ('checked_out', 'declined', 'transferred')
    and service_date < p_before;

  if v_session_ids is not null then
    update public.sessions set transferred_from_session_id = null
    where transferred_from_session_id = any(v_session_ids);

    with deleted as (
      delete from public.chat_messages
      where thread_id in (select id from public.chat_threads where session_id = any(v_session_ids))
      returning 1
    ) select count(*) into v_chat_messages_count from deleted;

    with deleted as (
      delete from public.chat_threads where session_id = any(v_session_ids) returning 1
    ) select count(*) into v_chat_threads_count from deleted;

    with deleted as (
      delete from public.audit_log where session_id = any(v_session_ids) returning 1
    ) select count(*) into v_audit_count from deleted;

    with deleted as (
      delete from public.incidents where session_id = any(v_session_ids) returning 1
    ) select count(*) into v_incidents_count from deleted;

    with deleted as (
      delete from public.sessions where id = any(v_session_ids) returning 1
    ) select count(*) into v_sessions_count from deleted;
  end if;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'records_purged', jsonb_build_object(
    'before', p_before,
    'sessionsDeleted', v_sessions_count,
    'auditLogDeleted', v_audit_count,
    'incidentsDeleted', v_incidents_count,
    'chatMessagesDeleted', v_chat_messages_count,
    'chatThreadsDeleted', v_chat_threads_count
  ));

  return jsonb_build_object(
    'sessionsDeleted', v_sessions_count,
    'auditLogDeleted', v_audit_count,
    'incidentsDeleted', v_incidents_count,
    'chatMessagesDeleted', v_chat_messages_count,
    'chatThreadsDeleted', v_chat_threads_count
  );
end;
$$;
