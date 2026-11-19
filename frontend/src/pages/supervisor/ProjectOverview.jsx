import { ProjectHero, ProjectWorkspaceNavigation, ProjectDescription } from "../../components/projects/ProjectDetailUI";
import ProjectInformationCard from "../../components/projects/ProjectInformationCard";

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    ArrowLeft,
    FolderKanban,
    Phone,
    RefreshCw,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { getMediaUrl } from "../../utils/mediaUrl";
import LoadingScreen from "../../components/LoadingScreen";

// =====================================================
// HELPERS
// =====================================================


function daysLeft(endDate) {
    if (!endDate) return "";
    const end = new Date(`${String(endDate).slice(0, 10)}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((end - today) / 86400000);
    if (diff < 0) return `${Math.abs(diff)} days ago`;
    if (diff === 0) return "Today";
    return `${diff} days left`;
}



function getSupervisorName(item) {
    return (
        item.supervisor_name ||
        item.name ||
        item.supervisor?.name ||
        [
            item.supervisor?.first_name,
            item.supervisor?.last_name,
        ].filter(Boolean).join(" ") ||
        "Site Supervisor"
    );
}

function getSupervisorPhone(item) {
    return (
        item.supervisor_phone ||
        item.phone ||
        item.supervisor?.phone ||
        ""
    );
}

// =====================================================
// WORKSPACE ITEMS
// =====================================================

export default function SupervisorProjectOverview() {
    const { projectId } = useParams();

    const [project, setProject] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setProject(null);
            setError("");

            try {
                const data = await projectApi.getProjectOverview(projectId);
                if (!cancelled) setProject(data);
            } catch (err) {
                if (!cancelled) {
                    const status = err.response?.status;
                    setError(
                        status === 403 || status === 404
                            ? "This project is unavailable or is no longer assigned to you."
                            : "Unable to load the project overview. Please try again."
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [projectId, refreshKey]);

    const coverUrl = project
        ? getMediaUrl(project.cover_image || project.category_image)
        : "";

    const supervisors = Array.isArray(project?.supervisors)
        ? project.supervisors
        : [];

    const endDateHint = project?.end_date ? daysLeft(project.end_date) : "";

    return (
        <div className="rare-project-detail">
            {loading && <LoadingScreen message="Loading project overview..." />}

            {/* BACK LINK */}
            <div className="rare-project-detail-breadcrumb">
                <Link
                    to="/supervisor/projects"
                    className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                    <ArrowLeft size={15} aria-hidden="true" />
                    My Projects
                </Link>
            </div>

            {/* ERROR STATE */}
            {!loading && error && (
                <div className="mx-auto mt-4 max-w-[1200px] px-4">
                    <section className="rounded-[18px] border border-border bg-surface p-6 text-center">
                        <FolderKanban size={38} className="mx-auto text-muted" />
                        <p role="alert" className="mt-4 text-sm text-muted">
                            {error}
                        </p>
                        <div className="mt-5 flex flex-wrap justify-center gap-3">
                            <Link
                                to="/supervisor/projects"
                                className="rounded-xl border border-border px-4 py-3 text-sm font-semibold text-ink"
                            >
                                Back to Projects
                            </Link>
                            <button
                                type="button"
                                onClick={() => setRefreshKey((n) => n + 1)}
                                className="inline-flex items-center gap-2 rounded-xl bg-action px-4 py-3 text-sm font-semibold text-white"
                            >
                                <RefreshCw size={17} />
                                Retry
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {!loading && project && (
                <>
                    <ProjectHero key={project.id} project={project} coverUrl={coverUrl}>
                      <button type="button" aria-label="Refresh project overview" title="Refresh project" onClick={() => setRefreshKey((n) => n + 1)} className="rare-project-icon-action"><RefreshCw size={18} aria-hidden="true" /></button>
                    </ProjectHero>
                    {/* CANCELLED NOTICE */}
                    {project.status === "CANCELLED" && (
                        <div className="px-4 pb-3">
                            <p
                                role="status"
                                className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted"
                            >
                                This project has been cancelled. Existing records remain available for reference.
                            </p>
                        </div>
                    )}


                    <div className="rare-project-detail-grid">
                      <div className="rare-project-detail-primary"><ProjectWorkspaceNavigation projectId={projectId} role="SUPERVISOR" /><ProjectDescription description={project.description} /></div>
                      <aside className="rare-project-detail-secondary" aria-label="Project facts and team"><ProjectInformationCard project={project} supervisorCount={supervisors.length} endDateHint={endDateHint} /><section
                                className="rounded-[24px] border border-border bg-surface p-4"
                                aria-labelledby="team-heading"
                            >
                                <h2
                                    id="team-heading"
                                    className="text-sm font-bold text-ink"
                                >
                                    Supervision Team
                                </h2>

                                {supervisors.length === 0 ? (
                                    <p className="mt-3 text-xs text-muted">
                                        No supervision team details are available.
                                    </p>
                                ) : (
                                    <ul className="mt-3 space-y-2">
                                        {supervisors.map((item, index) => {
                                            const name = getSupervisorName(item);
                                            const phone = getSupervisorPhone(item);

                                            return (
                                                <li
                                                    key={item.id || item.supervisor || index}
                                                    className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface p-3"
                                                >
                                                    {/* Avatar */}
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-lavender text-sm font-bold text-muted">
                                                        {name.charAt(0).toUpperCase()}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-bold text-ink [overflow-wrap:anywhere]">
                                                            {name}
                                                        </p>
                                                        <p className="mt-0.5 text-xs text-muted [overflow-wrap:anywhere]">
                                                            {phone || "Site Supervisor"}
                                                        </p>
                                                    </div>

                                                    {phone && (
                                                        <a
                                                            href={`tel:${phone}`}
                                                            aria-label={`Call ${name}`}
                                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pastel-mint text-success transition-colors hover:bg-pastel-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                                                        >
                                                            <Phone size={18} />
                                                        </a>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </section></aside>
                    </div>
                </>
            )}
        </div>
    );
}
