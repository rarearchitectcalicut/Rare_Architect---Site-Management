
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    FolderKanban,
    Layers3,
    Plus,
    RefreshCw,
    Search,
    SlidersHorizontal,
    X,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import AddProject from "../../modal/admin/AddProject";
import HorizontalProjectCard from "../../components/projects/HorizontalProjectCard";
import LoadingScreen from "../../components/LoadingScreen";

// =====================================================
// HELPERS
// =====================================================

function extractResults(response) {
    if (Array.isArray(response)) {
        return {
            items: response,
            count: response.length,
            next: null,
            previous: null,
        };
    }

    if (Array.isArray(response?.results)) {
        return {
            items: response.results,
            count: response.count ?? response.results.length,
            next: response.next,
            previous: response.previous,
        };
    }

    throw new Error("Unexpected API response.");
}

const selectStyle = `
  h-12 w-full rounded-xl
  border border-[#E4DCCD]
  bg-[#FFFDFA] px-3
  text-sm text-[#211E1A]
  outline-none
  transition-colors
  focus:border-[#211E1A]
  focus:ring-2 focus:ring-[#211E1A]/10
`;

// =====================================================
// SUMMARY CARD
// =====================================================

function SummaryCard({
    label,
    value,
    icon: Icon,
    tone = "sand",
}) {
    const tones = {
        sand: "bg-[#F1EADF] text-[#7B6850]",
        blue: "bg-[#E8F0FE] text-[#3565A5]",
        green: "bg-[#E6F4EA] text-[#2C8448]",
    };

    return (
        <div
            className="
        group rounded-[20px]
        border border-[#E7DED2]
        bg-[#FFFDFA] p-4
        transition-all duration-300
        hover:-translate-y-0.5
        hover:shadow-[0_10px_25px_rgba(33,30,26,0.06)]
        sm:p-5
      "
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#817669]">
                    {label}
                </span>

                <span
                    className={`
            flex h-10 w-10 items-center justify-center
            rounded-xl transition-transform duration-300
            group-hover:rotate-[-4deg]
            group-hover:scale-105
            ${tones[tone]}
          `}
                >
                    <Icon size={19} strokeWidth={1.8} />
                </span>
            </div>

            <p className="mt-3 text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                {value}
            </p>
        </div>
    );
}

// =====================================================
// ADMIN ALL PROJECTS
// =====================================================

export default function Projects() {
    const navigate = useNavigate();

    const [projects, setProjects] = useState([]);
    const [categories, setCategories] = useState([]);

    const [total, setTotal] = useState(0);
    const [nextPage, setNextPage] = useState(false);
    const [previousPage, setPreviousPage] = useState(false);

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [status, setStatus] = useState("");
    const [ordering, setOrdering] = useState("-created_at");
    const [page, setPage] = useState(1);

    const [loading, setLoading] = useState(true);
    const [loadingCategories, setLoadingCategories] =
        useState(true);

    const [error, setError] = useState("");
    const [categoryError, setCategoryError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    const [showAddProject, setShowAddProject] = useState(false);

    // ---------------------------------------------
    // SEARCH DEBOUNCE
    // ---------------------------------------------

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 400);

        return () => clearTimeout(timer);
    }, [searchInput]);

    // ---------------------------------------------
    // FETCH PROJECT CATEGORIES
    // ---------------------------------------------

    useEffect(() => {
        let cancelled = false;

        async function loadCategories() {
            setLoadingCategories(true);
            setCategoryError("");

            try {
                const response = await projectApi.getCategories();
                const result = extractResults(response);

                if (!cancelled) {
                    setCategories(result.items);
                }
            } catch {
                if (!cancelled) {
                    setCategoryError(
                        "Category options could not be loaded."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoadingCategories(false);
                }
            }
        }

        loadCategories();

        return () => {
            cancelled = true;
        };
    }, [refreshKey]);

    // ---------------------------------------------
    // FETCH ALL PROJECTS (SERVER PAGINATION)
    // ---------------------------------------------

    useEffect(() => {
        let cancelled = false;

        async function loadProjects() {
            setLoading(true);
            setError("");

            try {
                const params = {
                    page,
                    ordering,
                    ...(search ? { search } : {}),
                    ...(category ? { category } : {}),
                    ...(status ? { status } : {}),
                };

                const response = await projectApi.getProjects(params);
                const result = extractResults(response);

                if (cancelled) return;

                setProjects(result.items);
                setTotal(result.count);
                setNextPage(Boolean(result.next));
                setPreviousPage(Boolean(result.previous));
            } catch (err) {
                if (cancelled) return;

                setProjects([]);
                setTotal(0);
                setNextPage(false);
                setPreviousPage(false);

                if (err.response?.status === 403) {
                    setError(
                        "You do not have permission to view the projects."
                    );
                } else {
                    setError(
                        "Unable to load projects. Please try again."
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
    }, [
        page,
        ordering,
        search,
        category,
        status,
        refreshKey,
    ]);

    // ---------------------------------------------
    // FILTER ACTIONS
    // ---------------------------------------------

    const changeCategory = (value) => {
        setCategory(value);
        setPage(1);
    };

    const changeStatus = (value) => {
        setStatus(value);
        setPage(1);
    };

    const changeOrdering = (value) => {
        setOrdering(value);
        setPage(1);
    };

    const resetFilters = () => {
        setSearchInput("");
        setSearch("");
        setCategory("");
        setStatus("");
        setOrdering("-created_at");
        setPage(1);
    };

    const hasActiveFilters =
        Boolean(searchInput || search || category || status) ||
        ordering !== "-created_at";

    const handleProjectCreated = (createdProject) => {
        setShowAddProject(false);

        navigate(`/admin/projects/${createdProject.id}`);
    };

    // ---------------------------------------------
    // PAGE
    // ---------------------------------------------

    return (
        <div className="space-y-6 pb-8">

            {/* GLOBAL LOADING SCREEN */}
            {(loading || loadingCategories) && (
                <LoadingScreen
                    message={
                        loadingCategories
                            ? "Loading project categories..."
                            : "Loading projects..."
                    }
                />
            )}

            {/* =====================================
          PAGE HEADING
          ===================================== */}

            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#948778]">
                        Admin / Project Management
                    </p>

                    <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#211E1A] sm:text-3xl">
                        All Projects
                    </h1>

                    <p className="mt-2 text-sm text-[#817669]">
                        View and manage construction projects
                        across every category.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setShowAddProject(true)}
                    className="
            inline-flex items-center justify-center gap-2
            rounded-xl bg-[#211E1A] px-5 py-3
            text-sm font-semibold text-white
            transition-all duration-200
            hover:-translate-y-0.5
            hover:bg-[#39332B]
            hover:shadow-[0_8px_20px_rgba(33,30,26,0.15)]
            active:translate-y-0
          "
                >
                    <Plus size={18} />
                    Add Project
                </button>
            </header>

            {/* =====================================
          SUMMARY
          ===================================== */}

            <div className="grid grid-cols-3 gap-3">
                <SummaryCard
                    label="Matching Projects"
                    value={error ? "—" : total}
                    icon={FolderKanban}
                    tone="sand"
                />

                <SummaryCard
                    label="Categories Loaded"
                    value={categoryError ? "—" : categories.length}
                    icon={Layers3}
                    tone="blue"
                />

                <SummaryCard
                    label="Current Page"
                    value={page}
                    icon={SlidersHorizontal}
                    tone="green"
                />
            </div>

            {/* =====================================
          SEARCH AND FILTERS
          ===================================== */}

            <section
                aria-label="Project search and filters"
                className="
          rounded-[22px] border border-[#E7DED2]
          bg-[#FFFDFA] p-4 sm:p-5
        "
            >
                <div className="mb-4 flex items-center gap-2">
                    <SlidersHorizontal
                        size={18}
                        className="text-[#817669]"
                    />

                    <h2 className="text-sm font-bold text-[#211E1A]">
                        Search & Filter
                    </h2>
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_175px_155px_175px]">
                    {/* SEARCH */}
                    <div className="relative">
                        <Search
                            size={18}
                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#928577]"
                        />

                        <input
                            type="search"
                            value={searchInput}
                            onChange={(event) =>
                                setSearchInput(event.target.value)
                            }
                            placeholder="Search projects, clients, locations..."
                            aria-label="Search projects"
                            className="
                h-12 w-full rounded-xl
                border border-[#E4DCCD]
                bg-[#FFFDFA] pl-11 pr-4
                text-sm text-[#211E1A]
                outline-none
                placeholder:text-[#AAA196]
                focus:border-[#211E1A]
                focus:ring-2 focus:ring-[#211E1A]/10
              "
                        />
                    </div>

                    {/* CATEGORY FILTER */}
                    <select
                        value={category}
                        onChange={(event) =>
                            changeCategory(event.target.value)
                        }
                        disabled={loadingCategories}
                        aria-label="Filter by category"
                        className={selectStyle}
                    >
                        <option value="">All Categories</option>

                        {categories.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name}
                            </option>
                        ))}
                    </select>

                    {/* STATUS FILTER */}
                    <select
                        value={status}
                        onChange={(event) =>
                            changeStatus(event.target.value)
                        }
                        aria-label="Filter by status"
                        className={selectStyle}
                    >
                        <option value="">All Statuses</option>
                        <option value="ACTIVE">Active</option>
                        <option value="MAINTENANCE">Maintenance</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="ON_HOLD">On Hold</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>

                    {/* SORTING */}
                    <select
                        value={ordering}
                        onChange={(event) =>
                            changeOrdering(event.target.value)
                        }
                        aria-label="Sort projects"
                        className={selectStyle}
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

                {hasActiveFilters && (
                    <div className="mt-4 flex justify-end">
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="
                inline-flex items-center gap-1.5
                text-xs font-semibold text-[#817669]
                transition-colors hover:text-[#211E1A]
              "
                        >
                            <X size={15} />
                            Clear Filters
                        </button>
                    </div>
                )}

                {categoryError && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7DED2] bg-[#F8F4EE] px-4 py-3">
                        <p role="alert" className="text-xs text-[#817669]">
                            {categoryError}
                        </p>

                        <button
                            type="button"
                            onClick={() => setRefreshKey((key) => key + 1)}
                            className="inline-flex items-center gap-2 text-xs font-semibold text-[#211E1A]"
                        >
                            <RefreshCw size={14} />
                            Retry
                        </button>
                    </div>
                )}
            </section>

            {/* =====================================
          LIST HEADER
          ===================================== */}

            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-[#211E1A]">
                        Project Directory
                    </h2>

                    <p className="mt-1 text-xs text-[#817669]">
                        {error
                            ? "Results unavailable"
                            : `${total} matching ${total === 1 ? "project" : "projects"
                            }`}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setRefreshKey((key) => key + 1)}
                    aria-label="Refresh projects"
                    className="
            flex h-10 w-10 items-center justify-center
            rounded-xl border border-[#E4DCCD]
            bg-[#FFFDFA] text-[#211E1A]
            transition-colors hover:bg-[#F1EADF]
          "
                >
                    <RefreshCw size={17} />
                </button>
            </div>

            {/* =====================================
          API ERROR
          ===================================== */}

            {error && !loading && (
                <section className="rounded-[22px] border border-[#E7DED2] bg-[#FFFDFA] px-5 py-12 text-center">
                    <p role="alert" className="text-sm text-[#A44837]">
                        {error}
                    </p>

                    <button
                        type="button"
                        onClick={() => setRefreshKey((key) => key + 1)}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white"
                    >
                        <RefreshCw size={16} />
                        Try Again
                    </button>
                </section>
            )}

            {/* =====================================
          HORIZONTAL PROJECT CARDS
          ===================================== */}

            {!loading && !error && (
                <>
                    {projects.length > 0 ? (
                        <div className="space-y-5">
                            {projects.map((project) => (
                                <HorizontalProjectCard
                                    key={project.id}
                                    project={project}
                                    categoryName={project.category_name}
                                />
                            ))}
                        </div>
                    ) : (
                        <section className="rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] px-6 py-16 text-center">
                            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#817669]">
                                <FolderKanban
                                    size={30}
                                    strokeWidth={1.5}
                                />
                            </span>

                            <h3 className="mt-5 text-lg font-bold text-[#211E1A]">
                                No projects found
                            </h3>

                            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#817669]">
                                {hasActiveFilters
                                    ? "No projects match the selected filters. Try clearing them."
                                    : "Your project directory is empty. Create your first project to get started."}
                            </p>

                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={resetFilters}
                                    className="mt-5 rounded-xl border border-[#E4DCCD] px-5 py-3 text-sm font-semibold text-[#211E1A] hover:bg-[#F1EADF]"
                                >
                                    Clear Filters
                                </button>
                            )}
                        </section>
                    )}

                    {/* =====================================
              PAGINATION
              ===================================== */}

                    {(nextPage || previousPage) && (
                        <nav
                            aria-label="Project pagination"
                            className="flex items-center justify-between gap-3 rounded-[20px] border border-[#E7DED2] bg-[#FFFDFA] px-4 py-3"
                        >
                            <button
                                type="button"
                                disabled={!previousPage}
                                onClick={() => {
                                    setPage((previous) =>
                                        Math.max(1, previous - 1)
                                    );

                                    window.scrollTo({
                                        top: 0,
                                        behavior: "smooth",
                                    });
                                }}
                                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#211E1A] hover:bg-[#F1EADF] disabled:cursor-not-allowed disabled:opacity-35"
                            >
                                Previous
                            </button>

                            <span className="text-xs font-semibold text-[#817669]">
                                Page {page}
                            </span>

                            <button
                                type="button"
                                disabled={!nextPage}
                                onClick={() => {
                                    setPage((previous) => previous + 1);

                                    window.scrollTo({
                                        top: 0,
                                        behavior: "smooth",
                                    });
                                }}
                                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#211E1A] hover:bg-[#F1EADF] disabled:cursor-not-allowed disabled:opacity-35"
                            >
                                Next
                            </button>
                        </nav>
                    )}
                </>
            )}

            {/* =====================================
          REUSABLE ADD PROJECT MODAL
          ===================================== */}

            <AddProject
                open={showAddProject}
                onClose={() => setShowAddProject(false)}
                onCreated={handleProjectCreated}
            />
        </div>
    );
}
