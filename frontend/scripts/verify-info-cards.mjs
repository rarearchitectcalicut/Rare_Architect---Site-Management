import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(root, ".dist/ui-qa/node_modules/playwright"))); }
const out = path.join(root, "docs/ui-info-cards-qa");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage();
const results = [];
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
    await page.goto(`${process.env.UI_QA_URL || "http://localhost:5174"}/tests/fixtures/info-cards.html`);
    await page.getByRole("heading", { name: "Information cards · visual QA" }).waitFor();
    for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(100);
        const audit = page.getByText("Approval & audit", { exact: true });
        await audit.click();
        if (!await page.getByText("Created by", { exact: true }).isVisible()) throw new Error("Audit disclosure did not open");
        await page.keyboard.press("Enter");
        const metrics = await page.evaluate(() => ({
            viewport: innerWidth, body: document.documentElement.scrollWidth,
            clippedTitles: [...document.querySelectorAll('.rare-project-card h3, .rare-task-card-heading h2, .rare-task-summary-title')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent),
            cardFieldsOutside: [...document.querySelectorAll('.rare-info-field')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).map((e) => e.textContent),
            projectLinks: [...document.querySelectorAll('.rare-project-card')].every((e) => e.tagName === 'A' && e.querySelectorAll('a,button').length === 0),
            imageFallback: document.querySelectorAll('.rare-project-card-cover img').length === 0,
            projectHeight: Math.round(document.querySelector('.rare-project-card').getBoundingClientRect().height),
            taskHeight: Math.round(document.querySelector('.rare-premium-task-card.task-panel').getBoundingClientRect().height),
        }));
        results.push({ width, ...metrics });
        await page.screenshot({ path: path.join(out, `cards-${width}.png`), fullPage: true });
        if (metrics.body > width + 1 || metrics.clippedTitles.length || metrics.cardFieldsOutside.length || !metrics.projectLinks || !metrics.imageFallback) throw new Error(JSON.stringify(metrics));
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const transition = await page.locator('.rare-project-card').first().evaluate((e) => getComputedStyle(e).transitionDuration);
    if (transition.split(',').some((v) => parseFloat(v) > .001)) throw new Error("Reduced motion not respected");
} finally {
    await writeFile(path.join(out, "results.json"), JSON.stringify({ fixtureOnly: true, results, errors }, null, 2));
    await browser.close();
}
if (errors.length) throw new Error(errors.join("; "));
console.log(`Passed ${results.length} viewport stress cases, audit keyboard interaction and reduced motion.`);
