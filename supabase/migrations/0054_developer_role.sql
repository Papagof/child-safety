-- Developer/platform-operator role: sits ABOVE the multi-tenancy boundary
-- (deliberately, unlike every other role — admin included, which is still
-- always scoped to org_id = get_my_org_id()). Lets whoever runs this Shmeera
-- deployment see every church on it, activate/deactivate any of them, and
-- see each one's child count — none of which any single church's own admin
-- should ever be able to do for another church.
--
-- Modeled as an orthogonal flag (profiles.is_developer), not a 4th value in
-- the existing role check constraint ('guardian'|'staff'|'admin') — a
-- developer is still some normal role in their own org (most naturally its
-- admin), just also flagged. This avoids touching the role type everywhere
-- it's already load-bearing (RLS policies, RequireRole, routing) for a
-- capability only ever held by the platform's own operator, never granted
-- through any UI — there's no signup path or admin action that can set this
-- column, only a direct database update by whoever controls the project.

alter table public.organizations add column active boolean not null default true;

alter table public.profiles add column is_developer boolean not null default false;

create or replace function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_developer);
$$;

grant execute on function public.is_developer() to authenticated;
revoke execute on function public.is_developer() from anon, public;

-- The single enforcement point for "this church is deactivated": every one
-- of the ~20 call sites that already gate on org_id = get_my_org_id() now
-- also fails closed for a deactivated org, with zero changes needed at any
-- of them — the same reason this helper was centralized in the first place
-- (see CLAUDE.md's Multi-tenancy section). Returns null (not an exception)
-- to match its existing "no profile yet" behavior, which every caller
-- already treats as not-found/unauthorized.
create or replace function public.get_my_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p.org_id
  from public.profiles p
  join public.organizations o on o.id = p.org_id
  where p.id = auth.uid() and o.active;
$$;

-- get_my_profile() itself deliberately does NOT go through get_my_org_id()
-- (it needs to keep working for a deactivated org's users just enough to
-- show them *why* — orgActive: false — rather than a bare "not found").
-- AuthContext/RoleRedirect show a blocking screen on orgActive === false
-- instead of the normal role dashboard.
create or replace function public.get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles;
  v_org_name text;
  v_org_active boolean;
  v_staff jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if not found then
    return null;
  end if;

  select name, active into v_org_name, v_org_active from public.organizations where id = v_profile.org_id;

  if v_profile.role = 'staff' then
    select jsonb_build_object(
      'approvalStatus', sd.approval_status,
      'backgroundCheckStatus', sd.background_check_status,
      'rooms', coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
        from public.staff_rooms sr
        join public.rooms r on r.id = sr.room_id
        where sr.staff_id = auth.uid()
      ), '[]'::jsonb)
    )
    into v_staff
    from public.staff_details sd
    where sd.user_id = auth.uid();
  else
    v_staff := null;
  end if;

  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_profile.id,
      'email', (select email from auth.users where id = v_profile.id),
      'fullName', v_profile.full_name,
      'role', v_profile.role,
      'phone', v_profile.phone,
      'photoUrl', v_profile.photo_url,
      'orgId', v_profile.org_id,
      'orgName', v_org_name,
      'orgActive', v_org_active,
      'isDeveloper', v_profile.is_developer
    ),
    'staff', v_staff
  );
end;
$$;

create or replace function public.list_organizations_for_developer()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
begin
  if not public.is_developer() then raise exception 'Not authorized'; end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t."createdAt" desc), '[]'::jsonb) into v_result
  from (
    select
      o.id,
      o.name,
      o.active,
      o.created_at as "createdAt",
      (
        select count(*)::int
        from public.children c
        join public.profiles p on p.id = c.guardian_id
        where p.org_id = o.id and c.archived_at is null
      ) as "childrenCount"
    from public.organizations o
  ) t;

  return v_result;
end;
$$;

grant execute on function public.list_organizations_for_developer() to authenticated;
revoke execute on function public.list_organizations_for_developer() from anon, public;

create or replace function public.set_organization_active(p_org_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_developer() then raise exception 'Not authorized'; end if;

  update public.organizations set active = p_active where id = p_org_id;
  if not found then raise exception 'Organization not found'; end if;

  -- Explicit org_id (the target church, not the developer's own) so this
  -- shows up in *that* church's own audit log — set_audit_log_org_id()'s
  -- trigger only fills org_id in when it's left null, so this is preserved
  -- as-is rather than derived from the developer's own profile.
  insert into public.audit_log (org_id, actor_id, actor_role, action, details)
  values (p_org_id, auth.uid(), 'developer', 'organization_' || (case when p_active then 'activated' else 'deactivated' end), '{}'::jsonb);
end;
$$;

grant execute on function public.set_organization_active(uuid, boolean) to authenticated;
revoke execute on function public.set_organization_active(uuid, boolean) from anon, public;
