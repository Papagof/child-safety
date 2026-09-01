import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err: any) {
      setError(err.message ?? "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center">
          <h1 className="text-xl font-bold text-brand-900 mb-2">Check your email</h1>
          <p className="text-sm text-slate-500">
            If an account exists for <span className="font-medium">{email}</span>, a password reset link is on its way.
          </p>
          <Link to="/login" className="inline-block mt-4 text-sm text-brand-700 font-medium">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h1 className="text-xl font-bold text-brand-900 mb-1">Reset your password</h1>
        <p className="text-sm text-slate-500 mb-6">We'll email you a link to set a new one.</p>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={busy}
            className="w-full bg-brand-700 hover:bg-brand-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <p className="text-sm text-slate-500 mt-4 text-center">
          <Link to="/login" className="text-brand-700 font-medium">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
