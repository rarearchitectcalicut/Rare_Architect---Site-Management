/* Imported by the existing Workbox service worker; never register this file. */
(() => {
    const destinations = new Set(["admin/notifications", "supervisor/notifications"]);
    function destination(value) {
        return new URL(destinations.has(value) ? value : "", self.registration.scope).href;
    }

    self.addEventListener("push", (event) => {
        let payload = {};
        try { payload = event.data?.json() || {}; } catch { /* Show a generic notification. */ }
        if (typeof payload !== "object" || Array.isArray(payload)) payload = {};
        const id = typeof payload.id === "string" && /^[0-9a-f-]{36}$/i.test(payload.id) ? payload.id : "update";
        event.waitUntil(self.registration.showNotification("RARE", {
            body: "You have a new notification in RARE.",
            icon: new URL("pwa-192.png", self.registration.scope).href,
            badge: new URL("pwa-192.png", self.registration.scope).href,
            tag: `rare-notification:${id}`,
            data: { url: destination(payload.destination) },
        }));
    });

    self.addEventListener("notificationclick", (event) => {
        event.notification.close();
        event.waitUntil((async () => {
            // Revalidate notification data too; never navigate to an arbitrary URL.
            const safe = [...destinations].map(destination);
            const requested = event.notification.data?.url;
            const target = safe.includes(requested) ? requested : destination("");
            const scope = new URL(self.registration.scope);
            const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
            for (const client of windows) {
                const current = new URL(client.url);
                if (current.origin !== scope.origin || !current.pathname.startsWith(scope.pathname)) continue;
                try {
                    const opened = current.href === target ? client : await client.navigate(target);
                    if (opened) { await opened.focus(); return; }
                } catch { /* Fall back to opening the same-origin app. */ }
            }
            await self.clients.openWindow(target);
        })());
    });
})();
