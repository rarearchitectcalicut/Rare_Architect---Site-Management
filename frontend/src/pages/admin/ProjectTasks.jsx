import { TaskProgress } from "../../components/tasks/TaskExecutionActions";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Clock3, UserRound, CalendarDays, Filter, LayoutGrid, Layers3, List, ListOrdered, RefreshCw, X } from "lucide-react";
import { projectApi } from "../../api/projectApi";
import { isTaskId, isTaskOverdue, taskApi, taskRegisterPage } from "../../api/taskApi";
import LoadingScreen from "../../components/LoadingScreen";
import AdminTaskCard, { MobileTaskCard, TaskPageStyles } from "../../components/admin/tasks/AdminTaskCard";
import TimelineSummary from "../../components/timeline/TimelineSummary";
import TimelineSchedule from "../../components/timeline/TimelineSchedule";
import { formatDate, formatText, getError } from "../../components/approvals/approvalUtils";

import { ProjectSearch } from "../../components/daily-reports/ReportProjectPicker";
import SearchFilterToolbar from "../../components/common/SearchFilterToolbar";

const emptyFilters = { search: "", approval_status: "", work_status: "", priority: "", sort: "order" };
const control = "w-full min-w-0 rounded-xl border border-[#E7DED2] bg-[#F8F5F0] px-3 py-3 text-sm text-[#211E1A] hover:border-[#C9B9A4] focus:border-[#B7A58E] focus:bg-[#FFFDFA] focus:shadow-[0_0_0_3px_#E8DDD080] focus:outline-none";
const priorities = ["URGENT", "HIGH", "MEDIUM", "LOW"];

function filterProjectTasks(tasks, filters) {
    const query = filters.search.trim().toLowerCase();
    return tasks.filter((task) => ["approval_status", "work_status", "priority"].every((field) => !filters[field] || task[field] === filters[field]) &&
        (!query || [task.title, task.description, task.worker_name].some((value) => value?.toLowerCase().includes(query))))
        .sort((a, b) => {
            if (filters.sort === "priority") return priorities.indexOf(a.priority) - priorities.indexOf(b.priority) || a.display_order - b.display_order;
            if (filters.sort === "newest") return String(b.created_at).localeCompare(String(a.created_at));
            if (["start_date", "end_date"].includes(filters.sort)) return String(a[filters.sort] || "9999").localeCompare(String(b[filters.sort] || "9999"));
            return a.display_order - b.display_order || String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id);
        });
}

export default function AdminProjectTasks() {
    const { projectId } = useParams();
    return <ProjectTaskRegister key={projectId} projectId={projectId?.toLowerCase()} />;
}

export function AdminProjectTimeline() {
    const { projectId } = useParams();
    return <ProjectTaskRegister key={projectId} projectId={projectId?.toLowerCase()} timelineOnly />;
}

function ProjectTimeline({ tasks, projectId }) {
    const [view, setView] = useState("sequence");
    const [timelineSearch, setTimelineSearch] = useState("");
    const orderedTasks = filterProjectTasks(tasks, emptyFilters)
        .filter((task) => task.approval_status === "APPROVED" && task.work_status !== "CANCELLED");

    return <section id="project-timeline" aria-label="Project timeline" className="task-panel task-enter min-w-0 space-y-5 p-4 sm:p-7" style={{ "--task-delay": "120ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
                <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"><span className="rounded-xl bg-[#EEE5D8] p-2 text-[#8B6944]"><CalendarRange size={19} aria-hidden="true" /></span>Project timeline</h2>
                <p className="mt-2 max-w-xl text-xs leading-5 text-[#716658]">{orderedTasks.length} approved tasks · Planned sequence and schedule across the project.</p>
            </div>
            <div className="admin-timeline-controls"><div className="admin-timeline-search hidden lg:block"><ProjectSearch compact query={timelineSearch} onSearch={setTimelineSearch} label="Search timeline tasks" labelClassName="sr-only" placeholder="Search task or worker" /></div><div className="flex flex-wrap gap-1 rounded-2xl border border-[#E7DED2] bg-[#F5F0E9] p-1.5" aria-label="Timeline display">
                {[["sequence", "Numbered list"], ["schedule", "Schedule chart"]].map(([id, label]) => (
                    <button key={id} type="button" aria-label={label} title={label} aria-pressed={view === id} onClick={() => setView(id)}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold ${view === id ? "bg-[#211E1A] text-[#FFFDFA] shadow-sm" : "text-[#74614D] hover:bg-[#E7DED2]"}`}>
                        {id === "sequence" ? <ListOrdered size={15} aria-hidden="true" /> : <CalendarRange size={15} aria-hidden="true" />}<span className="lg:sr-only">{label}</span>
                    </button>
                ))}
            </div></div>
        </div>
        
        {!orderedTasks.length ? <p className="py-4 text-sm text-[#716658]">No approved tasks in the project timeline.</p> : <>
            {view === "schedule" && <TimelineSchedule tasks={orderedTasks} projectId={projectId}
                getTaskHref={(task) => `/admin/projects/${projectId}/tasks/${task.id}`} />}
            {view === "sequence" && <ol aria-label="Desktop task sequence" className="admin-timeline-task-grid hidden lg:grid">{orderedTasks.map((task, position) => ({ task, position })).filter(({ task }) => !timelineSearch || [task.title, task.worker_name].some((value) => value?.toLowerCase().includes(timelineSearch.toLowerCase()))).map(({ task, position }) => <li key={task.id} className="min-w-0"><details className="admin-timeline-expandable"><summary className="admin-timeline-task-card" style={{ borderLeftColor: task.work_status === "IN_PROGRESS" ? "#3977E8" : "#94826B" }}><span className="admin-timeline-position">{String(position + 1).padStart(2, "0")}</span><span className="min-w-0"><span className="block break-words text-base font-semibold">{task.title}</span><span className="mt-2 flex flex-wrap gap-1.5">{[task.approval_status, task.work_status, task.priority].filter(Boolean).map((value, index) => <span key={index} className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (value === "APPROVED" ? "bg-[#E7F2E8] text-[#296F40]" : value === "IN_PROGRESS" ? "bg-[#E2EBFC] text-[#3565A5]" : "bg-[#F1EADF] text-[#74614D]")}>{formatText(value)}</span>)}</span></span><span className="admin-timeline-task-meta"><span className="flex items-start gap-2"><UserRound size={14} className="mt-0.5 shrink-0" />{task.worker_name || "No worker assigned"}</span><span className="mt-2 flex items-start gap-2"><CalendarDays size={14} className="mt-0.5 shrink-0" /><span>{formatDate(task.start_date)} &rarr; {formatDate(task.end_date)}</span></span></span><span className="admin-timeline-task-open">View details<ChevronRight size={14} /></span></summary><div className="admin-timeline-expanded-details"><TaskProgress progress={task.progress} /><dl className="mt-4 grid grid-cols-2 gap-3">{[["Measurement", formatText(task.measurement_method)], ["Planned quantity", task.planned_quantity == null ? "Not applicable" : task.planned_quantity + " " + (task.measurement_unit || "")], ["Description", task.description || "Not specified"], ["Completion criteria", task.completion_criteria || "Not specified"]].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-[#F5F0E7] p-3"><dt className="text-xs text-[#716658]">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value}</dd></div>)}</dl><Link to={"/admin/projects/" + projectId + "/tasks/" + task.id} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#211E1A] px-4 py-2 text-xs font-semibold text-white">Open task<ArrowUpRight size={14} /></Link></div></details></li>)}</ol>}
            {view === "sequence" && <ol aria-label="Task sequence" className="max-h-[560px] space-y-2 overflow-y-auto p-1 pr-2">{orderedTasks.map((task, position) => (
                <li key={task.id} className={timelineSearch && ![task.title, task.worker_name].some((value) => value?.toLowerCase().includes(timelineSearch.toLowerCase())) ? "lg:hidden" : ""}>
                    <Link to={`/admin/projects/${projectId}/tasks/${task.id}`}
                        className="group flex min-w-0 items-start gap-3 rounded-2xl border border-transparent bg-[#F8F5F0] p-4 hover:border-[#D7C8B4] hover:bg-[#F2EBE1] sm:gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E7DED2] bg-[#FFFDFA] text-sm font-bold text-[#8B6944] transition-colors group-hover:border-[#B7A58E] group-hover:bg-[#211E1A] group-hover:text-[#FFFDFA]">
                            <span className="sr-only">Position </span>{String(position + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1 space-y-2">
                            <span className="block break-words text-sm font-bold">{task.title}</span>
                            <TaskProgress progress={task.progress} />
                            <span className="block text-xs text-[#716658]">Order {task.display_order} · {formatText(task.work_status)} · {formatText(task.priority)} priority</span>
                            <span className="block text-xs text-[#716658]">{formatDate(task.start_date)} – {formatDate(task.end_date)}</span>
                            <span className="block break-words text-xs text-[#716658]">{task.worker_name || "Worker/team not assigned"}</span>
                        </span>
                        <ArrowUpRight size={17} className="mt-3 shrink-0 text-[#A38D72]" aria-hidden="true" />
                    </Link>
                </li>
            ))}</ol>}
        </>}
    </section>;
}

const registerDefaults = {
    search: "", project: "", supervisor: "", approval_status: "", work_status: "", priority: "",
    start_from: "", start_to: "", end_from: "", end_to: "", overdue: "", sort: "order",
};

function GlobalTaskFilters({ filters, options, role, onApply, onReset }) {
    const [draft, setDraft] = useState(filters);
    const appliedKey = JSON.stringify(filters);
    const [previousAppliedKey, setPreviousAppliedKey] = useState(appliedKey);
    if (appliedKey !== previousAppliedKey) { setPreviousAppliedKey(appliedKey); setDraft(JSON.parse(appliedKey)); }
    const [error, setError] = useState("");
    function change(key, value) {
        const next = { ...draft, [key]: value };
        setDraft(next); setError("");
        for (const prefix of ["start", "end"]) {
            if (next[`${prefix}_from`] && next[`${prefix}_to`] && next[`${prefix}_from`] > next[`${prefix}_to`]) {
                setError(`Check the ${prefix}-date range: the upper date must follow the lower date.`); return;
            }
        }
        onApply(next);
    }
    function submit(event) {
        event.preventDefault();
        for (const prefix of ["start", "end"]) {
            if (draft[`${prefix}_from`] && draft[`${prefix}_to`] && draft[`${prefix}_from`] > draft[`${prefix}_to`]) {
                setError(`Check the ${prefix}-date range: the upper date must follow the lower date.`);
                return;
            }
        }
        onApply(draft);
    }
    function select(label, field, choices, allLabel = "All") {
        return <label className="text-xs font-medium text-[#716658]">{label}<select value={draft[field]} onChange={(event) => change(field, event.target.value)} className={`${control} mt-2`}>
            <option value="">{allLabel}</option>{choices.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
        </select></label>;
    }
    return <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
            {select(role === "ADMIN" ? "Project" : "Assigned project", "project", options.projects.map((project) => [project.id, project.name]), "All projects")}
            {role === "ADMIN" && select("Assigned Supervisor", "supervisor", options.supervisors.map((supervisor) => [supervisor.id, supervisor.name]), "All Supervisors")}
            {select("Approval status", "approval_status", ["PENDING", "APPROVED", "REJECTED"].map((value) => [value, formatText(value)]))}
            {select("Work status", "work_status", ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DELAYED", "CANCELLED"].map((value) => [value, formatText(value)]))}
            {select("Priority", "priority", priorities.map((value) => [value, formatText(value)]))}
            <label className="text-xs font-medium text-[#716658]">Sort by<select className={`${control} mt-2`} value={draft.sort} onChange={(event) => change("sort", event.target.value)}>{[["order", "Timeline order within project"], ["newest", "Newest"], ["oldest", "Oldest"], ["start_date", "Start date"], ["end_date", "End date"], ["priority", "Priority"], ["title", "Task name"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="grid gap-3 border-t border-[#EEE6DC] pt-3 lg:grid-cols-2">
            {[["start", "Planned start date"], ["end", "Planned end date"]].map(([prefix, title]) => <fieldset key={prefix} className="grid min-w-0 gap-3 sm:grid-cols-2"><legend className="mb-2 text-xs font-semibold text-[#665C50]">{title}</legend>
                <label className="text-xs text-[#716658]">From<input type="date" value={draft[`${prefix}_from`]} onChange={(event) => change(`${prefix}_from`, event.target.value)} className={`${control} mt-1`} /></label>
                <label className="text-xs text-[#716658]">To<input type="date" min={draft[`${prefix}_from`] || undefined} value={draft[`${prefix}_to`]} onChange={(event) => change(`${prefix}_to`, event.target.value)} className={`${control} mt-1`} /></label>
            </fieldset>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEE6DC] pt-3">
            <label className="flex min-h-11 items-center gap-2 text-xs font-medium text-[#665C50]"><input type="checkbox" checked={draft.overdue === "true"} onChange={(event) => change("overdue", event.target.checked ? "true" : "")} className="h-4 w-4 accent-[#211E1A]" />Overdue only</label>
            <div className="flex flex-wrap gap-2"><button type="button" className="task-secondary min-h-11 px-4 py-2 text-xs font-semibold" onClick={() => { setDraft(registerDefaults); setError(""); onReset(); }}>Clear all filters</button></div>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>;
}

function MobileTaskFilterSheet({ open, onClose, filters, options, role, onApply, onReset, triggerRef }) {
    const dialogRef = useRef(null);
    const closeRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const dialog = dialogRef.current;
        const trigger = triggerRef.current;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        if (dialog && !dialog.open) dialog.showModal();
        document.body.style.overflow = "hidden";
        closeRef.current?.focus();
        return () => {
            dialog?.close();
            document.body.style.overflow = previousOverflow;
            if (trigger?.isConnected) trigger.focus();
            else previousFocus?.focus?.();
        };
    }, [open, triggerRef]);

    function trapFocus(event) {
        if (event.key !== "Tab") return;
        const focusable = [...event.currentTarget.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    return <dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-task-filters-title"
        onCancel={(event) => { event.preventDefault(); onClose(); }}
        onKeyDown={trapFocus}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4 text-[#211E1A] shadow-[0_-12px_36px_rgba(33,30,26,0.18)] backdrop:bg-[#211E1A]/45 min-[768px]:inset-y-4 min-[768px]:right-4 min-[768px]:left-auto min-[768px]:top-4 min-[768px]:bottom-4 min-[768px]:m-0 min-[768px]:h-auto min-[768px]:max-h-none min-[768px]:w-[min(32rem,calc(100vw-2rem))] min-[768px]:rounded-2xl min-[768px]:shadow-[0_12px_36px_rgba(33,30,26,0.18)]"
    >
        <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="mobile-task-filters-title" className="text-base font-semibold">Filters and sorting</h2>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close filters" className="flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"><X size={20} aria-hidden="true" /></button>
        </div>
        <GlobalTaskFilters filters={filters} options={options} role={role} onApply={onApply} onReset={onReset} />
    </dialog>;
}

export function GlobalTaskRegister({ role = "ADMIN" }) {
    return <GlobalTaskRegisterPage key={role} role={role} />;
}

function GlobalTaskRegisterPage({ role }) {
    const [params, setParams] = useSearchParams();
    const [result, setResult] = useState(null);
    const [options, setOptions] = useState({ projects: [], supervisors: [] });
    const [revision, setRevision] = useState(0);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [layout, setLayout] = useState("grid");
    const filterButtonRef = useRef(null);
    const requestedPage = Number(params.get("page") || 1);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const requestedSize = Number(params.get("page_size") || 12);
    const pageSize = [12, 24, 48].includes(requestedSize) ? requestedSize : 12;
    const filters = Object.fromEntries(Object.entries(registerDefaults).map(([key, fallback]) => [key, params.get(key) || fallback]));
    if (role !== "ADMIN") filters.supervisor = "";
    const filterKey = JSON.stringify(filters);
    const requestKey = `${role}:${filterKey}:${page}:${pageSize}:${revision}`;
    const visible = result?.key === requestKey ? result : null;
    const loading = !visible;
    const data = visible?.data;
    const admin = role === "ADMIN";

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const query = Object.fromEntries(Object.entries(JSON.parse(filterKey)).filter(([, value]) => value));
                const parsed = taskRegisterPage(await taskApi.register({ ...query, page, page_size: pageSize }, controller.signal), page, pageSize);
                if (!controller.signal.aborted) {
                    const { filter_options: choices, ...pageData } = parsed;
                    setOptions(choices);
                    setResult({ key: requestKey, data: pageData });
                }
            } catch (err) {
                if (!controller.signal.aborted) {
                    const messages = Object.values(err.response?.data || {}).flat().filter((value) => typeof value === "string").join(" ");
                    setResult({ key: requestKey, error: getError(err, messages || err.message || "Unable to load the task register.") });
                }
            }
        }
        load();
        return () => controller.abort();
    }, [requestKey, filterKey, page, pageSize]);

    function applyFilters(next) {
        const query = new URLSearchParams();
        for (const key of Object.keys(registerDefaults)) {
            const value = next[key]?.trim();
            if (value && value !== registerDefaults[key] && (key !== "supervisor" || admin)) query.set(key, value);
        }
        if (pageSize !== 12) query.set("page_size", String(pageSize));
        setParams(query, { replace: true });
    }
    function changePage(next) { const query = new URLSearchParams(params); query.set("page", String(next)); setParams(query); }
    const pageCount = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1;
    const activeFilterCount = Object.entries(filters).filter(([key, value]) => key !== "search" && value && !(key === "sort" && value === "order")).length;
    const mobileChips = [
        { label: "All", count: data?.summary.total ?? 0, selected: !filters.work_status && filters.overdue !== "true", apply: () => applyFilters({ ...filters, work_status: "", overdue: "" }) },
        { label: "Not started", count: data?.summary.not_started ?? 0, selected: filters.work_status === "NOT_STARTED", apply: () => applyFilters({ ...filters, work_status: "NOT_STARTED", approval_status: "", overdue: "" }) },
        { label: "In progress", count: data?.summary.in_progress ?? 0, selected: filters.work_status === "IN_PROGRESS", apply: () => applyFilters({ ...filters, work_status: "IN_PROGRESS", approval_status: "", overdue: "" }) },
        { label: "Completed", count: data?.summary.completed ?? 0, selected: filters.work_status === "COMPLETED", apply: () => applyFilters({ ...filters, work_status: "COMPLETED", approval_status: "", overdue: "" }) },
        { label: "Overdue", count: data?.summary.overdue ?? 0, selected: filters.overdue === "true", apply: () => applyFilters({ ...filters, work_status: "", approval_status: "", overdue: filters.overdue === "true" ? "" : "true" }) },
    ];
    const taskHref = (task) => admin
        ? `/admin/projects/${task.project}/tasks/${task.id}`
        : `/supervisor/projects/${task.project}/tasks?task=${encodeURIComponent(task.id)}`;

    const projectSuggestions = (data?.results || []).map((task) => ({ id: task.id, name: task.title, context: task.project_name, to: taskHref(task) }));
    return <div className={`rare-tasks mx-auto w-full min-w-0 max-w-[1200px] space-y-4 overflow-x-hidden pb-8 text-[#211E1A] sm:space-y-5 task-register-desktop-theme`}>
        <TaskPageStyles />
        {!result && loading && <LoadingScreen message={admin ? "Loading all tasks..." : "Loading your assigned-project tasks..."} />}
        <header className="flex w-full items-center justify-between gap-3">
            <h1 className="min-w-0 truncate text-xl font-bold tracking-tight text-[#211E1A]">{admin ? "All Tasks" : "My Tasks"}</h1>
            <button type="button" aria-label="Refresh tasks" disabled={loading} onClick={() => setRevision((value) => value + 1)} className="rare-button rare-button-secondary ml-auto flex h-11 min-h-11 shrink-0 items-center gap-2 px-3 py-2 text-xs font-semibold">
                <RefreshCw size={16} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />Refresh
            </button>
        </header>
        <div className="task-register-search flex w-full min-w-0 items-center gap-2">
            <ProjectSearch query={filters.search} onSearch={(value) => applyFilters({ ...filters, search: value })} suggestions={projectSuggestions} loading={loading} delay={250} label="Search tasks" labelClassName="sr-only" placeholder="Search tasks" className="min-w-0 flex-1" />
            <button ref={filterButtonRef} type="button" onClick={() => setMobileFiltersOpen(true)} aria-label={`Filters and sorting, ${activeFilterCount} active filters`} className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#E7DED2] bg-[#FFFDFA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]">
                <Filter size={18} aria-hidden="true" />
                {activeFilterCount > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#211E1A] px-1 text-xs font-semibold text-[#FFFDFA]">{activeFilterCount}</span>}
            </button>
            <MobileTaskFilterSheet open={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} filters={filters} options={options} role={role} onApply={applyFilters} onReset={() => applyFilters(registerDefaults)} triggerRef={filterButtonRef} />
        </div>
        {data && <div aria-label="Filter tasks by status" className={`min-w-0 gap-2 overflow-x-auto pb-1 ${admin ? "hidden lg:flex" : "flex"}`}>
            {mobileChips.map((chip) => <button key={chip.label} type="button" aria-pressed={chip.selected} onClick={chip.apply} className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold ${chip.selected ? "border-[#211E1A] bg-[#211E1A] text-[#FFFDFA]" : "border-[#E7DED2] bg-[#FFFDFA] text-[#665C50]"}`}>{chip.label} {chip.count}</button>)}
        </div>}
        <div className="task-register-view flex w-full min-w-0 items-center justify-between gap-3">
            <p role="status" aria-live="polite" className="min-w-0 truncate text-sm font-medium text-[#716658]">{loading ? "Updating tasks..." : visible?.error ? "Tasks are unavailable" : `${data.count.toLocaleString("en-IN")} ${data.count === 1 ? "task" : "tasks"}`}</p>
            <div role="group" aria-label="Task view" className="ml-auto inline-flex shrink-0 gap-1 rounded-2xl border border-[#D8C7B2] bg-[#F1EADF] p-1">
                {[["list", "List", List], ["grid", "Gallery", LayoutGrid]].map(([value, label, Icon]) => <button key={value} type="button" aria-label={`${label} view`} aria-pressed={layout === value} onClick={() => setLayout(value)} className={`inline-flex h-11 w-11 min-h-11 items-center justify-center rounded-xl p-0 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] ${layout === value ? "bg-[#FFFDFA] text-[#352D24] shadow-sm" : "text-[#66543D] hover:bg-white/60"}`}><Icon size={18} aria-hidden="true" /></button>)}
            </div>
        </div>
        {visible?.error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><p>{visible.error}</p><p className="mt-2">Task results and totals are unavailable. Please retry or clear the filters.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="task-secondary px-4 py-2 text-xs font-semibold" onClick={() => setRevision((value) => value + 1)}>Retry</button>{page > 1 && <button type="button" className="task-secondary px-4 py-2 text-xs font-semibold" onClick={() => changePage(1)}>Return to first page</button>}</div></div>}
        {data && <>
            <div className={`grid gap-4 ${layout === "grid" ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 gap-3"}`}>
                {data.results.map((task) => admin
                    ? <div key={task.id} className="min-w-0"><div className={layout === "list" ? "lg:hidden" : "h-full"}><AdminTaskCard task={task} showProject compact={layout === "list"} actionLabel="View Details" to={taskHref(task)} approvalTo={task.approval_status === "PENDING" ? `/admin/approvals?tab=tasks&task=${task.id}&type=tasks` : undefined} /></div>{layout === "list" && <div className="hidden lg:block"><MobileTaskCard task={task} to={taskHref(task)} />{task.approval_status === "PENDING" && <Link to={`/admin/approvals?tab=tasks&task=${task.id}&type=tasks`} className="mt-2 inline-flex min-h-11 items-center px-3 text-xs font-semibold text-[#3565A5]">Open in Approval Center<ArrowUpRight size={14} /></Link>}</div>}</div>
                    : layout === "list"
                        ? <MobileTaskCard key={task.id} task={task} to={taskHref(task)} />
                        : <div key={task.id} className="contents"><div className="hidden min-[481px]:block"><AdminTaskCard task={task} showProject actionLabel="View Task" to={taskHref(task)} /></div><div className="min-[481px]:hidden"><MobileTaskCard task={task} to={taskHref(task)} /></div></div>)}
            </div>
            {!data.results.length && <div className="task-panel px-6 py-12 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#A38D72]"><Layers3 size={25} aria-hidden="true" /></span><h3 className="mt-5 font-semibold">No tasks found</h3><p className="mt-2 text-sm text-[#716658]">Try changing your filters. Tasks appear here when they are submitted for {admin ? "a project" : "one of your assigned projects"}.</p></div>}
            {pageCount > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E0D5C6] pt-4">
                <label className="flex items-center gap-2 text-xs font-medium text-[#716658]">Per page<select aria-label="Tasks per page" value={pageSize} onChange={(event) => { const query = new URLSearchParams(params); query.set("page_size", event.target.value); query.delete("page"); setParams(query); }} className="min-h-11 rounded-lg border border-[#E7DED2] bg-[#FFFDFA] px-2 py-2 text-[#211E1A]">{[12, 24, 48].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
                <nav aria-label="Task register pages" className="rare-pagination flex-1 text-xs"><button type="button" disabled={!data.previous} onClick={() => changePage(page - 1)} className="task-secondary flex items-center gap-1 px-3 py-3 font-semibold disabled:opacity-40"><ChevronLeft size={15} aria-hidden="true" />Previous</button><span aria-live="polite" aria-atomic="true" className="text-[#716658]">Page <strong className="text-[#211E1A]">{page}</strong> of {pageCount}</span><button type="button" disabled={!data.next} onClick={() => changePage(page + 1)} className="task-secondary flex items-center gap-1 px-3 py-3 font-semibold disabled:opacity-40">Next<ChevronRight size={15} aria-hidden="true" /></button></nav>
            </div>}
        </>}
    </div>;
}

function ProjectTaskRegister({ projectId, timelineOnly = false }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const [filters, setFilters] = useState(emptyFilters);
    const [page, setPage] = useState(1);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        async function load() {
            setLoading(true); setError(""); setData(null);
            try {
                if (!isTaskId(projectId)) throw new Error("Invalid project ID.");
                const [project, tasks] = await Promise.all([projectApi.getProject(projectId), taskApi.listComplete(projectId, controller.signal)]);
                if (active) { setData({ project, tasks }); setPage(1); }
            } catch (err) {
                if (active) { setError(getError(err, err.message || "Unable to load project tasks.")); controller.abort(); }
            } finally { if (active) setLoading(false); }
        }
        load();
        return () => { active = false; controller.abort(); };
    }, [projectId, revision]);

    const tasks = data?.tasks || [];
    const rows = filterProjectTasks(tasks, filters);
    const pageCount = Math.max(1, Math.ceil(rows.length / 12));
    const counts = [
        { label: "Total Tasks", value: tasks.length, icon: Layers3, tone: "bg-[#EEE5D8] text-[#8B6944]", caption: "Across this project" },
        { label: "Pending Approval", value: tasks.filter((t) => t.approval_status === "PENDING").length, icon: Clock3, tone: "bg-[#F8EFD9] text-[#94651D]", caption: "Awaiting a decision" },
        { label: "In Progress", value: tasks.filter((t) => t.work_status === "IN_PROGRESS").length, icon: CheckCircle2, tone: "bg-[#E8EFEB] text-[#49715D]", caption: "Work underway" },
        { label: "Overdue", value: tasks.filter((t) => isTaskOverdue(t)).length, icon: CalendarRange, tone: "bg-[#F6E7E1] text-[#AA6554]", caption: "Past the planned end date" },
    ];
    function change(key, value) { setFilters((current) => ({ ...current, [key]: value })); setPage(1); }

    return <div className={`rare-tasks mx-auto min-w-0 max-w-[1600px] space-y-6 pb-8 text-[#211E1A] sm:space-y-7 ${!timelineOnly ? "admin-project-task-page" : "admin-project-timeline-page"}`}>
        <TaskPageStyles />
        {loading && <LoadingScreen message="Loading complete project task register..." />}
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-[#716658]"><Link to="/admin/projects" className="hover:underline">Projects</Link><span aria-hidden="true">/</span><Link to={`/admin/projects/${projectId}`} className="hover:underline">Project Overview</Link><span aria-hidden="true">/</span><span aria-current="page">{timelineOnly ? "Timeline" : "Tasks"}</span></nav>
        <header className="rare-page-header task-hero task-enter relative overflow-hidden rounded-[28px] border border-black p-6 text-[#211E1A] sm:p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0 flex-1 basis-64">
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#716658]"><Layers3 size={14} aria-hidden="true" />Project workspace</p>
                    <h1 className="break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{timelineOnly ? "Project Timeline" : <><span className="lg:hidden">{data?.project.name || "Project"}</span><span className="hidden lg:inline">Project Tasks</span></>}</h1>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-[#716658]">{timelineOnly ? "Track the approved task sequence and planned schedule for this project." : "Your task register. Every assignment, planned milestone and decision in one place."}</p>
                    <Link to={`/admin/projects/${projectId}`} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#716658] hover:text-[#211E1A]"><ArrowLeft size={14} aria-hidden="true" />Back to Project Overview</Link>
                </div>
                <button type="button" aria-label="Refresh tasks" disabled={loading} onClick={() => setRevision((v) => v + 1)} className="flex items-center gap-2 rounded-xl border border-[#887258]/50 bg-[#F1EADF] px-4 py-3 text-xs font-semibold text-[#716658] hover:bg-[#E7DED2] disabled:opacity-50"><RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />{timelineOnly ? "Refresh timeline" : "Refresh tasks"}</button>
            </div>
        </header>
        {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error} The complete register could not be loaded; totals are unavailable. Use Refresh to retry.</p>}
        {data && <>
            <div className={timelineOnly ? "lg:hidden" : "contents"}><div className="rare-compact-stats grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{counts.map(({ label, value, icon: Icon, tone, caption }, index) => (
                <div key={label} className="task-panel task-enter task-lift p-4 transition-all duration-300 sm:p-6" style={{ "--task-delay": `${40 + index * 45}ms` }}>
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium text-[#716658]">{label}</p><span className={`rounded-xl p-2.5 ${tone}`}><Icon size={18} aria-hidden="true" /></span></div>
                    <p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p><p className="mt-2 text-xs leading-5 text-[#716658]">{caption}</p>
                </div>
            ))}</div></div>
            {timelineOnly && <div className="admin-timeline-summary hidden lg:block"><TimelineSummary tasks={tasks} /></div>}
            {timelineOnly ? <div className="admin-timeline-columns"><ProjectTimeline tasks={tasks} projectId={projectId} /></div> : <div className="lg:hidden"><ProjectTimeline tasks={tasks} projectId={projectId} /></div>}
            {!timelineOnly && <>
            <div className="admin-project-task-status hidden flex-wrap gap-2 lg:flex" role="group" aria-label="Filter tasks by approval status">{[["", "All"], ["PENDING", "Pending approval"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"]].map(([value, label]) => <button key={value} type="button" aria-pressed={filters.approval_status === value} onClick={() => change("approval_status", value)} className={"min-h-11 rounded-full border border-[#E7DED2] px-4 py-2 text-xs font-semibold " + (filters.approval_status === value ? "bg-[#211E1A] text-white" : "bg-[#FFFDFA] text-[#665C50]")}>{label} {value ? tasks.filter((task) => task.approval_status === value).length : tasks.length}</button>)}</div>
            <section className="admin-project-task-search task-enter">
                <SearchFilterToolbar
                    label="Project task search and filters"
                    search={<ProjectSearch compact query={filters.search} delay={0} onSearch={(value) => change("search", value)} label="Search tasks" labelClassName="sr-only" placeholder="Title, description or worker" suggestions={tasks.filter((task) => ["approval_status", "work_status", "priority"].every((field) => !filters[field] || task[field] === filters[field])).map((task) => ({ id: task.id, name: task.title, context: task.worker_name, to: `/admin/projects/${projectId}/tasks/${task.id}` }))} />}
                    activeCount={["approval_status", "work_status", "priority"].filter((field) => Boolean(filters[field])).length + Number(filters.sort !== "order")}
                    onClear={() => { setFilters(emptyFilters); setPage(1); }}
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        {[["Approval status", "approval_status", ["PENDING", "APPROVED", "REJECTED"]], ["Work status", "work_status", ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DELAYED", "CANCELLED"]], ["Priority", "priority", priorities]].map(([label, field, options]) => <label key={field} className="text-xs text-[#716658]">{label}<select className={`${control} mt-1`} value={filters[field]} onChange={(e) => change(field, e.target.value)}><option value="">All</option>{options.map((value) => <option key={value} value={value}>{formatText(value)}</option>)}</select></label>)}
                        <label className="text-xs text-[#716658]">Sort by<select className={`${control} mt-1`} value={filters.sort} onChange={(e) => change("sort", e.target.value)}>{[["order", "Timeline order"], ["start_date", "Start date"], ["end_date", "End date"], ["newest", "Newest"], ["priority", "Priority"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    </div>
                </SearchFilterToolbar>
            </section>
            <div className="admin-project-task-count flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl font-semibold tracking-tight">Task register</h2><p role="status" className="text-xs text-[#716658]">{rows.length} matching tasks</p></div>
            <div className="admin-project-task-cards grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{rows.slice((page - 1) * 12, page * 12).map((task, index) => <div key={task.id} className="task-enter grid min-w-0" style={{ "--task-delay": `${Math.min(index * 35, 240)}ms` }}><div className="lg:hidden"><AdminTaskCard task={task} to={`/admin/projects/${projectId}/tasks/${task.id}`} /></div><div className="hidden lg:block"><div className="overflow-hidden rounded-xl border-l-[3px]" style={{ borderLeftColor: task.approval_status === "REJECTED" ? "#E84C49" : task.approval_status === "APPROVED" ? "#24A66A" : "#E5A216" }}><MobileTaskCard task={task} showProject={false} to={`/admin/projects/${projectId}/tasks/${task.id}`} /></div></div></div>)}</div>
            {!rows.length && <div className="task-panel px-6 py-12 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#A38D72]"><Layers3 size={25} aria-hidden="true" /></span><h3 className="mt-5 font-semibold">{tasks.length ? "No matching tasks" : "A fresh start"}</h3><p className="mt-2 text-sm leading-6 text-[#716658]">{tasks.length ? "Try a different search or reset your filters to see all tasks." : "Tasks will appear here once they are submitted for this project."}</p></div>}
            <nav aria-label="Task pages" className="rare-pagination border-t border-[#E0D5C6] pt-5 text-xs"><button type="button" disabled={page === 1} onClick={() => setPage((v) => v - 1)} className="task-secondary flex items-center gap-1 px-3 py-3 font-semibold disabled:opacity-40"><ChevronLeft size={15} aria-hidden="true" />Previous</button><span aria-live="polite" aria-atomic="true" className="text-[#716658]">Page <strong className="font-semibold text-[#211E1A]">{page}</strong> of {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((v) => v + 1)} className="task-secondary flex items-center gap-1 px-3 py-3 font-semibold disabled:opacity-40">Next<ChevronRight size={15} aria-hidden="true" /></button></nav>
            </>}
        </>}
    </div>;
}
