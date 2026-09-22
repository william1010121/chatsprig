import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../content/compact-view.js', import.meta.url), 'utf8');
async function harness() {
  const elements = [], saved = [], events = {};
  let mode = 'chat', change;
  function element() {
    const el = { children: [], attrs: {}, listeners: {}, hidden: false,
      append(...children) { this.children.push(...children); }, appendChild(child) { this.append(child); },
      setAttribute(key, value) { this.attrs[key] = value; },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      querySelector(selector) { return this.children.flatMap(child => [child, ...child.children]).find(child => selector === `#${child.id}`) || null; }
    };
    elements.push(el); return el;
  }
  const picker = element();
  const documentElement = element(); documentElement.classList = { toggle() {} };
  vm.runInNewContext(source, {
    cgptChatContext: { getMode: () => mode },
    cgptLoadSettings: async () => ({ compactView: false, appendSystemPrompt: true, systemPromptInterval: 3 }),
    chrome: { storage: { sync: { set: async value => saved.push(value) }, onChanged: { addListener(callback) { change = callback; } } } },
    document: { documentElement, body: {}, createElement: element,
      getElementById: id => elements.find(el => el.id === id) || null, querySelector: () => picker },
    window: { addEventListener(type, callback) { events[type] = callback; } },
    MutationObserver: class { observe() {} }
  });
  await new Promise(setImmediate);
  return { picker, saved, prompt: elements.find(el => el.id === 'cgpt-helper-system-prompt-toggle'),
    compact: elements.find(el => el.id === 'cgpt-helper-compact-toggle'),
    mode(value) { mode = value; events['cgpt-helper-mode-change'](); },
    change(value) { change(value, 'sync'); } };
}
test('prompt icon hides in Work and unknown modes while Compact remains available', async () => {
  const h = await harness();
  assert.equal(h.prompt.hidden, false); assert.match(h.prompt.innerHTML, /<svg/);
  assert.match(h.prompt.title, /Every 3 messages/);
  assert.deepEqual(h.picker.children[0].children, [h.prompt, h.compact]);
  for (const mode of ['work', 'unknown']) {
    h.mode(mode); assert.equal(h.prompt.hidden, true); assert.equal(h.compact.hidden, false);
    await h.prompt.listeners.click({ stopPropagation() {} }); assert.equal(h.saved.length, 0);
  }
  h.mode('chat'); assert.equal(h.prompt.hidden, false);
  await h.prompt.listeners.click({ stopPropagation() {} }); assert.equal(h.saved[0].appendSystemPrompt, false);
  h.change({ systemPromptInterval: { newValue: 0 } }); assert.match(h.prompt.title, /First message only/);
});
