import { useEffect, useState } from "react";
import { listAuditLog, listRooms, searchChildrenForAdmin } from "../../lib/data";
import type { AuditEntry, Room } from "../../lib/types";

const NEW_ACTIONS = [
  "session_transferred_out",
  "session_transferred_in",
  "noshow_flagged",
  "checkout_manual_override",
  "incident_reported",
  "records_purged",
] as const;

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [roomId, setRoomId] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [childQuery, setChildQuery] = useState("");
  const [childOptions, setChildOptions] = useState<{ id: string; fullName: string }[]>([]);
  const [childId, setChildId] = useState("");

  useEffect(() => {
    listRooms().then(setRooms);
  }, []);

  useEffect(() => {
    if (!childQuery) {
      setChildOptions([]);
      return;
    }
    const t = setTimeout(() => {
      searchChildrenForAdmin(childQuery).then(setChildOptions);
    }, 250);
    return () => clearTimeout(t);
  }, [childQuery]);

  async function load() {
    const data = await listAuditLog({
      action: action || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      roomId: roomId || undefined,
      childId: childId || undefined,
    });
    setEntries(data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, from, to, roomId, childId]);

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <h1 className="text-xl font-bold text-slate-800">Audit log</h1>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 grid gap-2 sm:grid-cols-2">
        <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">All actions</option>
          <option value="checkin_requested">Check-in requested</option>
          <option value="checkin_accepted">Check-in accepted</option>
          <option value="checkin_declined">Check-in declined</option>
          <option value="checkin_code_mismatch">Check-in code mismatch</option>
          <option value="checkout_requested">Checkout requested</option>
          <option value="checkout_approved">Checkout approved</option>
          <option value="checkout_code_mismatch">Checkout code mismatch</option>
          <option value="checkout_mismatch_flagged">Mismatch flagged</option>
          <option value="urgent_message_escalated">Urgent message escalated</option>
          {NEW_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">All rooms</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder="From" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder="To" />

        <div className="sm:col-span-2 relative">
          {childId ? (
            <div className="flex items-center gap-2 text-sm rounded-lg border border-slate-300 px-2 py-1.5">
              <span className="flex-1 truncate">{childOptions.find((c) => c.id === childId)?.fullName ?? "Selected child"}</span>
              <button onClick={() => { setChildId(""); setChildQuery(""); }} className="text-slate-400 text-xs">
                Clear
              </button>
            </div>
          ) : (
            <>
              <input
                value={childQuery}
                onChange={(e) => setChildQuery(e.target.value)}
                placeholder="Search child by name…"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              {childOptions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-sm max-h-40 overflow-y-auto">
                  {childOptions.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setChildId(c.id);
                        setChildQuery("");
                        setChildOptions([]);
                      }}
                      className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50"
                    >
                      {c.fullName}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {entries.map((e) => (
          <div key={e.id} className="p-3 text-sm flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-slate-800">
                {e.action.replace(/_/g, " ")} <span className="text-slate-400 font-normal">by {e.actorName ?? e.actorId} ({e.actorRole})</span>
              </p>
              {e.details && Object.keys(e.details).length > 0 && (
                <p className="text-xs text-slate-400 mt-0.5">{JSON.stringify(e.details)}</p>
              )}
            </div>
            <p className="text-xs text-slate-400 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</p>
          </div>
        ))}
        {entries.length === 0 && <p className="p-4 text-sm text-slate-400">No entries.</p>}
      </div>
    </div>
  );
}
