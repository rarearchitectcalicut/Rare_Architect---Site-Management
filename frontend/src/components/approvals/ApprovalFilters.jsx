import { useEffect, useRef, useState } from "react";
import { Filter, X } from "lucide-react";
import { ProjectSearch } from "../daily-reports/ReportProjectPicker";
import SearchFilterToolbar from "../common/SearchFilterToolbar";
import { formatText, referenceId } from "./approvalUtils";
import { requestLabels, delayTypes } from "./queueData";

const input = "mt-2 h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-xs font-medium text-muted outline-none focus:border-info focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const delayFilterKeys = ["project", "projectSearch", "status", "delayType", "extension", "date_from", "date_to"];
const sortOptions = [["newest", "Newest first"], ["oldest", "Oldest first"]];

export default function ApprovalFilters(props) {
    if (props.mode === "delays") return <DelayReportFilters {...props} />;
    return <GenericApprovalFilters {...props} />;
}

function GenericApprovalFilters({ filters, onChange, onClear, projects, mode = "tasks", projectsUnavailable = false, suggestions = [], loading = false }) {
    const [searchReset, setSearchReset] = useState(0);
    const categories = [...new Map(projects.map((project) => [referenceId(project.category), project.category_name || project.category?.name || "Category"])).entries()].filter(([id]) => id);
    function select(key, label, options) {
        return <label className="min-w-0 text-xs font-semibold text-muted">{label}<select aria-label={label} value={filters[key]} onChange={(event) => onChange(key, event.target.value)} className={input} disabled={projectsUnavailable && ["project", "category"].includes(key)}>
            <option value="">All {label.toLowerCase()}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select></label>;
    }
    const activeKeys = ["project", "category", "priority", "status", "type", "task_search", "reviewer_search", "date_from", "date_to", "date", "sort"];
    const activeCount = activeKeys.reduce((total, key) => total + Number(Boolean(filters[key]) && !(key === "sort" && filters.sort === "oldest")), 0);
    return <div className="border-b border-border p-4 sm:p-5">
        <SearchFilterToolbar
            label="Approval search and filters"
            search={<ProjectSearch compact key={searchReset} query={filters.search} onSearch={(value) => onChange("search", value)} delay={mode === "history" ? 300 : 0} label="Search requests" labelClassName="sr-only" placeholder="Task, project or supervisor" suggestions={suggestions} loading={loading} />}
            activeCount={activeCount}
            onClear={() => { setSearchReset((value) => value + 1); onClear(); }}
        >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="min-w-0 text-xs font-semibold text-muted">Sort approvals<select aria-label="Sort approvals" value={filters.sort} onChange={(event) => onChange("sort", event.target.value)} className={input}>
                    <option value="oldest">Oldest first</option>
                    <option value="newest">Newest first</option>
                    {!["history"].includes(mode) && <><option value="priority">Highest priority</option><option value="project">Project A–Z</option><option value="title">Task A–Z</option></>}
                </select></label>
                {select("project", "Projects", projects.map((project) => [String(project.id), project.name]))}
                {select("category", "Categories", categories)}
                {mode === "tasks" && select("priority", "Priorities", ["URGENT", "HIGH", "MEDIUM", "LOW"].map((value) => [value, formatText(value)]))}
                {["history", "work"].includes(mode) && select("status", "Statuses", (mode === "history" ? ["APPROVED", "REJECTED", "VERIFIED"] : ["PENDING", "VERIFIED", "REJECTED"]).map((value) => [value, formatText(value)]))}
                {mode === "history" && select("type", "Request types", Object.entries({ ...requestLabels, work: "Daily Work" }))}
                {mode === "history" && <>
                    {[["task_search", "Task name"], ["reviewer_search", "Reviewer name"]].map(([key, label]) => <ProjectSearch key={`${key}-${searchReset}`} query={filters[key]} onSearch={(value) => onChange(key, value)} label={label} />)}
                    {[["date_from", "Decisions from"], ["date_to", "Decisions through"]].map(([key, label]) => <label key={key} className="text-xs text-muted">{label}<input type="date" value={filters[key]} onChange={(event) => onChange(key, event.target.value)} className={input} /></label>)}
                </>}
                {mode === "work" && <label className="text-xs text-muted">Report date<input type="date" value={filters.date} onChange={(event) => onChange("date", event.target.value)} className={input} /></label>}
            </div>
            {projectsUnavailable && <p role="status" className="mt-4 text-xs text-warning">Project and category filters are unavailable. Refresh to retry.</p>}
        </SearchFilterToolbar>
    </div>;
}

function DelayReportFilters({ filters, onChange, onClear, projects, suggestions = [], loading = false, count = 0 }) {
    const [searchReset, setSearchReset] = useState(0);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const filtersKey = JSON.stringify(filters);
    const [draftState, setDraftState] = useState(() => ({ key: filtersKey, value: filters }));
    let draft = draftState.value;
    if (!filtersOpen && draftState.key !== filtersKey) {
        draft = JSON.parse(filtersKey);
        setDraftState({ key: filtersKey, value: draft });
    }
    const [popoverPosition, setPopoverPosition] = useState({ top: 16, right: 16 });
    const triggerRef = useRef(null);
    const closeRef = useRef(null);
    const activeFilterCount = delayFilterKeys.reduce((total, key) => total + Number(Boolean(filters[key])), 0);
    const hasActiveFilters = Boolean(filters.search) || activeFilterCount > 0;

    useEffect(() => {
        if (!filtersOpen) return undefined;
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
    }, [filtersOpen]);

    function closeFilters() {
        setFiltersOpen(false);
    }

    function openFilters(event) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const panelWidth = Math.min(448, window.innerWidth - 24);
        const right = Math.max(12, Math.min(window.innerWidth - bounds.right, window.innerWidth - panelWidth - 12));
        setPopoverPosition({
            top: Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight * 0.15)),
            right,
        });
        setDraftState({ key: filtersKey, value: filters });
        setFiltersOpen(true);
    }

    function updateDraft(key, value) {
        setDraftState((current) => ({ ...current, key: filtersKey, value: { ...current.value, [key]: value } }));
    }

    function clearAll() {
        setDraftState({ key: filtersKey, value: { ...filters, search: "", project: "", projectSearch: "", status: "", delayType: "", extension: "", date_from: "", date_to: "", sort: "newest" } });
        setSearchReset((value) => value + 1);
        onClear();
    }

    function apply() {
        [...delayFilterKeys, "sort"].forEach((key) => onChange(key, draft[key] || ""));
        closeFilters();
    }

    function trapFocus(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            closeFilters();
            return;
        }
        if (event.key !== "Tab") return;
        const focusable = [...event.currentTarget.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

    function select(key, label, options, allLabel) {
        return <label className="block min-w-0 text-xs font-semibold text-muted">{label}<select aria-label={label} value={draft[key] || ""} onChange={(event) => updateDraft(key, event.target.value)} className={input}>
            <option value="">{allLabel || `All ${label.toLowerCase()}`}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select></label>;
    }

    return <div className="space-y-4 border-b border-border p-4 sm:p-5">
        <div className="flex w-full min-w-0 items-center gap-3">
            <ProjectSearch
                key={searchReset}
                compact
                query={filters.search}
                onSearch={(value) => onChange("search", value)}
                delay={300}
                label="Search task, project or supervisor"
                labelClassName="sr-only"
                placeholder="Search task, project or supervisor"
                suggestions={suggestions}
                loading={loading}
                className="min-w-0 flex-1"
            />
            <button
                ref={triggerRef}
                type="button"
                onClick={(event) => { if (filtersOpen) closeFilters(); else openFilters(event); }}
                aria-label={`Filters, ${activeFilterCount} active ${activeFilterCount === 1 ? "filter" : "filters"}`}
                aria-haspopup="dialog"
                aria-expanded={filtersOpen}
                aria-controls="delay-report-filters-dialog"
                className="relative flex h-11 min-h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink min-[481px]:w-auto min-[481px]:px-3"
            >
                <Filter size={18} aria-hidden="true" />
                <span className="hidden min-[481px]:inline">Filters</span>
                {activeFilterCount > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-xs font-semibold text-surface">{activeFilterCount}</span>}
            </button>
            <label className="hidden w-36 shrink-0 text-xs font-semibold text-muted min-[481px]:block">
                <span className="sr-only">Sort delay reports</span>
                <select aria-label="Sort delay reports" value={filters.sort || "newest"} onChange={(event) => onChange("sort", event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-xs font-medium text-muted outline-none focus:border-info focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                    {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
            </label>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
            <p role="status" aria-live="polite" aria-atomic="true" className="min-w-0 truncate text-sm font-medium text-muted">{loading ? "Updating delay reports..." : `${Number(count).toLocaleString("en-IN")} delay ${count === 1 ? "report" : "reports"}`}</p>
            {hasActiveFilters && <button type="button" onClick={clearAll} className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-semibold text-info focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">Clear filters</button>}
        </div>
        <div hidden={!filtersOpen} className="fixed inset-0 z-[100] bg-ink/45 min-[481px]:bg-transparent" onClick={(event) => { if (event.target === event.currentTarget) closeFilters(); }}>
        <div
            id="delay-report-filters-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delay-report-filters-title"
            onKeyDown={trapFocus}
            style={{ "--filter-popover-top": `${popoverPosition.top}px`, "--filter-popover-right": `${popoverPosition.right}px` }}
            className="fixed inset-x-0 bottom-0 top-auto m-0 flex max-h-[85dvh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl border border-border bg-surface p-0 text-ink shadow-[0_-12px_36px_rgba(33,30,26,0.18)] min-[481px]:inset-x-auto min-[481px]:top-[var(--filter-popover-top)] min-[481px]:right-[var(--filter-popover-right)] min-[481px]:bottom-auto min-[481px]:max-h-[min(75dvh,42rem)] min-[481px]:w-[min(28rem,calc(100vw-1.5rem))] min-[481px]:rounded-2xl min-[481px]:shadow-[0_12px_36px_rgba(33,30,26,0.18)]"
        >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
                <h2 id="delay-report-filters-title" className="text-base font-semibold">Filters and sorting</h2>
                <button ref={closeRef} type="button" onClick={closeFilters} aria-label="Close filters" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <div className="grid min-w-0 gap-4 min-[481px]:grid-cols-2">
                    {!projects.length
                        ? <div className="min-w-0"><ProjectSearch compact query={draft.projectSearch || ""} onSearch={(value) => updateDraft("projectSearch", value)} delay={0} label="Project name" labelClassName="mb-2 block text-xs font-semibold text-muted" className="w-full" /></div>
                        : select("project", "Projects", projects.map((project) => [String(project.id), project.name]), "All projects")}
                    {select("status", "Statuses", ["PENDING", "APPROVED", "REJECTED"].map((value) => [value, formatText(value)]))}
                    {select("delayType", "Delay types", delayTypes.map((value) => [value, formatText(value)]))}
                    {select("extension", "Extensions", [["REQUESTED", "Extension requested"], ["NONE", "Not requested"], ["PENDING", "Pending extension"], ["APPROVED", "Approved extension"], ["REJECTED", "Rejected extension"]])}
                    {[["date_from", "Reported from"], ["date_to", "Reported through"]].map(([key, label]) => <label key={key} className="block min-w-0 text-xs font-semibold text-muted">{label}<input type="date" aria-label={label} value={draft[key] || ""} onChange={(event) => updateDraft(key, event.target.value)} className={input} /></label>)}
                    <label className="block min-w-0 text-xs font-semibold text-muted min-[481px]:hidden">Sort by<select aria-label="Sort delay reports" value={draft.sort || "newest"} onChange={(event) => updateDraft("sort", event.target.value)} className={input}>
                        {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select></label>
                </div>
            </div>
            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface p-4">
                <button type="button" onClick={clearAll} className="rare-button rare-button-secondary min-h-11 px-4 py-2 text-xs font-semibold">Clear all</button>
                <button type="button" onClick={apply} className="rare-button rare-button-primary min-h-11 px-4 py-2 text-xs font-semibold">Apply</button>
            </footer>
        </div>
        </div>
    </div>;
}
