-- get_advisors (security) surfaced that every function in `public` was
-- auto-granted EXECUTE to `anon` (and `authenticated`) at creation time via
-- this project's default privileges — a direct per-role grant, not the
-- implicit PUBLIC pseudo-grant, so the earlier `revoke ... from public`
-- statements (0007, 0009, 0010) never actually removed it. Nothing in this
-- app should be callable while signed out, so lock every function down
-- explicitly here.

-- Internal-only helpers: never callable directly by any client role.
revoke execute on function public.is_approved_staff() from anon, authenticated;
revoke execute on function public.today_service_date() from anon, authenticated;
revoke execute on function public.generate_code(int) from anon, authenticated;
revoke execute on function public.age_from_dob(date) from anon, authenticated;
revoke execute on function public.session_payload(public.sessions, boolean) from anon, authenticated;
revoke execute on function public.notify_session_update(public.sessions) from anon, authenticated;
revoke execute on function public.escalate_unread_urgent_messages() from anon, authenticated;

-- Helpers referenced directly from RLS policy USING clauses: must stay
-- executable by `authenticated` (the policy runs as the querying role), but
-- `anon` has no legitimate reason to call them.
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_staff_assigned_to_room(uuid, uuid) from anon;
revoke execute on function public.is_thread_participant(uuid) from anon;
revoke execute on function public.staff_has_active_session_for_child_today(uuid) from anon;

-- Client-facing RPCs: require a signed-in session, never anon.
revoke execute on function public.complete_signup(text, text, text) from anon;
revoke execute on function public.get_my_profile() from anon;
revoke execute on function public.update_my_photo(text) from anon;
revoke execute on function public.request_checkin(uuid, uuid) from anon;
revoke execute on function public.accept_checkin(uuid, text) from anon;
revoke execute on function public.decline_checkin(uuid, text) from anon;
revoke execute on function public.request_checkout(uuid, uuid) from anon;
revoke execute on function public.approve_checkout(uuid, text) from anon;
revoke execute on function public.flag_pickup_mismatch(uuid, text) from anon;
revoke execute on function public.get_my_sessions() from anon;
revoke execute on function public.get_session(uuid) from anon;
revoke execute on function public.get_room_sessions(uuid) from anon;
revoke execute on function public.list_sessions(date, uuid, text, uuid) from anon;
revoke execute on function public.get_live_sessions() from anon;
revoke execute on function public.get_live_counts() from anon;
revoke execute on function public.get_thread_messages(uuid) from anon;
revoke execute on function public.post_chat_message(uuid, text, boolean) from anon;
revoke execute on function public.mark_thread_read(uuid) from anon;
revoke execute on function public.update_pickup_person(uuid, text, text, text, text, text, text) from anon;
revoke execute on function public.resolve_incident(uuid) from anon;
revoke execute on function public.list_staff_accounts() from anon;
revoke execute on function public.approve_staff(uuid) from anon;
revoke execute on function public.reject_staff(uuid) from anon;
revoke execute on function public.set_background_check_status(uuid, text) from anon;
revoke execute on function public.set_staff_rooms(uuid, uuid[]) from anon;

-- Defensive default for anything created later: keep the normal
-- Supabase behavior of auto-exposing new `public` functions to
-- `authenticated`, but stop auto-granting to `anon`.
alter default privileges for role postgres in schema public revoke execute on functions from anon;
