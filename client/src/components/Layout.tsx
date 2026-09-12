import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import type { ReactNode } from "react";

export function Layout({ links, children }: { links: { to: string; label: string }[]; children: ReactNode }) {
  const { user, logout } = useAuth();
  // Orthogonal to role (see 0054_developer_role.sql) — added here, once,
  // rather than to every LINKS constant/route in App.tsx, so it shows up no
  // matter which role's dashboard a developer is currently viewing.
  const allLinks = user?.isDeveloper ? [...links, { to: "/developer", label: "Platform" }] : links;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-900 text-white">
        <div className="max-w-5xl mx-auto px-4 pt-3 flex items-center justify-between gap-3">
          <div className="leading-tight min-w-0">
            <span className="font-bold text-lg tracking-tight block">Shmeera</span>
            {user?.orgName && <span className="text-xs text-brand-200 block truncate">{user.orgName}</span>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <NotificationBell />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium leading-tight">{user?.fullName}</p>
              <p className="text-xs text-brand-200 leading-tight capitalize">{user?.role}</p>
            </div>
            <Avatar src={user?.photoUrl} name={user?.fullName ?? "?"} size={36} />
            <button
              onClick={logout}
              className="text-sm text-brand-100 hover:text-white border border-white/20 rounded-lg px-3 py-1.5"
            >
              Log out
            </button>
          </div>
        </div>
        {/* Its own row, full-width — never competes with the branding/actions
            row above for space, so a single link (staff) sits fully visible
            and several links (admin) get a dedicated horizontal-scroll area
            instead of being squeezed by whatever else is in the header. */}
        <nav className="max-w-5xl mx-auto px-4 pb-3 pt-2 flex gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {allLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
