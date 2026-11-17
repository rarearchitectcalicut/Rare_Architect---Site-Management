import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(path.join(root, ".dist/ui-qa/node_modules/playwright"))); }
const role = process.env.UI_QA_ROLE || "ADMIN";
const admin = role === "ADMIN";
const prefix = admin ? "/admin" : "/supervisor";
const out = path.join(root, admin ? "docs/ui-global-reports-qa" : "docs/ui-supervisor-reports-qa");
await mkdir(out, { recursive: true });
const projects = [{ project_id: '22222222-2222-4222-8222-222222222222', project__name: 'Lake House' }, { project_id: '33333333-3333-4333-8333-333333333333', project__name: 'North Wing Studio' }];
const rows = projects.map((project, i) => ({ id: `66666666-6666-4666-8666-66666666666${i}`, project: project.project_id, project_name: project.project__name, report_date: '2026-11-17', reported_by_name: 'Site Supervisor', status: !admin && i === 0 ? 'DRAFT' : 'SUBMITTED', work_summary: i ? 'Roof inspection and site coordination.' : 'Ground-floor measurements verified on site.', work_entry_count: 2, work_counts: { pending: 1, verified: 1, rejected: 0 } }));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ serviceWorkers: 'block' });
await context.addInitScript(() => localStorage.setItem('rare.auth.tokens', JSON.stringify({ access: 'qa', refresh: 'qa' })));
const requests = [];
await context.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    let body = { count: 0, results: [] };
    if (url.pathname.endsWith('auth/me/')) body = { id: 'admin', first_name: admin ? 'Admin' : 'Supervisor', role, must_change_password: false };
    else if (url.pathname.endsWith('unread-count/')) body = { unread_count: 0 };
    else if (url.pathname.endsWith('/daily-reports/') || url.pathname.endsWith('/my-daily-reports/')) {
        const filtered = rows.filter((row) => (!url.searchParams.get('project') || row.project === url.searchParams.get('project')) && (!url.searchParams.get('status') || row.status === url.searchParams.get('status')) && (!url.searchParams.get('search') || row.work_summary.toLowerCase().includes(url.searchParams.get('search').toLowerCase()))).sort((a, b) => url.searchParams.get('sort') === 'oldest' ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id));
        body = { results: filtered, count: filtered.length, next: null, previous: null, summary: { submitted: admin ? 2 : 1, drafts: admin ? undefined : 1, pending_work: 2 }, projects, reporters: [] };
    }
    else if (url.pathname.endsWith('/projects/')) body = { count: 1, results: [{ id: projects[0].project_id, name: projects[0].project__name, status: 'ACTIVE' }], next: null, previous: null };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
try {
    await page.goto(`${process.env.UI_QA_URL || 'http://127.0.0.1:5174'}${prefix}/reports`);
    await page.getByRole('status').filter({ hasText: '2 matching reports' }).waitFor();
    for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const picker = page.getByRole('combobox', { name: 'Choose project', exact: true });
        if (!await picker.isVisible()) throw new Error('Project picker is not visible');
        await picker.selectOption(projects[1].project_id);
        await page.getByRole('status').filter({ hasText: '1 matching report' }).waitFor();
        if (await page.locator('.rare-report-project-name').count() !== 1) throw new Error('Project filter did not narrow report rows');
        if (await page.locator('.rare-report-project-name').innerText() !== projects[1].project__name) throw new Error('Wrong project report shown');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (overflow) throw new Error(`Overflow at ${width}`);
        if (await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Documents', exact: true }).count()) throw new Error('Documents is still in the rail');
        if (!admin && await page.locator('[href^="/admin/"]').count()) throw new Error('Admin action exposed to Supervisor');
        results.push({ width, pickerVisible: true, serverProjectFilter: true, matchingReports: 1, overflow: false });
        await page.screenshot({ path: path.join(out, `daily-reports-${width}.png`), fullPage: true });
        await picker.selectOption('');
        await page.getByRole('status').filter({ hasText: '2 matching reports' }).waitFor();
    }
    if (requests.some((url) => /\/projects\/$/.test(url.split('?')[0]))) throw new Error('The report page fetched a project directory');
    if (!admin) {
        const endpoint = requests.filter((url) => url.includes('my-daily-reports/'));
        if (!endpoint.length) throw new Error('Personal register was not requested');
        await page.getByRole('button', { name: /^Filters,/ }).click();
        await page.getByLabel('Report status', { exact: true }).selectOption('DRAFT');
        await page.getByLabel('Sort reports', { exact: true }).selectOption('oldest');
        await page.getByRole('button', { name: 'Apply', exact: true }).click();
        await page.getByRole('status').filter({ hasText: '1 matching report' }).waitFor();
        if (!(await page.locator('.rare-report-project-name').innerText()).includes(projects[0].project__name)) throw new Error('Draft filter failed');
        const reportLink = page.locator('a').filter({ has: page.locator('.rare-report-project-name') });
        if (!(await reportLink.getAttribute('href')).startsWith(`${prefix}/projects/${projects[0].project_id}/daily-reports?report=`)) throw new Error('Incorrect report link');
        await page.getByRole('button', { name: 'New report', exact: true }).click();
        const selector = page.getByRole('dialog', { name: 'Create Daily Report: choose project' });
        await selector.getByRole('radio').first().check();
        if (await selector.getByRole('button', { name: 'Continue', exact: true }).isDisabled()) throw new Error('Eligible assigned project cannot be chosen');
        await selector.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    if (!requests.some((url) => url.includes(`project=${projects[1].project_id}`))) throw new Error('No server project filter request recorded');
} finally {
    await writeFile(path.join(out, 'results.json'), JSON.stringify({ fixtureOnly: true, results, requests, errors }, null, 2));
    await browser.close();
}
if (errors.length) throw new Error(errors.join('; '));
console.log(`Passed visible project selection, server filtering and ${role} navigation at ${results.length} widths.`);
