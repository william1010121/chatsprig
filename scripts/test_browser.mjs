// Portable offline adapter for the original browser regression scenarios.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const suites = ['btw', 'btw-completion', 'btw-frame-limit', 'btw-invalidation', 'compact-margins', 'window-rail', 'branch-tree', 'provider-lifecycle', 'provider-helper-gate'];
const selected = process.argv.slice(2);
if (selected.some(name => !suites.includes(name))) throw new Error(`Choose: ${suites.join(', ')}`);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true });
let failed = false;
try {
  for (const suite of selected.length ? selected : suites) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const blocked = [];
    await context.route(/^https?:/, route => { blocked.push(route.request().url()); return route.abort(); });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let dialog, pendingClick;
    page.on('dialog', value => { dialog = value; });
    const locator = async selector => {
      selector = selector.replace(/^loc=css:/, '');
      for (const frame of page.frames()) {
        if (frame !== page.mainFrame() && !(await (await frame.frameElement()).isVisible())) continue;
        const found = frame.locator(selector).filter({ visible: true });
        if (await found.count() && await found.first().isVisible()) return found;
      }
      return page.locator(selector);
    };
    const adapter = {
      goto: (...args) => page.goto(...args), reload: () => page.reload(),
      evaluate: (...args) => page.evaluate(...args),
      waitForFunction: (...args) => page.waitForFunction(...args),
      waitForSelector: async selector => (await locator(selector)).waitFor(),
      waitForTimeout: ms => page.waitForTimeout(ms),
      fill: async (selector, text) => (await locator(selector)).fill(text),
      press: async (selector, key) => (await locator(selector)).press(key),
      focus: async selector => (await locator(selector)).focus(),
      hover: async selector => (await locator(selector)).hover(),
      click: async selector => {
        const target = await locator(selector);
        let onDialog;
        const dialogEvent = new Promise(resolve => { onDialog = resolve; page.once('dialog', onDialog); });
        pendingClick = target.click();
        try { await Promise.race([pendingClick, dialogEvent]); }
        finally { page.off('dialog', onDialog); }
        return { dialog: dialog ? { message: dialog.message() } : null };
      },
      info: async () => ({ dialog: dialog ? { message: dialog.message() } : null }),
      acceptDialog: async () => { await dialog.accept(); dialog = null; await pendingClick; },
      dismissDialog: async () => { await dialog.dismiss(); dialog = null; await pendingClick; },
      screenshot: options => page.screenshot(options),
      snapshot: () => page.locator('body').innerText(),
      cdp: async (method, params) => (await context.newCDPSession(page)).send(method, params)
    };
    globalThis.qaRoot = root;
    globalThis.taskSpace = async () => ({ spaceId: 'offline-chromium', page: () => adapter, finish: async () => {} });
    try {
      if (suite === 'provider-lifecycle' || suite === 'provider-helper-gate') {
        const { run } = await import(`../tests/browser/${suite}.mjs`);
        await run(page, root);
      } else await import(`../tests/browser/${suite}.mjs`);
      if (blocked.length) throw new Error(`Unexpected network requests: ${blocked.join(', ')}`);
      if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
      console.log(`PASS ${suite}`);
    } catch (error) {
      failed = true;
      console.error(`FAIL ${suite}:`, error);
      await page.screenshot({ path: path.join(root, 'draft', `failure-${suite}.png`) }).catch(() => {});
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
if (failed) process.exitCode = 1;
