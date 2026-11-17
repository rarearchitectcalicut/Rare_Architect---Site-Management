import { useId, useState } from "react";

export function CharacterLimitNotice({ value, maximum, codePoints = false }) {
    const length = codePoints ? Array.from(value || "").length : (value || "").length;
    if (length < maximum) return null;
    return <span role="status" className="mt-2 block text-xs text-warning">Maximum {maximum} characters reached.</span>;
}

export function DiaryMoreDetails({ defaultOpen, children }) {
    const [expanded, setExpanded] = useState(defaultOpen);
    const contentId = useId();
    return <div className="sm:col-span-2">
        <button type="button" className="rare-button rare-button-secondary" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded((value) => !value)}>More details</button>
        <div id={contentId} hidden={!expanded} className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </div>;
}

