import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, CalendarDays, ChevronRight, MapPin, UserRound } from "lucide-react";
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
    return <div className="flex min-w-0 items-start gap-1.5 sm:gap-2.5"><Icon size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-[#8A6840] sm:h-[17px] sm:w-[17px]" /><div className="min-w-0"><dt className="text-xs font-semibold leading-4 text-[#716658]">{label}</dt><dd className="mt-0.5 break-words text-xs font-medium leading-4 text-[#352D24] sm:mt-1 sm:text-sm sm:leading-6">{value || "Not specified"}</dd></div></div>;
}

export default function HorizontalProjectCard({ project, categoryName, to, layout = "list", actionLabel = "View Project" }) {
    const [failedUrl, setFailedUrl] = useState(null);
    const imageUrl = getMediaUrl(project.cover_image);
    const gallery = layout === "grid";
    const cover = imageUrl && failedUrl !== imageUrl
        ? <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(imageUrl)} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.035] motion-reduce:transition-none" />
        : <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-linear-to-br from-[#D9C6AB] via-[#E9DDCB] to-[#F7F0E5]"><span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/60 bg-white/35 text-[#8A6840]"><Building2 size={32} strokeWidth={1.25} aria-hidden="true" /></span><span className="max-w-full truncate px-4 text-xs font-bold uppercase tracking-[0.12em] text-[#705431]">{project.category_name || categoryName || "RARE project"}</span></div>;
    const due = project.end_date ? formatDate(project.end_date) : "";
    const client = project.client_name || "Client not specified";
    return <Link to={to || `/admin/projects/${project.id}`} aria-label={`Open project: ${project.name}`} className={`group flex h-full min-w-0 overflow-hidden rounded-2xl border border-[#E2D6C6] bg-[#FFFDFA] shadow-[0_5px_20px_-17px_rgba(61,42,20,0.35)] transition-[border-color,box-shadow,transform] duration-200 ease-out hover:border-[#BCA17D] hover:shadow-[0_14px_34px_-20px_rgba(61,42,20,0.35)] motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#94651D] sm:rounded-[24px] ${gallery ? "flex-col" : "flex-row items-center"} max-[480px]:rounded-2xl`}>
        <div className={`min-w-0 ${gallery ? "hidden max-[480px]:flex max-[480px]:flex-col" : "flex w-full flex-row items-center"}`}>
            <div className={`relative shrink-0 overflow-hidden bg-[#EDE3D5] ${gallery ? "aspect-video max-h-[120px] w-full" : "h-16 w-16"}`}>
                {cover}
                {gallery && project.status !== "ACTIVE" && <span className="absolute right-2 top-2"><ProjectStatus status={project.status} /></span>}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
            </div>
            <div className={`min-w-0 flex-1 ${gallery ? "p-3" : "px-3 py-2"}`}>
                <div className="flex min-w-0 items-center gap-2">
                    <h3 className="line-clamp-2 min-w-0 flex-1 text-base font-semibold leading-5 text-[#2E271F]">{project.name}</h3>
                    <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[#716658]" />
                </div>
                <p className="mt-1 truncate text-xs font-medium leading-4 text-[#665C50]">{project.location || "Location not specified"}</p>
                <p className="mt-1 truncate text-[13px] font-medium leading-4 text-[#352D24]">{client}{due && <> · Due {due}</>}</p>
                {!gallery && project.status !== "ACTIVE" && <span className="mt-1 inline-flex"><ProjectStatus status={project.status} /></span>}
            </div>
        </div>
        {gallery && <>
        <div className="relative hidden h-20 shrink-0 overflow-hidden bg-[#EDE3D5] sm:h-40 min-[481px]:block">
            {cover}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
        </div>
        <div className="hidden min-w-0 flex-1 flex-col p-3 sm:p-6 min-[481px]:flex">
            <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3"><div className="min-w-0 flex-1 basis-32"><p className="mb-1 text-xs font-bold uppercase tracking-[0.1em] text-[#80603B] sm:mb-2 sm:tracking-[0.12em]">{project.category_name || categoryName || "Project"}</p><h3 className="break-words text-base font-bold leading-5 tracking-tight text-[#2E271F] transition-colors group-hover:text-[#795016] sm:text-xl sm:leading-6">{project.name}</h3></div><span className="scale-90 origin-top-right sm:scale-100"><ProjectStatus status={project.status} /></span></div>
            <p className="mt-2 flex items-start gap-1.5 text-xs leading-4 text-[#665C50] sm:mt-3 sm:gap-2 sm:text-sm sm:leading-6"><MapPin size={14} aria-hidden="true" className="mt-0.5 shrink-0 sm:mt-1 sm:h-4 sm:w-4" /><span className="break-words">{project.location || "Location not specified"}</span></p>
            <dl className={`mb-2 mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[#EDE5DA] pt-3 sm:mb-4 sm:mt-4 sm:gap-x-5 sm:gap-y-4 sm:pt-4 ${gallery ? "" : "lg:grid-cols-3"}`}><Detail icon={UserRound} label="Client" value={project.client_name} /><Detail icon={CalendarDays} label="Start date" value={formatDate(project.start_date)} /><Detail icon={CalendarDays} label="Expected completion" value={formatDate(project.end_date)} /></dl>
            <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#EDE5DA] pt-2.5 sm:gap-3 sm:pt-4"><span className="text-xs text-[#716658] sm:text-sm">Project workspace</span><span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#E3C78D] bg-[#F8E7BE] px-2.5 py-2 text-xs font-bold text-[#654510] transition-colors group-hover:bg-[#F3C45C] motion-reduce:transition-none sm:gap-2 sm:rounded-xl sm:px-4 sm:text-sm">{actionLabel}<ArrowUpRight size={16} aria-hidden="true" className="transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none sm:h-[18px] sm:w-[18px]" /></span></div>
        </div>
        </>}
    </Link>;
}
