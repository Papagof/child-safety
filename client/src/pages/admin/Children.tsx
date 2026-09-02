import { useEffect, useState } from "react";
import { listChildrenForAdmin, listRooms } from "../../lib/data";
import { adminSetChildRoom } from "../../lib/rpc";
import type { Child, Room } from "../../lib/types";
import { Avatar } from "../../components/Avatar";

type AdminChild = Child & { guardianName: string };

export default function Children() {
  const [children, setChildren] = useState<AdminChild[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    const [c, r] = await Promise.all([listChildrenForAdmin(), listRooms()]);
    setChildren(c);
    setRooms(r);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function onRoomChange(child: AdminChild, roomId: string) {
    setSavingId(child.id);
    try {
      await adminSetChildRoom(child.id, roomId || null);
      setChildren((prev) => prev.map((c) => (c.id === child.id ? { ...c, defaultRoomId: roomId || null } : c)));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <h1 className="text-xl font-bold text-slate-800">Children</h1>
      <p className="text-sm text-slate-500">
        Move a child to a different class/room — e.g. when they age up. This changes which room they're suggested
        for at check-in; it doesn't affect any session already in progress.
      </p>
      {children.length === 0 && <p className="text-slate-400">No children registered yet.</p>}
      {children.map((child) => (
        <div key={child.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
          <Avatar src={child.photoUrl} name={child.fullName} size={44} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 truncate">{child.fullName}</p>
            <p className="text-sm text-slate-500">{child.age} yrs · guardian {child.guardianName}</p>
          </div>
          <select
            value={child.defaultRoomId ?? ""}
            disabled={savingId === child.id}
            onChange={(e) => onRoomChange(child, e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:opacity-50"
          >
            <option value="">No class assigned</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
