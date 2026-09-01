-- Postgres grants EXECUTE to PUBLIC by default on function creation.
--
-- is_admin() / is_approved_staff() / is_staff_assigned_to_room() are used
-- directly inside RLS policy USING clauses (e.g. profiles_select_admin,
-- children_select_staff_today). A policy's function call is invoked under the
-- querying role's own privileges even though the function body itself then
-- runs as the (security-definer) owner — so the querying role still needs
-- EXECUTE to invoke it at all. These three must stay grantable to
-- `authenticated`; only what they do internally is privileged, not whether
-- they can be called.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_approved_staff() to authenticated;
grant execute on function public.is_staff_assigned_to_room(uuid, uuid) to authenticated;

-- today_service_date() / generate_code() / age_from_dob() are never referenced
-- from an RLS policy — only from inside other security-definer RPC bodies,
-- where the call happens as the function owner regardless of grants to
-- `authenticated`. Safe (and correct) to lock these down from direct client use.
revoke execute on function public.today_service_date() from public;
revoke execute on function public.generate_code(int) from public;
revoke execute on function public.age_from_dob(date) from public;
