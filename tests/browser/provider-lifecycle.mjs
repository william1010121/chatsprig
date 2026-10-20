// Synthetic documents only: no accounts, credentials, or remote AI requests.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../../shared/defaults.mjs';
export async function run(page, root) {
  const overlay = await fs.readFile(`${root}/content/overlay.js`, 'utf8');
  const privacyGate = await fs.readFile(`${root}/content/frame-privacy-gate.js`, 'utf8');
  await page.goto('about:blank');
  await page.evaluate(({ overlay, defaults, privacyGate }) => {
    window.CGPT_HELPER_DEFAULTS = defaults;
    window.cgptLoadSettings = async () => defaults;
    window.qa = { listeners: [], sends: [], loads: 0 };
    window.chrome = { runtime: { onMessage: { addListener: fn => qa.listeners.push(fn) } }, storage: { onChanged: { addListener() {} } } };
    const src = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', { get: src.get, set(url) {
      this.dataset.requestedUrl = url;
      this.srcdoc = `<html><body><form><textarea aria-label="Draft"></textarea><button>Send</button></form><script>
        ${privacyGate}
        parent.qa.loads++;
        document.querySelector('form').onsubmit = e => { e.preventDefault(); parent.qa.sends.push(document.querySelector('textarea').value); };
      <\/script></body></html>`;
    } });
    new Function(overlay)();
    window.qaOpen = provider => qa.listeners.forEach(fn => fn({ type: 'toggleOverlay', provider }, {}, () => {}));
    window.qaReport = (provider, ready, sourceOverride, originOverride) => {
      const names = { gemini: 'gemini_helper_overlay_frame', claude: 'chatsprig_claude_frame', grok: 'chatsprig_grok_frame' };
      const frame = document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelector(`iframe[name="${names[provider]}"]`);
      const origin = { gemini: 'https://gemini.google.com', claude: 'https://claude.ai', grok: 'https://grok.com' }[provider];
      if (!sourceOverride && !originOverride) frame.contentWindow.cgptSetFramePrivacyReady(ready);
      dispatchEvent(new MessageEvent('message', { source: sourceOverride === 'wrong' ? window : frame.contentWindow,
        origin: originOverride || origin, data: { source: 'cgpt-helper', provider,
          action: provider === 'gemini' ? 'geminiState' : 'assistantState', ready, private: ready } }));
    };
  }, { overlay, defaults: DEFAULT_SETTINGS, privacyGate });
  const active = () => page.locator('#cgpt-helper-overlay iframe:not([hidden])');
  const composer = () => active().contentFrame().locator('textarea');
  const blocked = async label => {
    assert.equal(await active().evaluate(frame => frame.inert), true, `${label}: frame must be inert`);
    // Real keyboard input cannot enter the frame even if its document attempts to focus.
    await active().evaluate(frame => frame.contentDocument.querySelector('textarea').focus());
    await page.keyboard.type('must not enter');
    await page.keyboard.press('Enter');
    assert.equal(await composer().inputValue(), '', `${label}: private gate accepted keyboard input`);
    await assert.rejects(active().contentFrame().getByRole('button', { name: 'Send' }).click({ timeout: 250 }), `${label}: private gate permitted send`);
    assert.equal(await page.evaluate(() => qa.sends.length), 0, `${label}: private gate submitted`);
  };
  for (const provider of ['gemini', 'claude', 'grok']) {
    await page.evaluate(provider => qaOpen(provider), provider);
    await composer().waitFor({ state: 'attached' });
    await blocked(provider);
    await page.evaluate(provider => qaReport(provider, true, 'wrong'), provider);
    await blocked(`${provider} wrong source`);
    await page.evaluate(provider => qaReport(provider, true, undefined, 'https://wrong.invalid'), provider);
    await blocked(`${provider} wrong origin`);
    await page.evaluate(provider => qaReport(provider, true), provider);
    await composer().fill(`${provider} unsent draft`);
  }
  // Switching reuses the exact live documents, preserving every provider's draft.
  const loads = await page.evaluate(() => qa.loads);
  for (const provider of ['gemini', 'claude', 'grok']) {
    await page.evaluate(provider => qaOpen(provider), provider);
    assert.equal(await composer().inputValue(), `${provider} unsent draft`, `${provider}: switching lost draft`);
  }
  assert.equal(await page.evaluate(() => qa.loads), loads, 'Switching reloaded an iframe');
  // Explicit new-chat refresh replaces the document and requires confirmation again.
  for (const provider of ['gemini', 'claude', 'grok']) {
    await page.evaluate(provider => qaOpen(provider), provider);
    // Toggling the already-active provider may close it; reopen if necessary.
    if (await page.locator('#cgpt-helper-overlay').getAttribute('data-open') !== 'true') await page.evaluate(provider => qaOpen(provider), provider);
    await page.locator('button[data-action="refresh"]').first().click();
    await composer().waitFor({ state: 'attached' });
    await blocked(`${provider} refresh`);
    await page.evaluate(provider => qaReport(provider, true), provider);
    await composer().fill(`${provider} confirmed`);
    // Draft state is test-owned, and submitted only to the fixture.
    await active().contentFrame().getByRole('button', { name: 'Send' }).click();
    assert.equal(await page.evaluate(() => qa.sends.at(-1)), `${provider} confirmed`);
    await page.evaluate(() => { qa.sends.length = 0; });
  }
}
