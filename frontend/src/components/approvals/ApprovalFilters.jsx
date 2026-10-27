import { Search } from "lucide-react";
import { formatText, referenceId } from "./approvalUtils";
import { requestLabels, delayTypes } from "./queueData";

const input = "mt-2 h-11 w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-3 text-xs font-medium text-[#665E53] outline-none focus:border-[#3565A5]";

export default function ApprovalFilters({ filters, onChange, onClear, projects, mode = "tasks", projectsUnavailable = false }) {
    const categories = [...new Map(projects.map((project) => [referenceId(project.category), project.category_name || project.category?.name || "Category"])).entries()].filter(([id]) => id);
    function select(key, label, options) {
        return <label className="min-w-0 text-[11px] font-semibold text-[#817669]">{label}<select aria-label={label} value={filters[key]} onChange={(event) => onChange(key, event.target.value)} className={input} disabled={projectsUnavailable && ["project", "category"].includes(key)}>
            <option value="">All {label.toLowerCase()}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select></label>;
    }
    return <div className="space-y-4 border-b border-[#EEE6DC] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-0 flex-[1_1_240px]"><Search size={17} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#948778]" /><span className="sr-only">Search approvals</span><input type="search" value={filters.search} onChange={(event) => onChange("search", event.target.value)} placeholder="Search task, project or supervisor…" className={`${input} mt-0 pl-10`} /></label>
            <label className="text-xs text-[#817669]"><span className="sr-only">Sort approvals</span><select aria-label="Sort approvals" value={filters.sort} onChange={(event) => onChange("sort", event.target.value)} className={`${input} mt-0`}><option value="oldest">Oldest first</option><option value="newest">Newest first</option>{!["history", "delays"].includes(mode) && <><option value="priority">Highest priority</option><option value="project">Project A–Z</option><option value="title">Task A–Z</option></>}</select></label>
            <button type="button" onClick={onClear} className="px-2 py-3 text-xs font-semibold text-[#3565A5]">Clear filters</button>
        </div>
        <details><summary className="cursor-pointer text-xs font-semibold text-[#665E53]">Project and request filters</summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mode === "delays" && !projects.length ? <label className="text-xs text-[#817669]">Project name<input type="search" value={filters.projectSearch || ""} onChange={(event) => onChange("projectSearch", event.target.value)} className={input} /></label> : select("project", "Projects", projects.map((project) => [String(project.id), project.name]))}
                {mode !== "delays" && select("category", "Categories", categories)}
                {mode === "tasks" && select("priority", "Priorities", ["URGENT", "HIGH", "MEDIUM", "LOW"].map((value) => [value, formatText(value)]))}
                {["history", "delays", "work"].includes(mode) && select("status", "Statuses", (mode === "history" ? ["APPROVED", "REJECTED", "VERIFIED"] : mode === "work" ? ["PENDING", "VERIFIED", "REJECTED"] : ["PENDING", "APPROVED", "REJECTED"]).map((value) => [value, formatText(value)]))}
                {mode === "history" && select("type", "Request types", Object.entries({ ...requestLabels, work: "Daily Work" }))}
                {mode === "history" && <>
                    {[["task_search", "Task name"], ["reviewer_search", "Reviewer name"]].map(([key, label]) => <label key={key} className="text-xs text-[#817669]">{label}<input value={filters[key]} onChange={(event) => onChange(key, event.target.value)} className={input} /></label>)}
                    {[["date_from", "Decisions from"], ["date_to", "Decisions through"]].map(([key, label]) => <label key={key} className="text-xs text-[#817669]">{label}<input type="date" value={filters[key]} onChange={(event) => onChange(key, event.target.value)} className={input} /></label>)}
                </>}
                {mode === "delays" && <>{select("delayType", "Delay types", delayTypes.map((value) => [value, formatText(value)]))}{select("extension", "Extensions", [["REQUESTED", "Extension requested"], ["NONE", "Not requested"], ["PENDING", "Pending extension"], ["APPROVED", "Approved extension"], ["REJECTED", "Rejected extension"]])}</>}
                {mode === "delays" && [["date_from", "Reported from"], ["date_to", "Reported through"]].map(([key, label]) => <label key={key} className="text-xs text-[#817669]">{label}<input type="date" value={filters[key] || ""} onChange={(event) => onChange(key, event.target.value)} className={input} /></label>)}
                {mode === "work" && <label className="text-xs text-[#817669]">Report date<input type="date" value={filters.date} onChange={(event) => onChange("date", event.target.value)} className={input} /></label>}
            </div>
        </details>
        {projectsUnavailable && <p role="status" className="text-xs text-[#94651D]">Project and category filters are unavailable. Refresh to retry.</p>}
    </div>;
}
