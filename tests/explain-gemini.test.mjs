import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../content/explain-gemini.js', import.meta.url), 'utf8');
function harness({ embedded = false, prompt = 'explain this to me', copyError = false, settingsError = false, delayedSettings = false } = {}) {
  const sent = [], buttons = [], messages = [];
  let observe, change;
  let rejectSettings;
  const handlers = new Map();
  const window = {};
  window.top = embedded ? {} : window;
  window.self = window;
  function addMessage(text) {
    const toolbar = { querySelector: () => toolbar.button, appendChild(button) { toolbar.button = button; buttons.push(button); } };
    const copy = { dispatchEvent(event) { const { id } = JSON.parse(event.detail); handlers.get('chatsprig-copy-response-result')?.({ detail: JSON.stringify({ id, text, ...(copyError ? { error: 'Copy failed' } : {}) }) }); }, className: 'native', parentElement: { tagName: 'SPAN', parentElement: toolbar }, closest: () => null };
    const codeCopy = { closest: () => ({}) };
    const scope = { querySelectorAll: () => [codeCopy, copy] };
    const clone = { nodeName: 'DIV', childNodes: text.split('\n').map(line => ({ nodeName: 'P', childNodes: [{ nodeType: 3, nodeValue: line }] })), querySelectorAll: () => [] };
    const message = { isConnected: true, closest: () => scope, querySelector: () => ({ cloneNode: () => clone }) };
    messages.push(message);
    return toolbar;
  }
  addMessage('First paragraph\n\n| Table | Value |\n| --- | --- |\n| a | 1 |\n\n```js\ncode()\n```');
  const context = { window, queueMicrotask, setTimeout, clearTimeout,
    location: { pathname: '/c/example' }, crypto: { randomUUID: () => 'request-id' },
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    cgptLoadSettings: async () => {
      if (delayedSettings) return new Promise((resolve, reject) => { rejectSettings = reject; });
      if (settingsError) throw new Error('Sync unavailable');
      return { geminiExplainPrompt: prompt };
    },
    chrome: { storage: { onChanged: { addListener(fn) { change = fn; } } } },
    cgptAskInSidebar: (text, provider, explainResponse) => sent.push({ text, provider, explainResponse }),
    document: { body: {}, addEventListener: (type, fn) => handlers.set(type, fn), removeEventListener: type => handlers.delete(type), querySelectorAll: () => messages, createElement: () => ({ listeners: {}, attrs: {}, setAttribute(k,v) { this.attrs[k] = v; }, addEventListener(k,v) { this.listeners[k] = v; } }) },
    MutationObserver: class { constructor(fn) { observe = fn; } observe() {} }
  };
  vm.runInNewContext(source, context);
  return { sent, buttons, addMessage,
    async failSettings() { rejectSettings(new Error('Sync unavailable')); await new Promise(setImmediate); },
    change(value) { change({ geminiExplainPrompt: { newValue: value } }, 'sync'); }, async mutate() { observe(); await new Promise(setImmediate); } };
}
test('response action passes native copied tables/code verbatim to Gemini with the configured prefix', async () => {
  const h = harness();
  assert.equal(h.buttons[0].title, 'explain with gemini');
  assert.equal(h.buttons[0].attrs['aria-label'], 'explain with gemini');
  assert.deepEqual(h.sent, []);
  await h.buttons[0].listeners.click({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(h.sent, [{ provider: 'gemini', explainResponse: true, text: 'explain this to me\n\nFirst paragraph\n\n| Table | Value |\n| --- | --- |\n| a | 1 |\n\n```js\ncode()\n```' }]);
});
test('new responses mount once; embedded ChatGPT never creates explain controls', async () => {
  const h = harness();
  await h.mutate(); assert.equal(h.buttons.length, 1);
  h.addMessage('New reply'); await h.mutate(); assert.equal(h.buttons.length, 2);
  assert.equal(harness({ embedded: true }).buttons.length, 0);
});
test('failed explain settings use the default prompt and allow later synced preferences', async () => {
  const h = harness({ settingsError: true });
  await new Promise(setImmediate);
  const click = () => h.buttons[0].listeners.click({ preventDefault() {}, stopPropagation() {} });
  await click(); await click();
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[0].text, h.sent[1].text);
  assert.match(h.sent[0].text, /^explain this to me\n\nFirst paragraph/);
  assert.equal(h.buttons[0].disabled, false);
  h.change('Recovered instructions'); await click();
  assert.match(h.sent[2].text, /^Recovered instructions\n\nFirst paragraph/);
});
test('a pending explain resumes after a failed read without overwriting a newer synced prompt', async () => {
  for (const updatedPrompt of [null, 'Newer prompt']) {
    const h = harness({ delayedSettings: true });
    const pending = h.buttons[0].listeners.click({ preventDefault() {}, stopPropagation() {} });
    assert.equal(h.sent.length, 0);
    if (updatedPrompt !== null) h.change(updatedPrompt);
    await h.failSettings(); await pending;
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].text.startsWith(`${updatedPrompt ?? 'explain this to me'}\n\nFirst paragraph`), true);
    assert.equal(h.buttons[0].disabled, false);
  }
});

test('custom, blank and synced explain prompts apply to the next action; copy failures never send', async () => {
  for (const prompt of ['請用繁體中文解釋', '']) {
    const h = harness({ prompt });
    await h.buttons[0].listeners.click({ preventDefault() {}, stopPropagation() {} });
    assert.equal(h.sent[0].text.startsWith(prompt ? prompt + '\n\n' : 'First paragraph'), true);
    h.change('Updated instructions');
    await h.buttons[0].listeners.click({ preventDefault() {}, stopPropagation() {} });
    assert.match(h.sent[1].text, /^Updated instructions\n\n/);
  }
  const h = harness({ copyError: true });
  await h.buttons[0].listeners.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(h.sent.length, 0);
  assert.equal(h.buttons[0].disabled, false);
  assert.equal(h.buttons[0].title, 'Copy failed');
});
