import { useCallback, useEffect, useRef, useState } from "react";
import {
    NavLink,
    Outlet,
    useLocation,
    useNavigate,
} from "react-router-dom";
import { Bell } from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { notificationApi } from "../api/notificationApi";
import LoadingScreen from "../components/LoadingScreen";
import { PillNavigation } from "../components/common/WorkspaceUI";

import DesktopSidebar from "../components/layout/DesktopSidebar";
import MobileBottomNav from "../components/layout/MobileBottomNav";
import MobileMoreSheet from "../components/layout/MobileMoreSheet";
import PersonalNotepad from "../components/notes/PersonalNotepad";

import {
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
    const notepad = useRef(null);
    const logoutPending = useRef(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [unreadState, setUnreadState] = useState({ userId: null, count: null });
    const unreadCount = unreadState.userId === user.id ? unreadState.count : null;

    const closeMore = useCallback(() => {
        setMoreOpen(false);
    }, []);

    useEffect(() => {
        if (loggingOut) return;

        let cancelled = false;
        let latestRequest = 0;
        let controller;

        const refreshUnreadCount = async (event) => {
            const supplied = event?.detail?.unread_count;
            if (Number.isInteger(supplied) && supplied >= 0) {
                ++latestRequest; controller?.abort();
                setUnreadState({ userId: user.id, count: supplied });
                return;
            }
            if (document.visibilityState === "hidden") return;

            const request = ++latestRequest;
            controller?.abort(); controller = new AbortController();
            try {
                const data = await notificationApi.unreadCount(controller.signal);
                if (!cancelled && request === latestRequest && Number.isInteger(data.unread_count) && data.unread_count >= 0) {
                    setUnreadState({ userId: user.id, count: data.unread_count });
                }
            } catch {
                // Keep the last known count if a background refresh fails.
            }
        };

        refreshUnreadCount();
        const interval = window.setInterval(refreshUnreadCount, 30000);
        window.addEventListener("rare:notifications-updated", refreshUnreadCount);
        window.addEventListener("focus", refreshUnreadCount);
        document.addEventListener("visibilitychange", refreshUnreadCount);

        return () => {
            cancelled = true;
            controller?.abort();
            window.clearInterval(interval);
            window.removeEventListener("rare:notifications-updated", refreshUnreadCount);
            window.removeEventListener("focus", refreshUnreadCount);
            document.removeEventListener("visibilitychange", refreshUnreadCount);
        };
    }, [user.id, loggingOut, location.pathname]);

    // ---------------------------------------------
    // CURRENT PAGE TITLE
    // ---------------------------------------------

    const navigation = getNavigation(user.role);

    const currentPage = navigation.find(
        (item) => item.path === location.pathname
    );

    const pathParts = location.pathname.split("/").filter(Boolean);
    const contextTitles = { tasks: "Tasks", documents: "Documents", "daily-reports": "Daily Reports", timeline: "Timeline", delays: "Delay Reports", settings: "Settings" };
    const projectSection = pathParts[1] === "projects" && pathParts.length > 2;
    const pageTitle = currentPage?.label || (projectSection ? (pathParts[3] === "tasks" && pathParts[4] ? "Task details" : contextTitles[pathParts[3]]) || "Project workspace" : contextTitles[pathParts[1]] || (pathParts[1] === "supervisors" ? "Supervisor details" : "Workspace"));

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
        if (loggingOut || logoutPending.current) return;
        logoutPending.current = true;
        if (notepad.current && !await notepad.current.prepareToLeave()) {
            logoutPending.current = false;
            return;
        }

        setUnreadState({ userId: null, count: null });
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
        <div className="rare-app min-h-dvh min-w-0">
            <a href="#rare-main-content" className="rare-skip-link">Skip to content</a>
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
                unreadCount={unreadCount}
            />

            {/* CONTENT AREA */}
            <div className="rare-shell-content min-h-dvh">

                {/* TOP HEADER */}
                <header
                    className="rare-topbar sticky top-0 z-20"
                >
                    <div
                        className="
              rare-topbar-inner mx-auto flex
              min-h-16
              max-w-[1600px]
              items-center justify-between
              gap-3 px-4
              sm:px-6
              lg:px-8
            "
                    >
                        {/* Real role-scoped routes, with deep links preserved. */}
                        <PillNavigation label="Workspace shortcuts" className="rare-header-tabs">
                            {navigation.filter((item) => ["dashboard", "projects", "tasks", isAdmin ? "approvals" : "reports"].includes(item.path.split("/").at(-1))).map((item) =>
                                <NavLink key={item.path} to={item.path}>{item.label}</NavLink>)}
                        </PillNavigation>
                        <div className="rare-workspace-context min-w-0">
                            <p className="hidden text-xs font-medium text-muted sm:block">
                                RARE Project &amp; Site Management
                            </p>

                            <p
                                aria-label="Current workspace"
                                key={pageTitle}
                                className="
                  rare-title-in
                  mt-0.5 truncate
                  text-sm font-semibold
                  tracking-tight text-ink
                  sm:text-base
                "
                            >
                                {pageTitle}
                            </p>
                        </div>

                        <div className="flex items-center gap-2.5 sm:gap-3">

                            <PersonalNotepad key={user.id} ref={notepad} />

                            {/* NOTIFICATIONS */}
                            <NavLink
                                to={
                                    isAdmin
                                        ? "/admin/notifications"
                                        : "/supervisor/notifications"
                                }
                                aria-label={unreadCount > 0
                                    ? `Notifications, ${unreadCount} unread`
                                    : "Notifications"}
                                className="
                  rare-bell group relative shrink-0
                  flex h-11 w-11
                  items-center justify-center
                  rounded-xl border
                  border-border
                  bg-surface
                  text-ink
                  transition-all duration-200 ease-out
                  hover:-translate-y-0.5
                  hover:border-border-strong
                  hover:bg-white
                  hover:shadow-[0_6px_16px_-6px_rgba(33,30,26,0.25)]
                  active:translate-y-0 active:scale-95
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-ink focus-visible:ring-offset-2
                  focus-visible:ring-offset-app
                "
                            >
                                <Bell
                                    size={20}
                                    className="rare-bell-icon"
                                />
                                {unreadCount > 0 && (
                                    <span
                                        aria-hidden="true"
                                        className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-app"
                                    >
                                        {unreadCount > 99 ? "99+" : unreadCount}
                                    </span>
                                )}
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
                  hover:border-border
                  hover:bg-surface
                  hover:shadow-[0_6px_16px_-8px_rgba(33,30,26,0.25)]
                  active:scale-[0.98]
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-ink focus-visible:ring-offset-2
                  focus-visible:ring-offset-app
                "
                            >
                                <div className="hidden text-right sm:block">
                                    <p className="max-w-40 truncate text-sm font-semibold text-ink">
                                        {displayName}
                                    </p>

                                    <p className="text-xs text-muted">
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
                    bg-ink
                    text-sm font-bold
                    text-white
                    ring-2 ring-transparent ring-offset-2
                    ring-offset-app
                    transition-all duration-200
                    group-hover:bg-primary-hover
                    group-hover:ring-ink/20
                    sm:group-hover:ring-offset-surface
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
            rare-main min-w-0 px-3 pt-4
            sm:px-6 sm:pt-5
            lg:px-8 lg:pt-6
          "
                    id="rare-main-content"
                    tabIndex={-1}
                >
                    <Outlet />
                </main>
            </div>

            {/* MOBILE FLOATING NAVIGATION */}
            <MobileBottomNav
                role={user.role}
                unreadCount={unreadCount}
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
                unreadCount={unreadCount}
            />
        </div>
    );
}
