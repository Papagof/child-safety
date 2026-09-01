import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMySessions, requestCheckout } from "../../lib/rpc";
import { exportMyData, myChildren } from "../../lib/data";
import { useAuth } from "../../context/AuthContext";
import { useChannel } from "../../lib/useRealtime";
import { RpcError } from "../../lib/supabase";
import type { Child, Session } from "../../lib/types";
import { Avatar } from "../../components/Avatar";
import { StatusBadge } from "../../components/StatusBadge";

const ACTIVE_STATUSES = new Set(["pending_checkin", "checked_in", "pending_checkout"]);

export default function GuardianDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState<Child[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickingUpId, setPickingUpId] = useState<string | null>(null);
  const [pickupError, setPickupError] = useState<{ sessionId: string; message: string } | null>(null);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([myChildren(), getMySessions()]);
    setChildren(c);
    setSessions(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useChannel(user ? `guardian:${user.id}` : null, () => load());

  // Generating a pickup code is not the security-sensitive step — staff's
  // independent acceptance is (CLAUDE.md's "two-sided confirmation" rule) —
  // so defaulting straight to "myself" and skipping the confirmation screen
  // for the common case is safe. Delegating to a different authorized pickup
  // person still goes through the full SessionStatus flow.
  async function pickUpNow(sessionId: string) {
    setPickingUpId(sessionId);
    setPickupError(null);
    try {
      const result = await requestCheckout(sessionId);
      if ("blocked" in result && result.blocked) {
        setPickupError({ sessionId, message: `Not authorized${result.reason ? `: ${result.reason}` : "."}` });
        return;
      }
      navigate(`/guardian/session/${sessionId}`);
    } catch (err) {
      setPickupError({ sessionId, message: err instanceof RpcError ? err.message : "Could not request pickup" });
    } finally {
      setPickingUpId(null);
    }
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  const notActiveCount = children.filter(
    (c) => !sessions.some((s) => s.child.id === c.id && ACTIVE_STATUSES.has(s.status))
  ).length;
  const checkedInCount = sessions.filter((s) => s.status === "checked_in").length;

  if (children.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500 mb-4">You haven't added any children yet.</p>
        <Link to="/guardian/children" className="bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
          Add a child
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-slate-800">My children</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => exportMyData()} className="text-sm text-brand-700 font-medium">
            Export my data
          </button>
          <Link to="/guardian/children" className="text-sm text-brand-700 font-medium">
            Manage children &amp; pickup list
          </Link>
        </div>
      </div>

      {(notActiveCount > 1 || checkedInCount > 1) && (
        <div className="flex flex-wrap gap-2">
          {notActiveCount > 1 && (
            <Link to="/guardian/checkin-multiple" className="text-sm bg-white border border-brand-300 text-brand-700 font-medium rounded-lg px-3 py-1.5">
              Check in multiple children
            </Link>
          )}
          {checkedInCount > 1 && (
            <Link to="/guardian/pickup-multiple" className="text-sm bg-white border border-brand-300 text-brand-700 font-medium rounded-lg px-3 py-1.5">
              Pick up multiple children
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {children.map((child) => {
          const activeSession = sessions
            .filter((s) => s.child.id === child.id && ACTIVE_STATUSES.has(s.status))
            .sort((a, b) => b.checkinRequestedAt.localeCompare(a.checkinRequestedAt))[0];
          return (
            <div key={child.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar src={child.photoUrl} name={child.fullName} size={52} />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{child.fullName}</p>
                  <p className="text-sm text-slate-500">{child.age} years old</p>
                </div>
              </div>
              {activeSession ? (
                <div className="space-y-2">
                  <StatusBadge status={activeSession.status} />
                  {activeSession.status === "checked_in" ? (
                    <>
                      <button
                        onClick={() => pickUpNow(activeSession.id)}
                        disabled={pickingUpId === activeSession.id}
                        className="w-full bg-brand-700 hover:bg-brand-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
                      >
                        {pickingUpId === activeSession.id ? "Generating code…" : "Pick up now"}
                      </button>
                      {pickupError?.sessionId === activeSession.id && (
                        <p className="text-xs text-red-600">{pickupError.message}</p>
                      )}
                      <Link to={`/guardian/session/${activeSession.id}`} className="block text-center text-xs text-slate-500">
                        Someone else picking up? View details
                      </Link>
                    </>
                  ) : (
                    <Link
                      to={`/guardian/session/${activeSession.id}`}
                      className="block text-center bg-brand-700 hover:bg-brand-800 text-white rounded-lg py-2 text-sm font-semibold"
                    >
                      View status
                    </Link>
                  )}
                </div>
              ) : (
                <Link
                  to={`/guardian/checkin/${child.id}`}
                  className="block text-center bg-brand-700 hover:bg-brand-800 text-white rounded-lg py-2 text-sm font-semibold"
                >
                  Check in
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
