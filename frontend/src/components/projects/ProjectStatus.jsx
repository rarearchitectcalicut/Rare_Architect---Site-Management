export function ProjectStatus({ status }) {
    const styles = {
        ACTIVE: "bg-pastel-mint text-success",
        MAINTENANCE: "bg-pastel-butter text-warning",
        COMPLETED: "bg-pastel-sky text-info",
        ON_HOLD: "bg-pastel-butter text-warning",
        CANCELLED: "bg-pastel-blush text-danger",
    };
    return <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${styles[status] || "bg-app text-muted"}`}>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
        {String(status || "Unknown").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}
    </span>;
}
