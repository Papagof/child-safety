-- Bug found during verification: transfer_session() never set
-- checkin_code_expires_at on the new (transfer-created) session. accept_checkin
-- correctly skips comparing it for transfers (no code to expire), but
-- flag_noshow_pickups()'s "checkin_code_expires_at < now()" no-show heuristic
-- silently never matches a NULL — a transferred child who's never picked up
-- would never get flagged. Give transfer sessions the same 4h window so the
-- no-show sweep still works, without changing accept_checkin's skip logic.
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
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_approved_staff() then raise exception 'Staff account is not yet approved by an admin'; end if;

  select * into v_old from public.sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;

  if not public.is_staff_assigned_to_room(auth.uid(), v_old.room_id) then
    raise exception 'You are not assigned to this room';
  end if;

  if v_old.status not in ('pending_checkin', 'checked_in') then
    raise exception 'Session cannot be transferred (current status: %)', v_old.status;
  end if;

  select * into v_new_room from public.rooms where id = p_new_room_id and active = true;
  if not found then raise exception 'Destination room not found or inactive'; end if;
  if v_new_room.id = v_old.room_id then
    raise exception 'Cannot transfer to the same room';
  end if;

  update public.sessions set status = 'transferred' where id = v_old.id returning * into v_old;

  insert into public.sessions (child_id, room_id, service_date, status, checkin_requested_at, checkin_code_expires_at, is_transfer, transferred_from_session_id, created_at)
  values (v_old.child_id, p_new_room_id, v_old.service_date, 'pending_checkin', now(), now() + interval '4 hours', true, v_old.id, now())
  returning * into v_new;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_old.id, auth.uid(), 'staff', 'session_transferred_out', jsonb_build_object('newRoomId', p_new_room_id, 'newSessionId', v_new.id));
  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_new.id, auth.uid(), 'staff', 'session_transferred_in', jsonb_build_object('oldRoomId', v_old.room_id, 'oldSessionId', v_old.id));

  perform public.notify_session_update(v_old);
  perform public.notify_session_update(v_new);

  return jsonb_build_object('oldSession', public.session_payload(v_old, false), 'newSession', public.session_payload(v_new, false));
end;
$$;
