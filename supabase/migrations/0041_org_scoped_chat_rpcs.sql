-- Step 10: chat_messages.org_id (from the thread, already has org_id);
-- escalate_unread_urgent_messages broadcasts to the bare global 'admin'
-- topic today — since it sweeps across every org in one cron run, each
-- incident it raises must notify only ITS OWN org's admins now.

create or replace function public.post_chat_message(p_session_id uuid, p_body text, p_urgent boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_thread public.chat_threads;
  v_role text;
  v_message public.chat_messages;
  v_body text := trim(p_body);
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if v_body = '' then raise exception 'Message body cannot be empty'; end if;

  select role into v_role from public.profiles where id = auth.uid();

  select * into v_thread from public.chat_threads where session_id = p_session_id;
  if not found then raise exception 'No chat thread for this session yet'; end if;

  if not public.is_thread_participant(v_thread.id) then
    raise exception 'Not authorized for this chat thread';
  end if;

  if v_role = 'staff' and not public.is_approved_staff() then
    raise exception 'Staff account is not yet approved by an admin';
  end if;

  insert into public.chat_messages (thread_id, sender_id, sender_role, body, urgent, org_id)
  values (v_thread.id, auth.uid(), v_role, v_body, coalesce(p_urgent, false), v_thread.org_id)
  returning * into v_message;

  v_payload := jsonb_build_object(
    'id', v_message.id, 'threadId', v_message.thread_id, 'senderId', v_message.sender_id,
    'senderRole', v_message.sender_role, 'body', v_message.body, 'urgent', v_message.urgent,
    'readAt', v_message.read_at, 'createdAt', v_message.created_at
  );

  perform realtime.send(jsonb_build_object('type','chat_message','threadId', v_thread.id, 'message', v_payload), 'chat_message', 'thread:' || v_thread.id, true);
  perform realtime.send(jsonb_build_object('type','chat_message','threadId', v_thread.id, 'message', v_payload), 'chat_message', 'room:' || v_thread.room_id, true);
  perform realtime.send(jsonb_build_object('type','chat_message','threadId', v_thread.id, 'message', v_payload), 'chat_message', 'guardian:' || v_thread.guardian_id, true);

  return v_payload;
end;
$$;

create or replace function public.escalate_unread_urgent_messages()
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
    update public.chat_messages cm
      set escalated = true
      from public.chat_threads t
      where cm.thread_id = t.id
        and cm.urgent
        and cm.read_at is null
        and cm.sender_role = 'staff'
        and not cm.escalated
        and cm.created_at < now() - interval '2 minutes'
      returning cm.id as message_id, cm.body, cm.sender_id, t.session_id, t.room_id, t.org_id
  loop
    insert into public.incidents (session_id, room_id, type, description, reported_by, status, org_id)
    values (r.session_id, r.room_id, 'urgent_escalation',
            'Urgent message unread after 2 min: "' || r.body || '"', r.sender_id, 'open', r.org_id)
    returning id into v_incident_id;

    insert into public.audit_log (session_id, actor_id, actor_role, action, details)
    values (r.session_id, r.sender_id, 'staff', 'urgent_message_escalated', jsonb_build_object('messageId', r.message_id));

    perform realtime.send(jsonb_build_object('type','incident_created','incidentId', v_incident_id), 'incident_created', 'admin:' || r.org_id, true);
  end loop;
end;
$$;
