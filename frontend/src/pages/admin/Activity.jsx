import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, ArrowLeft, ChevronLeft, ChevronRight, History, RefreshCw, ShieldCheck } from "lucide-react";
import { activityApi, activityPage } from "../../api/activityApi";
import ActivityEntry, { DesktopActivityEntry } from "../../components/activity/ActivityEntry";
import LoadingScreen from "../../components/LoadingScreen";
import { formatText, getError } from "../../components/approvals/approvalUtils";

import { ProjectSearch } from "../../components/daily-reports/ReportProjectPicker";
import SearchFilterToolbar from "../../components/common/SearchFilterToolbar";

const entityTypes = ["USER", "CATEGORY", "PROJECT", "TASK", "TASK_BATCH", "TASK_CHANGE_REQUEST", "DAILY_REPORT", "DAILY_TASK_WORK", "DAILY_MANPOWER", "DAILY_MATERIAL", "DAILY_REPORT_ATTACHMENT", "DELAY_REPORT", "PROJECT_DOCUMENT", "TASK_DOCUMENT"];
const filterKeys = ["search", "entity_type", "action", "actor", "entity_id", "date_from", "date_to"];
const input = "mt-2 w-full rounded-xl border border-border bg-surface-soft px-3 py-3 text-sm text-ink outline-none transition-colors hover:border-border-strong focus:border-subtle focus:bg-surface focus:ring-2 focus:ring-pastel-lavender/60 motion-reduce:transition-none";
const secondary = "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-xs font-semibold text-muted transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-subtle disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none";
const uuidPattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

function ActivityFilters({ filters, onApply, onReset, records = [] }) {
    const people = [...new Map(records.filter((record) => record.actor_id || record.actor).map((record) => [record.actor_id || record.actor, record.actor_name || "Unavailable user"]))];
    const subjects = [...new Map(records.filter((record) => record.entity_id).map((record) => [record.entity_id, record.subject_name || record.project_name || formatText(record.entity_type)]))];
    const [draft, setDraft] = useState(filters);
    const appliedKey = JSON.stringify(filters);
    const [previousAppliedKey, setPreviousAppliedKey] = useState(appliedKey);
    if (appliedKey !== previousAppliedKey) { setPreviousAppliedKey(appliedKey); setDraft(JSON.parse(appliedKey)); }
    const [searchReset, setSearchReset] = useState(0);
    const [error, setError] = useState("");
    function change(key, value) {
        const next = { ...draft, [key]: value };
        setDraft(next); setError("");
        if (next.date_from && next.date_to && next.date_from > next.date_to) { setError("End date must be on or after start date."); return; }
        for (const field of ["actor", "entity_id"]) {
            if (next[field] && !new RegExp(`^${uuidPattern}$`).test(next[field])) { setError("Choose a person or record from the available options."); return; }
        }
        onApply(next);
    }
    return <SearchFilterToolbar
        label="Activity search and filters"
        search={<ProjectSearch compact key={searchReset} query={filters.search} onSearch={(value) => change("search", value)} label="Search all activity" labelClassName="sr-only" placeholder="Person, project, action or description" />}
        activeCount={filterKeys.filter((key) => key !== "search" && Boolean(filters[key])).length}
        onClear={() => { setSearchReset((value) => value + 1); onReset(); }}
    >
            <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted">Area<select value={draft.entity_type} onChange={(e) => change("entity_type", e.target.value)} className={input}><option value="">All areas</option>{entityTypes.map((type) => <option key={type} value={type}>{formatText(type)}</option>)}</select></label>
            <label className="text-xs font-medium text-muted">Action code<input value={draft.action} onChange={(e) => change("action", e.target.value.toUpperCase().trim())} maxLength={100} className={input} placeholder="e.g. TASK_APPROVED" /></label>
            <label className="text-xs font-medium text-muted">From date (UTC)<input type="date" value={draft.date_from} onChange={(e) => change("date_from", e.target.value)} className={input} /></label>
            <label className="text-xs font-medium text-muted">To date (UTC)<input type="date" min={draft.date_from || undefined} value={draft.date_to} onChange={(e) => change("date_to", e.target.value)} className={input} /></label>
            </div>
            <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                {[["actor", "Person", people], ["entity_id", "Record", subjects]].map(([key, label, options]) => <label key={key} className="text-xs text-muted">{label}<select aria-label={label} value={draft[key]} onChange={(e) => change(key, e.target.value)} className={input}><option value="">All {key === "actor" ? "people" : "records"}</option>{draft[key] && !options.some(([id]) => id === draft[key]) && <option value={draft[key]}>Selected {label.toLowerCase()}</option>}{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><span className="mt-1 block text-xs text-muted">Options from the displayed events</span></label>)}
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </SearchFilterToolbar>;
}

export default function AdminActivity() {
    const [params, setParams] = useSearchParams();
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState(null);
    const requestedPage = Number(params.get("page") || 1);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const requestedSize = Number(params.get("page_size") || 25);
    const pageSize = [10, 25, 50].includes(requestedSize) ? requestedSize : 25;
    const filters = Object.fromEntries(filterKeys.map((key) => [key, params.get(key) || ""]));
    const filterKey = JSON.stringify(filters);
    const requestKey = `${filterKey}:${page}:${pageSize}:${revision}`;
    const visible = result?.key === requestKey ? result : null;
    const loading = !visible;

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const query = Object.fromEntries(Object.entries(JSON.parse(filterKey)).filter(([, value]) => value));
                const data = activityPage(await activityApi.list({ ...query, page, page_size: pageSize }, controller.signal));
                if (!controller.signal.aborted) setResult({ key: requestKey, data });
            } catch (err) {
                if (!controller.signal.aborted) {
                    const fields = err.response?.data;
                    const messages = fields && typeof fields === "object" ? Object.values(fields).flat().filter((value) => typeof value === "string").join(" ") : "";
                    setResult({ key: requestKey, error: getError(err, messages || err.message || "Unable to load activity. Please try again.") });
                }
            }
        }
        load();
        return () => controller.abort();
    }, [filterKey, page, pageSize, requestKey]);

    function applyFilters(next) {
        const query = new URLSearchParams();
        for (const key of filterKeys) if (next[key]?.trim()) query.set(key, next[key].trim());
        if (pageSize !== 25) query.set("page_size", String(pageSize));
        setParams(query, { replace: true });
    }
    function changePage(next) {
        const query = new URLSearchParams(params);
        query.set("page", String(next));
        setParams(query);
    }
    const data = visible?.data;
    const totalPages = data?.paginated ? Math.max(1, Math.ceil(data.count / pageSize)) : 1;

    return <div className="rare-activity mx-auto min-w-0 max-w-[1400px] space-y-6 pb-8 text-ink">
        <style>{`
            @keyframes activity-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            .rare-activity .activity-enter { animation: activity-enter 350ms ease-out both; }
            .rare-activity a:focus-visible, .rare-activity button:focus-visible { outline: 2px solid var(--color-subtle); outline-offset: 4px; }
            @media (prefers-reduced-motion: reduce) { .rare-activity .activity-enter { animation: none; } }
        `}</style>
        <Link to="/admin/dashboard" className="inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-ink"><ArrowLeft size={14} aria-hidden="true" />Dashboard</Link>
        <header className="rare-page-header activity-enter rounded-[28px] border border-border bg-surface p-6 text-ink shadow-[0_16px_36px_#211E1A12] sm:p-9">
            <div className="flex flex-wrap items-start justify-between gap-5"><div className="min-w-0 flex-1 basis-64"><p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted"><Activity size={14} aria-hidden="true" />System oversight</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Activity logs</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted">A chronological record of recorded system activity, from project updates to task decisions and account changes.</p></div>
                <button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)} className="flex items-center gap-2 rounded-xl border border-muted/50 bg-app px-4 py-3 text-xs font-semibold text-ink hover:bg-border disabled:opacity-50"><RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />Refresh</button>
            </div>
            <p className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted"><ShieldCheck size={15} aria-hidden="true" />Admin access · Read-only audit trail</p>
        </header>
        <div className="activity-unified-toolbar hidden lg:flex"><p className="shrink-0 whitespace-nowrap text-xs text-muted"><strong className="text-ink">{loading ? "..." : data ? data.count.toLocaleString("en-IN") : "0"} events</strong><span> - newest first</span></p><div className="activity-unified-search min-w-0 flex-1"><ActivityFilters records={data?.rows || []} filters={filters} onApply={applyFilters} onReset={() => setParams({})} /></div><label className="shrink-0"><span className="sr-only">Events per page</span><select aria-label="Events per page" value={pageSize} onChange={(event) => { const query = new URLSearchParams(params); query.set("page_size", event.target.value); query.delete("page"); setParams(query); }} className="rounded-lg border border-border bg-surface px-2 text-xs text-muted">{[10, 25, 50].map((size) => <option key={size} value={size}>{size} per page</option>)}</select></label></div>
        <div className="activity-filter-wrapper"><ActivityFilters records={data?.rows || []} filters={filters} onApply={applyFilters} onReset={() => setParams({})} /></div>
        <div className="activity-register-caption flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">Recorded activity</h2><p role="status" className="mt-1 text-xs text-muted">{loading ? "Loading events…" : data ? `${data.count.toLocaleString("en-IN")} matching events · Newest first` : "Activity unavailable"}</p></div>
            <label className="activity-page-size flex items-center gap-2 text-xs text-muted"><span className="activity-per-page-label">Per page</span><select value={pageSize} onChange={(e) => { const query = new URLSearchParams(params); query.set("page_size", e.target.value); query.delete("page"); setParams(query); }} className="rounded-xl border border-border bg-surface px-3 py-2 text-ink">{[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        </div>
        {!result && loading && <LoadingScreen message="Loading activity logs..." />}
        {visible?.error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><p>{visible.error}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" className={secondary} onClick={() => setRevision((value) => value + 1)}>Try again</button>{page > 1 && <button type="button" className={secondary} onClick={() => changePage(1)}>Return to first page</button>}</div></div>}
        {data && <>
            <div className="space-y-3 lg:hidden" aria-label="Activity events">{data.rows.map((entry) => <ActivityEntry key={entry.id} entry={entry} />)}</div><section className="activity-desktop-table hidden lg:block" aria-label="Recorded activity">{data.rows.map((entry, index) => { const day = (value) => { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Date unavailable"; }; const label = day(entry.created_at); return <div key={entry.id}>{(index === 0 || label !== day(data.rows[index - 1].created_at)) && <h2 className="activity-day-heading">{label}</h2>}<DesktopActivityEntry entry={entry} /></div>; })}<footer className="border-t border-border px-5 py-4 text-xs text-muted">Showing {data.count ? (page - 1) * pageSize + 1 : 0}?{Math.min(page * pageSize, data.count)} of {data.count} events</footer></section>
            {!data.rows.length && <div className="rounded-[24px] border border-border bg-surface px-6 py-12 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-app text-subtle"><History size={25} aria-hidden="true" /></span><h3 className="mt-5 font-semibold">No activity found</h3><p className="mt-2 text-sm text-muted">Try adjusting your filters. Events appear here when supported system actions are recorded.</p></div>}
            <nav aria-label="Activity pages" className="rare-pagination border-t border-border pt-3 text-xs"><span className="activity-bottom-count hidden lg:block">Showing {data.count ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, data.count)} of {data.count} events</span><button type="button" disabled={!data.previous} onClick={() => changePage(page - 1)} className={secondary}><ChevronLeft size={15} aria-hidden="true" />Previous</button><span aria-live="polite" aria-atomic="true" className="text-muted">Page <strong className="font-semibold text-ink">{data.paginated ? page : 1}</strong> of {totalPages}</span><button type="button" disabled={!data.next} onClick={() => changePage(page + 1)} className={secondary}>Next<ChevronRight size={15} aria-hidden="true" /></button></nav>
        </>}
    </div>;
}
