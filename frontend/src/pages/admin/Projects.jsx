import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Building2, ChevronLeft, ChevronRight, Filter, FolderKanban, LayoutGrid, List, LoaderCircle, Plus, RefreshCw, X } from "lucide-react";
import { projectApi } from "../../api/projectApi";
import AddProject from "../../modal/admin/AddProject";
import HorizontalProjectCard from "../../components/projects/HorizontalProjectCard";
import LoadingScreen from "../../components/LoadingScreen";
import { validationMessage } from "../../hooks/useApprovalReview";
import { ProjectSearch } from "../../components/daily-reports/ReportProjectPicker";

const statuses = [["", "All projects"], ["ACTIVE", "Active"], ["MAINTENANCE", "Maintenance"], ["ON_HOLD", "On hold"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"]];
const orders = [["-created_at", "Newest first"], ["created_at", "Oldest first"], ["name", "Name A-Z"], ["-name", "Name Z-A"], ["start_date", "Start date"], ["end_date", "Completion date"]];
const buttonBase = "rare-button";
const button = `${buttonBase} rare-button-secondary`;
const primaryButton = `${buttonBase} rare-button-primary`;
const control = "min-h-12 w-full min-w-0 rounded-xl border border-[#D7C8B5] bg-[#FFFDFA] px-3 py-3 text-base text-[#352D24] outline-none transition-colors focus:border-[#94651D] focus:ring-2 focus:ring-[#E8D9BF] disabled:opacity-50 motion-reduce:transition-none";

function projectPage(response, page = 1, pageSize = 12) {
    if (Array.isArray(response)) return { results: response.slice((page - 1) * pageSize, page * pageSize), count: response.length, next: page * pageSize < response.length, previous: page > 1 };
    if (!Array.isArray(response?.results) || !Number.isInteger(response.count)) throw new Error("Unexpected project response. Please refresh the directory.");
    return { ...response, next: Boolean(response.next), previous: Boolean(response.previous) };
}

function ProjectFilters({ filters, categories, categoryLoading, onChange, onReset, suggestions, loading }) {
    const [searchReset, setSearchReset] = useState(0);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const filterButtonRef = useRef(null);
    const filterCount = Number(Boolean(filters.category)) + Number(Boolean(filters.status)) + Number(filters.ordering !== "-created_at");
    const search = filters.search;
    const setSearch = (value) => onChange({ search: value });
    return <section aria-label="Project search and filters" className="space-y-3">
        <div className="flex w-full min-w-0 items-center gap-2">
            <ProjectSearch suggestionsFiltered key={searchReset} query={search} onSearch={setSearch} suggestions={suggestions} loading={loading} label="Search projects" labelClassName="sr-only" placeholder="Name, client or location" className="min-w-0 flex-1" />
            <button ref={filterButtonRef} type="button" onClick={() => setFiltersOpen(true)} aria-label={`Filters and sorting, ${filterCount} active filters`} className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#E7DED2] bg-[#FFFDFA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]">
                <Filter size={18} aria-hidden="true" />
                {filterCount > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#211E1A] px-1 text-xs font-semibold text-[#FFFDFA]">{filterCount}</span>}
            </button>
        </div>
        <MobileProjectFilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} filters={filters} categories={categories} categoryLoading={categoryLoading} onChange={onChange} onReset={() => { setSearchReset((value) => value + 1); onReset(); }} triggerRef={filterButtonRef} />
    </section>;
}

function MobileProjectFilterSheet({ open, onClose, filters, categories, categoryLoading, onChange, onReset, triggerRef }) {
    const dialogRef = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const dialog = dialogRef.current;
        if (!dialog) return undefined;
        const trigger = triggerRef.current;
        if (!dialog.open) dialog.showModal();
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        dialog.querySelector("select:not(:disabled), button:not(:disabled)")?.focus();
        function trapFocus(event) {
            if (event.key !== "Tab") return;
            const focusable = [...dialog.querySelectorAll('button:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
        }
        dialog.addEventListener("keydown", trapFocus);
        return () => {
            dialog.removeEventListener("keydown", trapFocus);
            if (dialog.open) dialog.close();
            document.body.style.overflow = previousOverflow;
            trigger?.focus();
        };
    }, [open, triggerRef]);
    const categoryName = categories.find((item) => String(item.id) === filters.category)?.name;
    return <dialog ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="mobile-project-filters-title" onCancel={(event) => { event.preventDefault(); onClose(); }} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none rounded-t-2xl border border-[#E2D6C6] bg-[#FFFDFA] p-0 text-[#211E1A] backdrop:bg-black/40 min-[768px]:inset-y-4 min-[768px]:right-4 min-[768px]:left-auto min-[768px]:top-4 min-[768px]:bottom-4 min-[768px]:m-0 min-[768px]:h-auto min-[768px]:max-h-none min-[768px]:w-[min(28rem,calc(100vw-2rem))] min-[768px]:rounded-2xl min-[768px]:shadow-[0_12px_36px_rgba(33,30,26,0.18)]">
        <div className="max-h-[85dvh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id="mobile-project-filters-title" className="text-lg font-semibold">Filters and sorting</h2>
                <button type="button" onClick={onClose} aria-label="Close filters" className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#E7DED2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="grid gap-3">
                <label className="text-sm font-bold text-[#4F473D]">Category<select aria-label="Filter by category" value={filters.category} disabled={categoryLoading} onChange={(event) => onChange({ category: event.target.value })} className={`${control} mt-2`}><option value="">{categoryLoading ? "Loading categories..." : "All categories"}</option>{filters.category && !categoryName && <option value={filters.category}>Selected category</option>}{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="text-sm font-bold text-[#4F473D]">Sort by<select aria-label="Sort projects" value={filters.ordering} onChange={(event) => onChange({ ordering: event.target.value })} className={`${control} mt-2`}>{orders.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <div>
                    <p className="mb-2 text-sm font-bold text-[#4F473D]">Project status</p>
                    <div role="group" aria-label="Filter by project status" className="grid grid-cols-2 gap-2">{statuses.map(([value, label]) => <button type="button" key={value} aria-pressed={filters.status === value} onClick={() => onChange({ status: value })} className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] ${filters.status === value ? "border-[#A9854D] bg-[#211E1A] text-[#FFFDFA] shadow-sm" : "border-[#DDD0BD] bg-[#FFFDFA] text-[#66543D]"}`}>{label}</button>)}</div>
                </div>
            </div>
            <button type="button" onClick={() => { onReset(); onClose(); }} className={`${button} mt-4 w-full justify-center`}><X size={16} aria-hidden="true" />Clear all filters</button>
        </div>
    </dialog>;
}

export function ProjectDirectory({ role = "ADMIN", section = "" }) {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [result, setResult] = useState(null);
    const [categoryState, setCategoryState] = useState(null);
    const [revision, setRevision] = useState(0);
    const [categoryRevision, setCategoryRevision] = useState(0);
    const [showAddProject, setShowAddProject] = useState(false);
    const resultsRef = useRef(null);
    const focusResults = useRef(false);
    const filters = { search: params.get("search") || "", category: params.get("category") || "", status: params.get("status") || "", ordering: orders.some(([value]) => value === params.get("ordering")) ? params.get("ordering") : "-created_at" };
    const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
    const pageSize = [12, 24, 48].includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 12;
    const layout = params.get("view") === "list" ? "list" : "grid";
    const filterKey = JSON.stringify(filters);
    const key = `${role}:${filterKey}:${page}:${pageSize}:${revision}`;
    const current = result?.key === key ? result : null;
    const data = current?.data;
    const loading = !current;
    const admin = role === "ADMIN";
    const hasFilters = Boolean(filters.search || filters.category || filters.status);
    const categories = categoryState?.data || [];
    const prefix = admin ? "/admin" : "/supervisor";

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const options = [];
                for (let optionPage = 1; optionPage <= 100; optionPage++) {
                    const response = await projectApi.getCategories({ page: optionPage, page_size: 100 }, controller.signal);
                    if (controller.signal.aborted) return;
                    if (Array.isArray(response)) { options.push(...response); break; }
                    if (!Array.isArray(response?.results)) throw new Error("Unexpected category response.");
                    options.push(...response.results);
                    if (!response.next) break;
                    if (optionPage === 100) throw new Error("Category list is too large to load.");
                }
                setCategoryState({ data: options.sort((a, b) => a.name.localeCompare(b.name)) });
            } catch (error) { if (!controller.signal.aborted) setCategoryState({ error: validationMessage(error, "Category options could not be loaded. Search and status filters are still available.") }); }
        }
        load(); return () => controller.abort();
    }, [categoryRevision, role]);

    useEffect(() => {
        const controller = new AbortController();
        const query = Object.fromEntries(Object.entries(JSON.parse(filterKey)).filter(([, value]) => value));
        projectApi.getProjects({ ...query, page, page_size: pageSize }, controller.signal).then((response) => {
            if (!controller.signal.aborted) setResult({ key, data: projectPage(response, page, pageSize) });
        }).catch((error) => { if (!controller.signal.aborted) setResult({ key, error: validationMessage(error, "Unable to load projects. Please try again.") }); });
        return () => controller.abort();
    }, [key, filterKey, page, pageSize]);

    useEffect(() => {
        if (!loading && focusResults.current) {
            const target = resultsRef.current;
            if (target) {
                target.focus({ preventScroll: true });
                target.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
            }
            focusResults.current = false;
        }
    }, [loading]);

    function change(values, resetPage = true) {
        setParams((previous) => {
            const next = new URLSearchParams(previous);
            for (const [name, value] of Object.entries(values)) { if (value) next.set(name, String(value)); else next.delete(name); }
            if (resetPage) next.delete("page");
            return next;
        });
    }
    function resetFilters() {
        setParams((previous) => { const next = new URLSearchParams(previous); for (const name of ["search", "category", "status", "ordering", "page"]) next.delete(name); return next; });
    }
    function changePage(value) { focusResults.current = true; change({ page: value }, false); }
    const from = data?.count ? (page - 1) * pageSize + 1 : 0;
    const to = data ? Math.min((page - 1) * pageSize + data.results.length, data.count) : 0;
    const pageCount = data ? Math.max(1, Math.ceil(data.count / pageSize)) : 1;
    return <div className="mx-auto w-full min-w-0 max-w-[1200px] space-y-4 px-4 pb-8 text-[#211E1A] sm:space-y-5 md:px-6 lg:px-8">
        {!result && loading && <LoadingScreen message="Loading project directory..." />}
        <header className="flex w-full items-center justify-between gap-3">
            <h1 className="min-w-0 truncate text-xl font-bold tracking-tight text-[#211E1A]">{section === "documents" ? "Project Documents" : admin ? "All Projects" : "My Projects"}</h1>
            <div className="ml-auto flex shrink-0 items-center gap-2">
                {admin && section !== "documents" && <button type="button" aria-label="Add project" onClick={() => setShowAddProject(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#D7C8B5] bg-[#FFFDFA] px-3 py-2 text-sm font-semibold text-[#514538] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"><Plus size={18} aria-hidden="true" /><span className="hidden sm:inline">Add Project</span></button>}
                <button type="button" aria-label="Refresh projects" disabled={loading} onClick={() => setRevision((value) => value + 1)} className={`${buttonBase} rare-button-secondary ml-auto flex h-11 min-h-11 shrink-0 items-center gap-2 px-3 py-2 text-xs font-semibold`}>
                    <RefreshCw size={16} aria-hidden="true" className={loading ? "motion-safe:animate-spin" : ""} />Refresh
                </button>
            </div>
        </header>
        <ProjectFilters filters={filters} categories={categories} categoryLoading={!categoryState} onChange={change} onReset={resetFilters} loading={loading} suggestions={(data?.results || []).map((project) => ({ id: project.id, name: project.name, context: project.location, to: `${prefix}/projects/${project.id}${section === "documents" ? "/documents" : ""}` }))} />
        {categoryState?.error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8CE94] bg-[#FFF8E7] p-4"><p className="text-sm leading-6 text-[#795016]">{categoryState.error}</p><button type="button" className={button} onClick={() => { setCategoryState(null); setCategoryRevision((value) => value + 1); }}>Retry categories</button></div>}
        <section aria-label="Project directory" aria-busy={loading} className="space-y-4">
            <div className="flex w-full min-w-0 items-center justify-between gap-3">
                <p ref={resultsRef} tabIndex={-1} role="status" aria-live="polite" className="min-w-0 truncate text-sm font-medium text-[#665C50] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#94651D]">{loading ? "Updating projects..." : current.error ? "Projects are unavailable" : `${data.count} ${data.count === 1 ? "project" : "projects"}`}</p>
                <div role="group" aria-label="Project view" className="ml-auto inline-flex shrink-0 gap-1 rounded-2xl border border-[#D8C7B2] bg-[#F1EADF] p-1">
                    {[["list", "List", List], ["grid", "Gallery", LayoutGrid]].map(([value, label, Icon]) => <button key={value} type="button" aria-label={`${label} view`} aria-pressed={layout === value} onClick={() => change({ view: value }, false)} className={`inline-flex h-11 w-11 min-h-11 items-center justify-center rounded-xl p-0 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] motion-reduce:transition-none ${layout === value ? "bg-[#FFFDFA] text-[#352D24] shadow-sm" : "text-[#66543D] hover:bg-white/60"}`}><Icon size={18} aria-hidden="true" /></button>)}
                </div>
            </div>
            {loading && <div role="status" className="rounded-[24px] border border-[#E2D6C6] bg-[#FFFDFA] p-6"><div className="mb-5 flex items-center gap-3 text-sm font-semibold text-[#66543D]"><LoaderCircle size={20} aria-hidden="true" className="motion-safe:animate-spin" />Finding your projects...</div><div aria-hidden="true" className="space-y-4">{[0, 1, 2].map((value) => <div key={value} className="flex gap-5 rounded-2xl bg-[#F5EFE6] p-5 motion-safe:animate-pulse"><div className="hidden h-24 w-28 shrink-0 rounded-xl bg-[#E8DDCD] sm:block" /><div className="flex-1 space-y-4 py-2"><div className="h-4 w-1/3 rounded-full bg-[#E3D6C4]" /><div className="h-3 w-2/3 rounded-full bg-[#E8DDCD]" /><div className="h-3 w-1/2 rounded-full bg-[#E8DDCD]" /></div></div>)}</div></div>}
            {current?.error && <div role="alert" className="rounded-[24px] border border-[#E7BDB5] bg-[#FFF5F2] p-6"><h3 className="text-lg font-bold text-[#943C2D]">Unable to load projects</h3><p className="mt-2 text-base leading-7 text-[#803D32]">{current.error}</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" className={button} onClick={() => setRevision((value) => value + 1)}>Try again</button><button type="button" className={button} onClick={resetFilters}>Reset filters and page</button></div></div>}
            {data && <>
                {!!data.results.length && <div className={`project-directory-enter grid gap-4 ${layout === "grid" ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>{data.results.map((project) => <HorizontalProjectCard key={project.id} project={project} layout={layout} to={`${prefix}/projects/${project.id}${section === "documents" ? "/documents" : ""}`} actionLabel={section === "documents" ? "Open documents" : "View Project"} />)}</div>}
                {!data.results.length && <div className="rounded-[24px] border border-dashed border-[#CCB99F] bg-[#FFFDFA] px-6 py-14 text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F3E7D5] text-[#8A6840]"><FolderKanban size={30} strokeWidth={1.5} aria-hidden="true" /></span><h3 className="mt-5 text-xl font-bold text-[#352D24]">{hasFilters ? "No matching projects" : admin ? "Your next project starts here" : "No projects assigned yet"}</h3><p className="mx-auto mt-3 max-w-md text-base leading-7 text-[#716658]">{hasFilters ? "Try a different name, category or status to find the project you need." : admin ? "Create a project to start organising its tasks, site records and team." : "Projects will appear here when an Administrator assigns them to you."}</p>{hasFilters ? <button type="button" className={`${button} mt-6`} onClick={resetFilters}>Clear filters</button> : admin && <button type="button" className={`${primaryButton} mt-6`} onClick={() => setShowAddProject(true)}><Plus size={19} aria-hidden="true" />Add Project</button>}</div>}
                {pageCount > 1 && <div className="flex flex-col gap-4 rounded-[22px] border border-[#E2D6C6] bg-[#FFFDFA] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm font-semibold text-[#4F473D]">Showing {from}-{to} of {data.count}</p><label className="flex items-center gap-2 text-sm font-medium text-[#665C50]">Per page<select aria-label="Projects per page" value={pageSize} className="min-h-12 rounded-xl border border-[#D7C8B5] bg-[#FFFDFA] px-3 py-2 text-sm outline-none focus:border-[#94651D] focus:ring-2 focus:ring-[#E8D9BF]" onChange={(event) => change({ page_size: event.target.value })}>{[12, 24, 48].map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div><nav aria-label="Project pagination" className="rare-pagination"><button type="button" className={button} disabled={!data.previous} onClick={() => changePage(page - 1)}><ChevronLeft size={18} aria-hidden="true" />Previous</button><span aria-live="polite" aria-atomic="true" className="text-sm text-[#716658]">Page {page} of {pageCount}</span><button type="button" className={button} disabled={!data.next} onClick={() => changePage(page + 1)}>Next<ChevronRight size={18} aria-hidden="true" /></button></nav></div>}
            </>}
        </section>
        <footer className="flex items-center gap-2 px-1 text-sm leading-6 text-[#716658] max-[480px]:hidden"><Building2 size={16} aria-hidden="true" className="shrink-0" />{admin ? "Open any project to manage its team, tasks and site records." : "Open a project to access its tasks, daily reports and site records."}<ArrowUpRight size={15} aria-hidden="true" className="shrink-0" /></footer>
        {admin && <AddProject open={showAddProject} onClose={() => setShowAddProject(false)} onCreated={(project) => { setShowAddProject(false); navigate(`/admin/projects/${project.id}`); }} />}
    </div>;
}

export default function Projects() {
    return <ProjectDirectory role="ADMIN" />;
}
