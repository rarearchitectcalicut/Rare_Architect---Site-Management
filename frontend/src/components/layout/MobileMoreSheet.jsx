import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { ChevronRight, LogOut, Settings2, X } from "lucide-react";

import {
    getNavigation,
    getMobilePrimaryNavigation,
} from "../../config/navigation";

import NavIcon from "./NavIcon";

// =====================================================
// MOTION + STYLES
// =====================================================

const sheetCss = `
  @keyframes rare-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes rare-sheet {
    from { opacity: 0; transform: translateY(40px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes rare-row {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .rare-sheet-backdrop {
    animation: rare-fade 220ms ease-out;
  }

  .rare-sheet {
    animation: rare-sheet 380ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .rare-sheet-row {
    animation: rare-row 420ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
    animation-delay: var(--d, 0ms);
  }

  @media (prefers-reduced-motion: reduce) {
    .rare-sheet-backdrop,
    .rare-sheet,
    .rare-sheet-row {
      animation: none !important;
    }
  }
`;

// Icon tile tones, cycled per item (literal class strings for Tailwind)
const itemTones = [
    "bg-[#F1EADF] text-[#716658]",
    "bg-[#E7F2E8] text-[#296F40]",
    "bg-[#FFF2D8] text-[#94651D]",
    "bg-[#EDF3FC] text-[#3565A5]",
];

const slateTone = "bg-[#ece8e2] text-[#72675b]";

// Shared row styling so every row aligns identically
const rowClass = (isActive) => `
  group flex items-center gap-3.5
  rounded-2xl px-3 py-2.5
  text-sm font-semibold
  transition-all duration-200 ease-out
  active:scale-[0.98]
  focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-[#211e1a]/30
  motion-reduce:transition-none
  ${isActive
        ? "bg-[#211e1a] text-white shadow-[0_8px_20px_rgba(33,30,26,0.18)]"
        : "text-[#4f483f] hover:bg-[#f1eadf]"
    }
`;

const tileClass = (isActive, tone) => `
  flex h-10 w-10 shrink-0 items-center justify-center
  rounded-xl transition-transform duration-300 ease-out
  group-hover:scale-105
  motion-reduce:transition-none
  motion-reduce:group-hover:scale-100
  ${isActive ? "bg-white/12 text-white" : tone}
`;

const chevronClass = (isActive) => `
  shrink-0 transition-all duration-300 ease-out
  group-hover:translate-x-0.5
  motion-reduce:transition-none
  motion-reduce:group-hover:translate-x-0
  ${isActive ? "text-white/70" : "text-[#b3a899] group-hover:text-[#211e1a]"}
`;

// =====================================================
// MOBILE MORE SHEET
// =====================================================

export default function MobileMoreSheet({
    open,
    onClose,
    user,
    onLogout,
    loading,
}) {
    const closeButtonRef = useRef(null);
    const dialogRef = useRef(null);

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
        const previousFocus = document.activeElement;
        const dialog = dialogRef.current;
        document.body.style.overflow = "hidden";
        dialog?.showModal();
        const desktop = window.matchMedia("(min-width: 1024px)");
        const closeOnDesktop = () => { if (desktop.matches) onClose(); };
        desktop.addEventListener("change", closeOnDesktop);
        closeOnDesktop();
        closeButtonRef.current?.focus();
        return () => {
            desktop.removeEventListener("change", closeOnDesktop);
            dialog?.close();
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus?.();
        };
    }, [open, onClose]);

    if (!open) return null;

    const displayName =
        [user.first_name, user.last_name]
            .filter(Boolean)
            .join(" ") ||
        user.username ||
        "RARE User";

    const roleLabel =
        user.role === "ADMIN" ? "Administrator" : "Site Supervisor";

    // Rendered in a portal so no parent transform or stacking
    // context can offset the fixed overlay.
    return createPortal(
        <div className="fixed inset-0 z-50 lg:hidden">
            <style>{sheetCss}</style>

            {/* Bottom sheet */}
            <dialog
                ref={dialogRef}
                onCancel={(event) => { event.preventDefault(); onClose(); }}
                onClick={(event) => {
                    if (event.target !== event.currentTarget) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
                }}
                id="rare-mobile-more-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="More navigation options"
                className="
                    rare-sheet fixed inset-x-2 bottom-2 top-auto m-0 w-[calc(100%-1rem)] max-w-none p-0 backdrop:bg-[#211E1A]/45
                    flex max-h-[85dvh] flex-col
                    overflow-hidden rounded-2xl
                    md:inset-x-5 md:bottom-5 md:w-[calc(100%-2.5rem)] md:rounded-2xl
                    border border-[#ece4d8] bg-[#fffdfa]
                    shadow-[0_24px_70px_rgba(33,30,26,0.28)]
                "
                style={{
                    marginBottom: "env(safe-area-inset-bottom, 0px)",
                }}
            >
                {/* Handle */}
                <div className="flex shrink-0 justify-center pt-3">
                    <span className="h-1 w-12 rounded-full bg-[#d9cfc0]" />
                </div>

                {/* Header */}
                <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4 md:px-8 md:pt-5">
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#716658]">
                            RARE Management
                        </p>

                        <h2 className="mt-1 text-xl font-bold tracking-tight text-[#211e1a]">
                            More
                        </h2>
                    </div>

                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={onClose}
                        aria-label="Close menu"
                        className="
                            group shrink-0 rounded-full bg-[#f1eadf]
                            p-2.5 text-[#211e1a]
                            transition-all duration-200 ease-out
                            hover:bg-[#e7ddce]
                            active:scale-95
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-[#211e1a]/30
                        "
                    >
                        <X
                            size={20}
                            className="
                                transition-transform duration-300 ease-out
                                group-hover:rotate-90
                                motion-reduce:transition-none
                                motion-reduce:group-hover:rotate-0
                            "
                        />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4 md:space-y-6 md:px-6 md:pb-5">

                    {/* Profile card */}
                    <div
                        className="rare-sheet-row flex items-center gap-3.5 rounded-2xl bg-[#f8f4ee] p-3.5"
                        style={{ "--d": "60ms" }}
                    >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#211e1a] text-lg font-bold text-white">
                            {displayName.charAt(0).toUpperCase()}
                        </span>

                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-[#211e1a]">
                                {displayName}
                            </p>

                            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#E6F4EA] px-2.5 py-0.5 text-xs font-bold text-[#246b3b]">
                                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                                {roleLabel}
                            </span>
                        </div>
                    </div>

                    {/* Navigation links */}
                    {secondaryItems.length > 0 && (
                        <div>
                            <p className="mb-2 px-3 text-xs font-bold uppercase tracking-[0.16em] text-[#716658]">
                                Navigation
                            </p>

                            <nav
                                aria-label="Additional navigation"
                                className="grid gap-1 md:grid-cols-2 md:gap-x-3"
                            >
                                {secondaryItems.map((item, index) => (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        onClick={onClose}
                                        className={({ isActive }) =>
                                            `rare-sheet-row ${rowClass(isActive)}`
                                        }
                                        style={{ "--d": `${120 + index * 40}ms` }}
                                    >
                                        {({ isActive }) => (
                                            <>
                                                <span
                                                    className={tileClass(
                                                        isActive,
                                                        itemTones[index % itemTones.length]
                                                    )}
                                                >
                                                    <NavIcon name={item.icon} size={20} />
                                                </span>

                                                <span className="min-w-0 flex-1 truncate">
                                                    {item.label}
                                                </span>

                                                <ChevronRight
                                                    size={18}
                                                    className={chevronClass(isActive)}
                                                />
                                            </>
                                        )}
                                    </NavLink>
                                ))}
                            </nav>
                        </div>
                    )}

                    {/* Account */}
                    <div>
                        <p className="mb-2 px-3 text-xs font-bold uppercase tracking-[0.16em] text-[#716658]">
                            Account
                        </p>

                        <div className="grid gap-1 md:grid-cols-2 md:gap-x-3">
                            <NavLink
                                to={
                                    user?.role === "ADMIN"
                                        ? "/admin/settings"
                                        : "/supervisor/settings"
                                }
                                onClick={onClose}
                                className={({ isActive }) =>
                                    `rare-sheet-row ${rowClass(isActive)}`
                                }
                                style={{
                                    "--d": `${140 + secondaryItems.length * 40}ms`,
                                }}
                            >
                                {({ isActive }) => (
                                    <>
                                        <span className={tileClass(isActive, slateTone)}>
                                            <Settings2 size={20} />
                                        </span>

                                        <span className="min-w-0 flex-1 truncate">
                                            Settings
                                        </span>

                                        <ChevronRight
                                            size={18}
                                            className={chevronClass(isActive)}
                                        />
                                    </>
                                )}
                            </NavLink>
                        </div>
                    </div>
                </div>

                {/* Pinned footer */}
                <div className="shrink-0 border-t border-[#e6ddcf] bg-[#fffdfa] p-4 md:px-6 md:py-5">
                    <button
                        type="button"
                        onClick={onLogout}
                        disabled={loading}
                        className="
                            group flex w-full items-center justify-center gap-2
                            rounded-2xl bg-[#211e1a] px-4 py-3.5
                            text-sm font-semibold text-white
                            transition-all duration-200 ease-out
                            hover:bg-[#38332c]
                            hover:shadow-[0_10px_24px_rgba(33,30,26,0.24)]
                            active:scale-[0.98]
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-[#211e1a]/40 focus-visible:ring-offset-2
                            disabled:pointer-events-none disabled:opacity-50
                            motion-reduce:transition-none
                        "
                    >
                        <LogOut
                            size={18}
                            className="
                                transition-transform duration-300 ease-out
                                group-hover:translate-x-0.5
                                motion-reduce:transition-none
                                motion-reduce:group-hover:translate-x-0
                            "
                        />
                        Sign Out
                    </button>
                </div>
            </dialog>
        </div>,
        document.body
    );
}