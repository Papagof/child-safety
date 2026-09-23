import { useEffect, useState } from "react";
import { listStaffAttendance, listStaffAccounts } from "../../lib/rpc";
import type { StaffAccount, StaffAttendanceRecord } from "../../lib/types";

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

function duration(signedInAt: string, signedOutAt: string | null) {
  if (!signedOutAt) return "Still signed in";
  const minutes = Math.round((new Date(signedOutAt).getTime() - new Date(signedInAt).getTime()) / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function StaffAttendance() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [staffId, setStaffId] = useState("");
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [records, setRecords] = useState<StaffAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listStaffAccounts().then(setStaff);
  }, []);

  async function load() {
    setLoading(true);
    try {
      setRecords(await listStaffAttendance({ from, to, staffId: staffId || undefined }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, staffId]);

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <h1 className="text-xl font-bold text-slate-800">Staff attendance</h1>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center gap-2 text-sm">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5" />
        <span className="text-slate-400">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5" />
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 flex-1 min-w-[10rem]">
          <option value="">All staff</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {loading && <p className="p-4 text-sm text-slate-400">Loading…</p>}
        {!loading && records.length === 0 && <p className="p-4 text-sm text-slate-400">No attendance records in this range.</p>}
        {!loading &&
          records.map((r) => (
            <div key={r.id} className="p-3 text-sm flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-800 truncate">{r.staffName}</p>
                <p className="text-xs text-slate-400">
                  {r.serviceDate} · {new Date(r.signedInAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  {r.signedOutAt ? ` – ${new Date(r.signedOutAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${
                  r.signedOutAt ? "bg-slate-100 text-slate-500" : "bg-green-50 text-green-700"
                }`}
              >
                {duration(r.signedInAt, r.signedOutAt)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
