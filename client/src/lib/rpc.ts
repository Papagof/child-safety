import { rpc } from "./supabase";
import type { AppNotification, AttendanceReportRow, AuditEntry, ChatMessage, Incident, PickupPerson, PickupTimeReport, IncidentsReportRow, Session, StaffAccount } from "./types";

// update_pickup_person returns the raw `pickup_people` row (snake_case
// columns) rather than a hand-built jsonb object like every other RPC —
// mapped here rather than in every call site.
function mapPickupPerson(row: any): PickupPerson {
  return {
    id: row.id,
    fullName: row.full_name,
    photoUrl: row.photo_url,
    relationship: row.relationship,
    idReference: row.id_reference,
    status: row.status,
    blockedReason: row.blocked_reason,
    createdAt: row.created_at,
  };
}

// --- auth / organizations -------------------------------------------------
// Self-serve org creation mints exactly one first admin; a guardian or staff
// member joins an EXISTING org only via an admin-shared invite code — there
// is no public directory of churches to browse.
export function createOrganization(name: string, fullName: string, consent: boolean) {
  return rpc<{ orgId: string; orgName: string }>("create_organization", { p_name: name, p_full_name: fullName, p_consent: consent });
}

export function joinOrganizationByInvite(inviteCode: string, fullName: string, consent: boolean, phone?: string) {
  return rpc<{ orgId: string; orgName: string }>("join_organization_by_invite", {
    p_invite_code: inviteCode,
    p_full_name: fullName,
    p_phone: phone ?? null,
    p_consent: consent,
  });
}

export function getInviteCode() {
  return rpc<string>("get_invite_code");
}

export function regenerateInviteCode() {
  return rpc<string>("regenerate_invite_code");
}

export interface MyProfile {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: "guardian" | "staff" | "admin";
    phone: string | null;
    photoUrl: string | null;
    orgId: string;
    orgName: string;
  };
  staff: {
    approvalStatus: "pending" | "approved" | "rejected";
    backgroundCheckStatus: "pending" | "confirmed";
    rooms: { id: string; name: string }[];
  } | null;
}

export function getMyProfile() {
  return rpc<MyProfile | null>("get_my_profile");
}

export function updateMyPhoto(photoUrl: string) {
  return rpc<void>("update_my_photo", { p_photo_url: photoUrl });
}

// --- sessions -------------------------------------------------------------
export function requestCheckin(childId: string, roomId: string) {
  return rpc<{ session: Session; code: string }>("request_checkin", { p_child_id: childId, p_room_id: roomId });
}

export function acceptCheckin(sessionId: string, code: string) {
  return rpc<{ session: Session } | { error: "code_mismatch" }>("accept_checkin", { p_session_id: sessionId, p_code: code });
}

export function declineCheckin(sessionId: string, reason?: string) {
  return rpc<{ session: Session }>("decline_checkin", { p_session_id: sessionId, p_reason: reason ?? null });
}

export function requestCheckout(sessionId: string, pickupPersonId?: string) {
  return rpc<{ session: Session; code: string } | { blocked: true; reason: string | null }>(
    "request_checkout",
    { p_session_id: sessionId, p_pickup_person_id: pickupPersonId ?? null }
  );
}

export function approveCheckout(sessionId: string, code: string) {
  return rpc<{ session: Session } | { error: "code_mismatch" }>("approve_checkout", { p_session_id: sessionId, p_code: code });
}

export function flagPickupMismatch(sessionId: string, description?: string) {
  return rpc<{ incidentId: string }>("flag_pickup_mismatch", { p_session_id: sessionId, p_description: description ?? null });
}

export function transferSession(sessionId: string, newRoomId: string) {
  return rpc<{ oldSession: Session; newSession: Session }>("transfer_session", { p_session_id: sessionId, p_new_room_id: newRoomId });
}

export function adminOverrideCheckout(sessionId: string, reason: string) {
  return rpc<{ session: Session }>("admin_override_checkout", { p_session_id: sessionId, p_reason: reason });
}

export function reportIncident(roomId: string, description: string) {
  return rpc<{ incidentId: string }>("report_incident", { p_room_id: roomId, p_description: description });
}

export function getMySessions() {
  return rpc<Session[]>("get_my_sessions");
}

export function getSession(id: string) {
  return rpc<Session>("get_session", { p_id: id });
}

export function getRoomSessions(roomId: string) {
  return rpc<Session[]>("get_room_sessions", { p_room_id: roomId });
}

export function listSessions(filters: { date?: string; roomId?: string; status?: string; childId?: string } = {}) {
  return rpc<Session[]>("list_sessions", {
    p_date: filters.date ?? null,
    p_room_id: filters.roomId ?? null,
    p_status: filters.status ?? null,
    p_child_id: filters.childId ?? null,
  });
}

export function getLiveSessions() {
  return rpc<Session[]>("get_live_sessions");
}

export function getLiveCounts() {
  return rpc<Record<string, number>>("get_live_counts");
}

// --- chat -------------------------------------------------------------
export function getThreadMessages(sessionId: string) {
  return rpc<ChatMessage[]>("get_thread_messages", { p_session_id: sessionId });
}

export function postChatMessage(sessionId: string, body: string, urgent = false) {
  return rpc<ChatMessage>("post_chat_message", { p_session_id: sessionId, p_body: body, p_urgent: urgent });
}

export function markThreadRead(sessionId: string) {
  return rpc<void>("mark_thread_read", { p_session_id: sessionId });
}

// --- pickup people --------------------------------------------------------
export async function updatePickupPerson(
  id: string,
  fields: Partial<{ fullName: string; relationship: string; idReference: string; photoUrl: string; status: string; blockedReason: string }>
) {
  const row = await rpc<any>("update_pickup_person", {
    p_id: id,
    p_full_name: fields.fullName ?? null,
    p_relationship: fields.relationship ?? null,
    p_id_reference: fields.idReference ?? null,
    p_photo_url: fields.photoUrl ?? null,
    p_status: fields.status ?? null,
    p_blocked_reason: fields.blockedReason ?? null,
  });
  return mapPickupPerson(row);
}

// --- incidents -------------------------------------------------------------
export function resolveIncident(id: string) {
  return rpc<{ alreadyResolved: true } | { incident: Partial<Incident> }>("resolve_incident", { p_id: id });
}

// --- staff admin -------------------------------------------------------------
export function listStaffAccounts() {
  return rpc<StaffAccount[]>("list_staff_accounts");
}

export function approveStaff(userId: string) {
  return rpc<void>("approve_staff", { p_user_id: userId });
}

export function rejectStaff(userId: string) {
  return rpc<void>("reject_staff", { p_user_id: userId });
}

export function setBackgroundCheckStatus(userId: string, status: "pending" | "confirmed") {
  return rpc<void>("set_background_check_status", { p_user_id: userId, p_status: status });
}

export function setStaffRooms(userId: string, roomIds: string[]) {
  return rpc<void>("set_staff_rooms", { p_user_id: userId, p_room_ids: roomIds });
}

// --- audit log (admin) -------------------------------------------------------------
export function listAuditLogRpc(filters: {
  sessionId?: string;
  actorRole?: string;
  action?: string;
  from?: string;
  to?: string;
  roomId?: string;
  childId?: string;
} = {}) {
  return rpc<AuditEntry[]>("list_audit_log", {
    p_session_id: filters.sessionId ?? null,
    p_actor_role: filters.actorRole ?? null,
    p_action: filters.action ?? null,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
    p_room_id: filters.roomId ?? null,
    p_child_id: filters.childId ?? null,
  });
}

// --- reporting (admin) -------------------------------------------------------------
export function getAttendanceReport(from: string, to: string) {
  return rpc<AttendanceReportRow[]>("get_attendance_report", { p_from: from, p_to: to });
}

export function getPickupTimeReport(from: string, to: string) {
  return rpc<PickupTimeReport>("get_pickup_time_report", { p_from: from, p_to: to });
}

export function getIncidentsReport(from: string, to: string) {
  return rpc<IncidentsReportRow[]>("get_incidents_report", { p_from: from, p_to: to });
}

// --- data retention (admin) -------------------------------------------------------------
export interface PurgeResult {
  sessionsDeleted: number;
  auditLogDeleted: number;
  incidentsDeleted: number;
  chatMessagesDeleted: number;
  chatThreadsDeleted: number;
}

export function purgeOldRecords(before: string) {
  return rpc<PurgeResult>("purge_old_records", { p_before: before });
}

// --- notifications -------------------------------------------------------------
export function listNotifications(limit = 50) {
  return rpc<AppNotification[]>("list_notifications", { p_limit: limit });
}

export function getUnreadNotificationCount() {
  return rpc<number>("get_unread_notification_count");
}

export function markNotificationRead(id: string) {
  return rpc<void>("mark_notification_read", { p_id: id });
}

export function markAllNotificationsRead() {
  return rpc<void>("mark_all_notifications_read");
}
