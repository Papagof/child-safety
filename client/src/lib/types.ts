export type Role = "guardian" | "staff" | "admin";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  photoUrl?: string | null;
  phone?: string | null;
  orgId: string;
  orgName: string;
}

export interface Room {
  id: string;
  name: string;
  ageMin: number;
  ageMax: number;
  capacity: number;
  active: boolean;
}

export interface Child {
  id: string;
  fullName: string;
  dob: string;
  age: number;
  photoUrl: string | null;
  medicalNotes: string | null;
  defaultRoomId: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export type PickupStatus = "active" | "inactive" | "blocked";

export interface PickupPerson {
  id: string;
  fullName: string;
  photoUrl: string | null;
  relationship: string;
  idReference: string | null;
  status: PickupStatus;
  blockedReason: string | null;
  createdAt: string;
}

export type SessionStatus = "pending_checkin" | "checked_in" | "declined" | "pending_checkout" | "checked_out" | "transferred";

export interface ChildSnapshot {
  id: string;
  fullName: string;
  dob: string;
  age: number;
  photoUrl: string | null;
  medicalNotes: string | null;
  guardianId: string;
  guardianName: string;
  guardianPhone: string | null;
  guardianPhotoUrl: string | null;
}

export interface Requester {
  type: "guardian" | "pickup_person";
  id: string;
  fullName: string;
  photoUrl: string | null;
  relationship: string;
  phone?: string | null;
  status?: PickupStatus;
}

export interface Session {
  id: string;
  status: SessionStatus;
  roomId: string;
  serviceDate: string;
  child: ChildSnapshot;
  checkinRequestedAt: string;
  checkinAcceptedAt: string | null;
  checkinCodeExpiresAt: string;
  checkinDeclineReason: string | null;
  checkinStaffName: string | null;
  checkoutRequestedAt: string | null;
  checkoutCodeExpiresAt: string | null;
  checkoutApprovedAt: string | null;
  checkoutStaffName: string | null;
  requester: Requester | null;
  isTransfer: boolean;
  transferredFromSessionId: string | null;
  // Only ever populated by an RPC response when the caller is the verified
  // owning guardian (get_my_sessions/get_session/request_checkin/request_checkout) —
  // absent from every staff/admin-facing read (see session_payload() in
  // supabase/migrations/0009_rpc_sessions.sql).
  checkinCode?: string;
  checkoutCode?: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: Role;
  body: string;
  urgent: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface Incident {
  id: string;
  sessionId: string | null;
  roomId: string | null;
  roomName: string | null;
  type: "failed_pickup" | "urgent_escalation" | "other";
  description: string | null;
  reportedBy: string | null;
  reportedByName: string | null;
  status: "open" | "resolved";
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  sessionId: string | null;
  actorId: string;
  actorName: string | null;
  actorRole: Role;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AttendanceReportRow {
  date: string;
  roomId: string;
  roomName: string;
  count: number;
}

export interface PickupTimeReport {
  overallAvgMinutes: number | null;
  byRoom: { roomId: string; roomName: string; avgMinutes: number | null; count: number }[];
}

export interface IncidentsReportRow {
  date: string;
  type: Incident["type"];
  count: number;
}

export interface AppNotification {
  id: string;
  sessionId: string | null;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface StaffAccount {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
  backgroundCheckStatus: "pending" | "confirmed";
  appliedAt: string;
  roomIds: string[];
}
