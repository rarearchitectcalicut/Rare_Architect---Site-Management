
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    ArrowLeft,
    CalendarDays,
    ClipboardList,
    Clock3,
    FileText,
    FolderKanban,
    RefreshCw,
    ScrollText,
    Search,
} from "lucide-react";

import { api } from "../../api/client";
import { projectApi } from "../../api/projectApi";
import LoadingScreen from "../../components/LoadingScreen";

const sections = {
    tasks: {
        title: "Project Tasks",
        icon: ClipboardList,
        description: "Tasks and progress for this project",
        endpoint: (id) => `projects/${id}/tasks/`,
    },
    timeline: {
        title: "Project Timeline",
        icon: CalendarDays,
        description: "Scheduled project work and task order",
        endpoint: (id) => `projects/${id}/timeline/`,
    },
    "daily-reports": {
        title: "Daily Reports",
        icon: ScrollText,
        description: "Daily site progress and submitted reports",
        endpoint: (id) => `projects/${id}/daily-reports/`,
    },
    delays: {
        title: "Delay Reports",
        icon: Clock3,
        description: "Reported delays and extension requests",
        endpoint: () => "delay-reports/",
    },
    documents: {
        title: "Project Documents",
        icon: FileText,
        description: "Authorized drawings, files and project records",
        endpoint: (id) => `projects/${id}/documents/`,
    },
};

function unwrapItems(data, section) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;

    // Timeline implementations may return tasks
    // inside an explicit object rather than a list.
    if (section === "timeline") {
        if (Array.isArray(data?.tasks)) return data.tasks;
        if (Array.isArray(data?.items)) return data.items;
    }

    throw new Error("Unexpected response format.");
}

async function fetchSectionItems(section, projectId) {
    const config = sections[section];
    const results = [];
    let page = 1;
    let next = true;

    while (next) {
        if (page > 500) {
            throw new Error("Pagination limit reached.");
        }

        const { data } = await api.get(
            config.endpoint(projectId),
            {
                params:
                    section === "delays"
                        ? { project: projectId, page }
                        : { page },
            }
        );

        results.push(...unwrapItems(data, section));

        next = !Array.isArray(data) && Boolean(data.next);
        page += 1;
    }

    if (section === "delays") {
        // Only display records explicitly associated with
        // this project. Records without a project identifier
        // are not safe to assign to a project in the UI.
        return results.filter((item) => {
            const id =
                item.project_id ??
                item.project?.id ??
                (
                    typeof item.project === "string"
                        ? item.project
                        : null
                );

            return String(id) === String(projectId);
        });
    }

    return results;
}

function itemTitle(item, section) {
    if (section === "documents") {
        return item.title || item.name || item.file_name || "Document";
    }

    if (section === "daily-reports") {
        return (
            item.title ||
            (item.report_date
                ? `Site Report — ${item.report_date}`
                : null) ||
            (item.date
                ? `Site Report — ${item.date}`
                : null) ||
            "Daily Site Report"
        );
    }

    if (section === "delays") {
        return (
            item.title ||
            item.reason ||
            item.task_name ||
            "Delay Report"
        );
    }

    return item.title || item.name || "Task";
}

function itemSubtitle(item, section) {
    return [
        item.status,
        item.approval_status,
        section === "tasks" || section === "timeline"
            ? item.due_date
            : section === "daily-reports"
                ? item.report_date || item.date
                : item.created_at
                    ? String(item.created_at).slice(0, 10)
                    : null,
    ].filter(Boolean).join(" • ");
}

export default function SupervisorProjectWorkspace() {
    const { projectId, section } = useParams();

    const config = sections[section];

    const [project, setProject] = useState(null);
    const [items, setItems] = useState([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (!config) return;

        let cancelled = false;

        async function load() {
            setLoading(true);
            setError("");
            setItems([]);

            try {
                const projectData =
                    await projectApi.getProjectOverview(projectId);

                if (cancelled) return;

                setProject(projectData);

                const data = await fetchSectionItems(
                    section,
                    projectId
                );

                if (!cancelled) setItems(data);
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err.response?.status === 403 ||
                            err.response?.status === 404
                            ? "This section is unavailable or you do not have access."
                            : "Unable to load this project section. Please try again."
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
    }, [projectId, section, refreshKey]);

    const visibleItems = useMemo(() => {
        const query = search.trim().toLowerCase();

        return items.filter((item) =>
            [
                itemTitle(item, section),
                itemSubtitle(item, section),
                item.description,
            ].filter(Boolean).join(" ").toLowerCase().includes(query)
        );
    }, [items, search, section]);

    if (!config) {
        return (
            <div className="rounded-2xl bg-[#FFFDFA] p-8">
                <p className="text-sm text-[#817669]">
                    Unknown project section.
                </p>

                <Link
                    to={`/supervisor/projects/${projectId}`}
                    className="mt-4 inline-block font-semibold text-[#211E1A] underline"
                >
                    Back to Project Overview
                </Link>
            </div>
        );
    }

    const Icon = config.icon;

    return (
        <div className="space-y-6 pb-8">
            {loading && (
                <LoadingScreen message={`Loading ${config.title.toLowerCase()}...`} />
            )}

            <Link
                to={`/supervisor/projects/${projectId}`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#817669] transition-colors hover:text-[#211E1A]"
            >
                <ArrowLeft size={17} />
                Back to Project Overview
            </Link>

            <section className="rounded-[24px] border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7">
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#948778]">
                    Supervisor / {project?.name || "Project Workspace"}
                </p>

                <div className="mt-3 flex flex-wrap items-start gap-4">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#74614D]">
                        <Icon size={26} strokeWidth={1.7} />
                    </span>

                    <div className="min-w-0 flex-1">
                        <h1 className="text-2xl font-bold text-[#211E1A] sm:text-3xl">
                            {config.title}
                        </h1>

                        <p className="mt-2 text-sm text-[#817669]">
                            {config.description}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setRefreshKey((n) => n + 1)}
                        aria-label="Refresh section"
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E4DCCD] text-[#211E1A] hover:bg-[#F1EADF]"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </section>

            {!loading && error && (
                <section
                    role="alert"
                    className="rounded-2xl border border-red-200 bg-[#FFFDFA] p-6"
                >
                    <p className="text-sm text-red-700">{error}</p>
                    <button
                        type="button"
                        onClick={() => setRefreshKey((n) => n + 1)}
                        className="mt-4 rounded-xl bg-[#211E1A] px-4 py-2.5 text-sm font-semibold text-white"
                    >
                        Retry
                    </button>
                </section>
            )}

            {!loading && !error && (
                <>
                    <section className="rounded-[20px] border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5">
                        <div className="relative">
                            <Search
                                size={18}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#948778]"
                            />

                            <input
                                type="search"
                                aria-label={`Search ${config.title}`}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={`Search ${config.title.toLowerCase()}...`}
                                className="h-12 w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] pl-11 pr-4 text-sm outline-none focus:border-[#211E1A]"
                            />
                        </div>
                    </section>

                    <p className="text-xs text-[#817669]">
                        {visibleItems.length}{" "}
                        {visibleItems.length === 1 ? "record" : "records"}
                    </p>

                    {visibleItems.length ? (
                        <div className="grid gap-3">
                            {visibleItems.map((item, index) => (
                                <article
                                    key={item.id || index}
                                    className="group flex items-center gap-4 rounded-[19px] border border-[#E7DED2] bg-[#FFFDFA] p-5 transition-all duration-200 hover:border-[#CBBBA8] hover:shadow-[0_8px_24px_rgba(33,30,26,0.05)]"
                                >
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F1EADF] text-[#74614D]">
                                        <Icon size={20} />
                                    </span>

                                    <div className="min-w-0 flex-1">
                                        <p className="break-words text-sm font-bold text-[#211E1A]">
                                            {itemTitle(item, section)}
                                        </p>

                                        <p className="mt-1 break-words text-xs text-[#817669]">
                                            {itemSubtitle(item, section) || "Project record"}
                                        </p>
                                    </div>

                                    {/* Detail screens will be added with
                      the task/report/document modules. */}
                                </article>
                            ))}
                        </div>
                    ) : (
                        <section className="rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] px-5 py-12 text-center">
                            <FolderKanban
                                size={32}
                                className="mx-auto text-[#948778]"
                            />

                            <h2 className="mt-4 text-base font-bold text-[#211E1A]">
                                No records found
                            </h2>

                            <p className="mt-2 text-sm text-[#817669]">
                                {search
                                    ? "Try a different search term."
                                    : `There are no ${config.title.toLowerCase()} to display yet.`}
                            </p>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
