import { useEffect, useState, type FormEvent } from "react";
import {
  adminRegisterRfidCard,
  adminSetRfidCardStatus,
  adminSimulateRfidScan,
  getRfidScanSecret,
  listRfidCards,
  regenerateRfidScanSecret,
} from "../../lib/rpc";
import { listChildrenForAdmin } from "../../lib/data";
import type { Child, RfidCard } from "../../lib/types";

function ScanSecretPanel() {
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRfidScanSecret().then(setSecret);
  }, []);

  async function copy() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function regenerate() {
    if (!window.confirm("Regenerate the RFID reader secret? Any reader already configured with the old one will stop working until updated.")) return;
    setBusy(true);
    try {
      setSecret(await regenerateRfidScanSecret());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-semibold text-slate-700">RFID reader secret</p>
      <p className="text-xs text-slate-500">
        A physical card reader authenticates with this secret (sent as an <code className="bg-slate-50 px-1 rounded">x-rfid-secret</code> header,
        never in a URL) instead of a login — configure it once on each reader you install. No reader hardware is wired up yet; use "Simulate a
        scan" below to test the flow in the meantime.
      </p>
      <div className="flex items-center gap-2">
        <span className="flex-1 font-mono text-xs text-brand-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 truncate">
          {secret ?? "…"}
        </span>
        <button onClick={copy} className="text-xs font-semibold text-brand-700 border border-brand-300 rounded-lg px-3 py-2 shrink-0">
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          disabled={busy}
          onClick={regenerate}
          className="text-xs font-semibold text-red-600 border border-red-300 rounded-lg px-3 py-2 disabled:opacity-50 shrink-0"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}

function SimulateScanPanel() {
  const [cardUid, setCardUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function simulate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const outcome = await adminSimulateRfidScan(cardUid.trim());
      if ("error" in outcome) {
        const messages: Record<string, string> = {
          card_not_recognized: "Card not recognized — is it registered below?",
          student_not_found: "Student record not found.",
          no_room_assigned: "This student has no default room/homeroom — assign one on the Children page first.",
          already_active: "This student already has an active session today.",
        };
        setResult(messages[outcome.error] ?? outcome.error);
      } else {
        setResult(outcome.action === "checked_in" ? `${outcome.childName} signed in.` : `${outcome.childName} signed out.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-semibold text-slate-700">Simulate a scan</p>
      <p className="text-xs text-slate-500">Type a registered card's UID to test sign-in/out without reader hardware.</p>
      <form onSubmit={simulate} className="flex items-center gap-2">
        <input
          value={cardUid}
          onChange={(e) => setCardUid(e.target.value)}
          placeholder="Card UID"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
        />
        <button
          disabled={busy || !cardUid.trim()}
          className="bg-brand-700 hover:bg-brand-800 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 shrink-0"
        >
          Simulate tap
        </button>
      </form>
      {result && <p className="text-xs text-slate-600">{result}</p>}
    </div>
  );
}

function RegisterCardForm({ children, onRegistered }: { children: Child[]; onRegistered: () => void }) {
  const [childId, setChildId] = useState("");
  const [cardUid, setCardUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminRegisterRfidCard(childId, cardUid.trim());
      setChildId("");
      setCardUid("");
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register card");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
      <p className="text-sm font-semibold text-slate-700">Register a card</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          required
          value={childId}
          onChange={(e) => setChildId(e.target.value)}
          className="flex-1 min-w-[10rem] rounded-lg border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">Select a student…</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </select>
        <input
          required
          value={cardUid}
          onChange={(e) => setCardUid(e.target.value)}
          placeholder="Card UID"
          className="flex-1 min-w-[8rem] rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
        />
        <button
          disabled={busy}
          className="bg-brand-700 hover:bg-brand-800 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          Register
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

export default function RfidCards() {
  const [cards, setCards] = useState<RfidCard[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    const [c, kids] = await Promise.all([listRfidCards(), listChildrenForAdmin()]);
    setCards(c);
    setChildren(kids);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(card: RfidCard) {
    setSavingId(card.id);
    try {
      const next = card.status === "active" ? "inactive" : "active";
      await adminSetRfidCardStatus(card.id, next);
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, status: next } : c)));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">RFID cards</h1>
        <p className="text-sm text-slate-500">
          For secondary students who move independently: a card tap signs them in or out on its own, with a
          notification sent to their guardian immediately — no code, no staff confirmation. This is separate from
          the check-in code flow used for younger children.
        </p>
      </div>

      <ScanSecretPanel />
      <RegisterCardForm children={children} onRegistered={load} />
      <SimulateScanPanel />

      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {cards.length === 0 && <p className="p-4 text-sm text-slate-400">No cards registered yet.</p>}
        {cards.map((card) => (
          <div key={card.id} className="p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{card.childName}</p>
              <p className="text-xs text-slate-400 font-mono">{card.cardUid}</p>
            </div>
            <span
              className={`text-xs font-semibold px-2 py-1 rounded-full ${
                card.status === "active" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {card.status}
            </span>
            <button
              disabled={savingId === card.id}
              onClick={() => toggleStatus(card)}
              className="text-xs font-medium text-brand-700 disabled:opacity-50 shrink-0"
            >
              {card.status === "active" ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
