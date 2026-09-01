import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Admin-only: creates a staff login directly (bypassing self-signup + email
// confirmation, which is what an admin uses this for in the first place).
// Requires the service-role key, so this can only run server-side — never
// exposed to the browser client. Immediately approved per the product
// decision: admin is vouching for this person directly, no separate
// approval step needed afterward.

// Edge Functions don't handle CORS automatically — the browser preflights
// every cross-origin POST with an OPTIONS request, and without these headers
// on both the preflight and the real response, the fetch never completes
// (surfaces client-side as "Failed to send a request to the Edge Function",
// not as any 4xx/5xx from the function itself).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // Verify the caller is a real, currently-admin user using their OWN JWT
    // (never trust a client-supplied role claim).
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdminResult, error: isAdminErr } = await callerClient.rpc("is_admin");
    if (isAdminErr || !isAdminResult) {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: jsonHeaders });
    }
    const { data: callerData } = await callerClient.auth.getUser();
    const adminId = callerData.user?.id;

    // The caller's own org — this uses the service-role client for every
    // other write below (which bypasses RLS entirely), so org membership
    // must be enforced here in code, not left to a policy.
    const { data: orgId, error: orgErr } = await callerClient.rpc("get_my_org_id");
    if (orgErr || !orgId) {
      return new Response(JSON.stringify({ error: "Could not determine your organization" }), { status: 400, headers: jsonHeaders });
    }

    const body = await req.json();
    const { email, password, fullName, phone, roomIds, consentConfirmed, role } = body ?? {};
    const targetRole = role === "admin" ? "admin" : "staff";

    if (!email || !password || !fullName || !consentConfirmed) {
      return new Response(
        JSON.stringify({ error: "email, password, fullName, and consentConfirmed are required" }),
        { status: 400, headers: jsonHeaders }
      );
    }
    if (typeof password !== "string" || password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: jsonHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // A fellow admin has no room assignments at all — only validate roomIds
    // for a staff account, and only against rooms in the caller's own org.
    if (targetRole === "staff" && Array.isArray(roomIds) && roomIds.length > 0) {
      const { data: validRooms, error: roomsCheckErr } = await adminClient
        .from("rooms")
        .select("id")
        .eq("org_id", orgId)
        .in("id", roomIds);
      if (roomsCheckErr || !validRooms || validRooms.length !== roomIds.length) {
        return new Response(JSON.stringify({ error: "One or more rooms not found" }), { status: 400, headers: jsonHeaders });
      }
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? "Could not create user" }), { status: 400, headers: jsonHeaders });
    }
    const newUserId = created.user.id;

    const { error: profileErr } = await adminClient.from("profiles").insert({
      id: newUserId,
      role: targetRole,
      full_name: fullName,
      phone: phone || null,
      org_id: orgId,
      consent_at: new Date().toISOString(),
    });
    if (profileErr) {
      await adminClient.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: profileErr.message }), { status: 400, headers: jsonHeaders });
    }

    if (targetRole === "staff") {
      const { error: staffDetailsErr } = await adminClient.from("staff_details").insert({
        user_id: newUserId,
        approval_status: "approved",
        background_check_status: "pending",
      });
      if (staffDetailsErr) {
        await adminClient.auth.admin.deleteUser(newUserId);
        return new Response(JSON.stringify({ error: staffDetailsErr.message }), { status: 400, headers: jsonHeaders });
      }

      if (Array.isArray(roomIds) && roomIds.length > 0) {
        const rows = roomIds.map((roomId: string) => ({ staff_id: newUserId, room_id: roomId }));
        const { error: roomsErr } = await adminClient.from("staff_rooms").insert(rows);
        if (roomsErr) {
          await adminClient.auth.admin.deleteUser(newUserId);
          return new Response(JSON.stringify({ error: roomsErr.message }), { status: 400, headers: jsonHeaders });
        }
      }
    }

    await adminClient.from("audit_log").insert({
      actor_id: adminId ?? null,
      actor_role: "admin",
      action: targetRole === "admin" ? "admin_created_by_admin" : "staff_created_by_admin",
      details: { userId: newUserId, email, roomIds: roomIds ?? [] },
    });

    return new Response(JSON.stringify({ id: newUserId }), { status: 200, headers: jsonHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: jsonHeaders });
  }
});
