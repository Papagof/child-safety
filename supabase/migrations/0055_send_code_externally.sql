-- Lets an admin push a session's currently-active check-in/pickup code to
-- the guardian's own phone (SMS) and email — for when the guardian isn't
-- looking at the app (phone locked, noisy pickup line, etc.). The code
-- itself must never reach the admin's browser: get_live_sessions already
-- omits it (session_payload(s, false)), and this function is only ever
-- called server-side from the send-code Edge Function using the admin's own
-- JWT — the function forwards the result but never echoes the code back to
-- the client. Actually dispatching the SMS/email needs real HTTP calls to
-- Twilio/Resend, which don't exist in PL/pgSQL, hence the Edge Function.
create or replace function public.get_session_code_for_notify(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.sessions;
  v_child public.children;
  v_guardian public.profiles;
  v_code text;
  v_code_type text;
  v_expires_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select * into v_session from public.sessions where id = p_session_id;
  if not found or v_session.org_id <> public.get_my_org_id() then
    raise exception 'Session not found';
  end if;

  if v_session.status = 'pending_checkin' then
    v_code := v_session.checkin_code;
    v_code_type := 'checkin';
    v_expires_at := v_session.checkin_code_expires_at;
  elsif v_session.status = 'pending_checkout' then
    v_code := v_session.checkout_code;
    v_code_type := 'checkout';
    v_expires_at := v_session.checkout_code_expires_at;
  else
    raise exception 'This session has no active code to send';
  end if;

  select * into v_child from public.children where id = v_session.child_id;
  select * into v_guardian from public.profiles where id = v_child.guardian_id;

  return jsonb_build_object(
    'code', v_code,
    'codeType', v_code_type,
    'expiresAt', v_expires_at,
    'guardianId', v_guardian.id,
    'guardianPhone', v_guardian.phone,
    'childFullName', v_child.full_name
  );
end;
$$;

revoke execute on function public.get_session_code_for_notify(uuid) from anon, public;
grant execute on function public.get_session_code_for_notify(uuid) to authenticated;
