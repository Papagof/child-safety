-- The advisor still flagged every function as anon-executable after 0017.
-- Reason: standard Postgres CREATE FUNCTION auto-grants EXECUTE to the
-- PUBLIC pseudo-role (a separate privilege source from the per-role
-- anon/authenticated/service_role grants fixed in 0017), and every role
-- (including anon) is implicitly a member of PUBLIC — so the `=X/postgres`
-- ACL entry alone was enough for anon to still call every function.
-- Revoking from PUBLIC here removes that path; the direct `authenticated=X`
-- grants already applied in earlier migrations are untouched by this.
revoke execute on function public.today_service_date() from public;
revoke execute on function public.generate_code(int) from public;
revoke execute on function public.age_from_dob(date) from public;
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_approved_staff() from public;
revoke execute on function public.is_staff_assigned_to_room(uuid, uuid) from public;
revoke execute on function public.is_thread_participant(uuid) from public;
revoke execute on function public.staff_has_active_session_for_child_today(uuid) from public;
revoke execute on function public.session_payload(public.sessions, boolean) from public;
revoke execute on function public.notify_session_update(public.sessions) from public;
revoke execute on function public.escalate_unread_urgent_messages() from public;
revoke execute on function public.complete_signup(text, text, text) from public;
revoke execute on function public.get_my_profile() from public;
revoke execute on function public.update_my_photo(text) from public;
revoke execute on function public.request_checkin(uuid, uuid) from public;
revoke execute on function public.accept_checkin(uuid, text) from public;
revoke execute on function public.decline_checkin(uuid, text) from public;
revoke execute on function public.request_checkout(uuid, uuid) from public;
revoke execute on function public.approve_checkout(uuid, text) from public;
revoke execute on function public.flag_pickup_mismatch(uuid, text) from public;
revoke execute on function public.get_my_sessions() from public;
revoke execute on function public.get_session(uuid) from public;
revoke execute on function public.get_room_sessions(uuid) from public;
revoke execute on function public.list_sessions(date, uuid, text, uuid) from public;
revoke execute on function public.get_live_sessions() from public;
revoke execute on function public.get_live_counts() from public;
revoke execute on function public.get_thread_messages(uuid) from public;
revoke execute on function public.post_chat_message(uuid, text, boolean) from public;
revoke execute on function public.mark_thread_read(uuid) from public;
revoke execute on function public.update_pickup_person(uuid, text, text, text, text, text, text) from public;
revoke execute on function public.resolve_incident(uuid) from public;
revoke execute on function public.list_staff_accounts() from public;
revoke execute on function public.approve_staff(uuid) from public;
revoke execute on function public.reject_staff(uuid) from public;
revoke execute on function public.set_background_check_status(uuid, text) from public;
revoke execute on function public.set_staff_rooms(uuid, uuid[]) from public;

-- Stop standard Postgres from auto-granting PUBLIC execute on any function
-- created later via a migration run as postgres.
alter default privileges for role postgres in schema public revoke execute on functions from public;
