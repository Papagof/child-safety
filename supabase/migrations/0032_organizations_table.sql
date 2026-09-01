-- Multi-tenancy retrofit, step 1: the organizations table itself. Zero
-- direct grants, RLS enabled with no policies — same "RPC-only access"
-- pattern already used for `sessions`/`notifications`. The invite_code is
-- a secret (grants indefinite org membership on join) so it must never be
-- readable via a direct table select, only through the admin-only
-- get_invite_code() RPC added later in this migration series.
create table public.organizations (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
revoke all on public.organizations from anon, authenticated;
