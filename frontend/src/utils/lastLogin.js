export function formatLastLogin(value) {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
