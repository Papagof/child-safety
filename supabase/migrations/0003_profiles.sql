create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('guardian','staff','admin')),
  full_name text not null,
  phone text,
  photo_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- is_admin() bypasses RLS (security definer) so it can be reused inside every
-- other table's policies without recursion concerns. It only ever inspects the
-- caller's own row.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select using (public.is_admin());

-- No insert/update/delete policies: profile creation happens only via the
-- complete_signup() RPC (security definer), never a direct client insert.
