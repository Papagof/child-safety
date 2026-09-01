import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RpcError } from "../../lib/supabase";
import { requestCheckin } from "../../lib/rpc";
import { listRooms, myChildren } from "../../lib/data";
import type { Child, Room } from "../../lib/types";
import { Avatar } from "../../components/Avatar";

export default function CheckIn() {
  const { childId } = useParams();
  const navigate = useNavigate();
  const [child, setChild] = useState<Child | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [children, allRooms] = await Promise.all([myChildren(), listRooms()]);
      const found = children.find((x) => x.id === childId) ?? null;
      setChild(found);
      setRooms(allRooms.filter((rm) => rm.active));
      if (found?.defaultRoomId) setRoomId(found.defaultRoomId);
      else if (allRooms.length) {
        const suggested = allRooms.find((rm) => found && found.age >= rm.ageMin && found.age <= rm.ageMax);
        setRoomId(suggested?.id ?? allRooms[0].id);
      }
    })();
  }, [childId]);

  async function submit() {
    if (!child || !roomId) return;
    setBusy(true);
    setError(null);
    try {
      const { session } = await requestCheckin(child.id, roomId);
      navigate(`/guardian/session/${session.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof RpcError ? err.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  if (!child) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Avatar src={child.photoUrl} name={child.fullName} size={56} />
        <div>
          <h1 className="font-bold text-lg text-slate-800">Check in {child.fullName}</h1>
          <p className="text-sm text-slate-500">{child.age} years old</p>
        </div>
      </div>
      {!child.photoUrl && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          This child has no photo on file yet — staff will rely on the name only to verify them. Add one from
          "Manage children."
        </p>
      )}
      <div>
        <label className="text-sm font-medium text-slate-700">Room</label>
        <select
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} (ages {r.ageMin}-{r.ageMax})
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !roomId}
        className="w-full bg-brand-700 hover:bg-brand-800 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Generating code…" : "Generate check-in code"}
      </button>
    </div>
  );
}
