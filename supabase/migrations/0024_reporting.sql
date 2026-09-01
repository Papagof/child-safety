-- Admin reporting RPCs (spec.md §8: "reporting (attendance, average pickup
-- time, incidents over time)"). Plain aggregate queries returning jsonb the
-- client renders as tables/simple bars — no new charting dependency.

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
    where s.checkin_accepted_at is not null
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
  v_overall_avg_minutes numeric;
  v_by_room jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  select avg(extract(epoch from (checkout_approved_at - checkin_accepted_at)) / 60)
  into v_overall_avg_minutes
  from public.sessions
  where status = 'checked_out'
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
    where s.status = 'checked_out'
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
      where created_at::date between p_from and p_to
      group by created_at::date, type
    ) grouped
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_attendance_report(date, date) to authenticated;
grant execute on function public.get_pickup_time_report(date, date) to authenticated;
grant execute on function public.get_incidents_report(date, date) to authenticated;
