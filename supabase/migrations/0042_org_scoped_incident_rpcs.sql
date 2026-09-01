-- Step 11: org_id on every incidents insert; admin_override_checkout and
-- resolve_incident get an org-match-or-raise check (both took a bare id with
-- zero cross-org verification before); notify_session_update's admin leg
-- moves off the bare global 'admin' topic.

create or replace function public.notify_session_update(p_session public.sessions)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guardian_id uuid;
  v_no_codes jsonb;
  v_with_codes jsonb;
begin
  select c.guardian_id into v_guardian_id from public.children c where c.id = p_session.child_id;
  v_no_codes := public.session_payload(p_session, false);
  v_with_codes := public.session_payload(p_session, true);

  perform realtime.send(jsonb_build_object('type','session_updated','session', v_no_codes), 'session_updated', 'room:' || p_session.room_id, true);
  perform realtime.send(jsonb_build_object('type','session_updated','session', v_no_codes), 'session_updated', 'admin:' || p_session.org_id, true);
  perform realtime.send(jsonb_build_object('type','session_updated','session', v_with_codes), 'session_updated', 'guardian:' || v_guardian_id, true);
end;
$$;

create or replace function public.flag_pickup_mismatch(p_session_id uuid, p_description text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.sessions;
  v_incident_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_approved_staff() then raise exception 'Staff account is not yet approved by an admin'; end if;

  select * into v_session from public.sessions where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;

  if not public.is_staff_assigned_to_room(auth.uid(), v_session.room_id) then
    raise exception 'You are not assigned to this room';
  end if;

  insert into public.incidents (session_id, room_id, type, description, reported_by, status, org_id)
  values (v_session.id, v_session.room_id, 'failed_pickup', p_description, auth.uid(), 'open', v_session.org_id)
  returning id into v_incident_id;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_session.id, auth.uid(), 'staff', 'checkout_mismatch_flagged', jsonb_build_object('description', p_description));

  perform realtime.send(jsonb_build_object('type','incident_created','incidentId', v_incident_id), 'incident_created', 'admin:' || v_session.org_id, true);

  return jsonb_build_object('incidentId', v_incident_id);
end;
$$;

create or replace function public.report_incident(p_room_id uuid, p_description text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_incident_id uuid;
  v_org_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.is_approved_staff() then raise exception 'Staff account is not yet approved by an admin'; end if;
  if not public.is_staff_assigned_to_room(auth.uid(), p_room_id) then
    raise exception 'You are not assigned to this room';
  end if;

  v_org_id := public.get_my_org_id();

  insert into public.incidents (room_id, type, description, reported_by, status, org_id)
  values (p_room_id, 'other', p_description, auth.uid(), 'open', v_org_id)
  returning id into v_incident_id;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'staff', 'incident_reported', jsonb_build_object('incidentId', v_incident_id, 'roomId', p_room_id));

  perform realtime.send(jsonb_build_object('type','incident_created','incidentId', v_incident_id), 'incident_created', 'admin:' || v_org_id, true);

  return jsonb_build_object('incidentId', v_incident_id);
end;
$$;

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
      returning id as session_id, room_id, org_id
  loop
    insert into public.incidents (session_id, room_id, type, description, status, org_id)
    values (r.session_id, r.room_id, 'other', 'No-show: child not picked up by end of service window', 'open', r.org_id)
    returning id into v_incident_id;

    insert into public.audit_log (session_id, actor_role, action, details)
    values (r.session_id, 'admin', 'noshow_flagged', '{}'::jsonb);

    perform realtime.send(jsonb_build_object('type','incident_created','incidentId', v_incident_id), 'incident_created', 'admin:' || r.org_id, true);
  end loop;
end;
$$;

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
  if not found or v_session.org_id <> public.get_my_org_id() then raise exception 'Session not found'; end if;

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
  if not found or v_incident.org_id <> public.get_my_org_id() then raise exception 'Incident not found'; end if;

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
