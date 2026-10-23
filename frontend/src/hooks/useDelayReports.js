import { useCallback, useEffect, useState } from "react";
import { delayApi } from "../api/delayApi";
import { projectApi } from "../api/projectApi";
import { taskApi } from "../api/taskApi";
import { getAllPages } from "../components/approvals/approvalUtils";
import { validationMessage } from "./useApprovalReview";

export function useDelayReports(projectId) {
    const [reports, setReports] = useState([]);
    const [projects, setProjects] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const refresh = useCallback(() => setRevision((value) => value + 1), []);
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true); setError("");
            try {
                const [data, projectData, taskData] = await Promise.all([
                    getAllPages((params) => delayApi.list({ ...params, ...(projectId ? { project: projectId } : {}) })),
                    projectId ? projectApi.getProject(projectId).then((data) => [data]) : getAllPages(projectApi.getProjects),
                    projectId ? getAllPages((params) => taskApi.list(projectId, params)) : Promise.resolve([]),
                ]);
                if (cancelled) return;
                setReports(data); setProjects(projectData);
                setTasks(taskData.filter((task) => task.approval_status === "APPROVED" && !["COMPLETED", "CANCELLED"].includes(task.work_status)));
            } catch (failure) {
                if (!cancelled) { setError(validationMessage(failure, "Unable to load delay reports. Refresh to retry.")); setReports([]); }
            } finally { if (!cancelled) setLoading(false); }
        }
        load();
        return () => { cancelled = true; };
    }, [projectId, revision]);
    return { reports, projects, tasks, loading, error, refresh };
}
