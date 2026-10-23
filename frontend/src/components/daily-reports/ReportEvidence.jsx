import { useState } from "react";
import { dailyReportApi } from "../../api/dailyReportApi";
import { validationMessage } from "../../hooks/useApprovalReview";

export default function ReportEvidence({ files = [] }) {
    const [error, setError] = useState("");
    const [downloading, setDownloading] = useState(null);
    async function download(file) {
        if (downloading) return;
        setDownloading(file.id); setError("");
        try {
            const blob = await dailyReportApi.downloadAttachment(file.id);
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url; anchor.download = file.original_filename; document.body.append(anchor); anchor.click(); anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (failure) { setError(validationMessage(failure, "Unable to download evidence.")); }
        finally { setDownloading(null); }
    }
    return <section><h3 className="text-sm font-bold">Evidence and attachments</h3>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {files.length ? <ul className="mt-3 space-y-2">{files.map((file) => <li key={file.id} className="rounded-xl border border-[#E7DED2] p-3">
            <button type="button" disabled={Boolean(downloading)} onClick={() => download(file)} className="break-all text-sm font-semibold text-[#3565A5]">{downloading === file.id ? "Downloading…" : file.original_filename}</button>
            {file.caption && <p className="mt-1 text-xs text-[#817669]">{file.caption}</p>}
        </li>)}</ul> : <p className="mt-2 text-sm text-[#817669]">No evidence attached to this entry or report.</p>}
    </section>;
}
