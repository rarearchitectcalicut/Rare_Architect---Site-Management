import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('../../.dist/ui-qa/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ serviceWorkers: 'block' });
let gate, release, fail = false;
function hold() { gate = new Promise(resolve => { release = resolve; }); }
hold();
await context.addInitScript(() => localStorage.setItem('rare.auth.tokens', JSON.stringify({ access: 'qa', refresh: 'qa' })));
await context.route('**/api/v1/**', async route => {
 const endpoint = new URL(route.request().url()).pathname.split('/api/v1/')[1];
 const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
 if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
 if (endpoint === 'auth/me/') return route.fulfill({ headers, json: { id: 'qa', username: 'qa', role: 'ADMIN', is_staff: true, is_active: true, must_change_password: false } });
 await gate;
 await route.fulfill({ status: fail && endpoint === 'task-approvals/' ? 503 : 200, headers, json: fail && endpoint === 'task-approvals/' ? { detail: 'Approval service unavailable.' } : { count: 0, results: [], next: null, summary: { total: 0, pending: 0, pending_extensions: 0 } } });
});
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
const loader = page.getByRole('status', { name: 'Loading Approval Center...', exact: true });
try {
 await page.goto('http://127.0.0.1:5174/admin/approvals');
 await loader.waitFor();
 await mkdir('../docs/ui-approval-loading-qa', { recursive: true });
 await page.setViewportSize({ width: 390, height: 844 });
 await page.screenshot({ path: '../docs/ui-approval-loading-qa/mobile.png' });
 release(); await loader.waitFor({ state: 'detached' });
 hold(); fail = true; await page.getByRole('button', { name: 'Refresh approvals' }).click(); await loader.waitFor();
 release(); await loader.waitFor({ state: 'detached' }); await page.getByText('Approval service unavailable.').waitFor();
 hold(); fail = false; await page.getByRole('button', { name: 'Refresh approvals' }).click(); await loader.waitFor();
 release(); await loader.waitFor({ state: 'detached' });
 for (const tab of ['history','delays']) {
   hold(); await page.goto(`http://127.0.0.1:5174/admin/approvals?tab=${tab}`); await loader.waitFor(); release(); await loader.waitFor({ state: 'detached' });
 }
 if (errors.length) throw Error(JSON.stringify(errors));
 console.log('Shared loading screen verified for initial load, refresh, failure dismissal, recovery, history and delays. No page errors.');
} finally { release(); await browser.close(); }
