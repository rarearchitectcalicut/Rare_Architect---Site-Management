import { ProjectHero, ProjectMobileActions, ProjectWorkspaceNavigation, ProjectDescription } from "../../components/projects/ProjectDetailUI";
import ProjectInformationCard from "../../components/projects/ProjectInformationCard";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Ban,
  Check,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import { projectApi } from "../../api/projectApi";
import { supervisorApi } from "../../api/supervisorApi";
import { getMediaUrl } from "../../utils/mediaUrl";
import LoadingScreen from "../../components/LoadingScreen";
import { Pencil } from "lucide-react";
import EditProject from "../../modal/admin/EditProject";
import { validationMessage } from "../../hooks/useApprovalReview";

// =====================================================
// MOTION SYSTEM
// One orchestrated page-load sequence + hover feedback.
// Everything respects prefers-reduced-motion.
// =====================================================

// Staggered delay helper (capped so late items never feel slow)
const stagger = (index, step = 70, max = 700) => Math.min(index * step, max);

// Icon tile tones. Literal class strings so Tailwind can detect them.


// =====================================================
// HELPERS
// =====================================================


function getName(person) {
  return (
    person.supervisor_name ||
    [person.first_name, person.last_name].filter(Boolean).join(" ") ||
    person.username ||
    "Supervisor"
  );
}

function getListItems(response) {
  if (Array.isArray(response)) return response;

  if (Array.isArray(response?.results)) {
    return response.results;
  }

  throw new Error("Unexpected Supervisor API response.");
}


function AddSupervisorDialog({
  open,
  projectId,
  onClose,
  assignedIds,
  onAssign,
  setBusyMessage,
}) {
  const [supervisors, setSupervisors] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const lifecycle = useRef(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const operation = { active: true, assigning: false, loading: true };
    lifecycle.current = operation;
    const releaseLoading = () => {
      if (lifecycle.current !== operation || !operation.loading) return;
      operation.loading = false;
      setBusyMessage((message) => message === "Loading supervisors..." ? "" : message);
    };

    async function loadSupervisors() {
      setError("");
      setSelected([]);
      setSearch("");
      setSupervisors([]);
      setBusyMessage("Loading supervisors...");

      try {
        const all = [];
        for (let page = 1; page <= 500; page += 1) {
          const response = await supervisorApi.list({ page });
          if (cancelled) return;
          all.push(...getListItems(response));
          if (Array.isArray(response) || !response.next) break;
          if (page === 500) throw new Error("Supervisor pagination limit reached.");
        }

        if (!cancelled) {
          setSupervisors(all);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.status === 404
              ? "Supervisor list endpoint was not found."
              : "Unable to load supervisors. Please try again.",
          );
        }
      } finally {
        if (!cancelled) releaseLoading();
      }
    }

    loadSupervisors();

    return () => {
      cancelled = true;
      operation.active = false;
      releaseLoading();
    };
  }, [open, projectId, setBusyMessage]);

  if (!open) return null;

  const available = supervisors.filter(
    (person) =>
      !assignedIds.has(String(person.id)) && person.is_active !== false,
  );

  const filtered = available.filter((person) => {
    const text = [getName(person), person.phone, person.email, person.username]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return text.includes(search.toLowerCase());
  });

  const toggle = (id) => {
    const key = String(id);

    setSelected((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key],
    );
  };

  const handleAssign = async () => {
    const operation = lifecycle.current;
    if (!open || !operation?.active || operation.assigning || !selected.length) return;
    operation.assigning = true;
    const current = () => operation.active && lifecycle.current === operation;

    setError("");

    try {
      await onAssign(selected);
      if (current()) onClose();
    } catch (err) {
      if (!current()) return;
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string" ? detail : "Unable to assign supervisors.",
      );
    } finally {
      operation.assigning = false;
    }
  };

  return (
    <div
      className="rare-fade fixed inset-0 z-50 flex items-center justify-center bg-overlay/45 p-3 backdrop-blur-sm sm:p-4"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-supervisor-title"
        className="rare-pop flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-[22px] bg-surface shadow-2xl sm:rounded-[26px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-4 sm:p-6">
          <div className="min-w-0">
            <h2
              id="add-supervisor-title"
              className="text-lg font-bold text-ink sm:text-xl"
            >
              Assign Supervisors
            </h2>
            <p className="mt-1 text-sm text-muted">
              Select existing RARE Supervisor accounts.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="
                            group shrink-0 rounded-full bg-app p-2 text-ink
                            transition-all duration-200 ease-out
                            hover:bg-border
                            active:scale-95
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-ink/30
                        "
          >
            <X
              size={19}
              className="
                                transition-transform duration-300 ease-out
                                group-hover:rotate-90
                                motion-reduce:transition-none
                                motion-reduce:group-hover:rotate-0
                            "
            />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="relative mb-4">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search supervisor..."
              className="
                                h-12 w-full rounded-xl border border-border bg-surface
                                pl-10 pr-4 text-sm outline-none
                                transition-all duration-200
                                hover:border-border-strong
                                focus:border-ink
                                focus:shadow-[0_0_0_3px_rgba(33,30,26,0.08)]
                            "
            />
          </div>

          {error && (
            <p role="alert" className="mb-4 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="space-y-2">
            {filtered.map((person) => {
              const checked = selected.includes(String(person.id));

              return (
                <button
                  key={person.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggle(person.id)}
                  className={`
                                        group flex w-full items-center gap-3 rounded-xl border p-3 text-left
                                        transition-all duration-200 ease-out
                                        active:scale-[0.99]
                                        focus-visible:outline-none focus-visible:ring-2
                                        focus-visible:ring-ink/30
                                        motion-reduce:transition-none
                                        ${
                                          checked
                                            ? "border-ink bg-app"
                                            : "border-border bg-surface hover:border-border-strong hover:bg-surface-soft/60"
                                        }
                                    `}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-border text-sm font-bold text-ink transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none">
                    {getName(person).charAt(0).toUpperCase()}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {getName(person)}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {person.phone || person.email || ""}
                    </span>
                  </span>

                  <span
                    className={`
                                            flex h-5 w-5 shrink-0 items-center justify-center rounded-md border
                                            transition-all duration-200
                                            ${
                                              checked
                                                ? "scale-110 border-ink bg-action text-white"
                                                : "border-border-strong group-hover:border-ink"
                                            }
                                        `}
                  >
                    {checked && <Check size={14} />}
                  </span>
                </button>
              );
            })}

            {!filtered.length && (
              <p className="py-8 text-center text-sm text-muted">
                No available supervisors found.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-4 sm:gap-3 sm:p-5">
          <button
            type="button"
            onClick={onClose}
            className="
                            flex-1 rounded-xl border border-border px-5 py-3
                            text-sm font-medium text-ink
                            transition-all duration-200 ease-out
                            hover:border-border-strong hover:bg-surface-soft
                            active:scale-[0.98]
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-ink/30
                            sm:flex-none
                        "
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleAssign}
            disabled={!selected.length}
            className="
                            flex-1 rounded-xl bg-action px-5 py-3
                            text-sm font-semibold text-white
                            transition-all duration-200 ease-out
                            hover:-translate-y-0.5 hover:bg-primary-hover
                            hover:shadow-[0_10px_24px_rgba(33,30,26,0.22)]
                            active:translate-y-0 active:scale-[0.98]
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-ink/40 focus-visible:ring-offset-2
                            disabled:pointer-events-none disabled:opacity-40
                            motion-reduce:hover:translate-y-0
                            sm:flex-none
                        "
          >
            Assign ({selected.length})
          </button>
        </div>
      </section>
    </div>
  );
}

// =====================================================
// ADMIN PROJECT OVERVIEW
// =====================================================

export default function ProjectOverview() {
  const [showEditProject, setShowEditProject] = useState(false);
  const [showCancelProject, setShowCancelProject] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancellationError, setCancellationError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
      if (!notice) return;
      const timer = setTimeout(() => setNotice(""), 8000);
      return () => clearTimeout(timer);
  }, [notice]);
  const [nextStatus, setNextStatus] = useState("ACTIVE");
  const [changingStatus, setChangingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  const statusInFlight = useRef(false);
  const cancellationInFlight = useRef(false);
  const cancelDialog = useRef(null);
  const cancelTitleId = useId();
  const cancelMessageId = useId();

  const { projectId } = useParams();

  const [projectData, setProject] = useState(null);
  const project = projectData?.id === projectId ? projectData : null;
  const requestScope = useRef({ projectId, active: true, request: 0 });
  const [loadingMessage, setLoadingMessage] = useState(
    "Loading project overview...",
  );
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const [showAssign, setShowAssign] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  useEffect(() => {
    const scope = { projectId, active: true, request: 0 };
    requestScope.current = scope;
    setShowEditProject(false);
    setShowAssign(false);
    setRemoveTarget(null);
    setShowCancelProject(false);
    setCancelling(false);
    setChangingStatus(false);
    setNotice("");
    setCancellationError("");
    setStatusError("");
    statusInFlight.current = false;
    cancellationInFlight.current = false;
    return () => { scope.active = false; };
  }, [projectId]);

  const loadProject = useCallback(async () => {
    const scope = requestScope.current;
    if (!scope?.active || scope.projectId !== projectId) return;
    const request = ++scope.request;
    const current = () => scope.active && scope.request === request;
    setLoadingMessage("Loading project overview...");
    setError("");

    try {
      const data = await projectApi.getProjectOverview(projectId);
      if (!current()) return;
      if (data.id !== projectId) throw new Error("Unexpected project response.");
      setProject(data);
    } catch (err) {
      if (!current()) return;
      setError(
        err.response?.status === 404
          ? "This project was not found."
          : "Unable to load project details.",
      );
    } finally {
      if (current()) setLoadingMessage("");
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject, retryKey]);

  useEffect(() => {
    if (!showCancelProject) return;
    const dialog = cancelDialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; };
  }, [showCancelProject]);

  async function cancelProject(event) {
    event.preventDefault();
    const scope = requestScope.current;
    if (!scope?.active || scope.projectId !== projectId) return;
    if (cancellationInFlight.current || !cancellationReason.trim()) return;
    cancellationInFlight.current = true;
    setCancelling(true);
    setCancellationError("");
    try {
      const updated = await projectApi.updateProject(projectId, {
        status: "CANCELLED", cancellation_reason: cancellationReason.trim(),
      });
      if (!scope.active) return;
      setProject((previous) => ({ ...previous, status: updated.status }));
      setShowCancelProject(false);
      setNotice("Project cancelled. All existing records have been preserved.");
      await loadProject();
    } catch (failure) {
      if (!scope.active) return;
      setCancellationError(validationMessage(failure, "Unable to cancel this project. Please try again."));
    } finally {
      if (scope.active) {
        cancellationInFlight.current = false;
        setCancelling(false);
      }
    }
  }

  async function changeCancelledStatus(event) {
    event.preventDefault();
    const scope = requestScope.current;
    if (!scope?.active || scope.projectId !== projectId) return;
    if (statusInFlight.current || project?.status !== "CANCELLED") return;
    statusInFlight.current = true;
    setChangingStatus(true);
    setStatusError("");
    try {
      const updated = await projectApi.updateProject(projectId, { status: nextStatus });
      if (!scope.active) return;
      setProject((previous) => ({ ...previous, status: updated.status, cancellation: null }));
      setNotice(`Project status changed to ${updated.status.replaceAll("_", " ").toLowerCase()}. All existing records have been preserved.`);
    } catch (failure) {
      if (!scope.active) return;
      setStatusError(validationMessage(failure, "Unable to change project status. Please try again."));
    } finally {
      if (scope.active) {
        statusInFlight.current = false;
        setChangingStatus(false);
      }
    }
  }

  const assignSupervisors = async (ids) => {
    const scope = requestScope.current;
    if (!scope?.active || scope.projectId !== projectId) return;
    const request = ++scope.request;
    const current = () => scope.active && scope.request === request;
    setLoadingMessage("Assigning supervisors...");

    try {
      await supervisorApi.assignToProject(projectId, ids);
      if (!current()) return;
      const updated = await projectApi.getProjectOverview(projectId);
      if (!current()) return;
      if (updated.id !== projectId) throw new Error("Unexpected project response.");
      setProject(updated);
    } finally {
      if (current()) setLoadingMessage("");
    }
  };

  const removeSupervisor = async () => {
    const scope = requestScope.current;
    if (!scope?.active || scope.projectId !== projectId) return;
    if (!removeTarget) return;

    const request = ++scope.request;
    const current = () => scope.active && scope.request === request;
    setLoadingMessage("Removing supervisor...");

    try {
      await supervisorApi.removeFromProject(projectId, removeTarget.supervisor);
      if (!current()) return;
      const updated = await projectApi.getProjectOverview(projectId);
      if (!current()) return;
      if (updated.id !== projectId) throw new Error("Unexpected project response.");
      setProject(updated);
      setRemoveTarget(null);
    } catch (err) {
      if (!current()) return;
      setError(err.response?.data?.detail || "Unable to remove supervisor.");
      setRemoveTarget(null);
    } finally {
      if (current()) setLoadingMessage("");
    }
  };

  const supervisors = project?.supervisors || [];

  const assignedIds = new Set(
    supervisors.map((item) => String(item.supervisor)),
  );

  const coverUrl = getMediaUrl(project?.cover_image);

  return (
    <div className="rare-project-detail">

      {loadingMessage && <LoadingScreen message={loadingMessage} />}
      {notice && <p role="status" className="rounded-xl border border-border-strong bg-pastel-mint p-4 text-sm text-success">{notice}</p>}
      {project?.status === "CANCELLED" && <section className="space-y-2 rounded-2xl border border-border bg-surface p-5 text-sm text-muted">
        <p className="font-semibold text-ink">This project has been cancelled. Existing records remain available for reference.</p>
        <form onSubmit={changeCancelledStatus} className="flex flex-wrap items-end gap-3 pt-2">
          <label className="min-w-0 flex-1 basis-48 font-semibold">Change project status
            <select aria-label="New project status" value={nextStatus} disabled={changingStatus} onChange={(event) => { setNextStatus(event.target.value); setStatusError(""); }} className="mt-2 min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-subtle focus:ring-2 focus:ring-pastel-lavender disabled:opacity-50">
              <option value="ACTIVE">Active</option><option value="MAINTENANCE">Maintenance</option><option value="ON_HOLD">On hold</option><option value="COMPLETED">Completed</option>
            </select>
          </label>
          <button type="submit" disabled={changingStatus} className="min-h-12 rounded-xl bg-action px-5 py-3 font-semibold text-white disabled:opacity-50">{changingStatus ? "Updating status..." : "Update status"}</button>
        </form>
        {statusError && <p role="alert" className="text-sm text-danger">{statusError}</p>}
        <p>Pending approvals remain available for separate Admin review; cancellation does not decide them.</p>
        {project.cancellation && <><p>Cancelled by {project.cancellation.cancelled_by} on {new Date(project.cancellation.cancelled_at).toLocaleString("en-IN")}</p><p className="whitespace-pre-wrap break-words">Reason: {project.cancellation.reason || "No reason recorded in the existing history."}</p></>}
      </section>}

      {error && (
        <div
          role="alert"
          className="rare-rise rounded-2xl border border-danger/30 bg-pastel-blush p-4 text-sm text-danger"
        >
          {error}
          <button
            type="button"
            onClick={() => setRetryKey((n) => n + 1)}
            className="
                            ml-4 rounded font-semibold underline
                            transition-opacity duration-200
                            hover:opacity-70
                            focus-visible:outline-none focus-visible:ring-2
                            focus-visible:ring-danger/40
                        "
          >
            Retry
          </button>
        </div>
      )}

      {!project ? null : (
        <>
          {/* BREADCRUMB */}
          <nav className="rare-project-detail-breadcrumb" aria-label="Project breadcrumb">
            <Link
              to="/admin/projects"
              className="rounded transition-colors duration-200 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
            >
              All Projects
            </Link>
            <span>/</span>
            <Link
              to={`/admin/categories/${project.category}`}
              className="rounded transition-colors duration-200 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
            >
              {project.category_name}
            </Link>
            <span>/</span>
            <span className="font-semibold text-ink">{project.name}</span>
          </nav>

          <ProjectHero key={project.id} project={project} coverUrl={coverUrl}>
            <button type="button" aria-label="Edit Project" title="Edit project" disabled={project.status === "CANCELLED"} onClick={() => setShowEditProject(true)} className="rare-project-icon-action"><Pencil size={18} aria-hidden="true" /><span className="sr-only">Edit Project</span></button>
            {["ACTIVE", "MAINTENANCE", "ON_HOLD"].includes(project.status) && <>
              <button type="button" aria-label="Cancel Project" title="Cancel project" onClick={() => { setCancellationReason(""); setCancellationError(""); setShowCancelProject(true); }} className="rare-project-icon-action rare-project-cancel-action"><Ban size={18} aria-hidden="true" /><span className="sr-only">Cancel Project</span></button>
              <ProjectMobileActions><button type="button" aria-label="Cancel Project" onClick={() => { setCancellationReason(""); setCancellationError(""); setShowCancelProject(true); }}><Ban size={17} aria-hidden="true" />Cancel Project</button></ProjectMobileActions>
            </>}
          </ProjectHero>
          <div className="rare-project-detail-grid">
            <div className="rare-project-detail-primary">
              <ProjectWorkspaceNavigation projectId={projectId} role="ADMIN" />
              <ProjectDescription description={project.description} />
            </div>
            <aside className="rare-project-detail-secondary" aria-label="Project facts and team">
              <ProjectInformationCard project={project} supervisorCount={supervisors.length} />
              <section
            className="admin-project-team rare-rise rounded-[22px] border border-border bg-surface p-4 sm:rounded-3xl sm:p-7"
            style={{ "--d": `${stagger(7)}ms` }}
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-ink sm:text-xl">
                  Assigned Supervisors
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {supervisors.length} assigned to this project
                </p>
              </div>

              <button
                type="button"
                disabled={project.status === "CANCELLED"}
                onClick={() => setShowAssign(true)}
                className="
                                    group flex items-center gap-2 rounded-xl bg-action
                                    px-4 py-3 text-sm font-semibold text-white
                                    transition-all duration-200 ease-out
                                    hover:-translate-y-0.5 hover:bg-primary-hover
                                    hover:shadow-[0_10px_24px_rgba(33,30,26,0.22)]
                                    active:translate-y-0 active:scale-[0.98]
                                    focus-visible:outline-none focus-visible:ring-2
                                    focus-visible:ring-ink/40 focus-visible:ring-offset-2
                                    motion-reduce:transition-none
                                    motion-reduce:hover:translate-y-0
                                "
              >
                <Plus
                  size={18}
                  className="
                                        transition-transform duration-300 ease-out
                                        group-hover:rotate-90
                                        motion-reduce:transition-none
                                        motion-reduce:group-hover:rotate-0
                                    "
                />
                Add Supervisor
              </button>
            </div>

            {!supervisors.length ? (
              <div className="rare-fade rounded-xl bg-surface-soft px-5 py-10 text-center sm:py-12">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pastel-sky text-info">
                  <UsersRound size={28} strokeWidth={1.7} />
                </div>
                <p className="mt-3 text-sm text-muted">
                  No supervisors assigned yet.
                </p>
              </div>
            ) : (
              <div className="rare-project-team-list grid gap-3">
                {supervisors.map((item, index) => {
                  const name = getName(item);

                  return (
                    <article
                      key={item.id}
                      className="
                                                rare-rise group flex min-w-0 flex-col rounded-[18px]
                                                border border-border bg-surface p-4
                                                transition-all duration-300 ease-out
                                                hover:-translate-y-0.5 hover:border-border-strong
                                                hover:shadow-[0_12px_30px_rgba(33,30,26,0.07)]
                                                motion-reduce:transition-none
                                                motion-reduce:hover:translate-y-0
                                                sm:rounded-[20px]
                                            "
                      style={{ "--d": `${stagger(8 + index)}ms` }}
                    >
                      <div className="flex flex-1 items-start gap-3">
                        <div
                          className="
                                                        flex h-12 w-12 shrink-0 items-center justify-center
                                                        rounded-full bg-pastel-lavender text-lg font-bold text-ink
                                                        transition-transform duration-300 ease-out
                                                        group-hover:scale-105
                                                        motion-reduce:transition-none
                                                        motion-reduce:group-hover:scale-100
                                                    "
                        >
                          {name.charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="wrap-anywhere font-bold text-ink">
                            {name}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            Site Supervisor
                          </p>
                          <p className="mt-2 text-sm text-muted">
                            {item.supervisor_phone || "No phone number"}
                          </p>
                          {item.supervisor_email && (
                            <a
                              href={`mailto:${item.supervisor_email}`}
                              className="mt-1 block break-all text-xs text-muted transition-colors duration-200 hover:text-info hover:underline"
                            >
                              <Mail size={13} className="mr-1 inline" />
                              {item.supervisor_email}
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-2 border-t border-surface-soft pt-4">
                        {item.supervisor_phone ? (
                          <a
                            href={`tel:${item.supervisor_phone}`}
                            className="
                                                            group/call flex flex-1 items-center justify-center gap-2
                                                            rounded-xl bg-pastel-mint px-3 py-3
                                                            text-sm font-semibold text-success
                                                            transition-all duration-200 ease-out
                                                            hover:bg-pastel-mint
                                                            hover:shadow-[0_6px_16px_rgba(41,111,64,0.15)]
                                                            active:scale-[0.98]
                                                            focus-visible:outline-none focus-visible:ring-2
                                                            focus-visible:ring-success/40
                                                        "
                          >
                            <Phone
                              size={17}
                              className="
                                                                transition-transform duration-300 ease-out
                                                                group-hover/call:-rotate-12 group-hover/call:scale-110
                                                                motion-reduce:transition-none
                                                                motion-reduce:group-hover/call:transform-none
                                                            "
                            />
                            Call
                          </a>
                        ) : (
                          null
                        )}

                        <button
                          type="button"
                          disabled={project.status === "CANCELLED"}
                          onClick={() => setRemoveTarget(item)}
                          aria-label={`Remove ${name}`}
                          className="
                                                        group/del flex items-center justify-center rounded-xl
                                                        border border-danger/30 p-3 text-danger
                                                        transition-all duration-200 ease-out
                                                        hover:border-danger/30 hover:bg-pastel-blush
                                                        active:scale-95
                                                        focus-visible:outline-none focus-visible:ring-2
                                                        focus-visible:ring-danger/40
                                                    "
                        >
                          <Trash2
                            size={18}
                            className="
                                                            transition-transform duration-200 ease-out
                                                            group-hover/del:scale-110
                                                            motion-reduce:transition-none
                                                            motion-reduce:group-hover/del:scale-100
                                                        "
                          />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
            </aside>
          </div>

          {/* PROJECT WORKSPACE */}
          

          

          {/* ASSIGNED SUPERVISORS */}
          
        </>
      )}

      {/* ADD SUPERVISOR */}
      <AddSupervisorDialog
        projectId={projectId}
        open={showAssign && project?.status !== "CANCELLED"}
        onClose={() => setShowAssign(false)}
        assignedIds={assignedIds}
        onAssign={assignSupervisors}
        setBusyMessage={setLoadingMessage}
      />

      {/* REMOVE CONFIRMATION */}
      {removeTarget && project?.status !== "CANCELLED" && (
        <div className="rare-fade fixed inset-0 z-50 flex items-center justify-center bg-overlay/45 p-3 backdrop-blur-sm sm:p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-supervisor-title"
            className="rare-pop w-full max-w-md rounded-[22px] bg-surface p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 rounded-xl bg-pastel-blush p-2.5 text-danger">
                <Trash2 size={20} strokeWidth={1.8} />
              </span>

              <div className="min-w-0">
                <h2
                  id="remove-supervisor-title"
                  className="text-lg font-bold text-ink sm:text-xl"
                >
                  Remove Supervisor?
                </h2>

                <p className="mt-2 text-sm leading-6 text-muted">
                  Remove {getName(removeTarget)} from this project? They will
                  lose access to this project's records.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                className="
                                    flex-1 rounded-xl border border-border px-4 py-3
                                    text-sm font-semibold
                                    transition-all duration-200 ease-out
                                    hover:border-border-strong hover:bg-surface-soft
                                    active:scale-[0.98]
                                    focus-visible:outline-none focus-visible:ring-2
                                    focus-visible:ring-ink/30
                                    sm:flex-none
                                "
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={removeSupervisor}
                className="
                                    flex-1 rounded-xl bg-red-700 px-4 py-3
                                    text-sm font-semibold text-white
                                    transition-all duration-200 ease-out
                                    hover:-translate-y-0.5 hover:bg-red-800
                                    hover:shadow-[0_10px_24px_rgba(185,28,28,0.28)]
                                    active:translate-y-0 active:scale-[0.98]
                                    focus-visible:outline-none focus-visible:ring-2
                                    focus-visible:ring-danger/40 focus-visible:ring-offset-2
                                    motion-reduce:hover:translate-y-0
                                    sm:flex-none
                                "
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
      <EditProject
        open={showEditProject && project?.status !== "CANCELLED"}
        project={project}
        onClose={() => setShowEditProject(false)}
        onUpdated={loadProject}
      />
      {showCancelProject && <dialog ref={cancelDialog} aria-labelledby={cancelTitleId} aria-describedby={cancelMessageId}
        onCancel={(event) => { event.preventDefault(); if (!cancellationInFlight.current) setShowCancelProject(false); }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-ink shadow-2xl backdrop:bg-overlay/55 sm:p-7">
        <form onSubmit={cancelProject} className="space-y-5">
          <h2 id={cancelTitleId} className="text-xl font-bold">Cancel Project?</h2>
          <p className="break-words font-semibold">{project?.name}</p>
          <p id={cancelMessageId} className="text-sm leading-6 text-muted">Are you sure you want to cancel this project? The project will be marked as Cancelled. All existing tasks, reports, documents, approvals and history will be preserved.</p>
          <label className="block text-sm font-semibold">Cancellation reason (required)
            <textarea autoFocus required maxLength={1000} rows={4} value={cancellationReason} disabled={cancelling} onChange={(event) => setCancellationReason(event.target.value)} className="mt-2 w-full rounded-xl border border-border-strong p-3 text-sm outline-none focus:border-info focus:ring-2 focus:ring-[#BACDE4]" />
          </label>
          {cancellationError && <p role="alert" className="text-sm text-danger">{cancellationError}</p>}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button type="button" disabled={cancelling} onClick={() => setShowCancelProject(false)} className="min-h-12 rounded-xl border border-border-strong bg-surface px-5 py-3 text-sm font-semibold hover:bg-app focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info disabled:opacity-60">Keep Project</button>
            <button type="submit" disabled={cancelling || !cancellationReason.trim()} className="min-h-12 rounded-xl bg-danger-solid px-5 py-3 text-sm font-semibold text-white hover:bg-danger-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-not-allowed disabled:opacity-60">{cancelling ? "Cancelling..." : "Cancel Project"}</button>
          </div>
        </form>
      </dialog>}
    </div>
  );
}
