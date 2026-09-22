import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_SETTINGS } from '../shared/defaults.mjs';
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
async function harness() {
  const saved = [], handlers = {};
  const field = { type: 'number', dataset: { key: 'systemPromptInterval' }, value: '',
    addEventListener(type, fn) { handlers[type] = fn; }, setAttribute() {}, removeAttribute() {} };
  const status = { textContent: '' };
  vm.runInNewContext(read('options/options.js'), {
    CGPT_HELPER_DEFAULTS: DEFAULT_SETTINGS, cgptLoadSettings: async () => DEFAULT_SETTINGS,
    document: { querySelectorAll: () => [field], getElementById: id => id === 'status' ? status : { addEventListener() {} } },
    chrome: { storage: { sync: { set: async value => saved.push(value) } } },
    setTimeout() {}, clearTimeout() {}
  });
  await new Promise(setImmediate);
  return { field, saved, status, async change(value) { field.value = value; await handlers.change(); } };
}
test('repeat interval defaults to zero and accepts only non-negative safe integers', async () => {
  const h = await harness(); assert.equal(h.field.value, 0);
  for (const value of ['', ' ', '-1', '1.5', 'Infinity', 'abc', '9007199254740992']) {
    await h.change(value); assert.equal(h.saved.length, 0); assert.match(h.status.textContent, /non-negative/);
  }
  for (const value of ['0', '1', '3', '9007199254740991']) await h.change(value);
  assert.deepEqual(h.saved.map(value => value.systemPromptInterval), [0, 1, 3, Number.MAX_SAFE_INTEGER]);
});
test('manifest installs shared context before prompt interception, and excludes Gemini', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const chat = manifest.content_scripts.find(entry => entry.js.includes('content/system-prompt.js'));
  assert.ok(chat.js.indexOf('content/chat-context.js') < chat.js.indexOf('content/system-prompt.js'));
  const gemini = manifest.content_scripts.find(entry => entry.js.includes('content/gemini-frame-helper.js'));
  assert.ok(!gemini.js.includes('content/system-prompt.js'));
});
