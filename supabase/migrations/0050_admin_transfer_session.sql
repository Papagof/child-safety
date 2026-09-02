-- Let admin move a currently checked-in/pending child to another room
-- directly, the same as staff already can, without requiring admin to be
-- "assigned" to either room (admin isn't assigned to any room at all).
-- Still always creates a new session in the destination room requiring that
-- room's staff to separately accept it — an admin transfer is never a
-- unilateral custody move either. actor_role in the audit rows now reflects
-- who actually did it instead of being hardcoded 'staff'.
create or replace function public.transfer_session(p_session_id uuid, p_new_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_old public.sessions;
  v_new_room public.rooms;
  v_new public.sessions;
  v_actor_role text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_old from public.sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;

  if public.is_admin() then
    if v_old.org_id <> public.get_my_org_id() then raise exception 'Session not found'; end if;
    v_actor_role := 'admin';
  elsif public.is_approved_staff() and public.is_staff_assigned_to_room(auth.uid(), v_old.room_id) then
    v_actor_role := 'staff';
  else
    raise exception 'Not authorized';
  end if;

  if v_old.status not in ('pending_checkin', 'checked_in') then
    raise exception 'Session cannot be transferred (current status: %)', v_old.status;
  end if;

  select * into v_new_room from public.rooms where id = p_new_room_id and active = true;
  if not found or v_new_room.org_id <> v_old.org_id then raise exception 'Destination room not found or inactive'; end if;
  if v_new_room.id = v_old.room_id then
    raise exception 'Cannot transfer to the same room';
  end if;

  update public.sessions set status = 'transferred' where id = v_old.id returning * into v_old;

  insert into public.sessions (child_id, room_id, service_date, status, checkin_requested_at, checkin_code_expires_at, is_transfer, transferred_from_session_id, org_id, created_at)
  values (v_old.child_id, p_new_room_id, v_old.service_date, 'pending_checkin', now(), now() + interval '4 hours', true, v_old.id, v_old.org_id, now())
  returning * into v_new;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_old.id, auth.uid(), v_actor_role, 'session_transferred_out', jsonb_build_object('newRoomId', p_new_room_id, 'newSessionId', v_new.id));
  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_new.id, auth.uid(), v_actor_role, 'session_transferred_in', jsonb_build_object('oldRoomId', v_old.room_id, 'oldSessionId', v_old.id));

  perform public.notify_session_update(v_old);
  perform public.notify_session_update(v_new);

  return jsonb_build_object('oldSession', public.session_payload(v_old, false), 'newSession', public.session_payload(v_new, false));
end;
$$;
