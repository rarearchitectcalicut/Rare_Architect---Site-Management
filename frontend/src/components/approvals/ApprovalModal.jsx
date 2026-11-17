import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import LoadingScreen from "../LoadingScreen";
import { useModalScrollLock } from "../../hooks/useModalScrollLock";

export default function ApprovalModal({ onClose, busy, error, children, label = "Request details", compact = false, fitViewport = false, className = "" }) {
    const [dialog, setDialog] = useState(null);
    useModalScrollLock();
    const heightLimit = fitViewport ? "max-h-[calc(100dvh-0.5rem)]" : "max-h-[92dvh]";

    useEffect(() => {
        if (!dialog) return;
        dialog.showModal();
        return () => {
            dialog.close();
        };
    }, [dialog]);

    return createPortal(
        <dialog
            ref={setDialog}
            aria-label={label}
            aria-modal="true"
            aria-busy={Boolean(busy)}
            onCancel={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!busy) onClose();
            }}
            onClick={(event) => {
                if (busy || event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (event.clientX < bounds.left || event.clientX > bounds.right ||
                    event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
            }}
            className={`${compact ? "max-w-md" : "rare-form-dialog max-w-3xl"} fixed inset-0 m-auto ${heightLimit} w-[calc(100%-2rem)] overflow-y-auto overscroll-contain rounded-[28px] border border-border bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/65 backdrop:backdrop-blur-sm ${className}`}
        >
            {busy && <LoadingScreen message={busy} portalTarget={dialog || undefined} />}
            {error && <p role="alert" className="m-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
            {children}
        </dialog>,
        document.body,
    );
}

