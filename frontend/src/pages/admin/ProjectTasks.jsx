import { TaskProgress } from "../../components/tasks/TaskExecutionActions";
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CalendarRange, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Layers3, ListOrdered, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { projectApi } from "../../api/projectApi";
import { isTaskId, isTaskOverdue, taskApi, taskRegisterPage } from "../../api/taskApi";
import LoadingScreen from "../../components/LoadingScreen";
import AdminTaskCard, { TaskPageStyles } from "../../components/admin/tasks/AdminTaskCard";
import TimelineSchedule from "../../components/timeline/TimelineSchedule";
import { formatDate, formatText, getError } from "../../components/approvals/approvalUtils";

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

function ProjectTimeline({ tasks, projectId }) {
    const [view, setView] = useState("sequence");
    const orderedTasks = filterProjectTasks(tasks, emptyFilters)
        .filter((task) => task.approval_status === "APPROVED" && task.work_status !== "CANCELLED");

    return <section aria-label="Project timeline" className="task-panel task-enter min-w-0 space-y-5 p-4 sm:p-7" style={{ "--task-delay": "120ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
                <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"><span className="rounded-xl bg-[#EEE5D8] p-2 text-[#8B6944]"><CalendarRange size={19} aria-hidden="true" /></span>Project timeline</h2>
                <p className="mt-2 max-w-xl text-xs leading-5 text-[#716658]">{orderedTasks.length} approved tasks · Planned sequence and schedule across the project.</p>
            </div>
            <div className="flex flex-wrap gap-1 rounded-2xl border border-[#E7DED2] bg-[#F5F0E9] p-1.5" aria-label="Timeline display">
                {[["sequence", "Numbered list"], ["schedule", "Schedule chart"]].map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold ${view === id ? "bg-[#211E1A] text-[#FFFDFA] shadow-sm" : "text-[#74614D] hover:bg-[#E7DED2]"}`}>
                        {id === "sequence" ? <ListOrdered size={15} aria-hidden="true" /> : <CalendarRange size={15} aria-hidden="true" />}{label}
                    </button>
                ))}
            </div>
        </div>
        {!orderedTasks.length ? <p className="py-4 text-sm text-[#716658]">No approved tasks in the project timeline.</p> : <>
            {view === "schedule" && <TimelineSchedule tasks={orderedTasks} projectId={projectId}
                getTaskHref={(task) => `/admin/projects/${projectId}/tasks/${task.id}`} />}
            {view === "sequence" && <ol aria-label="Task sequence" className="max-h-[560px] space-y-2 overflow-y-auto p-1 pr-2">{orderedTasks.map((task, position) => (
                <li key={task.id}>
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
    const [error, setError] = useState("");
    function change(key, value) { setDraft((current) => ({ ...current, [key]: value })); setError(""); }
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
    return <form onSubmit={submit} className="task-panel space-y-5 p-4 sm:p-6">
        <div className="flex items-center gap-2.5 border-b border-[#EEE6DC] pb-4"><SlidersHorizontal size={17} className="text-[#A38D72]" aria-hidden="true" /><h2 className="text-sm font-semibold">Find a task</h2></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs font-medium text-[#716658] sm:col-span-2">Search all tasks<span className="relative mt-2 block"><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-[#A38D72]" aria-hidden="true" /><input type="search" maxLength={200} value={draft.search} onChange={(event) => change("search", event.target.value)} placeholder="Task, description, worker/team or project" className={`${control} pl-10`} /></span></label>
        </div>
        <details className="rare-filter-disclosure">
            <summary>Filters and sorting ({Object.entries(draft).filter(([key, value]) => key !== "search" && value && (key !== "sort" || value !== "order")).length})</summary>
            <div className="grid gap-4 pt-3 sm:grid-cols-2 xl:grid-cols-3">
            {select(role === "ADMIN" ? "Project" : "Assigned project", "project", options.projects.map((project) => [project.id, project.name]), "All projects")}
            {role === "ADMIN" && select("Assigned Supervisor", "supervisor", options.supervisors.map((supervisor) => [supervisor.id, supervisor.name]), "All Supervisors")}
            {select("Approval status", "approval_status", ["PENDING", "APPROVED", "REJECTED"].map((value) => [value, formatText(value)]))}
            {select("Work status", "work_status", ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DELAYED", "CANCELLED"].map((value) => [value, formatText(value)]))}
            {select("Priority", "priority", priorities.map((value) => [value, formatText(value)]))}
            <label className="text-xs font-medium text-[#716658]">Sort by<select className={`${control} mt-2`} value={draft.sort} onChange={(event) => change("sort", event.target.value)}>{[["order", "Timeline order within project"], ["newest", "Newest"], ["oldest", "Oldest"], ["start_date", "Start date"], ["end_date", "End date"], ["priority", "Priority"], ["title", "Task name"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="grid gap-4 border-t border-[#EEE6DC] pt-4 lg:grid-cols-2">
            {[["start", "Planned start date"], ["end", "Planned end date"]].map(([prefix, title]) => <fieldset key={prefix} className="grid min-w-0 gap-3 sm:grid-cols-2"><legend className="mb-2 text-xs font-semibold text-[#665C50]">{title}</legend>
                <label className="text-xs text-[#716658]">From<input type="date" value={draft[`${prefix}_from`]} onChange={(event) => change(`${prefix}_from`, event.target.value)} className={`${control} mt-1`} /></label>
                <label className="text-xs text-[#716658]">To<input type="date" min={draft[`${prefix}_from`] || undefined} value={draft[`${prefix}_to`]} onChange={(event) => change(`${prefix}_to`, event.target.value)} className={`${control} mt-1`} /></label>
            </fieldset>)}
        </div>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#EEE6DC] pt-4">
            <label className="flex items-center gap-2 text-xs font-medium text-[#665C50]"><input type="checkbox" checked={draft.overdue === "true"} onChange={(event) => change("overdue", event.target.checked ? "true" : "")} className="h-4 w-4 accent-[#211E1A]" />Overdue only</label>
            <div className="flex flex-wrap gap-2"><button type="button" className="task-secondary px-4 py-3 text-xs font-semibold" onClick={() => { setDraft(registerDefaults); setError(""); onReset(); }}>Clear All Filters</button><button type="submit" className="task-primary inline-flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-semibold"><Search size={15} aria-hidden="true" />Apply filters</button></div>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>;
}

export function GlobalTaskRegister({ role = "ADMIN" }) {
    return <GlobalTaskRegisterPage key={role} role={role} />;
}

function GlobalTaskRegisterPage({ role }) {
    const [params, setParams] = useSearchParams();
    const [result, setResult] = useState(null);
    const [options, setOptions] = useState({ projects: [], supervisors: [] });
    const [revision, setRevision] = useState(0);
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
        setParams(query);
    }
    function changePage(next) { const query = new URLSearchParams(params); query.set("page", String(next)); setParams(query); }
    const summaries = admin
        ? [["Total Tasks", "total"], ["Pending Approval", "pending_approval"], ["In Progress", "in_progress"], ["Completed", "completed"], ["Overdue", "overdue"]]
        : [["Total Tasks", "total"], ["Not Started", "not_started"], ["In Progress", "in_progress"], ["Completed", "completed"], ["Overdue", "overdue"]];

    return <div className="rare-tasks mx-auto min-w-0 max-w-[1600px] space-y-6 pb-8 text-[#211E1A] sm:space-y-7">
        <TaskPageStyles />
        {loading && <LoadingScreen message={admin ? "Loading all tasks..." : "Loading your assigned-project tasks..."} />}
        <header className="rare-page-header task-hero task-enter rounded-[28px] border border-black p-6 text-[#211E1A] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-5"><div className="min-w-0 flex-1 basis-64"><p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#716658]"><Layers3 size={14} aria-hidden="true" />{admin ? "Project oversight" : "Your workspace"}</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{admin ? "All Tasks" : "My Tasks"}</h1><p className="mt-3 text-sm leading-6 text-[#716658]">{admin ? "Manage and monitor tasks across all projects" : "Track tasks across your assigned projects."}</p></div>
                <button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)} className="flex items-center gap-2 rounded-xl border border-[#887258]/50 bg-[#F1EADF] px-4 py-3 text-xs font-semibold text-[#716658] hover:bg-[#E7DED2] disabled:opacity-50"><RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />Refresh tasks</button>
            </div>
        </header>
        {data && <div><p className="mb-3 text-xs text-[#716658]">{data.summary_scope === "results" ? "Totals for all matching tasks" : `Totals across ${admin ? "all accessible" : "your assigned"} projects`}</p><div className="rare-compact-stats grid grid-cols-2 gap-3 lg:grid-cols-5">{summaries.map(([label, key], index) => <div key={key} className="task-panel task-enter task-lift p-4 transition-all duration-300 sm:p-5" style={{ "--task-delay": `${index * 40}ms` }}><p className="text-xs font-medium text-[#716658]">{label}</p><p className={`mt-3 text-3xl font-semibold tracking-tight ${key === "overdue" && data.summary[key] ? "text-[#AA6554]" : "text-[#211E1A]"}`}>{data.summary[key].toLocaleString("en-IN")}</p></div>)}</div></div>}
        <GlobalTaskFilters key={filterKey} filters={filters} options={options} role={role} onApply={applyFilters} onReset={() => setParams({})} />
        {visible?.error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><p>{visible.error}</p><p className="mt-2">Task results and totals are unavailable. Please retry or clear the filters.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="task-secondary px-4 py-2 text-xs font-semibold" onClick={() => setRevision((value) => value + 1)}>Retry</button>{page > 1 && <button type="button" className="task-secondary px-4 py-2 text-xs font-semibold" onClick={() => changePage(1)}>Return to first page</button>}</div></div>}
        {data && <>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight">Task register</h2><p role="status" className="mt-1 text-xs text-[#716658]">{data.count.toLocaleString("en-IN")} matching tasks</p></div><label className="flex items-center gap-2 text-xs text-[#716658]">Per page<select value={pageSize} onChange={(event) => { const query = new URLSearchParams(params); query.set("page_size", event.target.value); query.delete("page"); setParams(query); }} className="rounded-xl border border-[#E7DED2] bg-[#FFFDFA] px-3 py-2 text-[#211E1A]">{[12, 24, 48].map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{data.results.map((task) => <AdminTaskCard key={task.id} task={task} showProject actionLabel={admin ? "View Details" : "View Task"}
                to={admin ? `/admin/projects/${task.project}/tasks/${task.id}` : `/supervisor/projects/${task.project}/tasks?task=${encodeURIComponent(task.id)}`}
                approvalTo={admin && task.approval_status === "PENDING" ? `/admin/approvals?tab=tasks&task=${task.id}&type=tasks` : undefined} />)}</div>
            {!data.results.length && <div className="task-panel px-6 py-12 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#A38D72]"><Layers3 size={25} aria-hidden="true" /></span><h3 className="mt-5 font-semibold">No tasks found</h3><p className="mt-2 text-sm text-[#716658]">Try changing your filters. Tasks appear here when they are submitted for {admin ? "a project" : "one of your assigned projects"}.</p></div>}
            <nav aria-label="Task register pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E0D5C6] pt-5 text-xs"><button type="button" disabled={!data.previous} onClick={() => changePage(page - 1)} className="task-secondary flex items-center gap-1 px-3 py-3 font-semibold disabled:opacity-40"><ChevronLeft size={15} aria-hidden="true" />Previous</button><span className="text-[#716658]">Page <strong className="text-[#211E1A]">{page}</strong> of {Math.max(1, Math.ceil(data.count / pageSize))}</span><button type="button" disabled={!data.next} onClick={() => changePage(page + 1)} className="task-secondary flex items-center gap-1 px-3 py-3 font-semibold disabled:opacity-40">Next<ChevronRight size={15} aria-hidden="true" /></button></nav>
        </>}
    </div>;
}

function ProjectTaskRegister({ projectId }) {
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

    return <div className="rare-tasks mx-auto min-w-0 max-w-[1600px] space-y-6 pb-8 text-[#211E1A] sm:space-y-7">
        <TaskPageStyles />
        {loading && <LoadingScreen message="Loading complete project task register..." />}
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-[#716658]"><Link to="/admin/projects" className="hover:underline">Projects</Link><span aria-hidden="true">/</span><Link to={`/admin/projects/${projectId}`} className="hover:underline">Project Overview</Link><span aria-hidden="true">/</span><span aria-current="page">Tasks</span></nav>
        <header className="rare-page-header task-hero task-enter relative overflow-hidden rounded-[28px] border border-black p-6 text-[#211E1A] sm:p-5">
            <div className="relative flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0 flex-1 basis-64">
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#716658]"><Layers3 size={14} aria-hidden="true" />Project workspace</p>
                    <h1 className="break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{data?.project.name || "Project"}</h1>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-[#716658]">Your task register. Every assignment, planned milestone and decision in one place.</p>
                    <Link to={`/admin/projects/${projectId}`} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#716658] hover:text-[#211E1A]"><ArrowLeft size={14} aria-hidden="true" />Back to Project Overview</Link>
                </div>
                <button type="button" disabled={loading} onClick={() => setRevision((v) => v + 1)} className="flex items-center gap-2 rounded-xl border border-[#887258]/50 bg-[#F1EADF] px-4 py-3 text-xs font-semibold text-[#716658] hover:bg-[#E7DED2] disabled:opacity-50"><RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />Refresh tasks</button>
            </div>
        </header>
        {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error} The complete register could not be loaded; totals are unavailable. Use Refresh to retry.</p>}
        {data && <>
            <div className="rare-compact-stats grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{counts.map(({ label, value, icon: Icon, tone, caption }, index) => (
                <div key={label} className="task-panel task-enter task-lift p-4 transition-all duration-300 sm:p-6" style={{ "--task-delay": `${40 + index * 45}ms` }}>
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium text-[#716658]">{label}</p><span className={`rounded-xl p-2.5 ${tone}`}><Icon size={18} aria-hidden="true" /></span></div>
                    <p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p><p className="mt-2 text-xs leading-5 text-[#716658]">{caption}</p>
                </div>
            ))}</div>
            <ProjectTimeline tasks={tasks} projectId={projectId} />
            <section aria-label="Task filters" className="task-panel task-enter grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
                <div className="flex items-center gap-2 border-b border-[#EEE6DC] pb-4 sm:col-span-2 lg:col-span-3"><SlidersHorizontal size={17} className="text-[#A38D72]" aria-hidden="true" /><h2 className="text-sm font-semibold">Find the right task</h2><span className="ml-auto text-xs text-[#716658]">{rows.length} results</span></div>
                <label className="text-xs font-medium text-[#716658]">Search<span className="relative mt-2 block"><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-[#A38D72]" aria-hidden="true" /><input type="search" value={filters.search} onChange={(e) => change("search", e.target.value)} placeholder="Title, description or worker" className={`${control} pl-10`} /></span></label>
                {[["Approval status", "approval_status", ["PENDING", "APPROVED", "REJECTED"]], ["Work status", "work_status", ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "DELAYED", "CANCELLED"]], ["Priority", "priority", priorities]].map(([label, field, options]) => <label key={field} className="text-xs text-[#716658]">{label}<select className={`${control} mt-1`} value={filters[field]} onChange={(e) => change(field, e.target.value)}><option value="">All</option>{options.map((value) => <option key={value} value={value}>{formatText(value)}</option>)}</select></label>)}
                <label className="text-xs text-[#716658]">Sort by<select className={`${control} mt-1`} value={filters.sort} onChange={(e) => change("sort", e.target.value)}>{[["order", "Timeline order"], ["start_date", "Start date"], ["end_date", "End date"], ["newest", "Newest"], ["priority", "Priority"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <button type="button" className="task-secondary self-end px-4 py-3 text-sm font-semibold text-[#74614D]" onClick={() => { setFilters(emptyFilters); setPage(1); }}>Reset filters</button>
            </section>
            <div className="flex flex-wrap items-end justify-between gap-2"><h2 className="text-xl font-semibold tracking-tight">Task register</h2><p role="status" className="text-xs text-[#716658]">{rows.length} matching tasks</p></div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{rows.slice((page - 1) * 12, page * 12).map((task, index) => <div key={task.id} className="task-enter grid min-w-0" style={{ "--task-delay": `${Math.min(index * 35, 240)}ms` }}><AdminTaskCard task={task} to={`/admin/projects/${projectId}/tasks/${task.id}`} /></div>)}</div>
            {!rows.length && <div className="task-panel px-6 py-12 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#A38D72]"><Layers3 size={25} aria-hidden="true" /></span><h3 className="mt-5 font-semibold">{tasks.length ? "No matching tasks" : "A fresh start"}</h3><p className="mt-2 text-sm leading-6 text-[#716658]">{tasks.length ? "Try a different search or reset your filters to see all tasks." : "Tasks will appear here once they are submitted for this project."}</p></div>}
            <nav aria-label="Task pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E0D5C6] pt-5 text-xs"><button type="button" disabled={page === 1} onClick={() => setPage((v) => v - 1)} className="task-secondary flex items-center gap-1 px-3 py-3 font-semibold disabled:opacity-40"><ChevronLeft size={15} aria-hidden="true" />Previous</button><span className="text-[#716658]">Page <strong className="font-semibold text-[#211E1A]">{page}</strong> of {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((v) => v + 1)} className="task-secondary flex items-center gap-1 px-3 py-3 font-semibold disabled:opacity-40">Next<ChevronRight size={15} aria-hidden="true" /></button></nav>
        </>}
    </div>;
}
