import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth, type SignupMode } from "../context/AuthContext";

export default function Signup() {
  const { user, signup } = useAuth();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

  if (user) return <Navigate to="/" replace />;

  if (needsEmailConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center">
          <h1 className="text-xl font-bold text-brand-900 mb-2">Check your email</h1>
          <p className="text-sm text-slate-500">
            We sent a confirmation link to <span className="font-medium">{email}</span>. Click it, then come back and sign in.
          </p>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const modeArgs: SignupMode =
        tab === "create" ? { mode: "create", orgName } : { mode: "join", inviteCode, phone: phone || undefined };
      const result = await signup(email, password, fullName, consent, modeArgs);
      if (result.needsEmailConfirmation) setNeedsEmailConfirmation(true);
    } catch (err: any) {
      setError(err.message ?? "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h1 className="text-xl font-bold text-brand-900 mb-1">Create your account</h1>
        <p className="text-sm text-slate-500 mb-4">Staff accounts are set up by your ministry admin.</p>

        <div className="flex rounded-lg border border-slate-200 p-1 mb-4 text-sm font-medium">
          <button
            type="button"
            onClick={() => setTab("create")}
            className={`flex-1 rounded-md py-1.5 ${tab === "create" ? "bg-brand-700 text-white" : "text-slate-600"}`}
          >
            Start a new ministry
          </button>
          <button
            type="button"
            onClick={() => setTab("join")}
            className={`flex-1 rounded-md py-1.5 ${tab === "join" ? "bg-brand-700 text-white" : "text-slate-600"}`}
          >
            I have an invite code
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {tab === "create" ? (
            <div>
              <label className="text-sm font-medium text-slate-700">Ministry / church name</label>
              <input
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Grace Community Church"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <p className="text-xs text-slate-400 mt-1">You'll become this ministry's first admin.</p>
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium text-slate-700">Invite code</label>
              <input
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="From your ministry admin"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-slate-700">Full name</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
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
          {tab === "join" && (
            <div>
              <label className="text-sm font-medium text-slate-700">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I consent to Shmeera storing my information and, if I add any, my children's information (names, photos,
              medical/allergy notes, authorized pickup contacts) for the purpose of children's ministry check-in and
              safety.
            </span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={busy || !consent}
            className="w-full bg-brand-700 hover:bg-brand-800 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="text-sm text-slate-500 mt-4 text-center">
          Already have an account? <Link to="/login" className="text-brand-700 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
