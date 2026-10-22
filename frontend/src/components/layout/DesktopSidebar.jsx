import { NavLink } from "react-router-dom";
import { LogOut, Settings2 } from "lucide-react";

import rareLogo from "../../assets/images/rare-logo.png";
import { getNavigation } from "../../config/navigation";
import NavIcon from "./NavIcon";

// Shared row styling for the footer actions (Settings, Sign Out)
const rowBase = `
  group flex w-full items-center gap-3
  rounded-2xl px-3 py-2.5
  text-left text-sm font-semibold
  transition-all duration-200 ease-out
  active:scale-[0.98]
  focus-visible:outline-none focus-visible:ring-2
  motion-reduce:transition-none
`;

export default function DesktopSidebar({ user, onLogout, loading }) {
    const items = getNavigation(user.role);

    // FIX: isAdmin was used in the footer but never defined
    const isAdmin = user?.role === "ADMIN";

    const displayName =
        [user.first_name, user.last_name].filter(Boolean).join(" ") ||
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
            <div className="border-b border-[#eee6dc] px-6 py-7">
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
          px-3 py-6
        "
            >
                {items.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `
                group flex min-h-11 items-center gap-3
                rounded-xl px-3 py-3
                text-[14px] font-medium
                transition-all duration-200 ease-out
                active:scale-[0.98]
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-[#211e1a]/30
                motion-reduce:transition-none
                ${isActive
                                ? "bg-[#211e1a] text-white shadow-[0_8px_20px_rgba(33,30,26,0.18)]"
                                : "text-[#665e53] hover:bg-[#f1eadf] hover:text-[#211e1a]"
                            }
              `
                        }
                    >
                        <span
                            className="
                shrink-0 transition-transform duration-300 ease-out
                group-hover:scale-110
                motion-reduce:transition-none
                motion-reduce:group-hover:scale-100
              "
                        >
                            <NavIcon name={item.icon} size={19} />
                        </span>

                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            {/* Profile & Logout */}
            <div className="border-t border-[#eee6dc] p-3">
                {/* PROFILE */}
                <div
                    className="
            group mb-3 flex items-center gap-3
            rounded-2xl bg-[#f5efe6] px-3 py-3
            transition-all duration-200 ease-out
            hover:bg-[#f0e8dc]
            hover:shadow-[0_6px_18px_rgba(33,30,26,0.06)]
            motion-reduce:transition-none
          "
                >
                    <span
                        className="
              flex h-9 w-9 shrink-0 items-center justify-center
              rounded-xl bg-[#211e1a] text-sm font-bold text-white
              transition-transform duration-300 ease-out
              group-hover:scale-105
              motion-reduce:transition-none
              motion-reduce:group-hover:scale-100
            "
                    >
                        {(displayName || "R").charAt(0).toUpperCase()}
                    </span>

                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#211e1a]">
                            {displayName}
                        </p>

                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#8a8175]">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#16A34A]" />
                            <span className="truncate">
                                {isAdmin ? "Administrator" : "Site Supervisor"}
                            </span>
                        </p>
                    </div>
                </div>

                {/* ACTIONS */}
                <div className="space-y-1">
                    <NavLink
                        to={isAdmin ? "/admin/settings" : "/supervisor/settings"}
                        className={({ isActive }) => `
              ${rowBase}
              focus-visible:ring-[#211e1a]/30
              ${isActive
                                ? "bg-[#211E1A] text-white shadow-[0_8px_20px_rgba(33,30,26,0.18)]"
                                : "text-[#665E53] hover:bg-[#E9DFD1] hover:text-[#211E1A]"
                            }
            `}
                    >
                        {({ isActive }) => (
                            <>
                                <span
                                    className={`
                    flex h-9 w-9 shrink-0 items-center justify-center
                    rounded-xl transition-colors duration-300
                    ${isActive
                                            ? "bg-white/15 text-white"
                                            : "bg-[#E8DFD3] text-[#665E53] group-hover:bg-[#211E1A] group-hover:text-white"
                                        }
                  `}
                                >
                                    <Settings2
                                        size={19}
                                        strokeWidth={1.8}
                                        className="
                      transition-transform duration-500 ease-out
                      group-hover:rotate-90
                      motion-reduce:transition-none
                      motion-reduce:group-hover:rotate-0
                    "
                                    />
                                </span>

                                <span className="min-w-0 flex-1 truncate">Settings</span>
                            </>
                        )}
                    </NavLink>

                    <button
                        type="button"
                        onClick={onLogout}
                        disabled={loading}
                        className={`
              ${rowBase}
              text-[#665e53]
              hover:bg-[#fde8e6]/70 hover:text-[#9e3535]
              focus-visible:ring-[#9e3535]/40
              disabled:pointer-events-none disabled:opacity-50
            `}
                    >
                        <span
                            className="
                flex h-9 w-9 shrink-0 items-center justify-center
                rounded-xl bg-[#fde8e6] text-[#9e3535]
                transition-colors duration-300
                group-hover:bg-[#9e3535] group-hover:text-white
              "
                        >
                            <LogOut
                                size={19}
                                strokeWidth={1.8}
                                className="
                  transition-transform duration-300 ease-out
                  group-hover:translate-x-0.5
                  motion-reduce:transition-none
                  motion-reduce:group-hover:translate-x-0
                "
                            />
                        </span>

                        <span className="min-w-0 flex-1 truncate">Sign Out</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}