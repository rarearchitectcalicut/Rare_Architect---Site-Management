import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./routes/ProtectedRoute";
import LoadingScreen from "./components/LoadingScreen";
import { useEffect,useState
 } from "react";

function HomeRedirect() {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);

  
    

  if (!user) return <Navigate to="/login" replace />;

  if (user.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }

  if (user.role === "ADMIN") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (user.role === "SUPERVISOR") {
    return <Navigate to="/supervisor/dashboard" replace />;
  }

  return <Navigate to="/unauthorized" replace />;
}

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  
  useEffect(() => {
    // Displays a splash screen for 1 second on page reload.
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (isInitializing) {
    return <LoadingScreen message="Loading RARE..." />;
  }


  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route
        element={<ProtectedRoute allowedRoles={["ADMIN"]} />}
      >
        <Route
          path="/admin/dashboard"
          element={<Dashboard />}
        />
      </Route>

      <Route
        element={<ProtectedRoute allowedRoles={["SUPERVISOR"]} />}
      >
        <Route
          path="/supervisor/dashboard"
          element={<Dashboard />}
        />
      </Route>

      <Route
        path="/change-password"
        element={<PasswordChangeRequired />}
      />

      <Route
        path="/unauthorized"
        element={<div className="p-8">Access denied.</div>}
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function PasswordChangeRequired() {
  const { user, logout } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (!user.must_change_password) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 p-6">
      <div className="w-full max-w-md rounded-xl bg-white p-8">
        <h1 className="text-2xl font-bold">
          Password change required
        </h1>
        <p className="mt-3 text-stone-600">
          Your password must be updated before you can
          access the management system.
        </p>
        <p className="mt-3 text-sm text-stone-500">
          The password-change form must be connected to
          the backend's required request fields.
        </p>
        <button
          onClick={logout}
          className="mt-6 rounded-lg bg-stone-900 px-5 py-3 text-white"
        >
          Return to login
        </button>
      </div>
    </main>
  );
}