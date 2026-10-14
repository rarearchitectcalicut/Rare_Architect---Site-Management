import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <main className="min-h-screen bg-[#f1eadf] p-8">
      <div className="mx-auto max-w-5xl rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">
            RARE Management
          </h1>

          <button
            onClick={handleLogout}
            className="rounded-lg bg-[#211e1a] px-5 py-2.5 text-white"
          >
            Sign Out
          </button>
        </div>

        <div className="mt-10">
          <p className="text-sm text-stone-500">
            {user.role === "ADMIN"
              ? "Administration"
              : "Site Supervision"}
          </p>

          <h2 className="mt-2 text-3xl font-semibold">
            Welcome, {user.first_name || user.username}
          </h2>

          <p className="mt-3 text-stone-600">
            You successfully signed in to your{" "}
            {user.role === "ADMIN"
              ? "Admin"
              : "Supervisor"}{" "}
            dashboard.
          </p>
        </div>
      </div>
    </main>
  );
}