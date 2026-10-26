import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { transformWithOxc } from "vite";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { loadSource } from "./source-loader.js";

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

async function executionHarness({ status = "NOT_STARTED", role = "SUPERVISOR", save } = {}) {
    const slots = [];
    let cursor = 0, effects = [], tree;
    const calls = [], successes = [];
    const same = (a, b) => a && a.length === b.length && a.every((value, i) => value === b[i]);
    const hooks = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
        useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
        useId() { return `execution-${cursor++}`; },
        useEffect(create, deps) { const i = cursor++; const previous = slots[i]; if (!same(previous?.deps, deps)) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
    };
    const { exports } = await loadSource("components/tasks/TaskExecutionActions.jsx", { overrides: {
        react: { ...React, ...hooks },
        "api/taskApi.js": { taskApi: Object.fromEntries(["start", "complete", "cancel", "reopen"].map((name) => [name, async (...args) => {
            calls.push({ name, args });
            return save ? save(name, ...args) : { task: { id: "task", work_status: name === "cancel" ? "CANCELLED" : "IN_PROGRESS" } };
        }])) },
    }, append: '\nconst window = { confirm: () => true };' });
    function walk(predicate, node) {
        if (Array.isArray(node)) return node.map((child) => walk(predicate, child)).find(Boolean);
        if (!node || typeof node !== "object") return;
        if (predicate(node)) return node;
        return walk(predicate, node.props?.children);
    }
    const find = (predicate) => walk(predicate, tree);
    function text(node) {
        if (typeof node === "string") return node;
        if (Array.isArray(node)) return node.map(text).join("");
        return node && typeof node === "object" ? text(node.props?.children) : "";
    }
    function render() {
        cursor = 0; effects = [];
        tree = exports.default({ task: { id: "task", approval_status: "APPROVED", work_status: status }, role, onSuccess: (...args) => successes.push(args) });
        const dialog = find((node) => node.type === "dialog");
        if (dialog) dialog.props.ref.current = { showModal() {}, close() {} };
        effects.forEach((effect) => effect());
    }
    render();
    return {
        calls, successes, render,
        button: (label) => find((node) => node.type === "button" && text(node) === label),
        find,
        reason(value) { find((node) => node.type === "textarea").props.onChange({ target: { value } }); render(); },
        submit() { find((node) => node.type === "form").props.onSubmit({ preventDefault() {} }); },
        cleanup() { slots.forEach((slot) => slot?.cleanup?.()); },
    };
}

const flushExecution = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test("Supervisor cancellation requires a reason and confirmation, and ignores duplicate submissions", async () => {
    let resolve;
    const ui = await executionHarness({ save: () => new Promise((done) => { resolve = done; }) });
    assert(ui.button("Start Task"));
    ui.button("Cancel Task").props.onClick(); ui.render();
    assert.equal(ui.calls.length, 0);
    ui.reason("  "); ui.submit(); ui.render();
    assert.equal(ui.calls.length, 0);
    assert(ui.find((node) => node.props?.role === "alert"));
    ui.reason("  Scope removed  ");
    ui.submit(); ui.submit(); ui.render();
    assert.equal(ui.calls.length, 1);
    assert.equal(ui.calls[0].name, "cancel");
    assert.equal(ui.calls[0].args[1], "Scope removed");
    assert.equal(ui.find((node) => node.type === "textarea").props.disabled, true);
    resolve({ task: { id: "task", work_status: "CANCELLED" } });
    await flushExecution(); ui.render();
    assert.equal(ui.successes[0][0], "cancel");
    assert.equal(ui.successes[0][1].work_status, "CANCELLED");
    assert.equal(ui.find((node) => node.type === "dialog"), undefined);
    ui.cleanup();
});

test("cancellation can be dismissed and backend errors remain retryable", async () => {
    let attempts = 0;
    const ui = await executionHarness({ status: "IN_PROGRESS", save: async () => {
        if (++attempts === 1) throw { response: { data: { reason: ["Please explain the cancellation."] } } };
        return { task: { work_status: "CANCELLED" } };
    } });
    assert(ui.button("Complete Task"));
    ui.button("Cancel Task").props.onClick(); ui.render();
    ui.button("Back").props.onClick(); ui.render();
    assert.equal(ui.calls.length, 0);
    ui.button("Cancel Task").props.onClick(); ui.render(); ui.reason("Reason"); ui.submit();
    await flushExecution(); ui.render();
    assert(ui.find((node) => node.props?.role === "alert"));
    assert.equal(ui.successes.length, 0);
    ui.reason("Revised reason");
    assert.equal(ui.find((node) => node.props?.role === "alert"), undefined);
    ui.submit(); await flushExecution(); ui.render();
    assert.equal(ui.calls.length, 2);
    assert.equal(ui.successes.length, 1);
    ui.cleanup();
});

test("only Admin gets the completed-task reopen action and it refreshes after confirmation", async () => {
    const supervisor = await executionHarness({ status: "COMPLETED" });
    assert.equal(supervisor.button("Reopen Task"), undefined);
    assert.equal(supervisor.button("Cancel Task"), undefined);
    supervisor.cleanup();
    const admin = await executionHarness({ status: "COMPLETED", role: "ADMIN" });
    admin.button("Reopen Task").props.onClick(); admin.render();
    assert.equal(admin.calls.length, 0);
    admin.reason("Corrective work"); admin.submit(); await flushExecution(); admin.render();
    assert.equal(admin.calls[0].name, "reopen");
    assert.equal(admin.successes[0][0], "reopen");
    admin.cleanup();
});

test("cancelled tasks have no Supervisor execution buttons", async () => {
    const ui = await executionHarness({ status: "CANCELLED" });
    for (const label of ["Start Task", "Complete Task", "Cancel Task", "Reopen Task"]) assert.equal(ui.button(label), undefined);
    ui.cleanup();
});

test("lifecycle API methods post the reason through the existing authenticated client", async () => {
    const calls = [];
    const { exports } = await loadSource("api/taskApi.js", { overrides: { "api/client.js": { api: { post: async (...args) => { calls.push(args); return { data: {} }; } } } } });
    await exports.taskApi.cancel("task", "Scope removed");
    await exports.taskApi.reopen("task", "Correction");
    assert.equal(calls[0][0], "tasks/task/cancel/"); assert.equal(calls[0][1].reason, "Scope removed");
    assert.equal(calls[1][0], "tasks/task/reopen/"); assert.equal(calls[1][1].reason, "Correction");
});

const registerTask = {
    id: "22222222-2222-2222-2222-222222222222", project: "11111111-1111-1111-1111-111111111111",
    project_name: "Courtyard House", title: "Slab", description: "Concrete slab", worker_name: "Concrete team",
    approval_status: "PENDING", work_status: "NOT_STARTED", priority: "HIGH", display_order: 2,
    is_overdue: false, supervisors: [{ id: "33333333-3333-3333-3333-333333333333", name: "Site Supervisor" }],
};
function registerResponse(role = "ADMIN") {
    return {
        count: 100, next: "https://untrusted.test/next", previous: null, results: [registerTask],
        summary: { total: 100, pending_approval: 10, not_started: 20, in_progress: 30, completed: 40, overdue: 5 },
        filter_options: { projects: [{ id: registerTask.project, name: registerTask.project_name }], supervisors: role === "ADMIN" ? registerTask.supervisors : [] },
    };
}

async function registerHarness(role = "ADMIN") {
    const slots = [];
    const requests = [];
    let cursor = 0, effects = [], query = new URLSearchParams(), tree;
    const hooks = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
        useEffect(create, deps) { const i = cursor++; const previous = slots[i]; if (!previous || deps.some((value, j) => value !== previous.deps[j])) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
    };
    const { exports: helpers } = await loadSource("api/taskApi.js", { overrides: { "api/client.js": { api: {} } } });
    const { exports } = await loadSource("pages/admin/ProjectTasks.jsx", { overrides: {
        react: { ...React, ...hooks },
        "react-router-dom": { Link() {}, useParams: () => ({}), useSearchParams: () => [query, (next) => { query = new URLSearchParams(next); }] },
        "api/taskApi.js": { ...helpers, taskApi: { register: (params, signal) => new Promise((resolve, reject) => requests.push({ params, signal, resolve, reject })) } },
    }, append: '\nconst AbortController = class { signal = { aborted: false }; abort() { this.signal.aborted = true; } }; export { GlobalTaskRegisterPage };' });
    function walk(predicate, node) {
        if (Array.isArray(node)) return node.map((child) => walk(predicate, child)).find(Boolean);
        if (!node || typeof node !== "object") return;
        return predicate(node) ? node : walk(predicate, node.props?.children);
    }
    function render() { cursor = 0; effects = []; tree = exports.GlobalTaskRegisterPage({ role }); effects.forEach((effect) => effect()); }
    render();
    return {
        requests, render,
        find: (predicate) => walk(predicate, tree),
        navigate(params) { query = new URLSearchParams(params); render(); },
        cleanup() { slots.forEach((slot) => slot?.cleanup?.()); },
    };
}

test("Admin register uses server-wide totals and links to existing detail and approval routes", async () => {
    const ui = await registerHarness();
    ui.requests[0].resolve(registerResponse()); await flushExecution(); ui.render();
    const card = ui.find((node) => node.props?.showProject);
    assert.equal(card.props.to, `/admin/projects/${registerTask.project}/tasks/${registerTask.id}`);
    assert.equal(card.props.actionLabel, "View Details");
    assert.match(card.props.approvalTo, /\/admin\/approvals\?tab=tasks&task=/);
    assert(ui.find((node) => node.type === "p" && node.props.children === "100"));
    assert.equal(ui.requests.length, 1);
    assert.equal(ui.requests[0].params.page_size, 12);
    ui.cleanup();
});

test("Supervisor register links to the existing selected-task workflow without Admin approval controls", async () => {
    const ui = await registerHarness("SUPERVISOR");
    ui.requests[0].resolve(registerResponse("SUPERVISOR")); await flushExecution(); ui.render();
    const card = ui.find((node) => node.props?.showProject);
    assert.equal(card.props.to, `/supervisor/projects/${registerTask.project}/tasks?task=${registerTask.id}`);
    assert.equal(card.props.actionLabel, "View Task");
    assert.equal(card.props.approvalTo, undefined);
    const filters = ui.find((node) => node.type?.name === "GlobalTaskFilters");
    assert.equal(filters.props.role, "SUPERVISOR");
    assert.equal(filters.props.options.supervisors.length, 0);
    ui.cleanup();
});

test("register filters, reset and pagination use server parameters without following next URLs", async () => {
    const ui = await registerHarness();
    ui.requests[0].resolve(registerResponse()); await flushExecution(); ui.render();
    const filters = ui.find((node) => node.type?.name === "GlobalTaskFilters");
    filters.props.onApply({ ...filters.props.filters, search: "concrete", project: registerTask.project, work_status: "NOT_STARTED", overdue: "true" });
    ui.render();
    assert.equal(ui.requests[1].params.search, "concrete");
    assert.equal(ui.requests[1].params.project, registerTask.project);
    assert.equal(ui.requests[1].params.overdue, "true");
    assert.equal(ui.requests[1].params.page, 1);
    ui.requests[1].resolve(registerResponse()); await flushExecution(); ui.render();
    const next = ui.find((node) => node.type === "button" && node.props.children?.[0] === "Next");
    next.props.onClick(); ui.render();
    assert.equal(ui.requests[2].params.page, 2);
    assert.equal(ui.requests[2].params.search, "concrete");
    ui.find((node) => node.type?.name === "GlobalTaskFilters").props.onReset(); ui.render();
    assert.equal(ui.requests[3].params.page, 1);
    assert.equal(ui.requests[3].params.search, undefined);
    assert.equal(ui.requests[3].params.project, undefined);
    ui.cleanup();
});

test("register ignores stale requests and withholds old totals after a failure", async () => {
    const ui = await registerHarness();
    ui.navigate({ search: "new selection" });
    assert.equal(ui.requests[0].signal.aborted, true);
    ui.requests[1].resolve(registerResponse()); await flushExecution(); ui.render();
    ui.requests[0].resolve({ ...registerResponse(), summary: { ...registerResponse().summary, total: 999 } });
    await flushExecution(); ui.render();
    assert.equal(ui.find((node) => node.type === "p" && node.props.children === "999"), undefined);
    ui.navigate({ search: "failing selection" });
    assert.equal(ui.find((node) => node.props?.showProject), undefined);
    ui.requests[2].reject(new Error("Network unavailable")); await flushExecution(); ui.render();
    assert(ui.find((node) => node.props?.role === "alert"));
    assert.equal(ui.find((node) => node.type === "p" && node.props.children === "100"), undefined);
    ui.cleanup();
});

test("register normalizes paginated and unpaginated data without guessing missing summary counts", async () => {
    const { exports } = await loadSource("api/taskApi.js", { overrides: { "api/client.js": { api: {} } } });
    assert.equal(exports.taskRegisterPage(registerResponse()).summary.total, 100);
    assert.equal(exports.taskRegisterPage(registerResponse()).next, true);
    const unpaginated = exports.taskRegisterPage([registerTask]);
    assert.equal(unpaginated.count, 1);
    assert.equal(unpaginated.summary.pending_approval, 1);
    assert.equal(unpaginated.summary_scope, "results");
    assert.equal(exports.taskRegisterPage([]).summary.total, 0);
    assert.throws(() => exports.taskRegisterPage({ count: 100, results: [registerTask] }), /totals/);
});

test("global filter UI exposes actual Supervisor selection only to Admin", async () => {
    const { exports } = await loadSource("pages/admin/ProjectTasks.jsx", { overrides: { "api/client.js": { api: {} } }, append: '\nexport { GlobalTaskFilters };' });
    const filters = { search: "", project: "", supervisor: "", approval_status: "", work_status: "", priority: "", start_from: "", start_to: "", end_from: "", end_to: "", overdue: "", sort: "order" };
    function render(role) {
        return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(exports.GlobalTaskFilters, { filters, options: registerResponse().filter_options, role, onApply() {}, onReset() {} })));
    }
    const admin = render("ADMIN"), supervisor = render("SUPERVISOR");
    assert(admin.includes("Assigned Supervisor"));
    assert(admin.includes("Site Supervisor"));
    assert(!supervisor.includes("Assigned Supervisor"));
    assert(supervisor.includes("Assigned project"));
    for (const label of ["Approval status", "Work status", "Priority", "Planned start date", "Planned end date", "Overdue only", "Clear All Filters"]) assert(supervisor.includes(label));
});

test("sidebar Tasks destinations and all existing project-task routes stay registered once", async () => {
    const { exports } = await loadSource("config/navigation.js");
    assert(exports.getNavigation("ADMIN").some((item) => item.path === "/admin/tasks" && item.label === "All Tasks"));
    assert(exports.getNavigation("SUPERVISOR").some((item) => item.path === "/supervisor/tasks" && item.label === "My Tasks"));
    const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
    for (const path of ["/admin/tasks", "/supervisor/tasks", "/admin/projects/:projectId/tasks", "/admin/projects/:projectId/tasks/:taskId", "/supervisor/projects/:projectId/tasks"]) {
        assert.equal(app.split(`path="${path}"`).length - 1, 1);
    }
});

async function projectDirectoryHarness(role = "ADMIN", initialQuery = {}) {
    const slots = [], requests = [], categoryRequests = [];
    let cursor = 0, effects = [], query = new URLSearchParams(initialQuery), tree;
    const hooks = {
        useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
        useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
        useEffect(create, deps) { const i = cursor++; const previous = slots[i]; if (!previous || deps.some((value, j) => value !== previous.deps[j])) effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: create() }; }); },
    };
    const { exports } = await loadSource("pages/admin/Projects.jsx", { overrides: {
        react: { ...React, ...hooks },
        "modal/admin/AddProject.jsx": { default: function AddProject() {} },
        "react-router-dom": { Link() {}, useNavigate: () => () => {}, useSearchParams: () => [query, (next) => { query = typeof next === "function" ? next(query) : new URLSearchParams(next); }] },
        "api/projectApi.js": { projectApi: {
            getProjects: (params, signal) => new Promise((resolve, reject) => requests.push({ params, signal, resolve, reject })),
            getCategories: (params, signal) => new Promise((resolve, reject) => categoryRequests.push({ params, signal, resolve, reject })),
        } },
    }, append: '\nconst AbortController = class { signal = { aborted: false }; abort() { this.signal.aborted = true; } }; export { projectPage };' });
    function walk(predicate, node) { if (Array.isArray(node)) return node.map((child) => walk(predicate, child)).find(Boolean); if (!node || typeof node !== "object") return; return predicate(node) ? node : walk(predicate, node.props?.children); }
    function render() { cursor = 0; effects = []; tree = exports.ProjectDirectory({ role }); effects.forEach((effect) => effect()); }
    render();
    return { requests, categoryRequests, render, exports, get query() { return query; }, find: (predicate) => walk(predicate, tree), navigate(params) { query = new URLSearchParams(params); render(); }, cleanup() { slots.forEach((slot) => slot?.cleanup?.()); } };
}

const directoryProject = { id: "project-1", name: "Cedar residence", category: "category-1", category_name: "Residential", status: "ACTIVE", client_name: "Cedar client", location: "Kochi", start_date: "2026-10-01", end_date: "2026-12-01" };
const directoryResponse = () => ({ results: [directoryProject], count: 25, next: "https://untrusted.test/next", previous: null });

test("project directory uses one server page for both roles and keeps Supervisor links and controls scoped", async () => {
    for (const role of ["ADMIN", "SUPERVISOR"]) {
        const ui = await projectDirectoryHarness(role);
        ui.requests[0].resolve(directoryResponse()); await flushExecution(); ui.render();
        assert.equal(ui.requests.length, 1);
        assert.equal(ui.requests[0].params.page, 1);
        assert.equal(ui.requests[0].params.page_size, 12);
        const card = ui.find((node) => node.props?.project?.id === directoryProject.id);
        assert.equal(card.props.to, `/${role.toLowerCase()}/projects/project-1`);
        const add = ui.find((node) => node.type === "button" && node.props.children?.[1] === "Add Project");
        assert.equal(Boolean(add), role === "ADMIN");
        ui.cleanup();
    }
});

test("project filters, page size and pagination preserve URL state while view switches avoid refetching", async () => {
    const ui = await projectDirectoryHarness("ADMIN", { search: "Cedar", category: "category-1", status: "ACTIVE", page: "2", ordering: "name", view: "list" });
    assert.equal(ui.requests[0].params.search, "Cedar"); assert.equal(ui.requests[0].params.page, 2);
    ui.requests[0].resolve({ ...directoryResponse(), previous: "page-one" }); await flushExecution(); ui.render();
    ui.find((node) => node.type === "button" && node.props.children?.[1] === "Gallery").props.onClick(); ui.render();
    assert.equal(ui.requests.length, 1); assert.equal(ui.query.get("view"), "grid");
    assert.equal(ui.find((node) => node.props?.project).props.layout, "grid");
    ui.find((node) => node.type === "button" && node.props.children?.[0] === "Next").props.onClick(); ui.render();
    assert.equal(ui.requests[1].params.page, 3); assert.equal(ui.requests[1].params.category, "category-1");
    ui.requests[1].resolve({ ...directoryResponse(), previous: "page-two" }); await flushExecution(); ui.render();
    ui.find((node) => node.props?.["aria-label"] === "Projects per page").props.onChange({ target: { value: "24" } }); ui.render();
    assert.equal(ui.requests[2].params.page, 1); assert.equal(ui.requests[2].params.page_size, 24);
    ui.find((node) => node.type?.name === "ProjectFilters").props.onReset(); ui.render();
    assert.equal(ui.requests[3].params.search, undefined); assert.equal(ui.requests[3].params.category, undefined);
    assert.equal(ui.query.get("view"), "grid"); ui.cleanup();
});

test("project directory aborts stale responses, never leaks old results and recovers errors", async () => {
    const ui = await projectDirectoryHarness();
    ui.navigate({ search: "New site" }); assert.equal(ui.requests[0].signal.aborted, true);
    ui.requests[1].resolve(directoryResponse()); await flushExecution(); ui.render();
    ui.requests[0].resolve({ ...directoryResponse(), results: [{ ...directoryProject, id: "stale" }] }); await flushExecution(); ui.render();
    assert.equal(ui.find((node) => node.props?.project?.id === "stale"), undefined);
    ui.navigate({ status: "COMPLETED" }); assert.equal(ui.find((node) => node.props?.project), undefined);
    ui.requests[2].reject(new Error("Offline")); await flushExecution(); ui.render();
    assert(ui.find((node) => node.props?.role === "alert"));
    assert.equal(ui.find((node) => node.props?.project), undefined);
    ui.find((node) => node.type === "button" && node.props.children === "Try again").props.onClick(); ui.render();
    assert.equal(ui.requests.length, 4); ui.cleanup();
});

test("project categories paginate independently and a category failure leaves project access available", async () => {
    const ui = await projectDirectoryHarness();
    ui.categoryRequests[0].resolve({ results: [{ id: "one", name: "Residential" }], next: "https://untrusted.test/categories" });
    await flushExecution(); assert.equal(ui.categoryRequests.length, 2);
    assert.equal(ui.categoryRequests[1].params.page, 2);
    ui.categoryRequests[1].reject(new Error("Offline"));
    ui.requests[0].resolve(directoryResponse()); await flushExecution(); ui.render();
    assert(ui.find((node) => node.props?.project));
    assert(ui.find((node) => node.type === "button" && node.props.children === "Retry categories"));
    ui.cleanup();
});

test("project card renders accessible list and gallery links with fallback dates and images", async () => {
    const { exports } = await loadSource("components/projects/HorizontalProjectCard.jsx");
    for (const layout of ["list", "grid"]) {
        const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(exports.default, { project: { ...directoryProject, cover_image: null, start_date: null }, layout, to: "/supervisor/projects/project-1" })));
        for (const text of ["Cedar residence", "Cedar client", "Kochi", "Active", "Residential", "Not scheduled", "Expected completion", 'href="/supervisor/projects/project-1"']) assert(html.includes(text));
        assert(!html.includes("<button"));
    }
});
