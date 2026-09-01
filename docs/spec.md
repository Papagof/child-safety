# App Development Prompt: Children's Church Check-In & Safety App

Use this document as a build prompt for a developer or an AI app-builder (Bolt, Lovable, v0, Replit Agent, etc.). It describes the product end to end: purpose, users, flows, data model, security requirements, and screens.

## 1. Product Summary

Build a secure child check-in and check-out application for a church's children's ministry. The core problem it solves: when a parent drops off a child for children's church, the app must guarantee that only the correct, verified adult can pick that child up again, and it must give parents a way to reach staff quickly if the child needs attention during the service.

The app has two user-facing sides that share one backend:

- A **Parent app/portal** (mobile-first, works on phones) for drop-off, pickup, and messaging staff.
- A **Staff/Volunteer app** (used on a tablet or phone at the children's church entrance) for accepting drop-offs, verifying pickups, and responding to parent messages.

An **Admin/Coordinator role** sits above both, for managing rooms, staff accounts, rosters, and incident records.

## 2. User Roles

**Parent/Guardian** — creates a family profile, registers one or more children, checks a child in and out, chats with staff, receives alerts.

**Staff/Volunteer** — signed-in adult stationed in a children's church room; accepts check-ins, verifies check-out codes, messages parents, raises incident alerts.

**Admin/Coordinator** — manages staff accounts and background-check status, manages rooms/classes and capacity, views all check-in/out logs, handles disputes or lost-code cases, exports reports.

**Security note:** every role above must go through its own authentication. Staff accounts should require admin approval before activation, since they are the ones accepting custody of children.

## 3. Core Flow #1 — Drop-Off (Check-In)

1. Parent opens the app and selects the child (or children) to check in, and the room/class the child belongs to (auto-suggested by age group, editable by staff if needed).
2. The app generates a **unique, time-limited check-in code** for that child for that session (see Section 6 for code rules). The code is shown as both a large numeric/alphanumeric code and a QR code, so it can be read visually or scanned.
3. The code is simultaneously transmitted to the staff app assigned to that room — staff do not need the parent to show a screen; the request already appears on the staff device as a pending drop-off with the child's name, photo, age, room, and any flagged medical/allergy notes.
4. Staff reviews the request, matches the child physically present against the child's profile photo, and taps **Accept**. Only on staff acceptance does the child's status change to "Checked In." If staff has any doubt (child not present, mismatch, no photo on file), staff can decline or hold with a note.
5. On acceptance, the parent's app confirms with a timestamp, staff name, and room, and the same check-in code is now "armed" for use at pickup — it is not reusable for another check-in.
6. A printed or digital **matching tag pair** is standard practice in children's ministries and should be supported too: one tag/sticker stays with the child, the corresponding stub stays with the parent, both displaying the same code/QR as a physical backup to the digital flow (useful if a phone battery dies or the app is offline).

## 4. Core Flow #2 — Pickup (Check-Out)

1. When the parent returns, they open the app and tap **Pick Up** for the specific child. The app generates (or reveals) a **pickup code** distinct from the check-in code — this can be a fresh one-time code, or a continuation of the same session code, but it must never be guessable or reused across families.
2. This code is sent to the staff app for that room, appearing as a pending pickup request with the requesting parent/guardian's name, photo, and relationship to the child.
3. Staff asks the presenting adult for the code (verbally or by scanning the QR/tag stub) and cross-checks it against what the app displays, along with the adult's photo/ID on file.
4. Staff taps **Approve** only when the code matches and the adult is a verified authorized pickup person for that child. The child's status changes to "Checked Out," logged with timestamp and staff name.
5. If someone other than a pre-authorized guardian arrives (e.g., a grandparent, a friend), the app must support a **secondary authorized pickup list** set up in advance by the primary parent, each with their own photo and ID reference. An unlisted person should never be able to generate a valid pickup code — the request should be blocked at the parent's own login, since only an account holder or someone the account holder has explicitly delegated to can initiate a pickup request.
6. If the code doesn't match, staff must be able to flag a **failed pickup attempt**, which immediately notifies the admin/coordinator and logs the incident with time, room, and description.

## 5. Chat Between Parents and Staff (In-Service Messaging)

Purpose: let a parent be reached quickly, or reach staff quickly, without leaving or interrupting the main service.

- Each checked-in child automatically gets a **session-scoped chat thread** between that child's parent and the staff currently assigned to that child's room, active only while the child is checked in (and archived, not deleted, after checkout, for accountability).
- Staff can send a **quick-action alert** to the parent (e.g., "Needs a diaper change," "Feeling unwell," "Please come to the room") that triggers a push notification and a distinct sound/vibration, since the parent may be in a quiet service and not watching the app.
- Parents can message staff directly for routine questions ("Can she have a snack?") and can also raise their own **urgent flag** requesting to be met at the door.
- An **escalation path** should exist: if a staff message is marked urgent and unread after a short window (configurable, e.g., 2–3 minutes), the app should escalate — additional notification channel (SMS as a fallback if push fails), and/or a visual alert to the admin/coordinator dashboard so a runner can be sent to fetch the parent physically.
- All chat messages are logged and tied to the child's session record for safeguarding accountability — nothing should be a private, unlogged channel between an adult and content about a child.

## 6. Security & Child-Safety Requirements

This is the most important section — the code should treat these as non-negotiable, not "nice to have":

- **Unique, single-use, time-limited codes.** Every check-in and pickup code is generated per-session, is cryptographically random (not sequential or guessable), and expires after use or after a set window (e.g., end of service + buffer).
- **Two-sided confirmation, never one-sided.** A code being *generated* does not check a child in or out by itself — a staff member must independently accept it. The system of record is the staff acceptance action, not the code generation.
- **Photo verification.** Every child profile and every authorized-pickup adult profile includes a stored photo, shown to staff at the moment of accept/approve, so staff are matching a face, not just a code.
- **Authorized pickup list, closed by default.** Only the primary guardian(s) and people the primary guardian explicitly added (each with ID/photo) can ever be presented as a valid pickup option. No walk-up stranger flow.
- **No unaccompanied release.** A child is never marked checked-out without an explicit staff approval action tied to a specific staff account (for audit).
- **Full audit trail.** Every check-in, check-out, declined attempt, failed code, and chat escalation is timestamped, tied to a user/staff ID, and retained per the church's data-retention policy. Admins can pull a report for any child, date, or room.
- **Staff vetting gate.** Staff accounts require admin approval and, ideally, integration or manual confirmation of a completed background check before the account can accept check-ins.
- **Medical/allergy visibility, privacy-scoped.** Medical notes are visible to assigned staff at check-in but not exposed broadly; treat this as sensitive personal data (especially given many attendees are minors).
- **Data protection & minors' data.** Since this app handles children's personal data (names, photos, medical notes, guardians), it should follow strong data-protection practice — encrypted storage and transit, minimal data retention beyond what's operationally needed, parental consent captured at signup, and clear controls for a parent to view/export/delete their child's data.
- **Offline fallback.** Because church buildings can have poor connectivity, the check-in/checkout flow should degrade gracefully — e.g., a locally cached matching code/QR pair that syncs once connectivity returns, so a family is never stuck unable to check in or out because of Wi-Fi.
- **Device security.** Staff-side sessions should auto-lock after inactivity so a left-open tablet can't be used to fraudulently approve a pickup.

## 7. Data Model (Suggested Entities)

- **Family/Guardian account** — name, phone, email, photo, login credentials, linked children, secondary-authorized-pickup list.
- **Child profile** — name, DOB/age, photo, room/class assignment, medical/allergy notes, primary guardian(s), authorized pickup list.
- **Authorized pickup person** — name, photo, relationship to child, ID reference, added-by guardian, active/inactive status.
- **Session record** — child ID, service date, room, check-in code, check-in timestamp, staff who accepted, check-out code, check-out timestamp, staff who approved, status (checked-in/checked-out/flagged).
- **Staff/Volunteer account** — name, photo, role, assigned room(s), approval/vetting status, login credentials.
- **Incident/Alert log** — type (failed pickup, urgent chat escalation, other), session ID, timestamp, description, resolving admin.
- **Chat thread** — session ID, participants, messages (sender, timestamp, text, urgent flag, read status).

## 8. Screens to Build

**Parent side:** Sign up/login, family & children profile setup (with photo upload), authorized-pickup-list management, check-in screen (child + room selector, generated code/QR), check-out screen (generate/reveal pickup code), live status of currently-checked-in children, chat thread per child, notifications/alerts inbox, past session history.

**Staff side:** Login, room dashboard (list of pending and checked-in children for their assigned room), accept check-in screen (shows child photo, name, medical notes, accept/decline), approve pickup screen (code entry/QR scan, shows requesting adult's photo and relationship, approve/decline, flag mismatch), chat inbox per child, quick-action alert buttons, incident report form.

**Admin side:** Staff account management & approval, room/class setup and capacity, live cross-room dashboard of all checked-in children, full audit log/search, incident review, data export and retention controls, reporting (attendance, average pickup time, incidents over time).

## 9. Notifications

Push notifications (with SMS fallback for urgent items) are needed for: check-in accepted, pickup request received (to staff), pickup approved (to parent), urgent staff alert, chat message received, failed pickup attempt (to admin), and code-expiring-soon warnings if a parent generated a code but hasn't completed the flow.

## 10. Edge Cases to Handle Explicitly

- Parent's phone is dead or lost at pickup time — fallback to the physical paired tag/stub code, or admin-assisted manual identity verification with photo ID, logged as a manual override with the admin's name attached.
- Two children from the same family, checked into different rooms — pickup should let a parent request multiple children at once, generating (or reusing) codes per child, with each room's staff approving independently.
- Custody/legal restrictions — support marking a specific adult as **explicitly not authorized** for pickup, distinct from simply "not on the list," so staff get a clear warning rather than a silent decline.
- Child needs to leave early / mid-service transfer between rooms — staff-initiated transfer flow, still logged, with the new room's staff separately accepting custody.
- No-show pickup by service end — auto-alert to admin after a configurable grace period, with a defined "who stays with the child" protocol.

## 11. Suggested Tech Approach (optional starting point)

A cross-platform mobile app (e.g., React Native or Flutter) for parents and staff, backed by a real-time database/backend (e.g., Firebase, Supabase, or a Node/Postgres API with WebSocket support) to push check-in/checkout requests and chat messages live between devices. QR generation/scanning via a standard device-camera library. Push notifications via each platform's native push service (APNs/FCM), with an SMS provider (e.g., Twilio) as the escalation fallback channel described in Section 5.

---

**How to use this prompt:** paste this whole document into your AI app-builder of choice, or hand it to a developer as the initial spec. Flag Section 6 (Security & Child-Safety Requirements) as the section that should never be simplified away for the sake of shipping faster — it's the actual point of the app.
