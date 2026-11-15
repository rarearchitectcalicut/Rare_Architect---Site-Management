import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadSource } from "./source-loader.js";

test("delay report modal uses the standard form layout and controls", async () => {
    const { exports } = await loadSource("modal/supervisor/DelayReportForm.jsx", {
        overrides: {
            "api/delayApi.js": { delayApi: { create: async () => ({ status: "PENDING" }) } },
            "api/projectApi.js": { projectApi: { getProjects: async () => ({ results: [], next: null }) } },
            "api/taskApi.js": { taskApi: { register: async () => ({ results: [], count: 0 }), get: async () => ({}) } },
            "hooks/useApprovalReview.js": { validationMessage: (_failure, fallback) => fallback || "Failed" },
            "hooks/useModalScrollLock.js": { useModalScrollLock() {} },
            "components/LoadingScreen.jsx": { default: () => null },
        },
    });
    const html = renderToStaticMarkup(createElement(exports.default, {
        projectId: "project-id",
        taskId: "task-id",
        onClose() {},
        onSaved() {},
    }));

    assert.ok(html.includes('role="dialog"'));
    assert.ok(html.includes('aria-modal="true"'));
    assert.ok(html.includes('aria-label="Report a task delay"'));
    assert.ok(html.includes("rare-mobile-sheet"));
    assert.ok(html.includes("rare-action-footer"));
    assert.ok(html.includes("overflow-y-auto"));
    assert.equal((html.match(/<select/g) || []).length, 3);
    assert.equal((html.match(/type="radio"/g) || []).length, 0);
    for (const label of ["Project *", "Task *", "Delay type *", "Reason *", "Additional details (optional)", "Expected completion date *", "Request a deadline extension", "Submitting this report records the delay. The approved deadline stays unchanged."]) {
        assert.ok(html.includes(label), `Expected delay form to include "${label}"`);
    }
    const orderedFields = ["Project *", "Task *", "Delay type *", "Reason *", "Additional details (optional)", "Expected completion date *", "Request a deadline extension"];
    assert.deepEqual(orderedFields.map((label) => html.indexOf(label)), [...orderedFields].map((label) => html.indexOf(label)).sort((a, b) => a - b));
    assert.ok(!html.includes("Tomorrow"));
    assert.ok(!html.includes("Add details"));
    assert.match(html, /<button[^>]*type="submit"[^>]*>/);
    assert.doesNotMatch(html, /<button[^>]*type="submit"[^>]*\sdisabled(?:=|\s|>)/);
});

test("delay report filters use a responsive search toolbar and accessible filter dialog", async () => {
    const { exports } = await loadSource("components/approvals/ApprovalFilters.jsx", {
        overrides: {
            "components/daily-reports/ReportProjectPicker.jsx": {
                ProjectSearch: ({ label, placeholder, delay }) => createElement("div", { "data-delay": delay }, createElement("input", { "aria-label": label, placeholder })),
            },
        },
    });
    const html = renderToStaticMarkup(createElement(exports.default, {
        filters: { search: "", sort: "newest", project: "", projectSearch: "", status: "", delayType: "", extension: "", date_from: "", date_to: "" },
        onChange() {},
        onClear() {},
        projects: [],
        mode: "delays",
        count: 3,
    }));

    assert.ok(html.includes('placeholder="Search task, project or supervisor"'));
    assert.ok(html.includes('aria-label="Search task, project or supervisor"'));
    assert.ok(html.includes('aria-label="Filters, 0 active filters"'));
    assert.ok(html.includes('aria-haspopup="dialog"'));
    assert.ok(html.includes('data-delay="300"'));
    assert.ok(html.includes('aria-label="Sort delay reports"'));
    assert.ok(html.includes('role="dialog"'));
    assert.ok(html.includes('aria-modal="true"'));
    assert.ok(html.includes("min-[481px]:top-[var(--filter-popover-top)]"));
    assert.ok(html.includes("3 delay reports"));
    assert.doesNotMatch(html, /Search delay reports|Delay report filters|>Search<\/button>/);
    assert.ok(!html.includes("Clear filters"));
    assert.ok(html.includes("h-11 min-h-11 w-11"));
    assert.ok(html.includes("min-[481px]:hidden"));
    assert.ok(html.includes(">Clear all</button>"));
    assert.ok(html.includes(">Apply</button>"));
    const fields = ["Project name", "Statuses", "Delay types", "Extensions", "Reported from", "Reported through"];
    const positions = fields.map((field) => html.indexOf(field));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));

    const activeHtml = renderToStaticMarkup(createElement(exports.default, {
        filters: { search: "roof", sort: "newest", project: "", projectSearch: "", status: "PENDING", delayType: "", extension: "", date_from: "", date_to: "" },
        onChange() {},
        onClear() {},
        projects: [],
        mode: "delays",
        count: 1,
    }));
    assert.ok(activeHtml.includes('aria-label="Filters, 1 active filter"'));
    assert.ok(activeHtml.includes(">Clear filters</button>"));
    assert.ok(activeHtml.includes("1 delay report"));
});

test("the delay filter dialog closes immediately from its close button", async () => {
    const states = [];
    const refs = [];
    let stateIndex = 0;
    let refIndex = 0;
    const { exports } = await loadSource("components/approvals/ApprovalFilters.jsx", {
        overrides: {
            react: {
                useState(initial) {
                    const index = stateIndex++;
                    if (!(index in states)) states[index] = index === 1 ? true : typeof initial === "function" ? initial() : initial;
                    return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
                },
                useRef(initial) {
                    const index = refIndex++;
                    if (!refs[index]) refs[index] = { current: initial };
                    return refs[index];
                },
                useEffect() {},
            },
            "components/daily-reports/ReportProjectPicker.jsx": { ProjectSearch: () => null },
        },
    });
    const wrapper = exports.default({
        filters: { search: "", sort: "newest", project: "", projectSearch: "", status: "", delayType: "", extension: "", date_from: "", date_to: "" },
        onChange() {},
        onClear() {},
        projects: [],
        mode: "delays",
    });
    const tree = wrapper.type(wrapper.props);
    function find(predicate, node) {
        if (Array.isArray(node)) return node.map((child) => find(predicate, child)).find(Boolean);
        if (!node || typeof node !== "object") return null;
        return predicate(node) ? node : find(predicate, node.props?.children);
    }
    const closeButton = find((node) => node.type === "button" && node.props["aria-label"] === "Close filters", tree);
    const dialog = find((node) => node.props?.role === "dialog", tree);
    assert.ok(closeButton);
    assert.ok(dialog);
    closeButton.props.onClick();
    assert.equal(states[1], false);
});

test("the Delays page opens the report form directly from its primary action", async () => {
    const state = [];
    let cursor = 0;
    const { exports } = await loadSource("pages/supervisor/ProjectDelays.jsx", {
        overrides: {
            react: {
                useState(initial) {
                    const index = cursor++;
                    if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
                    return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
                },
                useEffect() {},
                useMemo(callback) { return callback(); },
            },
            "react-router-dom": {
                Link: () => null,
                useParams: () => ({}),
                useSearchParams: () => [new URLSearchParams(), () => {}],
            },
            "hooks/useDelayReports.js": { useDelayReports: () => ({ reports: [], projects: [], summary: {}, count: 0, page: 1, pageCount: 1, filters: {}, loading: false, error: "", refresh() {}, setPage() {}, updateFilter() {}, clear() {} }) },
            "components/approvals/ApprovalFilters.jsx": { default: () => null },
            "components/approvals/RequestList.jsx": { default: () => null },
            "components/approvals/RequestReview.jsx": { default: () => null },
            "components/LoadingScreen.jsx": { default: () => null },
            "components/delays/DelaySummary.jsx": { default: () => null },
            "modal/supervisor/DelayReportForm.jsx": { default: function DelayReportForm() { return null; } },
        },
    });
    function find(predicate, node) {
        if (Array.isArray(node)) return node.map((child) => find(predicate, child)).find(Boolean);
        if (!node || typeof node !== "object") return null;
        return predicate(node) ? node : find(predicate, node.props?.children);
    }
    const draw = () => {
        cursor = 0;
        return exports.default({ role: "SUPERVISOR" });
    };
    let tree = draw();
    const action = find((node) => node.type === "button" && node.props.children === "Report a delay", tree);
    assert.ok(action);
    assert.ok(!find((node) => node.type === "button" && node.props.children === "Choose a project to report a delay", tree));
    action.props.onClick();
    tree = draw();
    assert.ok(find((node) => node.type?.name === "DelayReportForm", tree));
});

test("the shared approval modal supports viewport-constrained dialogs", async () => {
    const { exports } = await loadSource("components/approvals/ApprovalModal.jsx", {
        overrides: {
            "react-dom": { createPortal: (children) => children },
            "hooks/useModalScrollLock.js": { useModalScrollLock() {} },
        },
    });
    const html = renderToStaticMarkup(createElement(exports.default, {
        label: "Report a task delay",
        fitViewport: true,
    }, createElement("div", null, "Form")));

    assert.ok(html.includes("max-h-[calc(100dvh-0.5rem)]"));
});

test("overdue dashboard attention rows carry their task and project for direct delay reporting", async () => {
    const { exports } = await loadSource("pages/Dashboard.jsx", {
        overrides: {
            "components/dashboard/ProjectCategories.jsx": { default: () => null },
            "components/dashboard/AdminQuickActions.jsx": { default: () => null },
        },
        append: "\nexport { buildSupervisorAttentionItems };",
    });
    const [item] = exports.buildSupervisorAttentionItems({
        overdue_tasks: {
            items: [{ id: "task-id", project_id: "project-id", project_name: "Site", title: "Overdue task", end_date: "2026-11-14" }],
        },
    }, new Date("2026-11-15T12:00:00"));

    assert.deepEqual({ ...item.reportDelay }, { projectId: "project-id", taskId: "task-id" });
});
