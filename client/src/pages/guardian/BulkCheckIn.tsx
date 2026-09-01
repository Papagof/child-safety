import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RpcError } from "../../lib/supabase";
import { getMySessions, requestCheckin } from "../../lib/rpc";
import { listRooms, myChildren } from "../../lib/data";
import type { Child, Room } from "../../lib/types";
import { Avatar } from "../../components/Avatar";

const ACTIVE_STATUSES = new Set(["pending_checkin", "checked_in", "pending_checkout"]);

function suggestRoom(child: Child, rooms: Room[]): string {
  if (child.defaultRoomId) return child.defaultRoomId;
  const suggested = rooms.find((r) => child.age >= r.ageMin && child.age <= r.ageMax);
  return suggested?.id ?? rooms[0]?.id ?? "";
}

type Outcome = { status: "pending" } | { status: "done"; sessionId: string } | { status: "error"; message: string };

// spec.md §10.2: "Two children from the same family, checked into different
// rooms — pickup should let a parent request multiple children at once,
// generating (or reusing) codes per child, with each room's staff approving
// independently." No backend change needed — request_checkin already only
// ever acts on one child/session; this is purely a bulk-selection UI that
// calls it once per selected child.
export default function BulkCheckIn() {
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [roomChoice, setRoomChoice] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, Outcome> | null>(null);

  useEffect(() => {
    (async () => {
      const [allChildren, sessions, allRooms] = await Promise.all([myChildren(), getMySessions(), listRooms()]);
      const activeChildIds = new Set(sessions.filter((s) => ACTIVE_STATUSES.has(s.status)).map((s) => s.child.id));
      const eligible = allChildren.filter((c) => !activeChildIds.has(c.id));
      const activeRooms = allRooms.filter((r) => r.active);
      setChildren(eligible);
      setRooms(activeRooms);
      setRoomChoice(Object.fromEntries(eligible.map((c) => [c.id, suggestRoom(c, activeRooms)])));
      setLoading(false);
    })();
  }, []);

  function toggle(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  async function submit() {
    setBusy(true);
    const outcomes: Record<string, Outcome> = {};
    for (const id of selectedIds) outcomes[id] = { status: "pending" };
    setResults({ ...outcomes });

    for (const id of selectedIds) {
      try {
        const { session } = await requestCheckin(id, roomChoice[id]);
        outcomes[id] = { status: "done", sessionId: session.id };
      } catch (err) {
        outcomes[id] = { status: "error", message: err instanceof RpcError ? err.message : "Check-in failed" };
      }
      setResults({ ...outcomes });
    }
    setBusy(false);
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  if (results) {
    return (
      <div className="max-w-md mx-auto space-y-3">
        <h1 className="text-xl font-bold text-slate-800">Checking in {selectedIds.length} children</h1>
        {selectedIds.map((id) => {
          const child = children.find((c) => c.id === id)!;
          const outcome = results[id];
          return (
            <div key={id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
              <Avatar src={child.photoUrl} name={child.fullName} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{child.fullName}</p>
                {outcome.status === "pending" && <p className="text-xs text-slate-400">Generating code…</p>}
                {outcome.status === "error" && <p className="text-xs text-red-600">{outcome.message}</p>}
              </div>
              {outcome.status === "done" && (
                <Link to={`/guardian/session/${outcome.sessionId}`} className="text-xs font-semibold text-brand-700 shrink-0">
                  View code
                </Link>
              )}
            </div>
          );
        })}
        <button onClick={() => navigate("/guardian")} className="w-full bg-brand-700 hover:bg-brand-800 text-white rounded-lg py-2.5 text-sm font-semibold">
          Done
        </button>
      </div>
    );
  }

  if (children.length === 0) {
    return <p className="text-slate-500">No children available to check in right now.</p>;
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Check in multiple children</h1>
      <div className="space-y-2">
        {children.map((child) => (
          <div key={child.id} className={`bg-white border rounded-xl p-3 space-y-2 ${selected[child.id] ? "border-brand-500" : "border-slate-200"}`}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={!!selected[child.id]} onChange={() => toggle(child.id)} />
              <Avatar src={child.photoUrl} name={child.fullName} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{child.fullName}</p>
                <p className="text-xs text-slate-500">{child.age} years old</p>
              </div>
            </label>
            {selected[child.id] && (
              <select
                value={roomChoice[child.id] ?? ""}
                onChange={(e) => setRoomChoice((prev) => ({ ...prev, [child.id]: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (ages {r.ageMin}-{r.ageMax})
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={submit}
        disabled={busy || selectedIds.length === 0}
        className="w-full bg-brand-700 hover:bg-brand-800 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Generating codes…" : `Check in ${selectedIds.length || ""} ${selectedIds.length === 1 ? "child" : "children"}`.trim()}
      </button>
    </div>
  );
}
