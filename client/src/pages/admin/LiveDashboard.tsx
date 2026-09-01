import { useEffect, useState, useCallback } from "react";
import { adminOverrideCheckout, getLiveSessions } from "../../lib/rpc";
import { listRooms } from "../../lib/data";
import { useChannel } from "../../lib/useRealtime";
import type { Room, Session } from "../../lib/types";
import { Avatar } from "../../components/Avatar";
import { StatusBadge } from "../../components/StatusBadge";

export default function LiveDashboard() {
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

  useChannel("admin", () => load());

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
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
                  <Avatar src={s.child.photoUrl} name={s.child.fullName} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{s.child.fullName}</p>
                    <p className="text-xs text-slate-400">Guardian: {s.child.guardianName}</p>
                  </div>
                  <StatusBadge status={s.status} />
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
