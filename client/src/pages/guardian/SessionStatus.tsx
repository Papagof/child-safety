import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RpcError } from "../../lib/supabase";
import { getSession, requestCheckout } from "../../lib/rpc";
import { listRooms, myPickupPeople } from "../../lib/data";
import { useAuth } from "../../context/AuthContext";
import { useChannel } from "../../lib/useRealtime";
import type { PickupPerson, Room, Session } from "../../lib/types";
import { Avatar } from "../../components/Avatar";
import { StatusBadge } from "../../components/StatusBadge";
import { QRCodeBlock } from "../../components/QRCodeBlock";
import { PrintableTag } from "../../components/PrintableTag";
import { ChatPanel } from "../../components/ChatPanel";

export default function SessionStatus() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [pickupPeople, setPickupPeople] = useState<PickupPerson[]>([]);
  const [pickupPersonId, setPickupPersonId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPickupForm, setShowPickupForm] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const s = await getSession(sessionId);
    setSession(s);
    const rp = await myPickupPeople(s.child.id);
    setPickupPeople(rp.filter((p) => p.status === "active"));
  }, [sessionId]);

  useEffect(() => {
    load();
    listRooms().then(setRooms);
  }, [load]);

  useChannel(user ? `guardian:${user.id}` : null, (payload: any) => {
    if (payload?.session?.id === sessionId) load();
  });

  async function requestPickup() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestCheckout(session.id, pickupPersonId || undefined);
      if ("blocked" in result && result.blocked) {
        setError(`This person is explicitly not authorized for pickup${result.reason ? `: ${result.reason}` : "."}`);
        return;
      }
      setShowPickupForm(false);
      load();
    } catch (err) {
      setError(err instanceof RpcError ? err.message : "Could not request pickup");
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <p className="text-slate-400">Loading…</p>;

  const room = rooms.find((r) => r.id === session.roomId);

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar src={session.child.photoUrl} name={session.child.fullName} size={52} />
          <div className="flex-1">
            <p className="font-semibold text-slate-800">{session.child.fullName}</p>
            <p className="text-sm text-slate-500">{room?.name ?? "Room"}</p>
          </div>
          <StatusBadge status={session.status} />
        </div>

        {session.status === "pending_checkin" && session.checkinCode && (
          <>
            <QRCodeBlock code={session.checkinCode} label="Show this to staff to complete check-in" sessionId={session.id} />
            <button onClick={() => window.print()} className="w-full text-xs text-brand-700 font-medium">
              Print backup tag (for offline pickup)
            </button>
            <PrintableTag childName={session.child.fullName} code={session.checkinCode} sessionId={session.id} label="Check-in code" />
          </>
        )}

        {session.status === "declined" && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            Check-in was declined{session.checkinDeclineReason ? `: ${session.checkinDeclineReason}` : "."} Please
            speak with a staff member.
          </div>
        )}

        {session.status === "transferred" && (
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-violet-700">
            This child was moved to a different room by staff. Check your dashboard for the updated status.
          </div>
        )}

        {session.status === "checked_in" && (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
              Checked in at {new Date(session.checkinAcceptedAt!).toLocaleTimeString()}
              {session.checkinStaffName ? ` by ${session.checkinStaffName}` : ""}.
            </p>
            {!showPickupForm ? (
              <button
                onClick={() => setShowPickupForm(true)}
                className="w-full bg-brand-700 hover:bg-brand-800 text-white rounded-lg py-2.5 text-sm font-semibold"
              >
                Pick up
              </button>
            ) : (
              <div className="space-y-2 border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-medium text-slate-700">Who is picking up?</p>
                <select
                  value={pickupPersonId}
                  onChange={(e) => setPickupPersonId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Myself ({user?.fullName})</option>
                  {pickupPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.relationship})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">
                  Only you, or people you've explicitly added to this child's pickup list, can ever appear here.
                </p>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button
                  onClick={requestPickup}
                  disabled={busy}
                  className="w-full bg-brand-700 hover:bg-brand-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {busy ? "Generating code…" : "Generate pickup code"}
                </button>
              </div>
            )}
          </div>
        )}

        {session.status === "pending_checkout" && session.checkoutCode && (
          <>
            <QRCodeBlock code={session.checkoutCode} label="Show this to staff to complete pickup" sessionId={session.id} />
            <button onClick={() => window.print()} className="w-full text-xs text-brand-700 font-medium">
              Print backup tag (for offline pickup)
            </button>
            <PrintableTag childName={session.child.fullName} code={session.checkoutCode} sessionId={session.id} label="Pickup code" />
          </>
        )}

        {session.status === "checked_out" && (
          <div className="text-sm text-slate-600 bg-slate-100 rounded-lg p-3">
            Checked out at {new Date(session.checkoutApprovedAt!).toLocaleTimeString()}
            {session.checkoutStaffName ? ` by ${session.checkoutStaffName}` : ""}.
          </div>
        )}
      </div>

      {(session.status === "checked_in" || session.status === "pending_checkout") && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Chat with room staff</h2>
          <ChatPanel sessionId={session.id} showQuickAlerts={false} />
        </div>
      )}

      <button onClick={() => navigate("/guardian")} className="text-sm text-brand-700 font-medium">
        ← Back to dashboard
      </button>
    </div>
  );
}
