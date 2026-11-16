import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CalendarDays, MapPin, UserRound } from "lucide-react";
import { projectApi } from "../../api/projectApi";
import { getMediaUrl } from "../../utils/mediaUrl";

const statuses = [["", "All"], ["ACTIVE", "Active"], ["MAINTENANCE", "Maintenance"], ["ON_HOLD", "On Hold"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"]];
const colors = { ACTIVE: ["#24A66A", "#DDF3EA", "#087D60"], ON_HOLD: ["#E5A216", "#FFF0CB", "#996000"], CANCELLED: ["#E84C49", "#FCE3E1", "#BB2525"], COMPLETED: ["#5387C9", "#EAF1FD", "#28549A"], MAINTENANCE: ["#C29339", "#FFF4D9", "#795016"] };
function date(value) {
    if (!value) return "Not scheduled";
    const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? "Not scheduled" : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function DesktopProjectStatusTabs({ filters, onChange, revision }) {
    const [countState, setCountState] = useState(null);
    const countKey = JSON.stringify([filters.search, filters.category, revision]);
    const counts = countState?.key === countKey ? countState.counts : null;
    useEffect(() => {
        if (!window.matchMedia("(min-width: 1024px)").matches) return;
        const controller = new AbortController();
        Promise.all(statuses.map(async ([status]) => {
            const response = await projectApi.getProjects({ search: filters.search, category: filters.category, status, page_size: 1 }, controller.signal);
            return [status, Array.isArray(response) ? response.length : response.count];
        })).then((entries) => { if (!controller.signal.aborted) setCountState({ key: countKey, counts: Object.fromEntries(entries) }); }).catch(() => {});
        return () => controller.abort();
    }, [filters.search, filters.category, revision, countKey]);
    return <div className="hidden flex-wrap gap-2 lg:flex" aria-label="Project status filters">
        {statuses.filter(([status]) => !status || counts?.[status] > 0 || filters.status === status).map(([status, label]) => <button key={status} type="button" aria-pressed={filters.status === status} onClick={() => onChange({ status })} className={`rounded-full border border-[#E7DED2] px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94651D] ${filters.status === status ? "bg-[#292115] text-white" : "bg-[#FFFDFA] text-[#554535]"}`}>{label}{counts?.[status] != null ? ` ${counts[status]}` : ""}</button>)}
    </div>;
}

export function DesktopProjectCard({ project, to }) {
    const [failedUrl, setFailedUrl] = useState(null);
    const coverUrl = getMediaUrl(project.cover_image);
    const [accent, background, foreground] = colors[project.status] || ["#A58A67", "#F1EADF", "#66543D"];
    const statusLabel = statuses.find(([value]) => value === project.status)?.[1] || project.status;
    return <Link to={to} aria-label={`Open project: ${project.name}`} className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-[#EDE5DA] bg-[#FFFDFA] p-4 pt-5 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#94651D]">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />
        <div className="relative -mx-4 -mt-1 mb-4 h-36 shrink-0 overflow-hidden bg-[#F1EADF]">
            {coverUrl && failedUrl !== coverUrl ? <img src={coverUrl} alt={`${project.name} cover`} loading="lazy" decoding="async" onError={() => setFailedUrl(coverUrl)} className="h-full w-full object-cover" /> : <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-[#F8F4EE] via-[#F1EADF] to-[#E4D8C7]"><span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/60 bg-white/35 text-[#8A7358]"><Building2 size={36} strokeWidth={1.3} /></span></div>}
        </div>
        <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F1E6D5] text-[#8A6840]"><Building2 size={16} /></span><span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[#795016]">{project.category_name || "Project"}</span></div>
            <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: background, color: foreground }}>{statusLabel}</span>
        </div>
        <h2 className="mt-3 truncate text-base font-bold text-[#211E1A]">{project.name}</h2>
        <p className="mt-1 flex items-center gap-2 text-xs text-[#817669]"><MapPin size={14} className="shrink-0" /><span className="truncate">{project.location || "Location not specified"}</span></p>
        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[#EFE7DC] pt-3">
            {[[UserRound, "Client", project.client_name || "Not specified"], [CalendarDays, "Start date", date(project.start_date)], [CalendarDays, "Expected completion", date(project.end_date)]].map(([Icon, label, value]) => <div key={label} className="min-w-0"><dt className="flex items-center gap-1.5 text-[11px] text-[#817669]"><Icon size={14} className="shrink-0" />{label}</dt><dd className="mt-1 break-words text-xs font-medium text-[#211E1A]">{value}</dd></div>)}
        </dl>
    </Link>;
}
