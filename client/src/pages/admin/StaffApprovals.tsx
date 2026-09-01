import { useEffect, useState, type FormEvent } from "react";
import { approveStaff, getInviteCode, listStaffAccounts, regenerateInviteCode, rejectStaff, setBackgroundCheckStatus, setStaffRooms } from "../../lib/rpc";
import { adminCreateStaff, listRooms } from "../../lib/data";
import type { Room, StaffAccount } from "../../lib/types";
import { Avatar } from "../../components/Avatar";

function InviteCodePanel() {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getInviteCode().then(setCode);
  }, []);

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function regenerate() {
    if (!window.confirm("Regenerate the invite code? The old code will stop working immediately.")) return;
    setBusy(true);
    try {
      setCode(await regenerateInviteCode());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-semibold text-slate-700">Guardian invite code</p>
      <p className="text-xs text-slate-500">Share this with parents/guardians — they enter it when signing up to join your ministry.</p>
      <div className="flex items-center gap-2">
        <span className="flex-1 font-mono tracking-widest text-lg text-brand-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          {code ?? "…"}
        </span>
        <button onClick={copy} className="text-xs font-semibold text-brand-700 border border-brand-300 rounded-lg px-3 py-2">
          {copied ? "Copied!" : "Copy"}
        </button>
        <button disabled={busy} onClick={regenerate} className="text-xs font-semibold text-red-600 border border-red-300 rounded-lg px-3 py-2 disabled:opacity-50">
          Regenerate
        </button>
      </div>
    </div>
  );
}

function CreateStaffForm({ rooms, onCreated }: { rooms: Room[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleRoom(id: string) {
    setRoomIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminCreateStaff({ email, password, fullName, phone: phone || undefined, roomIds, consentConfirmed, role });
      setOpen(false);
      setRole("staff");
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setRoomIds([]);
      setConsentConfirmed(false);
      onCreated();
    } catch (err: any) {
      setError(err.message ?? "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-brand-700 hover:bg-brand-800 text-white rounded-lg px-4 py-2 text-sm font-semibold">
        + Create staff or admin account
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-semibold text-slate-700">Create an account</p>
      <p className="text-xs text-slate-500">
        Creates a login directly and approves it immediately — use this instead of asking the person to sign up
        themselves. Give them the email/password to log in with; they should change the password afterward.
      </p>
      <div className="flex rounded-lg border border-slate-200 p-1 text-xs font-medium">
        <button
          type="button"
          onClick={() => setRole("staff")}
          className={`flex-1 rounded-md py-1.5 ${role === "staff" ? "bg-brand-700 text-white" : "text-slate-600"}`}
        >
          Staff
        </button>
        <button
          type="button"
          onClick={() => setRole("admin")}
          className={`flex-1 rounded-md py-1.5 ${role === "admin" ? "bg-brand-700 text-white" : "text-slate-600"}`}
        >
          Admin
        </button>
      </div>
      <input required placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <input required type="text" minLength={8} placeholder="Temporary password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      {role === "staff" && (
        <div className="flex flex-wrap gap-1.5">
          {rooms.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => toggleRoom(r.id)}
              className={`text-xs rounded-full px-2.5 py-1 border ${
                roomIds.includes(r.id) ? "bg-brand-700 text-white border-brand-700" : "bg-white text-slate-600 border-slate-300"
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
      <label className="flex items-start gap-2 text-xs text-slate-500">
        <input type="checkbox" required checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} className="mt-0.5" />
        <span>I confirm this person has consented to Shmeera storing their information.</span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="bg-brand-700 hover:bg-brand-800 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {busy ? "Creating…" : "Create account"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function StaffApprovals() {
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  async function load() {
    const [s, r] = await Promise.all([listStaffAccounts(), listRooms()]);
    setStaff(s);
    setRooms(r);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleRoom(s: StaffAccount, roomId: string) {
    const roomIds = s.roomIds.includes(roomId) ? s.roomIds.filter((r) => r !== roomId) : [...s.roomIds, roomId];
    await setStaffRooms(s.id, roomIds);
    load();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-slate-800">Staff accounts</h1>
        <CreateStaffForm rooms={rooms} onCreated={load} />
      </div>
      <InviteCodePanel />
      {staff.length === 0 && <p className="text-slate-400">No staff accounts yet.</p>}
      {staff.map((s) => (
        <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Avatar src={s.photoUrl} name={s.fullName} size={44} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800">{s.fullName}</p>
              <p className="text-sm text-slate-500">{s.email}</p>
            </div>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
                s.approvalStatus === "approved"
                  ? "bg-emerald-100 text-emerald-800"
                  : s.approvalStatus === "rejected"
                  ? "bg-red-100 text-red-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {s.approvalStatus}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            Background check:
            <select
              value={s.backgroundCheckStatus}
              onChange={async (e) => {
                await setBackgroundCheckStatus(s.id, e.target.value as "pending" | "confirmed");
                load();
              }}
              className="border border-slate-300 rounded-md px-1.5 py-1"
            >
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {rooms.map((r) => (
              <button
                key={r.id}
                onClick={() => toggleRoom(s, r.id)}
                className={`text-xs rounded-full px-2.5 py-1 border ${
                  s.roomIds.includes(r.id)
                    ? "bg-brand-700 text-white border-brand-700"
                    : "bg-white text-slate-600 border-slate-300"
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>

          {s.approvalStatus !== "approved" && (
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await approveStaff(s.id);
                  load();
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                Approve
              </button>
              <button
                onClick={async () => {
                  await rejectStaff(s.id);
                  load();
                }}
                className="bg-red-100 hover:bg-red-200 text-red-700 rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
