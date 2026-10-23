
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    ArrowUpRight,
    Building2,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    FolderKanban,
    MapPin,
    RefreshCw,
    Search,
    SlidersHorizontal,
    X,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { getMediaUrl } from "../../utils/mediaUrl";
import LoadingScreen from "../../components/LoadingScreen";

const PAGE_SIZE = 8;

const selectClass = `
  h-12 w-full rounded-xl border border-[#E4DCCD]
  bg-[#FFFDFA] px-3 text-sm text-[#211E1A]
  outline-none transition-all duration-200
  focus:border-[#B9A48C]
  focus:ring-4 focus:ring-[#E8DDD0]/50
`;

function getItems(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.results)) {
        return response.results;
    }
    throw new Error("Unexpected projects response.");
}

async function getAssignedProjects() {
    const projects = [];
    const seen = new Set();

    let page = 1;
    let hasMore = true;

    while (hasMore) {
        if (seen.has(page) || page > 500) {
            throw new Error("Unable to finish loading projects.");
        }

        seen.add(page);

        const response = await projectApi.getProjects({
            page,
        });

        projects.push(...getItems(response));

        hasMore =
            !Array.isArray(response) && Boolean(response.next);

        page += 1;
    }

    return projects;
}

function formatDate(value) {
    if (!value) return "Not specified";

    const date = new Date(`${value.slice(0, 10)}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function labelStatus(value) {
    return String(value || "UNKNOWN")
        .replaceAll("_", " ");
}

function statusColor(status) {
    const value = String(status || "").toUpperCase();

    if (value === "ACTIVE") {
        return "bg-[#E7F2E8] text-[#296F40]";
    }

    if (value === "COMPLETED") {
        return "bg-[#E8F0FC] text-[#3565A5]";
    }

    if (value === "MAINTENANCE") {
        return "bg-[#FFF2D8] text-[#94651D]";
    }

    if (value === "ON_HOLD") {
        return "bg-[#FFF2D8] text-[#94651D]";
    }

    if (value === "CANCELLED") {
        return "bg-[#FCE9E6] text-[#B5473E]";
    }

    return "bg-[#EFEAE3] text-[#74695D]";
}

// =====================================================
// SUMMARY CARD
// =====================================================

function SummaryCard({
    label,
    value,
    icon: Icon,
    tone,
}) {
    return (
        <div className="group rounded-[20px] border border-[#E7DED2] bg-[#FFFDFA] p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(33,30,26,0.06)] motion-reduce:transform-none sm:p-5">
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-[#817669]">
                    {label}
                </p>

                <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:rotate-[-5deg] group-hover:scale-105 ${tone}`}
                >
                    <Icon size={21} strokeWidth={1.8} />
                </span>
            </div>

            <p className="mt-3 text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                {value}
            </p>
        </div>
    );
}

// =====================================================
// ASSIGNED PROJECT CARD
// =====================================================

function AssignedProjectCard({ project }) {
    const [imageError, setImageError] = useState(false);

    const imageUrl = getMediaUrl(project.cover_image);

    return (
        <article className="group overflow-hidden rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C9B9A6] hover:shadow-[0_14px_32px_rgba(33,30,26,0.08)] motion-reduce:transform-none">
            <div className="flex min-h-56.25 flex-col sm:min-h-60 sm:flex-row">
                {/* PROJECT IMAGE */}
                <div className="relative h-48 shrink-0 overflow-hidden bg-[#E9DFD1] sm:h-auto sm:w-[39%]">
                    {imageUrl && !imageError ? (
                        <img
                            src={imageUrl}
                            alt={`${project.name} project`}
                            loading="lazy"
                            onError={() => setImageError(true)}
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-[#D8C7B1] to-[#F1EADF]">
                            <Building2
                                size={43}
                                strokeWidth={1.3}
                                className="text-[#8F806E]"
                            />
                        </div>
                    )}

                    <div className="absolute bottom-3 left-3 rounded-xl bg-[#FFFDFA]/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.09em] text-[#665E53] shadow-sm">
                        {project.category_name || "Project"}
                    </div>
                </div>

                {/* PROJECT INFORMATION */}
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 p-5 sm:p-6">
                    <div>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#948778]">
                                Assigned Project
                            </p>

                            <span
                                className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase ${statusColor(project.status)}`}
                            >
                                {labelStatus(project.status)}
                            </span>
                        </div>

                        <h3 className="mt-3 wrap-break-word text-xl font-bold tracking-tight text-[#211E1A]">
                            {project.name}
                        </h3>

                        <p className="mt-3 flex items-start gap-2 text-sm text-[#817669]">
                            <MapPin size={17} className="mt-0.5 shrink-0" />
                            {project.location || "Location not provided"}
                        </p>

                        <p className="mt-2 flex items-start gap-2 text-sm text-[#817669]">
                            <Building2 size={17} className="mt-0.5 shrink-0" />
                            {project.client_name || "Client not provided"}
                        </p>
                    </div>

                    <div className="grid gap-3 border-t border-[#EEE6DC] pt-4 sm:grid-cols-2">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#938778]">
                                Start Date
                            </p>
                            <p className="mt-1 text-xs font-semibold text-[#211E1A]">
                                {formatDate(project.start_date)}
                            </p>
                        </div>

                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#938778]">
                                End Date
                            </p>
                            <p className="mt-1 text-xs font-semibold text-[#211E1A]">
                                {formatDate(project.end_date)}
                            </p>
                        </div>
                    </div>

                    <Link
                        to={`/supervisor/projects/${project.id}`}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#211E1A] px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#39332B] hover:shadow-[0_8px_20px_rgba(33,30,26,0.14)] sm:w-auto sm:self-end"
                    >
                        View Details
                        <ArrowUpRight
                            size={18}
                            className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        />
                    </Link>
                </div>
            </div>
        </article>
    );
}

// =====================================================
// SUPERVISOR PROJECTS PAGE
// =====================================================

export default function SupervisorProjects() {
    const [projects, setProjects] = useState([]);

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [category, setCategory] = useState("");
    const [sort, setSort] = useState("newest");
    const [page, setPage] = useState(1);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    // ---------------------------------------------
    // FETCH ONLY ASSIGNED PROJECTS
    // ---------------------------------------------

    useEffect(() => {
        let cancelled = false;

        async function loadProjects() {
            setLoading(true);
            setError("");

            try {
                const response = await getAssignedProjects();

                if (!cancelled) {
                    setProjects(response);
                }
            } catch (err) {
                if (!cancelled) {
                    setProjects([]);

                    setError(
                        err.response?.status === 403
                            ? "You do not have permission to view these projects."
                            : "Unable to load your assigned projects. Please try again."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadProjects();

        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    // ---------------------------------------------
    // AVAILABLE FILTER OPTIONS
    // ---------------------------------------------

    const categories = useMemo(() => {
        const map = new Map();

        projects.forEach((project) => {
            if (!project.category) return;

            const id =
                typeof project.category === "object"
                    ? project.category.id
                    : project.category;

            const name =
                project.category_name ||
                (typeof project.category === "object"
                    ? project.category.name
                    : "") ||
                "Unnamed Category";

            map.set(String(id), name);
        });

        return [...map.entries()]
            .sort((a, b) => a[1].localeCompare(b[1]));
    }, [projects]);

    const statuses = useMemo(
        () =>
            [...new Set(
                projects
                    .map((item) => item.status)
                    .filter(Boolean)
            )].sort(),
        [projects]
    );

    // ---------------------------------------------
    // SEARCH, FILTER AND SORT
    // ---------------------------------------------

    const filteredProjects = useMemo(() => {
        const query = search.trim().toLowerCase();

        const result = projects.filter((project) => {
            const searchable = [
                project.name,
                project.category_name,
                project.client_name,
                project.location,
                project.status,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const categoryId = String(
                typeof project.category === "object"
                    ? project.category?.id || ""
                    : project.category || ""
            );

            return (
                searchable.includes(query) &&
                (!status || project.status === status) &&
                (!category || categoryId === category)
            );
        });

        result.sort((a, b) => {
            if (sort === "name") {
                return (a.name || "").localeCompare(b.name || "");
            }

            if (sort === "name-desc") {
                return (b.name || "").localeCompare(a.name || "");
            }

            if (sort === "oldest") {
                return String(a.created_at || "")
                    .localeCompare(String(b.created_at || ""));
            }

            if (sort === "end-date") {
                return String(a.end_date || "9999-12-31")
                    .localeCompare(String(b.end_date || "9999-12-31"));
            }

            if (sort === "start-date") {
                return String(a.start_date || "9999-12-31")
                    .localeCompare(String(b.start_date || "9999-12-31"));
            }

            return String(b.created_at || "")
                .localeCompare(String(a.created_at || ""));
        });

        return result;
    }, [projects, search, status, category, sort]);

    // ---------------------------------------------
    // CLIENT-SIDE PAGINATION
    // ---------------------------------------------

    const pageCount = Math.max(
        1,
        Math.ceil(filteredProjects.length / PAGE_SIZE)
    );

    const safePage = Math.min(page, pageCount);

    const visibleProjects = filteredProjects.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE
    );

    const updateFilter = (setter, value) => {
        setter(value);
        setPage(1);
    };

    const resetFilters = () => {
        setSearch("");
        setStatus("");
        setCategory("");
        setSort("newest");
        setPage(1);
    };

    const hasFilters =
        Boolean(search || status || category) ||
        sort !== "newest";

    const activeCount = projects.filter(
        (project) => project.status === "ACTIVE"
    ).length;

    return (
        <div className="space-y-6 pb-8">
            {/* RARE LOADING SCREEN */}
            {loading && (
                <LoadingScreen message="Loading your assigned projects..." />
            )}

            {/* PAGE HEADER */}
            <header>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#948778]">
                    Supervisor / Project Management
                </p>

                <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                    My Projects
                </h1>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#817669]">
                    View the projects assigned to you, check their details,
                    and access your project workspace.
                </p>
            </header>

            {/* SUMMARY */}
            <div className="grid grid-cols-3 gap-3">
                <SummaryCard
                    label="Assigned"
                    value={error ? "—" : projects.length}
                    icon={FolderKanban}
                    tone="bg-[#F1EADF] text-[#74614D]"
                />

                <SummaryCard
                    label="Active"
                    value={error ? "—" : activeCount}
                    icon={Building2}
                    tone="bg-[#E7F2E8] text-[#368250]"
                />

                <SummaryCard
                    label="Matching"
                    value={error ? "—" : filteredProjects.length}
                    icon={SlidersHorizontal}
                    tone="bg-[#E9F0FC] text-[#3565A5]"
                />
            </div>

            {/* SEARCH AND FILTER */}
            <section className="rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2">
                    <SlidersHorizontal
                        size={18}
                        className="text-[#817669]"
                    />

                    <h2 className="text-sm font-bold text-[#211E1A]">
                        Search & Filter
                    </h2>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_175px_175px_180px]">
                    <div className="relative">
                        <Search
                            size={18}
                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#938778]"
                        />

                        <input
                            type="search"
                            value={search}
                            onChange={(event) =>
                                updateFilter(setSearch, event.target.value)
                            }
                            placeholder="Search project, client, location..."
                            aria-label="Search assigned projects"
                            className={`${selectClass} pl-11 pr-4`}
                        />
                    </div>

                    <select
                        value={category}
                        onChange={(event) =>
                            updateFilter(setCategory, event.target.value)
                        }
                        aria-label="Filter by category"
                        className={selectClass}
                    >
                        <option value="">All Categories</option>

                        {categories.map(([id, name]) => (
                            <option key={id} value={id}>
                                {name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={status}
                        onChange={(event) =>
                            updateFilter(setStatus, event.target.value)
                        }
                        aria-label="Filter by status"
                        className={selectClass}
                    >
                        <option value="">All Statuses</option>

                        {statuses.map((value) => (
                            <option key={value} value={value}>
                                {labelStatus(value)}
                            </option>
                        ))}
                    </select>

                    <select
                        value={sort}
                        onChange={(event) =>
                            updateFilter(setSort, event.target.value)
                        }
                        aria-label="Sort assigned projects"
                        className={selectClass}
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="name">Name A–Z</option>
                        <option value="name-desc">Name Z–A</option>
                        <option value="start-date">Start Date</option>
                        <option value="end-date">End Date</option>
                    </select>
                </div>

                {hasFilters && (
                    <div className="mt-4 flex justify-end">
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="inline-flex items-center gap-2 text-xs font-semibold text-[#817669] transition-colors hover:text-[#211E1A]"
                        >
                            <X size={15} />
                            Clear Filters
                        </button>
                    </div>
                )}
            </section>

            {/* LIST HEADING */}
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-[#211E1A]">
                        Assigned Project Directory
                    </h2>

                    <p className="mt-1 text-xs text-[#817669]">
                        {filteredProjects.length} matching{" "}
                        {filteredProjects.length === 1
                            ? "project"
                            : "projects"}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setRefreshKey((value) => value + 1)}
                    aria-label="Refresh assigned projects"
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] text-[#211E1A] transition-colors hover:bg-[#F1EADF]"
                >
                    <RefreshCw size={18} />
                </button>
            </div>

            {/* ERROR */}
            {!loading && error && (
                <div className="rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] p-8 text-center">
                    <p role="alert" className="text-sm text-[#B5473E]">
                        {error}
                    </p>

                    <button
                        type="button"
                        onClick={() => setRefreshKey((value) => value + 1)}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-4 py-3 text-sm font-semibold text-white"
                    >
                        <RefreshCw size={17} />
                        Try Again
                    </button>
                </div>
            )}

            {/* PROJECT CARDS */}
            {!loading && !error && (
                <>
                    {visibleProjects.length > 0 ? (
                        <div className="space-y-5">
                            {visibleProjects.map((project) => (
                                <AssignedProjectCard
                                    key={project.id}
                                    project={project}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] px-5 py-14 text-center">
                            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#8B7C68]">
                                <FolderKanban size={29} />
                            </span>

                            <h3 className="mt-5 text-lg font-bold text-[#211E1A]">
                                {hasFilters
                                    ? "No matching projects"
                                    : "No assigned projects yet"}
                            </h3>

                            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#817669]">
                                {hasFilters
                                    ? "Try adjusting your search or filters."
                                    : "Projects assigned to you by an Administrator will appear here."}
                            </p>

                            {hasFilters && (
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="mt-5 rounded-xl border border-[#E4DCCD] px-4 py-3 text-sm font-semibold text-[#211E1A] hover:bg-[#F1EADF]"
                                >
                                    Clear Filters
                                </button>
                            )}
                        </div>
                    )}

                    {/* PAGINATION */}
                    {pageCount > 1 && (
                        <nav
                            aria-label="Project pagination"
                            className="flex items-center justify-between gap-3 rounded-[20px] border border-[#E7DED2] bg-[#FFFDFA] px-4 py-3"
                        >
                            <button
                                type="button"
                                disabled={safePage === 1}
                                onClick={() =>
                                    setPage((value) => Math.max(1, value - 1))
                                }
                                className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#211E1A] hover:bg-[#F1EADF] disabled:opacity-35"
                            >
                                <ChevronLeft size={18} />
                                Previous
                            </button>

                            <span className="text-xs font-semibold text-[#817669]">
                                Page {safePage} of {pageCount}
                            </span>

                            <button
                                type="button"
                                disabled={safePage >= pageCount}
                                onClick={() => setPage((value) => value + 1)}
                                className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#211E1A] hover:bg-[#F1EADF] disabled:opacity-35"
                            >
                                Next
                                <ChevronRight size={18} />
                            </button>
                        </nav>
                    )}
                </>
            )}
        </div>
    );
}
