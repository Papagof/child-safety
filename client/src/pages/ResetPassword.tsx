import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

// Reached by clicking the emailed reset link, which lands here already
// signed into a short-lived recovery session (supabase-js parses it from the
// URL automatically). Deliberately NOT gated by RequireRole/user-redirect —
// the whole point is to act while "logged in" via that recovery session,
// before the user has a usable password again.
export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? "ready" : "invalid");
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setStatus("ready");
    });
    return () => subscription.unsubscribe();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await updatePassword(password);
      setDone(true);
      setTimeout(() => navigate("/"), 1500);
    } catch (err: any) {
      setError(err.message ?? "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center">
          <h1 className="text-xl font-bold text-brand-900 mb-2">Password updated</h1>
          <p className="text-sm text-slate-500">Redirecting…</p>
        </div>
      </div>
    );
  }

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <p className="text-sm text-slate-400">Checking your link…</p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center">
          <h1 className="text-xl font-bold text-brand-900 mb-2">Invalid or expired link</h1>
          <p className="text-sm text-slate-500 mb-4">Request a new password reset link and try again.</p>
          <Link to="/forgot-password" className="text-sm text-brand-700 font-medium">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h1 className="text-xl font-bold text-brand-900 mb-1">Set a new password</h1>
        <form onSubmit={onSubmit} className="space-y-3 mt-4">
          <div>
            <label className="text-sm font-medium text-slate-700">New password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={busy}
            className="w-full bg-brand-700 hover:bg-brand-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
