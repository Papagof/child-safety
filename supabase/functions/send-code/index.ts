import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Admin-triggered resend of an in-progress check-in/pickup code straight to
// the guardian's own phone (Twilio SMS) and/or email (Resend) — for when the
// guardian isn't looking at the app (phone locked, noisy pickup line, etc.).
// The two-sided confirmation model is unchanged: this only re-delivers a
// code that request_checkin/request_checkout already generated, through the
// exact same accept_checkin/approve_checkout RPC staff use to redeem it. The
// code itself never reaches the admin's own browser — get_session_code_for_
// notify (security definer, checks is_admin() + org match) fetches it
// server-side, and this function only ever returns per-channel
// success/failure to the client.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");

type ChannelResult = { sent: boolean; error?: string };

async function sendSms(to: string, body: string): Promise<ChannelResult> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return { sent: false, error: "SMS is not configured on the server" };
  }
  const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    return { sent: false, error: err?.message ?? `Twilio error (${res.status})` };
  }
  return { sent: true };
}

async function sendEmail(to: string, subject: string, text: string): Promise<ChannelResult> {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return { sent: false, error: "Email is not configured on the server" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to, subject, text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    return { sent: false, error: err?.message ?? `Resend error (${res.status})` };
  }
  return { sent: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: jsonHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller using their OWN JWT (never trust a client-supplied
    // role claim) — is_admin() + org-match against the session are enforced
    // inside get_session_code_for_notify itself below.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData } = await callerClient.auth.getUser();
    const adminId = callerData.user?.id;
    if (!adminId) {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 401, headers: jsonHeaders });
    }

    const body = await req.json();
    const { sessionId, channels } = body ?? {};
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "sessionId is required" }), { status: 400, headers: jsonHeaders });
    }
    const wantSms = !Array.isArray(channels) || channels.includes("sms");
    const wantEmail = !Array.isArray(channels) || channels.includes("email");

    const { data: info, error: infoErr } = await callerClient.rpc("get_session_code_for_notify", {
      p_session_id: sessionId,
    });
    if (infoErr || !info) {
      return new Response(JSON.stringify({ error: infoErr?.message ?? "Could not load session" }), { status: 400, headers: jsonHeaders });
    }

    const { code, codeType, guardianId, guardianPhone, childFullName } = info as {
      code: string;
      codeType: "checkin" | "checkout";
      guardianId: string;
      guardianPhone: string | null;
      childFullName: string;
    };

    // profiles has no email column (auth-owned) — only the service-role
    // client can look it up, via the guardian id the RPC above already
    // verified belongs to this admin's own org.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: guardianUser } = await adminClient.auth.admin.getUserById(guardianId);
    const guardianEmail = guardianUser?.user?.email ?? null;

    const action = codeType === "checkin" ? "check-in" : "pickup";
    const message = `Shmeera: ${childFullName}'s ${action} code is ${code}. Enter this at the ${action} desk.`;

    const result: { sms?: ChannelResult; email?: ChannelResult } = {};

    if (wantSms) {
      result.sms = guardianPhone
        ? await sendSms(guardianPhone, message)
        : { sent: false, error: "No phone number on file for this guardian" };
    }

    if (wantEmail) {
      result.email = guardianEmail
        ? await sendEmail(guardianEmail, `Your ${action} code for ${childFullName}`, message)
        : { sent: false, error: "No email on file for this guardian" };
    }

    await adminClient.from("audit_log").insert({
      session_id: sessionId,
      actor_id: adminId,
      actor_role: "admin",
      action: "code_sent_externally",
      details: { codeType, result },
    });

    return new Response(JSON.stringify(result), { status: 200, headers: jsonHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: jsonHeaders });
  }
});
