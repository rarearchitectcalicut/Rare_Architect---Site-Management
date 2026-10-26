import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Building2, ChevronLeft, ChevronRight, FolderKanban, LayoutGrid, List, LoaderCircle, Plus, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { projectApi } from "../../api/projectApi";
import AddProject from "../../modal/admin/AddProject";
import HorizontalProjectCard from "../../components/projects/HorizontalProjectCard";
import LoadingScreen from "../../components/LoadingScreen";
import { validationMessage } from "../../hooks/useApprovalReview";

const statuses = [["", "All projects"], ["ACTIVE", "Active"], ["MAINTENANCE", "Maintenance"], ["ON_HOLD", "On hold"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"]];
const orders = [["-created_at", "Newest first"], ["created_at", "Oldest first"], ["name", "Name A-Z"], ["-name", "Name Z-A"], ["start_date", "Start date"], ["end_date", "Completion date"]];
const buttonBase = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] disabled:cursor-not-allowed disabled:opacity-45";
const button = `${buttonBase} border-[#CDBBA3] bg-[#FFFDFA] text-[#4F3D27] hover:bg-[#F1EADF]`;
const primaryButton = `${buttonBase} border-[#D6A437] bg-[#F3C45C] text-[#35250C] shadow-sm hover:bg-[#EAB344]`;
const control = "min-h-12 w-full min-w-0 rounded-xl border border-[#D7C8B5] bg-[#FFFDFA] px-3 py-3 text-base text-[#352D24] outline-none transition-colors focus:border-[#94651D] focus:ring-2 focus:ring-[#E8D9BF] disabled:opacity-50 motion-reduce:transition-none";

function projectPage(response, page = 1, pageSize = 12) {
    if (Array.isArray(response)) return { results: response.slice((page - 1) * pageSize, page * pageSize), count: response.length, next: page * pageSize < response.length, previous: page > 1 };
    if (!Array.isArray(response?.results) || !Number.isInteger(response.count)) throw new Error("Unexpected project response. Please refresh the directory.");
    return { ...response, next: Boolean(response.next), previous: Boolean(response.previous) };
}

function ProjectFilters({ filters, categories, categoryLoading, onChange, onReset }) {
    const [search, setSearch] = useState(filters.search);
    const active = Boolean(search || filters.search || filters.category || filters.status || filters.ordering !== "-created_at");
    const categoryName = categories.find((item) => String(item.id) === filters.category)?.name;
    return <section aria-label="Project search and filters" className="overflow-hidden rounded-[24px] border border-[#E2D6C6] bg-[#FFFDFA] shadow-[0_5px_22px_-20px_rgba(61,42,20,0.3)]">
        <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_220px_200px]">
            <form onSubmit={(event) => { event.preventDefault(); onChange({ search: search.trim() }); }} className="min-w-0"><label htmlFor="project-search" className="mb-2 block text-sm font-bold text-[#4F473D]">Find a project</label><div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search size={19} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-4 text-[#856A48]" /><input id="project-search" type="search" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Name, client or location" className={`${control} pl-11 placeholder:text-[#716658]`} /></div><button type="submit" className={primaryButton}>Search</button></div></form>
            <label className="text-sm font-bold text-[#4F473D]">Category<select aria-label="Filter by category" value={filters.category} disabled={categoryLoading} onChange={(event) => onChange({ category: event.target.value })} className={`${control} mt-2`}><option value="">{categoryLoading ? "Loading categories..." : "All categories"}</option>{filters.category && !categoryName && <option value={filters.category}>Selected category</option>}{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm font-bold text-[#4F473D]">Sort by<select aria-label="Sort projects" value={filters.ordering} onChange={(event) => onChange({ ordering: event.target.value })} className={`${control} mt-2`}>{orders.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="border-t border-[#EDE5DA] bg-[#FCF9F4] px-5 py-4 sm:px-6"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#80603B]"><SlidersHorizontal size={15} aria-hidden="true" />Project status</div><div role="group" aria-label="Filter by project status" className="flex flex-wrap gap-2">{statuses.map(([value, label]) => <button type="button" key={value} aria-pressed={filters.status === value} onClick={() => onChange({ status: value })} className={`min-h-11 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] ${filters.status === value ? "border-[#A9854D] bg-[#211E1A] text-[#FFFDFA] shadow-sm" : "border-[#DDD0BD] bg-[#FFFDFA] text-[#66543D] hover:border-[#BCA17D] hover:bg-[#F1EADF]"}`}>{label}</button>)}</div></div>
        {active && <div aria-label="Active filters" className="flex flex-wrap items-center gap-2 border-t border-[#EDE5DA] px-5 py-4 sm:px-6">{[["search", filters.search, `Search: ${filters.search}`], ["category", filters.category, `Category: ${categoryName || "Selected category"}`], ["status", filters.status, `Status: ${statuses.find(([value]) => value === filters.status)?.[1] || filters.status}`]].filter(([, value]) => value).map(([field, , label]) => <button key={field} type="button" aria-label={`Remove ${label}`} onClick={() => { if (field === "search") setSearch(""); onChange({ [field]: "" }); }} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-[#D8C7B2] bg-[#F3EDE3] px-4 py-2 text-sm font-medium text-[#5F472A] hover:bg-[#E9DDCC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D]"><span className="truncate">{label}</span><X size={15} aria-hidden="true" className="shrink-0" /></button>)}<button type="button" onClick={() => { setSearch(""); onReset(); }} className={`${button} sm:ml-auto`}><X size={16} aria-hidden="true" />Clear filters</button></div>}
    </section>;
}

export function ProjectDirectory({ role = "ADMIN" }) {
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
    const layout = params.get("view") === "grid" ? "grid" : "list";
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
    return <div className="mx-auto min-w-0 max-w-[1500px] space-y-6 pb-8 text-[#211E1A]">
        {!result && loading && <LoadingScreen message="Loading project directory..." />}
        <header className="flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-[28px] border border-[#302A21] bg-black p-6 text-[#FFFDFA] shadow-[0_12px_36px_-24px_rgba(0,0,0,0.6)] sm:p-8"><div className="min-w-0 max-w-2xl border-l-4 border-[#F3C45C] pl-5"><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#D2BEA2]">{admin ? "RARE / Project management" : "RARE / Your workspace"}</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{admin ? "All Projects" : "My Projects"}</h1><p className="mt-3 text-base leading-7 text-[#D5C9B9]">{admin ? "Every project, clearly organised. Find a site, check its status and open the workspace to keep things moving." : "Your assigned sites in one place. Find your next project and pick up where you left off."}</p></div><div className="flex flex-wrap gap-3">{admin && <button type="button" className={primaryButton} onClick={() => setShowAddProject(true)}><Plus size={20} aria-hidden="true" />Add Project</button>}<button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)} className={`${buttonBase} border-white/30 bg-white/10 text-white hover:bg-white/20`}><RefreshCw size={18} aria-hidden="true" className={loading ? "motion-safe:animate-spin" : ""} />Refresh</button></div></header>
        <ProjectFilters key={filters.search} filters={filters} categories={categories} categoryLoading={!categoryState} onChange={change} onReset={resetFilters} />
        {categoryState?.error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8CE94] bg-[#FFF8E7] p-4"><p className="text-sm leading-6 text-[#795016]">{categoryState.error}</p><button type="button" className={button} onClick={() => { setCategoryState(null); setCategoryRevision((value) => value + 1); }}>Retry categories</button></div>}
        <section aria-label="Project directory" aria-busy={loading} className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 ref={resultsRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-[#2E271F] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#94651D]">Project directory</h2><p role="status" aria-live="polite" className="mt-2 text-sm text-[#665C50]">{loading ? "Updating projects..." : current.error ? "Projects are unavailable" : `${data.count} matching ${data.count === 1 ? "project" : "projects"}${admin ? " across your portfolio" : " assigned to you"}`}</p></div><div role="group" aria-label="Project view" className="inline-flex gap-1 rounded-2xl border border-[#D8C7B2] bg-[#F1EADF] p-1">{[["list", "List", List], ["grid", "Gallery", LayoutGrid]].map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={layout === value} onClick={() => change({ view: value }, false)} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] motion-reduce:transition-none ${layout === value ? "bg-[#FFFDFA] text-[#352D24] shadow-sm" : "text-[#66543D] hover:bg-white/60"}`}><Icon size={18} aria-hidden="true" />{label}</button>)}</div></div>
            {loading && <div role="status" className="rounded-[24px] border border-[#E2D6C6] bg-[#FFFDFA] p-6"><div className="mb-5 flex items-center gap-3 text-sm font-semibold text-[#66543D]"><LoaderCircle size={20} aria-hidden="true" className="motion-safe:animate-spin" />Finding your projects...</div><div aria-hidden="true" className="space-y-4">{[0, 1, 2].map((value) => <div key={value} className="flex gap-5 rounded-2xl bg-[#F5EFE6] p-5 motion-safe:animate-pulse"><div className="hidden h-24 w-28 shrink-0 rounded-xl bg-[#E8DDCD] sm:block" /><div className="flex-1 space-y-4 py-2"><div className="h-4 w-1/3 rounded-full bg-[#E3D6C4]" /><div className="h-3 w-2/3 rounded-full bg-[#E8DDCD]" /><div className="h-3 w-1/2 rounded-full bg-[#E8DDCD]" /></div></div>)}</div></div>}
            {current?.error && <div role="alert" className="rounded-[24px] border border-[#E7BDB5] bg-[#FFF5F2] p-6"><h3 className="text-lg font-bold text-[#943C2D]">Unable to load projects</h3><p className="mt-2 text-base leading-7 text-[#803D32]">{current.error}</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" className={button} onClick={() => setRevision((value) => value + 1)}>Try again</button><button type="button" className={button} onClick={resetFilters}>Reset filters and page</button></div></div>}
            {data && <>
                {!!data.results.length && <div className={`project-directory-enter grid gap-5 ${layout === "grid" ? "xl:grid-cols-2" : "grid-cols-1"}`}>{data.results.map((project) => <HorizontalProjectCard key={project.id} project={project} layout={layout} to={`${prefix}/projects/${project.id}`} />)}</div>}
                {!data.results.length && <div className="rounded-[24px] border border-dashed border-[#CCB99F] bg-[#FFFDFA] px-6 py-14 text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F3E7D5] text-[#8A6840]"><FolderKanban size={30} strokeWidth={1.5} aria-hidden="true" /></span><h3 className="mt-5 text-xl font-bold text-[#352D24]">{hasFilters ? "No matching projects" : admin ? "Your next project starts here" : "No projects assigned yet"}</h3><p className="mx-auto mt-3 max-w-md text-base leading-7 text-[#716658]">{hasFilters ? "Try a different name, category or status to find the project you need." : admin ? "Create a project to start organising its tasks, site records and team." : "Projects will appear here when an Administrator assigns them to you."}</p>{hasFilters ? <button type="button" className={`${button} mt-6`} onClick={resetFilters}>Clear filters</button> : admin && <button type="button" className={`${primaryButton} mt-6`} onClick={() => setShowAddProject(true)}><Plus size={19} aria-hidden="true" />Add Project</button>}</div>}
                <nav aria-label="Project pagination" className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-[#E2D6C6] bg-[#FFFDFA] p-4 sm:p-5"><div className="space-y-1"><p className="text-sm font-semibold text-[#4F473D]">Showing {from}-{to} of {data.count}</p><p className="text-xs text-[#716658]">Page {page} of {Math.max(1, Math.ceil(data.count / pageSize))}</p></div><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm font-medium text-[#665C50]">Per page<select aria-label="Projects per page" value={pageSize} className="min-h-12 rounded-xl border border-[#D7C8B5] bg-[#FFFDFA] px-3 py-2 text-sm outline-none focus:border-[#94651D] focus:ring-2 focus:ring-[#E8D9BF]" onChange={(event) => change({ page_size: event.target.value })}>{[12, 24, 48].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><button type="button" className={button} disabled={!data.previous} onClick={() => changePage(page - 1)}><ChevronLeft size={18} aria-hidden="true" />Previous</button><button type="button" className={button} disabled={!data.next} onClick={() => changePage(page + 1)}>Next<ChevronRight size={18} aria-hidden="true" /></button></div></nav>
            </>}
        </section>
        <footer className="flex items-center gap-2 px-1 text-sm leading-6 text-[#716658]"><Building2 size={16} aria-hidden="true" className="shrink-0" />{admin ? "Open any project to manage its team, tasks and site records." : "Open a project to access its tasks, daily reports and site records."}<ArrowUpRight size={15} aria-hidden="true" className="shrink-0" /></footer>
        {admin && <AddProject open={showAddProject} onClose={() => setShowAddProject(false)} onCreated={(project) => { setShowAddProject(false); navigate(`/admin/projects/${project.id}`); }} />}
    </div>;
}

export default function Projects() {
    return <ProjectDirectory role="ADMIN" />;
}
