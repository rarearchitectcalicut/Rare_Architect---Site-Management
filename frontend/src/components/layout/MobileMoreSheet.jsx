
import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { LogOut, X } from "lucide-react";

import {
    getNavigation,
    getMobilePrimaryNavigation,
} from "../../config/navigation";

import NavIcon from "./NavIcon";

export default function MobileMoreSheet({
    open,
    onClose,
    user,
    onLogout,
    loading,
}) {
    const closeButtonRef = useRef(null);

    const allItems = getNavigation(user.role);

    const primaryPaths = new Set(
        getMobilePrimaryNavigation(user.role).map(
            (item) => item.path
        )
    );

    const secondaryItems = allItems.filter(
        (item) => !primaryPaths.has(item.path)
    );

    useEffect(() => {
        if (!open) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeButtonRef.current?.focus();

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 lg:hidden">
            {/* Backdrop */}
            <button
                type="button"
                aria-label="Close navigation menu"
                onClick={onClose}
                className="
          absolute inset-0
          h-full w-full
          bg-[#211e1a]/35
          backdrop-blur-[3px]
        "
            />

            {/* Bottom sheet */}
            <section
                id="rare-mobile-more-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="More navigation options"
                className="
          absolute right-3 bottom-3 left-3
          max-h-[80dvh] overflow-y-auto
          rounded-[30px]
          bg-[#fffdfa]
          p-5 pb-7
          shadow-2xl
        "
                style={{
                    marginBottom: "env(safe-area-inset-bottom, 0px)",
                }}
            >
                <div className="mx-auto mb-5 h-1 w-12 rounded-full bg-[#d9cfc0]" />

                {/* Header */}
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-[#211e1a]">
                            More
                        </h2>

                        <p className="text-xs text-[#8a8175]">
                            RARE Management
                        </p>
                    </div>

                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={onClose}
                        aria-label="Close menu"
                        className="
              rounded-full bg-[#f1eadf]
              p-2.5 text-[#211e1a]
            "
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation links */}
                <nav
                    aria-label="Additional navigation"
                    className="space-y-1"
                >
                    {secondaryItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={onClose}
                            className={({ isActive }) =>
                                `
                  flex items-center gap-3
                  rounded-xl px-4 py-3.5
                  text-sm font-medium
                  ${isActive
                                    ? "bg-[#211e1a] text-white"
                                    : "text-[#665e53] hover:bg-[#f1eadf]"
                                }
                `
                            }
                        >
                            <NavIcon name={item.icon} size={20} />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                {/* Profile */}
                <div className="mt-5 border-t border-[#e6ddcf] pt-5">
                    <p className="text-sm font-semibold text-[#211e1a]">
                        {[user.first_name, user.last_name]
                            .filter(Boolean)
                            .join(" ") ||
                            user.username ||
                            "RARE User"}
                    </p>

                    <p className="mt-1 text-xs text-[#8a8175]">
                        {user.role === "ADMIN"
                            ? "Administrator"
                            : "Site Supervisor"}
                    </p>

                    <button
                        type="button"
                        onClick={onLogout}
                        disabled={loading}
                        className="
              mt-4 flex w-full items-center
              justify-center gap-2
              rounded-xl bg-[#211e1a]
              px-4 py-3.5
              text-sm font-semibold text-white
              disabled:opacity-50
            "
                    >
                        <LogOut size={18} />
                        Sign Out
                    </button>
                </div>
            </section>
        </div>
    );
}
