-- Step 3: now that every row is backfilled, enforce org_id going forward.
alter table public.profiles alter column org_id set not null;
alter table public.rooms alter column org_id set not null;
alter table public.sessions alter column org_id set not null;
alter table public.incidents alter column org_id set not null;
alter table public.chat_threads alter column org_id set not null;
alter table public.chat_messages alter column org_id set not null;
alter table public.audit_log alter column org_id set not null;
