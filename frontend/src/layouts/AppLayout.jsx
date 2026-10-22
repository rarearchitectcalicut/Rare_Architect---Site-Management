import { useCallback, useEffect, useState } from "react";
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
// TOPBAR MOTION (scoped keyframes, reduced-motion safe)
// =====================================================

const TOPBAR_CSS = `
@keyframes rare-title-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
}
@keyframes rare-bell-ring {
    0%   { transform: rotate(0); }
    20%  { transform: rotate(14deg); }
    40%  { transform: rotate(-12deg); }
    60%  { transform: rotate(8deg); }
    80%  { transform: rotate(-4deg); }
    100% { transform: rotate(0); }
}
.rare-title-in { animation: rare-title-in 320ms cubic-bezier(.22,1,.36,1) both; }
.rare-bell:hover .rare-bell-icon,
.rare-bell:focus-visible .rare-bell-icon {
    transform-origin: 50% 10%;
    animation: rare-bell-ring 700ms ease-in-out;
}
@media (prefers-reduced-motion: reduce) {
    .rare-title-in,
    .rare-bell:hover .rare-bell-icon,
    .rare-bell:focus-visible .rare-bell-icon { animation: none; }
}
`;

// =====================================================
// RARE APPLICATION LAYOUT
// =====================================================

export default function AppLayout() {
    const { user, logout } = useAuth();

    const navigate = useNavigate();
    const location = useLocation();

    const [loggingOut, setLoggingOut] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    const closeMore = useCallback(() => {
        setMoreOpen(false);
    }, []);

    // ---------------------------------------------
    // HEADER GETS A SHADOW ONCE THE PAGE SCROLLS
    // ---------------------------------------------

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 4);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
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

    const isAdmin = user.role === "ADMIN";

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
            <style>{TOPBAR_CSS}</style>

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
                    className={`
            sticky top-0 z-20
            border-b
            bg-[#f1eadf]/85
            backdrop-blur-xl backdrop-saturate-150
            transition-[box-shadow,border-color] duration-300
            ${scrolled
                            ? "border-[#e0d6c5] shadow-[0_8px_24px_-12px_rgba(33,30,26,0.18)]"
                            : "border-transparent"
                        }
          `}
                >
                    <div
                        className={`
              mx-auto flex
              max-w-[1600px]
              items-center justify-between
              gap-4 px-5
              transition-[min-height] duration-300 ease-out
              sm:px-8
              lg:px-10
              ${scrolled ? "min-h-16" : "min-h-19"}
            `}
                    >
                        {/* TITLE */}
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-[#8a8175]">
                                RARE Project &amp; Site Management
                            </p>

                            <h1
                                key={pageTitle}
                                className="
                  rare-title-in
                  mt-0.5 truncate
                  text-xl font-bold
                  tracking-tight text-[#211e1a]
                  sm:text-2xl
                "
                            >
                                {pageTitle}
                            </h1>
                        </div>

                        <div className="flex items-center gap-2.5 sm:gap-3">

                            {/* NOTIFICATIONS */}
                            <NavLink
                                to={
                                    isAdmin
                                        ? "/admin/notifications"
                                        : "/supervisor/notifications"
                                }
                                aria-label="Notifications"
                                className="
                  rare-bell group
                  flex h-11 w-11
                  items-center justify-center
                  rounded-xl border
                  border-[#e4dccd]
                  bg-[#fffdfa]
                  text-[#211e1a]
                  transition-all duration-200 ease-out
                  hover:-translate-y-0.5
                  hover:border-[#cfc4b0]
                  hover:bg-white
                  hover:shadow-[0_6px_16px_-6px_rgba(33,30,26,0.25)]
                  active:translate-y-0 active:scale-95
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-[#211e1a] focus-visible:ring-offset-2
                  focus-visible:ring-offset-[#f1eadf]
                "
                            >
                                <Bell
                                    size={20}
                                    className="rare-bell-icon"
                                />
                            </NavLink>

                            {/* PROFILE PILL */}
                            <NavLink
                                to={
                                    isAdmin
                                        ? "/admin/settings"
                                        : "/supervisor/settings"
                                }
                                aria-label="Open profile settings"
                                className="
                  group flex items-center gap-3
                  rounded-full border border-transparent
                  p-0.5 sm:py-1 sm:pl-4 sm:pr-1
                  transition-all duration-200 ease-out
                  hover:border-[#e4dccd]
                  hover:bg-[#fffdfa]
                  hover:shadow-[0_6px_16px_-8px_rgba(33,30,26,0.25)]
                  active:scale-[0.98]
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-[#211e1a] focus-visible:ring-offset-2
                  focus-visible:ring-offset-[#f1eadf]
                "
                            >
                                <div className="hidden text-right sm:block">
                                    <p className="max-w-40 truncate text-sm font-semibold text-[#211e1a]">
                                        {displayName}
                                    </p>

                                    <p className="text-xs text-[#8a8175]">
                                        {isAdmin
                                            ? "Administrator"
                                            : "Site Supervisor"}
                                    </p>
                                </div>

                                <span
                                    className="
                    flex h-11 w-11 shrink-0
                    items-center justify-center
                    rounded-full
                    bg-[#211e1a]
                    text-sm font-bold
                    text-white
                    ring-2 ring-transparent ring-offset-2
                    ring-offset-[#f1eadf]
                    transition-all duration-200
                    group-hover:bg-[#39342d]
                    group-hover:ring-[#211e1a]/20
                    sm:group-hover:ring-offset-[#fffdfa]
                  "
                                >
                                    {displayName.charAt(0).toUpperCase()}
                                </span>
                            </NavLink>
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