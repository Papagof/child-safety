# Shmeera — Children's Church Check-In & Safety App

## What this is

A child check-in/check-out safety app for a church's children's ministry. Three roles
share one backend: **Guardian** (parent, drops off/picks up), **Staff** (runs a room,
accepts drop-offs, verifies pickups), **Admin** (approves staff, manages rooms, audits
everything). The full spec that drove this build is in
[`docs/spec.md`](docs/spec.md) — treat its "Section 6: Security & Child-Safety
Requirements" as the part that must never be simplified away.

## Stack

Fully Supabase-native — there is no custom backend. The React client (`client/`) talks
directly to Supabase via `@supabase/supabase-js`:

- **Client** (`client/`): React + TypeScript + Vite, React Router, Tailwind CSS, `qrcode.react`
  for code display, `@supabase/supabase-js` for everything backend-related.
- **Auth**: Supabase Auth (`auth.users`) + a `public.profiles` table for app-level fields
  (`role`, `full_name`, `phone`, `photo_url`). Signup flow: `supabase.auth.signUp()` →
  (once a real session exists — immediately, or after email confirmation) the
  `complete_signup` RPC creates the `profiles` row and blocks self-service `admin`.
- **Database**: Postgres on project `mqjijvquvphlbdwbywox` (`supabase/migrations/`).
- **Realtime**: Supabase Realtime `broadcast` channels (`room:{id}`, `guardian:{id}`,
  `admin`, `thread:{id}`), sent via `realtime.send()` from inside the RPCs so a client
  can never construct a payload for a channel it shouldn't see (esp. the code-bearing
  guardian channel). Authorized by RLS policies on `realtime.messages`.
- **Storage**: a private `photos` Storage bucket (`children/{id}/`, `pickup-people/{id}/`,
  `profiles/{id}/`), path-based RLS, signed URLs on read (`client/src/lib/data.ts`).
- **Edge Functions**: `admin-create-staff` (`supabase/functions/`) — the one place that
  needs the service-role key (creating a login via `auth.admin.createUser`), so it can't
  live as a plain RPC. Verifies the caller is a real admin via their own JWT before doing
  anything privileged. Lets admin create an already-approved staff login directly, as an
  alternative to staff self-signup (which needs email confirmation — see below).
- **Scheduled jobs**: `pg_cron` runs `escalate_unread_urgent_messages()` every minute —
  the durable replacement for what used to be an in-process timer.
- Client env: `client/.env` (not committed) needs `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` for project `mqjijvquvphlbdwbywox`.

This retired an earlier local Express + `node:sqlite` + `ws` + JWT stack that stood in for
this architecture during initial development (no Docker for local Supabase, and a
reluctance to share a hosted project pool with unrelated live apps at the time). That
blocker is resolved — this is the real, live architecture now, not a stand-in.

## Non-negotiable safety mechanics (do not "simplify away")

- **Two-sided confirmation.** A code being generated never changes a child's status by
  itself. All status transitions (`checked_in`, `checked_out`, decline, flag) go
  through Postgres RPC functions in `supabase/migrations/` (`security definer`, e.g.
  `accept_checkin`, `approve_checkout`, `flag_pickup_mismatch`), never raw table updates
  from the client — the `sessions` table itself has zero direct grants to any role. The
  RPCs check the actor's role/room-assignment/approval status server-side and write an
  `audit_log` row atomically with the state change.
- **Closed authorized-pickup list.** A guardian can only ever present themself or a
  pickup person *they* added (with photo) as a checkout requester. A pickup person can
  also be marked `blocked` (not just `inactive`) — distinct UI/warning for "explicitly
  not authorized" vs. "not on the list at all."
- **Codes are single-use, time-limited, and cryptographically random** (`pgcrypto`),
  generated per session, never sequential/guessable.
- **RLS is the source of truth for visibility**: guardians see only their own family;
  staff see only their assigned room(s) and only once `staff_details.approval_status =
  'approved'`; admin sees everything. Don't relax a policy to unblock a UI bug — fix
  the query/RPC instead.
- **Audit trail**: every check-in, check-out, decline, failed/mismatched code attempt,
  and urgent chat escalation must produce an `audit_log` and/or `incidents` row.

## Spec coverage beyond the core flows

Also implemented, closing gaps `docs/spec.md` described that the original build never
got to: mid-service **room transfer** (`transfer_session` — always requires the
destination room's staff to separately `accept_checkin`, never a unilateral move; unifies
spec §3.1's "room editable by staff" and §10.4's transfer flow), a **no-show sweep**
(`flag_noshow_pickups`, `pg_cron` every 5 min, reuses the 4h check-in-code TTL as the
"service window" — §10.5), **admin manual-override checkout** for a lost/dead parent phone
(`admin_override_checkout` — §10.1), a **printable check-in tag/stub** as the offline
physical backup (`components/PrintableTag.tsx` — §3.6/§6), a general **staff incident
report form** (`report_incident`, separate from the pickup-mismatch-specific
`flag_pickup_mismatch`), **richer audit-log search** by room/child/date range
(`list_audit_log`), **admin reporting** (attendance, average pickup time, incidents over
time — `get_attendance_report`/`get_pickup_time_report`/`get_incidents_report`),
**consent capture at signup** (`profiles.consent_at`, enforced by `complete_signup`), a
guardian **data export** (client-side JSON download, `exportMyData`), a guardian
**"remove child" soft-archive** (`children.archived_at` — deliberately not a hard delete,
to avoid breaking the non-negotiable audit trail for a child who was actually checked in),
**admin data-retention purge** (`purge_old_records`, terminal-status sessions only, never
active ones), **staff auto-lock** (sign-out after 5 idle minutes, `lib/useIdleLock.ts`), and
a persistent **notification inbox** (spec §9 — `public.notifications`, bell icon in
`components/NotificationBell.tsx`). Every check-in/checkout lifecycle RPC
(`request_checkin`/`accept_checkin`/`decline_checkin`/`request_checkout`/`approve_checkout`)
now also calls the internal `create_notification`/`notify_room_staff` helpers so a code
being generated reaches every approved staff member assigned to that room, and each side's
resulting action (accepted/declined/picked up) reaches the guardian — durable rows a user
can read after reopening the app, not just a realtime broadcast to an open tab. `list_notifications`/
`get_unread_notification_count`/`mark_notification_read`/`mark_all_notifications_read` are
the only client-facing surface; `create_notification`/`notify_room_staff` are internal-only
(explicitly revoked from `anon`/`authenticated` — see the 0017-style stray-grant note below).

## Known intentional gaps in this prototype

SMS escalation (Twilio) is not wired up — `escalate_unread_urgent_messages()` (run by
`pg_cron` every minute) only creates an `incidents` row and an `admin` realtime broadcast,
no external SMS send. There's no offline-sync engine — the printed tag/stub covers "phone
is dead," not "venue has no connectivity at all." Background-check integration is a manual
admin-set status field, not a third-party API. The notification inbox has no Web Push —
it only surfaces once the app is reopened, no OS-level push while closed. These are
documented follow-ups, not oversights.

Two Supabase Auth settings need a manual toggle in Studio that no available tool covers:
email-confirmation-required (currently on — blocks instant signup, and its mailer has a
low default send-rate limit) and leaked-password protection (currently off).

## Commands

- `npm run dev` — start the client (Vite dev server, port 5173).
- Supabase project `mqjijvquvphlbdwbywox` — see `client/.env` for the URL/anon key (not
  committed). Schema changes go in `supabase/migrations/`, applied via the Supabase MCP
  tools (`apply_migration`) or the Supabase CLI/Studio SQL editor.
