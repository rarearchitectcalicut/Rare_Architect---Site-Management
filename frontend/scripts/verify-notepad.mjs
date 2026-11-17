// Browser fixtures only; no real account text is read or changed.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('../../.dist/ui-qa/node_modules/playwright');
const output = new URL('../../docs/ui-notepad-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], errors = [], writes = [];
const notes = { ADMIN: { content: '', revision: 0 }, SUPERVISOR: { content: '', revision: 0 } };
let role = 'ADMIN', failSave = false, failLoad = false, logouts = 0;
const context = await browser.newContext({ serviceWorkers: 'block' });
await context.addInitScript(() => localStorage.setItem('rare.auth.tokens', JSON.stringify({ access: 'qa-only', refresh: 'qa-only' })));
await context.route('**/api/v1/**', async (route) => {
  const request = route.request(), endpoint = new URL(request.url()).pathname.split('/api/v1/')[1];
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  let body = { count: 0, results: [] }, status = 200;
  if (endpoint === 'auth/me/') body = { id: `qa-${role}`, username: role.toLowerCase(), first_name: 'QA', role, is_staff: role === 'ADMIN', is_active: true, must_change_password: false };
  else if (endpoint === 'users/me/notepad/') {
    if (request.method() === 'PUT') {
      const payload = request.postDataJSON(); writes.push({ role, ...payload });
      if (failSave) { status = 503; body = { detail: 'QA save unavailable' }; }
      else if (payload.revision !== notes[role].revision) { status = 409; body = { current: notes[role] }; }
      else { notes[role] = { content: payload.content, revision: notes[role].revision + 1, updated_at: new Date().toISOString() }; body = notes[role]; }
    } else if (failLoad) { status = 503; body = {}; }
    else body = notes[role];
  } else if (endpoint === 'auth/logout/') { logouts++; body = {}; }
  else if (endpoint.startsWith('dashboard/')) body = {};
  await route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
const open = () => page.getByRole('button', { name: /^Open personal notes/ }).click();
const editor = page.getByRole('textbox', { name: 'Your notes', exact: true });
const dialog = page.getByRole('dialog', { name: 'Personal notes' });
async function saved() { await page.getByText('All changes saved', { exact: true }).waitFor(); }
try {
  for (role of ['ADMIN', 'SUPERVISOR']) {
    await page.goto(`http://127.0.0.1:5174/${role.toLowerCase()}/dashboard`);
    await open();
    if (await editor.inputValue() !== '') throw new Error('Account text leaked');
    await dialog.screenshot({ path: fileURLToPath(new URL(`${role.toLowerCase()}-empty.png`, output)) });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const text = `${role} notes at ${width}px\n\nMeasure the site before approving work.`;
      await editor.fill(text); await saved();
      if (notes[role].content !== text) throw new Error('Autosave did not persist exact text');
      const writeCount = writes.length;
      for (const tone of ['Lilac', 'Sage', 'Ivory']) {
        const button = page.getByRole('button', { name: `${tone} paper`, exact: true });
        await button.click();
        if (await button.getAttribute('aria-pressed') !== 'true') throw new Error('Paper selection not exposed');
        const size = await button.boundingBox();
        if (size.width < 44 || size.height < 44) throw new Error('Paper control too small');
      }
      if (writes.length !== writeCount || await editor.inputValue() !== text) throw new Error('Paper tone changed note data');
      const metrics = await dialog.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, viewport: innerWidth }));
      if (metrics.scroll > metrics.width || metrics.left < 0 || metrics.right > width) throw new Error(JSON.stringify(metrics));
      await dialog.screenshot({ path: fileURLToPath(new URL(`${role.toLowerCase()}-${width}.png`, output)) });
      await page.keyboard.press('Escape');
      if (await dialog.count()) throw new Error('Escape did not dismiss notes');
      if (!await page.getByRole('button', { name: /^Open personal notes/ }).evaluate((button) => document.activeElement === button)) throw new Error('Focus was not restored');
      await open();
      if (await editor.inputValue() !== text) throw new Error('Closed notes lost text');
      results.push({ role, width, ...metrics });
    }
    await page.reload(); await open();
    if (await editor.inputValue() !== notes[role].content) throw new Error('Reload failed');
    await page.setViewportSize({ width: 390, height: 560 });
    await page.getByRole('button', { name: 'Sage paper', exact: true }).click();
    await editor.scrollIntoViewIfNeeded();
    await editor.fill('Short viewport editing'); await saved();
    const shortBounds = await dialog.boundingBox();
    if (shortBounds.y < 0 || shortBounds.y + shortBounds.height > 561) throw new Error('Short viewport dialog is clipped');
    await page.getByRole('button', { name: 'Close personal notes', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 }); await open();
    failSave = true;
    await editor.fill('Unsaved text must survive');
    await page.getByRole('button', { name: 'Retry save' }).waitFor();
    await page.getByRole('button', { name: 'Close personal notes', exact: true }).click();
    await page.getByRole('button', { name: /Open personal notes, unsaved changes/ }).waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await dialog.waitFor();
    if (logouts !== 0 || !page.url().endsWith('/dashboard')) throw new Error('Logout discarded unsaved notes');
    if (await editor.inputValue() !== 'Unsaved text must survive') throw new Error('Failed save discarded text');
    failSave = false;
    await page.getByRole('button', { name: 'Retry save' }).click(); await saved();
    notes[role] = { content: 'Saved by another device', revision: notes[role].revision + 1 };
    await editor.fill('Local conflict text');
    await page.getByRole('button', { name: 'Keep my version' }).waitFor();
    if (await editor.inputValue() !== 'Local conflict text') throw new Error('Conflict erased local edits');
    await page.getByRole('button', { name: 'Keep my version' }).click(); await saved();
    if (notes[role].content !== 'Local conflict text') throw new Error('Explicit resolution failed');
    notes[role] = { content: 'Remote version selected', revision: notes[role].revision + 1 };
    await editor.fill('Text to replace explicitly');
    await page.getByRole('button', { name: 'Use saved version' }).click(); await saved();
    if (await editor.inputValue() !== 'Remote version selected') throw new Error('Saved-version resolution failed');
    await editor.fill(''); await saved();
    if (notes[role].content !== '') throw new Error('Clearing note did not save');
    await page.keyboard.press('Escape');
  }
  await page.reload(); failLoad = true; await open();
  await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
  failLoad = false; await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await editor.waitFor();
  await editor.fill('Save before signing out');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL('**/login');
  if (notes[role].content !== 'Save before signing out' || logouts !== 1) throw new Error('Logout failed to flush notes');
  if (await page.getByRole('button', { name: /^Open personal notes/ }).count()) throw new Error('Notes remain after sign-out');
  if (errors.length) throw new Error(JSON.stringify(errors));
  await writeFile(new URL('results.json', output), JSON.stringify({ results, errors, writeCount: writes.length, failureRetry: true, conflictResolution: true, clearedNote: true, loadRetry: true, logoutGuard: true }, null, 2));
  console.log(`${results.length} role/viewport checks passed, plus reload, failure retry, both conflict resolutions, clearing, load retry and logout protection.`);
} finally { await browser.close(); }
