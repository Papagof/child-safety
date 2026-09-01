-- Bug fix: children_select_staff_today and pickup_people_select_staff_today
-- (0005_sessions.sql) contain a subquery directly against public.sessions.
-- Since sessions has RLS enabled with zero policies and explicit revokes for
-- authenticated/anon (by design — see 0005's comment), that nested subquery
-- is ITSELF subject to sessions' deny-all RLS when evaluated as the querying
-- (authenticated) role, so it always returns false — silently breaking staff
-- visibility into today's children/pickup_people entirely. Fix: wrap the
-- check in a security-definer helper (which bypasses RLS as the owning role,
-- same pattern as is_admin()/is_staff_assigned_to_room()) and use that from
-- the policies instead of querying sessions directly.
create or replace function public.staff_has_active_session_for_child_today(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.sessions s
    where s.child_id = p_child_id
      and s.service_date = public.today_service_date()
      and s.status in ('pending_checkin','checked_in','pending_checkout')
      and public.is_staff_assigned_to_room(auth.uid(), s.room_id)
  );
$$;

grant execute on function public.staff_has_active_session_for_child_today(uuid) to authenticated;

alter policy children_select_staff_today on public.children
  using (public.staff_has_active_session_for_child_today(children.id));

alter policy pickup_people_select_staff_today on public.pickup_people
  using (public.staff_has_active_session_for_child_today(pickup_people.child_id));
