import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmationModal from "../components/ConfirmationModal";

export function useConfirmation() {
    const [options, setOptions] = useState(null);
    const pending = useRef(null);

    const decide = useCallback((confirmed) => {
        const resolve = pending.current;
        pending.current = null;
        setOptions(null);
        resolve?.(confirmed);
    }, []);

    const cancelConfirmation = useCallback(() => decide(false), [decide]);

    const confirm = useCallback((nextOptions) => {
        // Repeated form submissions cannot open another dialog or save twice.
        if (pending.current) return Promise.resolve(false);
        return new Promise((resolve) => {
            pending.current = resolve;
            setOptions(nextOptions);
        });
    }, []);

    useEffect(() => () => {
        pending.current?.(false);
        pending.current = null;
    }, []);

    return {
        confirm,
        cancelConfirmation,
        confirmationModal: options
            ? <ConfirmationModal {...options} onDecision={decide} />
            : null,
    };
}
