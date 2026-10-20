// Real production helpers and gate in a Chromium isolated world; provider DOMs
// and chrome.storage remain synthetic. This does not test a live AI service.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function run(page, root) {
  const gate = await fs.readFile(`${root}/content/frame-privacy-gate.js`, 'utf8');
  const assistant = await fs.readFile(`${root}/content/assistant-frame-helper.js`, 'utf8');
  const gemini = await fs.readFile(`${root}/content/gemini-frame-helper.js`, 'utf8');
  const cdp = await page.context().newCDPSession(page);
  for (const [provider, privateAssistantChats] of [['gemini', true], ['claude', true], ['grok', true], ['claude', false], ['grok', false]]) {
    await page.goto('about:blank');
    await page.evaluate(provider => {
      window.sends = 0;
      const frame = document.createElement('iframe');
      frame.name = { gemini: 'gemini_helper_overlay_frame', claude: 'chatsprig_claude_frame', grok: 'chatsprig_grok_frame' }[provider];
      frame.srcdoc = `<html><body><chat-window><form><textarea aria-label="Draft"></textarea><div class="ql-editor" contenteditable="true" role="textbox"></div><button>Send</button></form></chat-window><button aria-label="Temporary chat" type="button">Temporary</button><script>
        document.querySelector('textarea').addEventListener('keyup', e => { if (e.key === 'Enter' && e.target.value) parent.sends++; });
        document.querySelector('form').onsubmit = e => { e.preventDefault(); parent.sends++; };
        document.querySelector('[aria-label="Temporary chat"]').onclick = () => document.querySelector('chat-window').classList.add('is-temporary-chat');
        document.body.addEventListener('keydown', e => { if (!e.isTrusted && e.code === 'KeyJ') document.body.classList.add('bg-surface-incognito'); });
      <\/script></body></html>`;
      document.body.appendChild(frame);
    }, provider);
    const input = page.frameLocator('iframe').locator('textarea');
    await input.waitFor();
    const tree = await cdp.send('Page.getFrameTree');
    const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: tree.frameTree.childFrames[0].frame.id, worldName: 'chatsprig-test-extension' });
    const evaluate = async expression => {
      const result = await cdp.send('Runtime.evaluate', { expression, contextId: executionContextId, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    await evaluate(gate);
    assert.equal(await page.frameLocator('iframe').locator('body').evaluate(() => typeof window.cgptSetFramePrivacyReady), 'undefined', 'Page world can access extension gate');
    await evaluate(`window.chrome={runtime:{id:'fixture',sendMessage:async()=>{},onMessage:{addListener(){}}},storage:{onChanged:{addListener(){}}}};
      window.cgptLoadSettings=()=>new Promise(resolve=>window.qaRelease=()=>resolve({privateAssistantChats:${privateAssistantChats},geminiModel:'current'}));
      window.qaLocation={search:${JSON.stringify(provider === 'claude' && privateAssistantChats ? '?incognito' : '')}};
      { const original=window.cgptSetFramePrivacyReady; window.cgptSetFramePrivacyReady=(value,check)=>{window.qaReadyObserved=value;original(value,check);}; }
      new Function('location', ${JSON.stringify(provider === 'gemini' ? gemini : assistant)})(window.qaLocation);`);
    // A page cannot release the isolated-world gate with a property or message.
    await input.evaluate(el => { window.cgptSetFramePrivacyReady = () => {}; window.postMessage({ source: 'cgpt-helper', action: 'assistantState', private: true }, '*'); el.focus(); });
    await input.evaluate(el => { el.value = 'preloaded draft'; });
    await page.keyboard.type('blocked'); await page.keyboard.press('Enter');
    assert.equal(await input.inputValue(), 'preloaded draft', `${provider}: accepted input before helper settings/readiness`);
    assert.equal(await page.evaluate(() => sends), 0);
    await input.evaluate(el => { el.value = ''; });
    await evaluate('window.qaRelease()');
    const deadline = Date.now() + 5000;
    while (!await evaluate('window.qaReadyObserved === true')) {
      if (Date.now() > deadline) throw new Error(`${provider}: actual helper did not release gate`);
      await page.waitForTimeout(25);
    }
    await input.pressSequentially('confirmed');
    assert.equal(await input.inputValue(), 'confirmed', `${provider}: helper confirmation/optout did not enable typing`);
    await page.frameLocator('iframe').locator('form button').click();
    assert.equal(await page.evaluate(() => sends), 1);
    if (privateAssistantChats) {
      // Validate on the next trusted event, not only after a polling timer.
      await evaluate("window.qaLocation.search=''; document.body.classList.remove('bg-surface-incognito'); document.querySelector('chat-window').classList.remove('is-temporary-chat');");
      await input.evaluate(el => el.focus());
      await page.keyboard.type('rejected'); await page.keyboard.press('Enter');
      assert.equal(await input.inputValue(), 'confirmed', `${provider}: mode exit did not relock`);
      assert.equal(await page.evaluate(() => sends), 1);
    }
  }
  await cdp.detach();
}
