import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, FolderOpen, RefreshCw } from "lucide-react";
import { projectApi } from "../../api/projectApi";
import { validationMessage } from "../../hooks/useApprovalReview";

const pageSize = 25;
const button = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#C5AE8F] bg-[#F1EADF] px-5 py-3 text-sm font-bold text-[#4F3D27] hover:bg-[#E8DAC6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] disabled:cursor-not-allowed disabled:opacity-50";

function projectPage(data, page) {
    if (Array.isArray(data)) {
        return { results: data.slice((page - 1) * pageSize, page * pageSize), count: data.length, next: page * pageSize < data.length, previous: page > 1 };
    }
    if (!Array.isArray(data?.results) || !Number.isInteger(data.count) || data.count < 0) {
        throw new Error("Unexpected project response. Please refresh.");
    }
    return { ...data, next: Boolean(data.next), previous: Boolean(data.previous) };
}

function ProjectSearch({ query, onSearch, onRefresh, loading }) {
    const [search, setSearch] = useState(query);
    return (
        <form className="flex flex-wrap gap-3 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4" onSubmit={(event) => { event.preventDefault(); onSearch(search.trim()); }}>
            <label className="min-w-0 flex-1 basis-52 text-sm font-semibold text-[#716658]">
                Search projects
                <input type="search" maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} className="mt-2 w-full rounded-xl border border-[#E7DED2] bg-[#FFFDFA] px-3 py-3 text-sm outline-none focus:border-[#A58A67] focus:ring-2 focus:ring-[#E8DDD0]" />
            </label>
            <button type="submit" className={`${button} self-end`}>Search</button>
            <button type="button" className={`${button} self-end`} onClick={() => { setSearch(""); onSearch(""); }}>Clear</button>
            <button type="button" className={`${button} self-end`} disabled={loading} onClick={onRefresh}><RefreshCw size={18} aria-hidden="true" />Refresh</button>
        </form>
    );
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

    return <div className="mx-auto min-w-0 max-w-[1500px] space-y-6 pb-8 text-[#211E1A]">
        <header className="rare-page-header space-y-4 rounded-[28px] border border-[#E7DED2] bg-[#FFFDFA] p-6 sm:p-8">
            <div className="border-l-2 border-[#E7DED2] pl-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#716658]">Site records / {admin ? "Administration" : "Your assigned projects"}</p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Daily Reports</h1>
                <p className="mt-3 max-w-xl text-base leading-7 text-[#716658]">
                    {admin ? "Choose a project to review its site diary, work records and evidence." : "Choose an assigned project to create a daily report, continue a draft or review submitted site records."}
                </p>
            </div>
            {admin && <Link className={button} to="/admin/approvals?tab=work">Open Daily Work Verification</Link>}
        </header>

        <ProjectSearch key={query} query={query} onSearch={applySearch} onRefresh={() => setRevision((value) => value + 1)} loading={!current} />

        <section aria-label="Daily report projects" aria-busy={!current} className="space-y-4">
            {!current && <p role="status" className="rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-6 text-sm text-[#716658]">Loading projects...</p>}
            {current?.error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                <p>{current.error}</p>
                <button type="button" className={`${button} mt-3`} onClick={() => setRevision((value) => value + 1)}>Retry</button>
            </div>}
            {data && <>
                <p role="status" className="text-sm text-[#716658]">{data.count} matching {data.count === 1 ? "project" : "projects"}{admin ? "" : " assigned to you"}</p>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {data.results.map((project) => <Link key={project.id} to={`${prefix}/projects/${project.id}/daily-reports`} className="group min-w-0 rounded-[24px] border border-[#E2D6C6] bg-[#FFFDFA] p-6 transition-[border-color,box-shadow] hover:border-[#BCA17D] hover:shadow-md motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D]">
                        <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F6EAD5] text-[#795A30]"><FolderOpen size={23} aria-hidden="true" /></span>
                        <h2 className="break-words text-xl font-bold text-[#352D24]">{project.name}</h2>
                        <p className="mt-3 text-sm leading-6 text-[#665C50]">{admin ? "View daily reports and site evidence" : "Create reports, manage drafts and view site evidence"}</p>
                        <span className="mt-5 inline-flex items-center gap-2 text-base font-bold text-[#795016]">Open reports<ArrowUpRight size={18} aria-hidden="true" /></span>
                    </Link>)}
                </div>
                {!data.results.length && <div className="rounded-2xl border border-dashed border-[#CCB99F] bg-[#FFFDFA] p-8 text-center">
                    <h2 className="font-semibold">{query ? "No projects match this search" : admin ? "No projects available" : "No projects assigned yet"}</h2>
                    <p className="mt-2 text-sm text-[#716658]">{query ? "Try a different project name or clear the search." : admin ? "Projects will appear here once created." : "Your projects will appear here when an administrator assigns them to you."}</p>
                    {(query || page > 1) && <button type="button" className={`${button} mt-4`} onClick={() => applySearch("")}>Reset search and page</button>}
                </div>}
                <nav aria-label="Project pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <button type="button" className={button} disabled={!data.previous || page === 1} onClick={() => changePage(page - 1)}>Previous</button>
                    <span>Page {page} of {Math.max(1, Math.ceil(data.count / pageSize))}</span>
                    <button type="button" className={button} disabled={!data.next} onClick={() => changePage(page + 1)}>Next</button>
                </nav>
            </>}
        </section>
    </div>;
}
