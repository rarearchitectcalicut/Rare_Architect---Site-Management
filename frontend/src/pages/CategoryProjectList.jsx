import { ProjectSearch } from "../components/daily-reports/ReportProjectPicker";
import SearchFilterToolbar from "../components/common/SearchFilterToolbar";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  ImageOff,
  Plus,
  RefreshCw,
} from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { projectApi } from "../api/projectApi";
import { getMediaUrl } from "../utils/mediaUrl";
import { useNavigate } from "react-router-dom";
import AddProject from "../modal/admin/AddProject";
import LoadingScreen from "../components/LoadingScreen";
import HorizontalProjectCard from "../components/projects/HorizontalProjectCard";

// =====================================================
// CATEGORY PROJECT LIST PAGE
// =====================================================

export default function CategoryProjectList() {
  const { categoryId } = useParams();
  const { user } = useAuth();

  const [category, setCategory] = useState(null);
  const categoryCache = useRef(null);
  const [projects, setProjects] = useState([]);

  const [totalCount, setTotalCount] = useState(null);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ordering, setOrdering] = useState("-created_at");
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  const [showAddProject, setShowAddProject] = useState(false);

  const isAdmin = user?.role === "ADMIN";

  const navigate = useNavigate();

  const handleProjectCreated = (createdProject) => {
    setShowAddProject(false);

    navigate(`/admin/projects/${createdProject.id}`);
  };

  // ---------------------------------------------
  // LOAD CATEGORY AND PROJECTS
  // ---------------------------------------------

  useEffect(() => {
    const controller = new AbortController();

    async function fetchProjects() {
      setLoading(true);
      setError("");

      try {
        const [categoryData, projectData] = await Promise.all([
          categoryCache.current?.id === categoryId
            ? Promise.resolve(categoryCache.current.data)
            : projectApi.getCategory(categoryId, controller.signal),
          projectApi.getProjects({
            category: categoryId,
            page,
            ordering,
            ...(search ? { search } : {}),
            ...(statusFilter ? { status: statusFilter } : {}),
          }, controller.signal),
        ]);

        if (controller.signal.aborted) return;

        const isArray = Array.isArray(projectData);

        const items = isArray ? projectData : projectData?.results;

        if (!Array.isArray(items)) {
          throw new Error("Unexpected projects API response.");
        }

        // Defensive check: never display another
        // category's projects if backend filtering
        // is misconfigured.
        const scopedItems = items.filter(
          (project) => String(project.category) === String(categoryId),
        );

        setCategory(categoryData);
        categoryCache.current = { id: categoryId, data: categoryData };
        setProjects(scopedItems);

        setTotalCount(
          isArray
            ? scopedItems.length
            : typeof projectData.count === "number"
              ? projectData.count
              : null,
        );

        setHasNext(!isArray && Boolean(projectData.next));

        setHasPrevious(!isArray && Boolean(projectData.previous));

        setImageFailed(false);
      } catch (err) {
        if (controller.signal.aborted) return;

        setProjects([]);
        setTotalCount(null);

        if (err.response?.status === 404) {
          setError("This category could not be found.");
        } else if (err.response?.status === 403) {
          setError("You do not have permission to view these projects.");
        } else if (!err.response) {
          setError("Unable to connect to RARE. Check your connection.");
        } else {
          setError("Unable to load category projects. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchProjects();

    return () => {
      controller.abort();
    };
  }, [categoryId, page, ordering, search, statusFilter, retryKey]);

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
      {loading && !category && <LoadingScreen message="Loading projects..." />}

      {/* BREADCRUMB */}
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-xs text-muted"
      >
        <Link to="/admin/dashboard" className="hover:text-ink">
          Dashboard
        </Link>

        <span>/</span>

        <span>Project Categories</span>

        <span>/</span>

        <span className="font-semibold text-ink">
          {category?.name || "Projects"}
        </span>
      </nav>

      {/* ERROR */}
      {error ? (
        <div className="rounded-3xl border border-border bg-surface px-6 py-14 text-center">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>

          <button
            type="button"
            onClick={() => setRetryKey((previous) => previous + 1)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-action px-5 py-3 text-sm font-semibold text-white"
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
              border border-border
              bg-surface
            "
          >
            <div className="flex min-h-46.25 items-stretch sm:min-h-55">
              <div className="min-w-0 flex-1 p-5 sm:p-8">
                <Link
                  to="/admin/dashboard"
                  className="inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-ink"
                >
                  <ArrowLeft size={15} />
                  Back to Dashboard
                </Link>

                <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-muted">
                  RARE Project Categories
                </p>

                <h1
                  className="
                    mt-2 wrap-break-word text-2xl
                    font-bold tracking-tight
                    text-ink
                    sm:text-3xl
                  "
                >
                  {category?.name || "Projects"}
                </h1>

                <p className="mt-3 max-w-xl text-xs leading-6 text-muted sm:text-sm">
                  {category?.description ||
                    "Explore and manage projects in this category."}
                </p>
              </div>

              <div className="relative hidden w-[32%] bg-pastel-lavender sm:block">
                {categoryImageUrl && !imageFailed ? (
                  <img
                    src={categoryImageUrl}
                    alt={`${category.name} category`}
                    onError={() => setImageFailed(true)}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageOff size={32} className="text-muted" />
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
              <h2 className="text-xl font-bold text-ink sm:text-2xl">
                Projects
              </h2>

              <p className="mt-1 text-sm text-muted">
                {totalCount === null
                  ? "Browse matching projects"
                  : `${totalCount} matching ${
                      totalCount === 1 ? "project" : "projects"
                    }`}
              </p>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAddProject(true)}
                className="
                        inline-flex items-center justify-center gap-2
                        rounded-xl bg-action
                        px-4 py-3
                        text-xs font-semibold text-white
                        transition-all duration-200
                        hover:bg-primary-hover
                        hover:-translate-y-0.5
                        active:scale-[0.98]
                        sm:text-sm
                    "
              >
                <Plus size={17} strokeWidth={2} />
                Add Project
              </button>
            )}
          </div>

          {/* =====================================
              FILTER BAR
              ===================================== */}

          <SearchFilterToolbar
            label="Project search and filters"
            search={<ProjectSearch compact suggestionsFiltered query={search} onSearch={(value) => { setSearch(value); setPage(1); }} loading={loading} label="Search projects" labelClassName="sr-only" placeholder="Project, client or location" suggestions={loading ? [] : projects.map((project) => ({ id: project.id, name: project.name, context: project.location, to: `/${isAdmin ? "admin" : "supervisor"}/projects/${project.id}` }))} />}
            activeCount={Number(Boolean(statusFilter)) + Number(ordering !== "-created_at")}
            onClear={() => { setSearch(""); setStatusFilter(""); setOrdering("-created_at"); setPage(1); }}
          >
            <div className="grid gap-4">
              <select
                value={statusFilter}
                onChange={handleStatusChange}
                aria-label="Filter by project status"
                className="
                  h-12 w-full rounded-xl
                  border border-border
                  bg-surface px-3
                  text-sm text-ink
                  outline-none
                  focus:border-ink
                "
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <select
                value={ordering}
                onChange={handleOrderingChange}
                aria-label="Sort projects"
                className="
                  h-12 w-full rounded-xl
                  border border-border
                  bg-surface px-3
                  text-sm text-ink
                  outline-none
                  focus:border-ink
                "
              >
                <option value="-created_at">Newest First</option>
                <option value="created_at">Oldest First</option>
                <option value="name">Name A–Z</option>
                <option value="-name">Name Z–A</option>
                <option value="start_date">Start Date</option>
                <option value="end_date">End Date</option>
              </select>
            </div>
          </SearchFilterToolbar>

          {/* =====================================
              HORIZONTAL PROJECT LIST
              ===================================== */}

          {!loading && (
            <>
              {projects.length === 0 ? (
                <section className="rounded-3xl border border-border bg-surface px-6 py-14 text-center">
                  <FolderOpen
                    size={37}
                    strokeWidth={1.5}
                    className="mx-auto text-muted"
                  />

                  <h3 className="mt-4 text-lg font-bold text-ink">
                    No projects found
                  </h3>

                  <p className="mx-auto mt-2 max-w-md text-sm text-muted">
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
                <nav aria-label="Category project pages" className="rare-pagination rounded-[20px] border border-border bg-surface px-4 py-3">
                  <button
                    type="button"
                    disabled={!hasPrevious}
                    onClick={() => {
                      setPage((previous) => Math.max(1, previous - 1));
                      window.scrollTo({
                        top: 0,
                        behavior: "smooth",
                      });
                    }}
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink disabled:opacity-35"
                  >
                    <ArrowLeft size={17} />
                    Previous
                  </button>

                  <span aria-live="polite" aria-atomic="true" className="text-xs font-semibold text-muted">
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
                    className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink disabled:opacity-35"
                  >
                    Next
                    <ArrowRight size={17} />
                  </button>
                </nav>
              )}
            </>
          )}
        </>
      )}
          <AddProject
              open={showAddProject}
              onClose={() => setShowAddProject(false)}
              onCreated={handleProjectCreated}
              initialCategoryId={categoryId}
          />
    </div>
  );
}
