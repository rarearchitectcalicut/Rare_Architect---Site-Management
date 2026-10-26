import { ArrowUpRight, ChevronDown, Clock3, FileText, FolderKanban, History, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { formatText } from "../approvals/approvalUtils";

function timestamp(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "Date unavailable";
    return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Metadata({ value }) {
    if (value == null || value === "") return <span className="text-[#817669]">Not recorded</span>;
    if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
    if (Array.isArray(value)) return value.length ? <ul className="space-y-2">{value.map((item, i) => <li key={i}><Metadata value={item} /></li>)}</ul> : <span>None</span>;
    if (typeof value === "object") return <dl className="space-y-3">{Object.entries(value).map(([key, item]) => (
        <div key={key} className="min-w-0 border-l-2 border-[#E7DED2] pl-3"><dt className="mb-1 text-[11px] font-medium text-[#817669]">{formatText(key)}</dt><dd className="min-w-0"><Metadata value={item} /></dd></div>
    ))}</dl>;
    return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
}

function eventStyle(entry) {
    if (/(REJECTED|CANCELLED|DEACTIVATED|DELETED|UNASSIGNED)$/.test(entry.action)) return "bg-[#F6E7E1] text-[#AA6554]";
    if (/(APPROVED|VERIFIED|COMPLETED|ACTIVATED)$/.test(entry.action)) return "bg-[#E8EFEB] text-[#49715D]";
    return "bg-[#EEE5D8] text-[#8B6944]";
}

function relatedLink(entry) {
    const isId = (value) => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value || "");
    if (!isId(entry.entity_id)) return null;
    if (entry.entity_type === "PROJECT") return { to: `/admin/projects/${entry.entity_id}`, label: "Open project" };
    if (entry.entity_type === "TASK" && isId(entry.metadata?.project_id)) return { to: `/admin/projects/${entry.metadata.project_id}/tasks/${entry.entity_id}`, label: "Open task" };
    return null;
}

export default function ActivityEntry({ entry }) {
    const Icon = entry.entity_type === "USER" ? UserRound : entry.entity_type === "PROJECT" ? FolderKanban : entry.entity_type?.includes("DOCUMENT") ? FileText : History;
    const link = relatedLink(entry);
    return <article className="activity-enter rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] p-4 shadow-[0_3px_16px_#422F1604] transition-shadow hover:shadow-[0_8px_24px_#422F1609] sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${eventStyle(entry)}`}><Icon size={20} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="break-words text-sm font-semibold text-[#211E1A]">{formatText(entry.action)}</h2>
                    <time dateTime={entry.created_at || undefined} className="flex items-center gap-1.5 text-[11px] text-[#817669]"><Clock3 size={12} aria-hidden="true" />{timestamp(entry.created_at)}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#665C50]">{entry.summary || entry.description || "No description recorded."}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-[#817669]">
                    <span className="font-semibold text-[#665C50]">{entry.actor_name || "System / unavailable user"}</span>
                    {entry.actor_role && <span>{formatText(entry.actor_role)}</span>}
                    <span className="rounded-full border border-[#E7DED2] bg-[#F8F5F0] px-2.5 py-1">{formatText(entry.entity_type)}</span>
                    {entry.project_name && <span className="break-words">{entry.project_name}</span>}
                </div>
            </div>
        </div>
        <details className="group mt-4 border-t border-[#F0E9DF] pt-3">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-[#8B6944] focus-visible:outline-2 focus-visible:outline-[#A58A67] [&::-webkit-details-marker]:hidden">Event details<ChevronDown size={14} className="transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary>
            <div className="mt-4 space-y-5 rounded-2xl border border-[#EAE1D5] bg-[#F8F5F0] p-4 sm:p-5">
                <dl className="grid gap-4 text-xs sm:grid-cols-2">
                    {[["Activity reference", entry.id], ["Actor reference", entry.actor_id || entry.actor], ["Entity reference", entry.entity_id], ["Subject", entry.subject_name]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="mb-1 text-[11px] text-[#817669]">{label}</dt><dd className="break-words leading-5 text-[#665C50]">{value || "Not recorded"}</dd></div>)}
                </dl>
                {entry.metadata && Object.keys(entry.metadata).length > 0 && <div className="text-xs leading-6 text-[#665C50]"><h3 className="mb-3 font-semibold text-[#211E1A]">Recorded context</h3><Metadata value={entry.metadata} /></div>}
                {link && <Link to={link.to} className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-3 py-2.5 text-xs font-semibold text-[#FFFDFA] hover:bg-[#44382B]">{link.label}<ArrowUpRight size={14} aria-hidden="true" /></Link>}
            </div>
        </details>
    </article>;
}
