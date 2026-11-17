// Browser fixtures only. No real project or account records are modified.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('../../.dist/ui-qa/node_modules/playwright');
const output = new URL('../../docs/ui-admin-task-tabs-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ serviceWorkers: 'block' });
const projectId = '00000000-0000-4000-8000-000000000001', taskId = '00000000-0000-4000-8000-000000000002';
const progress = { task_id: taskId, project_id: projectId, measurement_method: 'QUANTITY', progress_percentage: '35.00', verified_quantity: '35.000', planned_quantity: '100.000', measurement_unit: 'SQM' };
const task = { id: taskId, project: projectId, project_name: 'Cedar House', project_status: 'ACTIVE', title: 'Foundation inspection', approval_status: 'APPROVED', work_status: 'IN_PROGRESS', priority: 'HIGH', worker_name: 'Foundation team', start_date: '2026-11-01', end_date: '2026-11-30', measurement_method: 'QUANTITY', planned_quantity: '100.000', measurement_unit: 'SQM', description: 'Check reinforcement, levels and preparation. '.repeat(45), completion_criteria: 'Measurements and daily work verified by Admin.', progress };
const results = [], errors = [];
let writes = 0;
await context.addInitScript(() => localStorage.setItem('rare.auth.tokens', JSON.stringify({ access: 'qa-only', refresh: 'qa-only' })));
await context.route('**/api/v1/**', async route => {
 const request = route.request(), endpoint = new URL(request.url()).pathname.split('/api/v1/')[1];
 const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
 if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
 if (request.method() !== 'GET') writes++;
 let body = { count: 0, results: [], next: null, previous: null };
 if (endpoint === 'auth/me/') body = { id: 'qa-admin', username: 'qa', first_name: 'QA', role: 'ADMIN', is_staff: true, is_active: true, must_change_password: false };
 else if (endpoint === `projects/${projectId}/overview/`) body = { id: projectId, name: 'Cedar House', status: 'ACTIVE', start_date: '2026-10-01', end_date: '2026-12-31' };
 else if (endpoint === `tasks/${taskId}/`) body = task;
 else if (endpoint === `tasks/${taskId}/progress/`) body = progress;
 else if (endpoint === `tasks/${taskId}/history/`) body = { ...body, count: 1, results: [{ id: 'event', task: taskId, action: 'APPROVED', actor_name: 'Reviewing Admin', created_at: '2026-11-15T10:00:00Z', details: { comment: 'Measurements checked.' } }] };
 await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
});
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
try {
 await page.goto(`http://127.0.0.1:5174/admin/projects/${projectId}/tasks/${taskId}`);
 await page.locator('.admin-task-details-page').waitFor();
 const tabs = page.getByRole('navigation', { name: 'Task detail sections' }), dock = page.locator('.rare-task-tab-dock');
 for (const width of [320,390,768,1024,1440]) {
   await page.setViewportSize({ width, height: 900 });
   await page.getByRole('button', { name: 'Overview', exact: true }).click();
   const row = await tabs.evaluate(e => ({ height: e.offsetHeight, rows: new Set([...e.querySelectorAll('button')].map(b => b.offsetTop)).size, gap: e.getBoundingClientRect().right - e.lastElementChild.getBoundingClientRect().right, overflow: e.scrollWidth > e.clientWidth + 1 }));
   if (row.height > 56 || row.rows !== 1 || !row.overflow && row.gap > 7) throw Error(JSON.stringify(row));
   const positioning = await dock.evaluate(e => getComputedStyle(e).position);
   if (positioning !== (width < 768 ? 'sticky' : 'static')) throw Error('Incorrect breakpoint behavior');
   if (width < 768) {
     await dock.evaluate(e => scrollTo(0, e.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(e).top) + 120)); await page.waitForTimeout(100);
     const pin = await dock.evaluate(e => ({ top: e.getBoundingClientRect().top, expected: parseFloat(getComputedStyle(e).top), header: document.querySelector('.rare-topbar').getBoundingClientRect().bottom }));
     if (Math.abs(pin.top - pin.expected) > 1 || pin.top < pin.header - 1) throw Error('Sticky positioning failed: ' + JSON.stringify(pin));
     await page.screenshot({ path: fileURLToPath(new URL(`${width}-sticky.png`, output)) });
     await page.getByRole('button', { name: 'Documents', exact: true }).click(); await page.waitForTimeout(100);
     const panelTop = await page.locator('#task-section').evaluate(e => e.getBoundingClientRect().top);
     if (panelTop < pin.header || panelTop > 700) throw Error('Section switch content not visible');
   }
   for (const tab of ['Overview','Documents','Work & Reports','Changes & Delays','History']) {
     await page.getByRole('button', { name: tab, exact: true }).click(); await page.waitForTimeout(250);
     if (width < 768) {
       const sheet = await page.locator('.admin-task-details-page').evaluate(e => ({ background: getComputedStyle(e).backgroundColor, panel: getComputedStyle(e.querySelector('#task-section')).backgroundColor, gap: e.querySelector('#task-section').getBoundingClientRect().top - e.querySelector('.rare-task-tab-dock').getBoundingClientRect().bottom }));
       if (sheet.panel !== 'rgb(255, 255, 255)' || Math.abs(sheet.gap - 16) > 1) throw Error('Phone section spacing is incorrect: ' + JSON.stringify(sheet));
     }
     if (tab === 'History') await page.getByText('Measurements checked.').waitFor();
     const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
     if (scroll > width + 1) throw Error('Page overflows at ' + width);
     results.push({ width, tab, row, positioning });
     await page.evaluate(() => scrollTo(0,0));
     await page.screenshot({ path: fileURLToPath(new URL(`${width}-${tab.split(' ')[0].toLowerCase()}.png`, output)), fullPage: true });
   }
 }
 if (errors.length || writes) throw Error(JSON.stringify({ errors, writes }));
 await writeFile(new URL('results.json', output), JSON.stringify({ fixtureOnly: true, results, errors, writes }, null, 2));
 console.log(`${results.length} Admin section/viewport checks passed, including single-row geometry, no trailing gap, sticky mobile switching, static desktop tabs and no mutations.`);
} finally { await browser.close(); }
