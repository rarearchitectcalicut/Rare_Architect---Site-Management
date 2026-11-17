// Intercepted API fixtures only; no real account or site records are changed.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('../../.dist/ui-qa/node_modules/playwright');
const output = new URL('../../docs/ui-supervisor-task-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ serviceWorkers: 'block' });
const projectId = '00000000-0000-4000-8000-000000000001', taskId = '00000000-0000-4000-8000-000000000002';
const base = 'http://127.0.0.1:5174', url = `/supervisor/projects/${projectId}/tasks/${taskId}`;
let task = { id: taskId, project: projectId, project_name: 'Cedar House', project_status: 'ACTIVE', title: 'Foundation inspection and concrete preparation', approval_status: 'APPROVED', work_status: 'NOT_STARTED', priority: 'HIGH', worker_name: 'Foundation team', display_order: 2, start_date: '2026-11-01', end_date: '2026-11-30', measurement_method: 'QUANTITY', planned_quantity: '100.000', measurement_unit: 'SQM', description: 'Inspect levels, reinforcement and concrete preparation before the next pour.', completion_criteria: 'All dimensions checked and work recorded in the daily report.', progress: { measurement_method: 'QUANTITY', progress_percentage: '35.00', verified_quantity: '35.000', planned_quantity: '100.000', measurement_unit: 'SQM' } };
let deny = false, mismatch = false, startWrites = 0;
const errors = [], results = [];
await context.addInitScript(() => localStorage.setItem('rare.auth.tokens', JSON.stringify({ access: 'qa-only', refresh: 'qa-only' })));
await context.route('**/api/v1/**', async route => {
 const request = route.request(), endpoint = new URL(request.url()).pathname.split('/api/v1/')[1];
 const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
 if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
 let body = { count: 0, results: [], next: null, previous: null }, status = 200;
 if (endpoint === 'auth/me/') body = { id: 'qa-supervisor', username: 'qa', first_name: 'QA', role: 'SUPERVISOR', is_active: true, must_change_password: false };
 else if (endpoint === `projects/${projectId}/overview/`) body = { id: projectId, name: 'Cedar House', status: task.project_status, start_date: '2026-10-01', end_date: '2026-12-31' };
 else if (endpoint === `projects/${projectId}/tasks/`) body = { ...body, count: 1, results: [task] };
 else if (endpoint === `tasks/${taskId}/`) {
   body = mismatch ? { ...task, project: '00000000-0000-4000-8000-000000000099' } : task;
   if (deny) { status = 403; body = { detail: 'You do not have permission to view this task.' }; }
 } else if (endpoint === `tasks/${taskId}/start/`) { startWrites++; task = { ...task, work_status: 'IN_PROGRESS' }; body = { task }; }
 else if (endpoint === `tasks/${taskId}/history/`) body = { ...body, count: 1, results: [{ id: 'decision', action: 'APPROVED', actor_name: 'Reviewing Admin', created_at: '2026-11-15T10:00:00Z', details: { comment: 'Measurements checked on site.' } }] };
 else if (endpoint === 'dashboard/supervisor/') body = {};
 await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
});
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
async function overview() { await page.getByRole('heading', { name: task.title, exact: true }).waitFor(); }
async function layout(width) {
 const metrics = await page.locator('.supervisor-task-details-page').evaluate(element => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, overflow: [...element.querySelectorAll('button,input,select,textarea,dd')].filter(e => !e.closest('.rare-task-tabs') && e.getBoundingClientRect().width && (e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1)).map(e => e.textContent) }));
 if (metrics.scroll > width + 1 || metrics.overflow.length) throw Error(JSON.stringify(metrics));
 return metrics;
}
try {
 await page.goto(base + `/supervisor/projects/${projectId}/tasks`);
 await page.getByRole('link', { name: new RegExp(task.title) }).first().click();
 await page.waitForURL('**' + url); await overview();
 if (await page.locator('.supervisor-task-popup').count()) throw Error('Legacy popup remains');
 for (const width of [320,390,768,1024,1440]) {
   await page.setViewportSize({ width, height: 900 });
   const tabs = page.getByRole('navigation', { name: 'Task detail sections' });
   const dock = page.locator('.rare-task-tab-dock');
   const row = await tabs.evaluate(e => ({ height: e.offsetHeight, css: { padding: getComputedStyle(e).padding, boxSizing: getComputedStyle(e).boxSizing, buttonHeight: e.querySelector("button").offsetHeight, border: getComputedStyle(e).borderWidth }, rows: new Set([...e.querySelectorAll('button')].map(b => b.offsetTop)).size }));
   if (row.height > 56 || row.rows !== 1) throw Error('Tabs wrap or use too much height: ' + JSON.stringify(row));
   const ending = await tabs.evaluate(e => ({ rightGap: e.getBoundingClientRect().right - e.lastElementChild.getBoundingClientRect().right, overflow: e.scrollWidth > e.clientWidth + 1 }));
   if (!ending.overflow && ending.rightGap > 7) throw Error('Unused space at the end of the tab row: ' + JSON.stringify(ending));
   const dockStyle = await dock.evaluate(e => ({ position: getComputedStyle(e).position, background: getComputedStyle(e).backgroundImage, attachment: getComputedStyle(e).backgroundAttachment }));
   if (width >= 768 && dockStyle.position !== 'static') throw Error('Desktop tabs must scroll normally');
   if (width < 768 && dockStyle.position !== 'sticky') throw Error('Missing sticky dock');
   if (width < 768 && (dockStyle.background === 'none' || dockStyle.attachment.split(',').some(value => value.trim() !== 'fixed'))) throw Error('Sticky dock does not match the canvas: ' + JSON.stringify(dockStyle));
   if (width < 768) {
     await page.getByRole('button', { name: 'Overview', exact: true }).click();
     await page.evaluate(() => scrollTo(0, 650)); await page.waitForTimeout(100);
     const pinned = await dock.evaluate(e => ({ top: e.getBoundingClientRect().top, expected: parseFloat(getComputedStyle(e).top), header: document.querySelector('.rare-topbar').getBoundingClientRect().bottom }));
     if (Math.abs(pinned.top - pinned.expected) > 1 || pinned.top < pinned.header - 1) throw Error('Tabs did not stick below the topbar: ' + JSON.stringify(pinned));
     await page.screenshot({ path: fileURLToPath(new URL(`${width}-sticky-tabs.png`, output)) });
     await page.getByRole('button', { name: 'Docs', exact: true }).click();
     await page.getByRole('button', { name: 'Refresh task documents' }).waitFor();
     await page.waitForTimeout(100);
     const panelTop = await page.locator('#supervisor-task-section').evaluate(e => e.getBoundingClientRect().top);
     if (panelTop < pinned.header || panelTop > 700) throw Error('Switching a pinned tab did not bring its content into view');
     await page.evaluate(() => scrollTo(0,0));
   }
   for (const tab of ['Overview','Docs','Decisions','Delays']) {
     await page.getByRole('button', { name: tab, exact: true }).click();
     if (tab === 'Decisions') await page.getByText('Measurements checked on site.').waitFor();
     if (tab === 'Delays') await page.getByText('No delays have been reported for this task.').waitFor();
     if (tab === 'Docs') await page.getByRole('button', { name: 'Refresh task documents' }).waitFor();
     await page.waitForTimeout(250);
     if (width < 768) {
       const sheet = await page.locator('.supervisor-task-details-page').evaluate(e => ({ background: getComputedStyle(e).backgroundColor, panel: getComputedStyle(e.querySelector('#supervisor-task-section')).backgroundColor, gap: e.querySelector('#supervisor-task-section').getBoundingClientRect().top - e.querySelector('.rare-task-tab-dock').getBoundingClientRect().bottom }));
       if (sheet.panel !== 'rgb(255, 255, 255)' || Math.abs(sheet.gap - 16) > 1) throw Error('Phone section spacing is incorrect: ' + JSON.stringify(sheet));
     }
     results.push({ width, tab, tabRow: row, ending, dockStyle, ...await layout(width) });
     await page.evaluate(() => scrollTo(0,0));
     await page.screenshot({ path: fileURLToPath(new URL(`${width}-${tab.toLowerCase().replaceAll(' ','-')}.png`, output)), fullPage: true });
   }
 }
 await page.getByRole('button', { name: 'Report delay', exact: true }).click();
 await page.getByRole('dialog', { name: 'Report a task delay' }).waitFor();
 await page.getByRole('button', { name: 'Close delay form' }).click();
 await page.getByRole('button', { name: 'Request Changes', exact: true }).click();
 await page.getByRole('button', { name: 'Close task form' }).waitFor();
 await page.getByRole('button', { name: 'Close task form' }).click();
 await page.getByRole('button', { name: 'Overview', exact: true }).click();
 await page.getByRole('button', { name: 'Start Task', exact: true }).click();
 await page.getByText('Task started successfully.', { exact: true }).waitFor();
 if (startWrites !== 1) throw Error('Start did not use existing API once');
 await page.getByRole('button', { name: 'Complete Task', exact: true }).waitFor();
 await page.reload(); await overview();
 await page.goto(base + `/supervisor/projects/${projectId}/tasks?task=${taskId}`);
 await page.waitForURL('**' + url); await overview();
 for (const approval_status of ['PENDING','REJECTED']) {
   task = { ...task, approval_status }; await page.reload(); await overview();
   await page.getByRole('button', { name: approval_status === 'PENDING' ? 'Edit Task' : 'Correct & Resubmit', exact: true }).click();
   await page.getByRole('button', { name: 'Close task form' }).click();
   if (await page.getByRole('button', { name: 'Start Task', exact: true }).count()) throw Error('Unapproved task can start');
 }
 task = { ...task, project_status: 'CANCELLED' }; await page.reload(); await overview();
 if (await page.getByRole('button', { name: 'Correct & Resubmit', exact: true }).count()) throw Error('Cancelled project permits edits');
 await page.getByRole('button', { name: 'Delays', exact: true }).click();
 if (await page.getByRole('button', { name: 'Report delay', exact: true }).count()) throw Error('Cancelled project permits delays');
 mismatch = true; await page.reload(); await page.getByRole('alert').filter({ hasText: 'does not belong' }).waitFor();
 if (await page.getByRole('heading', { name: task.title, exact: true }).count()) throw Error('Mismatched task is exposed');
 mismatch = false; deny = true; await page.reload(); await page.getByRole('alert').filter({ hasText: 'permission' }).waitFor();
 deny = false; await page.getByRole('button', { name: 'Try again', exact: true }).click(); await overview();
 if (errors.length) throw Error(JSON.stringify(errors));
 await writeFile(new URL('results.json', output), JSON.stringify({ fixtureOnly: true, results, errors, legacyRedirect: true, startWrites, editModes: true, permissionAndMismatchRecovery: true }, null, 2));
 console.log(`${results.length} section/viewport checks passed, plus canonical navigation, legacy redirect, reload, execution API, edit modes, delay form, permissions and error recovery.`);
} finally { await browser.close(); }
