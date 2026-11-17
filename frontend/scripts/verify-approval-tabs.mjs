// Approval Center browser fixtures only; no real approval records are modified.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('../../.dist/ui-qa/node_modules/playwright');
const out = '../docs/ui-approval-tabs-qa'; await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ serviceWorkers: 'block' });
const tasks = Array.from({ length: 8 }, (_, i) => ({ id: `22222222-2222-4222-8222-22222222222${i}`, project: '33333333-3333-4333-8333-333333333333', project_name: 'Cedar Residence', title: 'Inspect foundation work ' + (i + 1), description: 'Review dimensions and execution details for the work before approving.', approval_status: 'PENDING', work_status: 'NOT_STARTED', priority: 'HIGH', created_by_name: 'Site Supervisor', created_at: '2026-11-17T10:00:00Z' }));
let writes = 0; const results = [], errors = [];
await context.addInitScript(() => localStorage.setItem('rare.auth.tokens', JSON.stringify({ access: 'qa', refresh: 'qa' })));
await context.route('**/api/v1/**', async route => {
 const req = route.request(), endpoint = new URL(req.url()).pathname.split('/api/v1/')[1];
 const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
 if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
 if (req.method() !== 'GET') writes++;
 let body = { count: 0, results: [], next: null, summary: { total: 0, pending: 0, pending_extensions: 0 } };
 if (endpoint === 'auth/me/') body = { id: 'qa', role: 'ADMIN', first_name: 'QA', is_staff: true, must_change_password: false };
 else if (endpoint === 'task-approvals/') body = { ...body, count: tasks.length, results: tasks };
 await route.fulfill({ headers, json: body });
});
const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
const labels = ['Task Approvals','Task Changes','Timeline Changes','Delays & Extensions','Daily Work Verification','Decision History'];
try {
 await page.goto('http://127.0.0.1:5174/admin/approvals');
 const nav = page.getByRole('navigation', { name: 'Request queues', exact: true }), dock = page.locator('.approval-queue-nav-dock');
 for (const width of [320,390,768,1024,1440]) {
  await page.setViewportSize({ width, height: 900 });
  await nav.getByRole('button', { name: labels[0], exact: true }).click();
  await page.getByRole('status', { name: 'Loading Approval Center...', exact: true }).waitFor({ state: 'detached' });
  await dock.evaluate(e => scrollTo(0, e.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(e).top) + 120)); await page.waitForTimeout(100);
  const pin = await dock.evaluate(e => ({ top: e.getBoundingClientRect().top, expected: parseFloat(getComputedStyle(e).top), header: document.querySelector('.rare-topbar').getBoundingClientRect().bottom }));
  if (Math.abs(pin.top - pin.expected) > 1 || pin.top < pin.header - 1) throw Error('Sticky positioning failed: ' + JSON.stringify(pin));
  const metrics = await nav.evaluate(e => ({ height: e.offsetHeight, rows: new Set([...e.children].map(b => b.offsetTop)).size, widths: [...e.children].map(b => b.getBoundingClientRect().width), scroll: document.documentElement.scrollWidth, right: e.getBoundingClientRect().right, mainRight: document.querySelector('main').getBoundingClientRect().right - parseFloat(getComputedStyle(document.querySelector('main')).paddingRight), clipped: [...e.children].filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.getAttribute('aria-label')) }));
  if (metrics.height > 56 || metrics.rows !== 1 || metrics.clipped.length || metrics.scroll > width + 1 || Math.max(...metrics.widths) - Math.min(...metrics.widths) > 1 || Math.abs(metrics.right - metrics.mainRight) > 1) throw Error(JSON.stringify({ width, metrics }));
  await page.screenshot({ path: `${out}/${width}-sticky.png` });
  for (const label of labels) {
   const button = nav.getByRole('button', { name: label, exact: true }); await button.click();
   await page.waitForFunction(name => [...document.querySelectorAll('.approval-queue-nav > button')].some(b => b.getAttribute('aria-label') === name && b.getAttribute('aria-pressed') === 'true'), label);
   await page.getByRole('status', { name: 'Loading Approval Center...', exact: true }).waitFor({ state: 'detached' });
   if (await button.getAttribute('aria-pressed') !== 'true') throw Error('Wrong queue selected');
   results.push({ width, label, pin, metrics });
  }
 }
 if (errors.length || writes) throw Error(JSON.stringify({ errors, writes }));
 await writeFile(`${out}/results.json`, JSON.stringify({ fixtureOnly: true, results, errors, writes }, null, 2));
 console.log(`${results.length} Approval Center queue/viewport checks passed: single row, no clipped labels, full width, sticky positioning, all queue destinations and no mutations.`);
} finally { await browser.close(); }
