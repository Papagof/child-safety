# Shmeera — Children's Church Check-In & Safety App

## What this is

A child check-in/check-out safety app for a church's children's ministry. Three roles
share one backend: **Guardian** (parent, drops off/picks up), **Staff** (runs a room,
accepts drop-offs, verifies pickups), **Admin** (approves staff, manages rooms, audits
everything). The full spec that drove this build is in
[`docs/spec.md`](docs/spec.md) — treat its "Section 6: Security & Child-Safety
Requirements" as the part that must never be simplified away.

**Multi-tenant**: any number of independent churches/ministries (`organizations`) share
this one deployment, each fully isolated from every other — see "Multi-tenancy" below.

## Stack

Fully Supabase-native — there is no custom backend. The React client (`client/`) talks
directly to Supabase via `@supabase/supabase-js`:

- **Client** (`client/`): React + TypeScript + Vite, React Router, Tailwind CSS, `qrcode.react`
  for code display, `@supabase/supabase-js` for everything backend-related.
- **Auth**: Supabase Auth (`auth.users`) + a `public.profiles` table for app-level fields
  (`role`, `full_name`, `phone`, `photo_url`, `org_id`). Signup flow: `supabase.auth.signUp()` →
  (once a real session exists — immediately, or after email confirmation) either
  `create_organization` (self-serve — names a new org, caller becomes its first admin) or
  `join_organization_by_invite` (resolves an admin-shared invite code, caller becomes a
  guardian in that org) creates the `profiles` row. Self-service `admin` is only ever the
  first-admin-of-a-new-org path — there's no way to join an *existing* org as admin except
  another admin creating you directly (see Edge Functions below).
- **Database**: Postgres on project `mqjijvquvphlbdwbywox` (`supabase/migrations/`).
- **Realtime**: Supabase Realtime `broadcast` channels (`room:{id}`, `guardian:{id}`,
  `admin:{orgId}`, `thread:{id}`, `notifications:{userId}`), sent via `realtime.send()` from
  inside the RPCs so a client can never construct a payload for a channel it shouldn't see
  (esp. the code-bearing guardian channel). Authorized by RLS policies on `realtime.messages`
  — every one of these topic families checks org membership, not just `is_admin()`.
- **Storage**: a private `photos` Storage bucket (`children/{id}/`, `pickup-people/{id}/`,
  `profiles/{id}/`), path-based RLS, signed URLs on read (`client/src/lib/data.ts`).
- **Edge Functions**: `admin-create-staff` (`supabase/functions/`) — the one place that
  needs the service-role key (creating a login via `auth.admin.createUser`), so it can't
  live as a plain RPC. Verifies the caller is a real admin via their own JWT, then reads
  the caller's own `org_id` (via `get_my_org_id()`) and stamps it on the new account —
  since the service-role client bypasses RLS entirely, org enforcement here is done in the
  function body, not left to a policy. Takes an optional `role: 'staff' | 'admin'`
  (default `'staff'`) — **this is the only way to get a second admin into an org**, since
  self-serve signup only ever mints a new org's first admin.
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

## Multi-tenancy

Every church/ministry is an `organizations` row (`id`, `name`, `invite_code`) with zero
direct grants — reachable only through RPCs (`create_organization`, `get_invite_code`/
`regenerate_invite_code`, both admin-only). `get_my_org_id()` is the central helper
(security definer, mirrors `is_admin()`'s lockdown pattern exactly) — every place that
used to gate on `is_admin()` alone now also checks `org_id = get_my_org_id()`.

**Onboarding**: self-serve. Anyone can sign up and either start a brand-new ministry
(`create_organization` — they become its first admin) or join an *existing* one via an
admin-shared invite code (`join_organization_by_invite` — always as a guardian; staff are
still admin-created-only, never self-signup). An admin can create a fellow admin the same
way they create staff — `admin-create-staff` with `role: 'admin'`.

**Denormalized `org_id`** lives directly on `profiles`, `rooms`, `sessions`, `incidents`,
`chat_threads`, `chat_messages`, `audit_log` (queried/filtered directly by admin-facing
RPCs, or need real write-time validation — not just visibility filtering). `staff_details`/
`staff_rooms`/`children`/`pickup_people` deliberately have no column — each is one join hop
from `profiles.org_id`, and their only admin-facing policy joins instead. `audit_log.org_id`
is set by a `BEFORE INSERT` trigger (derives from `actor_id`'s profile, falling back to
`session_id`'s org for the two cron jobs that log with no actor) rather than touching every
one of its ~27 call sites. `rooms.org_id` has a column `DEFAULT public.get_my_org_id()` (not
a trigger — a trigger's default isn't visible to the TypeScript type generator, which would
otherwise mark the column required in the generated `Insert` type) since `rooms` is the one
table the client inserts into directly via PostgREST, with no wrapping RPC.

**When adding anything new**: a new admin-facing RPC needs `is_admin() and org_id =
get_my_org_id()`, not `is_admin()` alone — that was the exact shape of the worst leaks found
when this was retrofitted (an admin could see/act on every other org's rooms, sessions,
staff, audit log, and — most severely — `purge_old_records` could permanently delete another
org's history). A new realtime topic needs an org check in its `realtime.messages` policy,
the same way `room:%`/`guardian:%`/`admin:%` do. A new table holding org-scoped data should
get its own `org_id` column set explicitly by whichever RPC creates the row, validated
against the org of whatever it's attached to (room/session/etc.) — don't assume a foreign
key alone proves same-org.

**The one deliberate exception**: `profiles.is_developer` (`0054_developer_role.sql`) is a
platform-operator flag that sits *above* the multi-tenancy boundary — a developer account can
see every church, and can activate/deactivate any of them (`list_organizations_for_developer`/
`set_organization_active`, `pages/developer/Developer.tsx`), which no church's own admin
should ever be able to do to another church. It's orthogonal to `role` (still `guardian`/
`staff`/`admin` underneath) rather than a 4th role value, and there is no signup path or admin
action that can set it — only a direct `update profiles set is_developer = true` by whoever
controls the Supabase project. Deactivation is enforced in exactly one place:
`get_my_org_id()` returns `null` for a deactivated org, which every existing org-scoped check
already treats as not-found/unauthorized, so nothing else needed to change. `get_my_profile()`
is the one function that deliberately does *not* route through `get_my_org_id()`, so it can
still tell a deactivated org's own users *why* (`orgActive: false` — `RequireRole.tsx` shows a
blocking screen instead of the normal dashboard) rather than a bare failure.

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
**consent capture at signup** (`profiles.consent_at`, enforced by `create_organization`/
`join_organization_by_invite`), a
guardian **data export** (client-side JSON download, `exportMyData`), a guardian
**"remove child" soft-archive** (`children.archived_at` — deliberately not a hard delete,
to avoid breaking the non-negotiable audit trail for a child who was actually checked in),
**admin data-retention purge** (`purge_old_records`, terminal-status sessions only, never
active ones), and a persistent **notification inbox** (spec §9 — `public.notifications`, bell icon in
`components/NotificationBell.tsx`). Every check-in/checkout lifecycle RPC
(`request_checkin`/`accept_checkin`/`decline_checkin`/`request_checkout`/`approve_checkout`)
now also calls the internal `create_notification`/`notify_room_staff` helpers so a code
being generated reaches every approved staff member assigned to that room, and each side's
resulting action (accepted/declined/picked up) reaches the guardian — durable rows a user
can read after reopening the app, not just a realtime broadcast to an open tab. `list_notifications`/
`get_unread_notification_count`/`mark_notification_read`/`mark_all_notifications_read` are
the only client-facing surface; `create_notification`/`notify_room_staff` are internal-only
(explicitly revoked from `anon`/`authenticated` — see the 0017-style stray-grant note below).

A full-project audit (see migration `0052`) found two related gaps and closed both: spec
§9's **code-expiring-soon warning** was never implemented (`warn_expiring_codes`, `pg_cron`
every 5 min, notifies the guardian once — `checkin_expiry_warned`/`checkout_expiry_warned`
columns keep it from repeating), and a real dead end — a `pending_checkin`/`pending_checkout`
session whose code expired before staff acted on it had no automatic recovery, leaving the
family stuck (the "one active session per child per day" unique index blocked a retry, and
`request_checkout` requires `status = 'checked_in'`). `expire_stale_codes` (same cron cadence)
now auto-declines a stale check-in (identical end state to a staff decline — no client change
needed) and reverts a stale checkout back to `checked_in` with the stale code fields cleared,
so the guardian can simply try again; both notify the guardian and write an `audit_log` row.

**Camera QR scanning for staff** (`components/QRScanner.tsx`, `jsqr`): spec §4.3/§8 called for
scanning the guardian's QR, but staff previously always typed the code by hand even though
`QRCodeBlock`/`PrintableTag` already render one. Scanning is purely a faster way to *enter*
the same code — it goes through the exact same `accept_checkin`/`approve_checkout` RPC as
manual entry, which independently verifies it server-side, so the two-sided-confirmation
model is unchanged. A scanned QR's embedded session id is checked against the card's own
session before auto-submitting, so scanning the wrong family's screen in a crowd surfaces a
clear error instead of silently trying the wrong code. Wired into both the staff room
dashboard's `CodeAction` and the notification-inline accept/confirm flow; manual entry
remains the fallback (no camera permission, damaged screen, etc.).

**Web Push** (closes the "no OS-level push while closed" gap below): `public.push_subscriptions`
(`0053_push_subscriptions.sql`) holds one row per browser/device — non-safety-critical
plumbing, so it's plain RLS-gated direct client writes (`lib/push.ts`'s `enablePushNotifications()`),
not an RPC. Actually sending a push needs real crypto (VAPID JWT signing, payload encryption)
that doesn't exist in PL/pgSQL, so it happens in a new Edge Function, `send-push`
(`supabase/functions/send-push/`), triggered by a **Database Webhook** on `notifications`'
`AFTER INSERT` (configured in Studio, not SQL — see the setup checklist below) rather than a
trigger function, reusing the exact same `create_notification()` call sites that already
populate the in-app inbox. `send-push` isn't JWT-verified (deployed with `--no-verify-jwt`,
since the caller is Supabase's webhook system, not a user) — instead it checks a shared
`x-webhook-secret` header the webhook is configured to send, so the URL alone can't be used
to push arbitrary notifications to an arbitrary user. `client/public/sw.js` is a minimal
service worker (push + notificationclick only — no fetch interception, so this adds no
offline behavior, that's still a separate gap).

**One-time setup this needs** (none of this is done yet as of writing — Supabase's MCP
tools weren't loaded in the session that built this feature, so it could only be coded, not
deployed):
1. Generate a VAPID key pair (`npx web-push generate-vapid-keys`).
2. `supabase functions deploy send-push --no-verify-jwt` (or paste `index.ts` into the
   Studio Edge Functions editor).
3. Set three secrets on the function (Studio: Functions → send-push → Secrets, or
   `supabase secrets set`): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `WEBHOOK_SECRET` (any
   random string you invent — it just has to match step 4's header).
4. Studio → Database → Webhooks → create one: table `notifications`, event `INSERT`, HTTP
   request to the `send-push` function's URL, with a custom header
   `x-webhook-secret: <the same value as WEBHOOK_SECRET>`.
5. Add `VITE_VAPID_PUBLIC_KEY=<the public key from step 1>` to `client/.env` **and** to
   Vercel's project environment variables, then redeploy the client.
6. Apply `0053_push_subscriptions.sql` (Studio SQL editor, same as `0052`).

**Admin-triggered code delivery by SMS/email**: an admin can push a session's
currently-active check-in/pickup code straight to the guardian's own phone and email —
for when the guardian isn't looking at the app (phone locked, noisy pickup line, etc.).
`get_session_code_for_notify` (`0055_send_code_externally.sql`, security definer, checks
`is_admin()` + org match, raises if the session has no active code) fetches the code
server-side; a new Edge Function, `send-code` (`supabase/functions/send-code/`), calls it
using the admin's own forwarded JWT, looks up the guardian's email via the service-role
client (`profiles` has no email column — that's `auth.users`-owned), then sends the SMS via
Twilio's REST API and the email via Resend. The code is never returned to the admin's
browser — the function only ever responds with per-channel `{ sent, error? }`, and every
attempt (success or failure, per channel) is logged to `audit_log` as
`code_sent_externally`. This re-delivers a code through the exact same
`accept_checkin`/`approve_checkout` RPC staff already use to redeem it — two-sided
confirmation is unchanged, this is just an extra delivery path for a code that already
exists. Wired into `pages/admin/LiveDashboard.tsx`'s `SendCodeControl`, shown on any
`pending_checkin`/`pending_checkout` row.

**Live as of this writing**: `0055_send_code_externally.sql` is applied, `send-code` is
deployed (default JWT verification — the caller is always a signed-in admin, not a
webhook), and its five secrets (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM_NUMBER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`) are set on the function.
Guardian phone numbers need to be in E.164 format (`+1...`) for Twilio to accept them —
anything else surfaces as that channel's `error` in the admin UI rather than failing
silently, so that's the first thing to check if SMS delivery ever comes back with an
error for a specific guardian.

**Admin-relayed pickup confirmation** (`0056_admin_approve_checkout.sql`): for a front-desk
workflow where a parent presents their pickup code to an admin/office staff rather than
walking it to the classroom, `admin_approve_checkout(session_id, code)` lets an admin
verify the real pickup code themselves and confirm the checkout directly — an additional
path alongside the existing direct parent-to-staff flow (`approve_checkout` is untouched
and still works), not a replacement. Two-sided confirmation still holds: the code alone
never released the child, and the admin is still the second independent person who has to
enter and verify it correctly (a mismatch is rejected and audit-logged exactly like the
staff path, just with `actor_role = 'admin'`). Because the admin isn't physically in the
room, `notify_room_staff` fires afterward with an instructional notification telling the
room's staff to actually send the child out — this is informational only, not a second
confirmation step, since the checkout has already been approved by the time they see it.
Wired into `pages/admin/LiveDashboard.tsx`'s `AdminConfirmPickupControl`, shown on any
`pending_checkout` row.

**RFID self-service sign-in/out** (`0057_rfid_attendance.sql`, `pages/admin/RfidCards.tsx`):
for secondary students who move independently — no guardian handoff at the door the way
younger children have — a registered card's tap alone signs them in or out, with no second
person confirming it in the moment. This is a **deliberate, scoped exception** to the
two-sided-confirmation principle everywhere else in this app, intentional only for this age
group; `request_checkin`/`approve_checkout` for younger children are completely untouched,
and this writes into the same `sessions` table as an additional path, so reporting/audit/
the admin dashboards all work unchanged. `rfid_cards` (`org_id`, `child_id`, `card_uid`,
`status`) is RPC-only access, same pattern as `sessions`/`organizations`. Admin manages
cards via `admin_register_rfid_card`/`admin_set_rfid_card_status`/`list_rfid_cards`. The
actual toggle logic lives in `record_rfid_scan_internal(org_id, card_uid)` — first tap of
the day creates a `checked_in` session directly (skipping `pending_checkin` entirely, since
there's no code/confirmation step), a second tap sets it `checked_out` — granted **only to
`service_role`**, never `anon`/`authenticated`, so it can't be reached straight from a
browser. Two entry points reach it: `admin_simulate_rfid_scan` (normal JWT + `is_admin()`,
for testing with no reader hardware — this is what `RfidCards.tsx`'s "Simulate a scan" panel
calls) and the `rfid-scan` Edge Function (`--no-verify-jwt`, for an actual future reader
device, which has no Supabase Auth session of its own). The Edge Function authenticates via
a per-organization `rfid_scan_secret` (`organizations` column, regenerable, admin-only
visible via `get_rfid_scan_secret`/`regenerate_rfid_scan_secret` — mirrors `invite_code`'s
shape) sent as an `x-rfid-secret` header, never a URL param, so a leaked secret only ever
exposes the one org's readers. **No physical reader hardware is integrated yet** — the Edge
Function is deployed and ready for whenever one exists; `admin_simulate_rfid_scan` is the
only way to exercise the flow today. A student needs a `default_room_id` (homeroom) set
before their card will work — `record_rfid_scan_internal` returns a clear `no_room_assigned`
error otherwise rather than guessing a room.

**Daily staff/teacher sign-in and sign-out** (`0058_staff_attendance.sql`, `staff_attendance` table):
presence/attendance tracking for staff, deliberately separate from the child check-in/checkout
flow — no child custody is involved, so this is **not** governed by the two-sided-confirmation
principle above. A staff member is already authenticated as themselves; tapping "Sign in"/"Sign
out" on their own dashboard (`StaffDashboard.tsx`'s `AttendanceControl`) is self-service, with no
second person confirming it, the same way a person clocking themselves in doesn't need a witness.
`staff_sign_in()`/`staff_sign_out()` are gated by `is_approved_staff()` (not `is_admin()` — this is
staff acting on their own record, not an admin action) and enforce at most one open (not yet
signed out) row per staff member via a partial unique index, which still allows multiple
sign-in/out cycles in a day (e.g. a lunch break). `list_staff_attendance` is the admin-facing
report (`pages/admin/StaffAttendance.tsx`), org-scoped like every other admin list/report RPC.
Applies to every organization, not just schools — org type (church vs. school) isn't tracked as
data anywhere in this app (the signup toggle only changes field labels), so this was built as a
general feature rather than adding that distinction just for this.

## Known intentional gaps in this prototype

SMS escalation via Twilio for **urgent-chat escalation** specifically is still not wired
up — `escalate_unread_urgent_messages()` (run by `pg_cron` every minute) only creates an
`incidents` row and an `admin` realtime broadcast, no external SMS send; Twilio is now
used, but only for the separate admin-triggered code-delivery path above. There's no
offline-sync engine — the printed tag/stub covers "phone
is dead," not "venue has no connectivity at all." Background-check integration is a manual
admin-set status field, not a third-party API. There's no
staff idle auto-sign-out — a build of this app once had one (5 idle minutes, matching
spec §6's "a left-open tablet shouldn't be usable to fraudulently approve a pickup"), but
it was deliberately removed at the user's request: staff now stay signed in until they sign
out manually. If this app is ever deployed on a shared/public tablet rather than each
staff member's own phone, that tradeoff is worth revisiting. These are documented
follow-ups, not oversights.

Two Supabase Auth settings need a manual toggle in Studio that no available tool covers:
email-confirmation-required (currently on — blocks instant signup, and its mailer has a
low default send-rate limit) and leaked-password protection (currently off).

## Commands

- `npm run dev` — start the client (Vite dev server, port 5173).
- Supabase project `mqjijvquvphlbdwbywox` — see `client/.env` for the URL/anon key (not
  committed). Schema changes go in `supabase/migrations/`, applied via the Supabase MCP
  tools (`apply_migration`) or the Supabase CLI/Studio SQL editor.
