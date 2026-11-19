import { useEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import LoadingScreen from "../../components/LoadingScreen";
import { delayTypes } from "../../components/approvals/queueData";
import { formatText } from "../../components/approvals/approvalUtils";
import { validationMessage } from "../../hooks/useApprovalReview";
import { useModalScrollLock } from "../../hooks/useModalScrollLock";
import { delayApi } from "../../api/delayApi";
import { projectApi } from "../../api/projectApi";
import { taskApi } from "../../api/taskApi";

const input = "w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink outline-none transition-all focus:border-border-strong focus:ring-4 focus:ring-pastel-lavender/50";
const initial = { task: "", delay_type: "MATERIAL_DELAY", reason: "", description: "", expected_completion_date: "", extension_requested: false, requested_end_date: "" };
const LAST_PROJECT_KEY = "rare.delayReport.lastProject";
const PAGE_SIZE = 20;

function localDate(date = new Date()) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function addDays(value, days) {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function dayAfter(value) {
    return value ? addDays(value, 1) : undefined;
}

function readLastProject() {
    try {
        return window.localStorage.getItem(LAST_PROJECT_KEY) || "";
    } catch {
        return "";
    }
}

function writeLastProject(value) {
    try {
        window.localStorage.setItem(LAST_PROJECT_KEY, value);
    } catch {
        // The form remains usable when browser storage is unavailable.
    }
}

async function loadProjects(signal) {
    const projects = [];
    for (let page = 1; page <= 100; page += 1) {
        const response = await projectApi.getProjects({ page, page_size: 100 }, signal);
        if (signal.aborted) return null;
        const rows = Array.isArray(response) ? response : response?.results;
        if (!Array.isArray(rows)) throw new Error("Unexpected project list response.");
        projects.push(...rows.filter((project) => ["ACTIVE", "MAINTENANCE"].includes(project.status)));
        if (Array.isArray(response) || !response.next) return projects;
        if (!rows.length) throw new Error("An empty project page interrupted loading.");
    }
    throw new Error("Too many project pages to load safely.");
}

function projectIdOf(task) {
    return String(task?.project_id || task?.project?.id || task?.project || "");
}

function taskIsEligible(task, projectId) {
    return task?.approval_status === "APPROVED" &&
        !["COMPLETED", "CANCELLED"].includes(task.work_status) &&
        projectIdOf(task) === String(projectId);
}

function FieldError({ errors, name }) {
    const values = errors[name];
    const text = Array.isArray(values) ? values.filter((value) => typeof value === "string").join(" ") : typeof values === "string" ? values : "";
    return text ? <span id={`delay-${name}-error`} role="status" aria-live="polite" className="mt-1 block text-xs text-danger">{text}</span> : null;
}

export default function DelayReportForm({ projectId, taskId, onClose, onSaved }) {
    const [form, setForm] = useState(() => ({ ...initial, task: taskId ? String(taskId) : "" }));
    const [selectedProjectId, setSelectedProjectId] = useState(projectId ? String(projectId) : "");
    const [selectedTask, setSelectedTask] = useState(null);
    const [projectsState, setProjectsState] = useState({ key: -1, projects: [], error: "" });
    const [projectRevision, setProjectRevision] = useState(0);
    const [taskPage, setTaskPage] = useState(1);
    const [taskRevision, setTaskRevision] = useState(0);
    const [taskState, setTaskState] = useState({ key: "", tasks: [], count: 0, next: false, error: "" });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [errors, setErrors] = useState({});
    const [dialog, setDialog] = useState(null);
    const inFlight = useRef(false);
    const prefillLoaded = useRef(false);
    const projectDefaulted = useRef(false);
    const extensionDateEdited = useRef(false);
    const fieldRefs = useRef({});
    const today = localDate();
    useModalScrollLock();
    useEffect(() => {
        if (!dialog) return;
        dialog.showModal();
        return () => dialog.close();
    }, [dialog]);
    const projectsLoading = projectsState.key !== projectRevision;
    const projects = projectsState.projects;
    const selectedProject = projects.find((project) => String(project.id) === selectedProjectId);
    const taskKey = `${selectedProjectId}:${taskPage}:${taskRevision}`;
    const tasksCurrent = taskState.key === taskKey;
    const tasks = tasksCurrent ? taskState.tasks : [];
    const taskCount = tasksCurrent ? taskState.count : 0;
    const taskError = tasksCurrent ? taskState.error : "";
    const taskLoading = Boolean(selectedProjectId) && !tasksCurrent;
    const taskOptions = selectedTask && !tasks.some((task) => String(task.id) === String(selectedTask.id))
        ? [selectedTask, ...tasks]
        : tasks;
    const task = selectedTask || taskOptions.find((item) => String(item.id) === form.task) || null;

    useEffect(() => {
        const controller = new AbortController();
        projectApiLoad();
        async function projectApiLoad() {
            try {
                const loaded = await loadProjects(controller.signal);
                if (!controller.signal.aborted && loaded) {
                    setProjectsState({ key: projectRevision, projects: loaded, error: "" });
                }
            } catch (failure) {
                if (!controller.signal.aborted) {
                    setProjectsState({ key: projectRevision, projects: [], error: validationMessage(failure, "Unable to load assigned projects.") });
                }
            }
        }
        return () => controller.abort();
    }, [projectRevision]);

    useEffect(() => {
        if (projectsState.key !== projectRevision || !projects.length || projectDefaulted.current) return;
        projectDefaulted.current = true;
        const lastUsed = readLastProject();
        const preferred = projectId && projects.some((project) => String(project.id) === String(projectId))
            ? String(projectId)
            : projects.length === 1
                ? String(projects[0].id)
                : projects.some((project) => String(project.id) === selectedProjectId)
                    ? selectedProjectId
                    : projects.some((project) => String(project.id) === lastUsed) ? lastUsed : "";
        setSelectedProjectId(preferred);
        if (preferred) writeLastProject(preferred);
    }, [projectId, projectRevision, projectsState, projects, selectedProjectId]);

    useEffect(() => {
        if (!selectedProjectId) return undefined;
        const controller = new AbortController();
        async function loadEligibleTasks() {
            try {
                const response = await taskApi.register({
                    project: selectedProjectId,
                    delay_eligible: true,
                    search: "",
                    page: taskPage,
                    page_size: PAGE_SIZE,
                }, controller.signal);
                if (controller.signal.aborted) return;
                const rows = Array.isArray(response) ? response : response?.results;
                if (!Array.isArray(rows)) throw new Error("Unexpected eligible task response.");
                const eligible = rows.filter((item) => taskIsEligible(item, selectedProjectId));
                setTaskState({ key: taskKey, tasks: eligible, count: Number.isInteger(response.count) ? response.count : eligible.length, next: Boolean(response.next), error: "" });
            } catch (failure) {
                if (!controller.signal.aborted) setTaskState({ key: taskKey, tasks: [], count: 0, next: false, error: validationMessage(failure, "Unable to load eligible tasks.") });
            }
        }
        loadEligibleTasks();
        return () => controller.abort();
    }, [selectedProjectId, taskPage, taskRevision, taskKey]);

    useEffect(() => {
        if (!taskId || !projectId || selectedProjectId !== String(projectId) || prefillLoaded.current) return undefined;
        prefillLoaded.current = true;
        const controller = new AbortController();
        taskApi.get(taskId, controller.signal).then((record) => {
            if (!controller.signal.aborted && taskIsEligible(record, projectId)) {
                setSelectedTask(record);
                setForm((previous) => ({ ...previous, task: String(record.id) }));
            }
        }).catch((failure) => {
            if (!controller.signal.aborted) setErrors({ task: validationMessage(failure, "Unable to load the selected task.") });
        });
        return () => controller.abort();
    }, [projectId, selectedProjectId, taskId]);

    function update(key, value) {
        if (key === "requested_end_date") extensionDateEdited.current = true;
        if (key === "extension_requested") extensionDateEdited.current = false;
        const syncForecast = key === "expected_completion_date" && !extensionDateEdited.current;
        setForm((previous) => ({
            ...previous,
            [key]: value,
            ...(key === "extension_requested" ? { requested_end_date: value ? previous.expected_completion_date : "" } : {}),
            ...(syncForecast && previous.extension_requested ? { requested_end_date: value } : {}),
        }));
        setError("");
        setErrors({});
    }

    function chooseProject(id) {
        setSelectedProjectId(id);
        if (id) writeLastProject(id);
        setSelectedTask(null);
        setTaskPage(1);
        setForm((previous) => ({ ...previous, task: "", expected_completion_date: "", extension_requested: false, requested_end_date: "" }));
        setErrors({});
        setError("");
    }

    function chooseTask(selected) {
        extensionDateEdited.current = false;
        setSelectedTask(selected);
        setTaskPage(1);
        setForm((previous) => ({
            ...previous,
            task: String(selected.id),
            extension_requested: selected.has_pending_extension ? false : previous.extension_requested,
            requested_end_date: selected.has_pending_extension || !previous.extension_requested ? "" : previous.expected_completion_date,
        }));
        setErrors({});
        setError("");
    }

    function fieldProps(name, helpId) {
        return {
            id: `delay-${name}`,
            "aria-invalid": Boolean(errors[name]),
            "aria-describedby": [helpId, errors[name] ? `delay-${name}-error` : ""].filter(Boolean).join(" ") || undefined,
        };
    }

    async function submit(event) {
        event.preventDefault();
        if (inFlight.current) return;
        const invalid = {};
        if (!selectedProject || !["ACTIVE", "MAINTENANCE"].includes(selectedProject.status)) invalid.project = "Choose an Active or Maintenance project.";
        if (!task || !taskIsEligible(task, selectedProjectId)) invalid.task = "Select an approved unfinished task.";
        if (!task?.end_date) invalid.task = "Set an approved task deadline before reporting a delay.";
        if (!delayTypes.includes(form.delay_type)) invalid.delay_type = "Choose a supported delay type.";
        if (!form.reason.trim() || form.reason.trim().length > 200) invalid.reason = "Provide a reason of up to 200 characters.";
        if (!form.expected_completion_date || form.expected_completion_date < today || task?.end_date && form.expected_completion_date <= task.end_date) invalid.expected_completion_date = "Choose a date today or later and after the current task deadline.";
        if (form.expected_completion_date && task?.start_date && form.expected_completion_date < task.start_date) invalid.expected_completion_date = "Expected completion cannot precede the task start date.";
        if (form.extension_requested) {
            if (task?.has_pending_extension) invalid.extension_requested = "This task already has a pending deadline extension.";
            if (!form.requested_end_date || task?.end_date && form.requested_end_date <= task.end_date || task?.start_date && form.requested_end_date < task.start_date) invalid.requested_end_date = "Choose a date after the current deadline and on or after the task start date.";
        }
        if (Object.keys(invalid).length) {
            setErrors(invalid);
            fieldRefs.current[Object.keys(invalid)[0]]?.focus();
            return;
        }
        inFlight.current = true;
        setSaving(true);
        setError("");
        setErrors({});
        try {
            const { task: taskIdValue, ...values } = form;
            const report = await delayApi.create(taskIdValue, {
                ...values,
                reason: values.reason.trim(),
                expected_completion_date: values.expected_completion_date || null,
                requested_end_date: values.extension_requested ? values.requested_end_date : null,
            });
            onSaved(report);
        } catch (failure) {
            const data = failure?.response?.data;
            setErrors(data && typeof data === "object" && !Array.isArray(data) ? data : {});
            setError(validationMessage(failure));
        } finally {
            inFlight.current = false;
            setSaving(false);
        }
    }

    const close = () => {
        if (!inFlight.current) onClose();
    };

    function formField(name, label, control) {
        return <div className="space-y-2">
            <label htmlFor={`delay-${name}`} className="block text-xs font-bold uppercase tracking-wide text-muted">{label}</label>
            {control}
            <FieldError errors={errors} name={name} />
        </div>;
    }

    return <dialog
        ref={setDialog}
        role="dialog"
        aria-label="Report a task delay"
        aria-labelledby="delay-report-title"
        aria-modal="true"
        aria-busy={saving}
        onCancel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            close();
        }}
        onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
        }}
        className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center border-0 bg-overlay/55 p-0 text-ink backdrop-blur-sm backdrop:bg-transparent sm:p-6"
    >
        {saving && <LoadingScreen portalTarget={dialog || undefined} message="Submitting delay report..." />}
        <section className="rare-mobile-sheet flex max-h-[92dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-[26px] border border-border bg-surface shadow-2xl">
            <header className="rare-page-header flex items-start justify-between gap-3 border-b border-border px-5 py-5 sm:px-7">
                <h2 id="delay-report-title" className="text-xl font-bold text-ink">Report a task delay</h2>
                <button
                    type="button"
                    disabled={saving}
                    onClick={close}
                    aria-label="Close delay form"
                    className="rounded-full bg-app p-2.5 text-ink"
                >
                    <X size={19} />
                </button>
            </header>
            <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
                    <fieldset disabled={saving} className="min-w-0 space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                            {formField("project", "Project *", <select
                                {...fieldProps("project")}
                                ref={(element) => { fieldRefs.current.project = element; }}
                                value={selectedProjectId}
                                onChange={(event) => chooseProject(event.target.value)}
                                className={input}
                            >
                                <option value="">{projectsLoading ? "Loading assigned projects..." : "Select a project"}</option>
                                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                            </select>)}
                            {formField("task", "Task *", <select
                                {...fieldProps("task")}
                                ref={(element) => { fieldRefs.current.task = element; }}
                                value={form.task}
                                disabled={!selectedProjectId}
                                onChange={(event) => {
                                    const nextTask = taskOptions.find((item) => String(item.id) === event.target.value);
                                    if (nextTask) chooseTask(nextTask);
                                    else {
                                        setSelectedTask(null);
                                        update("task", "");
                                    }
                                }}
                                className={input}
                            >
                                <option value="">{!selectedProjectId ? "Choose a project first" : taskLoading ? "Loading eligible tasks..." : "Select a task"}</option>
                                {taskOptions.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
                            </select>)}
                        </div>
                        {projectsState.error && <p role="status" aria-live="polite" className="text-xs text-danger">{projectsState.error} <button type="button" onClick={() => setProjectRevision((value) => value + 1)} className="underline">Retry</button></p>}
                        {taskError && <p role="status" aria-live="polite" className="text-xs text-danger">{taskError} <button type="button" onClick={() => setTaskRevision((value) => value + 1)} className="underline">Retry</button></p>}
                        {!taskLoading && !taskError && selectedProjectId && !taskOptions.length && <p role="status" className="text-xs text-muted">No approved tasks available for this project.</p>}
                        {(taskPage > 1 || taskState.next && tasksCurrent) && <div className="flex items-center justify-between">
                            <button type="button" disabled={taskPage <= 1} onClick={() => setTaskPage((value) => Math.max(1, value - 1))} className="min-h-11 px-2 text-xs font-semibold disabled:opacity-40">Previous</button>
                            <span aria-live="polite" className="text-xs text-muted">{taskCount} eligible tasks</span>
                            <button type="button" disabled={!taskState.next || !tasksCurrent} onClick={() => setTaskPage((value) => value + 1)} className="min-h-11 px-2 text-xs font-semibold disabled:opacity-40">More</button>
                        </div>}
                        {formField("delay_type", "Delay type *", <select
                            {...fieldProps("delay_type")}
                            ref={(element) => { fieldRefs.current.delay_type = element; }}
                            value={form.delay_type}
                            onChange={(event) => update("delay_type", event.target.value)}
                            className={input}
                        >
                            {delayTypes.map((value) => <option key={value} value={value}>{formatText(value)}</option>)}
                        </select>)}
                        {formField("reason", "Reason *", <input
                            {...fieldProps("reason")}
                            ref={(element) => { fieldRefs.current.reason = element; }}
                            maxLength={200}
                            value={form.reason}
                            onChange={(event) => update("reason", event.target.value)}
                            placeholder="Briefly explain what is holding up the task"
                            className={input}
                        />)}
                        {formField("description", "Additional details (optional)", <textarea
                            {...fieldProps("description")}
                            rows={3}
                            value={form.description}
                            onChange={(event) => update("description", event.target.value)}
                            placeholder="Add context that will help Admin review this delay"
                            className={`${input} resize-y`}
                        />)}
                        {formField("expected_completion_date", "Expected completion date *", <input
                            {...fieldProps("expected_completion_date", "delay-forecast-help")}
                            ref={(element) => { fieldRefs.current.expected_completion_date = element; }}
                            type="date"
                            min={today}
                            value={form.expected_completion_date}
                            onChange={(event) => update("expected_completion_date", event.target.value)}
                            className={input}
                        />)}
                        <div className="space-y-2">
                            <label htmlFor="delay-extension_requested" className="flex items-center gap-3 text-sm text-ink">
                                <input
                                    {...fieldProps("extension_requested")}
                                    ref={(element) => { fieldRefs.current.extension_requested = element; }}
                                    type="checkbox"
                                    disabled={Boolean(task?.has_pending_extension)}
                                    checked={form.extension_requested}
                                    onChange={(event) => update("extension_requested", event.target.checked)}
                                    className="h-4 w-4 accent-ink"
                                />
                                Request a deadline extension
                            </label>
                            <FieldError errors={errors} name="extension_requested" />
                            {task?.has_pending_extension && <p role="status" className="text-xs text-muted">An extension request is already pending for this task.</p>}
                        </div>
                        {form.extension_requested && formField("requested_end_date", "New deadline *", <input
                            {...fieldProps("requested_end_date")}
                            ref={(element) => { fieldRefs.current.requested_end_date = element; }}
                            type="date"
                            min={dayAfter(task?.end_date) || today}
                            value={form.requested_end_date}
                            onChange={(event) => update("requested_end_date", event.target.value)}
                            className={input}
                        />)}
                        <p id="delay-forecast-help" className="flex items-start gap-2 text-sm leading-5 text-muted"><Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" /><span>Submitting this report records the delay. The approved deadline stays unchanged.</span></p>
                    </fieldset>
                    {error && <p role="alert" className="rounded-xl border border-danger/30 bg-pastel-blush p-4 text-sm text-danger">{error}</p>}
                </div>
                <footer className="rare-action-footer flex shrink-0 flex-wrap justify-end gap-3 px-5 sm:px-7">
                    <button type="button" onClick={close} disabled={saving} className="rounded-xl border border-border px-5 py-3 text-sm font-semibold text-ink">Cancel</button>
                    <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-action px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-primary-hover disabled:opacity-50">{saving ? "Submitting..." : "Submit delay report"}</button>
                </footer>
            </form>
        </section>
    </dialog>;
}
