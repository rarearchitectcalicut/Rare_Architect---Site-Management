// Browser-only fixtures. Production components and API services are never replaced.
// Install optional QA tooling: npm install --prefix .dist/ui-qa --no-save playwright
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(root, '.dist/ui-qa/node_modules/playwright'))); }
const origin = process.env.UI_QA_URL || 'http://localhost:5174';
const output = path.join(root, 'docs/ui-redesign-qa');
await mkdir(output, { recursive: true });
const pid = '22222222-2222-4222-8222-222222222222';
const tid = '33333333-3333-4333-8333-333333333333';
const sid = '44444444-4444-4444-8444-444444444444';
const cid = '55555555-5555-4555-8555-555555555555';
const rid = '66666666-6666-4666-8666-666666666666';
const did = '77777777-7777-4777-8777-777777777777';
const project = { id: pid, name: 'Lake House · QA fixture', category: cid, category_name: 'Residential', category_is_active: true, client_name: 'QA client', location: 'Kochi', description: 'Site execution and construction documentation.', status: 'ACTIVE', start_date: '2026-10-01', end_date: '2026-12-31', supervisors: [{ id: sid, supervisor: sid, supervisor_name: 'Site Supervisor', first_name: 'Site', last_name: 'Supervisor' }], task_summary: { total: 1, pending: 0, approved: 1, completed: 0 }, tasks: { total: 1, approved: 1 }, document_count: 0 };
const task = { id: tid, project: pid, project_id: pid, project_name: project.name, project_status: 'ACTIVE', title: 'Ground-floor blockwork', description: 'Verify wall area before submission.', approval_status: 'APPROVED', work_status: 'IN_PROGRESS', priority: 'HIGH', measurement_method: 'QUANTITY', measurement_unit: 'SQM', planned_quantity: '100', start_date: '2026-11-01', end_date: '2026-12-01', created_by: sid, created_by_name: 'Site Supervisor', assigned_supervisor: sid, worker_name: 'Site team', order: 1, progress: { planned_quantity: '100', verified_quantity: '20', pending_quantity: '10', available_quantity: '70', verified_percentage: 20, quantity_conflict: false } };
const report = { id: rid, project: pid, project_name: project.name, project_status: 'ACTIVE', reported_by: sid, reported_by_name: 'Site Supervisor', report_date: '2026-11-17', work_summary: 'Measured blockwork at ground floor.', weather_condition: 'CLEAR', status: 'DRAFT', work_entry_count: 0, created_at: '2026-11-17T08:00:00Z' };
const category = { id: cid, name: 'Residential', is_active: true, project_count: 1 };
const supervisor = { id: sid, username: 'site-supervisor', first_name: 'Site', last_name: 'Supervisor', phone: '9999999999', role: 'SUPERVISOR', is_active: true, assigned_projects: [project], projects: [project], project_count: 1 };
const delay = { id: did, project_id: pid, project_name: project.name, task: tid, task_title: task.title, delay_type: 'MATERIAL_DELAY', reason: 'Required blocks have not reached site.', description: 'Delivery rescheduled; coordinate the next site sequence.', status: 'PENDING', extension_requested: true, extension_status: 'PENDING', current_end_date: '2026-12-01', requested_end_date: '2026-12-08', expected_completion_date: '2026-12-07', project_end_date: '2026-12-31', reported_by: sid, reported_by_name: 'Site Supervisor', reported_at: '2026-11-17T08:00:00Z', deadline_history: { submission_deadline_recorded: true, deadline_at_submission: '2026-12-01' } };
task.progress = { ...task.progress, measurement_method: 'QUANTITY', measurement_unit: 'SQM', progress_percentage: 20 };
const paged = (results = [], extra = {}) => ({ count: results.length, results, next: null, previous: null, ...extra });
const summary = { projects: { total: 1, active: 1, total_assigned: 1 }, tasks: { total: 1, pending_approval: 0, in_progress: 1 }, my_tasks: { total: 1, pending_approval: 0, in_progress: 1 }, daily_reports: { total: 1, submitted: 0 }, project_daily_reports: { total: 1, submitted: 0 }, delay_reports: { pending_review: 0 }, change_requests: {}, daily_task_work: {}, project_daily_task_work: {}, notifications: { unread: 1 } };
const app = await readFile(path.join(root, 'frontend/src/App.jsx'), 'utf8');
const routes = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((s) => s.startsWith('/'));
const widths = [320, 390, 768, 1024, 1440];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
const mutations = [];
let activeRole = 'ADMIN';
let failureMode = false;
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await context.addInitScript(() => localStorage.setItem('rare.auth.tokens', JSON.stringify({ access: 'qa-only', refresh: 'qa-only' })));
await context.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/api/v1/')[1];
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (request.method() !== 'GET') mutations.push({ endpoint, method: request.method() });
    const user = { ...supervisor, id: activeRole === 'ADMIN' ? 'qa-admin' : sid, role: activeRole, first_name: activeRole === 'ADMIN' ? 'Admin' : 'Site', must_change_password: false };
    let body = paged();
    let status = 200;
    if (endpoint === 'auth/me/') body = user;
    else if (failureMode) { status = 403; body = { detail: 'QA permission denied.' }; }
    else if (endpoint.includes('unread-count')) body = { unread_count: 1 };
    else if (endpoint === 'dashboard/admin/' || endpoint === 'dashboard/supervisor/') body = summary;
    else if (endpoint.includes('dashboard/')) body = {};
    else if (endpoint === 'project-categories/') body = paged([category]);
    else if (endpoint.startsWith('project-categories/')) body = category;
    else if (endpoint === 'projects/') body = paged(url.searchParams.has('status') && url.searchParams.get('status') !== project.status ? [] : [project]);
    else if (/^projects\/[^/]+\/(overview\/)?$/.test(endpoint)) body = project;
    else if (endpoint.endsWith('/supervisors/')) body = paged([supervisor]);
    else if (endpoint.startsWith('users/supervisors/')) body = supervisor;
    else if (/^tasks\/[^/]+\/$/.test(endpoint)) body = task;
    else if (/tasks\/$/.test(endpoint) || endpoint.includes('task-register') || endpoint.endsWith('/timeline/')) body = paged([task], { summary: { total: 1, pending_approval: 0, not_started: 0, in_progress: 1, completed: 0, overdue: 0 }, filter_options: { projects: [project], supervisors: [{ id: sid, name: 'Site Supervisor' }] } });
    else if (endpoint === 'delay-reports/') body = paged([delay], { summary: { total: 1, pending: 1, approved: 0, rejected: 0, pending_extensions: 1 } });
    else if (endpoint === `delay-reports/${did}/`) body = delay;
    else if (/^daily-reports\/[^/]+\/$/.test(endpoint)) body = report;
    else if (endpoint === 'daily-reports/') body = paged([{ ...report, status: 'SUBMITTED', work_counts: { pending: 1, verified: 0, rejected: 0 } }], { summary: { submitted: 1, pending_work: 1 }, summary_scope: 'all_visible_reports', projects: [{ project_id: pid, project__name: project.name }], reporters: [{ reported_by: sid, reported_by__username: 'Site Supervisor' }] });
    else if (endpoint.endsWith('daily-reports/')) body = paged([report], { summary: { total: 1, drafts: 1, submitted: 0, pending_work: 0 }, reporters: [{ id: sid, name: 'Site Supervisor' }], reporting_context: { today: '2026-11-17', time_zone: 'Asia/Kolkata' } });
    else if (endpoint.includes('documents/')) body = paged([], { upload_rules: { allowed_extensions: ['pdf', 'jpg'], max_file_size: 10485760 } });
    else if (endpoint === 'notifications/') body = paged([{ id: 'qa-notification', notification_type: 'TASK_APPROVAL', event: 'TASK_APPROVED', title: 'Task approved', message: 'Ground-floor blockwork is ready for execution.', is_read: false, created_at: '2026-11-17T08:00:00Z', reference_type: 'TASK', reference_id: tid, project_id: pid }], { unread_count: 1, total_count: 1 });
    else if (endpoint.includes('push/')) body = { enabled: false, preferences: {} };
    await route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(body) });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
function concrete(route) { return route.replace(':projectId', pid).replace(':taskId', tid).replace(':supervisorId', sid).replace(':categoryId', cid).replace(':section', 'overview'); }
async function record(route, width, suffix = '') {
    const metrics = await page.evaluate(() => ({
        bodyWidth: document.documentElement.scrollWidth, viewport: innerWidth,
        heading: document.querySelector('main h1, main h2')?.textContent,
        text: document.querySelector('main')?.innerText?.slice(0, 180),
        rail: document.querySelector('.rare-nav-rail') ? getComputedStyle(document.querySelector('.rare-nav-rail')).display : null,
        visibleRecordIds: document.body.innerText.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi) || [],
        dialogs: [...document.querySelectorAll('dialog[open]')].map((e) => ({ width: e.clientWidth, scrollWidth: e.scrollWidth, label: e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') })),
        overflow: [...document.querySelectorAll('main *')].filter((e) => {
            const b = e.getBoundingClientRect();
            return b.width > 0 && (b.right > innerWidth + 1 || b.left < -1) && getComputedStyle(e).position !== 'fixed' && !e.closest('[class*="overflow-x-auto"], [class*="overflow-auto"], [hidden]');
        }).slice(0, 6).map((e) => ({ tag: e.tagName, class: e.className?.toString().slice(0, 120), text: e.textContent.slice(0, 60) }))
    }));
    results.push({ route, width, suffix, ...metrics, errors: errors.splice(0) });
}
try {
    for (const role of ['ADMIN', 'SUPERVISOR']) {
        activeRole = role;
        const roleRoutes = routes.filter((s) => s.startsWith(`/${role.toLowerCase()}/`) && (!process.env.UI_QA_ROUTE || s.includes(process.env.UI_QA_ROUTE)));
        for (const route of roleRoutes) {
            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.goto(origin + concrete(route));
            await page.waitForTimeout(1200);
            for (const width of widths) {
                await page.setViewportSize({ width, height: 1000 });
                await page.waitForTimeout(80);
                await record(route, width);
                if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(output, `${role.toLowerCase()}-${route.split('/').slice(2).join('-').replaceAll(':', '') || 'home'}-${width}.png`), fullPage: true });
            }
        }
    }
    if (process.env.UI_QA_ROUTE === 'projects') {
        activeRole = 'ADMIN';
        await page.goto(origin + `/admin/projects/${pid}`); await page.locator('.rare-project-hero').waitFor();
        for (const width of widths) {
            await page.setViewportSize({ width, height: 1000 });
            const edit = page.getByRole('button', { name: 'Edit Project', exact: true });
            const size = await edit.boundingBox();
            if (size.width < 44 || size.height < 44) throw new Error('Edit target is below 44px');
            if (width < 640) {
                if (await page.getByRole('button', { name: 'Cancel Project', exact: true }).filter({ visible: true }).count()) throw new Error('Phone cancellation was exposed without opening actions');
                const more = page.locator('summary[aria-label="More project actions"]');
                await more.click(); await page.keyboard.press('Escape');
                if (await page.locator('.rare-project-mobile-actions[open]').count()) throw new Error('Actions menu did not dismiss with Escape');
                await more.click();
                await page.screenshot({ path: path.join(output, `project-action-menu-${width}.png`), fullPage: true });
            }
            await page.getByRole('button', { name: 'Cancel Project', exact: true }).filter({ visible: true }).click();
            const dialog = page.getByRole('dialog', { name: 'Cancel Project?' });
            await dialog.waitFor();
            if (!await dialog.getByRole('button', { name: 'Cancel Project', exact: true }).isDisabled()) throw new Error('Cancellation allowed without a reason');
            await record('/admin/projects/:projectId', width, 'protected-cancellation');
            await dialog.getByRole('button', { name: 'Keep Project', exact: true }).click();
            await edit.click();
            await page.getByRole('dialog').filter({ visible: true }).waitFor();
            await record('/admin/projects/:projectId', width, 'edit-icon');
            await page.keyboard.press('Escape');
        }
        project.status = 'CANCELLED';
        await page.goto(origin + `/admin/projects/${pid}`); await page.locator('.rare-project-hero').waitFor();
        if (!await page.getByRole('button', { name: 'Edit Project', exact: true }).isDisabled()) throw new Error('Cancelled project allowed editing');
        if (await page.getByRole('button', { name: 'Cancel Project', exact: true }).count()) throw new Error('Cancelled project exposed cancellation');
        project.status = 'ACTIVE';
        const brief = project.description;
        project.description = 'Coordinate drawings, site inspections and verified measurements throughout construction. '.repeat(12);
        await page.setViewportSize({ width: 390, height: 1000 });
        await page.goto(origin + `/admin/projects/${pid}`); await page.locator('.rare-project-hero').waitFor();
        await page.getByRole('button', { name: 'Read more', exact: true }).click();
        await page.getByRole('button', { name: 'Show less', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Show less', exact: true }).click();
        project.description = brief;
        activeRole = 'SUPERVISOR';
        await page.goto(origin + `/supervisor/projects/${pid}`); await page.locator('.rare-project-hero').waitFor();
        if (await page.getByRole('button', { name: /^(Edit Project|Cancel Project)$/ }).count()) throw new Error('Supervisor received Admin project actions');
    }
    if (process.env.UI_QA_ROUTE === 'delays') for (const role of ['ADMIN', 'SUPERVISOR']) {
        activeRole = role;
        await page.goto(origin + `/${role.toLowerCase()}/delays`); await page.waitForTimeout(1300);
        for (const width of widths) {
            await page.setViewportSize({ width, height: 1000 });
            await page.getByRole('button', { name: /^Open delay report:/ }).filter({ visible: true }).first().click();
            await page.getByText('Current approved deadline', { exact: true }).waitFor();
            if (role === 'SUPERVISOR' && await page.getByRole('dialog').getByRole('button', { name: /^(Approve|Reject)/ }).count()) throw new Error('Supervisor received a delay decision control');
            await record(`/${role.toLowerCase()}/delays`, width, 'delay-review');
            await page.screenshot({ path: path.join(output, `${role.toLowerCase()}-delay-review-${width}.png`), fullPage: true });
            await page.keyboard.press('Escape');
        }
    }
    for (const route of ['/login', '/change-password', '/unauthorized']) {
        await page.goto(origin + route); await page.waitForTimeout(1200);
        for (const width of widths) { await page.setViewportSize({ width, height: 1000 }); await record(route, width); }
    }
    // Read every task-detail tab through its existing lazy data loader.
    activeRole = 'ADMIN';
    await page.goto(origin + `/admin/projects/${pid}/tasks/${tid}`); await page.waitForTimeout(1300);
    for (const name of ['Overview', 'Documents', 'Work & Reports', 'Changes & Delays', 'History']) {
        const tab = page.getByRole('navigation', { name: 'Task detail sections' }).getByRole('button', { name, exact: true });
        if (!await tab.count()) continue;
        await tab.click(); await page.waitForTimeout(150);
        for (const width of [320, 390, 768, 1024, 1440]) {
            await page.setViewportSize({ width, height: 1000 });
            await record('/admin/projects/:projectId/tasks/:taskId', width, `tab-${name}`);
        }
    }
    // Exercise the existing single/bulk task forms without creating records.
    activeRole = 'SUPERVISOR';
    await page.goto(origin + `/supervisor/projects/${pid}/tasks`); await page.waitForTimeout(1300);
    for (const [name, suffix] of [['Create Task', 'single-task-form'], ['Bulk Add Tasks', 'bulk-task-form']]) {
        for (const width of widths) {
            await page.setViewportSize({ width, height: 1000 });
            await page.getByRole('button', { name, exact: true }).click(); await page.waitForTimeout(100);
            await record('/supervisor/projects/:projectId/tasks', width, suffix);
            await page.screenshot({ path: path.join(output, `${suffix}-${width}.png`), fullPage: true });
            await page.keyboard.press('Escape');
        }
    }
    activeRole = 'ADMIN';
    await page.goto(origin + '/admin/projects'); await page.waitForTimeout(1300);
    for (const width of widths) {
        await page.setViewportSize({ width, height: 1000 });
        const add = page.getByRole('button', { name: 'Add project', exact: true }).filter({ visible: true }).first();
        await add.click(); await page.waitForTimeout(150);
        await record('/admin/projects', width, 'add-project-modal');
        await page.screenshot({ path: path.join(output, `add-project-${width}.png`), fullPage: true });
        await page.keyboard.press('Escape');
    }
    // Filtering is keyboard operable and returns focus to its real trigger.
    await page.setViewportSize({ width: 390, height: 844 });
    const filter = page.getByRole('button', { name: /Filters.*active/ }).filter({ visible: true }).first();
    await filter.click(); await page.waitForTimeout(100);
    await record('/admin/projects', 390, 'filter-sheet');
    const filterDialog = page.getByRole('dialog').filter({ visible: true });
    const focusInside = await filterDialog.evaluate((e) => e.contains(document.activeElement));
    if (!focusInside) errors.push('Filter opening did not move focus into the dialog');
    await page.keyboard.press('Escape');
    if (!await filter.evaluate((e) => e === document.activeElement)) errors.push('Filter closing did not restore focus');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /More/ }).click(); await page.waitForTimeout(100);
    await record('/admin/projects', 390, 'more-navigation');
    await page.screenshot({ path: path.join(output, 'mobile-more-390.png') });
    await page.keyboard.press('Escape');
    failureMode = true;
    await page.goto(origin + '/admin/projects'); await page.waitForTimeout(1400);
    await record('/admin/projects', 390, 'permission-error');
} finally {
    await writeFile(path.join(output, process.env.UI_QA_RESULT || (process.env.UI_QA_ROUTE ? 'targeted-results.json' : 'results.json')), JSON.stringify({ fixtureOnly: true, results, mutations }, null, 2));
    await browser.close();
}
const failures = results.filter((r) => r.bodyWidth > r.viewport + 1 || r.errors.length || r.visibleRecordIds.length);
console.log(JSON.stringify({ checks: results.length, failures, mutations }, null, 2));
if (failures.length) process.exitCode = 1;
