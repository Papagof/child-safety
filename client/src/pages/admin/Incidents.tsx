import { useEffect, useState, useCallback } from "react";
import { listIncidents } from "../../lib/data";
import { resolveIncident } from "../../lib/rpc";
import { useChannel } from "../../lib/useRealtime";
import type { Incident } from "../../lib/types";

const TYPE_LABEL: Record<Incident["type"], string> = {
  failed_pickup: "Failed pickup attempt",
  urgent_escalation: "Urgent message escalation",
  other: "Other",
};

export default function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    const data = await listIncidents(showResolved ? undefined : "open");
    setIncidents(data);
  }, [showResolved]);

  useEffect(() => {
    load();
  }, [load]);

  useChannel("admin", () => load());

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Incidents</h1>
        <label className="text-sm text-slate-500 flex items-center gap-1.5">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
      </div>
      {incidents.length === 0 && <p className="text-slate-400">No incidents.</p>}
      {incidents.map((i) => (
        <div key={i.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-800">{TYPE_LABEL[i.type]}</p>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                i.status === "open" ? "bg-red-100 text-red-800" : "bg-slate-200 text-slate-600"
              }`}
            >
              {i.status}
            </span>
          </div>
          <p className="text-sm text-slate-600">{i.description || "No description provided."}</p>
          <p className="text-xs text-slate-400">
            {i.roomName ? `${i.roomName} · ` : ""}
            Reported by {i.reportedByName ?? "system"} · {new Date(i.createdAt).toLocaleString()}
          </p>
          {i.status === "open" && (
            <button
              onClick={async () => {
                await resolveIncident(i.id);
                load();
              }}
              className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5"
            >
              Mark resolved
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
