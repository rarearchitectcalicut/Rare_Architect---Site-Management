import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, CalendarDays, ChevronDown, ClipboardList, Files, FolderKanban, MapPin, MoreHorizontal, ScrollText, Timer, UserRound } from "lucide-react";
import InfoCard from "../common/InfoCard";
import { ProjectStatus } from "./ProjectStatus";

export function ProjectHero({ project, coverUrl, children }) {
    const [failedUrl, setFailedUrl] = useState(null);
    return <header className="rare-project-hero">
        <div className="rare-project-hero-identity">
            <div className="rare-project-hero-thumbnail">
                {coverUrl && coverUrl !== failedUrl ? <img src={coverUrl} alt={`${project.name} cover`} onError={() => setFailedUrl(coverUrl)} /> : <Building2 size={34} strokeWidth={1.25} aria-hidden="true" />}
            </div>
            <div className="min-w-0 flex-1">
                <div className="rare-project-hero-context"><span>{project.category_name || "Project"}</span><ProjectStatus status={project.status} /></div>
                <h1>{project.name}</h1>
                <div className="rare-project-hero-meta"><span><MapPin size={14} aria-hidden="true" />{project.location || "Location not specified"}</span><span><UserRound size={14} aria-hidden="true" />{project.client_name || "Client not specified"}</span></div>
            </div>
        </div>
        {children && <div className="rare-project-hero-actions">{children}</div>}
    </header>;
}

export function ProjectMobileActions({ children }) {
    const details = useRef(null);
    useEffect(() => {
        function escape(event) { if (event.key === "Escape" && details.current?.open) { details.current.open = false; details.current.querySelector("summary")?.focus(); } }
        function outside(event) { if (details.current?.open && !details.current.contains(event.target)) details.current.open = false; }
        document.addEventListener("keydown", escape);
        document.addEventListener("pointerdown", outside);
        return () => { document.removeEventListener("keydown", escape); document.removeEventListener("pointerdown", outside); };
    }, []);
    return <details ref={details} className="rare-project-mobile-actions">
        <summary aria-label="More project actions" title="More project actions"><MoreHorizontal size={20} aria-hidden="true" /><span className="sr-only">More project actions</span></summary>
        <div role="group" aria-label="Project actions" onClick={(event) => { if (event.target.closest("button")) { details.current.open = false; details.current.querySelector("summary")?.focus({ preventScroll: true }); } }}>{children}</div>
    </details>;
}

export function ProjectWorkspaceNavigation({ projectId, role = "ADMIN" }) {
    const prefix = role === "ADMIN" ? "/admin" : "/supervisor";
    const items = [["tasks", "Project Tasks", ClipboardList, "Your task register", "sky"], ["timeline", "Timeline", CalendarDays, "Sequence & schedule", "lavender"], ["daily-reports", "Daily Reports", ScrollText, "Site diary & evidence", "mint"], ["documents", "Documents", Files, "Drawings & versions", "lavender"], ["delays", "Delays", Timer, "Issues & extensions", "blush"]];
    return <InfoCard title="Project Workspace" eyebrow="Continue working" icon={FolderKanban} className="rare-project-workspace-card">
        <nav aria-label="Project workspace" className="rare-project-workspace-nav">{items.map(([path, label, Icon, hint, tone]) => <Link key={path} to={`${prefix}/projects/${projectId}/${path}`}>
            <span className={`rare-project-workspace-icon rare-project-tone-${tone}`}><Icon size={18} strokeWidth={1.7} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><strong>{label}</strong><span className="rare-project-workspace-hint">{hint}</span></span><ArrowUpRight size={15} aria-hidden="true" />
        </Link>)}</nav>
    </InfoCard>;
}

export function ProjectDescription({ description }) {
    const [expanded, setExpanded] = useState(false);
    const [canExpand, setCanExpand] = useState(false);
    const bodyRef = useRef(null);
    useEffect(() => {
        const body = bodyRef.current;
        if (!body || expanded) return;
        const measure = () => setCanExpand(body.scrollHeight > body.clientHeight + 1);
        measure();
        if (typeof ResizeObserver !== "undefined") {
            const observer = new ResizeObserver(measure);
            observer.observe(body);
            return () => observer.disconnect();
        }
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [description, expanded]);
    return <InfoCard title="Project Description" eyebrow="The brief" className="rare-project-description-card">
        <p ref={bodyRef} className={`whitespace-pre-wrap text-sm leading-7 text-muted ${expanded ? "" : "line-clamp-3"}`}>{description || "No project description has been added."}</p>
        {description && (canExpand || expanded) && <button type="button" className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-info" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Show less" : "Read more"}<ChevronDown size={14} className={expanded ? "rotate-180" : ""} aria-hidden="true" /></button>}
    </InfoCard>;
}
