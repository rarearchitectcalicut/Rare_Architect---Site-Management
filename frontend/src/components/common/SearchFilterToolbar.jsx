import { useEffect, useRef, useState } from "react";
import { Filter, X } from "lucide-react";

export default function SearchFilterToolbar({
    search,
    children,
    actions,
    activeCount = 0,
    onClear,
    onApply,
    label = "Search and filters",
}) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ top: 16, right: 12 });
    const triggerRef = useRef(null);
    const closeRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const trigger = triggerRef.current;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeRef.current?.focus();
        return () => {
            document.body.style.overflow = previousOverflow;
            if (trigger?.isConnected) trigger.focus();
            else previousFocus?.focus?.();
        };
    }, [open]);

    function close() {
        setOpen(false);
    }

    function openFilters(event) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const panelWidth = Math.min(448, window.innerWidth - 24);
        setPosition({
            top: Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight * 0.15)),
            right: Math.max(12, Math.min(window.innerWidth - bounds.right, window.innerWidth - panelWidth - 12)),
        });
        setOpen(true);
    }

    function onKeyDown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== "Tab") return;
        const focusable = [...event.currentTarget.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )].filter((element) => element.getClientRects().length > 0);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !event.currentTarget.contains(document.activeElement))) {
            event.preventDefault();
            first.focus();
        }
    }

    return <section aria-label={label} className="space-y-3">
        <div className="flex w-full min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1">{search}</div>
            {actions}
            <button
                ref={triggerRef}
                type="button"
                onClick={openFilters}
                aria-label={`Filters, ${activeCount} active ${activeCount === 1 ? "filter" : "filters"}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls="search-filter-dialog"
                className="relative flex h-11 min-h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#E7DED2] bg-[#FFFDFA] text-[#211E1A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A] min-[481px]:w-auto min-[481px]:px-3"
            >
                <Filter size={18} aria-hidden="true" />
                <span className="hidden min-[481px]:inline">Filters</span>
                {activeCount > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#211E1A] px-1 text-xs font-semibold text-[#FFFDFA]">{activeCount}</span>}
            </button>
        </div>
        <div hidden={!open} className="fixed inset-0 z-[100] bg-[#211E1A]/45 min-[481px]:bg-transparent" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
            <div
                id="search-filter-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="search-filter-title"
                onKeyDown={onKeyDown}
                style={{ "--filter-popover-top": `${position.top}px`, "--filter-popover-right": `${position.right}px` }}
                className="fixed inset-x-0 bottom-0 top-auto m-0 flex max-h-[85dvh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-[#E7DED2] bg-[#FFFDFA] p-0 text-[#211E1A] shadow-[0_-12px_36px_rgba(33,30,26,0.18)] min-[481px]:inset-x-auto min-[481px]:top-[var(--filter-popover-top)] min-[481px]:right-[var(--filter-popover-right)] min-[481px]:bottom-auto min-[481px]:max-h-[min(75dvh,42rem)] min-[481px]:w-[min(28rem,calc(100vw-1.5rem))] min-[481px]:rounded-2xl min-[481px]:shadow-[0_12px_36px_rgba(33,30,26,0.18)]"
            >
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#EEE6DC] px-4 py-3">
                    <h2 id="search-filter-title" className="text-base font-semibold">Filters and sorting</h2>
                    <button ref={closeRef} type="button" onClick={close} aria-label="Close filters" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"><X size={20} aria-hidden="true" /></button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
                <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[#EEE6DC] bg-[#FFFDFA] p-4">
                    {onClear && <button type="button" onClick={onClear} className="rare-button rare-button-secondary min-h-11 px-4 py-2 text-xs font-semibold">Clear all</button>}
                    <button type="button" onClick={() => { onApply?.(); close(); }} className="rare-button rare-button-primary min-h-11 px-4 py-2 text-xs font-semibold">Apply</button>
                </footer>
            </div>
        </div>
    </section>;
}
