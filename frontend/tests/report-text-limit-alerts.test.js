import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { loadSource } from "./source-loader.js";

const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx", {
    overrides: { react: { ...React, useState: initial => [typeof initial === "function" ? initial() : initial, () => {}], useId: () => "test-more-details" } },
    append: "\nexport { CharacterLimitNotice };",
});
function find(node, predicate) {
    if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } return; }
    if (!node || typeof node !== "object") return;
    return predicate(node) ? node : find(node.props?.children, predicate);
}
const cases = [
    { name: "guided site condition", Component: exports.ReportDiaryForm, props: { guided: true }, field: "site_condition", maximum: 255, htmlLimit: true },
    { name: "standalone site condition", Component: exports.ReportDiaryForm, props: {}, field: "site_condition", maximum: 255, htmlLimit: true },
    { name: "work location", Component: exports.ReportWorkForm, props: { initial: { measurement_method: "COMPLETION_ONLY" } }, field: "location_detail", maximum: 255, htmlLimit: true },
    { name: "contractor name", Component: exports.ReportRowForm, props: { section: "manpower" }, field: "contractor_name", maximum: 200 },
    { name: "material name", Component: exports.ReportRowForm, props: { section: "materials" }, field: "material_name", maximum: 200 },
    { name: "material unit", Component: exports.ReportRowForm, props: { section: "materials" }, field: "unit", maximum: 30 },
    { name: "caption", Component: exports.ReportAttachmentForm, props: {}, field: "caption", maximum: 1000, htmlLimit: true },
];
function harness(spec) {
    let values = { report_date: "2026-11-17", work_summary: "", site_condition: "", weather_condition: "", site_notes: "", issues: "", next_day_plan: "", work_description: "Work", location_detail: "", worker_count: "1", hours_worked: "", contractor_name: "", remarks: "", material_name: "", quantity: "", unit: "", files: [], caption: "" };
    const saves = [], stages = [];
    const draw = () => spec.Component({ ...spec.props, values, onChange: next => { values = typeof next === "function" ? next(values) : next; }, onSave: value => saves.push(value), onStage: value => stages.push(value) });
    const html = () => renderToStaticMarkup(React.createElement(MemoryRouter, null, draw()));
    return { draw, html, saves, stages, set(value) { values = { ...values, [spec.field]: value }; }, values: () => values };
}
for (const spec of cases) {
    test(`${spec.name}: message appears at its existing limit and clears below it`, () => {
        const ui = harness(spec);
        ui.set("a".repeat(spec.maximum - 1)); assert.ok(!ui.html().includes("characters reached."));
        const before = ui.values(); const tree = ui.draw();
        const input = find(tree, node => node.type === "input" && node.props.value === before[spec.field]);
        assert.ok(input, spec.name);
        assert.equal(input.props.maxLength, spec.htmlLimit ? spec.maximum : undefined);
        input.props.onChange({ target: { value: "a".repeat(spec.maximum) } });
        const reached = ui.html();
        assert.ok(reached.includes(`Maximum ${spec.maximum} characters reached.`));
        assert.equal((reached.match(/characters reached\./g) || []).length, 1);
        assert.ok(reached.includes('role="status"'));
        const fullInput = find(ui.draw(), node => node.type === "input" && node.props.value === ui.values()[spec.field]);
        fullInput.props.onChange({ target: { value: "a".repeat(spec.maximum - 1) } });
        assert.ok(!ui.html().includes("characters reached."));
        assert.equal(ui.saves.length, 0);
    });
    test(`${spec.name}: programmatic over-limit values show feedback without truncation`, () => {
        const ui = harness(spec); ui.set("b".repeat(spec.maximum + 1));
        assert.ok(ui.html().includes(`Maximum ${spec.maximum} characters reached.`));
        assert.equal(ui.values()[spec.field].length, spec.maximum + 1);
    });
}

test("uncapped report fields remain uncapped and receive no limit messages", () => {
    for (const spec of [cases[0], cases[2], cases[3], cases[4]]) {
        const ui = harness(spec);
        const tree = ui.draw();
        const field = spec.props.section
            ? find(find(tree, node => node.type === "label" && node.props.children?.[0] === "Remarks"), node => node.type === "input")
            : find(tree, node => node.type === "textarea");
        field.props.onChange({ target: { value: "Uncapped text ".repeat(2000) } });
        assert.ok(!ui.html().includes("characters reached."));
    }
});

test("backend-only messages use Unicode characters while HTML limits use UTF-16 length", () => {
    const render = props => renderToStaticMarkup(React.createElement(exports.CharacterLimitNotice, props));
    const emoji = String.fromCodePoint(0x1f600);
    assert.equal(render({ value: emoji.repeat(199), maximum: 200, codePoints: true }), "");
    assert.ok(render({ value: emoji.repeat(200), maximum: 200, codePoints: true }).includes("Maximum 200"));
    assert.equal(render({ value: emoji.repeat(127), maximum: 255 }), "");
    assert.ok(render({ value: emoji.repeat(127) + "a", maximum: 255 }).includes("Maximum 255"));
});
