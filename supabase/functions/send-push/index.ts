import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Fires OS-level push for a new row in public.notifications, closing the
// spec.md §9 gap that the notification inbox (0029_notifications.sql) left:
// that inbox only ever surfaced once the app was reopened. Invoked by a
// Database Webhook (Studio: Database -> Webhooks) on notifications' AFTER
// INSERT — not a plain RPC, since only Postgres itself decides when a
// notification is created, and generating/signing a Web Push payload needs
// real crypto libraries that don't exist in PL/pgSQL.
//
// No end-user ever calls this directly, so it isn't verified against a JWT
// (deploy with --no-verify-jwt) — instead it checks a shared secret header
// the webhook is configured to send, so the URL alone (guessed or leaked)
// can't be used to push arbitrary notifications to an arbitrary user.

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (WEBHOOK_SECRET && req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const notification = payload?.record;
  if (!notification?.user_id) return new Response("ok", { status: 200 });

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", notification.user_id);

  if (!subs?.length) return new Response("ok", { status: 200 });

  const body = JSON.stringify({
    title: notification.title,
    body: notification.body ?? "",
    notificationId: notification.id,
    sessionId: notification.session_id,
    type: notification.type,
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
      } catch (err: any) {
        // 404/410 = the browser/OS dropped this subscription (uninstalled,
        // permissions revoked, etc.) — stop trying it going forward.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );

  return new Response("ok", { status: 200 });
});
