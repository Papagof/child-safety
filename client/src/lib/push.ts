import { supabase } from "./supabase";

// Requires client/.env's VITE_VAPID_PUBLIC_KEY (the public half of the pair
// send-push's Edge Function signs with) — see CLAUDE.md for the full Web
// Push setup checklist. Absent entirely in local dev unless that's set.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushSupport = "unsupported" | "denied" | "enabled";

export async function isPushSupported(): Promise<boolean> {
  return "serviceWorker" in navigator && "PushManager" in window && !!VAPID_PUBLIC_KEY;
}

export async function isPushEnabled(): Promise<boolean> {
  if (!(await isPushSupported())) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return !!subscription;
}

// Registers the service worker, asks for permission, subscribes, and stores
// the subscription server-side (RLS-gated to the caller — see
// 0053_push_subscriptions.sql). Safe to call again on a device that's
// already subscribed: getSubscription() returns the existing one instead of
// creating a duplicate, and the insert below just no-ops on the endpoint's
// unique-constraint conflict.
export async function enablePushNotifications(): Promise<PushSupport> {
  if (!(await isPushSupported())) return "unsupported";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const registration = await navigator.serviceWorker.register("/sw.js");
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId || !json.endpoint || !json.keys) return "denied";

  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
  if (error && error.code !== "23505") throw error; // 23505 = unique_violation, already subscribed

  return "enabled";
}
