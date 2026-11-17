// Submitted report viewer fixtures only; no real data is read or changed.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('../../.dist/ui-qa/node_modules/playwright');
const out = '../docs/ui-report-sticky-qa'; await mkdir(out, { recursive: true });
const pid = '22222222-2222-4222-8222-222222222222', rid = '66666666-6666-4666-8666-666666666666', sid = '44444444-4444-4444-8444-444444444444';
const report = { id: rid, project: pid, project_name: 'Cedar Residence', project_status: 'ACTIVE', reported_by: sid, reported_by_name: 'Site Supervisor', status: 'SUBMITTED', report_date: '2026-11-17', submitted_at: '2026-11-17T16:00:00Z', work_summary: 'Measured work, inspected reinforcement and coordinated the next pour. '.repeat(65), weather_condition: 'SUNNY', site_condition: 'NORMAL', site_notes: 'Dimensions checked on site.', issues: 'No issues recorded.', next_day_plan: 'Continue the planned work.', work_entry_count: 0 };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], errors = [];
try {
 for (const role of ['ADMIN','SUPERVISOR']) {
  const context = await browser.newContext({ serviceWorkers: 'block' }); let writes = 0;
  await context.addInitScript(() => localStorage.setItem('rare.auth.tokens', JSON.stringify({ access: 'qa', refresh: 'qa' })));
  await context.route('**/api/v1/**', async route => {
   const req = route.request(), endpoint = new URL(req.url()).pathname.split('/api/v1/')[1];
   const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
   if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
   if (req.method() !== 'GET') writes++;
   let body = { count: 0, results: [], next: null, previous: null };
   if (endpoint === 'auth/me/') body = { id: sid, first_name: 'QA', role, is_staff: role === 'ADMIN', must_change_password: false };
   else if (endpoint === `daily-reports/${rid}/`) body = report;
   else if (/^projects\/[^/]+\/(overview\/)?$/.test(endpoint)) body = { id: pid, name: report.project_name, status: 'ACTIVE', supervisors: [{ id: sid, supervisor: sid }] };
   else if (endpoint === `projects/${pid}/daily-reports/`) body = { ...body, count: 1, results: [report], summary: { submitted: 1, drafts: 0, pending_work: 0, total: 1 } };
   await route.fulfill({ headers, json: body });
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:5174/${role.toLowerCase()}/projects/${pid}/daily-reports?report=${rid}`);
  const nav = page.getByRole('navigation', { name: 'Report sections', exact: true }); await nav.waitFor();
  const dock = page.locator('.rare-report-nav-dock').filter({ has: nav });
  for (const width of [320,390,768,1024,1440]) {
   await page.setViewportSize({ width, height: 900 });
   await nav.getByRole('button', { name: 'Overview', exact: true }).click();
   await dock.evaluate(e => scrollTo(0, e.getBoundingClientRect().top + scrollY - parseFloat(getComputedStyle(e).top) + 120));
   await page.waitForTimeout(100);
   const pin = await dock.evaluate(e => ({ top: e.getBoundingClientRect().top, expected: parseFloat(getComputedStyle(e).top), header: document.querySelector('.rare-topbar').getBoundingClientRect().bottom, position: getComputedStyle(e).position }));
   if (pin.position !== 'sticky' || Math.abs(pin.top - pin.expected) > 1 || pin.top < pin.header - 1) throw Error(JSON.stringify({ role, width, pin }));
   const row = await nav.evaluate(e => ({ height: e.offsetHeight, rows: new Set([...e.children].map(b => b.offsetTop)).size, scroll: document.documentElement.scrollWidth }));
   if (row.height > 56 || row.rows !== 1 || row.scroll > width + 1) throw Error(JSON.stringify(row));
   if (width < 640) {
    const clipped = await nav.evaluate(e => [...e.children].filter(b => {
      const label = b.querySelector('.report-tab-phone-label'), r = b.getBoundingClientRect(), n = e.getBoundingClientRect();
      return r.left < n.left || r.right > n.right || label.getBoundingClientRect().width > b.clientWidth - 4;
    }).map(b => b.getAttribute('aria-label')));
    if (clipped.length) throw Error('Phone labels do not fit: ' + JSON.stringify(clipped));
   }
   if (width >= 1024) {
    const sizing = await nav.evaluate(e => ({ nav: e.getBoundingClientRect().width, report: e.closest('.daily-report-detail').getBoundingClientRect().width, widths: [...e.children].map(b => b.getBoundingClientRect().width), mainRight: document.querySelector('main').getBoundingClientRect().right - parseFloat(getComputedStyle(document.querySelector('main')).paddingRight), right: e.getBoundingClientRect().right }));
    if (Math.abs(sizing.nav - sizing.report) > 1 || Math.abs(sizing.right - sizing.mainRight) > 1 || Math.max(...sizing.widths) - Math.min(...sizing.widths) > 1) throw Error('Desktop navigation does not fill its available width: ' + JSON.stringify(sizing));
   }
   await page.screenshot({ path: `${out}/${role.toLowerCase()}-${width}-sticky.png` });
   for (const label of ['Site diary','Task work','Manpower','Materials','Attachments','Overview']) {
    const button = nav.getByRole('button', { name: new RegExp('^' + label + '(?:\\s|$)') });
    await button.click(); await page.waitForTimeout(100);
    if (await button.getAttribute('aria-pressed') !== 'true') throw Error('Section did not switch: ' + label);
    const visible = await button.evaluate(e => { const r = e.getBoundingClientRect(), n = e.parentElement.getBoundingClientRect(); return r.left >= n.left - 1 && r.right <= n.right + 1; });
    if (!visible) throw Error('Selected tab remains clipped: ' + JSON.stringify({ role, width, label, metrics: await button.evaluate(e => ({ button: e.getBoundingClientRect().toJSON(), nav: e.parentElement.getBoundingClientRect().toJSON(), scroll: e.parentElement.scrollLeft })) }));
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error('Report overflow');
    results.push({ role, width, label, pin, row });
   }
  }
  if (writes) throw Error('Viewing a report mutated data');
  await context.close();
 }
 if (errors.length) throw Error(JSON.stringify(errors));
 await writeFile(`${out}/results.json`, JSON.stringify({ fixtureOnly: true, results, errors }, null, 2));
 console.log(`${results.length} role/viewport/section checks passed; sticky report navigation verified at all five widths, without mutations.`);
} finally { await browser.close(); }
