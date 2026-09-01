import { useEffect, useState } from "react";
import { getAttendanceReport, getIncidentsReport, getPickupTimeReport } from "../../lib/rpc";
import type { AttendanceReportRow, IncidentsReportRow, PickupTimeReport } from "../../lib/types";

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

// Every bar below encodes one thing — magnitude — with one hue (the app's
// existing brand color), so there's no categorical palette to validate: the
// number is always shown as a direct label, never color-only.
function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-40 shrink-0 truncate text-slate-600">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-brand-600 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right font-medium text-slate-700">{value}</span>
    </div>
  );
}

export default function Reports() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [attendance, setAttendance] = useState<AttendanceReportRow[]>([]);
  const [pickupTime, setPickupTime] = useState<PickupTimeReport | null>(null);
  const [incidents, setIncidents] = useState<IncidentsReportRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [a, p, i] = await Promise.all([
        getAttendanceReport(from, to),
        getPickupTimeReport(from, to),
        getIncidentsReport(from, to),
      ]);
      setAttendance(a);
      setPickupTime(p);
      setIncidents(i);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attendanceByRoom = new Map<string, { name: string; total: number }>();
  for (const row of attendance) {
    const existing = attendanceByRoom.get(row.roomId) ?? { name: row.roomName, total: 0 };
    existing.total += row.count;
    attendanceByRoom.set(row.roomId, existing);
  }
  const attendanceRooms = [...attendanceByRoom.values()].sort((a, b) => b.total - a.total);
  const attendanceMax = Math.max(1, ...attendanceRooms.map((r) => r.total));

  const incidentsByType = new Map<string, number>();
  for (const row of incidents) incidentsByType.set(row.type, (incidentsByType.get(row.type) ?? 0) + row.count);
  const incidentTypeRows = [...incidentsByType.entries()].sort((a, b) => b[1] - a[1]);
  const incidentsMax = Math.max(1, ...incidentTypeRows.map(([, c]) => c));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-slate-800">Reports</h1>
        <div className="flex items-center gap-2 text-sm">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5" />
          <span className="text-slate-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5" />
          <button onClick={load} disabled={loading} className="bg-brand-700 hover:bg-brand-800 text-white rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50">
            {loading ? "Loading…" : "Apply"}
          </button>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Attendance by room</h2>
        {attendanceRooms.length === 0 && <p className="text-sm text-slate-400">No check-ins in this range.</p>}
        {attendanceRooms.map((r) => (
          <Bar key={r.name} value={r.total} max={attendanceMax} label={r.name} />
        ))}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Average pickup time</h2>
        <p className="text-3xl font-bold text-brand-800">
          {pickupTime?.overallAvgMinutes != null ? `${pickupTime.overallAvgMinutes.toFixed(1)} min` : "—"}
        </p>
        <p className="text-xs text-slate-400">Time from check-in acceptance to checkout approval, overall.</p>
        <div className="pt-2 space-y-2">
          {(pickupTime?.byRoom ?? []).map((r) => (
            <Bar key={r.roomId} value={Math.round(r.avgMinutes ?? 0)} max={Math.max(1, ...(pickupTime?.byRoom ?? []).map((x) => Math.round(x.avgMinutes ?? 0)))} label={r.roomName} />
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Incidents by type</h2>
        {incidentTypeRows.length === 0 && <p className="text-sm text-slate-400">No incidents in this range.</p>}
        {incidentTypeRows.map(([type, count]) => (
          <Bar key={type} value={count} max={incidentsMax} label={type.replace(/_/g, " ")} />
        ))}
      </section>
    </div>
  );
}
