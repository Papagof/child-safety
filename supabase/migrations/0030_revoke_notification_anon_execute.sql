-- The same recurring "new functions auto-grant to anon" quirk documented in
-- 0017/0018/0027 hit the four new client-facing notification RPCs — `grant
-- ... to authenticated` in 0029 doesn't itself remove the separate implicit
-- anon grant a newly created function gets. These are read/write on the
-- caller's own notifications only (every query is scoped to auth.uid()), so
-- an anon call would just no-op, but lock it down explicitly to match this
-- project's standing practice rather than relying on that internal guard.
revoke execute on function public.list_notifications(int) from public, anon;
revoke execute on function public.get_unread_notification_count() from public, anon;
revoke execute on function public.mark_notification_read(uuid) from public, anon;
revoke execute on function public.mark_all_notifications_read() from public, anon;
