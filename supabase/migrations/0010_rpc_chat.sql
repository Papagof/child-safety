create or replace function public.is_thread_participant(p_thread_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_thread public.chat_threads;
begin
  select * into v_thread from public.chat_threads where id = p_thread_id;
  if not found then return false; end if;
  return v_thread.guardian_id = auth.uid()
    or public.is_staff_assigned_to_room(auth.uid(), v_thread.room_id)
    or public.is_admin();
end;
$$;

revoke execute on function public.is_thread_participant(uuid) from public;

create or replace function public.get_thread_messages(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_thread public.chat_threads;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_thread from public.chat_threads where session_id = p_session_id;
  if not found then raise exception 'No chat thread for this session yet'; end if;
  if not public.is_thread_participant(v_thread.id) then
    raise exception 'Not authorized for this chat thread';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'threadId', m.thread_id, 'senderId', m.sender_id, 'senderRole', m.sender_role,
      'body', m.body, 'urgent', m.urgent, 'readAt', m.read_at, 'createdAt', m.created_at
    ) order by m.created_at asc)
    from public.chat_messages m where m.thread_id = v_thread.id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_thread_messages(uuid) to authenticated;

-- post_chat_message: staff path additionally requires approval. Urgent
-- escalation itself is NOT scheduled here (no in-process timer, per the
-- pg_cron job in this same migration) — it's picked up by the sweep instead.
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

  insert into public.chat_messages (thread_id, sender_id, sender_role, body, urgent)
  values (v_thread.id, auth.uid(), v_role, v_body, coalesce(p_urgent, false))
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

grant execute on function public.post_chat_message(uuid, text, boolean) to authenticated;

-- mark_thread_read: marks the OTHER party's messages read, matching the
-- current app's semantics exactly (chat.ts: sender_id != caller).
create or replace function public.mark_thread_read(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_thread public.chat_threads;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_thread from public.chat_threads where session_id = p_session_id;
  if not found then raise exception 'No chat thread for this session yet'; end if;

  if not public.is_thread_participant(v_thread.id) then
    raise exception 'Not authorized for this chat thread';
  end if;

  update public.chat_messages
    set read_at = now()
    where thread_id = v_thread.id and sender_id <> auth.uid() and read_at is null;
end;
$$;

grant execute on function public.mark_thread_read(uuid) to authenticated;

-- Replaces the in-process setTimeout in server/src/routes/chat.ts, which
-- cannot survive a server restart between message-send and the 2-minute
-- mark. The UPDATE ... RETURNING pattern makes "select the unescalated rows"
-- and "flag them escalated" atomic, so overlapping cron runs can never
-- double-fire the same message.
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
      returning cm.id as message_id, cm.body, cm.sender_id, t.session_id, t.room_id
  loop
    insert into public.incidents (session_id, room_id, type, description, reported_by, status)
    values (r.session_id, r.room_id, 'urgent_escalation',
            'Urgent message unread after 2 min: "' || r.body || '"', r.sender_id, 'open')
    returning id into v_incident_id;

    insert into public.audit_log (session_id, actor_id, actor_role, action, details)
    values (r.session_id, r.sender_id, 'staff', 'urgent_message_escalated', jsonb_build_object('messageId', r.message_id));

    perform realtime.send(jsonb_build_object('type','incident_created','incidentId', v_incident_id), 'incident_created', 'admin', true);
  end loop;
end;
$$;

revoke execute on function public.escalate_unread_urgent_messages() from public;
