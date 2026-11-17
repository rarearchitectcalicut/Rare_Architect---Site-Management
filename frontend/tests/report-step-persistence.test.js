import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { loadSource } from "./source-loader.js";

function hooks() {
    const slots = []; let cursor = 0, effects = [];
    return {
        api: {
            useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
            useRef(initial) { return slots[cursor++] ??= { current: initial }; },
            useEffect(create, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => v !== old.deps[j])) effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
        },
        render(create) { cursor = 0; effects = []; const tree = create(); effects.forEach((effect) => effect()); return tree; },
        unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
    };
}
function find(node, predicate) {
    if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
    if (!node || typeof node !== "object") return undefined;
    return predicate(node) ? node : find(node.props?.children, predicate);
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const reportId = "00000000-0000-4000-8000-000000000001", projectId = "00000000-0000-4000-8000-000000000002";
async function workspace({ workSummary = "Saved summary", uploadFailure = false, updateGate, uploadGate, removeFailure = false, records = [], confirm = async () => true } = {}) {
    const { exports: taskHelpers } = await loadSource("api/taskApi.js", { overrides: { "api/client.js": { api: {} } } });
    let active, tree; const parent = hooks(), calls = [];
    const report = { id: reportId, project: projectId, project_status: "ACTIVE", reported_by: "supervisor", status: "DRAFT", report_date: "2026-11-16", work_summary: workSummary };
    const { exports } = await loadSource("pages/admin/DailyReports.jsx", { overrides: {
        react: { ...React, useState: (...a) => active.api.useState(...a), useRef: (...a) => active.api.useRef(...a), useEffect: (...a) => active.api.useEffect(...a) },
        "hooks/useConfirmation.jsx": { useConfirmation: () => ({ confirm, confirmationModal: null }) },
        "api/dailyReportApi.js": { dailyReportApi: {
            get: async () => report, section: async (_id, section) => ({ results: section === "manpower" ? records : [], count: section === "manpower" ? records.length : 0 }),
            update: async (_id, data) => { calls.push(["diary", data]); if (updateGate) await updateGate; Object.assign(report, data); return { ...report }; },
            saveRow: async (_id, section, data) => { calls.push([section, data]); return { id: "saved-row" }; },
            upload: async () => { calls.push(["upload"]); if (uploadGate) await uploadGate; if (uploadFailure) throw new Error("Upload failed"); },
            removeRow: async () => { calls.push(["remove"]); if (removeFailure) throw new Error("Delete failed"); },
            deleteDraft: async () => { calls.push(["delete"]); },
            submit: async () => { calls.push(["submit"]); return { report: { ...report, status: "SUBMITTED" } }; },
        } },
        "api/taskApi.js": { ...taskHelpers, taskApi: { register: async () => ({ results: [], count: 0 }) } },
    }, append: "\nexport { ReportDetail }; const FormData = class { append() {} };" });
    const ui = {
        calls,
        unmount() { parent.unmount(); },
        render() { active = parent; tree = parent.render(() => exports.ReportDetail({ reportId, projectId, role: "SUPERVISOR", user: { id: "supervisor" }, externalRevision: 0, onSelect() {} })); },
        find: (predicate) => find(tree, predicate),
        step(index) { const nav = this.find((node) => node.props?.["aria-label"] === "Daily report steps"); const buttons = nav.props.children[1].props.children; buttons[index].props.children.props.onClick(); this.render(); },
        form(name) { const node = this.find((item) => item.type?.name === name); assert(node, name); active = hooks(); const form = active.render(() => node.type(node.props)); form.props.ref?.({ reportValidity: () => true }); return form; },
        props(name) { return this.find((item) => item.type?.name === name).props; },
    };
    ui.render(); await flush(); ui.render(); return ui;
}

test("diary survives forward/back navigation and later edits reach final submission", async () => {
    const ui = await workspace();
    ui.props("ReportDiaryForm").onChange((v) => ({ ...v, work_summary: "First", weather_condition: "RAINY" })); ui.render(); ui.form("ReportDiaryForm");
    ui.step(1); await flush(); ui.render(); ui.step(0);
    assert.equal(ui.props("ReportDiaryForm").values.work_summary, "First");
    assert.equal(ui.props("ReportDiaryForm").values.weather_condition, "RAINY");
    ui.props("ReportDiaryForm").onChange((v) => ({ ...v, work_summary: "Latest" })); ui.render(); ui.form("ReportDiaryForm");
    ui.step(2); await flush(); ui.render();
    await ui.find((node) => node.type === "button" && node.props.children === "Submit report").props.onClick();
    assert.deepEqual(ui.calls.map((call) => call[0]), ["diary", "submit"]);
    assert.equal(ui.calls[0][1].work_summary, "Latest");
});

test("independent activity and attachment drafts survive all steps", async () => {
    const ui = await workspace(); ui.step(1); await flush(); ui.render();
    const add = ui.find((node) => node.type === "button" && node.props.children?.[1] === "Add"); add.props.onClick(); ui.render();
    ui.props("ReportWorkForm").onChange((v) => ({ ...v, work_description: "Retained work", completion_claimed: true, task: "task" })); ui.render();
    ui.step(2); await flush(); ui.render();
    ui.find((node) => node.type === "button" && node.props.children === "Take photo / Choose files").props.onClick(); ui.render();
    const file = { name: "site.pdf", type: "application/pdf" };
    ui.props("ReportAttachmentForm").onChange({ files: [file], caption: "Retained caption", task_work: "entry" }); ui.render();
    ui.step(0); ui.step(1); await flush(); ui.render();
    assert.equal(ui.props("ReportWorkForm").values.work_description, "Retained work");
    assert.equal(ui.props("ReportWorkForm").values.completion_claimed, true);
    ui.step(2); await flush(); ui.render();
    assert.equal(ui.props("ReportAttachmentForm").values.files[0], file);
    assert.equal(ui.props("ReportAttachmentForm").values.caption, "Retained caption");
});

async function saver() {
    return (await loadSource("pages/admin/DailyReports.jsx", { append: "\nexport { saveReportDrafts }; const FormData = class { fields = {}; append(k,v) { this.fields[k] = v; } };" })).exports.saveReportDrafts;
}
const entry = (section, payload, valid = true) => ({ section, values: payload, dirty: true, snapshot: { current: { payload, validate: () => valid } } });

test("Save & Next checkpoints the draft before advancing and ignores repeated clicks", async () => {
    let finish;
    const ui = await workspace({ updateGate: new Promise((resolve) => { finish = resolve; }) });
    ui.props("ReportDiaryForm").onChange((v) => ({ ...v, work_summary: "Blockwork carried out." }));
    ui.render(); ui.form("ReportDiaryForm");
    const next = ui.find((node) => node.type === "button" && JSON.stringify(node.props.children).includes("Save & Next"));
    const first = next.props.onClick(); next.props.onClick(); await flush(); ui.render();
    assert.equal(ui.calls.filter(([kind]) => kind === "diary").length, 1);
    assert.ok(ui.props("ReportDiaryForm"));
    finish(); assert.equal(await first, true);
    ui.render(); await flush(); ui.render(); await flush(); ui.render();
    const nav = ui.find((node) => node.props?.["aria-label"] === "Daily report steps");
    assert.ok(find(nav, (node) => node.type === "button" && node.props["aria-current"] === "step" && JSON.stringify(node.props.children).includes("Work & crew")));
    ui.unmount();
});

test("Save & Next failure preserves edits and stays on the current step for retry", async () => {
    let fail;
    const ui = await workspace({ updateGate: new Promise((_, reject) => { fail = reject; }) });
    ui.props("ReportDiaryForm").onChange((v) => ({ ...v, work_summary: "Keep this draft" }));
    ui.render(); ui.form("ReportDiaryForm");
    const next = ui.find((node) => node.type === "button" && JSON.stringify(node.props.children).includes("Save & Next"));
    const pending = next.props.onClick();
    await flush(); fail(new Error("Offline"));
    assert.equal(await pending, false); ui.render();
    assert.equal(ui.props("ReportDiaryForm").values.work_summary, "Keep this draft");
    assert.ok(ui.find((node) => node.props?.role === "alert"));
    ui.unmount();
});

test("validation failure preserves every pending value and performs no writes", async () => {
    const save = await saver(); const drafts = [entry("diary", { work_summary: "Keep" }), entry("manpower", { worker_count: "bad" }, false)]; let writes = 0;
    await assert.rejects(save(reportId, drafts, { update: async () => writes++ }));
    assert.equal(writes, 0); assert.equal(drafts[0].values.work_summary, "Keep"); assert(drafts.every((row) => row.dirty));
});

test("partial row failure retries only unfinished operations and retains newer edits", async () => {
    const save = await saver(); const diary = entry("diary", { work_summary: "Old" }), row = entry("materials", { material_name: "Sand" }); let fail = true; const calls = [];
    const api = { update: async () => { calls.push("diary"); diary.values = { work_summary: "Newer" }; }, saveRow: async () => { calls.push("row"); if (fail) throw new Error("Offline"); return { id: "saved" }; } };
    await assert.rejects(save(reportId, [diary, row], api)); assert.equal(diary.values.work_summary, "Newer"); assert(diary.dirty);
    diary.snapshot.current.payload = diary.values; api.update = async () => { calls.push("new-diary"); }; fail = false;
    await save(reportId, [diary, row], api); await save(reportId, [diary, row], api);
    assert.deepEqual(calls, ["diary", "row", "new-diary", "row"]); assert.equal(row.rowId, "saved");
});

test("partial upload failure keeps remaining File objects and never repeats successful uploads", async () => {
    const save = await saver(); const a = { name: "a" }, b = { name: "b" }; const files = entry("attachments", { files: [a, b], caption: "Site", task_work: "work" }); const calls = []; let fail = true;
    const api = { upload: async (_id, data) => { const file = data.fields.file; calls.push(file.name); if (file === b && fail) throw new Error("Offline"); } };
    await assert.rejects(save(reportId, [files], api)); assert.deepEqual(files.values.files, [b]);
    fail = false; await save(reportId, [files], api); await save(reportId, [files], api);
    assert.deepEqual(calls, ["a", "b", "b"]); assert.equal(files.values.files.length, 0);
});

test("submission saves latest activity and files after the diary; upload failure never submits", async () => {
    for (const uploadFailure of [false, true]) {
        const ui = await workspace({ uploadFailure });
        ui.props("ReportDiaryForm").onChange((v) => ({ ...v, work_summary: "Latest diary" })); ui.render(); ui.form("ReportDiaryForm");
        ui.step(1); await flush(); ui.render();
        const buttons = [];
        find(ui.find((node) => node.type === "section"), (node) => { if (node.type === "button" && node.props.children?.[1] === "Add") buttons.push(node); return false; });
        buttons[1].props.onClick(); ui.render();
        ui.props("ReportRowForm").onChange((v) => ({ ...v, contractor_name: "Latest contractor", worker_count: "4" })); ui.render(); ui.form("ReportRowForm");
        ui.step(2); await flush(); ui.render();
        ui.find((node) => node.type === "button" && node.props.children === "Take photo / Choose files").props.onClick(); ui.render();
        const file = { name: "site.pdf", type: "application/pdf" };
        ui.props("ReportAttachmentForm").onChange({ files: [file], caption: "Latest evidence", task_work: "" }); ui.render();
        await ui.find((node) => node.type === "button" && node.props.children === "Submit report").props.onClick();
        assert.deepEqual(ui.calls.map((call) => call[0]), uploadFailure ? ["diary", "manpower", "upload"] : ["diary", "manpower", "upload", "submit"]);
        assert.equal(ui.calls[1][1].worker_count, 4);
        if (uploadFailure) { ui.render(); assert.equal(ui.props("ReportAttachmentForm").values.files[0], file); }
    }
});

test("different selected reports do not share draft values", async () => {
    const a = await workspace(), b = await workspace();
    a.props("ReportDiaryForm").onChange((v) => ({ ...v, work_summary: "Only report A" })); a.render();
    assert.equal(a.props("ReportDiaryForm").values.work_summary, "Only report A");
    assert.equal(b.props("ReportDiaryForm").values.work_summary, "Saved summary");
});

test("selected image preview URLs live until their image is removed or unmounted", async () => {
    const state = hooks();
    const { exports } = await loadSource("components/daily-reports/DailyReportSummary.jsx", {
        overrides: { react: { ...React, ...state.api } },
        append: '\nexport { SelectedReportImage }; export const revoked = []; const URL = { createObjectURL: (file) => "blob:" + file.name, revokeObjectURL: (url) => revoked.push(url) };',
    });
    const first = { name: "first.png" }, second = { name: "second.png" };
    state.render(() => exports.SelectedReportImage({ file: first }));
    const image = state.render(() => exports.SelectedReportImage({ file: first }));
    assert.equal(image.props.src, "blob:first.png"); assert.equal(exports.revoked.length, 0);
    assert.equal(state.render(() => exports.SelectedReportImage({ file: second })), null);
    assert.equal(exports.revoked[0], "blob:first.png");
    assert.equal(state.render(() => exports.SelectedReportImage({ file: second })).props.src, "blob:second.png");
    state.unmount(); assert.equal(exports.revoked[1], "blob:second.png");
});

function addButtons(ui) {
    const buttons = [];
    find(ui.find((node) => node.type === "section"), (node) => { if (node.type === "button" && node.props.children?.[1] === "Add") buttons.push(node); return false; });
    return buttons;
}

test("Delete Draft Options action sizes to its label and still waits for confirmation", async () => {
    const confirmations = [];
    const ui = await workspace({ confirm: async (options) => { confirmations.push(options); return false; } });
    const menu = ui.find((node) => node.type === "details" && find(node, (child) => child.type === "summary" && child.props["aria-label"] === "Report menu"));
    const button = find(menu, (node) => node.type === "button" && node.props.children === "Delete draft");
    const classes = new Set(button.props.className.split(/\s+/));
    for (const value of ["w-max", "max-w-none", "absolute", "right-0", "top-12", "z-10", "whitespace-nowrap", "rare-button", "rare-button-danger"]) assert(classes.has(value), value);
    assert.equal(button.props.type, "button");
    await button.props.onClick();
    assert.equal(confirmations.length, 1);
    assert.equal(confirmations[0].title, "Delete this draft report?");
    assert.equal(confirmations[0].confirmLabel, "Delete Draft");
    assert.equal(ui.calls.filter((call) => call[0] === "delete").length, 0);
});
test("reopening Add reuses an unfinished editor and blocks replacement by another record", async () => {
    const row = { id: "existing", daily_report: reportId, trade: "MASON", worker_count: 2 };
    const ui = await workspace({ records: [row] }); ui.step(1); await flush(); ui.render();
    addButtons(ui)[1].props.onClick(); ui.render();
    ui.props("ReportRowForm").onChange((v) => ({ ...v, contractor_name: "Keep me", worker_count: "3" })); ui.render(); ui.form("ReportRowForm");
    const original = ui.props("ReportRowForm").values;
    addButtons(ui)[1].props.onClick(); ui.render();
    assert.equal(ui.props("ReportRowForm").values, original);
    ui.find((node) => node.type === "button" && node.props.children === "Edit").props.onClick(); ui.render();
    assert.equal(ui.props("ReportRowForm").values, original);
    assert(ui.find((node) => node.props?.role === "alert"));
    ui.step(2); await flush(); ui.render();
    await ui.find((node) => node.type === "button" && node.props.children === "Submit report").props.onClick();
    assert.equal(ui.calls.filter((call) => call[0] === "manpower").length, 1);
});

for (const operation of ["save", "upload"]) {
    test(`leaving during delayed ${operation} prevents later writes and final submission`, async () => {
        let resolve;
        const gate = new Promise((done) => { resolve = done; });
        const ui = await workspace(operation === "save" ? { updateGate: gate } : { uploadGate: gate });
        ui.props("ReportDiaryForm").onChange((v) => ({ ...v, work_summary: "Pending diary" })); ui.render(); ui.form("ReportDiaryForm");
        ui.step(2); await flush(); ui.render();
        ui.find((node) => node.type === "button" && node.props.children === "Take photo / Choose files").props.onClick(); ui.render();
        ui.props("ReportAttachmentForm").onChange({ files: [{ name: "one.pdf", type: "application/pdf" }, { name: "two.pdf", type: "application/pdf" }], caption: "Keep", task_work: "" }); ui.render();
        const pending = ui.find((node) => node.type === "button" && node.props.children === "Submit report").props.onClick();
        await flush(); ui.unmount(); resolve(); await pending;
        assert.deepEqual(ui.calls.map((call) => call[0]), operation === "save" ? ["diary"] : ["diary", "upload"]);
    });
}

for (const removeFailure of [false, true]) {
    test(`${removeFailure ? "failed" : "successful"} deletion ${removeFailure ? "preserves" : "retires"} the pending record editor`, async () => {
        const row = { id: "existing", daily_report: reportId, trade: "MASON", worker_count: 2 };
        const ui = await workspace({ records: [row], removeFailure }); ui.step(1); await flush(); ui.render();
        ui.find((node) => node.type === "button" && node.props.children === "Edit").props.onClick(); ui.render();
        ui.props("ReportRowForm").onChange((v) => ({ ...v, contractor_name: "Pending edit" })); ui.render(); ui.form("ReportRowForm");
        await ui.find((node) => node.type === "button" && node.props.children === "Remove").props.onClick();
        await flush(); ui.render();
        await flush(); ui.render();
        const editor = ui.find((node) => node.type?.name === "ReportRowForm");
        assert.equal(Boolean(editor), removeFailure);
        if (removeFailure) assert.equal(editor.props.values.contractor_name, "Pending edit");
        ui.step(2); await flush(); ui.render();
        await ui.find((node) => node.type === "button" && node.props.children === "Submit report").props.onClick();
        assert.equal(ui.calls.filter((call) => call[0] === "manpower").length, removeFailure ? 1 : 0);
    });
}

for (const workSummary of ["", "   \t\n"]) {
    test(`empty Work Summary prevents final submission with field feedback (${JSON.stringify(workSummary)})`, async () => {
        const ui = await workspace({ workSummary });
        ui.step(2); await flush(); ui.render();
        await ui.find(node => node.type === "button" && node.props.children === "Submit report").props.onClick();
        ui.render();
        assert.deepEqual(ui.calls, [], "invalid summary must not save or submit anything");
        assert.equal(ui.props("ReportDiaryForm").workSummaryError, "Work Summary is required.");
        assert.ok(!(JSON.stringify(ui.find(node => node.props?.role === "alert")) || "").includes("Unable to complete this operation."));
        assert.equal(ui.props("ReportDiaryForm").busy, false);
    });
}

test("latest unsaved blank summary is validated and valid input clears field feedback before retry", async () => {
    const ui = await workspace();
    ui.props("ReportDiaryForm").onChange(v => ({ ...v, work_summary: "  ", site_notes: "Keep this note" }));
    ui.render(); ui.form("ReportDiaryForm"); ui.step(2); await flush(); ui.render();
    await ui.find(node => node.type === "button" && node.props.children === "Submit report").props.onClick(); ui.render();
    assert.deepEqual(ui.calls, []);
    assert.equal(ui.props("ReportDiaryForm").workSummaryError, "Work Summary is required.");
    ui.props("ReportDiaryForm").onChange(v => ({ ...v, weather_condition: "RAINY" })); ui.render();
    assert.equal(ui.props("ReportDiaryForm").workSummaryError, "Work Summary is required.");
    ui.props("ReportDiaryForm").onChange(v => ({ ...v, work_summary: "Foundation completed" })); ui.render();
    assert.equal(ui.props("ReportDiaryForm").workSummaryError, "");
    assert.equal(ui.props("ReportDiaryForm").values.site_notes, "Keep this note");
    ui.form("ReportDiaryForm"); ui.step(2); await flush(); ui.render();
    await ui.find(node => node.type === "button" && node.props.children === "Submit report").props.onClick();
    assert.deepEqual(ui.calls.map(call => call[0]), ["diary", "submit"]);
    assert.equal(ui.calls[0][1].work_summary, "Foundation completed");
});
