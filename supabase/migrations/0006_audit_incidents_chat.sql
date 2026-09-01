-- audit_log ---------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid references public.sessions(id),
  actor_id uuid,
  actor_role text not null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy audit_log_select_admin on public.audit_log
  for select using (public.is_admin());
-- No insert/update/delete policies: every audit row is written by an RPC
-- (security definer), never directly by a client.

-- incidents -----------------------------------------------------------------
create table public.incidents (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid references public.sessions(id),
  room_id uuid references public.rooms(id),
  type text not null check (type in ('failed_pickup','urgent_escalation','other')),
  description text,
  reported_by uuid references public.profiles(id),
  status text not null default 'open' check (status in ('open','resolved')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.incidents enable row level security;

create policy incidents_select_admin on public.incidents
  for select using (public.is_admin());
-- No direct writes: created by flag_pickup_mismatch RPC / the escalation cron
-- function, resolved by resolve_incident RPC.

-- chat_threads --------------------------------------------------------------
create table public.chat_threads (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid unique not null references public.sessions(id),
  guardian_id uuid not null references public.profiles(id),
  room_id uuid not null references public.rooms(id),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);

alter table public.chat_threads enable row level security;

create policy chat_threads_select_participant on public.chat_threads
  for select using (
    guardian_id = auth.uid()
    or public.is_staff_assigned_to_room(auth.uid(), room_id)
    or public.is_admin()
  );
-- No direct writes: created by accept_checkin RPC, archived by approve_checkout RPC.

-- chat_messages ---------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id),
  sender_id uuid not null references public.profiles(id),
  sender_role text not null,
  body text not null,
  urgent boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  escalated boolean not null default false
);

create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);
-- Supports the pg_cron escalation sweep's WHERE clause (0009_rpc_chat.sql).
create index chat_messages_unescalated_urgent_idx on public.chat_messages (created_at)
  where urgent and not escalated and read_at is null;

alter table public.chat_messages enable row level security;

create policy chat_messages_select_participant on public.chat_messages
  for select using (
    exists (
      select 1 from public.chat_threads t
      where t.id = chat_messages.thread_id
        and (t.guardian_id = auth.uid() or public.is_staff_assigned_to_room(auth.uid(), t.room_id) or public.is_admin())
    )
  );
-- No direct writes: sending/reading messages goes through post_chat_message /
-- mark_thread_read RPCs (validation + escalation bookkeeping live there).
