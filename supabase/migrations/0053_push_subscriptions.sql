-- Web Push (spec.md §9's "push notifications" — the notification inbox from
-- 0029 only ever surfaced once the app was reopened, no OS-level push while
-- closed). Each row is one browser/device's push subscription for a user;
-- non-safety-critical plumbing (which endpoint to POST to), so plain
-- RLS-gated direct writes are fine — same "reduce RPC surface" precedent as
-- rooms/children/pickup_people, not the sessions/notifications lockdown
-- pattern (this table has no codes, no child data, nothing to protect beyond
-- "only the owning user can see or remove their own device's subscription").
create table public.push_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select_own on public.push_subscriptions
  for select using (user_id = auth.uid());

create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert with check (user_id = auth.uid());

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete using (user_id = auth.uid());

-- The actual send happens in the send-push Edge Function, triggered by a
-- Database Webhook on this table's sibling `notifications` (configured via
-- Studio: Database -> Webhooks -> "notification-created" -> INSERT on
-- public.notifications -> HTTP request to the send-push function, with a
-- custom header `x-webhook-secret: <WEBHOOK_SECRET>` matching the function's
-- secret so the endpoint can't be spoofed into pushing to an arbitrary user)
-- rather than a SQL trigger here, since composing the exact
-- supabase_functions.http_request(...) call by hand risks a signature
-- mismatch with no easy way to verify it in this session — the dashboard
-- wizard is the reliable path for that one step. See CLAUDE.md for the full
-- setup checklist.
