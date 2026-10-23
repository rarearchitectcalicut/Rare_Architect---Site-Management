import { useCallback, useEffect, useState } from "react";
import { dailyReportApi } from "../api/dailyReportApi";
import { projectApi } from "../api/projectApi";
import { getAllPages } from "../components/approvals/approvalUtils";
import { normalizeRequest } from "../components/approvals/queueData";
import { validationMessage } from "./useApprovalReview";

export function useDailyWorkQueue(reportId) {
    const [items, setItems] = useState([]);
    const [projects, setProjects] = useState([]);
    const [report, setReport] = useState(null);
    const [attachments, setAttachments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const refresh = useCallback(() => setRevision((value) => value + 1), []);
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true); setError("");
            try {
                const [work, projectData, reportData, files] = await Promise.all([
                    getAllPages((params) => dailyReportApi.workQueue({ ...params, ...(reportId ? { report: reportId } : {}) })),
                    getAllPages(projectApi.getProjects),
                    reportId ? dailyReportApi.get(reportId) : Promise.resolve(null),
                    reportId ? getAllPages((params) => dailyReportApi.attachments(reportId, params)) : Promise.resolve([]),
                ]);
                if (!cancelled) { setItems(work.map((entry) => normalizeRequest("work", entry))); setProjects(projectData); setReport(reportData); setAttachments(files); }
            } catch (failure) { if (!cancelled) { setError(validationMessage(failure, "Unable to load submitted daily work.")); setItems([]); } }
            finally { if (!cancelled) setLoading(false); }
        }
        load();
        return () => { cancelled = true; };
    }, [revision, reportId]);
    return { items, projects, report, attachments, loading, error, refresh };
}
