create table public.sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  room_id uuid not null references public.rooms(id),
  service_date date not null,
  status text not null check (status in ('pending_checkin','checked_in','declined','pending_checkout','checked_out')),
  checkin_code text,
  checkin_code_expires_at timestamptz,
  checkin_requested_at timestamptz,
  checkin_accepted_at timestamptz,
  checkin_staff_id uuid references public.profiles(id),
  checkin_decline_reason text,
  checkout_code text,
  checkout_code_expires_at timestamptz,
  checkout_requested_at timestamptz,
  checkout_requested_by_type text check (checkout_requested_by_type in ('guardian','pickup_person')),
  checkout_requested_by_id uuid,
  checkout_approved_at timestamptz,
  checkout_staff_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Real DB-level guarantee for "one active session per child per service day"
-- (the current SQLite app only enforces this with a check-then-insert in application
-- code, which is a race under concurrent requests; Postgres closes that gap for real).
create unique index one_active_session_per_child_per_day on public.sessions (child_id, service_date)
  where status in ('pending_checkin','checked_in','pending_checkout');

create index sessions_room_service_date_idx on public.sessions (room_id, service_date);

-- Safety-critical: sessions carries the check-in/checkout codes. No role —
-- not guardian, not staff, not even admin — gets a table-level policy here.
-- All reads and writes go exclusively through security-definer RPCs, which
-- (as functions owned by the migration-owning role) bypass RLS on this table
-- by ordinary Postgres table-owner semantics, while re-checking role/ownership/
-- assignment/code-visibility themselves on every call. This is deliberately
-- stricter than a "codes-free view for staff" approach — there is no direct
-- door to this table at all, so there is nothing for a view or column grant to
-- accidentally leak through.
alter table public.sessions enable row level security;
revoke all on public.sessions from anon, authenticated;

-- Now that sessions exists, add the staff "today's active session" visibility
-- policies that were deferred from 0004_core_tables.sql.
create policy children_select_staff_today on public.children
  for select using (
    exists (
      select 1 from public.sessions s
      where s.child_id = children.id
        and s.service_date = public.today_service_date()
        and s.status in ('pending_checkin','checked_in','pending_checkout')
        and public.is_staff_assigned_to_room(auth.uid(), s.room_id)
    )
  );

create policy pickup_people_select_staff_today on public.pickup_people
  for select using (
    exists (
      select 1 from public.children c
      join public.sessions s on s.child_id = c.id
      where c.id = pickup_people.child_id
        and s.service_date = public.today_service_date()
        and s.status in ('pending_checkin','checked_in','pending_checkout')
        and public.is_staff_assigned_to_room(auth.uid(), s.room_id)
    )
  );
