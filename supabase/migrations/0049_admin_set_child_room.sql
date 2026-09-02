-- Admin roster management: reassign which room/class a child defaults to
-- (independent of any active check-in session — e.g. a child ageing up from
-- Preschool to Elementary). children has no admin UPDATE policy today (only
-- children_select_admin), and this crosses from one user's data (the
-- guardian's) into an admin action, so — matching the existing pattern for
-- every other cross-user admin write (approve_staff, set_staff_rooms,
-- admin_override_checkout) — this is an audited RPC, not a bare RLS policy.
create or replace function public.admin_set_child_room(p_child_id uuid, p_room_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid;
  v_child public.children;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  v_org_id := public.get_my_org_id();

  select c.* into v_child
  from public.children c
  join public.profiles p on p.id = c.guardian_id
  where c.id = p_child_id and p.org_id = v_org_id;
  if not found then raise exception 'Child not found'; end if;

  if p_room_id is not null and not exists (select 1 from public.rooms where id = p_room_id and org_id = v_org_id) then
    raise exception 'Room not found';
  end if;

  update public.children set default_room_id = p_room_id where id = p_child_id returning * into v_child;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'child_room_changed', jsonb_build_object('childId', p_child_id, 'roomId', p_room_id));

  return jsonb_build_object('id', v_child.id, 'defaultRoomId', v_child.default_room_id);
end;
$$;

grant execute on function public.admin_set_child_room(uuid, uuid) to authenticated;
revoke execute on function public.admin_set_child_room(uuid, uuid) from anon, public;
