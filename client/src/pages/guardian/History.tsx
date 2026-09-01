import { useEffect, useState } from "react";
import { getMySessions } from "../../lib/rpc";
import type { Session } from "../../lib/types";
import { Avatar } from "../../components/Avatar";
import { StatusBadge } from "../../components/StatusBadge";

export default function History() {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    getMySessions().then(setSessions);
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <h1 className="text-xl font-bold text-slate-800">Session history</h1>
      {sessions.length === 0 && <p className="text-slate-400">No sessions yet.</p>}
      {sessions.map((s) => (
        <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
          <Avatar src={s.child.photoUrl} name={s.child.fullName} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800">{s.child.fullName}</p>
            <p className="text-xs text-slate-400">
              {new Date(s.checkinRequestedAt).toLocaleString()}
              {s.checkoutApprovedAt ? ` → ${new Date(s.checkoutApprovedAt).toLocaleTimeString()}` : ""}
            </p>
          </div>
          <StatusBadge status={s.status} />
        </div>
      ))}
    </div>
  );
}
