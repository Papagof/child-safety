-- Admin data-retention control (spec.md §6/§8). Only ever touches
-- terminal-status sessions (checked_out/declined/transferred) — active
-- sessions are never eligible regardless of date. Deletes dependents in
-- FK-safe order, nullifies any surviving session's back-reference to a
-- purged one (the "after" leg of an old transfer), and logs one summary
-- audit row AFTER the delete so it isn't itself eligible for this same purge.
create or replace function public.purge_old_records(p_before date)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session_ids uuid[];
  v_sessions_count int := 0;
  v_audit_count int := 0;
  v_incidents_count int := 0;
  v_chat_messages_count int := 0;
  v_chat_threads_count int := 0;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  select array_agg(id) into v_session_ids
  from public.sessions
  where status in ('checked_out', 'declined', 'transferred')
    and service_date < p_before;

  if v_session_ids is not null then
    update public.sessions set transferred_from_session_id = null
    where transferred_from_session_id = any(v_session_ids);

    with deleted as (
      delete from public.chat_messages
      where thread_id in (select id from public.chat_threads where session_id = any(v_session_ids))
      returning 1
    ) select count(*) into v_chat_messages_count from deleted;

    with deleted as (
      delete from public.chat_threads where session_id = any(v_session_ids) returning 1
    ) select count(*) into v_chat_threads_count from deleted;

    with deleted as (
      delete from public.audit_log where session_id = any(v_session_ids) returning 1
    ) select count(*) into v_audit_count from deleted;

    with deleted as (
      delete from public.incidents where session_id = any(v_session_ids) returning 1
    ) select count(*) into v_incidents_count from deleted;

    with deleted as (
      delete from public.sessions where id = any(v_session_ids) returning 1
    ) select count(*) into v_sessions_count from deleted;
  end if;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'records_purged', jsonb_build_object(
    'before', p_before,
    'sessionsDeleted', v_sessions_count,
    'auditLogDeleted', v_audit_count,
    'incidentsDeleted', v_incidents_count,
    'chatMessagesDeleted', v_chat_messages_count,
    'chatThreadsDeleted', v_chat_threads_count
  ));

  return jsonb_build_object(
    'sessionsDeleted', v_sessions_count,
    'auditLogDeleted', v_audit_count,
    'incidentsDeleted', v_incidents_count,
    'chatMessagesDeleted', v_chat_messages_count,
    'chatThreadsDeleted', v_chat_threads_count
  );
end;
$$;

grant execute on function public.purge_old_records(date) to authenticated;
