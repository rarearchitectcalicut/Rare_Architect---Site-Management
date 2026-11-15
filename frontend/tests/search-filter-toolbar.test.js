import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./source-loader.js";

test("shared search toolbar places search first and keeps filters in an accessible dialog", async () => {
    const { exports } = await loadSource("components/common/SearchFilterToolbar.jsx");
    const html = renderToStaticMarkup(createElement(exports.default, {
        label: "Project search and filters",
        search: createElement("input", { "aria-label": "Search projects" }),
        activeCount: 2,
        onClear() {},
    }, createElement("label", null, "Status", createElement("select", { "aria-label": "Filter by status" }))));

    assert.ok(html.indexOf('aria-label="Search projects"') < html.indexOf('aria-label="Filters, 2 active filters"'));
    assert.ok(html.includes('aria-haspopup="dialog"'));
    assert.ok(html.includes('aria-controls="search-filter-dialog"'));
    assert.ok(html.includes('role="dialog"'));
    assert.ok(html.includes('aria-modal="true"'));
    assert.ok(html.includes('aria-label="Filter by status"'));
    assert.ok(html.includes("Close filters"));
    assert.ok(html.includes("Clear all"));
    assert.ok(html.includes("Apply"));
});
