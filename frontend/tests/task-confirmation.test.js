import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { transformWithOxc } from "vite";

// Run form handlers and the real confirmation hook without a browser or backend.
async function formHarness(filename, props) {
    const slots = [];
    const effects = [];
    const calls = [];
    let cursor = 0;
    let tree;
    const context = vm.createContext({ document: { body: { style: {} }, addEventListener() {}, removeEventListener() {} } });
    const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
    const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
    const react = synthetic({
        useState(initial) {
            const i = cursor++;
            if (!(i in slots)) slots[i] = initial;
            return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
        },
        useRef(initial) {
            const i = cursor++;
            return slots[i] ??= { current: initial };
        },
        useCallback(callback, deps) {
            const i = cursor++;
            if (!same(slots[i]?.deps, deps)) slots[i] = { deps, callback };
            return slots[i].callback;
        },
        useEffect(effect, deps) {
            const i = cursor++;
            if (!same(slots[i]?.deps, deps)) effects.push(() => {
                slots[i]?.cleanup?.();
                slots[i] = { deps, cleanup: effect() };
            });
        },
    });
    const element = (type, props) => ({ type, props });
    const jsx = synthetic({ jsx: element, jsxs: element, Fragment: "fragment" });
    const icons = synthetic(Object.fromEntries([
        "ClipboardPlus", "Save", "X", "AlertCircle", "ClipboardList", "CopyPlus", "Plus", "Send", "Trash2",
    ].map((name) => [name, name])));
    const api = synthetic({ taskApi: Object.fromEntries([
        "create", "resubmit", "requestChange", "update", "bulkCreate",
    ].map((name) => [name, async (...args) => { calls.push({ name, args }); }])) });
    async function load(path) {
        const source = await readFile(new URL(path, import.meta.url), "utf8");
        const { code } = await transformWithOxc(source, path, { jsx: { runtime: "automatic" } });
        const module = new vm.SourceTextModule(code, { context });
        await module.link(async (name) => {
            if (name === "react") return react;
            if (name === "react/jsx-runtime") return jsx;
            if (name === "lucide-react") return icons;
            if (name.endsWith("/taskApi")) return api;
            if (name.endsWith("/useConfirmation")) return load("../src/hooks/useConfirmation.jsx");
            return synthetic({ default: name.endsWith("/ConfirmationModal") ? "confirmation" : "loader" });
        });
        return module;
    }
    const module = await load(`../src/modal/supervisor/${filename}.jsx`);
    await module.evaluate();
    function render() {
        cursor = 0;
        tree = module.namespace.default(props);
        while (effects.length) effects.shift()();
    }
    function find(predicate, node) {
        if (Array.isArray(node)) return node.map((child) => find(predicate, child)).find(Boolean);
        if (!node || typeof node !== "object") return undefined;
        if (predicate(node)) return node;
        return find(predicate, node.props?.children);
    }
    render();
    render();
    return {
        calls,
        render,
        find: (predicate) => find(predicate, tree),
        submit: () => find((node) => node.type === "form", tree).props.onSubmit({ preventDefault() {} }),
        change(id, value) {
            find((node) => node.props?.id === id, tree).props.onChange({ target: { value } });
            render();
        },
        decide(value) {
            render();
            find((node) => node.type === "confirmation", tree).props.onDecision(value);
        },
    };
}

for (const [status, method] of [[null, "create"], ["PENDING", "update"], ["REJECTED", "resubmit"], ["APPROVED", "requestChange"]]) {
    test(`${method}: validate, cancel without saving, then confirm once`, async () => {
        const task = status ? { id: "task-1", title: "Original", approval_status: status } : null;
        const form = await formHarness("TaskForm", { open: true, projectId: "project-1", task, onClose() {} });
        form.change("task-title", "Revised task");
        if (status === "REJECTED") form.change("task-resubmission_note", "Corrected scope");
        if (status === "APPROVED") form.change("task-change_reason", "Revised scope");
        const cancelled = form.submit();
        assert.equal(form.calls.length, 0);
        form.decide(false);
        await cancelled;
        form.render();
        assert.equal(form.calls.length, 0);
        assert.equal(form.find((node) => node.props?.id === "task-title").props.value, "Revised task");
        const confirmed = form.submit();
        await form.submit(); // Repeated submission while awaiting confirmation is ignored.
        assert.equal(form.calls.length, 0);
        form.decide(true);
        await confirmed;
        assert.equal(form.calls.length, 1);
        assert.equal(form.calls[0].name, method);
        if (status === "APPROVED") assert.equal(form.calls[0].args[1].new_values.title, "Revised task");
    });
}

test("invalid task data does not open confirmation or call the API", async () => {
    const form = await formHarness("TaskForm", { open: true, projectId: "project-1" });
    await form.submit();
    form.render();
    assert.equal(form.find((node) => node.type === "confirmation"), undefined);
    assert.equal(form.calls.length, 0);
});

test("bulk add waits for confirmation and submits its task batch once", async () => {
    const form = await formHarness("BulkAddTasks", { open: true, projectId: "project-1", onClose() {} });
    form.find((node) => node.type === "input" && node.props.value === "").props.onChange({ target: { value: "Batch task" } });
    form.render();
    const submission = form.submit();
    assert.equal(form.calls.length, 0);
    form.decide(true);
    await submission;
    assert.equal(form.calls.length, 1);
    assert.equal(form.calls[0].name, "bulkCreate");
    assert.equal(form.calls[0].args[1][0].title, "Batch task");
});
