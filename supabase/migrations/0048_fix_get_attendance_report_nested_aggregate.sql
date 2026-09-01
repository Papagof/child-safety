-- Pre-existing bug found during multi-tenancy verification (unrelated to
-- org-scoping): jsonb_agg(jsonb_build_object(..., count(*))) directly under
-- one GROUP BY nests two aggregate calls at the same query level, which
-- Postgres rejects outright ("aggregate function calls cannot be nested").
-- This function apparently was never exercised with real data before now.
-- Fixed the same way get_incidents_report already does it: group in a
-- subquery, aggregate the finished rows in the outer query.
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
      'date', d, 'roomId', room_id, 'roomName', room_name, 'count', cnt
    ) order by d, room_name)
    from (
      select s.service_date as d, s.room_id, r.name as room_name, count(*) as cnt
      from public.sessions s
      join public.rooms r on r.id = s.room_id
      where s.org_id = public.get_my_org_id()
        and s.checkin_accepted_at is not null
        and s.service_date between p_from and p_to
      group by s.service_date, s.room_id, r.name
    ) grouped
  ), '[]'::jsonb);
end;
$$;
