// End-to-end browser fixtures only. Backend rules are tested separately in Django.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('../../.dist/ui-qa/node_modules/playwright');
const output = new URL('../../docs/ui-report-builder-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const pid = '22222222-2222-4222-8222-222222222222', rid = '66666666-6666-4666-8666-666666666666', sid = '44444444-4444-4444-8444-444444444444', tid = '33333333-3333-4333-8333-333333333333';
const project = { id: pid, name: 'Cedar Residence', status: 'ACTIVE', category_name: 'Residential', supervisors: [{ id: sid, supervisor: sid }], end_date: '2026-12-31' };
const task = { id: tid, project: pid, project_name: project.name, project_status: 'ACTIVE', title: 'Ground-floor blockwork', approval_status: 'APPROVED', work_status: 'IN_PROGRESS', measurement_method: 'QUANTITY', planned_quantity: '100', measurement_unit: 'SQM', progress: { measurement_method: 'QUANTITY', planned_quantity: '100', verified_quantity: '0', pending_quantity: '0', available_quantity: '100', progress_percentage: 0, measurement_unit: 'SQM' } };
let report, sections, failSave = false, loseSubmit = false, submittedCount = 0;
const writes = [], results = [], errors = [];
function reset() {
  report = { id: rid, project: pid, project_name: project.name, project_status: 'ACTIVE', reported_by: sid, reported_by_name: 'Site Supervisor', status: 'DRAFT', report_date: '2026-11-17', work_summary: '', weather_condition: '', site_condition: '', site_notes: '', issues: '', next_day_plan: '', work_entry_count: 0 };
  sections = { 'work-entries': [], manpower: [], materials: [], attachments: [] };
}
reset();
const paged = (rows) => ({ count: rows.length, results: rows, next: null, previous: null });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ serviceWorkers: 'block' });
await context.addInitScript(() => localStorage.setItem('rare.auth.tokens', JSON.stringify({ access: 'qa-only', refresh: 'qa-only' })));
await context.route('**/api/v1/**', async (route) => {
  const request = route.request(), endpoint = new URL(request.url()).pathname.split('/api/v1/')[1], method = request.method();
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
  let body = paged([]), status = 200;
  if (method !== 'GET') writes.push({ endpoint, method, payload: request.postData()?.slice(0, 500) });
  if (endpoint === 'auth/me/') body = { id: sid, role: 'SUPERVISOR', first_name: 'Site', must_change_password: false };
  else if (/^projects\/[^/]+\/(overview\/)?$/.test(endpoint)) body = project;
  else if (endpoint === `daily-reports/${rid}/`) {
    if (method === 'PATCH') {
      if (failSave) { status = 503; body = { detail: 'QA connection unavailable. Keep your draft open and retry.' }; }
      else { Object.assign(report, request.postDataJSON()); body = report; }
    } else body = report;
  } else if (endpoint === `daily-reports/${rid}/submit/`) {
    if (!report.work_summary.trim()) { status = 400; body = { work_summary: 'Required' }; }
    else { submittedCount++; report.status = 'SUBMITTED'; body = { report }; if (loseSubmit) { loseSubmit = false; return route.abort('failed'); } }
  } else if (endpoint.startsWith(`daily-reports/${rid}/`)) {
    const section = endpoint.split('/')[2];
    if (sections[section]) {
      if (method === 'POST') {
        const data = section === 'attachments' ? { original_filename: 'site-evidence.pdf', mime_type: 'application/pdf', caption: 'Site evidence' } : request.postDataJSON();
        const row = { ...data, id: `88888888-8888-4888-8888-88888888888${sections[section].length}`, daily_report: rid, project_id: pid, report_status: 'DRAFT', task_title: task.title, verification_status: 'PENDING', measurement_method: 'QUANTITY', measurement_unit: 'SQM' };
        sections[section].push(row); report.work_entry_count = sections['work-entries'].length; body = row;
      } else body = paged(sections[section]);
    }
  } else if (endpoint === 'tasks/' || endpoint.includes('task-register')) body = paged([task]);
  else if (endpoint.includes('unread-count')) body = { unread_count: 0 };
  else if (endpoint.endsWith('/daily-reports/')) body = { ...paged([report]), reporting_context: { today: '2026-11-17' }, summary: { total: 1, drafts: report.status === 'DRAFT' ? 1 : 0, submitted: report.status === 'SUBMITTED' ? 1 : 0, pending_work: sections['work-entries'].length }, reporters: [] };
  await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
async function visit() { await page.goto(`http://127.0.0.1:5174/supervisor/projects/${pid}/daily-reports?report=${rid}`); await page.getByRole('heading', { name: 'Tell us about today' }).waitFor(); }
async function record(step, width) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(50);
  const metrics = await page.evaluate(() => ({ body: document.documentElement.scrollWidth, width: innerWidth, text: document.querySelector('.daily-report-detail')?.innerText.slice(0, 100) }));
  if (metrics.body > metrics.width || errors.length) throw new Error(JSON.stringify({ step, width, metrics, errors }));
  if (step === 'site-update') {
    const alignment = await page.locator('.rare-report-site-update').evaluate((element) => {
      const children = [...element.children].map((child) => child.getBoundingClientRect()).filter((rect) => rect.width && rect.height);
      return children.every((rect, i) => Math.abs(rect.left - children[0].left) < 2 && (!i || rect.top >= children[i - 1].bottom - 1));
    });
    if (!alignment) throw new Error(`Shuffled site-update fields at ${width}px`);
    if (await page.locator('.rare-report-site-update .rare-report-choice').count()) throw new Error('Long option grids remain in site-update form');
  }
  await page.screenshot({ path: fileURLToPath(new URL(`${step}-${width}.png`, output)), fullPage: true });
  results.push({ step, width, ...metrics });
}
const next = () => page.getByRole('button', { name: 'Save & Next', exact: true }).click();
try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    reset(); await page.setViewportSize({ width, height: 1000 }); await visit();
    await page.getByRole('combobox', { name: 'Did work happen today?', exact: true }).selectOption('yes');
    await page.getByRole('combobox', { name: 'Add a work activity', exact: true }).selectOption('Blockwork carried out.');
    await page.getByRole('combobox', { name: 'Add a work activity', exact: true }).selectOption('Electrical work carried out.');
    await page.getByRole('combobox', { name: 'Weather', exact: true }).selectOption('SUNNY');
    await page.getByRole('combobox', { name: 'Any site issues or safety concerns?', exact: true }).selectOption('none');
    await record('site-update', width);
    await next(); await page.getByText('People on site', { exact: true }).waitFor();
    if (!report.work_summary.includes('Blockwork carried out.') || report.issues !== 'No issues observed' || report.weather_condition !== 'SUNNY') throw new Error('Quick choices were not saved');
    await record('work-and-crew', width);
    await next(); await page.getByRole('heading', { name: 'Review your report', exact: true }).waitFor();
    await record('review', width);
    await page.reload(); await page.getByRole('heading', { name: 'Tell us about today' }).waitFor();
    if (!await page.getByRole('button', { name: 'Remove Blockwork', exact: true }).isVisible()) throw new Error('Saved activities did not reload');
  }
  // Save failure stays on the same step and retains the text.
  reset(); await visit(); await page.getByRole('combobox', { name: 'Did work happen today?', exact: true }).selectOption('no');
  await page.getByRole('combobox', { name: 'Why was there no work?', exact: true }).selectOption('Heavy rain');
  failSave = true; await next(); await page.getByRole('alert').filter({ hasText: 'QA connection unavailable' }).waitFor();
  if (!await page.getByRole('heading', { name: 'Tell us about today' }).isVisible()) throw new Error('Advanced despite failed save');
  failSave = false; await next(); await page.getByText('People on site', { exact: true }).waitFor();
  await next(); await page.getByRole('heading', { name: 'Review your report', exact: true }).waitFor();
  loseSubmit = true; await page.getByRole('button', { name: 'Submit report', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit report', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Report submitted' }).waitFor();
  if (report.status !== 'SUBMITTED' || submittedCount !== 1) throw new Error('Lost submission response was not recovered');
  // Real task quantity, crew and material inputs still use validated row forms.
  reset(); await visit(); await page.getByRole('combobox', { name: 'Did work happen today?', exact: true }).selectOption('yes'); await page.getByRole('combobox', { name: 'Add a work activity', exact: true }).selectOption('Blockwork carried out.'); await next();
  const addButtons = page.locator('.rare-guided-report').getByRole('button', { name: 'Add', exact: true });
  await addButtons.nth(0).click();
  await page.getByLabel('Task', { exact: true }).selectOption(tid);
  await page.getByRole('combobox', { name: 'Work description suggestion', exact: true }).selectOption('Work continued on this task.');
  await page.getByLabel('Quantity completed today (SQM)', { exact: false }).fill('10');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add task work', exact: true }) });
    if (await form.getByPlaceholder('Task name or description').count() || await form.getByRole('button', { name: 'Search tasks', exact: true }).count()) throw new Error('Search controls remain in Add task work');
    const buttons = await form.locator('.rare-report-work-actions > button').evaluateAll((elements) => elements.map((element) => { const box = element.getBoundingClientRect(); return { top: box.top, width: box.width, height: box.height }; }));
    if (buttons.length !== 2 || Math.abs(buttons[0].top - buttons[1].top) > 1 || buttons.some((button) => button.height < 44) || width < 640 && Math.abs(buttons[0].width - buttons[1].width) > 1) throw new Error(JSON.stringify({ width, buttons }));
    await record('add-task-work', width);
  }
  await page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add task work', exact: true }) }).getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved successfully' }).waitFor();
  await addButtons.nth(1).click();
  await page.getByLabel('Worker Count', { exact: true }).fill('3');
  await page.getByRole('combobox', { name: 'Common working hours', exact: true }).selectOption('8');
  await page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add manpower record', exact: true }) }).getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved successfully' }).waitFor();
  await addButtons.nth(2).click(); await page.getByRole('combobox', { name: 'Common material', exact: true }).selectOption('Cement');
  await page.getByLabel('Quantity', { exact: true }).fill('10'); await page.getByRole('combobox', { name: 'Common units', exact: true }).selectOption('bags');
  await page.locator('form').filter({ has: page.getByRole('heading', { name: 'Add material record', exact: true }) }).getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved successfully' }).waitFor();
  await next(); await page.getByRole('heading', { name: 'Review your report', exact: true }).waitFor();
  if (sections['work-entries'][0]?.quantity_completed_today !== '10' || sections.manpower[0]?.worker_count !== 3 || sections.materials[0]?.material_name !== 'Cement') throw new Error('Structured rows were not saved correctly');
  await page.getByRole('button', { name: 'Take photo / Choose files', exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'site-evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 QA evidence') });
  await page.getByRole('button', { name: 'Upload files', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved successfully' }).waitFor();
  if (sections.attachments.length !== 1) throw new Error('Evidence was not uploaded');
  if (errors.length) throw new Error(JSON.stringify(errors));
  await writeFile(new URL('results.json', output), JSON.stringify({ fixtureOnly: true, results, writes, errors, failureRetry: true, savedReload: true, lostSubmissionRecovery: true, structuredRows: true, evidenceUpload: true }, null, 2));
  console.log(`${results.length} step/viewport checks passed; save retry, reload, lost-submit recovery, task/crew/material rows and evidence upload verified.`);
} finally { await browser.close(); }
