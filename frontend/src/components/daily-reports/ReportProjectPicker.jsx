import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, FolderOpen, RefreshCw, Search } from "lucide-react";
import { DesktopProjectCard } from "../projects/DesktopProjects";
import { projectApi } from "../../api/projectApi";
import { validationMessage } from "../../hooks/useApprovalReview";

const pageSize = 25;
const button = "rare-button rare-button-secondary";

function projectPage(data, page) {
    if (Array.isArray(data)) {
        return { results: data.slice((page - 1) * pageSize, page * pageSize), count: data.length, next: page * pageSize < data.length, previous: page > 1 };
    }
    if (!Array.isArray(data?.results) || !Number.isInteger(data.count) || data.count < 0) {
        throw new Error("Unexpected project response. Please refresh.");
    }
    return { ...data, next: Boolean(data.next), previous: Boolean(data.previous) };
}

// Reused by listing toolbars. Suggestions use only records already loaded by the
// authorized listing; searching never starts a separate, unbounded name fetch.
export function ProjectSearch({ query = "", onSearch, onRefresh, loading = false, suggestions, suggestionsFiltered = false, delay = 300, compact = false, label = "Search projects", labelClassName = "mb-2 block text-sm font-semibold text-[#817669]", placeholder = "Project name", className = "" }) {
    const [search, setSearch] = useState(query);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const timer = useRef(null);
    const committed = useRef(query);
    const callback = useRef(onSearch);
    const id = useId();
    const navigate = useNavigate();
    useEffect(() => { callback.current = onSearch; }, [onSearch]);
    useEffect(() => {
        if (query !== committed.current) {
            clearTimeout(timer.current);
            committed.current = query;
            setSearch(query);
            setActive(-1);
        }
    }, [query]);
    useEffect(() => () => clearTimeout(timer.current), []);
    const pending = search.trim() !== query;
    // Server-filtered project results also match client, location and description.
    const matches = !pending && !loading ? [...new Map((suggestions || []).filter((item) => suggestionsFiltered || item.name?.toLowerCase().includes(search.trim().toLowerCase())).map((item) => [item.id ?? item.name, item])).values()].slice(0, 6) : [];
    const expanded = open && search.trim().length > 0 && suggestions !== undefined;
    function commit(value) {
        clearTimeout(timer.current);
        if (value !== committed.current) {
            committed.current = value;
            callback.current(value);
        }
    }
    function change(value) {
        setSearch(value); setActive(-1); setOpen(true);
        clearTimeout(timer.current);
        if (!delay || !value.trim()) commit(value.trim());
        else timer.current = setTimeout(() => commit(value.trim()), delay);
    }
    function select(item) {
        clearTimeout(timer.current);
        setSearch(item.name); setOpen(false); setActive(-1);
        if (item.to) navigate(item.to);
        else commit(item.name);
    }
    return <div className={`flex min-w-0 flex-wrap items-end gap-3 ${className}`}>
        <div className="relative min-w-0 flex-1 basis-52" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); } }}>
            <label htmlFor={id} className={labelClassName}>{label}</label>
            <div className="relative">
                <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#716658]" />
                <input id={id} type="search" maxLength={200} value={search} placeholder={placeholder} autoComplete="off"
                    role={suggestions !== undefined ? "combobox" : undefined} aria-autocomplete={suggestions !== undefined ? "list" : undefined}
                    aria-expanded={suggestions !== undefined ? expanded : undefined} aria-controls={expanded ? `${id}-list` : undefined}
                    aria-activedescendant={expanded && matches[active] ? `${id}-${active}` : undefined}
                    onFocus={() => setOpen(true)} onChange={(event) => change(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); }
                        if (["ArrowDown", "ArrowUp"].includes(event.key) && suggestions !== undefined) {
                            event.preventDefault(); setOpen(true);
                            if (matches.length) setActive((index) => index < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
                        }
                        if (event.key === "Enter") { event.preventDefault(); if (expanded && matches[active]) select(matches[active]); else commit(search.trim()); }
                    }}
                    className={`${compact ? "h-11 min-h-11 py-2" : "min-h-12 py-3"} w-full min-w-0 rounded-xl border border-[#E7DED2] bg-[#FFFDFA] pl-11 pr-14 text-sm text-[#211E1A] outline-none placeholder:text-[#716658] focus:border-[#A58A67] focus:ring-2 focus:ring-[#E8DDD0]`} />
                {search && <button type="button" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => { change(""); setOpen(false); }} className={`absolute right-0 top-0 flex ${compact ? "h-11 w-11" : "h-12 w-12"} items-center justify-center rounded-xl text-lg text-[#817669] focus-visible:outline-2 focus-visible:outline-[#A58A67]`}>×</button>}
            </div>
            {expanded && <ul id={`${id}-list`} role="listbox" aria-label={`${label} suggestions`} className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-y-auto rounded-xl border border-[#E7DED2] bg-[#FFFDFA] p-1 shadow-lg">
                {matches.map((item, index) => <li id={`${id}-${index}`} key={item.id ?? item.name} role="option" aria-selected={active === index} onPointerDown={(event) => event.preventDefault()} onClick={() => select(item)} onMouseEnter={() => setActive(index)} className={`min-h-12 cursor-pointer rounded-lg px-3 py-3 text-sm text-[#211E1A] ${active === index ? "bg-[#F1EADF]" : "hover:bg-[#F1EADF]"}`}><strong className="block break-words">{item.name}</strong>{item.context && <span className="block break-words text-xs text-[#817669]">{item.context}</span>}</li>)}
                {!matches.length && <li role="presentation" className="px-3 py-3 text-sm text-[#817669]"><span role="status">{loading || pending ? "Finding matches…" : "No matching names in these results"}</span></li>}
            </ul>}
        </div>
        {onRefresh && <button type="button" aria-label="Refresh projects" className={button} disabled={loading} onClick={onRefresh}><RefreshCw size={18} aria-hidden="true" />Refresh</button>}
    </div>;
}

export default function ReportProjectPicker({ role = "ADMIN" }) {
    const [params, setParams] = useSearchParams();
    const query = params.get("search") || "";
    const requestedPage = Number(params.get("page"));
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState(null);
    const admin = role === "ADMIN";
    const prefix = admin ? "/admin" : "/supervisor";
    const key = JSON.stringify([role, query, page, revision]);
    const current = result?.key === key ? result : null;
    const data = current?.data;

    useEffect(() => {
        const controller = new AbortController();
        projectApi.getProjects({ search: query, page, page_size: pageSize }, controller.signal)
            .then((response) => {
                if (!controller.signal.aborted) setResult({ key, data: projectPage(response, page) });
            })
            .catch((error) => {
                if (!controller.signal.aborted) setResult({ key, error: validationMessage(error, "Unable to load projects. Please try again.") });
            });
        return () => controller.abort();
    }, [key, query, page]);

    function applySearch(value) {
        const next = new URLSearchParams();
        if (value) next.set("search", value);
        setParams(next);
    }

    function changePage(value) {
        const next = new URLSearchParams(params);
        next.set("page", String(value));
        setParams(next);
    }

    return <div className="daily-report-project-picker mx-auto min-w-0 max-w-[1500px] space-y-6 pb-8 text-[#211E1A]">
        <header className="rare-page-header space-y-4 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5">
            <div className="border-l-2 border-[#E7DED2] pl-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#716658]">Site records / {admin ? "Administration" : "Your assigned projects"}</p>
                <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">Daily Reports</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[#716658]">
                    {admin ? "Choose a project to review its site diary, work records and evidence." : "Choose an assigned project to create a daily report, continue a draft or review submitted site records."}
                </p>
            </div>
            {admin && <Link className={button} to="/admin/approvals?tab=work">Open Daily Work Verification</Link>}
        </header>

        <ProjectSearch suggestionsFiltered query={query} onSearch={applySearch} onRefresh={() => setRevision((value) => value + 1)} loading={!current} suggestions={(data?.results || []).map((project) => ({ id: project.id, name: project.name, to: `${prefix}/projects/${project.id}/daily-reports` }))} className="rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4" />

        <section aria-label="Daily report projects" aria-busy={!current} className="space-y-4">
            {!current && <p role="status" className="rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-6 text-sm text-[#716658]">Loading projects...</p>}
            {current?.error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                <p>{current.error}</p>
                <button type="button" className={`${button} mt-3`} onClick={() => setRevision((value) => value + 1)}>Retry</button>
            </div>}
            {data && <>
                <p role="status" className="text-sm text-[#716658]">{data.count} matching {data.count === 1 ? "project" : "projects"}{admin ? "" : " assigned to you"}</p>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {data.results.map((project) => <div key={project.id} className="min-w-0"><div className="hidden h-full lg:block"><DesktopProjectCard project={project} to={`${prefix}/projects/${project.id}/daily-reports`} /></div><div className="h-full lg:hidden"><Link to={`${prefix}/projects/${project.id}/daily-reports`} className="group min-w-0 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4 transition-[border-color,box-shadow] hover:border-[#9A8872] hover:shadow-md motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A58A67]">
                        <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1EADF] text-[#514538]"><FolderOpen size={20} aria-hidden="true" /></span>
                        <h2 className="break-words text-base font-semibold text-[#211E1A]">{project.name}</h2>
                        <p className="mt-2 text-sm leading-6 text-[#716658]">{admin ? "View daily reports and site evidence" : "Create reports, manage drafts and view site evidence"}</p>
                        <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#514538]">Open reports<ArrowUpRight size={16} aria-hidden="true" /></span>
                    </Link></div></div>)}
                </div>
                {!data.results.length && <div className="rounded-2xl border border-dashed border-[#CCB99F] bg-[#FFFDFA] p-6 text-center">
                    <h2 className="text-base font-semibold text-[#211E1A]">{query ? "No projects match this search" : admin ? "No projects available" : "No projects assigned yet"}</h2>
                    <p className="mt-2 text-sm text-[#716658]">{query ? "Try a different project name or clear the search." : admin ? "Projects will appear here once created." : "Your projects will appear here when an administrator assigns them to you."}</p>
                    {(query || page > 1) && <button type="button" className={`${button} mt-4`} onClick={() => applySearch("")}>Reset search and page</button>}
                </div>}
                <nav aria-label="Project pages" className="rare-pagination text-sm">
                    <button type="button" className={button} disabled={!data.previous || page === 1} onClick={() => changePage(page - 1)}>Previous</button>
                    <span aria-live="polite" aria-atomic="true">Page {page} of {Math.max(1, Math.ceil(data.count / pageSize))}</span>
                    <button type="button" className={button} disabled={!data.next} onClick={() => changePage(page + 1)}>Next</button>
                </nav>
            </>}
        </section>
    </div>;
}
