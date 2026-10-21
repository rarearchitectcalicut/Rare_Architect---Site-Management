
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export function getMediaUrl(value) {
    if (!value || typeof value !== "string") {
        return null;
    }

    try {
        const apiBase = new URL(API_BASE_URL);

        // Support absolute URLs.
        const resolved = new URL(
            value.startsWith("http://") ||
                value.startsWith("https://") ||
                value.startsWith("/")
                ? value
                : `/${value}`,
            apiBase.origin
        );

        // Only allow HTTP(S) image URLs.
        if (!["http:", "https:"].includes(resolved.protocol)) {
            return null;
        }

        return resolved.href;
    } catch {
        return null;
    }
}
