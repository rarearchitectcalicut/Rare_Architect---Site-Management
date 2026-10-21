
import { useCallback, useState } from "react";
import {
    NavLink,
    Outlet,
    useLocation,
    useNavigate,
} from "react-router-dom";
import { Bell } from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import LoadingScreen from "../components/LoadingScreen";

import DesktopSidebar from "../components/layout/DesktopSidebar";
import MobileBottomNav from "../components/layout/MobileBottomNav";
import MobileMoreSheet from "../components/layout/MobileMoreSheet";

import {
    getDashboardPath,
    getNavigation,
} from "../config/navigation";

// =====================================================
// RARE APPLICATION LAYOUT
// =====================================================

export default function AppLayout() {
    const { user, logout } = useAuth();

    const navigate = useNavigate();
    const location = useLocation();

    const [loggingOut, setLoggingOut] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);

    const closeMore = useCallback(() => {
        setMoreOpen(false);
    }, []);

    // ---------------------------------------------
    // CURRENT PAGE TITLE
    // ---------------------------------------------

    const navigation = getNavigation(user.role);

    const currentPage = navigation.find(
        (item) => item.path === location.pathname
    );

    const pageTitle = currentPage?.label || "Dashboard";

    const displayName =
        [user.first_name, user.last_name]
            .filter(Boolean)
            .join(" ") ||
        user.username ||
        "RARE User";

    // ---------------------------------------------
    // LOGOUT WITH GLOBAL LOADER
    // ---------------------------------------------

    const handleLogout = async () => {
        if (loggingOut) return;

        setLoggingOut(true);
        closeMore();

        try {
            await logout();
        } finally {
            navigate("/login", { replace: true });
        }
    };

    // ---------------------------------------------
    // PAGE LAYOUT
    // ---------------------------------------------

    return (
        <div className="min-h-dvh bg-[#f1eadf]">

            {/* GLOBAL LOADER */}
            {loggingOut && (
                <LoadingScreen message="Signing you out..." />
            )}

            {/* DESKTOP SIDEBAR */}
            <DesktopSidebar
                user={user}
                onLogout={handleLogout}
                loading={loggingOut}
            />

            {/* CONTENT AREA */}
            <div className="min-h-dvh lg:pl-65">

                {/* TOP HEADER */}
                <header
                    className="
            sticky top-0 z-20
            border-b border-[#e6ddcf]
            bg-[#f1eadf]/95
            backdrop-blur-xl
          "
                >
                    <div
                        className="
              mx-auto flex min-h-19
              max-w-[1600px]
              items-center justify-between
              gap-4 px-5
              sm:px-8
              lg:px-10
            "
                    >
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-[#8a8175]">
                                RARE Project &amp; Site Management
                            </p>

                            <h1
                                className="
                  mt-1 truncate
                  text-xl font-bold
                  tracking-tight text-[#211e1a]
                  sm:text-2xl
                "
                            >
                                {pageTitle}
                            </h1>
                        </div>

                        <div className="flex items-center gap-3">

                            {/* NOTIFICATIONS */}
                            <NavLink
                                to={
                                    user.role === "ADMIN"
                                        ? "/admin/notifications"
                                        : "/supervisor/notifications"
                                }
                                aria-label="Notifications"
                                className="
                  flex h-11 w-11
                  items-center justify-center
                  rounded-xl border
                  border-[#e4dccd]
                  bg-[#fffdfa]
                  text-[#211e1a]
                  transition-colors
                  hover:bg-[#e9e0d3]
                "
                            >
                                <Bell size={20} />
                            </NavLink>

                            {/* DESKTOP USER INFO */}
                            <div className="hidden text-right sm:block">
                                <p className="max-w-40 truncate text-sm font-semibold text-[#211e1a]">
                                    {displayName}
                                </p>

                                <p className="text-xs text-[#8a8175]">
                                    {user.role === "ADMIN"
                                        ? "Administrator"
                                        : "Site Supervisor"}
                                </p>
                            </div>

                            <div
                                aria-hidden="true"
                                className="
                  flex h-11 w-11
                  items-center justify-center
                  rounded-full
                  bg-[#211e1a]
                  text-sm font-bold
                  text-white
                "
                            >
                                {displayName.charAt(0).toUpperCase()}
                            </div>
                        </div>
                    </div>
                </header>

                {/* MAIN CONTENT */}
                <main
                    className="
            mx-auto w-full max-w-[1600px]
            px-5 pt-6
            sm:px-8 sm:pt-8
            lg:px-10 lg:pt-10
          "
                    style={{
                        paddingBottom:
                            "calc(120px + env(safe-area-inset-bottom, 0px))",
                    }}
                >
                    <Outlet />
                </main>
            </div>

            {/* MOBILE FLOATING NAVIGATION */}
            <MobileBottomNav
                role={user.role}
                onOpenMore={() => setMoreOpen(true)}
                moreOpen={moreOpen}
            />

            {/* MOBILE MORE SHEET */}
            <MobileMoreSheet
                open={moreOpen}
                onClose={closeMore}
                user={user}
                onLogout={handleLogout}
                loading={loggingOut}
            />
        </div>
    );
}
