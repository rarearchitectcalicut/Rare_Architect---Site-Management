import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dailyReportApi } from "../../api/dailyReportApi";
import { validationMessage } from "../../hooks/useApprovalReview";
import { useModalScrollLock } from "../../hooks/useModalScrollLock";

function EvidencePreview({ file, preview, onClose, onDownload, loading, button }) {
    const dialogRef = useRef(null);
    const titleId = useId();
    useModalScrollLock();
    useEffect(() => {
        const dialog = dialogRef.current;
        dialog.showModal();
        return () => dialog.close();
    }, []);
    return createPortal(<dialog ref={dialogRef} aria-labelledby={titleId} aria-modal="true" onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }} onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }} className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%-1rem)] max-w-5xl overflow-auto rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-4 shadow-2xl backdrop:bg-black/65 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3"><h4 id={titleId} className="break-all text-base font-bold leading-6 text-[#352D24]">{file.original_filename}</h4><button type="button" autoFocus onClick={onClose} className={button}>Close preview</button></div>
        {preview.type.startsWith("image/") ? <img src={preview.url} alt={file.caption || file.original_filename} className="mx-auto max-h-[72dvh] max-w-full object-contain" /> : <><iframe src={preview.url} title={`PDF preview: ${file.original_filename}`} className="h-[68dvh] w-full rounded-lg border border-[#E7DED2]" /><p className="mt-3 text-xs text-[#716658]">PDF viewing depends on your browser. If the preview is unavailable, download the file to view it.</p></>}
        <button type="button" disabled={loading} onClick={onDownload} className={`${button} mt-4`}>Download</button>
    </dialog>, document.body);
}

function EvidenceFile({ file, onRemove, busy, fileApi = dailyReportApi }) {
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState(null);
    const [open, setOpen] = useState(false);
    const inFlight = useRef(false);
    const cache = useRef(null);
    const request = useRef(null);
    const previewable = /\.(jpe?g|png|webp|pdf)$/i.test(file.original_filename);
    const image = /\.(jpe?g|png|webp)$/i.test(file.original_filename);

    useEffect(() => {
        const controller = new AbortController();
        request.current = controller;
        return () => {
            controller.abort();
            if (cache.current) URL.revokeObjectURL(cache.current.url);
            cache.current = null;
        };
    }, []);

    async function loadPreview() {
        if (cache.current) return cache.current;
        const signal = request.current?.signal;
        const blob = await fileApi.previewAttachment(file.id, signal);
        if (signal?.aborted) return null;
        if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(blob.type)) throw new Error("Preview is unavailable for this file. Use Download to open it with a compatible application.");
        const loaded = { blob, url: URL.createObjectURL(blob), type: blob.type };
        cache.current = loaded;
        setPreview(loaded);
        return loaded;
    }
    async function view() {
        if (inFlight.current) return;
        inFlight.current = true;
        setLoading(true); setError("");
        try { if (await loadPreview()) setOpen(true); }
        catch (failure) { if (!request.current?.signal.aborted) setError(validationMessage(failure, failure.message || "Unable to preview evidence.")); }
        finally { inFlight.current = false; if (!request.current?.signal.aborted) setLoading(false); }
    }
    // Only images are prefetched for thumbnails. PDFs load on demand.
    useEffect(() => {
        if (!image) return;
        let active = true;
        inFlight.current = true; setLoading(true);
        loadPreview().catch(() => { /* The Preview action provides an explicit retry. */ })
            .finally(() => { if (active) { inFlight.current = false; setLoading(false); } });
        return () => { active = false; };
    // Each keyed item owns one attachment and releases its blob on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file.id]);
    async function download() {
        if (inFlight.current) return;
        inFlight.current = true; setLoading(true); setError("");
        try {
            const blob = cache.current?.blob || await fileApi.downloadAttachment(file.id, request.current?.signal);
            if (request.current?.signal.aborted) return;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url; anchor.download = file.original_filename; document.body.append(anchor); anchor.click(); anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (failure) { if (!request.current?.signal.aborted) setError(validationMessage(failure, "Unable to download evidence.")); }
        finally { inFlight.current = false; if (!request.current?.signal.aborted) setLoading(false); }
    }
    const button = "inline-flex min-h-12 items-center justify-center rounded-xl border border-[#E7DED2] bg-[#FFFDFA] px-5 py-3 text-base font-bold text-[#211E1A] transition-colors hover:bg-[#F1EADF] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3565A5] disabled:cursor-not-allowed disabled:opacity-50";
    return <li className="flex min-w-0 flex-col rounded-2xl border border-[#E2D6C6] bg-[#FFFDFA] p-4 shadow-[0_4px_16px_-14px_rgba(61,42,20,0.3)] sm:p-5">
            <p className="break-all text-base font-bold leading-6 text-[#352D24]">{file.original_filename}</p>
            {preview?.type.startsWith("image/") && <button type="button" onClick={view} aria-label={`Enlarge ${file.original_filename}`} className="mt-4 flex min-h-32 items-center sm:min-h-44 justify-center rounded-xl border border-[#E9E1D6] bg-[#F8F4EE] p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3565A5]"><img src={preview.url} alt={file.caption || file.original_filename} className="max-h-40 max-w-full rounded-lg sm:max-h-48 object-contain" /></button>}
            {file.caption && <p className="mt-1 text-xs text-[#716658]">{file.caption}</p>}
            {file.task_work && <p className="mt-1 break-all text-xs text-[#716658]">Task work reference: {file.task_work}</p>}
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            <div className="mt-3 flex flex-wrap gap-2">{previewable && <button type="button" disabled={loading} onClick={view} className={`${button} !border-[#211E1A] !bg-[#211E1A] !text-[#FFFDFA] hover:!bg-[#39332B]`}>{loading ? "Loading…" : "Preview"}</button>}<button type="button" disabled={loading} onClick={download} className={button}>Download</button></div>
            {!previewable && <p className="mt-2 text-xs text-[#716658]">Download to open with a compatible application on your device.</p>}
            {onRemove && <button type="button" disabled={busy} onClick={() => onRemove(file)} className="mt-3 inline-flex min-h-12 items-center justify-center rounded-xl border border-[#EFACA5] bg-[#FEE2E2] px-5 py-3 text-base font-bold text-[#991B1B] transition-colors hover:bg-[#FECACA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#991B1B] disabled:cursor-not-allowed disabled:opacity-50">Remove attachment</button>}
            {open && <EvidencePreview file={file} preview={preview} onClose={() => setOpen(false)} onDownload={download} loading={loading} button={button} />}
        </li>;
}

export default function ReportEvidence({ files = [], onRemove, busy = false, fileApi = dailyReportApi, title = "Evidence and attachments" }) {
    return <section><h3 className="text-lg font-bold text-[#352D24]">{title}</h3>
        {files.length ? <ul className="mt-4 grid items-start gap-4 xl:grid-cols-2">{files.map((file) => <EvidenceFile key={file.id} file={file} onRemove={onRemove} busy={busy} fileApi={fileApi} />)}</ul> : <p className="mt-4 rounded-2xl border border-dashed border-[#CCB99F] bg-[#FAF7F1] px-5 py-8 text-center text-base leading-7 text-[#716658]">No evidence attached to this entry or report.</p>}
    </section>;
}
