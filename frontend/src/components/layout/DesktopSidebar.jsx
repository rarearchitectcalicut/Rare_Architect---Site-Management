import { NavLink } from "react-router-dom";
import { LogOut, Settings2 } from "lucide-react";
import rareLogo from "../../assets/images/rare-logo.png";
import { getNavigation } from "../../config/navigation";
import NavIcon from "./NavIcon";

export default function DesktopSidebar({ user, onLogout, loading, unreadCount }) {
    const prefix = user.role === "ADMIN" ? "/admin" : "/supervisor";
    return <>
        <div className="rare-sidebar-brand">
            <NavLink to={`${prefix}/dashboard`} aria-label="RARE home">
                <img src={rareLogo} alt="RARE" className="rare-theme-logo" />
            </NavLink>
        </div>
        <aside className="rare-nav-rail" aria-label="RARE workspace">
            <nav className="rare-rail-links" aria-label="Main navigation">
                {getNavigation(user.role).map((item) => <NavLink key={item.path} to={item.path}
                    aria-label={item.label} className="rare-rail-link">
                    <NavIcon name={item.icon} size={20} />
                    <span className="rare-rail-label">{item.label}</span>
                    {item.path.endsWith("/notifications") && unreadCount > 0 &&
                        <span className="rare-rail-count" aria-label={`${unreadCount} unread notifications`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
                </NavLink>)}
            </nav>
            <div className="rare-rail-footer">
                <NavLink to={`${prefix}/settings`} className="rare-rail-link" aria-label="Settings">
                    <Settings2 size={20} /><span className="rare-rail-label">Settings</span>
                </NavLink>
                <button type="button" className="rare-rail-link" onClick={onLogout} disabled={loading} aria-label="Sign out">
                    <LogOut size={20} /><span className="rare-rail-label">Sign out</span>
                </button>
            </div>
        </aside>
    </>;
}
