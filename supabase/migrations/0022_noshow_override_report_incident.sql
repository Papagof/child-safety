-- flag_noshow_pickups: spec.md §10.5. Reuses the existing 4h check-in code
-- TTL as the "service window" (codes.ts's original "service + buffer" 4h
-- comment) rather than inventing new config. Same UPDATE...RETURNING
-- idempotency pattern as escalate_unread_urgent_messages.
create or replace function public.flag_noshow_pickups()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_incident_id uuid;
begin
  for r in
    update public.sessions
      set noshow_flagged = true
      where status = 'checked_in'
        and not noshow_flagged
        and checkin_code_expires_at < now()
      returning id as session_id, room_id
  loop
    insert into public.incidents (session_id, room_id, type, description, status)
    values (r.session_id, r.room_id, 'other', 'No-show: child not picked up by end of service window', 'open')
    returning id into v_incident_id;

    insert into public.audit_log (session_id, actor_role, action, details)
    values (r.session_id, 'admin', 'noshow_flagged', '{}'::jsonb);

    perform realtime.send(jsonb_build_object('type','incident_created','incidentId', v_incident_id), 'incident_created', 'admin', true);
  end loop;
end;
$$;

select cron.schedule(
  'flag-noshow-pickups',
  '*/5 * * * *',
  $$select public.flag_noshow_pickups();$$
);

-- admin_override_checkout: spec.md §10.1's "admin-assisted manual identity
-- verification... logged as a manual override with the admin's name attached."
create or replace function public.admin_override_checkout(p_session_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.sessions;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;

  if v_session.status not in ('checked_in', 'pending_checkout') then
    raise exception 'Session is not checked in or pending checkout (current status: %)', v_session.status;
  end if;

  update public.sessions
    set status = 'checked_out', checkout_approved_at = now(), checkout_staff_id = auth.uid()
    where id = v_session.id
    returning * into v_session;

  update public.chat_threads set status = 'archived' where session_id = v_session.id;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_session.id, auth.uid(), 'admin', 'checkout_manual_override', jsonb_build_object('reason', p_reason));

  perform public.notify_session_update(v_session);

  return jsonb_build_object('session', public.session_payload(v_session, false));
end;
$$;

grant execute on function public.admin_override_checkout(uuid, text) to authenticated;

-- report_incident: the general-purpose staff incident form spec.md §8 calls
-- for, separate from the pickup-mismatch-specific flag_pickup_mismatch.
create or replace function public.report_incident(p_room_id uuid, p_description text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_incident_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_approved_staff() then raise exception 'Staff account is not yet approved by an admin'; end if;
  if not public.is_staff_assigned_to_room(auth.uid(), p_room_id) then
    raise exception 'You are not assigned to this room';
  end if;

  insert into public.incidents (room_id, type, description, reported_by, status)
  values (p_room_id, 'other', p_description, auth.uid(), 'open')
  returning id into v_incident_id;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'staff', 'incident_reported', jsonb_build_object('incidentId', v_incident_id, 'roomId', p_room_id));

  perform realtime.send(jsonb_build_object('type','incident_created','incidentId', v_incident_id), 'incident_created', 'admin', true);

  return jsonb_build_object('incidentId', v_incident_id);
end;
$$;

grant execute on function public.report_incident(uuid, text) to authenticated;
