-- get_advisors flagged every function created from 0022 onward as
-- anon-executable again, despite the 0018 default-privilege fix. Root cause
-- not fully pinned down (the common factor is those migrations also called
-- cron.schedule()), but the effect is clear: each got a stray bare-PUBLIC
-- execute grant. Revoking explicitly here rather than trusting the default
-- going forward — every migration after this one revokes execute from
-- public/anon explicitly right next to each CREATE FUNCTION, not via
-- ALTER DEFAULT PRIVILEGES.
revoke execute on function public.flag_noshow_pickups() from public, anon;
revoke execute on function public.admin_override_checkout(uuid, text) from public, anon;
revoke execute on function public.report_incident(uuid, text) from public, anon;
revoke execute on function public.list_audit_log(uuid, text, text, timestamptz, timestamptz, uuid, uuid) from public, anon;
revoke execute on function public.get_attendance_report(date, date) from public, anon;
revoke execute on function public.get_pickup_time_report(date, date) from public, anon;
revoke execute on function public.get_incidents_report(date, date) from public, anon;
revoke execute on function public.purge_old_records(date) from public, anon;
revoke execute on function public.complete_signup(text, text, text, boolean) from public, anon;
