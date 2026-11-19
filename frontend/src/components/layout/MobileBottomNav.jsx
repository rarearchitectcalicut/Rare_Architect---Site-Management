
import { NavLink, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";

import {
    getMobilePrimaryNavigation,
} from "../../config/navigation";

import NavIcon from "./NavIcon";

export default function MobileBottomNav({
    role,
    onOpenMore,
    moreOpen,
    unreadCount,
}) {
    const location = useLocation();
    const items = getMobilePrimaryNavigation(role);

    const primaryPaths = items.map((item) => item.path);

    const isMoreActive =
        moreOpen ||
        !primaryPaths.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));

    return (
        <nav
            aria-label="Mobile navigation"
            className="rare-mobile-nav"
        >
            <div
                className="rare-mobile-nav-grid"
            >
                {items.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `rare-mobile-nav-item${isActive ? " is-active" : ""}`
                        }
                    >
                        <span className="rare-mobile-nav-icon">
                            <NavIcon name={item.icon} size={20} />
                            {item.path.endsWith("/notifications") && unreadCount > 0 && <span aria-label={`${unreadCount} unread notifications`} className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-solid px-1 text-[10px] font-bold leading-none text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
                        </span>

                        <span className="rare-mobile-nav-label">
                            {item.label}
                        </span>
                    </NavLink>
                ))}

                <button
                    type="button"
                    onClick={onOpenMore}
                    aria-expanded={moreOpen}
                    aria-controls="rare-mobile-more-sheet"
                    aria-haspopup="dialog"
                    className={`rare-mobile-nav-item${isMoreActive ? " is-active" : ""}`}
                >
                    <span className="rare-mobile-nav-icon">
                        <Menu size={20} strokeWidth={1.9} />
                    </span>

                    <span className="rare-mobile-nav-label">
                        More
                    </span>
                </button>
            </div>
        </nav>
    );
}
