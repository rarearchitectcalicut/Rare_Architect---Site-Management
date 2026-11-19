// Runs before styles load so the first paint uses the saved appearance.
(() => {
    const key = "rare.appearance";
    const root = document.documentElement;
    const valid = (value) => value === "dark" ? "dark" : "light";
    let preference = "light";
    try { preference = valid(localStorage.getItem(key)); } catch { /* Storage may be unavailable. */ }

    function apply() {
        const theme = preference;
        root.dataset.appearance = preference;
        root.dataset.theme = theme;
        root.style.colorScheme = theme;
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111720" : "#f8f9fc");
        window.dispatchEvent(new Event("rare:appearance-updated"));
    }

    window.addEventListener("rare:appearance-change", (event) => {
        preference = valid(event.detail);
        try { localStorage.setItem(key, preference); } catch { /* Keep the choice for this session. */ }
        apply();
    });
    window.addEventListener("storage", (event) => {
        if (event.key === key || event.key === null) {
            preference = valid(event.newValue);
            apply();
        }
    });
    apply();
})();
