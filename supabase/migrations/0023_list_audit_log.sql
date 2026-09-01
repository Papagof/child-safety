-- Replaces the client's direct `.from('audit_log')` read, which can't filter
-- by room or child at all — sessions has zero direct grants for any role, so
-- a PostgREST embed through it returns nothing regardless of admin status.
-- This RPC joins audit_log -> sessions -> (room/child) server-side, bypassing
-- sessions' RLS as the security-definer owner, to support spec.md §8's
-- "search... for any child, date, or room."
create or replace function public.list_audit_log(
  p_session_id uuid default null,
  p_actor_role text default null,
  p_action text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_room_id uuid default null,
  p_child_id uuid default null
)
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
      'id', t.id,
      'sessionId', t.session_id,
      'actorId', t.actor_id,
      'actorName', t.actor_name,
      'actorRole', t.actor_role,
      'action', t.action,
      'details', t.details,
      'createdAt', t.created_at
    ) order by t.created_at desc)
    from (
      select a.id, a.session_id, a.actor_id, a.actor_role, a.action, a.details, a.created_at,
             p.full_name as actor_name
      from public.audit_log a
      left join public.sessions s on s.id = a.session_id
      left join public.profiles p on p.id = a.actor_id
      where (p_session_id is null or a.session_id = p_session_id)
        and (p_actor_role is null or a.actor_role = p_actor_role)
        and (p_action is null or a.action = p_action)
        and (p_from is null or a.created_at >= p_from)
        and (p_to is null or a.created_at <= p_to)
        and (p_room_id is null or s.room_id = p_room_id)
        and (p_child_id is null or s.child_id = p_child_id)
      order by a.created_at desc
      limit 500
    ) t
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.list_audit_log(uuid, text, text, timestamptz, timestamptz, uuid, uuid) to authenticated;
