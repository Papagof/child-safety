-- rooms ----------------------------------------------------------------
create table public.rooms (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  age_min int not null default 0,
  age_max int not null default 18,
  capacity int not null default 20,
  active boolean not null default true
);

alter table public.rooms enable row level security;

create policy rooms_select_all on public.rooms
  for select using (true);

-- No audit trail for room CRUD in the current app either — plain RLS-gated
-- admin writes are enough (matches server/src/routes/rooms.ts, which never calls writeAudit).
create policy rooms_admin_insert on public.rooms
  for insert with check (public.is_admin());

create policy rooms_admin_update on public.rooms
  for update using (public.is_admin()) with check (public.is_admin());

-- staff_details -----------------------------------------------------------
create table public.staff_details (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  background_check_status text not null default 'pending' check (background_check_status in ('pending','confirmed')),
  created_at timestamptz not null default now()
);

alter table public.staff_details enable row level security;

create or replace function public.is_approved_staff()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.staff_details sd
    where sd.user_id = auth.uid() and sd.approval_status = 'approved'
  );
$$;

create policy staff_details_select_own on public.staff_details
  for select using (user_id = auth.uid());

create policy staff_details_select_admin on public.staff_details
  for select using (public.is_admin());
-- No direct writes: approve/reject/background-check status changes are all
-- audited, so they only happen via RPCs (approve_staff/reject_staff/set_background_check_status).

-- staff_rooms ---------------------------------------------------------------
create table public.staff_rooms (
  staff_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  primary key (staff_id, room_id)
);

alter table public.staff_rooms enable row level security;

create or replace function public.is_staff_assigned_to_room(p_staff_id uuid, p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.staff_rooms sr
    where sr.staff_id = p_staff_id and sr.room_id = p_room_id
  );
$$;

create policy staff_rooms_select_own on public.staff_rooms
  for select using (staff_id = auth.uid());

create policy staff_rooms_select_admin on public.staff_rooms
  for select using (public.is_admin());
-- No direct writes: room assignment is a transactional replace, audited as
-- staff_rooms_updated, only via the set_staff_rooms RPC.

-- children --------------------------------------------------------------
create table public.children (
  id uuid primary key default extensions.gen_random_uuid(),
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  dob date not null,
  photo_url text,
  medical_notes text,
  default_room_id uuid references public.rooms(id),
  created_at timestamptz not null default now()
);

alter table public.children enable row level security;

create policy children_select_own on public.children
  for select using (guardian_id = auth.uid());

-- Staff visibility into a child's profile (medical notes included) is added
-- in 0005_sessions.sql, once the sessions table this policy joins against
-- exists — see children_select_staff_today there.

create policy children_select_admin on public.children
  for select using (public.is_admin());

-- Plain owned-resource CRUD (no state machine, no code-visibility concern) is
-- safe as direct RLS-gated writes rather than an RPC, per the "reduce RPC
-- surface area" guidance for non-safety-critical tables.
create policy children_insert_own on public.children
  for insert with check (
    guardian_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'guardian')
  );

create policy children_update_own on public.children
  for update using (guardian_id = auth.uid()) with check (guardian_id = auth.uid());

-- pickup_people -----------------------------------------------------------
create table public.pickup_people (
  id uuid primary key default extensions.gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  full_name text not null,
  photo_url text,
  relationship text not null,
  id_reference text,
  status text not null default 'active' check (status in ('active','inactive','blocked')),
  blocked_reason text,
  added_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.pickup_people enable row level security;

create policy pickup_people_select_own on public.pickup_people
  for select using (
    exists (select 1 from public.children c where c.id = pickup_people.child_id and c.guardian_id = auth.uid())
  );

-- Staff visibility (pickup_people_select_staff_today) is added in
-- 0005_sessions.sql once the sessions table exists.

create policy pickup_people_select_admin on public.pickup_people
  for select using (public.is_admin());

create policy pickup_people_insert_own on public.pickup_people
  for insert with check (
    added_by = auth.uid()
    and exists (select 1 from public.children c where c.id = pickup_people.child_id and c.guardian_id = auth.uid())
  );
-- No direct update policy: status transitions (esp. blocking, with the
-- blocked_reason correctness fix) go through the update_pickup_person RPC.
