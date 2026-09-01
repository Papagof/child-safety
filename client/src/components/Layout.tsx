import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import type { ReactNode } from "react";

export function Layout({ links, children }: { links: { to: string; label: string }[]; children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-900 text-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="leading-tight">
              <span className="font-bold text-lg tracking-tight block">Shmeera</span>
              {user?.orgName && <span className="text-xs text-brand-200 block">{user.orgName}</span>}
            </div>
            <nav className="flex gap-1">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      isActive ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10"
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
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
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
