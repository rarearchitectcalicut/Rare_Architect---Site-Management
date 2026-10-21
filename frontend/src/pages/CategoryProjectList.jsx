
import { useEffect, useState } from "react";
import {
    Link,
    useParams,
} from "react-router-dom";

import {
    ArrowLeft,
    ArrowRight,
    FolderOpen,
    ImageOff,
    Plus,
    RefreshCw,
    Search,
    SlidersHorizontal,
} from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { projectApi } from "../api/projectApi";
import { getMediaUrl } from "../utils/mediaUrl";

import LoadingScreen from "../components/LoadingScreen";
import HorizontalProjectCard from "../components/projects/HorizontalProjectCard";

// =====================================================
// CATEGORY PROJECT LIST PAGE
// =====================================================

export default function CategoryProjectList() {
    const { categoryId } = useParams();
    const { user } = useAuth();

    const [category, setCategory] = useState(null);
    const [projects, setProjects] = useState([]);

    const [totalCount, setTotalCount] = useState(null);
    const [hasNext, setHasNext] = useState(false);
    const [hasPrevious, setHasPrevious] = useState(false);

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [ordering, setOrdering] = useState("-created_at");
    const [page, setPage] = useState(1);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [retryKey, setRetryKey] = useState(0);
    const [imageFailed, setImageFailed] = useState(false);

    const isAdmin = user?.role === "ADMIN";

    // ---------------------------------------------
    // DEBOUNCE PROJECT SEARCH
    // ---------------------------------------------

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 400);

        return () => clearTimeout(timer);
    }, [searchInput]);

    // ---------------------------------------------
    // LOAD CATEGORY AND PROJECTS
    // ---------------------------------------------

    useEffect(() => {
        let cancelled = false;

        async function fetchProjects() {
            setLoading(true);
            setError("");

            try {
                const [categoryData, projectData] =
                    await Promise.all([
                        projectApi.getCategory(categoryId),
                        projectApi.getProjects({
                            category: categoryId,
                            page,
                            ordering,
                            ...(search ? { search } : {}),
                            ...(statusFilter
                                ? { status: statusFilter }
                                : {}),
                        }),
                    ]);

                if (cancelled) return;

                const isArray = Array.isArray(projectData);

                const items = isArray
                    ? projectData
                    : projectData?.results;

                if (!Array.isArray(items)) {
                    throw new Error(
                        "Unexpected projects API response."
                    );
                }

                // Defensive check: never display another
                // category's projects if backend filtering
                // is misconfigured.
                const scopedItems = items.filter(
                    (project) =>
                        String(project.category) ===
                        String(categoryId)
                );

                setCategory(categoryData);
                setProjects(scopedItems);

                setTotalCount(
                    isArray
                        ? scopedItems.length
                        : typeof projectData.count === "number"
                            ? projectData.count
                            : null
                );

                setHasNext(
                    !isArray && Boolean(projectData.next)
                );

                setHasPrevious(
                    !isArray && Boolean(projectData.previous)
                );

                setImageFailed(false);
            } catch (err) {
                if (cancelled) return;

                setProjects([]);
                setTotalCount(null);

                if (err.response?.status === 404) {
                    setError(
                        "This category could not be found."
                    );
                } else if (err.response?.status === 403) {
                    setError(
                        "You do not have permission to view these projects."
                    );
                } else if (!err.response) {
                    setError(
                        "Unable to connect to RARE. Check your connection."
                    );
                } else {
                    setError(
                        "Unable to load category projects. Please try again."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        fetchProjects();

        return () => {
            cancelled = true;
        };
    }, [
        categoryId,
        page,
        ordering,
        search,
        statusFilter,
        retryKey,
    ]);

    // ---------------------------------------------
    // FILTER HANDLERS
    // ---------------------------------------------

    const handleStatusChange = (event) => {
        setStatusFilter(event.target.value);
        setPage(1);
    };

    const handleOrderingChange = (event) => {
        setOrdering(event.target.value);
        setPage(1);
    };

    const categoryImageUrl = getMediaUrl(category?.image);

    // ---------------------------------------------
    // RENDER
    // ---------------------------------------------

    return (
        <div className="space-y-7">

            {/* GLOBAL RARE LOADER */}
            {loading && (
                <LoadingScreen message="Loading projects..." />
            )}

            {/* BREADCRUMB */}
            <nav
                aria-label="Breadcrumb"
                className="flex flex-wrap items-center gap-2 text-xs text-[#8A8175]"
            >
                <Link
                    to="/admin/dashboard"
                    className="hover:text-[#211E1A]"
                >
                    Dashboard
                </Link>

                <span>/</span>

                <span>Project Categories</span>

                <span>/</span>

                <span className="font-semibold text-[#211E1A]">
                    {category?.name || "Projects"}
                </span>
            </nav>

            {/* ERROR */}
            {error ? (
                <div className="rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] px-6 py-14 text-center">
                    <p role="alert" className="text-sm text-[#A44837]">
                        {error}
                    </p>

                    <button
                        type="button"
                        onClick={() =>
                            setRetryKey((previous) => previous + 1)
                        }
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white"
                    >
                        <RefreshCw size={17} />
                        Try Again
                    </button>
                </div>
            ) : (
                <>
                    {/* =====================================
              CATEGORY HEADER
              ===================================== */}

                    <section
                        className="
              overflow-hidden rounded-[26px]
              border border-[#E7DED2]
              bg-[#FFFDFA]
            "
                    >
                        <div className="flex min-h-46.25 items-stretch sm:min-h-55">
                            <div className="min-w-0 flex-1 p-5 sm:p-8">
                                <Link
                                    to="/admin/dashboard"
                                    className="inline-flex items-center gap-2 text-xs font-medium text-[#817669] hover:text-[#211E1A]"
                                >
                                    <ArrowLeft size={15} />
                                    Back to Dashboard
                                </Link>

                                <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-[#918576]">
                                    RARE Project Categories
                                </p>

                                <h2
                                    className="
                    mt-2 wrap-break-word text-2xl
                    font-bold tracking-tight
                    text-[#211E1A]
                    sm:text-3xl
                  "
                                >
                                    {category?.name || "Projects"}
                                </h2>

                                <p className="mt-3 max-w-xl text-xs leading-6 text-[#817669] sm:text-sm">
                                    {category?.description ||
                                        "Explore and manage projects in this category."}
                                </p>
                            </div>

                            <div className="relative hidden w-[32%] bg-[#E8DFD3] sm:block">
                                {categoryImageUrl && !imageFailed ? (
                                    <img
                                        src={categoryImageUrl}
                                        alt={`${category.name} category`}
                                        onError={() => setImageFailed(true)}
                                        className="absolute inset-0 h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center">
                                        <ImageOff
                                            size={32}
                                            className="text-[#918576]"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* =====================================
              LIST HEADING
              ===================================== */}

                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-bold text-[#211E1A] sm:text-2xl">
                                Projects
                            </h2>

                            <p className="mt-1 text-sm text-[#817669]">
                                {totalCount === null
                                    ? "Browse matching projects"
                                    : `${totalCount} matching ${totalCount === 1
                                        ? "project"
                                        : "projects"
                                    }`}
                            </p>
                        </div>

                        {isAdmin && (
                            <Link
                                to="/admin/projects/new"
                                className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-4 py-3 text-xs font-semibold text-white transition-colors hover:bg-[#38332C] sm:text-sm"
                            >
                                <Plus size={17} />
                                Add Project
                            </Link>
                        )}
                    </div>

                    {/* =====================================
              FILTER BAR
              ===================================== */}

                    <section
                        aria-label="Project filters"
                        className="
              rounded-[22px]
              border border-[#E7DED2]
              bg-[#FFFDFA]
              p-4 sm:p-5
            "
                    >
                        <div className="flex items-center gap-2 pb-4">
                            <SlidersHorizontal
                                size={18}
                                className="text-[#211E1A]"
                            />

                            <h3 className="text-sm font-bold text-[#211E1A]">
                                Search & Filter
                            </h3>
                        </div>

                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_190px]">

                            {/* SEARCH */}
                            <div className="relative">
                                <Search
                                    size={18}
                                    className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[#928577]"
                                />

                                <input
                                    type="search"
                                    value={searchInput}
                                    onChange={(event) =>
                                        setSearchInput(event.target.value)
                                    }
                                    placeholder="Search project, client, location..."
                                    aria-label="Search projects"
                                    className="
                    h-12 w-full rounded-xl
                    border border-[#E4DCCD]
                    bg-[#FFFDFA]
                    pr-4 pl-11
                    text-sm text-[#211E1A]
                    outline-none
                    placeholder:text-[#AAA196]
                    focus:border-[#211E1A]
                    focus:ring-2 focus:ring-[#211E1A]/10
                  "
                                />
                            </div>

                            {/* STATUS */}
                            <select
                                value={statusFilter}
                                onChange={handleStatusChange}
                                aria-label="Filter by project status"
                                className="
                  h-12 w-full rounded-xl
                  border border-[#E4DCCD]
                  bg-[#FFFDFA] px-3
                  text-sm text-[#211E1A]
                  outline-none
                  focus:border-[#211E1A]
                "
                            >
                                <option value="">All Statuses</option>
                                <option value="ACTIVE">Active</option>
                                <option value="MAINTENANCE">
                                    Maintenance
                                </option>
                                    <option value="COMPLETED">
                                        Completed
                                    </option>
                                    <option value="CANCELLED">
                                        Cancelled
                                    </option>
                            </select>

                            {/* SORT */}
                            <select
                                value={ordering}
                                onChange={handleOrderingChange}
                                aria-label="Sort projects"
                                className="
                  h-12 w-full rounded-xl
                  border border-[#E4DCCD]
                  bg-[#FFFDFA] px-3
                  text-sm text-[#211E1A]
                  outline-none
                  focus:border-[#211E1A]
                "
                            >
                                <option value="-created_at">
                                    Newest First
                                </option>
                                <option value="created_at">
                                    Oldest First
                                </option>
                                <option value="name">
                                    Name A–Z
                                </option>
                                <option value="-name">
                                    Name Z–A
                                </option>
                                <option value="start_date">
                                    Start Date
                                </option>
                                <option value="end_date">
                                    End Date
                                </option>
                            </select>
                        </div>
                    </section>

                    {/* =====================================
              HORIZONTAL PROJECT LIST
              ===================================== */}

                    {!loading && (
                        <>
                            {projects.length === 0 ? (
                                <section className="rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] px-6 py-14 text-center">
                                    <FolderOpen
                                        size={37}
                                        strokeWidth={1.5}
                                        className="mx-auto text-[#918576]"
                                    />

                                    <h3 className="mt-4 text-lg font-bold text-[#211E1A]">
                                        No projects found
                                    </h3>

                                    <p className="mx-auto mt-2 max-w-md text-sm text-[#817669]">
                                        No projects match the selected category and filters.
                                    </p>
                                </section>
                            ) : (
                                <div className="space-y-5">
                                    {projects.map((project) => (
                                        <HorizontalProjectCard
                                            key={project.id}
                                            project={project}
                                            categoryName={category?.name}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* =================================
                  PAGINATION
                  ================================= */}

                            {(hasNext || hasPrevious) && (
                                <div className="flex items-center justify-between gap-3 rounded-[20px] border border-[#E7DED2] bg-[#FFFDFA] px-4 py-3">
                                    <button
                                        type="button"
                                        disabled={!hasPrevious}
                                        onClick={() => {
                                            setPage((previous) =>
                                                Math.max(1, previous - 1)
                                            );
                                            window.scrollTo({
                                                top: 0,
                                                behavior: "smooth",
                                            });
                                        }}
                                        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[#211E1A] disabled:opacity-35"
                                    >
                                        <ArrowLeft size={17} />
                                        Previous
                                    </button>

                                    <span className="text-xs font-semibold text-[#817669]">
                                        Page {page}
                                    </span>

                                    <button
                                        type="button"
                                        disabled={!hasNext}
                                        onClick={() => {
                                            setPage((previous) => previous + 1);
                                            window.scrollTo({
                                                top: 0,
                                                behavior: "smooth",
                                            });
                                        }}
                                        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[#211E1A] disabled:opacity-35"
                                    >
                                        Next
                                        <ArrowRight size={17} />
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}
