-- update_pickup_person: the only write path for pickup_people after creation.
-- Fixes the SQLite app's bug where a PATCH omitting `status` would still null
-- out an existing blocked_reason (it evaluated the CASE on the raw passed
-- param instead of the resulting status). Here it's gated on the *resulting*
-- status (coalesce(p_status, current)), so a plain field-only patch on an
-- already-blocked person leaves blocked_reason intact.
create or replace function public.update_pickup_person(
  p_id uuid,
  p_full_name text default null,
  p_relationship text default null,
  p_id_reference text default null,
  p_photo_url text default null,
  p_status text default null,
  p_blocked_reason text default null
)
returns public.pickup_people
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pp public.pickup_people;
  v_resulting_status text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select pp.* into v_pp
  from public.pickup_people pp
  join public.children c on c.id = pp.child_id
  where pp.id = p_id and c.guardian_id = auth.uid();
  if not found then raise exception 'Pickup person not found'; end if;

  if p_status is not null and p_status not in ('active','inactive','blocked') then
    raise exception 'Invalid status';
  end if;

  v_resulting_status := coalesce(p_status, v_pp.status);

  update public.pickup_people set
    full_name = coalesce(p_full_name, full_name),
    relationship = coalesce(p_relationship, relationship),
    id_reference = coalesce(p_id_reference, id_reference),
    photo_url = coalesce(p_photo_url, photo_url),
    status = v_resulting_status,
    blocked_reason = case when v_resulting_status = 'blocked' then coalesce(p_blocked_reason, blocked_reason) else null end
  where id = p_id
  returning * into v_pp;

  return v_pp;
end;
$$;

grant execute on function public.update_pickup_person(uuid, text, text, text, text, text, text) to authenticated;

-- resolve_incident: 404-equivalent if missing, structured "already resolved"
-- result (not an exception) if already resolved, session_id=null in the
-- audit row deliberately (an existing, preserved design choice).
create or replace function public.resolve_incident(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_incident public.incidents;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  select * into v_incident from public.incidents where id = p_id;
  if not found then raise exception 'Incident not found'; end if;

  if v_incident.status = 'resolved' then
    return jsonb_build_object('alreadyResolved', true);
  end if;

  update public.incidents
    set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
    where id = p_id
    returning * into v_incident;

  insert into public.audit_log (actor_id, actor_role, action, details, session_id)
  values (auth.uid(), 'admin', 'incident_resolved', jsonb_build_object('incidentId', p_id), null);

  return jsonb_build_object('incident', jsonb_build_object(
    'id', v_incident.id, 'status', v_incident.status, 'resolvedBy', v_incident.resolved_by, 'resolvedAt', v_incident.resolved_at
  ));
end;
$$;

grant execute on function public.resolve_incident(uuid) to authenticated;

-- Staff admin RPCs. list_staff_accounts assembles the same denormalized
-- shape server/src/routes/staffAdmin.ts's GET /staff returns (profile +
-- staff_details + room ids) in one call.
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
    where p.role = 'staff'
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.list_staff_accounts() to authenticated;

create or replace function public.approve_staff(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.staff_details where user_id = p_user_id) then
    raise exception 'Staff record not found';
  end if;

  update public.staff_details set approval_status = 'approved' where user_id = p_user_id;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'staff_approved', jsonb_build_object('staffId', p_user_id));
end;
$$;

grant execute on function public.approve_staff(uuid) to authenticated;

create or replace function public.reject_staff(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if not exists (select 1 from public.staff_details where user_id = p_user_id) then
    raise exception 'Staff record not found';
  end if;

  update public.staff_details set approval_status = 'rejected' where user_id = p_user_id;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'staff_rejected', jsonb_build_object('staffId', p_user_id));
end;
$$;

grant execute on function public.reject_staff(uuid) to authenticated;

create or replace function public.set_background_check_status(p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_status not in ('pending','confirmed') then raise exception 'Invalid status'; end if;
  if not exists (select 1 from public.staff_details where user_id = p_user_id) then
    raise exception 'Staff record not found';
  end if;

  update public.staff_details set background_check_status = p_status where user_id = p_user_id;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'staff_background_check_updated', jsonb_build_object('staffId', p_user_id, 'status', p_status));
end;
$$;

grant execute on function public.set_background_check_status(uuid, text) to authenticated;

-- Transactional replace (a single function body is already one transaction),
-- matching the BEGIN/COMMIT/ROLLBACK block in server/src/routes/staffAdmin.ts.
create or replace function public.set_staff_rooms(p_user_id uuid, p_room_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  delete from public.staff_rooms where staff_id = p_user_id;
  insert into public.staff_rooms (staff_id, room_id)
  select p_user_id, unnest(p_room_ids)
  where p_room_ids is not null;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'staff_rooms_updated', jsonb_build_object('staffId', p_user_id, 'roomIds', to_jsonb(p_room_ids)));
end;
$$;

grant execute on function public.set_staff_rooms(uuid, uuid[]) to authenticated;
