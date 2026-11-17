import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./source-loader.js";
const { exports } = await loadSource("components/delays/DelayReportCard.jsx");
const item = { id: "delay", requestType: "extension", title: "Blockwork", projectName: "Lake House", creator: "Site Supervisor", status: "PENDING", raw: { status: "APPROVED", delay_type: "MATERIAL_DELAY", extension_requested: true, extension_status: "PENDING", current_end_date: "2026-12-01", requested_end_date: "2026-12-08" } };

test("delay card distinguishes report approval from the pending extension and requested date", () => {
    const html = renderToStaticMarkup(React.createElement(exports.default, { item, onOpen() {} }));
    for (const text of ["Delay: Approved", "Extension: Pending", "Current deadline", "Requested deadline", "01 Dec 2026", "08 Dec 2026", "Lake House"]) assert(html.includes(text), text);
    assert.equal((html.match(/<button\b/g) || []).length, 1);
    assert(!html.includes("<a "));
});
test("delay card forwards the original queue item to its authorized review workflow", () => {
    let opened;
    const tree = exports.default({ item, onOpen: (value) => { opened = value; } });
    tree.props.onClick();
    assert.equal(opened, item);
    assert.equal(tree.props["aria-haspopup"], "dialog");
});
