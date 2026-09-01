-- Step 2: add org_id (nullable for now — see 0034 for the NOT NULL
-- follow-up) to every table that needs either direct org-scoped visibility
-- or real cross-org write validation. Then backfill: since this project
-- already has live data (an admin, a staff member, a guardian, their rooms
-- and sessions), wrap every existing row into one bootstrap organization so
-- nothing breaks. Skipped entirely on a fresh empty database.
alter table public.profiles add column org_id uuid references public.organizations(id);
alter table public.rooms add column org_id uuid references public.organizations(id);
alter table public.sessions add column org_id uuid references public.organizations(id);
alter table public.incidents add column org_id uuid references public.organizations(id);
alter table public.chat_threads add column org_id uuid references public.organizations(id);
alter table public.chat_messages add column org_id uuid references public.organizations(id);
alter table public.audit_log add column org_id uuid references public.organizations(id);

create index profiles_org_id_idx on public.profiles (org_id);
create index rooms_org_id_idx on public.rooms (org_id);
create index sessions_org_id_idx on public.sessions (org_id);
create index incidents_org_id_idx on public.incidents (org_id);
create index chat_threads_org_id_idx on public.chat_threads (org_id);
create index chat_messages_org_id_idx on public.chat_messages (org_id);
create index audit_log_org_id_idx on public.audit_log (org_id);

do $$
declare
  v_org_id uuid;
begin
  if exists (select 1 from public.profiles limit 1) then
    insert into public.organizations (name, invite_code)
    values ('Default Ministry', public.generate_code(10))
    returning id into v_org_id;

    update public.profiles set org_id = v_org_id where org_id is null;
    update public.rooms set org_id = v_org_id where org_id is null;
    update public.sessions set org_id = v_org_id where org_id is null;
    update public.incidents set org_id = v_org_id where org_id is null;
    update public.chat_threads set org_id = v_org_id where org_id is null;
    update public.chat_messages set org_id = v_org_id where org_id is null;
    update public.audit_log set org_id = v_org_id where org_id is null;
  end if;
end $$;
