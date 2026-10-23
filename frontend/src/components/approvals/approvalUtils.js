export const formatText = (value) => {
    if (value === null || value === undefined || value === "") {
        return "Not specified";
    }
    return String(value)
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export function formatDate(value) {
    if (!value) return "Not specified";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

export function getItems(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.results)) return response.results;
    throw new Error("Unexpected API list response.");
}

export async function getAllPages(fetchPage) {
    let page = 1;
    let more = true;
    const items = [];

    while (more) {
        if (page > 500) {
            throw new Error("Pagination limit reached.");
        }

        const result = await fetchPage({ page });
        items.push(...getItems(result));

        more =
            !Array.isArray(result) &&
            Boolean(result?.next);

        page += 1;
    }

    return items;
}

export function getError(error, fallback) {
    const data = error?.response?.data;

    if (typeof data?.detail === "string") return data.detail;

    if (Array.isArray(data?.non_field_errors)) {
        return data.non_field_errors.join(" ");
    }

    if (error?.response?.status === 403) {
        return "You do not have permission for this action.";
    }

    if (error?.response?.status === 404) {
        return "This record is no longer available.";
    }

    return fallback;
}

export function referenceId(value) {
    if (value && typeof value === "object") {
        return String(value.id ?? value.uuid ?? "");
    }
    return value == null ? "" : String(value);
}

export function getTaskRecord(entry) {
    if (entry?.task && typeof entry.task === "object") {
        return entry.task;
    }
    return entry;
}

export function getTaskId(entry) {
    const task = getTaskRecord(entry);

    return referenceId(
        task?.id ??
        task?.task_id ??
        entry?.task_id ??
        entry?.task
    );
}

export function getProjectId(entry) {
    const task = getTaskRecord(entry);

    return referenceId(
        task?.project_id ??
        task?.project ??
        entry?.project_id ??
        entry?.project
    );
}

export function getCreatorName(entry) {
    const task = getTaskRecord(entry);
    const displayName = task?.created_by_name || entry?.created_by_name || task?.supervisor_name || entry?.supervisor_name;
    if (displayName) return displayName;
    const creator =
        task?.created_by ??
        entry?.created_by ??
        task?.supervisor ??
        entry?.supervisor;

    if (typeof creator === "string") {
        return creator;
    }

    if (creator && typeof creator === "object") {
        const name = [
            creator.first_name,
            creator.last_name,
        ].filter(Boolean).join(" ");

        return (
            name ||
            creator.name ||
            creator.username ||
            task?.created_by_name ||
            entry?.created_by_name ||
            "Supervisor"
        );
    }

    return (
        task?.created_by_name ||
        entry?.created_by_name ||
        task?.supervisor_name ||
        entry?.supervisor_name ||
        "Supervisor"
    );
}

export function normalTask(entry) {
    const task = getTaskRecord(entry);

    return {
        id: getTaskId(entry),
        requestType: "tasks",
        queueKey: `tasks:${getTaskId(entry)}`,
        raw: entry,
        title: task.title || entry.title || "Untitled Task",
        projectId: getProjectId(entry),
        projectName:
            task.project_name || entry.project_name || "",
        creator: getCreatorName(entry),
        priority: task.priority || entry.priority || "MEDIUM",
        createdAt:
            entry.created_at ||
            task.created_at ||
            entry.submitted_at ||
            "",
        batchId: referenceId(
            task.batch_id ??
            task.batch ??
            entry.batch_id ??
            entry.batch
        ),
    };
}

export function normalChange(entry) {
    const task =
        typeof entry.task === "object"
            ? entry.task
            : null;

    return {
        id: referenceId(entry.id),
        requestType: "changes",
        queueKey: `changes:${referenceId(entry.id)}`,
        raw: entry,
        title:
            task?.title ||
            entry.task_title ||
            entry.title ||
            "Task Change Request",
        projectId: referenceId(
            entry.project_id ??
            entry.project ??
            task?.project_id ??
            task?.project
        ),
        projectName: entry.project_name || "",
        creator:
            entry.requested_by_name ||
            entry.created_by_name ||
            getCreatorName(entry),
        priority: task?.priority || "MEDIUM",
        createdAt:
            entry.created_at ||
            entry.requested_at ||
            "",
        batchId: "",
    };
}

export function getChanges(record) {
    if (!record) return [];

    // Support flat or nested proposed-change objects.
    const data =
        record.new_values ||
        record.proposed_changes ||
        record.changes ||
        record.requested_changes ||
        record.proposed_values ||
        {};

    if (
        data &&
        typeof data === "object" &&
        !Array.isArray(data)
    ) {
        return Object.entries(data).filter(
            ([key]) =>
                !["id", "project", "created_by"].includes(key)
        );
    }

    return [];
}

