export default function Meta({ label, value }) {
    return (
        <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.11em] text-muted">
                {label}
            </p>
            <p className="mt-1.5 whitespace-pre-wrap wrap-anywhere text-sm font-semibold text-ink">
                {value || "Not specified"}
            </p>
        </div>
    );
}

