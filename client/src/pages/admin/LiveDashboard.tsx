import { useEffect, useState, useCallback } from "react";
import { adminOverrideCheckout, getLiveSessions, transferSession } from "../../lib/rpc";
import { listRooms } from "../../lib/data";
import { useAuth } from "../../context/AuthContext";
import { useChannel } from "../../lib/useRealtime";
import type { Room, Session } from "../../lib/types";
import { Avatar } from "../../components/Avatar";
import { StatusBadge } from "../../components/StatusBadge";

function TransferControl({ session, rooms, onDone }: { session: Session; rooms: Room[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState(false);
  const otherRooms = rooms.filter((r) => r.id !== session.roomId && r.active);

  if (otherRooms.length === 0) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-medium text-brand-700 shrink-0">
        Transfer
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <select
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        className="rounded-lg border border-slate-300 px-1.5 py-1 text-xs"
      >
        <option value="">Move to…</option>
        {otherRooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <button
        disabled={busy || !roomId}
        onClick={async () => {
          setBusy(true);
          try {
            await transferSession(session.id, roomId);
            onDone();
          } finally {
            setBusy(false);
            setOpen(false);
          }
        }}
        className="text-xs font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-lg px-2 py-1 disabled:opacity-50"
      >
        Go
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-slate-400">
        ✕
      </button>
    </div>
  );
}

export default function LiveDashboard() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([getLiveSessions(), listRooms()]);
    setSessions(s);
    setRooms(r);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useChannel(user ? `admin:${user.orgId}` : null, () => load());

  async function manualOverride(sessionId: string, childName: string) {
    const reason = window.prompt(
      `Manually check out ${childName}? Use this for spec §10.1 cases — e.g. a parent's phone is dead/lost. Enter a reason:`
    );
    if (reason === null) return;
    await adminOverrideCheckout(sessionId, reason);
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Live cross-room dashboard</h1>
      {rooms.map((room) => {
        const inRoom = sessions.filter((s) => s.roomId === room.id);
        if (inRoom.length === 0) return null;
        return (
          <section key={room.id}>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
              {room.name} ({inRoom.length})
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {inRoom.map((s) => (
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3 flex-wrap">
                  <Avatar src={s.child.photoUrl} name={s.child.fullName} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{s.child.fullName}</p>
                    <p className="text-xs text-slate-400">Guardian: {s.child.guardianName}</p>
                  </div>
                  <StatusBadge status={s.status} />
                  {(s.status === "pending_checkin" || s.status === "checked_in") && (
                    <TransferControl session={s} rooms={rooms} onDone={load} />
                  )}
                  {(s.status === "checked_in" || s.status === "pending_checkout") && (
                    <button
                      onClick={() => manualOverride(s.id, s.child.fullName)}
                      className="text-xs font-medium text-red-600 shrink-0"
                      title="Manual override checkout"
                    >
                      Override
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {sessions.length === 0 && <p className="text-slate-400">No active sessions right now.</p>}
    </div>
  );
}
