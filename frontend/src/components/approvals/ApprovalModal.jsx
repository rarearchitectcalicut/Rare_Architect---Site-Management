import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import LoadingScreen from "../LoadingScreen";
import { useModalScrollLock } from "../../hooks/useModalScrollLock";

export default function ApprovalModal({ onClose, busy, error, children, label = "Request details" }) {
    const [dialog, setDialog] = useState(null);
    useModalScrollLock();

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
            className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-[28px] border border-[#E7DED2] bg-[#FFFDFA] p-0 text-[#211E1A] shadow-2xl backdrop:bg-[#211E1A]/65 backdrop:backdrop-blur-sm"
        >
            {busy && <LoadingScreen message={busy} portalTarget={dialog || undefined} />}
            {error && <p role="alert" className="m-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
            {children}
        </dialog>,
        document.body,
    );
}

