import type { SessionStatus } from "../lib/types";

const STYLES: Record<SessionStatus, string> = {
  pending_checkin: "bg-amber-100 text-amber-800",
  checked_in: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-800",
  pending_checkout: "bg-sky-100 text-sky-800",
  checked_out: "bg-slate-200 text-slate-700",
  transferred: "bg-violet-100 text-violet-800",
};

const LABELS: Record<SessionStatus, string> = {
  pending_checkin: "Pending check-in",
  checked_in: "Checked in",
  declined: "Declined",
  pending_checkout: "Pending pickup",
  checked_out: "Checked out",
  transferred: "Transferred",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
