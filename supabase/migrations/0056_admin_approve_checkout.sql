-- Lets an admin take a pickup code directly from a parent (e.g. at a front
-- desk/office, rather than the parent walking the code to the classroom
-- themselves) and confirm the checkout — the same code-verification the
-- room's own staff would otherwise perform. This is an ADDITIONAL path
-- alongside the existing direct parent -> staff flow (approve_checkout is
-- unchanged and still works), not a replacement for it.
--
-- Unlike admin_override_checkout (0011/0042 — a reason-based bypass for a
-- lost/dead parent phone, no code involved), this still requires the real,
-- valid pickup code — the two-sided confirmation model holds: the code
-- alone never released the child, a second person (here, the admin instead
-- of room staff) still has to independently enter and confirm it. Because
-- the admin isn't physically standing in the room, the room's own staff are
-- notified afterward to actually walk the child out — an instructional
-- notification only, not another confirmation step (the checkout has
-- already been approved by the time they see it).
create or replace function public.admin_approve_checkout(p_session_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.sessions;
  v_child_name text;
  v_guardian_id uuid;
  v_admin_name text;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  select * into v_session from public.sessions where id = p_session_id;
  if not found or v_session.org_id <> public.get_my_org_id() then raise exception 'Session not found'; end if;

  if v_session.status <> 'pending_checkout' then
    raise exception 'Session is not pending checkout (current status: %)', v_session.status;
  end if;

  if v_session.checkout_code_expires_at < now() then
    raise exception 'Checkout code has expired';
  end if;

  if v_session.checkout_code <> p_code then
    insert into public.audit_log (session_id, actor_id, actor_role, action, details)
    values (v_session.id, auth.uid(), 'admin', 'checkout_code_mismatch', jsonb_build_object('attempted', p_code));
    return jsonb_build_object('error', 'code_mismatch');
  end if;

  update public.sessions
    set status = 'checked_out', checkout_approved_at = now(), checkout_staff_id = auth.uid()
    where id = v_session.id
    returning * into v_session;

  update public.chat_threads set status = 'archived' where session_id = v_session.id;

  insert into public.audit_log (session_id, actor_id, actor_role, action, details)
  values (v_session.id, auth.uid(), 'admin', 'checkout_approved_by_admin', '{}'::jsonb);

  select c.full_name, c.guardian_id into v_child_name, v_guardian_id from public.children c where c.id = v_session.child_id;
  select full_name into v_admin_name from public.profiles where id = auth.uid();

  perform public.notify_session_update(v_session);
  perform public.create_notification(v_guardian_id, 'checkout_approved', v_child_name || ' has been picked up', 'Confirmed by ' || coalesce(v_admin_name, 'admin'), v_session.id);
  perform public.notify_room_staff(
    v_session.room_id,
    'checkout_approved_by_admin',
    v_child_name || ' — cleared for pickup by admin',
    coalesce(v_admin_name, 'An admin') || ' verified the pickup code at the front desk — please send ' || v_child_name || ' out.',
    v_session.id
  );

  return jsonb_build_object('session', public.session_payload(v_session, false));
end;
$$;

revoke execute on function public.admin_approve_checkout(uuid, text) from anon, public;
grant execute on function public.admin_approve_checkout(uuid, text) to authenticated;
