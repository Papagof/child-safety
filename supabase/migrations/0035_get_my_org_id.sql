-- Step 4: the central org-scoping helper, mirroring is_admin()'s existing
-- lockdown pattern exactly. Granted to authenticated (needed directly inside
-- RLS policies, same reasoning as is_admin()/is_staff_assigned_to_room),
-- revoked from anon/public inline in this same migration — this project's
-- own history (0007->0017->0018->0027) shows relying on
-- ALTER DEFAULT PRIVILEGES alone has failed before.
create or replace function public.get_my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

grant execute on function public.get_my_org_id() to authenticated;
revoke execute on function public.get_my_org_id() from anon, public;
