import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "./source-loader.js";

test("notification loading requests 100 items per page and preserves counts", async () => {
    const calls = [];
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
        id: `notification-${index}`,
        notification_type: "SYSTEM",
    }));
    const { exports } = await loadSource("components/notifications/NotificationCenter.jsx", {
        overrides: {
            "components/daily-reports/ReportProjectPicker.jsx": { ProjectSearch: () => null },
            "components/approvals/ApprovalModal.jsx": { default: () => null },
            "components/LoadingScreen.jsx": { default: () => null },
            "api/notificationApi.js": {
                notificationApi: {
                    list: async (params) => {
                        calls.push(params);
                        return params.page === 1
                            ? { results: firstPage, next: "?page=2", unread_count: 7, total_count: 101 }
                            : { results: [{ id: "notification-100", notification_type: "SYSTEM" }], next: null };
                    },
                },
            },
            "api/taskApi.js": { taskApi: {} },
            "api/approvalApi.js": { approvalApi: {} },
            "api/delayApi.js": { delayApi: {} },
            "api/dailyReportApi.js": { dailyReportApi: {} },
        },
        append: "\nexport { fetchNotifications };",
    });

    const result = await exports.fetchNotifications();

    assert.equal(result.items.length, 101);
    assert.equal(result.unread_count, 7);
    assert.equal(result.total_count, 101);
    assert.equal(result.items[0].type, "SYSTEM");
    assert.equal(calls.length, 2);
    assert.deepEqual({ ...calls[0] }, { page: 1, page_size: 100, include_counts: true });
    assert.deepEqual({ ...calls[1] }, { page: 2, page_size: 100 });
});
