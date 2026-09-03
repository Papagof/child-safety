import { supabase } from "./supabase";
import { getMyProfile, getMySessions, listAuditLogRpc, mapPickupPerson, updateMyPhoto } from "./rpc";
import type { AuditEntry, Child, Incident, PickupPerson, Room } from "./types";

// Plain RLS-gated table reads/writes for the non-safety-critical resources
// (rooms, children, pickup_people) — no RPC needed since Postgres RLS alone
// already enforces the right ownership/assignment rules (see
// supabase/migrations/0004_core_tables.sql).

// Admin-only: creates a staff login directly, bypassing self-signup + email
// confirmation. Requires the service-role key, so this runs as a Supabase
// Edge Function (supabase/functions/admin-create-staff/) — the browser client
// only ever forwards the admin's own JWT, which the function verifies itself.
export async function adminCreateStaff(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  roomIds?: string[];
  consentConfirmed: boolean;
  role?: "staff" | "admin";
}): Promise<{ id: string }> {
  const { data, error } = await supabase.functions.invoke("admin-create-staff", { body: input });
  if (error) {
    // supabase-js puts the function's own JSON error body on error.context
    // (a Response), not on `data`, for non-2xx responses.
    const context = (error as any).context;
    let bodyMessage: string | undefined;
    if (context && typeof context.json === "function") {
      try {
        const body = await context.json();
        bodyMessage = body?.error;
      } catch {
        // response body wasn't JSON — fall through to the generic error
      }
    }
    throw new Error(bodyMessage ?? error.message);
  }
  return data as { id: string };
}

export async function listRooms(): Promise<Room[]> {
  const { data, error } = await supabase.from("rooms").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, name: r.name, ageMin: r.age_min, ageMax: r.age_max, capacity: r.capacity, active: r.active,
  }));
}

export async function createRoom(input: { name: string; ageMin: number; ageMax: number; capacity: number }) {
  const { error } = await supabase.from("rooms").insert({
    name: input.name, age_min: input.ageMin, age_max: input.ageMax, capacity: input.capacity,
  });
  if (error) throw error;
}

export async function setRoomActive(id: string, active: boolean) {
  const { error } = await supabase.from("rooms").update({ active }).eq("id", id);
  if (error) throw error;
}

export async function updateRoom(id: string, fields: Partial<{ name: string; ageMin: number; ageMax: number; capacity: number }>) {
  const { error } = await supabase
    .from("rooms")
    .update({
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.ageMin !== undefined && { age_min: fields.ageMin }),
      ...(fields.ageMax !== undefined && { age_max: fields.ageMax }),
      ...(fields.capacity !== undefined && { capacity: fields.capacity }),
    })
    .eq("id", id);
  if (error) throw error;
}

// Archived (soft-deleted) children are excluded by default — see archiveChild().
export async function myChildren(): Promise<Child[]> {
  const { data, error } = await supabase.from("children").select("*").is("archived_at", null).order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapChild);
}

function mapChild(c: any): Child {
  const age = Math.floor((Date.now() - new Date(c.dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return {
    id: c.id, fullName: c.full_name, dob: c.dob, age,
    photoUrl: c.photo_url, medicalNotes: c.medical_notes, defaultRoomId: c.default_room_id,
    createdAt: c.created_at, archivedAt: c.archived_at,
  };
}

// Soft-delete (spec.md §6's "clear controls for a parent to... delete their
// child's data") — a hard delete would orphan session/audit history for a
// child who was actually checked in, breaking the non-negotiable audit trail.
export async function archiveChild(id: string) {
  const { error } = await supabase.from("children").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function createChild(input: { fullName: string; dob: string; medicalNotes?: string; defaultRoomId?: string }) {
  const { data: userData } = await supabase.auth.getUser();
  const guardianId = userData.user?.id;
  if (!guardianId) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("children")
    .insert({
      guardian_id: guardianId,
      full_name: input.fullName,
      dob: input.dob,
      medical_notes: input.medicalNotes ?? null,
      default_room_id: input.defaultRoomId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapChild(data);
}

export async function updateChild(id: string, fields: Partial<{ fullName: string; dob: string; medicalNotes: string; defaultRoomId: string }>) {
  const { data, error } = await supabase
    .from("children")
    .update({
      ...(fields.fullName !== undefined && { full_name: fields.fullName }),
      ...(fields.dob !== undefined && { dob: fields.dob }),
      ...(fields.medicalNotes !== undefined && { medical_notes: fields.medicalNotes }),
      ...(fields.defaultRoomId !== undefined && { default_room_id: fields.defaultRoomId }),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapChild(data);
}

export async function myPickupPeople(childId: string): Promise<PickupPerson[]> {
  const { data, error } = await supabase.from("pickup_people").select("*").eq("child_id", childId).order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapPickupPerson);
}

export async function addPickupPerson(childId: string, input: { fullName: string; relationship: string; idReference?: string }) {
  const { data: userData } = await supabase.auth.getUser();
  const addedBy = userData.user?.id;
  if (!addedBy) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("pickup_people")
    .insert({ child_id: childId, full_name: input.fullName, relationship: input.relationship, id_reference: input.idReference ?? null, added_by: addedBy })
    .select()
    .single();
  if (error) throw error;
  return mapPickupPerson(data);
}

// chat_threads is directly readable under RLS by its participants (see
// chat_threads_select_participant in 0006_audit_incidents_chat.sql) — used
// just to resolve the thread id for the realtime `thread:{id}` channel name,
// since get_thread_messages() (RPC) returns only the messages themselves.
export async function getThreadId(sessionId: string): Promise<string | null> {
  const { data, error } = await supabase.from("chat_threads").select("id").eq("session_id", sessionId).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

// --- admin: incidents / audit log (direct reads under admin RLS + real FK embeds) ---
export async function listIncidents(status?: "open" | "resolved"): Promise<Incident[]> {
  let query = supabase
    .from("incidents")
    .select("*, room:rooms(name), reporter:profiles!incidents_reported_by_fkey(full_name)")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((i: any) => ({
    id: i.id, sessionId: i.session_id, roomId: i.room_id, roomName: i.room?.name ?? null,
    type: i.type, description: i.description, reportedBy: i.reported_by, reportedByName: i.reporter?.full_name ?? null,
    status: i.status, resolvedBy: i.resolved_by, resolvedAt: i.resolved_at, createdAt: i.created_at,
  }));
}

// Delegates to the list_audit_log RPC (supabase/migrations/0023_list_audit_log.sql)
// rather than a direct .from('audit_log') read — sessions has zero direct
// grants, so a client-side join could never support the room/child filters
// spec.md §8 asks for ("search... for any child, date, or room").
export function listAuditLog(filters: {
  sessionId?: string;
  actorRole?: string;
  action?: string;
  from?: string;
  to?: string;
  roomId?: string;
  childId?: string;
} = {}): Promise<AuditEntry[]> {
  return listAuditLogRpc(filters);
}

// --- storage ----------------------------------------------------------------
const PHOTO_BUCKET = "photos";

async function uploadPhoto(path: string, file: File) {
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

export async function getSignedPhotoUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadChildPhoto(childId: string, file: File) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = await uploadPhoto(`children/${childId}/${crypto.randomUUID()}.${ext}`, file);
  const { error } = await supabase.from("children").update({ photo_url: path }).eq("id", childId);
  if (error) throw error;
  return path;
}

export async function uploadPickupPersonPhoto(pickupPersonId: string, file: File) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = await uploadPhoto(`pickup-people/${pickupPersonId}/${crypto.randomUUID()}.${ext}`, file);
  const { error } = await supabase.from("pickup_people").update({ photo_url: path }).eq("id", pickupPersonId);
  if (error) throw error;
  return path;
}

// Admin-only: children_select_admin (0004_core_tables.sql) grants admin a
// direct read on the whole table, used here for the audit log's child filter.
export async function searchChildrenForAdmin(query: string): Promise<{ id: string; fullName: string }[]> {
  const { data, error } = await supabase.from("children").select("id, full_name").ilike("full_name", `%${query}%`).limit(20);
  if (error) throw error;
  return (data ?? []).map((c: any) => ({ id: c.id, fullName: c.full_name }));
}

// Admin roster view: every active (non-archived) child in the org, with
// their guardian's name, for reassigning which room/class a child defaults
// to (admin_set_child_room RPC does the actual write — audited, org-checked).
export async function listChildrenForAdmin(): Promise<(Child & { guardianName: string })[]> {
  const { data, error } = await supabase
    .from("children")
    .select("*, profiles!children_guardian_id_fkey(full_name)")
    .is("archived_at", null)
    .order("full_name");
  if (error) throw error;
  return (data ?? []).map((c: any) => ({ ...mapChild(c), guardianName: c.profiles?.full_name ?? "—" }));
}

// Guardian data export (spec.md §6's "clear controls for a parent to view/
// export... their child's data") — pure client-side aggregation of reads the
// guardian already has, no new RPC needed. Triggers a browser download.
export async function exportMyData() {
  const [profile, children, sessions] = await Promise.all([getMyProfile(), myChildren(), getMySessions()]);
  const pickupPeopleByChild: Record<string, PickupPerson[]> = {};
  for (const child of children) {
    pickupPeopleByChild[child.id] = await myPickupPeople(child.id);
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    profile: profile?.user ?? null,
    children: children.map((c) => ({ ...c, pickupPeople: pickupPeopleByChild[c.id] ?? [] })),
    sessions,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shmeera-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function uploadMyPhoto(file: File) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not authenticated");
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = await uploadPhoto(`profiles/${uid}/${crypto.randomUUID()}.${ext}`, file);
  await updateMyPhoto(path);
  return path;
}
