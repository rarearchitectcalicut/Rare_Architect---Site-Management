
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export function getMediaUrl(value) {
    if (!value || typeof value !== "string") {
        return null;
    }

    try {
        const pageOrigin = globalThis.location?.origin;
        const apiBase = new URL(API_BASE_URL, pageOrigin);
        const usesProxy = API_BASE_URL.startsWith("/") &&
            !API_BASE_URL.startsWith("//");

        // Support absolute URLs.
        const resolved = new URL(
            /^[a-z][a-z\d+.-]*:/i.test(value) ||
                value.startsWith("/")
                ? value
                : `/${value}`,
            apiBase.origin
        );

        // Only allow HTTP(S) image URLs.
        if (!["http:", "https:"].includes(resolved.protocol)) {
            return null;
        }

        // Vite's changeOrigin proxy makes Django return loopback media URLs.
        // Route those through /media on the origin the phone actually opened.
        if (usesProxy &&
            ["localhost", "127.0.0.1", "[::1]"].includes(resolved.hostname) &&
            resolved.pathname.startsWith("/media/")) {
            return new URL(
                resolved.pathname + resolved.search + resolved.hash,
                apiBase.origin
            ).href;
        }

        return resolved.href;
    } catch {
        return null;
    }
}
