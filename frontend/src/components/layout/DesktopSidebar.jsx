
import { NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";

import rareLogo from "../../assets/images/rare-logo.png";
import { getNavigation } from "../../config/navigation";
import NavIcon from "./NavIcon";

export default function DesktopSidebar({
    user,
    onLogout,
    loading,
}) {
    const items = getNavigation(user.role);

    const displayName =
        [user.first_name, user.last_name]
            .filter(Boolean)
            .join(" ") ||
        user.username ||
        "RARE User";

    return (
        <aside
            className="
        fixed inset-y-0 left-0 z-30
        hidden w-65 flex-col
        border-r border-[#e6ddcf]
        bg-[#fffdfa]
        lg:flex
      "
        >
            {/* Logo */}
            <div className="border-b border-[#eee6dc] px-7 py-7">
                <img
                    src={rareLogo}
                    alt="RARE - Rifath Associates LLP"
                    className="h-auto w-36 object-contain"
                />

                <p className="mt-2 text-xs text-[#8a8175]">
                    Project &amp; Site Management
                </p>
            </div>

            {/* Navigation */}
            <nav
                aria-label="Main navigation"
                className="
          flex-1 space-y-1 overflow-y-auto
          px-4 py-6
        "
            >
                {items.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `
                flex min-h-11 items-center gap-3
                rounded-xl px-4 py-3
                text-[14px] font-medium
                transition-colors
                ${isActive
                                ? "bg-[#211e1a] text-white"
                                : "text-[#665e53] hover:bg-[#f1eadf] hover:text-[#211e1a]"
                            }
              `
                        }
                    >
                        <NavIcon name={item.icon} size={19} />
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            {/* Profile & Logout */}
            <div className="border-t border-[#eee6dc] p-4">
                <div className="mb-3 rounded-xl bg-[#f5efe6] p-3">
                    <p className="truncate text-sm font-semibold text-[#211e1a]">
                        {displayName}
                    </p>

                    <p className="mt-1 text-xs text-[#8a8175]">
                        {user.role === "ADMIN"
                            ? "Administrator"
                            : "Site Supervisor"}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onLogout}
                    disabled={loading}
                    className="
            flex w-full items-center gap-3
            rounded-xl px-4 py-3
            text-sm font-medium text-[#665e53]
            transition-colors
            hover:bg-[#f1eadf]
            hover:text-[#211e1a]
            disabled:cursor-not-allowed
            disabled:opacity-50
          "
                >
                    <LogOut size={19} />
                    Sign Out
                </button>
            </div>
        </aside>
    );
}
