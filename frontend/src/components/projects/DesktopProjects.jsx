import { useEffect, useState } from "react";
import { projectApi } from "../../api/projectApi";
import HorizontalProjectCard from "./HorizontalProjectCard";

const statuses = [["", "All"], ["ACTIVE", "Active"], ["MAINTENANCE", "Maintenance"], ["ON_HOLD", "On Hold"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"]];
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
        {statuses.filter(([status]) => !status || counts?.[status] > 0 || filters.status === status).map(([status, label]) => <button key={status} type="button" aria-pressed={filters.status === status} onClick={() => onChange({ status })} className={`rounded-full border border-border px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning ${filters.status === status ? "bg-action text-white" : "bg-surface text-ink"}`}>{label}{counts?.[status] != null ? ` ${counts[status]}` : ""}</button>)}
    </div>;
}

export function DesktopProjectCard({ project, to, layout = "grid", actionLabel = "View Project" }) {
    return <HorizontalProjectCard project={project} to={to} layout={layout} actionLabel={actionLabel} />;
}
