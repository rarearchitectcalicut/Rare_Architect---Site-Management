import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";
import ApprovalModal from "../approvals/ApprovalModal";
import { ProjectSearch } from "./ReportProjectPicker";
import { projectApi } from "../../api/projectApi";
import { validationMessage } from "../../hooks/useApprovalReview";

export default function SupervisorProjectSelector({ action, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const navigating = useRef(false);
  const key = JSON.stringify([query, page, revision]);
  const current = result?.key === key ? result : null;
  const title = action === "report" ? "Create Daily Report" : "Create Task";
  useEffect(() => {
    const controller = new AbortController();
    projectApi.getProjects({ search: query, page, page_size: 20 }, controller.signal).then((data) => {
      if (Array.isArray(data)) data = { results: data.slice((page - 1) * 20, page * 20), next: page * 20 < data.length, previous: page > 1 };
      if (!Array.isArray(data?.results)) throw new Error("Unexpected project response.");
      if (!controller.signal.aborted) setResult({ key, data: { ...data, results: data.results.filter((project) => ["ACTIVE", "MAINTENANCE"].includes(project.status)) } });
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ key, error: validationMessage(error, "Unable to load assigned projects.") });
    });
    return () => controller.abort();
  }, [key, query, page]);
  function proceed(event) {
    event.preventDefault();
    if (!selected || !current?.data || navigating.current || !["ACTIVE", "MAINTENANCE"].includes(selected.status)) return;
    navigating.current = true;
    const section = action === "report" ? "daily-reports" : "tasks";
    navigate(`/supervisor/projects/${encodeURIComponent(selected.id)}/${section}?create=true`);
    onClose();
  }
  return <ApprovalModal label={`${title}: choose project`} onClose={onClose}>
    <form onSubmit={proceed} className="space-y-5 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{title}</h2><p className="mt-2 text-sm text-muted">Choose an assigned Active or Maintenance project.</p></div><button type="button" onClick={onClose} aria-label="Close project selector" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app focus-visible:outline-2 focus-visible:outline-ink"><X size={20} /></button></div>
      <ProjectSearch query={query} onSearch={(value) => { setQuery(value); setPage(1); }} label="Search assigned projects" />
      {!current && <p role="status" className="text-sm text-muted">Loading assigned projects...</p>}
      {current?.error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{current.error} <button type="button" onClick={() => setRevision((value) => value + 1)} className="min-h-11 px-3 font-semibold underline">Retry</button></div>}
      {current?.data && <>
        <fieldset className="max-h-[35dvh] space-y-2 overflow-y-auto"><legend className="mb-2 text-sm font-semibold">Project</legend>
          {current.data.results.map((project) => <label key={project.id} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 ${selected?.id === project.id ? "border-ink bg-app" : "border-border bg-surface"}`}>
            <input type="radio" name="quick-action-project" value={project.id} checked={selected?.id === project.id} onChange={() => setSelected(project)} className="mt-1 accent-ink" /><span className="min-w-0"><strong className="block break-words text-sm">{project.name}</strong><span className="mt-1 block text-xs text-muted">{project.status === "ACTIVE" ? "Active" : "Maintenance"}</span></span>
          </label>)}
          {!current.data.results.length && <p role="status" className="py-4 text-sm text-muted">No eligible projects on this page. {current.data.next || current.data.previous ? "Try another page or search by project name." : "Try another search, or contact Admin about your project assignments."}</p>}
        </fieldset>
        {(current.data.next || current.data.previous) && <nav aria-label="Assigned project pages" className="rare-pagination"><button type="button" className="rare-button rare-button-secondary" disabled={!current.data.previous} onClick={() => setPage((value) => value - 1)}>Previous</button><span aria-live="polite" aria-atomic="true" className="text-xs text-muted">Page {page}</span><button type="button" className="rare-button rare-button-secondary" disabled={!current.data.next} onClick={() => setPage((value) => value + 1)}>Next</button></nav>}
      </>}
      {selected && <p role="status" className="break-words rounded-xl bg-pastel-mint p-3 text-sm text-success">Selected: <strong>{selected.name}</strong> / {selected.status === "ACTIVE" ? "Active" : "Maintenance"}</p>}
      <div className="rare-action-footer flex flex-wrap justify-end gap-3"><button type="button" onClick={onClose} className="rare-button rare-button-secondary">Cancel</button><button type="submit" disabled={!selected || !current || Boolean(current.error)} className="rare-button rare-button-primary">Continue<ArrowRight size={18} aria-hidden="true" /></button></div>
    </form>
  </ApprovalModal>;
}

