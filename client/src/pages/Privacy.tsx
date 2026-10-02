import { Link } from "react-router";
import type { ReactNode } from "react";

const EFFECTIVE_DATE = "October 2, 2026";
const CONTACT_EMAIL = "privacy@shmeera.com";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-brand-900 mb-2">{title}</h2>
      <div className="space-y-3 text-sm text-slate-700 leading-relaxed">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 shadow-sm">
        <Link to="/" className="text-sm text-brand-700 font-medium">
          ← Back to Shmeera
        </Link>
        <h1 className="text-2xl font-bold text-brand-900 mt-4 mb-1">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-8">Effective {EFFECTIVE_DATE}</p>

        <Section title="Overview">
          <p>
            Shmeera ("Shmeera," "we," "us") provides check-in and safety software that
            churches, schools, and similar organizations ("Organizations") use to manage
            drop-off and pickup for children and students in their care, and to track
            staff attendance. This policy explains what information Shmeera collects,
            how it's used, who can see it, and the choices you have.
          </p>
          <p>
            <strong>Organizations, not Shmeera, decide who uses the app and why.</strong>{" "}
            If your church or school uses Shmeera, that Organization is responsible for
            obtaining any consent needed from guardians and staff, and for deciding how
            long to keep records. Shmeera acts as the software and hosting provider that
            processes this information on the Organization's behalf.
          </p>
        </Section>

        <Section title="Information we collect">
          <p>
            <strong>Account information.</strong> When you sign up, we collect your name,
            email address, phone number (optional), and a password (handled by our
            authentication provider — we never see or store your raw password). If you
            create a new Organization, we store the Organization's name and type (church
            or school).
          </p>
          <p>
            <strong>Children's and students' information.</strong> A guardian or admin may
            add a child's name, age or grade/classroom, and a photo, used to identify the
            child at check-in and pickup. This information is entered by an adult
            (guardian, staff, or admin) on the child's behalf — children do not create
            accounts or interact with Shmeera directly.
          </p>
          <p>
            <strong>Authorized pickup people.</strong> A guardian may add other people
            authorized to pick up their child, including each person's name and photo.
          </p>
          <p>
            <strong>Check-in/checkout activity.</strong> Timestamps, room assignments,
            check-in and pickup codes, and the staff/admin actions taken on each session
            (accepted, declined, transferred, flagged). Every status change and failed or
            mismatched code attempt is recorded in an audit log that Organization admins
            can review.
          </p>
          <p>
            <strong>Messages.</strong> In-app messages between a guardian and their
            child's room staff about that child's care that day.
          </p>
          <p>
            <strong>Staff information.</strong> For staff and admin accounts: approval
            status, room assignments, and daily sign-in/sign-out timestamps. Background
            check status, where an Organization tracks it, is a simple status field the
            Organization sets itself — Shmeera does not run background checks or store
            background check reports.
          </p>
          <p>
            <strong>RFID cards (if used).</strong> Some Organizations issue a physical
            card to older students for self-service sign-in/out. We store the card's ID
            number and which student it's linked to — no other information is read from
            the card.
          </p>
          <p>
            <strong>Device and notification information.</strong> If you enable push
            notifications, we store a device/browser-specific subscription token needed to
            deliver them. We do not use this to track you outside the app.
          </p>
          <p>
            <strong>Information we don't collect.</strong> We don't use advertising
            trackers, we don't sell data, and we don't require precise device location.
          </p>
        </Section>

        <Section title="How we use information">
          <ul className="list-disc pl-5 space-y-1">
            <li>Operating the check-in/checkout process, including generating and verifying one-time codes.</li>
            <li>Notifying guardians and staff about check-ins, pickups, and messages, in-app and (if enabled) by push notification.</li>
            <li>Sending a pickup or check-in code directly to a guardian by SMS or email, but only when an admin explicitly triggers it for a specific pending session.</li>
            <li>Maintaining the audit trail Organization admins use to review activity and investigate incidents.</li>
            <li>Keeping the app secure and working as intended.</li>
          </ul>
        </Section>

        <Section title="Who can see your information">
          <p>
            Shmeera is multi-tenant: every Organization's data is isolated from every
            other Organization's, enforced at the database level, not just in the app's
            screens. Within a single Organization:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>A guardian can see only their own family's information.</li>
            <li>A staff member can see only the children and sessions in the room(s) they're assigned to, once an admin has approved their account.</li>
            <li>An admin can see all of their own Organization's data — never another Organization's.</li>
          </ul>
          <p>
            A small number of platform-operator accounts, controlled directly by
            Shmeera's developer and never created through sign-up, can see which
            Organizations exist on the platform so the service itself can be operated and
            kept running. These accounts cannot see a child's or guardian's personal
            information inside any Organization.
          </p>
        </Section>

        <Section title="Photos">
          <p>
            Photos of children and authorized pickup people are stored in a private file
            store, never a public URL. The app generates a temporary, expiring link each
            time a photo needs to be shown, only to someone authorized to see it under
            the rules above.
          </p>
        </Section>

        <Section title="Who we share information with">
          <p>
            We don't sell personal information, and we don't share it across
            Organizations. We use a small number of service providers to operate
            Shmeera, each only to perform the function listed:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase</strong> — database, authentication, and file storage.</li>
            <li><strong>Twilio</strong> — delivering SMS text messages, only when an admin sends a code by text.</li>
            <li><strong>Resend</strong> — delivering emails, only when an admin sends a code by email.</li>
            <li><strong>Hostinger</strong> — web hosting for the app itself.</li>
            <li><strong>Browser/OS push services (e.g. Google, Apple, Mozilla)</strong> — delivering push notifications to a device that has enabled them.</li>
          </ul>
          <p>
            We may also disclose information if required by law, or to protect the
            safety of a child, staff member, or the public.
          </p>
        </Section>

        <Section title="Data retention and deletion">
          <p>
            An admin can remove a child from their Organization's active roster at any
            time; this archives the record rather than deleting it outright, so that past
            check-in history isn't erased from the audit trail for a child who was
            actually in care. An admin can also run a retention purge that permanently
            deletes old, fully-completed session records (never active ones) past a
            cutoff they choose. A guardian can export their own family's data from within
            the app at any time.
          </p>
          <p>
            If you'd like your account or your family's information fully removed, contact
            your Organization's admin, or reach us directly (see Contact below) and we'll
            work with the relevant Organization to process the request.
          </p>
        </Section>

        <Section title="Security">
          <p>
            All status changes go through server-side checks that verify who's making the
            request and what they're allowed to do, before anything is written — the app
            has no code path that lets a client directly edit a child's check-in status.
            Every check-in, checkout, decline, and mismatched code attempt is logged.
            Sensitive actions, like releasing a child to a pickup person, require
            independent confirmation of a one-time code rather than relying on a single
            tap.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>
            Shmeera is a tool for guardians, staff, and administrators — children do not
            sign up for or log into Shmeera themselves, and the app is not directed at
            children as its audience. Information about a child is entered by their
            guardian or their Organization's staff/admin, who are responsible for
            deciding what to share. If you're a parent or guardian with questions about
            your child's information in Shmeera, contact your Organization's admin or
            reach us directly below.
          </p>
        </Section>

        <Section title="Your choices">
          <ul className="list-disc pl-5 space-y-1">
            <li>Push notifications can be turned off at any time from your device or browser settings.</li>
            <li>You can export your own family's data from within the app.</li>
            <li>You can ask your Organization's admin to update or remove information about you or your child.</li>
          </ul>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we make material changes to this policy, we'll update the effective date
            above and, where appropriate, notify Organization admins.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your information can be sent to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-700 font-medium">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
