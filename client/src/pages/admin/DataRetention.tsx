import { useState } from "react";
import { purgeOldRecords, type PurgeResult } from "../../lib/rpc";

function defaultBefore() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export default function DataRetention() {
  const [before, setBefore] = useState(defaultBefore());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PurgeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runPurge() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await purgeOldRecords(before);
      setResult(r);
      setConfirming(false);
    } catch (err: any) {
      setError(err.message ?? "Purge failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Data retention</h1>
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <p className="text-sm text-slate-500">
          Permanently deletes session records (and their chat messages, chat threads, audit-log entries, and
          incidents) for sessions that finished — checked out, declined, or transferred — before the date below.
          <span className="font-medium text-slate-700"> Active sessions are never affected regardless of date.</span>
        </p>
        <div>
          <label className="text-sm font-medium text-slate-700">Purge records before</label>
          <input
            type="date"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && (
          <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3">
            Purged {result.sessionsDeleted} session(s), {result.chatThreadsDeleted} chat thread(s),{" "}
            {result.chatMessagesDeleted} chat message(s), {result.auditLogDeleted} audit-log entr
            {result.auditLogDeleted === 1 ? "y" : "ies"}, {result.incidentsDeleted} incident(s).
          </div>
        )}

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg py-2.5 text-sm font-semibold"
          >
            Purge records before {before}…
          </button>
        ) : (
          <div className="border border-red-300 bg-red-50 rounded-lg p-3 space-y-2">
            <p className="text-sm font-semibold text-red-800">This permanently deletes data and cannot be undone.</p>
            <p className="text-sm text-red-700">Type the date ({before}) to confirm, then purge.</p>
            <ConfirmDateInput expected={before} onConfirmed={runPurge} busy={busy} onCancel={() => setConfirming(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmDateInput({
  expected,
  onConfirmed,
  onCancel,
  busy,
}: {
  expected: string;
  onConfirmed: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={expected}
        className="flex-1 rounded-lg border border-red-300 px-3 py-1.5 text-sm"
      />
      <button
        disabled={value !== expected || busy}
        onClick={onConfirmed}
        className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Purging…" : "Confirm purge"}
      </button>
      <button onClick={onCancel} className="text-sm text-slate-500 px-2">
        Cancel
      </button>
    </div>
  );
}
