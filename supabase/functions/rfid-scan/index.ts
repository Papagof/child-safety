import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Entry point for a physical RFID reader (no hardware integrated yet — this
// is the software side ready for whenever one is). A reader has no Supabase
// Auth session, so it authenticates with a per-organization secret (Studio:
// Admin → generate/regenerate under "RFID scan secret") sent as a header,
// never a URL param — a leaked/guessed secret only ever exposes the one
// org whose reader it was issued to. That secret resolves which org this
// scan belongs to; the actual sign-in/out logic then lives in
// record_rfid_scan_internal (security definer, granted to service_role
// only), which this function calls over the service-role connection so the
// secret check here is the only gate — the RPC itself can't be reached
// directly by a browser to bypass it.
//
// A student's own card tap is deliberately NOT a second-person confirmation
// the way check-in/pickup codes are elsewhere in this app — that's the
// point for secondary students who move independently. See
// 0057_rfid_attendance.sql for the full reasoning.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-rfid-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
    }

    const secret = req.headers.get("x-rfid-secret");
    if (!secret) {
      return new Response(JSON.stringify({ error: "Missing x-rfid-secret header" }), { status: 401, headers: jsonHeaders });
    }

    const body = await req.json();
    const { cardUid } = body ?? {};
    if (!cardUid || typeof cardUid !== "string") {
      return new Response(JSON.stringify({ error: "cardUid is required" }), { status: 400, headers: jsonHeaders });
    }

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("rfid_scan_secret", secret)
      .single();
    if (orgErr || !org) {
      return new Response(JSON.stringify({ error: "Invalid reader secret" }), { status: 401, headers: jsonHeaders });
    }

    const { data: result, error: rpcErr } = await supabase.rpc("record_rfid_scan_internal", {
      p_org_id: org.id,
      p_card_uid: cardUid,
    });
    if (rpcErr) {
      return new Response(JSON.stringify({ error: rpcErr.message }), { status: 400, headers: jsonHeaders });
    }

    return new Response(JSON.stringify(result), { status: 200, headers: jsonHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: jsonHeaders });
  }
});
