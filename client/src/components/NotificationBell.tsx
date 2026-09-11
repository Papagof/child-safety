import { useEffect, useRef, useState } from "react";
import { acceptCheckin, approveCheckout, declineCheckin, listNotifications, markAllNotificationsRead, markNotificationRead } from "../lib/rpc";
import { useAuth } from "../context/AuthContext";
import { useChannel } from "../lib/useRealtime";
import { RpcError } from "../lib/supabase";
import { parseScannedCode, QRScanner } from "./QRScanner";
import { enablePushNotifications, isPushEnabled, isPushSupported } from "../lib/push";
import type { AppNotification } from "../lib/types";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Lets staff act on a check-in/pickup request right from the notification —
// still requires asking whoever is there for the code and typing it in, the
// same as the dashboard flow. This is a shortcut to that action, never a way
// to skip it: the code is never included in the notification itself (see
// notify_room_staff/notify_org_admins — only a description, no code), and
// admins get the identical notification with no action controls at all,
// since only staff assigned to the room can call accept_checkin/approve_checkout.
function NotificationActions({ n, onActed }: { n: AppNotification; onActed: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "declined" | "approved" | null>(null);
  const [scanning, setScanning] = useState(false);

  if (done) {
    const label = done === "accepted" ? "Checked in" : done === "approved" ? "Pickup confirmed" : "Declined";
    return <p className="text-xs text-emerald-700 font-medium mt-1.5">{label} ✓</p>;
  }

  async function run(action: () => Promise<{ error?: string } | unknown>, onSuccess: "accepted" | "declined" | "approved") {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result && typeof result === "object" && (result as any).error === "code_mismatch") {
        setError("Code does not match — please try again.");
        return;
      }
      setDone(onSuccess);
      onActed();
    } catch (err) {
      setError(err instanceof RpcError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function handleDetect(value: string) {
    setScanning(false);
    const parsed = parseScannedCode(value);
    if (!parsed) {
      setError("That doesn't look like a Shmeera code — try again or type it manually.");
      return;
    }
    if (parsed.sessionId !== n.sessionId) {
      setError("That QR is for a different child's session — try again.");
      return;
    }
    setError(null);
    setCode(parsed.code);
    n.type === "checkout_requested"
      ? run(() => approveCheckout(n.sessionId!, parsed.code), "approved")
      : run(() => acceptCheckin(n.sessionId!, parsed.code), "accepted");
  }

  return (
    <div className="mt-1.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-1.5">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={n.type === "checkout_requested" ? "Pickup code" : "Check-in code"}
          className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-xs font-mono tracking-widest uppercase"
        />
        <button
          disabled={busy}
          onClick={() => setScanning(true)}
          title="Scan QR instead"
          aria-label="Scan QR instead"
          className="shrink-0 border border-slate-300 rounded px-1.5 text-slate-500"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M4 4h6v6H4V4Zm2 2v2h2V6H6ZM4 14h6v6H4v-6Zm2 2v2h2v-2H6Zm8-12h6v6h-6V4Zm2 2v2h2V6h-2ZM14 14h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-4 4h2v2h-2v-2Zm4 0h2v2h-2v-2Z" />
          </svg>
        </button>
        <button
          disabled={busy || !code}
          onClick={() =>
            n.type === "checkout_requested"
              ? run(() => approveCheckout(n.sessionId!, code), "approved")
              : run(() => acceptCheckin(n.sessionId!, code), "accepted")
          }
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded px-2 py-1 disabled:opacity-50 shrink-0"
        >
          {n.type === "checkout_requested" ? "Confirm" : "Accept"}
        </button>
      </div>
      {scanning && <QRScanner onClose={() => setScanning(false)} onDetect={handleDetect} />}
      {n.type === "checkin_requested" && (
        <button
          disabled={busy}
          onClick={() => {
            const reason = window.prompt("Reason for declining (optional):") ?? "";
            run(() => declineCheckin(n.sessionId!, reason), "declined");
          }}
          className="text-xs text-red-600 font-medium"
        >
          Decline
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// Shown while this device hasn't opted into Web Push yet — a shortcut to
// enablePushNotifications() (lib/push.ts), never a requirement: the in-app
// inbox above still works with no push at all, this only adds an OS-level
// alert while the app/tab is closed. Hidden entirely on an unsupported
// browser or once already enabled, so it only ever appears when it's
// actually actionable.
function PushBanner() {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<"idle" | "busy" | "denied" | "enabled">("idle");

  useEffect(() => {
    (async () => {
      if ((await isPushSupported()) && !(await isPushEnabled())) setVisible(true);
    })();
  }, []);

  if (!visible || status === "enabled") return null;

  return (
    <div className="px-3 py-2 border-b border-slate-100 bg-brand-50 text-xs text-brand-800 flex items-center justify-between gap-2">
      {status === "denied" ? (
        <span>Notifications blocked — enable them in your browser's site settings.</span>
      ) : (
        <>
          <span>Get notified even when the app is closed.</span>
          <button
            disabled={status === "busy"}
            onClick={async () => {
              setStatus("busy");
              try {
                const result = await enablePushNotifications();
                setStatus(result === "enabled" ? "enabled" : result === "denied" ? "denied" : "idle");
              } catch {
                setStatus("idle");
              }
            }}
            className="font-semibold text-brand-700 shrink-0 disabled:opacity-50"
          >
            {status === "busy" ? "Enabling…" : "Enable"}
          </button>
        </>
      )}
    </div>
  );
}

export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [dropdownTop, setDropdownTop] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  async function load() {
    setNotifications(await listNotifications());
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useChannel(user ? `notifications:${user.id}` : null, () => load());

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!user) return null;

  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const isActionable = (n: AppNotification) =>
    user.role === "staff" && n.sessionId && (n.type === "checkin_requested" || n.type === "checkout_requested");

  async function onOpenNotification(n: AppNotification) {
    if (!n.readAt) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      await markNotificationRead(n.id);
    }
    if (isActionable(n)) setExpandedId((prev) => (prev === n.id ? null : n.id));
  }

  async function onMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    await markAllNotificationsRead();
  }

  // Anchored to the viewport (fixed + a measured top), not to this button's
  // own bounding box (absolute + right-0) — the bell isn't the last item in
  // the header's right-side group (avatar/logout come after it), so
  // anchoring the dropdown's right edge to the bell's own edge pushed it
  // left of the true screen edge on a narrow phone. Pinning it to the
  // viewport's right margin instead keeps it on-screen regardless of where
  // the bell sits in the row.
  function toggleOpen() {
    if (!open && buttonRef.current) {
      setDropdownTop(buttonRef.current.getBoundingClientRect().bottom + 8);
    }
    setOpen((v) => !v);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        aria-label="Notifications"
        className="relative text-brand-100 hover:text-white border border-white/20 rounded-lg p-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 0 0-3 0v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2Z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{ top: dropdownTop }}
          className="fixed right-4 w-80 max-w-[calc(100vw-2rem)] max-h-96 overflow-y-auto bg-white text-slate-800 border border-slate-200 rounded-xl shadow-lg z-50"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={onMarkAllRead} className="text-xs text-brand-700 font-medium">
                Mark all read
              </button>
            )}
          </div>
          <PushBanner />
          {notifications.length === 0 ? (
            <p className="text-sm text-slate-400 px-3 py-6 text-center">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => onOpenNotification(n)}
                className={`w-full text-left px-3 py-2.5 border-b border-slate-50 last:border-0 cursor-pointer ${
                  n.readAt ? "bg-white" : "bg-brand-50"
                }`}
              >
                <p className="text-sm font-medium text-slate-800">{n.title}</p>
                {n.body && <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>}
                <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                {expandedId === n.id && isActionable(n) && <NotificationActions n={n} onActed={load} />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
