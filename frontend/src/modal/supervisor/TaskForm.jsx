
import { useEffect, useRef, useState } from "react";
import { ClipboardPlus, Save, X } from "lucide-react";
import { taskApi } from "../../api/taskApi";
import LoadingScreen from "../../components/LoadingScreen";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const METHODS = ["COMPLETION_ONLY", "QUANTITY"];
const UNITS = [
    "SQM", "METER", "CUM", "COUNT", "KG", "LITRE"
];

const emptyTask = {
    title: "",
    description: "",
    worker_name: "",
    priority: "MEDIUM",
    start_date: "",
    end_date: "",
    measurement_method: "COMPLETION_ONLY",
    planned_quantity: "",
    measurement_unit: "",
    completion_criteria: "",
    resubmission_note: "",
    change_reason: "",
};

const inputClass =
    "w-full rounded-xl border border-[#E4DCCD] bg-[#FFFDFA] px-4 py-3 text-sm text-[#211E1A] outline-none transition-all focus:border-[#B7A58E] focus:ring-4 focus:ring-[#E8DDD0]/50";

const LABELS = {
    LOW: "Low",
    MEDIUM: "Medium",
    HIGH: "High",
    URGENT: "Urgent",
};

function asText(value) {
    if (Array.isArray(value)) return value.join(" ");
    if (typeof value === "string") return value;
    return "";
}

function valuesFor(task) {
    if (!task) return { ...emptyTask };

    return {
        ...emptyTask,
        title: task.title || "",
        description: task.description || "",
        worker_name: task.worker_name || "",
        priority: task.priority || "MEDIUM",
        start_date: task.start_date || "",
        end_date: task.end_date || "",
        measurement_method:
            task.measurement_method || "COMPLETION_ONLY",
        planned_quantity:
            task.planned_quantity == null
                ? ""
                : String(task.planned_quantity),
        measurement_unit: task.measurement_unit || "",
        completion_criteria: task.completion_criteria || "",
    };
}

export default function TaskForm({
    open,
    projectId,
    task = null,
    onClose,
    onSaved,
}) {
    const [form, setForm] = useState(emptyTask);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);

    const isEdit = Boolean(task?.id);
    const isRejected = task?.approval_status === "REJECTED";
    const isApproved = task?.approval_status === "APPROVED";
    const isPending = task?.approval_status === "PENDING";

    useEffect(() => {
        if (!open) return;

        setForm(valuesFor(task));
        setErrors({});

        const oldOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = oldOverflow;
        };
    }, [open, task]);

    if (!open) return null;

    function update(key, value) {
        setForm((previous) => ({
            ...previous,
            [key]: value,
        }));
        setErrors((previous) => ({
            ...previous,
            [key]: "",
            general: "",
        }));
    }

    function field(name, label, children) {
        return (
            <div className="space-y-2">
                <label
                    htmlFor={`task-${name}`}
                    className="block text-xs font-bold uppercase tracking-wide text-[#817669]"
                >
                    {label}
                </label>
                {children}
                {errors[name] && (
                    <p role="alert" className="text-xs text-red-700">
                        {errors[name]}
                    </p>
                )}
            </div>
        );
    }

    async function submit(event) {
        event.preventDefault();
        if (savingRef.current) return;

        const nextErrors = {};

        if (!form.title.trim()) {
            nextErrors.title = "Task title is required.";
        }
        if (form.start_date && form.end_date &&
            form.end_date < form.start_date) {
            nextErrors.end_date =
                "End date cannot be before the start date.";
        }

        if (form.measurement_method === "QUANTITY") {
            if (!(Number(form.planned_quantity) > 0)) {
                nextErrors.planned_quantity =
                    "Planned quantity must be greater than zero.";
            }
            if (!form.measurement_unit) {
                nextErrors.measurement_unit =
                    "Measurement unit is required.";
            }
        }

        if (isRejected && !form.resubmission_note.trim()) {
            nextErrors.resubmission_note =
                "Explain the corrections before resubmitting.";
        }

        if (isApproved && !form.change_reason.trim()) {
            nextErrors.change_reason =
                "A reason is required for an approved-task change.";
        }

        if (Object.keys(nextErrors).length) {
            setErrors(nextErrors);
            return;
        }

        const values = {
            title: form.title.trim(),
            description: form.description.trim(),
            worker_name: form.worker_name.trim(),
            priority: form.priority,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            measurement_method: form.measurement_method,
            planned_quantity:
                form.measurement_method === "QUANTITY"
                    ? form.planned_quantity
                    : null,
            measurement_unit:
                form.measurement_method === "QUANTITY"
                    ? form.measurement_unit
                    : null,
            completion_criteria: form.completion_criteria.trim(),
        };

        // For updates only send fields that actually changed.
        // Rejected-task resubmission requires an actual change.
        const changes = Object.fromEntries(
            Object.entries(values).filter(([key, value]) => {
                if (!task) return true;
                const oldValue = task[key] ?? null;
                return String(value ?? "") !== String(oldValue ?? "");
            })
        );

        if (isEdit && Object.keys(changes).length === 0) {
            setErrors({
                general: "Change at least one field before submitting.",
            });
            return;
        }

        savingRef.current = true;
        setSaving(true);
        setErrors({});

        try {
            if (!isEdit) {
                await taskApi.create(projectId, values);
            } else if (isRejected) {
                await taskApi.resubmit(task.id, {
                    ...changes,
                    resubmission_note: form.resubmission_note.trim(),
                });
            } else if (isApproved) {
                // This is a change request, not a direct edit.
                // Django validates its supported change-request fields.
                await taskApi.requestChange(task.id, {
                    ...changes,
                    reason: form.change_reason.trim(),
                });
            } else if (isPending) {
                await taskApi.update(task.id, changes);
            } else {
                throw new Error("Unsupported task approval state.");
            }

            onSaved?.();
            onClose();
        } catch (error) {
            const data = error.response?.data;

            const backendErrors = {};

            if (data && typeof data === "object") {
                for (const key of [
                    ...Object.keys(emptyTask),
                    "reason",
                    "non_field_errors",
                ]) {
                    if (data[key]) {
                        backendErrors[
                            key === "reason"
                                ? "change_reason"
                                : key === "non_field_errors"
                                    ? "general"
                                    : key
                        ] = asText(data[key]);
                    }
                }
            }

            setErrors({
                ...backendErrors,
                general:
                    backendErrors.general ||
                    asText(data?.detail) ||
                    (
                        Object.keys(backendErrors).length
                            ? ""
                            : error.message === "Unsupported task approval state."
                                ? error.message
                                : "Unable to save task. Check permissions and approval state."
                    ),
            });
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }

    return (
        <>
            {saving && (
                <LoadingScreen
                    message={
                        isApproved
                            ? "Submitting task change request..."
                            : isRejected
                                ? "Resubmitting task..."
                                : isEdit
                                    ? "Updating task..."
                                    : "Creating task..."
                    }
                />
            )}

            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-[#211E1A]/55 p-3 backdrop-blur-sm sm:p-6"
                onMouseDown={(event) => {
                    if (
                        event.target === event.currentTarget &&
                        !savingRef.current
                    ) onClose();
                }}
            >
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="task-form-title"
                    className="flex max-h-[92dvh] w-full max-w-[720px] flex-col overflow-hidden rounded-[26px] border border-[#E7DED2] bg-[#FFFDFA] shadow-2xl"
                >
                    <header className="flex items-start justify-between gap-3 border-b border-[#EEE6DC] px-5 py-5 sm:px-7">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#948778]">
                                Supervisor / Project Tasks
                            </p>
                            <h2
                                id="task-form-title"
                                className="mt-2 text-xl font-bold text-[#211E1A]"
                            >
                                {!isEdit
                                    ? "Create New Task"
                                    : isRejected
                                        ? "Correct & Resubmit Task"
                                        : isApproved
                                            ? "Request Task Changes"
                                            : "Edit Task"}
                            </h2>
                            <p className="mt-2 text-xs leading-5 text-[#817669]">
                                {isApproved
                                    ? "Changes will be reviewed by Admin before applying."
                                    : isRejected
                                        ? "The corrected task returns to Admin approval."
                                        : "Enter the task details and planned schedule."}
                            </p>
                        </div>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={onClose}
                            aria-label="Close task form"
                            className="rounded-full bg-[#F1EADF] p-2.5 text-[#211E1A]"
                        >
                            <X size={19} />
                        </button>
                    </header>

                    <form
                        onSubmit={submit}
                        noValidate
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6 sm:px-7">
                            {field("title", "Task Title *", (
                                <input
                                    id="task-title"
                                    className={inputClass}
                                    value={form.title}
                                    onChange={(e) => update("title", e.target.value)}
                                    maxLength={200}
                                    placeholder="e.g. Ground Floor Plastering"
                                />
                            ))}

                            <div className="grid gap-4 sm:grid-cols-2">
                                {field("worker_name", "Worker / Team", (
                                    <input
                                        id="task-worker_name"
                                        className={inputClass}
                                        value={form.worker_name}
                                        onChange={(e) =>
                                            update("worker_name", e.target.value)
                                        }
                                        placeholder="Assigned worker or team"
                                    />
                                ))}

                                {field("priority", "Priority", (
                                    <select
                                        id="task-priority"
                                        className={inputClass}
                                        value={form.priority}
                                        onChange={(e) => update("priority", e.target.value)}
                                    >
                                        {PRIORITIES.map((value) => (
                                            <option key={value} value={value}>
                                                {LABELS[value]}
                                            </option>
                                        ))}
                                    </select>
                                ))}
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                {field("start_date", "Start Date", (
                                    <input
                                        id="task-start_date"
                                        type="date"
                                        className={inputClass}
                                        value={form.start_date}
                                        onChange={(e) =>
                                            update("start_date", e.target.value)
                                        }
                                    />
                                ))}

                                {field("end_date", "End Date", (
                                    <input
                                        id="task-end_date"
                                        type="date"
                                        min={form.start_date || undefined}
                                        className={inputClass}
                                        value={form.end_date}
                                        onChange={(e) =>
                                            update("end_date", e.target.value)
                                        }
                                    />
                                ))}
                            </div>

                            {field("description", "Description", (
                                <textarea
                                    id="task-description"
                                    rows={4}
                                    className={`${inputClass} resize-y`}
                                    value={form.description}
                                    onChange={(e) =>
                                        update("description", e.target.value)
                                    }
                                    placeholder="Describe the scope and instructions..."
                                />
                            ))}

                            <div className="rounded-2xl bg-[#F8F4EE] p-4">
                                <h3 className="text-sm font-bold text-[#211E1A]">
                                    Progress Measurement
                                </h3>
                                <p className="mt-1 text-xs text-[#817669]">
                                    This defines how progress is verified through
                                    daily work entries; it is not a manual percentage.
                                </p>

                                <div className="mt-4 space-y-4">
                                    {field("measurement_method", "Method", (
                                        <select
                                            id="task-measurement_method"
                                            value={form.measurement_method}
                                            onChange={(e) =>
                                                update("measurement_method", e.target.value)
                                            }
                                            className={inputClass}
                                        >
                                            {METHODS.map((value) => (
                                                <option key={value} value={value}>
                                                    {value === "QUANTITY"
                                                        ? "Measured Quantity"
                                                        : "Completion Only"}
                                                </option>
                                            ))}
                                        </select>
                                    ))}

                                    {form.measurement_method === "QUANTITY" && (
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            {field("planned_quantity", "Planned Quantity *", (
                                                <input
                                                    id="task-planned_quantity"
                                                    type="number"
                                                    min="0.001"
                                                    step="0.001"
                                                    className={inputClass}
                                                    value={form.planned_quantity}
                                                    onChange={(e) =>
                                                        update("planned_quantity", e.target.value)
                                                    }
                                                />
                                            ))}

                                            {field("measurement_unit", "Unit *", (
                                                <select
                                                    id="task-measurement_unit"
                                                    className={inputClass}
                                                    value={form.measurement_unit}
                                                    onChange={(e) =>
                                                        update("measurement_unit", e.target.value)
                                                    }
                                                >
                                                    <option value="">Choose unit</option>
                                                    {UNITS.map((unit) => (
                                                        <option key={unit} value={unit}>
                                                            {unit}
                                                        </option>
                                                    ))}
                                                </select>
                                            ))}
                                        </div>
                                    )}

                                    {field("completion_criteria", "Completion Criteria", (
                                        <textarea
                                            id="task-completion_criteria"
                                            rows={2}
                                            className={inputClass}
                                            value={form.completion_criteria}
                                            onChange={(e) =>
                                                update("completion_criteria", e.target.value)
                                            }
                                            placeholder="What counts as accepted completion?"
                                        />
                                    ))}
                                </div>
                            </div>

                            {isRejected &&
                                field("resubmission_note", "Correction / Resubmission Note *", (
                                    <textarea
                                        id="task-resubmission_note"
                                        rows={3}
                                        className={inputClass}
                                        value={form.resubmission_note}
                                        onChange={(e) =>
                                            update("resubmission_note", e.target.value)
                                        }
                                        placeholder="Explain what you corrected..."
                                    />
                                ))}

                            {isApproved &&
                                field("change_reason", "Reason for Change *", (
                                    <textarea
                                        id="task-change_reason"
                                        rows={3}
                                        className={inputClass}
                                        value={form.change_reason}
                                        onChange={(e) =>
                                            update("change_reason", e.target.value)
                                        }
                                        placeholder="Explain why the approved plan needs to change..."
                                    />
                                ))}

                            {errors.general && (
                                <p
                                    role="alert"
                                    className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                                >
                                    {errors.general}
                                </p>
                            )}
                        </div>

                        <footer className="flex justify-end gap-3 border-t border-[#EEE6DC] px-5 py-4 sm:px-7">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={saving}
                                className="rounded-xl border border-[#E4DCCD] px-5 py-3 text-sm font-semibold text-[#211E1A]"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#39332B] disabled:opacity-50"
                            >
                                {isEdit ? <Save size={17} /> : <ClipboardPlus size={17} />}
                                {isApproved
                                    ? "Submit Change Request"
                                    : isRejected
                                        ? "Resubmit Task"
                                        : isEdit
                                            ? "Save Task"
                                            : "Create Task"}
                            </button>
                        </footer>
                    </form>
                </section>
            </div>
        </>
    );
}
