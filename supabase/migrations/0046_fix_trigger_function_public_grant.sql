-- Missed the bare PUBLIC pseudo-role grant on the two new trigger functions
-- (the exact recurring bug documented in 0017/0018/0027/0031) — revoking
-- from anon/authenticated alone isn't enough, PUBLIC is a separate ACL entry.
revoke execute on function public.set_audit_log_org_id() from public;
revoke execute on function public.set_room_org_id() from public;
