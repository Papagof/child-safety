-- Needed so the admin audit-log view can embed the actor's name via
-- PostgREST's relationship inference (client/src/lib/data.ts's listAuditLog).
-- No ON DELETE action specified: deliberately blocks deleting a profile that
-- has audit history rather than silently orphaning/nulling it, matching this
-- app's "full audit trail" requirement (spec.md §6) — there's no user-delete
-- feature today, so this constraint has no practical downside yet.
alter table public.audit_log
  add constraint audit_log_actor_id_fkey foreign key (actor_id) references public.profiles(id);
