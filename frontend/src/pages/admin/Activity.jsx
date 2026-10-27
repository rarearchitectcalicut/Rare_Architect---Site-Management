import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, ArrowLeft, ChevronLeft, ChevronRight, History, RefreshCw, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { activityApi, activityPage } from "../../api/activityApi";
import ActivityEntry from "../../components/activity/ActivityEntry";
import LoadingScreen from "../../components/LoadingScreen";
import { formatText, getError } from "../../components/approvals/approvalUtils";

const entityTypes = ["USER", "CATEGORY", "PROJECT", "TASK", "TASK_BATCH", "TASK_CHANGE_REQUEST", "DAILY_REPORT", "DAILY_TASK_WORK", "DAILY_MANPOWER", "DAILY_MATERIAL", "DAILY_REPORT_ATTACHMENT", "DELAY_REPORT", "PROJECT_DOCUMENT", "TASK_DOCUMENT"];
const filterKeys = ["search", "entity_type", "action", "actor", "entity_id", "date_from", "date_to"];
const input = "mt-2 w-full rounded-xl border border-[#E7DED2] bg-[#F8F5F0] px-3 py-3 text-sm text-[#211E1A] outline-none transition-colors hover:border-[#C9B9A4] focus:border-[#A58A67] focus:bg-[#FFFDFA] focus:ring-2 focus:ring-[#E8DDD0]/60 motion-reduce:transition-none";
const secondary = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#E7DED2] bg-[#FFFDFA] px-4 py-3 text-xs font-semibold text-[#665C50] transition-colors hover:bg-[#F5F0E8] focus-visible:outline-2 focus-visible:outline-[#A58A67] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none";
const uuidPattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

function ActivityFilters({ filters, onApply, onReset }) {
    const [draft, setDraft] = useState(filters);
    const [error, setError] = useState("");
    function change(key, value) { setDraft((current) => ({ ...current, [key]: value })); setError(""); }
    function submit(event) {
        event.preventDefault();
        if (draft.date_from && draft.date_to && draft.date_from > draft.date_to) { setError("End date must be on or after start date."); return; }
        onApply(draft);
    }
    return <form onSubmit={submit} className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] p-4 shadow-[0_4px_24px_#422F1605] sm:p-6">
        <div className="mb-5 flex items-center gap-2.5 border-b border-[#EEE6DC] pb-4"><SlidersHorizontal size={17} className="text-[#A38D72]" aria-hidden="true" /><h2 className="text-sm font-semibold">Explore the audit trail</h2></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-medium text-[#716658] sm:col-span-2">Search all activity<span className="relative block"><Search size={16} className="pointer-events-none absolute left-3 top-6 text-[#A38D72]" aria-hidden="true" /><input type="search" maxLength={200} value={draft.search} onChange={(e) => change("search", e.target.value)} className={`${input} pl-10`} placeholder="Person, project, action or description" /></span></label>
        </div><details className="rare-filter-disclosure"><summary>Filters and date range</summary>
            <div className="grid gap-4 pt-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[#716658]">Area<select value={draft.entity_type} onChange={(e) => change("entity_type", e.target.value)} className={input}><option value="">All areas</option>{entityTypes.map((type) => <option key={type} value={type}>{formatText(type)}</option>)}</select></label>
            <label className="text-xs font-medium text-[#716658]">Action code<input value={draft.action} onChange={(e) => change("action", e.target.value.toUpperCase().trim())} maxLength={100} className={input} placeholder="e.g. TASK_APPROVED" /></label>
            <label className="text-xs font-medium text-[#716658]">From date (UTC)<input type="date" value={draft.date_from} onChange={(e) => change("date_from", e.target.value)} className={input} /></label>
            <label className="text-xs font-medium text-[#716658]">To date (UTC)<input type="date" min={draft.date_from || undefined} value={draft.date_to} onChange={(e) => change("date_to", e.target.value)} className={input} /></label>
            </div></details>
        <div>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2"><button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-xs font-semibold text-[#FFFDFA] transition-colors hover:bg-[#44382B] focus-visible:outline-2 focus-visible:outline-[#A58A67] motion-reduce:transition-none"><Search size={15} aria-hidden="true" />Apply filters</button><button type="button" onClick={onReset} className={secondary}>Reset</button></div>
        </div>
        <details className="mt-5 border-t border-[#EEE6DC] pt-4" open={Boolean(filters.actor || filters.entity_id)}>
            <summary className="w-fit cursor-pointer rounded-lg text-xs font-medium text-[#8B6944] focus-visible:outline-2 focus-visible:outline-[#A58A67]">Filter by record references</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {[["actor", "Actor reference"], ["entity_id", "Entity reference"]].map(([key, label]) => <label key={key} className="text-xs text-[#716658]">{label}<input value={draft[key]} pattern={uuidPattern} title="Enter a valid UUID reference" onChange={(e) => change(key, e.target.value)} className={input} placeholder="UUID" /></label>)}
            </div>
        </details>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </form>;
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
        setParams(query);
    }
    function changePage(next) {
        const query = new URLSearchParams(params);
        query.set("page", String(next));
        setParams(query);
    }
    const data = visible?.data;
    const totalPages = data?.paginated ? Math.max(1, Math.ceil(data.count / pageSize)) : 1;

    return <div className="rare-activity mx-auto min-w-0 max-w-[1400px] space-y-6 pb-8 text-[#211E1A]">
        <style>{`
            @keyframes activity-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            .rare-activity .activity-enter { animation: activity-enter 350ms ease-out both; }
            .rare-activity a:focus-visible, .rare-activity button:focus-visible { outline: 2px solid #A58A67; outline-offset: 4px; }
            @media (prefers-reduced-motion: reduce) { .rare-activity .activity-enter { animation: none; } }
        `}</style>
        <Link to="/admin/dashboard" className="inline-flex items-center gap-2 text-xs font-medium text-[#716658] hover:text-[#211E1A]"><ArrowLeft size={14} aria-hidden="true" />Dashboard</Link>
        <header className="rare-page-header activity-enter rounded-[28px] border border-[#E7DED2] bg-[#FFFDFA] p-6 text-[#211E1A] shadow-[0_16px_36px_#211E1A12] sm:p-9">
            <div className="flex flex-wrap items-start justify-between gap-5"><div className="min-w-0 flex-1 basis-64"><p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#716658]"><Activity size={14} aria-hidden="true" />System oversight</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Activity logs</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#716658]">A chronological record of recorded system activity, from project updates to task decisions and account changes.</p></div>
                <button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)} className="flex items-center gap-2 rounded-xl border border-[#887258]/50 bg-[#F1EADF] px-4 py-3 text-xs font-semibold text-[#211E1A] hover:bg-[#E7DED2] disabled:opacity-50"><RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />Refresh</button>
            </div>
            <p className="mt-4 flex items-center gap-2 border-t border-[#E7DED2] pt-3 text-xs text-[#716658]"><ShieldCheck size={15} aria-hidden="true" />Admin access · Read-only audit trail</p>
        </header>
        <ActivityFilters key={filterKey} filters={filters} onApply={applyFilters} onReset={() => setParams({})} />
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">Recorded activity</h2><p role="status" className="mt-1 text-xs text-[#716658]">{loading ? "Loading events…" : data ? `${data.count.toLocaleString("en-IN")} matching events · Newest first` : "Activity unavailable"}</p></div>
            <label className="flex items-center gap-2 text-xs text-[#716658]">Per page<select value={pageSize} onChange={(e) => { const query = new URLSearchParams(params); query.set("page_size", e.target.value); query.delete("page"); setParams(query); }} className="rounded-xl border border-[#E7DED2] bg-[#FFFDFA] px-3 py-2 text-[#211E1A]">{[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        </div>
        {loading && <LoadingScreen message="Loading activity logs..." />}
        {visible?.error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><p>{visible.error}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" className={secondary} onClick={() => setRevision((value) => value + 1)}>Try again</button>{page > 1 && <button type="button" className={secondary} onClick={() => changePage(1)}>Return to first page</button>}</div></div>}
        {data && <>
            <div className="space-y-3" aria-label="Activity events">{data.rows.map((entry) => <ActivityEntry key={entry.id} entry={entry} />)}</div>
            {!data.rows.length && <div className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] px-6 py-12 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#A38D72]"><History size={25} aria-hidden="true" /></span><h3 className="mt-5 font-semibold">No activity found</h3><p className="mt-2 text-sm text-[#716658]">Try adjusting your filters. Events appear here when supported system actions are recorded.</p></div>}
            <nav aria-label="Activity pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E0D5C6] pt-3 text-xs"><button type="button" disabled={!data.previous} onClick={() => changePage(page - 1)} className={secondary}><ChevronLeft size={15} aria-hidden="true" />Previous</button><span className="text-[#716658]">Page <strong className="font-semibold text-[#211E1A]">{data.paginated ? page : 1}</strong> of {totalPages}</span><button type="button" disabled={!data.next} onClick={() => changePage(page + 1)} className={secondary}>Next<ChevronRight size={15} aria-hidden="true" /></button></nav>
        </>}
    </div>;
}
