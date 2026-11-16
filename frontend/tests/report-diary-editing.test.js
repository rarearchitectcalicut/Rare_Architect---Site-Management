import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { loadSource } from "./source-loader.js";

test("guided diary keeps edits while moving between fields and saves only on submit", async () => {
    let values;
    const saves = [];
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx", {
        overrides: {
            react: { ...React, useState(initial) {
                values ??= typeof initial === "function" ? initial() : initial;
                return [values, (next) => { values = typeof next === "function" ? next(values) : next; }];
            } },
        },
    });
    const render = (busy = false) => exports.ReportDiaryForm({
        report: { report_date: "2026-11-16" }, guided: true, busy,
        onSave: (payload) => saves.push(payload),
    });
    function find(node, predicate) {
        if (!node || typeof node !== "object") return null;
        if (predicate(node)) return node;
        for (const child of React.Children.toArray(node.props?.children)) {
            const match = find(child, predicate);
            if (match) return match;
        }
        return null;
    }
    let form = render();
    assert.equal(form.props.onBlurCapture, undefined);
    let summary = find(form, (node) => node.type === "textarea" && node.props.required);
    summary.props.onChange({ target: { value: "Foundation work continued" } });
    form = render();
    summary = find(form, (node) => node.type === "textarea" && node.props.required);
    assert.equal(summary.props.value, "Foundation work continued");
    assert.equal(saves.length, 0);
    assert(find(form, (node) => node.type === "button" && node.props.type === "submit"));
    let prevented = false;
    form.props.onSubmit({ preventDefault() { prevented = true; } });
    assert(prevented);
    assert.equal(saves.length, 1);
    assert.equal(saves[0].work_summary, "Foundation work continued");
    render(true).props.onSubmit({ preventDefault() {} });
    assert.equal(saves.length, 1, "busy forms must not submit duplicate saves");
});

test("controlled diary uses retained values instead of a stale saved report", async () => {
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx", { overrides: {
        react: { ...React, useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}] },
    } });
    let values = { report_date: "2026-11-16", work_summary: "Latest unsaved", weather_condition: "RAINY" };
    const saved = [];
    const render = () => exports.ReportDiaryForm({ report: { work_summary: "Older server response" }, values, onChange: (next) => { values = typeof next === "function" ? next(values) : next; }, onSave: (payload) => saved.push(payload), guided: true });
    render().props.onSubmit({ preventDefault() {} });
    assert.equal(saved[0].work_summary, "Latest unsaved");
    assert.equal(saved[0].weather_condition, "RAINY");
});

test("guided More details uses a RARE button and linked expanded-state semantics", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx");
    for (const hasDetails of [false, true]) {
        const html = renderToStaticMarkup(React.createElement(exports.ReportDiaryForm, {
            guided: true, report: { report_date: "2026-11-16", work_summary: "Foundation", site_notes: hasDetails ? "Retained note" : "" }, onSave() {},
        }));
        const trigger = html.match(/<button[^>]*>More details<\/button>/)?.[0];
        assert.ok(trigger);
        assert.ok(trigger.includes('type="button"'));
        assert.ok(trigger.includes('class="rare-button rare-button-secondary"'));
        assert.ok(trigger.includes(`aria-expanded="${hasDetails}"`));
        const contentId = trigger.match(/aria-controls="([^"]+)"/)[1];
        assert.ok(html.includes(`id="${contentId}"`));
        assert.equal(html.includes(`id="${contentId}" hidden=""`), !hasDetails);
        assert.ok(html.includes("Issues and safety observations"));
        assert.ok(html.includes("Foundation"));
        if (hasDetails) assert.ok(html.includes("Retained note"));
        assert.ok(!html.includes("<summary"));
    }
});

test("More details toggles without replacing its fields or changing form values", async () => {
    let expanded;
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx", {
        overrides: { react: { ...React,
            useId: () => "more-details-test",
            useState(initial) { expanded ??= initial; return [expanded, value => { expanded = typeof value === "function" ? value(expanded) : value; }]; },
        } }, append: "\nexport { DiaryMoreDetails };",
    });
    const fields = React.createElement("textarea", { value: "Unsaved note", onChange() {} });
    const draw = () => exports.DiaryMoreDetails({ defaultOpen: false, children: fields });
    let tree = draw();
    assert.equal(tree.props.children[0].props["aria-expanded"], false);
    assert.equal(tree.props.children[1].props.hidden, true);
    for (const open of [true, false, true]) {
        tree.props.children[0].props.onClick(); tree = draw();
        assert.equal(tree.props.children[0].props["aria-expanded"], open);
        assert.equal(tree.props.children[1].props.hidden, !open);
        assert.equal(tree.props.children[1].props.children, fields);
    }
});

test("standalone diary retains its existing fields without the guided disclosure", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx");
    const html = renderToStaticMarkup(React.createElement(exports.ReportDiaryForm, { report: { work_summary: "Existing draft" }, onSave() {} }));
    assert.ok(!html.includes("More details"));
    assert.ok(html.includes("Existing draft"));
    assert.ok(html.includes('type="date"'));
    assert.ok(html.includes('type="submit"'));
});

test("Work Summary validation message is associated with only its field", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx");
    const render = workSummaryError => renderToStaticMarkup(React.createElement(exports.ReportDiaryForm, {
        report: { id: "draft", work_summary: "" }, guided: true, workSummaryError, onSave() {},
    }));
    const invalid = render("Work Summary is required.");
    assert.ok(invalid.includes('aria-invalid="true"'));
    assert.ok(invalid.includes('aria-describedby="work-summary-error-draft"'));
    assert.ok(invalid.includes('id="work-summary-error-draft" role="alert"'));
    assert.ok(invalid.includes("Work Summary is required."));
    assert.equal((invalid.match(/aria-invalid="true"/g) || []).length, 1);
    const valid = render("");
    assert.ok(!valid.includes("Work Summary is required."));
    assert.ok(!valid.includes('aria-invalid="true"'));
    assert.ok(!valid.includes('aria-describedby="work-summary-error-draft"'));
});
