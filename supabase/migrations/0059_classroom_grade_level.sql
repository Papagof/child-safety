-- Real, stored org type (church vs. school) -- previously only a Signup.tsx UI
-- toggle that changed field labels, never data. Needed now that classroom
-- fields differ by org type: schools capture a grade level, churches an age
-- range. Set once at signup (create_organization), never changeable
-- afterward via any RPC -- same "fixed at creation" treatment org_id itself
-- gets elsewhere in this app.
alter table public.organizations
  add column org_type text not null default 'church' check (org_type in ('church', 'school'));

-- School classrooms are commonly labeled by grade/homeroom ("Grade 3", "JSS 1")
-- rather than an age range. Nullable and additive: age_min/age_max are left
-- exactly as they are, since they're still load-bearing for the guardian
-- check-in room auto-suggestion (client/src/pages/guardian/CheckIn.tsx) --
-- that logic still works for a school (it points at the classroom whose age
-- band matches the child). grade_level is purely a better label to show
-- instead of "ages X-Y" for a school's rooms; church orgs simply never set it.
alter table public.rooms add column grade_level text;

-- create_organization's signature is changing (new p_org_type param) --
-- CREATE OR REPLACE can't add a parameter, so drop the old one first, same
-- as this project's past signature changes (0026, 0045, 0047).
drop function if exists public.create_organization(text, text, boolean);

create or replace function public.create_organization(p_name text, p_full_name text, p_consent boolean default false, p_org_type text default 'church')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org public.organizations;
  v_name text := trim(p_name);
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not p_consent then raise exception 'Consent is required to create an account'; end if;
  if v_name = '' then raise exception 'Organization name is required'; end if;
  if p_org_type not in ('church', 'school') then raise exception 'Invalid organization type'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Profile already exists';
  end if;

  loop
    begin
      insert into public.organizations (name, invite_code, org_type)
      values (v_name, public.generate_code(10), p_org_type)
      returning * into v_org;
      exit;
    exception when unique_violation then
      -- collision on invite_code — retry with a freshly generated one
    end;
  end loop;

  insert into public.profiles (id, role, full_name, org_id, consent_at)
  values (auth.uid(), 'admin', p_full_name, v_org.id, now());

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'organization_created', jsonb_build_object('orgId', v_org.id, 'orgName', v_org.name, 'orgType', v_org.org_type));

  return jsonb_build_object('orgId', v_org.id, 'orgName', v_org.name);
end;
$$;

grant execute on function public.create_organization(text, text, boolean, text) to authenticated;
revoke execute on function public.create_organization(text, text, boolean, text) from anon, public;

-- get_my_profile's own signature is unchanged (still zero args), just adding
-- orgType to its output -- so a plain CREATE OR REPLACE is enough here.
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
  v_org_type text;
  v_staff jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if not found then
    return null;
  end if;

  select name, active, org_type into v_org_name, v_org_active, v_org_type from public.organizations where id = v_profile.org_id;

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
      'orgType', v_org_type,
      'orgActive', v_org_active,
      'isDeveloper', v_profile.is_developer
    ),
    'staff', v_staff
  );
end;
$$;
