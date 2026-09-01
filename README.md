# Shmeera

A secure child check-in / check-out app for a church's children's ministry. It
guarantees that only a verified, authorized adult can pick up a checked-in
child, and gives parents a direct line to staff if their child needs attention
during a service. Full product spec: [`docs/spec.md`](docs/spec.md).

Three roles share one backend:

- **Guardian** — registers children, checks in/out, adds authorized pickup
  people, messages staff.
- **Staff** — runs a room: accepts drop-offs against a check-in code, verifies
  pickup codes, messages guardians, raises incidents.
- **Admin** — approves staff accounts, manages rooms, reviews the audit log
  and incident reports, runs attendance/pickup-time reports.

## Architecture

Fully [Supabase](https://supabase.com)-native — there is no custom backend
server. The React client talks directly to Supabase:

- **Client**: React + TypeScript + Vite, React Router, Tailwind CSS, in
  [`client/`](client/).
- **Auth**: Supabase Auth, plus a `profiles` table for app-level fields.
- **Database**: Postgres with Row Level Security on every table. All state
  changes (check-in, checkout, decline, transfer, ...) go through
  `security definer` RPC functions in [`supabase/migrations/`](supabase/migrations/)
  — never a raw table write from the client. Every RPC writes an audit log
  row atomically with the change it makes.
- **Realtime**: Supabase Realtime broadcast channels (per room, per guardian,
  admin, per chat thread, per user for notifications), authorized by RLS
  policies on `realtime.messages` so a client can never see a channel it
  isn't entitled to.
- **Storage**: a private bucket for child/pickup-person/profile photos,
  path-based RLS, signed URLs on read.
- **Edge Functions**: [`supabase/functions/admin-create-staff`](supabase/functions/admin-create-staff)
  is the one place that needs the service-role key (creating a staff login
  directly, bypassing email confirmation).
- **Scheduled jobs**: `pg_cron` runs the urgent-message escalation sweep and
  the no-show sweep on a timer.

See [`CLAUDE.md`](CLAUDE.md) for the full breakdown of what's implemented,
the non-negotiable safety mechanics, and the gaps that are deliberately out
of scope for this prototype (SMS/Twilio escalation, offline sync, a real
background-check API integration, Web Push).

## Getting started

**Prerequisites**: Node.js 18+, a Supabase project, and the
[Supabase CLI](https://supabase.com/docs/guides/cli) or dashboard access to
run migrations.

1. Clone the repo and install dependencies:

   ```bash
   npm install
   ```

2. Apply the database schema. Every migration in
   [`supabase/migrations/`](supabase/migrations/) is one file per concern,
   numbered in order — run them against your Supabase project via the
   Supabase CLI (`supabase db push`) or by pasting each into the Studio SQL
   editor in order.

3. Create `client/.env` with your project's values (find these under
   Project Settings → API in the Supabase dashboard):

   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   ```

4. In Supabase Auth settings, decide whether to require email confirmation
   for signup (the default) — if left on, guardians won't get a session
   until they click the confirmation email, and Supabase's built-in mailer
   has a low default send rate. Also consider enabling leaked-password
   protection.

5. Deploy the `admin-create-staff` Edge Function (needed for admins to create
   staff logins directly):

   ```bash
   supabase functions deploy admin-create-staff
   ```

6. Start the dev server:

   ```bash
   npm run dev
   ```

   This runs Vite on `http://localhost:5173`.

## Building for production

```bash
npm run build -w client
```

Outputs a static bundle to `client/dist/`, deployable to any static host.
`client/vercel.json` includes the SPA rewrite rule Vercel needs for
client-side routes (e.g. `/guardian/session/:id`) to survive a page refresh.

## Project structure

```
client/                 React + Vite app
  src/lib/               Supabase client, typed RPC wrappers, realtime hooks
  src/context/           Auth context
  src/pages/             Route-level pages, grouped by role (guardian/staff/admin)
  src/components/        Shared UI
supabase/
  migrations/            Ordered SQL migrations — schema, RLS, RPCs
  functions/             Edge Functions
docs/spec.md             The product spec this build follows
```
