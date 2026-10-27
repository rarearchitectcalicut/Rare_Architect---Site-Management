import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, CalendarDays, MapPin, UserRound } from "lucide-react";
import { getMediaUrl } from "../../utils/mediaUrl";

function formatDate(value) {
    if (!value) return "Not scheduled";
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function ProjectStatus({ status }) {
    const styles = {
        ACTIVE: "border-[#B5DCCB] bg-[#E9F6EF] text-[#176647]",
        MAINTENANCE: "border-[#E8CE94] bg-[#FFF4D9] text-[#795016]",
        COMPLETED: "border-[#BACFEF] bg-[#EAF1FD] text-[#28549A]",
        ON_HOLD: "border-[#E8CE94] bg-[#FFF4D9] text-[#795016]",
        CANCELLED: "border-[#E4C1BD] bg-[#FBECEA] text-[#A33229]",
    };
    return <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${styles[status] || "border-[#D9D0C4] bg-[#F1EADF] text-[#66543D]"}`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{String(status || "Unknown").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}</span>;
}

function Detail({ icon: Icon, label, value }) {
    return <div className="flex min-w-0 items-start gap-2.5"><Icon size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-[#8A6840]" /><div className="min-w-0"><dt className="text-xs font-semibold text-[#716658]">{label}</dt><dd className="mt-1 break-words text-sm font-medium leading-6 text-[#352D24]">{value || "Not specified"}</dd></div></div>;
}

export default function HorizontalProjectCard({ project, categoryName, to, layout = "list", actionLabel = "View Project" }) {
    const [failedUrl, setFailedUrl] = useState(null);
    const imageUrl = getMediaUrl(project.cover_image);
    const gallery = layout === "grid";
    return <Link to={to || `/admin/projects/${project.id}`} aria-label={`View project ${project.name}`} className={`group flex h-full min-w-0 overflow-hidden rounded-[24px] border border-[#E2D6C6] bg-[#FFFDFA] shadow-[0_5px_20px_-17px_rgba(61,42,20,0.35)] transition-[border-color,box-shadow,transform] duration-200 ease-out hover:border-[#BCA17D] hover:shadow-[0_14px_34px_-20px_rgba(61,42,20,0.35)] motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#94651D] ${gallery ? "flex-col" : "flex-col sm:flex-row"}`}>
        <div className={`relative shrink-0 overflow-hidden bg-[#EDE3D5] ${gallery ? "h-32 sm:h-40" : "h-24 sm:h-auto sm:w-36 lg:w-44"}`}>
            {imageUrl && failedUrl !== imageUrl ? <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(imageUrl)} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.035] motion-reduce:transition-none" /> : <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-linear-to-br from-[#D9C6AB] via-[#E9DDCB] to-[#F7F0E5]"><span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 bg-white/35 text-[#8A6840]"><Building2 size={32} strokeWidth={1.25} aria-hidden="true" /></span><span className="max-w-full truncate px-4 text-xs font-bold uppercase tracking-[0.12em] text-[#705431]">{project.category_name || categoryName || "RARE project"}</span></div>}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1 basis-40"><p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#80603B]">{project.category_name || categoryName || "Project"}</p><h3 className="break-words text-lg font-bold leading-6 tracking-tight text-[#2E271F] transition-colors group-hover:text-[#795016] sm:text-xl">{project.name}</h3></div><ProjectStatus status={project.status} /></div>
            <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-[#665C50]"><MapPin size={16} aria-hidden="true" className="mt-1 shrink-0" /><span className="break-words">{project.location || "Location not specified"}</span></p>
            <dl className={`mb-4 mt-4 grid gap-x-5 gap-y-4 border-t border-[#EDE5DA] pt-4 ${gallery ? "sm:grid-cols-2" : "lg:grid-cols-3"}`}><Detail icon={UserRound} label="Client" value={project.client_name} /><Detail icon={CalendarDays} label="Start date" value={formatDate(project.start_date)} /><Detail icon={CalendarDays} label="Expected completion" value={formatDate(project.end_date)} /></dl>
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#EDE5DA] pt-4"><span className="text-sm text-[#716658]">Project workspace</span><span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E3C78D] bg-[#F8E7BE] px-4 py-2 text-sm font-bold text-[#654510] transition-colors group-hover:bg-[#F3C45C] motion-reduce:transition-none">{actionLabel}<ArrowUpRight size={18} aria-hidden="true" className="transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none" /></span></div>
        </div>
    </Link>;
}
