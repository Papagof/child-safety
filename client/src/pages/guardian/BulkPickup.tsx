import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RpcError } from "../../lib/supabase";
import { getMySessions, requestCheckout } from "../../lib/rpc";
import type { Session } from "../../lib/types";
import { Avatar } from "../../components/Avatar";
import { useAuth } from "../../context/AuthContext";

type Outcome = { status: "pending" } | { status: "done" } | { status: "error"; message: string };

// spec.md §10.2's pickup half: request checkout for several checked-in
// children at once. Defaults every selected child's requester to the
// guardian themself (the common "picking up my kids" case) — delegating a
// specific child to a different authorized pickup person still goes through
// that child's own SessionStatus page, one at a time.
export default function BulkPickup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, Outcome> | null>(null);

  useEffect(() => {
    (async () => {
      const all = await getMySessions();
      setSessions(all.filter((s) => s.status === "checked_in"));
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
        const result = await requestCheckout(id);
        if ("blocked" in result && result.blocked) {
          outcomes[id] = { status: "error", message: `Not authorized${result.reason ? `: ${result.reason}` : "."}` };
        } else {
          outcomes[id] = { status: "done" };
        }
      } catch (err) {
        outcomes[id] = { status: "error", message: err instanceof RpcError ? err.message : "Could not request pickup" };
      }
      setResults({ ...outcomes });
    }
    setBusy(false);
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  if (results) {
    return (
      <div className="max-w-md mx-auto space-y-3">
        <h1 className="text-xl font-bold text-slate-800">Requesting pickup for {selectedIds.length} children</h1>
        {selectedIds.map((id) => {
          const session = sessions.find((s) => s.id === id)!;
          const outcome = results[id];
          return (
            <div key={id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
              <Avatar src={session.child.photoUrl} name={session.child.fullName} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{session.child.fullName}</p>
                {outcome.status === "pending" && <p className="text-xs text-slate-400">Generating code…</p>}
                {outcome.status === "error" && <p className="text-xs text-red-600">{outcome.message}</p>}
              </div>
              {outcome.status === "done" && (
                <Link to={`/guardian/session/${id}`} className="text-xs font-semibold text-brand-700 shrink-0">
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

  if (sessions.length === 0) {
    return <p className="text-slate-500">No children are currently checked in.</p>;
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Pick up multiple children</h1>
      <p className="text-xs text-slate-500">
        Requests pickup as you, {user?.fullName}, for each child selected. Each room's staff approves independently.
      </p>
      <div className="space-y-2">
        {sessions.map((s) => (
          <label key={s.id} className={`flex items-center gap-3 bg-white border rounded-xl p-3 cursor-pointer ${selected[s.id] ? "border-brand-500" : "border-slate-200"}`}>
            <input type="checkbox" checked={!!selected[s.id]} onChange={() => toggle(s.id)} />
            <Avatar src={s.child.photoUrl} name={s.child.fullName} size={40} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">{s.child.fullName}</p>
              <p className="text-xs text-slate-500">{s.child.age} years old</p>
            </div>
          </label>
        ))}
      </div>
      <button
        onClick={submit}
        disabled={busy || selectedIds.length === 0}
        className="w-full bg-brand-700 hover:bg-brand-800 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Generating codes…" : `Request pickup for ${selectedIds.length || ""} ${selectedIds.length === 1 ? "child" : "children"}`.trim()}
      </button>
    </div>
  );
}
