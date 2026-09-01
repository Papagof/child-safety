-- create_notification/notify_room_staff are internal-only (called from inside
-- other security-definer RPCs), never meant to be client-callable directly —
-- an authenticated caller could otherwise spoof arbitrary notifications to
-- any user_id. `revoke ... from public` in 0029 didn't actually remove it:
-- new functions get an explicit per-role grant to `authenticated` at create
-- time (the same quirk documented in 0017_lock_down_anon_execute.sql), which
-- only an explicit revoke from that role removes.
revoke execute on function public.create_notification(uuid, text, text, text, uuid) from anon, authenticated;
revoke execute on function public.notify_room_staff(uuid, text, text, text, uuid) from anon, authenticated;
