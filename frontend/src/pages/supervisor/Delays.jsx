import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useDelayReports } from "../../hooks/useDelayReports";

export default function SupervisorDelays() {
    const { reports, projects, loading, error, refresh } = useDelayReports();
    const [search, setSearch] = useState("");
    const visible = projects.filter((project) => project.name.toLowerCase().includes(search.trim().toLowerCase()));
    return <div className="space-y-6 pb-8">
        <header className="rounded-[28px] bg-[#252B2A] p-6 text-white sm:p-8"><div className="flex items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold">Delay Reports</h1><p className="mt-3 text-sm text-[#C3C9C5]">Choose an assigned project to report a delay or review extension feedback.</p></div><button type="button" aria-label="Refresh projects" disabled={loading} onClick={refresh} className="rounded-xl border border-white/20 p-3"><RefreshCw size={17} /></button></div></header>
        <label className="block text-xs font-semibold text-[#817669]">Find a project<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-4 text-sm outline-none focus:border-[#3565A5]" /></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        {loading ? <p role="status" className="text-sm text-[#817669]">Loading assigned projects…</p> : <div className="grid gap-4 sm:grid-cols-2">{visible.map((project) => {
            const related = reports.filter((report) => String(report.project_id) === String(project.id));
            return <Link key={project.id} to={`/supervisor/projects/${project.id}/delays`} className="rounded-[22px] border border-[#E5DDD1] bg-[#FFFDFA] p-6 transition-colors hover:border-[#A8BDD7]">
                <h2 className="font-bold">{project.name}</h2><p className="mt-3 text-xs text-[#817669]">{related.length} delay reports · {related.filter((report) => report.extension_status === "PENDING").length} pending extensions</p><span className="mt-5 block text-sm font-semibold text-[#3565A5]">Open project delays →</span>
            </Link>;
        })}{!visible.length && <p className="p-6 text-sm text-[#817669]">No assigned projects match your search.</p>}</div>}
    </div>;
}
