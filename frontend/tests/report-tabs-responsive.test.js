import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { readFile } from "node:fs/promises";
import { loadSource } from "./source-loader.js";

function find(node, predicate) {
    if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } return; }
    if (!node || typeof node !== "object") return;
    return predicate(node) ? node : find(node.props?.children, predicate);
}
function scrollContainer({ mobile = true, left = 0, right = 100 } = {}) {
    return { scrollLeft: 0, ownerDocument: { defaultView: { matchMedia: () => ({ matches: mobile }) } },
        getBoundingClientRect: () => ({ left: 0, right: 320 }),
        querySelector: selector => { assert.equal(selector, '[aria-pressed="true"]'); return { getBoundingClientRect: () => ({ left, right }) }; },
    };
}
async function page(role, status = "SUBMITTED") {
    const slots = [], effects = []; let cursor = 0, tree;
    const { exports } = await loadSource("pages/admin/DailyReports.jsx", { overrides: {
        react: { ...React,
            useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
            useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
            useEffect(create, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((value, j) => value !== old.deps[j])) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
        },
        "hooks/useConfirmation.jsx": { useConfirmation: () => ({ confirm: async () => true, confirmationModal: null }) },
        "api/dailyReportApi.js": { dailyReportApi: {
            get: async () => ({ id: "00000000-0000-4000-8000-000000000001", project: "project", status, project_status: "ACTIVE", reported_by: "supervisor", report_date: "2026-11-16" }),
            section: async () => ({ results: [], count: 0 }),
        } },
    }, append: "\nexport { ReportDetail, revealActiveReportTab };" });
    const draw = () => { cursor = 0; tree = exports.ReportDetail({ reportId: "00000000-0000-4000-8000-000000000001", projectId: "project", role, user: { id: "supervisor" }, externalRevision: 0 }); while (effects.length) effects.shift()(); };
    draw(); await new Promise(resolve => setTimeout(resolve, 0)); draw();
    return { exports, draw, nav: label => find(tree, node => node.type === "nav" && node.props["aria-label"] === label), cleanup() { for (const slot of slots) slot?.cleanup?.(); } };
}
for (const role of ["ADMIN", "SUPERVISOR"]) {
    test(`${role} submitted report retains tab order and reveals the selected mobile tab`, async () => {
        const ui = await page(role);
        try {
            const nav = ui.nav("Report sections");
            assert.ok(nav.props.className.includes("report-detail-tab-row"));
            const tabs = nav.props.children;
            assert.deepEqual(Array.from(tabs, button => button.key), ["overview", "diary", "work-entries", "manpower", "materials", "attachments"]);
            const container = scrollContainer({ left: 420, right: 540 });
            nav.props.ref.current = container;
            tabs[5].props.onClick(); ui.draw();
            assert.equal(ui.nav("Report sections").props.children[5].props["aria-pressed"], true);
            assert.equal(container.scrollLeft, 220);
        } finally { ui.cleanup(); }
    });
}

test("Admin draft tabs retain existing names, order and scrolling hook", async () => {
    const ui = await page("ADMIN", "DRAFT");
    try {
        const nav = ui.nav("Daily report sections");
        assert.ok(nav.props.className.includes("report-detail-tab-row"));
        assert.deepEqual(Array.from(nav.props.children, button => button.key), ["diary", "work-entries", "manpower", "materials", "attachments", "review"]);
        assert.ok(nav.props.ref);
    } finally { ui.cleanup(); }
});

test("active-tab scrolling handles left overflow, visible tabs and desktop without page scrolling", async () => {
    const ui = await page("ADMIN");
    try {
        const left = scrollContainer({ left: -90, right: 10 }); left.scrollLeft = 120;
        ui.exports.revealActiveReportTab(left); assert.equal(left.scrollLeft, 30);
        const visible = scrollContainer(); ui.exports.revealActiveReportTab(visible); assert.equal(visible.scrollLeft, 0);
        const desktop = scrollContainer({ mobile: false, left: 500, right: 600 });
        ui.exports.revealActiveReportTab(desktop); assert.equal(desktop.scrollLeft, 0);
        ui.exports.revealActiveReportTab(null);
    } finally { ui.cleanup(); }
});

test("mobile-only report styles prohibit wrapping without shrinking tab buttons", async () => {
    const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
    const rule = css.indexOf(".daily-report-detail .report-detail-tab-row");
    const media = css.lastIndexOf("@media", rule);
    assert.ok(css.slice(media, rule).startsWith("@media (max-width: 1023px)"));
    assert.match(css.slice(rule), /\.report-detail-tab-row \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/);
    assert.match(css.slice(rule), /\.report-detail-tab-row > button \{ flex: 0 0 auto; white-space: nowrap; \}/);
    assert.ok(!css.includes("flex-basis: calc(33.333% - .25rem)"));
});
