import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../lib/types";

// Shown instead of the normal role dashboard once the developer/platform
// operator deactivates this user's church (see 0054_developer_role.sql —
// get_my_org_id() then returns null everywhere, so every RPC/RLS check
// already fails closed; this is purely the friendly explanation, not the
// enforcement itself). No Layout/nav — those links would all be dead ends.
function OrgDeactivatedScreen() {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center space-y-3">
        <h1 className="text-xl font-bold text-brand-900">Account deactivated</h1>
        <p className="text-sm text-slate-500">
          Your organization's Shmeera account has been deactivated. Please contact whoever manages your Shmeera
          deployment for details.
        </p>
        <button onClick={logout} className="text-sm text-brand-700 font-medium">
          Sign out
        </button>
      </div>
    </div>
  );
}

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.orgActive) return <OrgDeactivatedScreen />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// The developer/platform-operator flag is orthogonal to `role` (see
// 0054_developer_role.sql) — deliberately not gated by orgActive, since a
// developer needs access even if their own church happens to be
// deactivated (including by their own action).
export function RequireDeveloper({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isDeveloper) return <Navigate to="/" replace />;
  return <>{children}</>;
}
