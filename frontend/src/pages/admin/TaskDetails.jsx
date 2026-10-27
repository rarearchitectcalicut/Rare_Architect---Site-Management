import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CalendarDays, Layers3, RefreshCw, Ruler, UserRound } from "lucide-react";
import { isTaskId, loadTaskPages, taskApi } from "../../api/taskApi";
import { timelineApi } from "../../api/timelineApi";
import { approvalApi } from "../../api/approvalApi";
import { dailyReportApi } from "../../api/dailyReportApi";
import { delayApi } from "../../api/delayApi";
import LoadingScreen from "../../components/LoadingScreen";
import TaskExecutionActions, { TaskProgress } from "../../components/tasks/TaskExecutionActions";
import AdminTaskSections from "../../components/admin/tasks/AdminTaskSections";
import { TaskBadges, TaskPageStyles } from "../../components/admin/tasks/AdminTaskCard";
import { formatDate, formatText, getError } from "../../components/approvals/approvalUtils";

function taskSectionLoaders(task, signal) {
    const related = (record) => record.task === task.id && record.project_id === task.project;
    const all = (fetchPage) => loadTaskPages(fetchPage, signal);
    return {
        timeline: async () => {
            const data = await timelineApi.getTimeline(task.project, {}, signal);
            if (data.project_id !== task.project || !Array.isArray(data.tasks) || data.tasks.some((item) => item.project !== task.project)) throw new Error("Unexpected project timeline response.");
            return data;
        },
        documents: () => all((params) => taskApi.documents(task.id, params, signal)),
        history: async () => (await all((params) => taskApi.history(task.id, params, signal)))
            .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id)),
        progress: async () => {
            const data = await dailyReportApi.progress(task.id);
            if (data.task_id !== task.id || data.project_id !== task.project) throw new Error("Unexpected task progress response.");
            return data;
        },
        entries: async () => (await all((params) => dailyReportApi.workQueue({ ...params, project: task.project }))).filter(related),
        changes: async () => (await all((params) => approvalApi.getChangeRequests(params))).filter(related),
        orders: async () => (await all((params) => timelineApi.getChangeRequests({ ...params, status: "PENDING" }, signal)))
            .filter((record) => record.project_id === task.project && [record.old_values?.timeline, record.new_values?.timeline]
                .some((snapshot) => Array.isArray(snapshot) && snapshot.some((item) => item.task_id === task.id))),
        delays: async () => (await all((params) => delayApi.list({ ...params, task: task.id }))).filter(related),
    };
}

const sectionResources = { overview: [], timeline: ["timeline"], documents: ["documents"], work: ["progress", "entries"], changes: ["changes", "orders", "delays"], history: ["history"] };

function TaskWorkspace({ task }) {
    const [tab, setTab] = useState("overview");
    const [resources, setResources] = useState({});
    const [retry, setRetry] = useState(0);
    const [downloading, setDownloading] = useState(null);
    const [downloadError, setDownloadError] = useState("");
    const scope = `${tab}:${retry}`;
    const request = useRef(null);
    const versionRequests = useRef(new Set());
    const downloadBusy = useRef(false);
    const mounted = useRef(false);

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        request.current = controller;
        versionRequests.current.clear();
        const loaders = taskSectionLoaders(task, controller.signal);
        async function load(name) {
            let resource;
            try { resource = { data: await loaders[name]() }; }
            catch (err) { resource = { error: getError(err, err.message || "Unable to load this section.") }; }
            if (!controller.signal.aborted) {
                setResources((current) => ({ ...(current.scope === scope ? current : { scope }), [name]: resource }));
            }
        }
        sectionResources[tab].forEach(load);
        return () => controller.abort();
    }, [task, tab, scope]);

    async function versions(documentId) {
        const controller = request.current;
        if (!controller || controller.signal.aborted || versionRequests.current.has(documentId)) return;
        versionRequests.current.add(documentId);
        const name = `versions:${documentId}`;
        setResources((current) => ({ ...current, [name]: { loading: true } }));
        try {
            const data = await loadTaskPages((params) => taskApi.documentVersions(documentId, params, controller.signal), controller.signal);
            if (!controller.signal.aborted) setResources((current) => ({ ...current, [name]: { data } }));
        } catch (err) {
            if (!controller.signal.aborted) setResources((current) => ({ ...current, [name]: { error: getError(err, "Unable to load document versions.") } }));
        } finally {
            if (request.current === controller) versionRequests.current.delete(documentId);
        }
    }

    async function download(version) {
        if (downloadBusy.current) return;
        downloadBusy.current = true;
        setDownloading(version.id); setDownloadError("");
        try {
            const blob = await taskApi.downloadDocumentVersion(version.id);
            if (!mounted.current) return;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = (version.original_filename || "task-document").replace(/[\\/]/g, "_");
            document.body.appendChild(anchor); anchor.click(); anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            if (mounted.current) setDownloadError(getError(err, "Download failed. Please try again."));
        } finally {
            downloadBusy.current = false;
            if (mounted.current) setDownloading(null);
        }
    }

    return <AdminTaskSections task={task} tab={tab} onTabChange={setTab} resources={resources.scope === scope ? resources : {}}
        onRetry={(name) => name.startsWith("versions:") ? versions(name.slice(9)) : setRetry((value) => value + 1)}
        onVersions={versions} onDownload={download} downloading={downloading} downloadError={downloadError} />;
}

export default function AdminTaskDetails() {
    const { projectId, taskId } = useParams();
    return <TaskDetailsPage key={`${projectId}:${taskId}`} projectId={projectId?.toLowerCase()} taskId={taskId?.toLowerCase()} />;
}

function TaskDetailsPage({ projectId, taskId }) {
    const [task, setTask] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const [notice, setNotice] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoading(true); setError(""); setTask(null);
            try {
                if (!isTaskId(projectId) || !isTaskId(taskId)) throw new Error("Invalid project or task ID.");
                const data = await taskApi.get(taskId, controller.signal);
                if (data.id !== taskId || data.project !== projectId) throw new Error("This task does not belong to the project in this URL.");
                if (!controller.signal.aborted) setTask(data);
            } catch (err) {
                if (!controller.signal.aborted) setError(getError(err, err.message || "Unable to load task details."));
            } finally { if (!controller.signal.aborted) setLoading(false); }
        }
        load();
        return () => controller.abort();
    }, [projectId, taskId, revision]);

    return <div className="rare-tasks mx-auto min-w-0 max-w-[1600px] space-y-6 pb-8 text-[#211E1A] sm:space-y-7">
        <TaskPageStyles />
        {loading && <LoadingScreen message="Loading task details..." />}
        <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-[#716658]"><Link to="/admin/projects">Projects</Link><span aria-hidden="true">/</span><Link to={`/admin/projects/${projectId}`}>Project Overview</Link><span aria-hidden="true">/</span><Link to={`/admin/projects/${projectId}/tasks`}>Tasks</Link><span aria-hidden="true">/</span><span aria-current="page">Details</span></nav>
        <div className="flex flex-wrap items-center justify-between gap-3"><Link to={`/admin/projects/${projectId}/tasks`} className="task-secondary inline-flex items-center gap-2 px-4 py-3 text-xs font-semibold text-[#665C50]"><ArrowLeft size={15} aria-hidden="true" />Back to Tasks</Link><button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)} className="task-secondary flex items-center gap-2 px-4 py-3 text-xs font-semibold text-[#665C50] disabled:opacity-50"><RefreshCw size={15} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" />Refresh</button></div>
        {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error} Use Refresh to retry.</p>}
        {notice && <p role="status" className="rounded-2xl border border-[#D6E5D8] bg-[#E7F2E8] p-4 text-sm text-[#296F40]">{notice}</p>}
        {task && <>
            <header className="rare-page-header task-enter overflow-hidden rounded-[28px] border border-[#E7DED2] bg-[#FFFDFA] shadow-[0_8px_32px_#422F1608]">
                <div className="task-hero rounded-xl p-4 text-[#211E1A] sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#716658]"><Layers3 size={14} className="shrink-0" aria-hidden="true" /><span className="break-words">{task.project_name}</span></p>
                        <span className="rounded-full border border-[#887258]/50 bg-[#F1EADF] px-3 py-1.5 text-xs text-[#716658]">Task order {task.display_order ?? "Not assigned"}</span>
                    </div>
                    <h1 className="mt-5 max-w-4xl break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{task.title}</h1>
                    <p className="mt-3 text-sm text-[#716658]">Task details, verified work and the complete decision trail.</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EEE6DC] px-5 py-5 sm:px-8">
                    <TaskBadges task={task} />
                    {task.approval_status === "PENDING" && <Link to={`/admin/approvals?tab=tasks&task=${task.id}&type=tasks`} className="task-primary inline-flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold">Open in Approval Center<ArrowUpRight size={15} aria-hidden="true" /></Link>}
                </div>
                <dl className="grid gap-5 p-5 sm:grid-cols-2 sm:p-8 xl:grid-cols-4">
                    {[
                        ["Assigned team", task.worker_name || "Not assigned", UserRound],
                        ["Planned start", formatDate(task.start_date), CalendarDays],
                        ["Planned end", formatDate(task.end_date), CalendarDays],
                        ["Measurement", formatText(task.measurement_method), Ruler],
                    ].map(([label, value, Icon]) => <div key={label} className="flex min-w-0 gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5F0E8] text-[#A38D72]"><Icon size={17} aria-hidden="true" /></span>
                        <div className="min-w-0"><dt className="text-xs text-[#716658]">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-[#3E352B]">{value}</dd></div>
                    </div>)}
                </dl>
            </header>
            <TaskProgress progress={task.progress} />
            <TaskExecutionActions key={task.id} role="ADMIN" task={task} onSuccess={() => { setNotice("Task reopened successfully."); setRevision((value) => value + 1); }} />
            <TaskWorkspace key={`${task.id}:${revision}`} task={task} />
        </>}
    </div>;
}
