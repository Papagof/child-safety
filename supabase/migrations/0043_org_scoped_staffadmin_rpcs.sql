-- Step 12: the four admin staff-management RPCs took a target id with zero
-- verification it belonged to the caller's org. set_staff_rooms additionally
-- never validated the room ids at all — the most direct cross-org room
-- assignment risk in the whole app.

create or replace function public.list_staff_accounts()
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
      'id', p.id,
      'fullName', p.full_name,
      'email', (select email from auth.users u where u.id = p.id),
      'phone', p.phone,
      'photoUrl', p.photo_url,
      'approvalStatus', sd.approval_status,
      'backgroundCheckStatus', sd.background_check_status,
      'appliedAt', sd.created_at,
      'roomIds', coalesce((
        select jsonb_agg(sr.room_id) from public.staff_rooms sr where sr.staff_id = p.id
      ), '[]'::jsonb)
    ))
    from public.profiles p
    join public.staff_details sd on sd.user_id = p.id
    where p.role = 'staff' and p.org_id = public.get_my_org_id()
  ), '[]'::jsonb);
end;
$$;

create or replace function public.approve_staff(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if not exists (
    select 1 from public.staff_details sd join public.profiles p on p.id = sd.user_id
    where sd.user_id = p_user_id and p.org_id = public.get_my_org_id()
  ) then
    raise exception 'Staff record not found';
  end if;

  update public.staff_details set approval_status = 'approved' where user_id = p_user_id;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'staff_approved', jsonb_build_object('staffId', p_user_id));
end;
$$;

create or replace function public.reject_staff(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if not exists (
    select 1 from public.staff_details sd join public.profiles p on p.id = sd.user_id
    where sd.user_id = p_user_id and p.org_id = public.get_my_org_id()
  ) then
    raise exception 'Staff record not found';
  end if;

  update public.staff_details set approval_status = 'rejected' where user_id = p_user_id;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'staff_rejected', jsonb_build_object('staffId', p_user_id));
end;
$$;

create or replace function public.set_background_check_status(p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_status not in ('pending','confirmed') then raise exception 'Invalid status'; end if;
  if not exists (
    select 1 from public.staff_details sd join public.profiles p on p.id = sd.user_id
    where sd.user_id = p_user_id and p.org_id = public.get_my_org_id()
  ) then
    raise exception 'Staff record not found';
  end if;

  update public.staff_details set background_check_status = p_status where user_id = p_user_id;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'staff_background_check_updated', jsonb_build_object('staffId', p_user_id, 'status', p_status));
end;
$$;

create or replace function public.set_staff_rooms(p_user_id uuid, p_room_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  v_org_id := public.get_my_org_id();

  if not exists (select 1 from public.profiles where id = p_user_id and role = 'staff' and org_id = v_org_id) then
    raise exception 'Staff record not found';
  end if;

  if p_room_ids is not null and exists (
    select 1 from unnest(p_room_ids) as rid
    where not exists (select 1 from public.rooms r where r.id = rid and r.org_id = v_org_id)
  ) then
    raise exception 'One or more rooms not found';
  end if;

  delete from public.staff_rooms where staff_id = p_user_id;
  insert into public.staff_rooms (staff_id, room_id)
  select p_user_id, unnest(p_room_ids)
  where p_room_ids is not null;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'staff_rooms_updated', jsonb_build_object('staffId', p_user_id, 'roomIds', to_jsonb(p_room_ids)));
end;
$$;
