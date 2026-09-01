import { useEffect, useState, useCallback } from "react";
import { RpcError } from "../../lib/supabase";
import { acceptCheckin, approveCheckout, declineCheckin, flagPickupMismatch, getRoomSessions, reportIncident, transferSession } from "../../lib/rpc";
import { listRooms } from "../../lib/data";
import { useAuth } from "../../context/AuthContext";
import { useChannel } from "../../lib/useRealtime";
import type { Room, Session } from "../../lib/types";
import { Avatar } from "../../components/Avatar";
import { StatusBadge } from "../../components/StatusBadge";
import { ChatPanel } from "../../components/ChatPanel";

function CodeAction({
  placeholder,
  onSubmit,
  busy,
}: {
  placeholder: string;
  onSubmit: (code: string) => void;
  busy: boolean;
}) {
  const [code, setCode] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tracking-widest uppercase"
      />
      <button
        disabled={busy || !code}
        onClick={() => onSubmit(code)}
        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        Confirm
      </button>
    </div>
  );
}

function TransferForm({
  rooms,
  busy,
  onSubmit,
  onCancel,
}: {
  rooms: Room[];
  busy: boolean;
  onSubmit: (roomId: string) => void;
  onCancel: () => void;
}) {
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  return (
    <div className="flex gap-2">
      <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <button
        disabled={busy || !roomId}
        onClick={() => onSubmit(roomId)}
        className="bg-brand-700 hover:bg-brand-800 text-white rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        Transfer
      </button>
      <button onClick={onCancel} className="text-xs text-slate-500">
        Cancel
      </button>
    </div>
  );
}

function SessionCard({ session, rooms, onChange }: { session: Session; rooms: Room[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showFlag, setShowFlag] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const otherRooms = rooms.filter((r) => r.id !== session.roomId && r.active);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result && typeof result === "object" && (result as any).error === "code_mismatch") {
        setError("Code does not match — please try again.");
        return;
      }
      onChange();
    } catch (err) {
      setError(err instanceof RpcError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Avatar src={session.child.photoUrl} name={session.child.fullName} size={52} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800">{session.child.fullName}</p>
          <p className="text-sm text-slate-500">{session.child.age} yrs · guardian {session.child.guardianName}</p>
        </div>
        <StatusBadge status={session.status} />
      </div>

      {session.child.medicalNotes && (
        <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2">
          Medical/allergy notes: {session.child.medicalNotes}
        </p>
      )}

      {session.status === "pending_checkin" && (
        <div className="space-y-2">
          {session.isTransfer ? (
            <p className="text-xs text-slate-500">
              Transferred from another room — confirm the child in front of you matches the photo above, no code needed.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Ask the parent for the check-in code shown on their screen, and confirm the child in front of you matches
              the photo above.
            </p>
          )}
          {session.isTransfer ? (
            <button
              disabled={busy}
              onClick={() => run(() => acceptCheckin(session.id, ""))}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
            >
              Accept transfer
            </button>
          ) : (
            <CodeAction placeholder="Check-in code" busy={busy} onSubmit={(code) => run(() => acceptCheckin(session.id, code))} />
          )}
          <button
            onClick={() => {
              const reason = window.prompt("Reason for declining (optional):") ?? "";
              run(() => declineCheckin(session.id, reason));
            }}
            className="text-xs text-red-600 font-medium"
          >
            Decline / hold
          </button>
        </div>
      )}

      {(session.status === "pending_checkin" || session.status === "checked_in") && otherRooms.length > 0 && (
        <div>
          {!showTransfer ? (
            <button onClick={() => setShowTransfer(true)} className="text-xs text-brand-700 font-medium">
              Transfer to another room
            </button>
          ) : (
            <TransferForm
              rooms={otherRooms}
              busy={busy}
              onCancel={() => setShowTransfer(false)}
              onSubmit={(newRoomId) => {
                run(() => transferSession(session.id, newRoomId));
                setShowTransfer(false);
              }}
            />
          )}
        </div>
      )}

      {session.status === "checked_in" && (
        <button onClick={() => setShowChat((v) => !v)} className="text-sm text-brand-700 font-medium">
          {showChat ? "Hide chat" : "Message guardian"}
        </button>
      )}

      {session.status === "pending_checkout" && session.requester && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-lg p-2">
            <Avatar src={session.requester.photoUrl} name={session.requester.fullName} size={36} />
            <div>
              <p className="text-sm font-medium text-slate-800">{session.requester.fullName}</p>
              <p className="text-xs text-slate-500">{session.requester.relationship}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">Ask this adult for the pickup code and confirm it matches.</p>
          <CodeAction
            placeholder="Pickup code"
            busy={busy}
            onSubmit={(code) => run(() => approveCheckout(session.id, code))}
          />
          {!showFlag ? (
            <button onClick={() => setShowFlag(true)} className="text-xs text-red-600 font-medium">
              Flag mismatch / failed attempt
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                id={`flag-${session.id}`}
                placeholder="What happened?"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
              <button
                onClick={() => {
                  const input = document.getElementById(`flag-${session.id}`) as HTMLInputElement;
                  run(() => flagPickupMismatch(session.id, input.value));
                  setShowFlag(false);
                }}
                className="bg-red-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                Report to admin
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {showChat && (
        <div className="pt-2 border-t border-slate-100">
          <ChatPanel sessionId={session.id} showQuickAlerts />
        </div>
      )}
    </div>
  );
}

function ReportIncidentForm({ roomId }: { roomId: string }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-red-600 font-medium">
        Report an incident
      </button>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-semibold text-slate-700">Report an incident</p>
      {done ? (
        <p className="text-sm text-emerald-700">Reported to admin.</p>
      ) : (
        <>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What happened?"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              disabled={busy || !description.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await reportIncident(roomId, description);
                  setDone(true);
                  setDescription("");
                } finally {
                  setBusy(false);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Sending…" : "Submit"}
            </button>
            <button onClick={() => setOpen(false)} className="text-sm text-slate-500">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function StaffDashboard() {
  const { user, staff, refresh } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
    listRooms().then(setRooms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (staff?.rooms.length && !roomId) setRoomId(staff.rooms[0].id);
  }, [staff, roomId]);

  const load = useCallback(async () => {
    if (!roomId) return;
    setSessions(await getRoomSessions(roomId));
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load]);

  useChannel(roomId ? `room:${roomId}` : null, () => load());

  if (!staff) return <p className="text-slate-400">Loading…</p>;

  if (staff.approvalStatus !== "approved") {
    return (
      <div className="max-w-md mx-auto text-center py-16 bg-white border border-slate-200 rounded-2xl">
        <p className="text-lg font-semibold text-slate-800 mb-2">Welcome, {user?.fullName}</p>
        <p className="text-sm text-slate-500">
          {staff.approvalStatus === "rejected"
            ? "Your staff account application was not approved. Please speak with your ministry admin."
            : "Your staff account is pending admin approval. You'll be able to accept check-ins once approved."}
        </p>
      </div>
    );
  }

  if (staff.rooms.length === 0) {
    return <p className="text-slate-500">You haven't been assigned to a room yet — ask an admin to assign you.</p>;
  }

  const pending = sessions.filter((s) => s.status === "pending_checkin");
  const active = sessions.filter((s) => s.status === "checked_in");
  const pickups = sessions.filter((s) => s.status === "pending_checkout");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Room dashboard</h1>
        {staff.rooms.length > 1 && (
          <select
            value={roomId ?? ""}
            onChange={(e) => setRoomId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            {staff.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {roomId && <ReportIncidentForm roomId={roomId} />}

      {[
        { title: "Pending check-ins", list: pending },
        { title: "Pending pickups", list: pickups },
        { title: "Checked in", list: active },
      ].map((group) => (
        <section key={group.title}>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
            {group.title} ({group.list.length})
          </h2>
          {group.list.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing here right now.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {group.list.map((s) => (
                <SessionCard key={s.id} session={s} rooms={rooms} onChange={load} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
