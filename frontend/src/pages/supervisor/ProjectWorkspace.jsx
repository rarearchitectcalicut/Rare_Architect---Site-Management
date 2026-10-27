
import { useEffect, useMemo, useRef, useState } from "react";
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
import { projectApi, projectDocumentFiles } from "../../api/projectApi";
import LoadingScreen from "../../components/LoadingScreen";

import ApprovalModal from "../../components/approvals/ApprovalModal";
import ReportEvidence from "../../components/daily-reports/ReportEvidence";
import { validationMessage } from "../../hooks/useApprovalReview";
import { formatDateTime, formatText } from "../../components/approvals/approvalUtils";

const documentControl = "mt-2 w-full min-w-0 rounded-xl border border-[#E7DED2] bg-[#FFFDFA] px-3 py-3 text-sm text-[#211E1A]";
const documentButton = "rounded-xl border border-[#E7DED2] bg-[#FFFDFA] px-4 py-3 text-sm font-semibold text-[#211E1A] hover:bg-[#F1EADF] disabled:opacity-40";

function documentSize(size) {
    if (typeof size !== "number" || !Number.isFinite(size) || size < 0) return "Size unavailable";
    return size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / (1024 * 1024)).toFixed(2)} MiB`;
}

function DocumentFieldError({ errors, name }) {
    const value = errors[name];
    const text = Array.isArray(value) ? value.filter((item) => typeof item === "string").join(" ") : typeof value === "string" ? value : "";
    return text ? <span id={`document-${name}-error`} role="alert" className="mt-2 block text-xs text-red-700">{text}</span> : null;
}

function ProjectDocumentUpload({ projectId, documentRecord, rules, onClose, onSaved }) {
    const [form, setForm] = useState({ title: "", description: "", document_type: rules?.document_types?.[0]?.value || "" });
    const [file, setFile] = useState(null);
    const [errors, setErrors] = useState({});
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const inFlight = useRef(false);
    const fileRef = useRef(null);
    const version = Boolean(documentRecord);
    const field = (name) => ({ "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `document-${name}-error` : undefined });
    async function submit(event) {
        event.preventDefault();
        if (inFlight.current) return;
        const invalid = {};
        if (!version && (!form.title.trim() || form.title.trim().length > 200)) invalid.title = "Provide a title of up to 200 characters.";
        if (!version && !rules?.document_types?.some((item) => item.value === form.document_type)) invalid.document_type = "Choose a supported document type.";
        if (!file) invalid.file = "Choose a file.";
        else if (!file.size || file.size > rules?.max_file_size || !rules?.allowed_extensions?.some((extension) => file.name.toLowerCase().endsWith(extension))) invalid.file = "Choose a supported, nonempty file within the displayed size limit.";
        if (Object.keys(invalid).length) { setErrors(invalid); return; }
        inFlight.current = true; setBusy(true); setError(""); setErrors({});
        try {
            const payload = new FormData();
            payload.append("file", file);
            if (version) await projectApi.newDocumentVersion(documentRecord.id, payload);
            else {
                payload.append("title", form.title.trim()); payload.append("description", form.description.trim()); payload.append("document_type", form.document_type);
                await projectApi.createDocument(projectId, payload);
            }
            if (fileRef.current) fileRef.current.value = "";
            setFile(null); onSaved();
        } catch (failure) {
            const data = failure?.response?.data;
            setErrors(data && typeof data === "object" ? data : {});
            setError(validationMessage(failure, "Upload failed. Your existing versions remain available."));
        } finally { inFlight.current = false; setBusy(false); }
    }
    function close() { if (!inFlight.current) onClose(); }
    return <ApprovalModal label={version ? "Upload new project document version" : "Upload project document"} onClose={close} busy={busy ? "Uploading document..." : ""} error={error}>
        <form onSubmit={submit} className="space-y-5 p-5 sm:p-7">
            <div className="flex items-start justify-between gap-3"><h2 className="text-xl font-bold">{version ? `New version / ${documentRecord.title}` : "Upload project document"}</h2><button type="button" aria-label="Close upload" disabled={busy} onClick={close} className={documentButton}>Close</button></div>
            <fieldset disabled={busy} className="min-w-0 space-y-4">
                {!version && <>
                    <label className="block text-sm font-semibold">Title *<input {...field("title")} autoFocus required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={documentControl} /><DocumentFieldError errors={errors} name="title" /></label>
                    <label className="block text-sm font-semibold">Description<textarea {...field("description")} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={documentControl} /><DocumentFieldError errors={errors} name="description" /></label>
                    <label className="block text-sm font-semibold">Document type *<select {...field("document_type")} required value={form.document_type} onChange={(event) => setForm({ ...form, document_type: event.target.value })} className={documentControl}>{rules?.document_types?.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><DocumentFieldError errors={errors} name="document_type" /></label>
                </>}
                <label className="block text-sm font-semibold">File *<input {...field("file")} ref={fileRef} type="file" required accept={rules?.allowed_extensions?.join(",")} onChange={(event) => { setFile(event.target.files?.[0] || null); setErrors({}); }} className={documentControl} /><DocumentFieldError errors={errors} name="file" /></label>
                {file && <p className="break-all text-sm text-[#817669]">{file.name} / {documentSize(file.size)}</p>}
                <p className="break-words text-xs text-[#817669]">Allowed formats: {rules?.allowed_extensions?.join(", ") || "Unavailable"}. Maximum: {documentSize(rules?.max_file_size)}.</p>
                {version && <p className="text-xs text-[#817669]">The server assigns the next version number. Previous versions remain available.</p>}
                <div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={close} className={documentButton}>Cancel</button><button type="submit" disabled={!rules || !file} className="rounded-xl bg-[#211E1A] px-4 py-3 text-sm font-semibold text-[#FFFDFA] hover:bg-[#817669] disabled:opacity-40">{version ? "Upload version" : "Upload document"}</button></div>
            </fieldset>
        </form>
    </ApprovalModal>;
}

function ProjectDocumentHistory({ documentRecord, onClose, revision }) {
    const [page, setPage] = useState(1);
    const [retry, setRetry] = useState(0);
    const [state, setState] = useState({ key: "", versions: [], count: 0, error: "" });
    const key = `${documentRecord.id}:${page}:${revision}:${retry}`;
    useEffect(() => {
        const controller = new AbortController();
        projectApi.documentVersions(documentRecord.id, { page, page_size: 8 }, controller.signal).then((data) => {
            if (!Array.isArray(data.results) || !Number.isInteger(data.count)) throw new Error("Unexpected version history response.");
            if (!controller.signal.aborted) setState({ key, versions: data.results, count: data.count, error: "" });
        }).catch((failure) => { if (!controller.signal.aborted) setState({ key, versions: [], count: 0, error: validationMessage(failure, "Unable to load versions.") }); });
        return () => controller.abort();
    }, [documentRecord.id, page, revision, retry, key]);
    const loading = state.key !== key;
    return <ApprovalModal label="Project document version history" onClose={onClose} error={loading ? "" : state.error}>
        <div className="space-y-5 p-5 sm:p-7"><div className="flex flex-wrap justify-between gap-3"><h2 className="break-words text-xl font-bold">Version history / {documentRecord.title}</h2><button type="button" onClick={onClose} className={documentButton}>Close</button></div>
            {loading ? <p role="status">Loading versions...</p> : state.error ? <button type="button" onClick={() => setRetry((value) => value + 1)} className={documentButton}>Retry</button> : <>
                {state.versions.map((version) => <article key={version.id} className="space-y-3 rounded-2xl border border-[#E7DED2] p-4"><h3 className="font-bold">Version {version.version_number} / {version.is_current ? "Current" : "Previous"}</h3><p className="break-words text-xs text-[#817669]">{documentSize(version.file_size)} / {version.uploaded_by_name || "Uploader unavailable"} / {formatDateTime(version.created_at)}</p><ReportEvidence title="Stored file" files={[version]} fileApi={projectDocumentFiles} /></article>)}
                {!state.count && <p>No stored versions available.</p>}
                {state.count > 8 && <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className={documentButton}>Previous versions</button><span className="text-xs">{page} / {Math.ceil(state.count / 8)}</span><button type="button" disabled={page * 8 >= state.count} onClick={() => setPage(page + 1)} className={documentButton}>Next versions</button></div>}
            </>}
        </div>
    </ApprovalModal>;
}

export function ProjectDocuments({ role = "SUPERVISOR" }) {
    const { projectId } = useParams();
    return <ProjectDocumentLibrary key={`${role}:${projectId}`} projectId={projectId} role={role} />;
}

function ProjectDocumentLibrary({ role = "SUPERVISOR", projectId }) {
    const [search, setSearch] = useState("");
    const [type, setType] = useState("");
    const [sort, setSort] = useState("newest");
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [state, setState] = useState({ key: "", documents: [], count: 0, rules: null, error: "" });
    const [projectState, setProjectState] = useState({ id: "", project: null, error: "" });
    const [upload, setUpload] = useState(null);
    const [history, setHistory] = useState(null);
    const [notice, setNotice] = useState("");
    const admin = role === "ADMIN";
    const key = `${projectId}:${search}:${type}:${sort}:${page}:${revision}`;
    useEffect(() => {
        const controller = new AbortController();
        projectApi.documents(projectId, { ...(search.trim() ? { search: search.trim() } : {}), ...(type ? { document_type: type } : {}), sort, page, page_size: 8 }, controller.signal).then((data) => {
            if (!Array.isArray(data.results) || !Number.isInteger(data.count)) throw new Error("Unexpected document library response.");
            if (!controller.signal.aborted) setState({ key, documents: data.results, count: data.count, rules: data.upload_rules, error: "" });
        }).catch((failure) => { if (!controller.signal.aborted) setState({ key, documents: [], count: 0, rules: null, error: validationMessage(failure, "Unable to load project documents.") }); });
        return () => controller.abort();
    }, [projectId, search, type, sort, page, revision, key]);
    useEffect(() => {
        let cancelled = false;
        projectApi.getProject(projectId).then((project) => { if (!cancelled) setProjectState({ id: projectId, project, error: "" }); }).catch((failure) => { if (!cancelled) setProjectState({ id: projectId, project: null, error: validationMessage(failure, "Unable to load project details.") }); });
        return () => { cancelled = true; };
    }, [projectId, revision]);
    const loading = state.key !== key;
    const documents = loading ? [] : state.documents;
    const rules = loading ? null : state.rules;
    const error = !loading && state.error || projectState.id === projectId && projectState.error;
    function refresh() { setRevision((value) => value + 1); }
    function saved() { setUpload(null); setPage(1); setNotice("Document uploaded successfully. Previous versions are retained."); refresh(); }
    return <div className="space-y-6 pb-8 text-[#211E1A]">
        {!state.key && <LoadingScreen message="Loading project documents..." />}
        <header className="space-y-4 rounded-[26px] border border-[#E7DED2] bg-[#FFFDFA] p-5 sm:p-7"><Link to={`/${admin ? "admin" : "supervisor"}/projects/${projectId}`} className="text-sm text-[#817669]">Back to project</Link><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs text-[#817669]">{projectState.id === projectId ? projectState.project?.name : "Project"}</p><h1 className="mt-2 flex items-center gap-2 text-2xl font-bold"><FileText size={24} />Project Documents</h1><p className="mt-2 text-sm text-[#817669]">Versioned drawings and project records. {admin ? "Manage files and retain their history." : "Read-only access to your assigned project."}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={loading} onClick={refresh} className={documentButton}><RefreshCw size={16} className="mr-2 inline" />Refresh</button>{admin && <button type="button" disabled={loading || !rules || Boolean(error)} onClick={() => setUpload({})} className={documentButton}>Upload document</button>}</div></div></header>
        {notice && <p role="status" className="rounded-xl bg-[#E7F2E8] p-4 text-sm text-[#296F40]">{notice}</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
        <section aria-label="Document filters" className="grid gap-4 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-[#817669]">Search documents<input type="search" maxLength={200} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={documentControl} placeholder="Title, description, type or filename" /></label>
            <label className="text-xs font-semibold text-[#817669]">Document type<select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className={documentControl}><option value="">All types</option>{(state.rules?.document_types || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="text-xs font-semibold text-[#817669]">Sort documents<select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} className={documentControl}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">Title A-Z</option><option value="updated">Recently updated</option></select></label>
            <button type="button" onClick={() => { setSearch(""); setType(""); setSort("newest"); setPage(1); }} className={`${documentButton} self-end`}>Clear filters</button>
        </section>
        {loading ? <p role="status" className="text-sm text-[#817669]">Loading documents...</p> : !error && <><p className="text-xs text-[#817669]">{state.count} matching documents</p><div className="grid items-start gap-4 lg:grid-cols-2">{documents.map((documentRecord) => <article key={documentRecord.id} className="min-w-0 space-y-4 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-5">
            <div><p className="text-xs font-semibold text-[#817669]">{formatText(documentRecord.document_type)}</p><h2 className="mt-2 break-words text-lg font-bold">{documentRecord.title}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#817669]">{documentRecord.description || "No description provided."}</p></div>
            <p className="break-words text-xs leading-5 text-[#817669]">Current version: {documentRecord.current_version?.version_number ?? "Unavailable"} / {documentSize(documentRecord.current_version?.file_size)}<br />Uploaded by {documentRecord.current_version?.uploaded_by_name || documentRecord.uploaded_by_name || "Unavailable"}<br />Updated {formatDateTime(documentRecord.updated_at)}</p>
            {documentRecord.current_version ? <ReportEvidence title="Current file" files={[documentRecord.current_version]} fileApi={projectDocumentFiles} /> : <p className="text-sm text-[#817669]">No current file is available.</p>}
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setHistory(documentRecord)} className={documentButton}>Version history</button>{admin && <button type="button" disabled={!rules} onClick={() => setUpload(documentRecord)} className={documentButton}>New version</button>}</div>
        </article>)}</div>{!state.count && <p className="rounded-2xl border border-dashed border-[#E7DED2] bg-[#FFFDFA] p-8 text-center text-sm text-[#817669]">No project documents match these filters.</p>}
        {state.count > 8 && <nav aria-label="Document pages" className="flex flex-wrap items-center justify-between gap-3"><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} className={documentButton}>Previous</button><span className="text-xs">{page} / {Math.ceil(state.count / 8)}</span><button type="button" disabled={page * 8 >= state.count} onClick={() => setPage(page + 1)} className={documentButton}>Next</button></nav>}</>}
        {history && <ProjectDocumentHistory key={`${history.id}:${revision}`} documentRecord={history} revision={revision} onClose={() => setHistory(null)} />}
        {upload && admin && <ProjectDocumentUpload key={`${projectId}:${upload.id || "new"}`} projectId={projectId} documentRecord={upload.id ? upload : null} rules={state.rules} onClose={() => setUpload(null)} onSaved={saved} />}
    </div>;
}

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
