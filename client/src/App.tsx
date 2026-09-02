import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useIdleLock } from "./lib/useIdleLock";
import { RequireRole } from "./components/RequireRole";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import GuardianDashboard from "./pages/guardian/GuardianDashboard";
import ChildrenSetup from "./pages/guardian/ChildrenSetup";
import CheckIn from "./pages/guardian/CheckIn";
import BulkCheckIn from "./pages/guardian/BulkCheckIn";
import BulkPickup from "./pages/guardian/BulkPickup";
import SessionStatus from "./pages/guardian/SessionStatus";
import History from "./pages/guardian/History";
import StaffDashboard from "./pages/staff/StaffDashboard";
import StaffApprovals from "./pages/admin/StaffApprovals";
import Children from "./pages/admin/Children";
import Rooms from "./pages/admin/Rooms";
import LiveDashboard from "./pages/admin/LiveDashboard";
import AuditLog from "./pages/admin/AuditLog";
import Incidents from "./pages/admin/Incidents";
import Reports from "./pages/admin/Reports";
import DataRetention from "./pages/admin/DataRetention";

const GUARDIAN_LINKS = [
  { to: "/guardian", label: "Dashboard" },
  { to: "/guardian/children", label: "Children" },
  { to: "/guardian/history", label: "History" },
];

const STAFF_LINKS = [{ to: "/staff", label: "Room dashboard" }];

const ADMIN_LINKS = [
  { to: "/admin/live", label: "Live dashboard" },
  { to: "/admin/staff", label: "Staff" },
  { to: "/admin/children", label: "Children" },
  { to: "/admin/rooms", label: "Rooms" },
  { to: "/admin/incidents", label: "Incidents" },
  { to: "/admin/audit", label: "Audit log" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/retention", label: "Data retention" },
];

function RoleRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "guardian") return <Navigate to="/guardian" replace />;
  if (user.role === "staff") return <Navigate to="/staff" replace />;
  return <Navigate to="/admin/live" replace />;
}

export default function App() {
  const { user, logout } = useAuth();
  useIdleLock(user?.role === "staff", () => {
    logout();
  });

  return (
    <Routes>
      <Route path="/" element={<RoleRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/guardian"
        element={
          <RequireRole role="guardian">
            <Layout links={GUARDIAN_LINKS}>
              <GuardianDashboard />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/guardian/children"
        element={
          <RequireRole role="guardian">
            <Layout links={GUARDIAN_LINKS}>
              <ChildrenSetup />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/guardian/checkin/:childId"
        element={
          <RequireRole role="guardian">
            <Layout links={GUARDIAN_LINKS}>
              <CheckIn />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/guardian/checkin-multiple"
        element={
          <RequireRole role="guardian">
            <Layout links={GUARDIAN_LINKS}>
              <BulkCheckIn />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/guardian/pickup-multiple"
        element={
          <RequireRole role="guardian">
            <Layout links={GUARDIAN_LINKS}>
              <BulkPickup />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/guardian/session/:sessionId"
        element={
          <RequireRole role="guardian">
            <Layout links={GUARDIAN_LINKS}>
              <SessionStatus />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/guardian/history"
        element={
          <RequireRole role="guardian">
            <Layout links={GUARDIAN_LINKS}>
              <History />
            </Layout>
          </RequireRole>
        }
      />

      <Route
        path="/staff"
        element={
          <RequireRole role="staff">
            <Layout links={STAFF_LINKS}>
              <StaffDashboard />
            </Layout>
          </RequireRole>
        }
      />

      <Route
        path="/admin/live"
        element={
          <RequireRole role="admin">
            <Layout links={ADMIN_LINKS}>
              <LiveDashboard />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/admin/staff"
        element={
          <RequireRole role="admin">
            <Layout links={ADMIN_LINKS}>
              <StaffApprovals />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/admin/children"
        element={
          <RequireRole role="admin">
            <Layout links={ADMIN_LINKS}>
              <Children />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/admin/rooms"
        element={
          <RequireRole role="admin">
            <Layout links={ADMIN_LINKS}>
              <Rooms />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/admin/incidents"
        element={
          <RequireRole role="admin">
            <Layout links={ADMIN_LINKS}>
              <Incidents />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/admin/audit"
        element={
          <RequireRole role="admin">
            <Layout links={ADMIN_LINKS}>
              <AuditLog />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <RequireRole role="admin">
            <Layout links={ADMIN_LINKS}>
              <Reports />
            </Layout>
          </RequireRole>
        }
      />
      <Route
        path="/admin/retention"
        element={
          <RequireRole role="admin">
            <Layout links={ADMIN_LINKS}>
              <DataRetention />
            </Layout>
          </RequireRole>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
