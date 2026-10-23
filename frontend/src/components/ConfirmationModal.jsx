import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { ClipboardCheck } from "lucide-react";
import { useModalScrollLock } from "../hooks/useModalScrollLock";

export default function ConfirmationModal({ title, message, confirmLabel, onDecision }) {
    const dialogRef = useRef(null);
    const titleId = useId();
    const messageId = useId();
    useModalScrollLock();

    useEffect(() => {
        const dialog = dialogRef.current;
        dialog.showModal();

        return () => {
            dialog.close();
        };
    }, []);

    return createPortal(
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            aria-describedby={messageId}
            aria-modal="true"
            onCancel={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDecision(false);
            }}
            onKeyDown={(event) => {
                // Escape dismisses this confirmation without closing the task form.
                if (event.key === "Escape") event.stopPropagation();
            }}
            className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-[#E7DED2] bg-[#FFFDFA] p-6 text-[#211E1A] shadow-2xl backdrop:bg-[#211E1A]/55 backdrop:backdrop-blur-sm sm:p-7"
        >
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F1EADF] text-[#74614D]">
                <ClipboardCheck size={24} aria-hidden="true" />
            </span>
            <h2 id={titleId} className="text-xl font-bold">{title}</h2>
            <p id={messageId} className="mt-3 break-words text-sm leading-6 text-[#817669]">
                {message}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                    type="button"
                    autoFocus
                    onClick={() => onDecision(false)}
                    className="rounded-xl border border-[#E4DCCD] px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => onDecision(true)}
                    className="rounded-xl bg-[#211E1A] px-5 py-3 text-sm font-semibold text-white hover:bg-[#39332B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#211E1A]"
                >
                    {confirmLabel}
                </button>
            </div>
        </dialog>,
        document.body,
    );
}
