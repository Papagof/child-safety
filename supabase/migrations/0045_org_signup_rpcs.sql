-- Step 14: replace complete_signup entirely with two org-aware entry points.
-- Self-serve org creation mints exactly one first admin; joining an existing
-- org (guardian only) requires an admin-shared invite code. get_my_profile()
-- gains orgId/orgName so the client can show which ministry the user is in
-- and scope its "admin" realtime subscription.

drop function if exists public.complete_signup(text, text, text, boolean);

create or replace function public.create_organization(p_name text, p_full_name text, p_consent boolean default false)
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
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Profile already exists';
  end if;

  loop
    begin
      insert into public.organizations (name, invite_code)
      values (v_name, public.generate_code(10))
      returning * into v_org;
      exit;
    exception when unique_violation then
      -- collision on invite_code — retry with a freshly generated one
    end;
  end loop;

  insert into public.profiles (id, role, full_name, org_id, consent_at)
  values (auth.uid(), 'admin', p_full_name, v_org.id, now());

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'organization_created', jsonb_build_object('orgId', v_org.id, 'orgName', v_org.name));

  return jsonb_build_object('orgId', v_org.id, 'orgName', v_org.name);
end;
$$;

grant execute on function public.create_organization(text, text, boolean) to authenticated;
revoke execute on function public.create_organization(text, text, boolean) from anon, public;

create or replace function public.join_organization_by_invite(p_invite_code text, p_full_name text, p_phone text default null, p_consent boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org public.organizations;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not p_consent then raise exception 'Consent is required to create an account'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Profile already exists';
  end if;

  select * into v_org from public.organizations where invite_code = upper(trim(p_invite_code));
  if not found then raise exception 'Invalid invite code'; end if;

  insert into public.profiles (id, role, full_name, phone, org_id, consent_at)
  values (auth.uid(), 'guardian', p_full_name, p_phone, v_org.id, now());

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'guardian', 'joined_organization', jsonb_build_object('orgId', v_org.id));

  return jsonb_build_object('orgId', v_org.id, 'orgName', v_org.name);
end;
$$;

grant execute on function public.join_organization_by_invite(text, text, text, boolean) to authenticated;
revoke execute on function public.join_organization_by_invite(text, text, text, boolean) from anon, public;

create or replace function public.get_invite_code()
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return (select invite_code from public.organizations where id = public.get_my_org_id());
end;
$$;

grant execute on function public.get_invite_code() to authenticated;
revoke execute on function public.get_invite_code() from anon, public;

create or replace function public.regenerate_invite_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid;
  v_new_code text;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  v_org_id := public.get_my_org_id();

  loop
    begin
      v_new_code := public.generate_code(10);
      update public.organizations set invite_code = v_new_code where id = v_org_id;
      exit;
    exception when unique_violation then
      -- collision — retry with a freshly generated code
    end;
  end loop;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'invite_code_regenerated', '{}'::jsonb);

  return v_new_code;
end;
$$;

grant execute on function public.regenerate_invite_code() to authenticated;
revoke execute on function public.regenerate_invite_code() from anon, public;

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
  v_staff jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if not found then
    return null;
  end if;

  select name into v_org_name from public.organizations where id = v_profile.org_id;

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
      'orgName', v_org_name
    ),
    'staff', v_staff
  );
end;
$$;
