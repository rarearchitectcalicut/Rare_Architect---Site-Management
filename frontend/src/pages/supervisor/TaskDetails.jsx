import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { projectApi } from "../../api/projectApi";
import { isTaskId, taskApi, taskScheduleErrors } from "../../api/taskApi";
import LoadingScreen from "../../components/LoadingScreen";
import SupervisorTaskContent, { SupervisorTaskEditAction } from "../../components/tasks/SupervisorTaskContent";
import { TaskPageStyles } from "../../components/admin/tasks/AdminTaskCard";
import TaskForm from "../../modal/supervisor/TaskForm";
import DelayReportForm from "../../modal/supervisor/DelayReportForm";
import { getError } from "../../components/approvals/approvalUtils";

export default function SupervisorTaskDetails() {
    const { projectId, taskId } = useParams();
    return <TaskDetailsPage key={`${projectId}:${taskId}`} projectId={projectId?.toLowerCase()} taskId={taskId?.toLowerCase()} />;
}

function TaskDetailsPage({ projectId, taskId }) {
    const [record, setRecord] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const [editing, setEditing] = useState(false);
    const [reportingDelay, setReportingDelay] = useState(false);
    const [notice, setNotice] = useState("");
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoading(true); setError(""); setRecord(null);
            try {
                if (!isTaskId(projectId) || !isTaskId(taskId)) throw new Error("This project or task link is invalid.");
                const [task, project] = await Promise.all([taskApi.get(taskId, controller.signal), projectApi.getProjectOverview(projectId)]);
                if (task.id !== taskId || task.project !== projectId || project.id !== projectId) throw new Error("This task does not belong to the project in this URL.");
                if (!controller.signal.aborted) setRecord({ task, project });
            } catch (failure) {
                if (!controller.signal.aborted) setError(getError(failure, failure.message || "Unable to load task details."));
            } finally { if (!controller.signal.aborted) setLoading(false); }
        }
        void load();
        return () => controller.abort();
    }, [projectId, taskId, revision]);

    function refresh(message) {
        if (message) setNotice(message);
        setRevision((value) => value + 1);
    }
    const task = record?.task;
    const project = record?.project;
    const canReportDelay = task?.approval_status === "APPROVED" && !["COMPLETED", "CANCELLED"].includes(task.work_status) && ["ACTIVE", "MAINTENANCE"].includes(project?.status);

    return <div className="supervisor-task-details-page rare-tasks mx-auto w-full min-w-0 max-w-[1200px] space-y-4 pb-8 text-ink">
        <TaskPageStyles />
        {loading && <LoadingScreen message="Loading task details..." />}
        <div className="flex items-center justify-between gap-3">
            <Link to={`/supervisor/projects/${projectId}/tasks`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted"><ArrowLeft size={16} aria-hidden="true" />Back to tasks</Link>
            <button type="button" aria-label="Refresh task details" disabled={loading} onClick={() => refresh()} className="rare-button rare-button-secondary min-h-11 min-w-11"><RefreshCw size={16} className={loading ? "motion-safe:animate-spin" : ""} aria-hidden="true" /></button>
        </div>
        {error && <div role="alert" className="rounded-2xl border border-border bg-pastel-blush p-5 text-sm text-danger">{error}<button type="button" className="ml-3 min-h-11 underline" onClick={() => refresh()}>Try again</button></div>}
        {notice && <p role="status" className="rounded-xl bg-pastel-mint p-4 text-sm text-success">{notice}</p>}
        {record && <>
            <header className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><Link to={`/supervisor/projects/${projectId}`} className="inline-flex min-h-11 items-center text-xs font-semibold text-muted">{project.name || task.project_name}</Link><SupervisorTaskEditAction task={task} onEdit={() => setEditing(true)} /></div>
                <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{task.title}</h1>
                <p className="mt-2 text-sm text-muted">Task details, verified work and Admin decisions.</p>
            </header>
            {Object.keys(taskScheduleErrors(task, project)).length > 0 && <p role="status" className="rounded-xl border border-border bg-app p-4 text-sm text-muted">Task dates conflict with the current project schedule. Review the project dates before requesting scheduling changes. Deadline extensions still need separate approval.</p>}
            <SupervisorTaskContent key={`${task.id}:${revision}`} task={task}
                onStatusChanged={(action) => refresh(({ start: "Task started successfully.", complete: "Task completed successfully.", cancel: "Cancellation request submitted for Admin approval." })[action] || "Task updated successfully.")}
                canReportDelay={canReportDelay} onReportDelay={() => setReportingDelay(true)} />
            <TaskForm open={editing} projectId={projectId} project={project} task={task} onClose={() => setEditing(false)} onSaved={() => {
                setEditing(false);
                refresh(task.approval_status === "REJECTED" ? "Task corrected and resubmitted for approval." : task.approval_status === "APPROVED" ? "Task change request submitted for approval." : "Task updated successfully.");
            }} />
            {reportingDelay && <DelayReportForm projectId={projectId} taskId={task.id} onClose={() => setReportingDelay(false)} onSaved={() => { setReportingDelay(false); refresh("Delay report submitted for Admin review."); }} />}
        </>}
    </div>;
}
