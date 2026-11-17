// API fixtures for visual QA only. No application code or real data is replaced.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('../../.dist/ui-qa/node_modules/playwright');
const output = new URL('../../docs/ui-dashboard-charts-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], mutations = [], errors = [];
let role = 'ADMIN', state = 'populated';
const context = await browser.newContext({ serviceWorkers: 'block' });
await context.addInitScript(() => localStorage.setItem('rare.auth.tokens', JSON.stringify({ access: 'qa-only', refresh: 'qa-only' })));
await context.route('**/api/v1/**', async (route) => {
  const request = route.request(), endpoint = new URL(request.url()).pathname.split('/api/v1/')[1];
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (request.method() !== 'GET') mutations.push(endpoint);
  const value = (n) => state === 'empty' ? 0 : state === 'large' ? n * 100000 : n;
  const tasks = state === 'missing' ? {} : { total: value(20), total_created: value(20), approved: value(12), pending_approval: value(6), rejected: value(2), completed: value(7) };
  const work = state === 'missing' ? {} : { pending_verification: value(5), verified: value(10), rejected: value(2) };
  const reports = { total: value(11), submitted: value(8), draft: value(3) };
  let body = { count: 0, results: [], next: null, previous: null };
  if (endpoint === 'auth/me/') body = { id: 'qa-user', username: 'qa', first_name: 'Site', role, is_staff: role === 'ADMIN', is_active: true, must_change_password: false };
  else if (endpoint === 'dashboard/admin/' || endpoint === 'dashboard/supervisor/') body = { projects: { total: value(9), total_assigned: value(9), active: value(5), maintenance: value(2) }, tasks, my_tasks: tasks, daily_reports: reports, project_daily_reports: reports, daily_task_work: work, project_daily_task_work: work, notifications: {}, delay_reports: {}, change_requests: {} };
  else if (endpoint === 'dashboard/admin/review-queue/') body = { recent_activity: Array.from({ length: 7 }, (_, i) => ({ id: `activity-${i + 1}`, description: `QA activity ${i + 1}`, actor_name: 'QA Admin', actor_role: 'ADMIN', created_at: `2026-11-${17 - i}T08:00:00Z` })) };
  else if (endpoint.startsWith('dashboard/')) body = {};
  else if (endpoint === 'project-categories/') body = { count: 3, results: [
    { id: 'residential', name: 'Residential', description: 'Homes and thoughtful living spaces.' },
    { id: 'commercial', name: 'Commercial architecture and mixed-use development', description: 'Workplaces, retail and business spaces.', image: '/missing-category-cover.jpg' },
    { id: 'art', name: 'Art', description: '' },
  ] };
  await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
try {
  for (role of ['ADMIN', 'SUPERVISOR'].filter((value) => !process.env.UI_QA_ROLE || value === process.env.UI_QA_ROLE)) {
    for (state of ['populated', 'empty', 'missing', 'large'].filter((value) => !process.env.UI_QA_STATE || value === process.env.UI_QA_STATE)) {
      await page.goto(`http://127.0.0.1:5174/${role.toLowerCase()}/dashboard`);
      const summary = page.locator('.rare-work-summary');
      await summary.waitFor();
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1100 });
        await summary.scrollIntoViewIfNeeded();
        const metrics = await summary.evaluate((element) => ({
          viewport: innerWidth, body: document.documentElement.scrollWidth,
          charts: element.querySelectorAll('article').length,
          overflow: [...element.querySelectorAll('*')].filter((child) => { const b = child.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1 || child.scrollWidth > child.clientWidth + 2 && getComputedStyle(child).overflow === 'visible'); }).map((child) => child.className?.baseVal ?? child.className).slice(0, 8),
          links: [...element.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), height: a.getBoundingClientRect().height })),
        }));
        if (metrics.charts !== 2 || metrics.body > width || metrics.overflow.length) throw new Error(JSON.stringify({ role, state, width, metrics }));
        if (metrics.links.some((a) => a.height < 43 || a.href.startsWith(role === 'ADMIN' ? '/supervisor/' : '/admin/'))) throw new Error('Invalid role link or touch target');
        await summary.locator('a').first().focus();
        if (!await summary.locator('a').first().evaluate((a) => document.activeElement === a && getComputedStyle(a).outlineStyle !== 'none')) throw new Error('Missing keyboard focus');
        await summary.screenshot({ path: fileURLToPath(new URL(`${role.toLowerCase()}-${state}-${width}.png`, output)) });
        if (role === 'SUPERVISOR' && state === 'populated') {
          const stats = page.locator('.supervisor-summary-cards');
          const cards = await stats.locator(':scope > a').evaluateAll((elements) => elements.map((element) => {
            const box = element.getBoundingClientRect();
            return { top: box.top, width: box.width, height: box.height, overflow: element.scrollWidth > element.clientWidth + 1 };
          }));
          if (cards.length !== 3 || cards.some((card) => Math.abs(card.top - cards[0].top) > 1 || Math.abs(card.width - cards[0].width) > 1 || Math.abs(card.height - cards[0].height) > 1 || card.overflow)) throw new Error(JSON.stringify({ width, cards }));
          await stats.screenshot({ path: fileURLToPath(new URL(`supervisor-stats-${width}.png`, output)) });
          metrics.stats = cards;
          const quickActions = page.getByRole('region', { name: 'Supervisor Quick Actions' });
          const actionCards = await quickActions.locator('.grid > *').evaluateAll((elements) => elements.map((element) => {
            const box = element.getBoundingClientRect();
            return { top: box.top, width: box.width, height: box.height, overflow: element.scrollWidth > element.clientWidth + 1 };
          }));
          if (actionCards.length !== 3 || actionCards.some((card) => Math.abs(card.top - actionCards[0].top) > 1 || Math.abs(card.width - actionCards[0].width) > 1 || Math.abs(card.height - actionCards[0].height) > 1 || card.overflow)) throw new Error(JSON.stringify({ width, actionCards }));
          await quickActions.screenshot({ path: fileURLToPath(new URL(`supervisor-quick-actions-${width}.png`, output)) });
          metrics.quickActions = actionCards;
          const summaryAlignment = await page.locator('.supervisor-dashboard-summary').evaluate((element) => {
            const stats = element.querySelector('.supervisor-summary-cards').getBoundingClientRect();
            const actions = element.querySelector('[aria-label="Supervisor Quick Actions"]').getBoundingClientRect();
            return { statsBottom: stats.bottom, actionsBottom: actions.bottom, gap: actions.top - stats.bottom };
          });
          if (summaryAlignment.gap < 11 || summaryAlignment.gap > 17 || width >= 768 && cards.some((card) => card.height > 170)) throw new Error(JSON.stringify({ width, cards, summaryAlignment }));
          await page.locator('.supervisor-dashboard-summary').screenshot({ path: fileURLToPath(new URL(`supervisor-summary-layout-${width}.png`, output)) });
          metrics.summaryAlignment = summaryAlignment;
        }
        if (role === 'ADMIN' && state === 'populated') {
          const categories = page.locator('.rare-category-section');
          await categories.locator('.rare-category-card').first().waitFor();
          const categoryMetrics = await categories.evaluate((element) => ({
            top: element.getBoundingClientRect().top,
            approvalTop: document.querySelector('.admin-dashboard-approvals').getBoundingClientRect().top,
            cards: [...element.querySelectorAll('.rare-category-card')].map((card) => ({ width: card.clientWidth, height: card.clientHeight, href: card.getAttribute('href'), coverLeft: card.querySelector('.rare-category-cover').getBoundingClientRect().left, titleLeft: card.querySelector('h3').getBoundingClientRect().left })),
            overflow: [...element.querySelectorAll('*')].some((child) => { const b = child.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1); }),
          }));
          if (width >= 1024 && categoryMetrics.top >= categoryMetrics.approvalTop || categoryMetrics.overflow || categoryMetrics.cards.length !== 3 || categoryMetrics.cards.some((card) => card.coverLeft >= card.titleLeft || card.height < 44)) throw new Error(JSON.stringify({ categoryMetrics, width }));
          await categories.screenshot({ path: fileURLToPath(new URL(`admin-categories-${width}.png`, output)) });
          metrics.categories = categoryMetrics;
          const approvalsVisible = await page.locator('.admin-dashboard-approvals').isVisible();
          const activityRows = page.locator('.admin-dashboard-activity .divide-y > .group:visible');
          const visibleActivities = await activityRows.allTextContents();
          if (approvalsVisible !== (width >= 1024) || visibleActivities.length !== (width >= 1024 ? 4 : 5) || visibleActivities.some((text, i) => !text.includes(`QA activity ${i + 1}`))) throw new Error(JSON.stringify({ width, approvalsVisible, visibleActivities }));
          await page.locator('.admin-dashboard-activity').screenshot({ path: fileURLToPath(new URL(`admin-activity-${width}.png`, output)) });
          metrics.approvalsVisible = approvalsVisible;
          metrics.visibleActivities = visibleActivities.length;
        }
        results.push({ role, state, width, ...metrics });
      }
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (errors.length || mutations.length) throw new Error(JSON.stringify({ errors, mutations }));
  await writeFile(new URL('results.json', output), JSON.stringify({ results, errors, mutations }, null, 2));
  console.log(`${results.length} dashboard chart checks passed; no page errors or mutations.`);
} finally { await browser.close(); }
