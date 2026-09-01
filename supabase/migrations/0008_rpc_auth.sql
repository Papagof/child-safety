-- complete_signup: the only path that ever creates a profiles row. Blocks
-- self-service admin exactly like server/src/routes/auth.ts's signup handler.
create or replace function public.complete_signup(p_role text, p_full_name text, p_phone text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_role not in ('guardian','staff') then
    raise exception 'Invalid role';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Profile already exists';
  end if;

  insert into public.profiles (id, role, full_name, phone)
  values (auth.uid(), p_role, p_full_name, p_phone)
  returning * into v_profile;

  if p_role = 'staff' then
    insert into public.staff_details (user_id) values (auth.uid());
  end if;

  return v_profile;
end;
$$;

grant execute on function public.complete_signup(text, text, text) to authenticated;

-- get_my_profile: replaces GET /api/auth/me. Returns {user, staff} where
-- staff is null for non-staff, matching the current client contract.
create or replace function public.get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles;
  v_staff jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if not found then
    return null;
  end if;

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
      'photoUrl', v_profile.photo_url
    ),
    'staff', v_staff
  );
end;
$$;

grant execute on function public.get_my_profile() to authenticated;

-- update_my_photo: replaces POST /api/auth/me/photo (self only, no ownership
-- check needed beyond auth.uid()).
create or replace function public.update_my_photo(p_photo_url text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.profiles set photo_url = p_photo_url where id = auth.uid();
end;
$$;

grant execute on function public.update_my_photo(text) to authenticated;
