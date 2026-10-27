
import { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { useAuth } from "./hooks/useAuth";

// =====================================================
// PAGES
// =====================================================

import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import CategoryProjectList from "./pages/CategoryProjectList";
import SectionPlaceholder from "./pages/SectionPlaceholder";


// =====================================================
//  ADMIN PAGES
// =====================================================
import AdminProjectOverview from "./pages/admin/ProjectOverview";
import AdminProjectTasks, { GlobalTaskRegister } from "./pages/admin/ProjectTasks";
import AdminTaskDetails from "./pages/admin/TaskDetails";
import Supervisors from "./pages/admin/Supervisors";
import SupervisorDetails from "./pages/admin/SupervisorDetails";
import AdminProjects, { ProjectDirectory } from "./pages/admin/Projects";
import AdminSettings from "./pages/admin/Settings";
import AdminApprovals from "./pages/admin/Approvals";
import AdminDelays from "./pages/admin/Delays";
import AdminDailyReports, { ProjectDailyReports } from "./pages/admin/DailyReports";
import AdminNotifications from "./pages/admin/Notifications";
import AdminActivity from "./pages/admin/Activity";




// =====================================================
//  SUPERVISOR PAGES
// =====================================================
import SupervisorSettings from "./pages/supervisor/Settings"; 
import SupervisorProjects from "./pages/supervisor/Projects";
import SupervisorProjectOverview from "./pages/supervisor/ProjectOverview";
import SupervisorProjectWorkspace, { ProjectDocuments } from "./pages/supervisor/ProjectWorkspace";
import SupervisorProjectTasks from "./pages/supervisor/ProjectTasks";
import SupervisorNotifications from "./pages/supervisor/Notifications";
import SupervisorProjectTimeline from "./pages/supervisor/ProjectTimeline";
import SupervisorProjectDelays from "./pages/supervisor/ProjectDelays";
import SupervisorDelays from "./pages/supervisor/Delays";


// =====================================================
// ROUTES AND LAYOUT
// =====================================================

import ProtectedRoute from "./routes/ProtectedRoute";
import AppLayout from "./layouts/AppLayout";
import LoadingScreen from "./components/LoadingScreen";

// =====================================================
// HOME REDIRECT
// =====================================================

function HomeRedirect() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.must_change_password) {
    return (
      <Navigate to="/change-password" replace />
    );
  }

  if (user.role === "ADMIN") {
    return (
      <Navigate to="/admin/dashboard" replace />
    );
  }

  if (user.role === "SUPERVISOR") {
    return (
      <Navigate to="/supervisor/dashboard" replace />
    );
  }

  return (
    <Navigate to="/unauthorized" replace />
  );
}

// =====================================================
// UNAUTHORIZED PAGE
// =====================================================

function UnauthorizedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f1eadf] p-6">
      <div className="w-full max-w-md rounded-2xl bg-[#fffdfa] p-8 text-center">
        <h1 className="text-xl font-bold text-[#211e1a]">
          Access Denied
        </h1>

        <p className="mt-2 text-sm text-[#716658]">
          You do not have permission to access this page.
        </p>
      </div>
    </main>
  );
}

// =====================================================
// MAIN APPLICATION
// =====================================================

export default function App() {
  const [isInitializing, setIsInitializing] =
    useState(true);

  useEffect(() => {
    // Keep your existing RARE startup loader.
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (isInitializing) {
    return (
      <LoadingScreen message="Loading RARE..." standalone />
    );
  }

  return (
    <Routes>

      {/* ==========================================
          PUBLIC ROUTES
          ========================================== */}

      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/"
        element={<HomeRedirect />}
      />

      <Route
        path="/change-password"
        element={<ChangePassword />}
      />

      {/* ==========================================
          ADMIN ROUTES
          ========================================== */}

      <Route
        element={
          <ProtectedRoute allowedRoles={["ADMIN"]} />
        }
      >
        <Route element={<AppLayout />}>

          <Route
            path="/admin/settings"
            element={<AdminSettings />}
          />

          {/* ADMIN DASHBOARD */}
          <Route
            path="/admin/dashboard"
            element={<Dashboard />}
          />

          {/* PROJECTS LIST */}
          <Route
            path="/admin/projects"
            element={<AdminProjects />}
          />

          {/* CATEGORY PROJECT LISTING */}
          <Route
            path="/admin/categories/:categoryId"
            element={<CategoryProjectList />}
          />

          {/* PROJECT MAIN PAGE — UPCOMING */}
          <Route
            path="/admin/projects/:projectId"
            element={<AdminProjectOverview />}
          />

          {/* ADD PROJECT — UPCOMING */}
          <Route
            path="/admin/projects/new"
            element={<SectionPlaceholder />}
          />

          {/* TASKS */}
          <Route path="/admin/projects/:projectId/tasks" element={<AdminProjectTasks />} />
          <Route path="/admin/projects/:projectId/tasks/:taskId" element={<AdminTaskDetails />} />
          <Route
            path="/admin/tasks"
            element={<GlobalTaskRegister role="ADMIN" />}
          />

          {/* APPROVALS */}
          <Route
            path="/admin/approvals"
            element={<AdminApprovals />}
          />

          {/* SUPERVISORS */}
          <Route
            path="/admin/supervisors"
            element={<Supervisors />}
          />

          <Route
            path="/admin/supervisors/:supervisorId"
            element={<SupervisorDetails />}
          />

          {/* ADD SUPERVISOR — UPCOMING */}
          <Route
            path="/admin/supervisors/new"
            element={<SectionPlaceholder />}
          />

          {/* DAILY REPORTS */}
          <Route
            path="/admin/reports"
            element={<AdminDailyReports />}
          />
          <Route path="/admin/daily-reports" element={<AdminDailyReports />} />
          <Route path="/admin/projects/:projectId/daily-reports" element={<ProjectDailyReports role="ADMIN" />} />

          <Route path="/admin/projects/:projectId/documents" element={<ProjectDocuments role="ADMIN" />} />
          {/* DOCUMENTS */}
          <Route
            path="/admin/documents"
            element={<ProjectDirectory role="ADMIN" section="documents" />}
          />

          <Route path="/admin/projects/:projectId/delays" element={<AdminDelays />} />
          {/* DELAYS */}
          <Route
            path="/admin/delays"
            element={<AdminDelays />}
          />

          {/* NOTIFICATIONS */}
          <Route
            path="/admin/notifications"
            element={<AdminNotifications />}
          />

          {/* ACTIVITY LOGS */}
          <Route
            path="/admin/activity"
            element={<AdminActivity />}
          />

        </Route>
      </Route>

      {/* ==========================================
          SUPERVISOR ROUTES
          ========================================== */}

      <Route
        element={
          <ProtectedRoute
            allowedRoles={["SUPERVISOR"]}
          />
        }
      >
        <Route element={<AppLayout />}>

          <Route
            path="/supervisor/settings"
            element={<SupervisorSettings />}
          />

          {/* SUPERVISOR DASHBOARD */}
          <Route
            path="/supervisor/dashboard"
            element={<Dashboard />}
          />

          {/* ASSIGNED PROJECTS */}
          <Route
            path="/supervisor/projects"
            element={<SupervisorProjects />}
          />

          {/* PROJECT DETAILS — UPCOMING */}
          <Route
            path="/supervisor/projects/:projectId"
            element={<SupervisorProjectOverview />}
          />

          <Route
            path="/supervisor/projects/:projectId/tasks"
            element={<SupervisorProjectTasks />}
          />

          <Route
            path="/supervisor/projects/:projectId/timeline"
            element={<SupervisorProjectTimeline />}
          />
          <Route path="/supervisor/projects/:projectId/delays" element={<SupervisorProjectDelays />} />
          <Route path="/supervisor/projects/:projectId/documents" element={<ProjectDocuments role="SUPERVISOR" />} />
          <Route path="/supervisor/projects/:projectId/daily-reports" element={<ProjectDailyReports role="SUPERVISOR" />} />


          <Route
            path="/supervisor/projects/:projectId/:section"
            element={<SupervisorProjectWorkspace />}
          />

          {/* TASKS */}
          <Route
            path="/supervisor/tasks"
            element={<GlobalTaskRegister role="SUPERVISOR" />}
          />

          {/* DAILY REPORTS */}
          <Route
            path="/supervisor/reports"
            element={<SectionPlaceholder />}
          />

          {/* DOCUMENTS */}
          <Route
            path="/supervisor/documents"
            element={<ProjectDirectory role="SUPERVISOR" section="documents" />}
          />

          {/* DELAYS */}
          <Route
            path="/supervisor/delays"
            element={<SupervisorDelays />}
          />

          {/* NOTIFICATIONS */}
          <Route
            path="/supervisor/notifications"
            element={<SupervisorNotifications />}
          />

        </Route>
      </Route>

      {/* ==========================================
          UNAUTHORIZED
          ========================================== */}

      <Route
        path="/unauthorized"
        element={<UnauthorizedPage />}
      />

      {/* ==========================================
          FALLBACK
          ========================================== */}

      <Route
        path="*"
        element={
          <Navigate to="/" replace />
        }
      />

    </Routes>
  );
}
