import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../content/compact-view.js', import.meta.url), 'utf8');
async function harness() {
  const elements = [], saved = [], events = {};
  const classes = new Set();
  const variables = {};
  let mode = 'chat', count = 0, change;
  function element() {
    const el = { children: [], attrs: {}, listeners: {}, hidden: false,
      append(...children) { this.children.push(...children); }, appendChild(child) { this.append(child); },
      setAttribute(key, value) { this.attrs[key] = value; },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      querySelector(selector) { return this.children.flatMap(child => [child, ...child.children]).find(child => selector === `#${child.id}` || selector === `.${child.className}`) || null; }
    };
    elements.push(el); return el;
  }
  const picker = element();
  const documentElement = element(); documentElement.style = { setProperty(name, value) { variables[name] = value; } }; documentElement.classList = { toggle(name, enabled) {
    if (enabled) classes.add(name); else classes.delete(name);
  } };
  vm.runInNewContext(source, {
    location: { pathname: '/' },
    cgptChatContext: { getMode: () => mode, getCountState: () => ({ count }) },
    cgptLoadSettings: async () => ({ compactView: false, compactJoinParagraphs: true, appendSystemPrompt: true, systemPromptInterval: 3 }),
    chrome: { storage: { sync: { set: async value => saved.push(value) }, onChanged: { addListener(callback) { change = callback; } } } },
    document: { documentElement, body: {}, createElement: element,
      getElementById: id => elements.find(el => el.id === id) || null, querySelector: selector => selector.startsWith('form') ? null : picker },
    window: { addEventListener(type, callback) { events[type] = callback; } },
    MutationObserver: class { observe() {} }
  });
  await new Promise(setImmediate);
  return { picker, saved, classes, variables, settings: elements.find(el => el.id === 'cgpt-helper-compact-settings'), style: elements.find(el => el.id === 'cgpt-helper-compact-style').textContent,
    prompt: elements.find(el => el.id === 'cgpt-helper-system-prompt-toggle'),
    compact: elements.find(el => el.id === 'cgpt-helper-compact-toggle'),
    mode(value) { mode = value; events['cgpt-helper-mode-change'](); },
    count(value) { count = value; events['cgpt-helper-count-change'](); },
    change(value) { change(value, 'sync'); } };
}
test('prompt icon hides in Work and unknown modes while Compact remains available', async () => {
  const h = await harness();
  assert.equal(h.prompt.hidden, false); assert.match(h.prompt.innerHTML, /<svg/);
  assert.match(h.prompt.title, /Every 3 messages/);
  assert.deepEqual(h.picker.children[0].children, [h.prompt, h.compact, h.settings]);
  for (const mode of ['work', 'unknown']) {
    h.mode(mode); assert.equal(h.prompt.hidden, true); assert.equal(h.compact.hidden, false);
    await h.prompt.listeners.click({ stopPropagation() {} }); assert.equal(h.saved.length, 0);
  }
  h.mode('chat'); assert.equal(h.prompt.hidden, false);
  await h.prompt.listeners.click({ stopPropagation() {} }); assert.equal(h.saved[0].appendSystemPrompt, false);
  h.change({ systemPromptInterval: { newValue: 0 } }); assert.match(h.prompt.title, /First message only/);
});
test('joining paragraphs can be changed without disabling other compact spacing', async () => {
  const h = await harness();
  await h.compact.listeners.click({ stopPropagation() {} });
  assert.ok(h.classes.has('cgpt-helper-compact'));
  assert.ok(h.classes.has('cgpt-helper-compact-join-paragraphs'));
  h.change({ compactJoinParagraphs: { newValue: false } });
  assert.ok(h.classes.has('cgpt-helper-compact'));
  assert.ok(!h.classes.has('cgpt-helper-compact-join-paragraphs'));
  assert.match(h.style, /html\.cgpt-helper-compact\.cgpt-helper-compact-join-paragraphs/);
  assert.match(h.style, /html\.cgpt-helper-compact :is\(\[data-message-author-role="assistant"\] \.markdown, \[data-markdown-text-style="assistant-message"\]\) :is\(li, li > :is\(ul, ol\)\)/);
});

test('compact layout validates synced slider values and retains defaults for invalid settings', async () => {
  const h = await harness();
  assert.equal(h.variables['--cgpt-helper-compact-line-height'], '1.65');
  assert.equal(h.variables['--cgpt-helper-compact-side-margin'], '12%');
  assert.equal(h.variables['--cgpt-helper-compact-paragraph-spacing'], '8px');
  assert.equal(h.variables['--cgpt-helper-compact-list-spacing'], '3px');
  h.change({ compactLineHeight: { newValue: 2.1 }, compactSideMargin: { newValue: 20 }, compactParagraphSpacing: { newValue: 2 }, compactListSpacing: { newValue: 0 } });
  assert.equal(h.variables['--cgpt-helper-compact-line-height'], '2.1');
  assert.equal(h.variables['--cgpt-helper-compact-side-margin'], '20%');
  assert.equal(h.variables['--cgpt-helper-compact-paragraph-spacing'], '2px');
  assert.equal(h.variables['--cgpt-helper-compact-list-spacing'], '0px');
  for (const value of [null, '2', NaN, Infinity, -1, 30]) {
    h.change({ compactLineHeight: { newValue: value }, compactSideMargin: { newValue: value }, compactParagraphSpacing: { newValue: value }, compactListSpacing: { newValue: value } });
    assert.equal(h.variables['--cgpt-helper-compact-line-height'], '1.65');
    assert.equal(h.variables['--cgpt-helper-compact-side-margin'], '12%');
    assert.equal(h.variables['--cgpt-helper-compact-paragraph-spacing'], '8px');
    assert.equal(h.variables['--cgpt-helper-compact-list-spacing'], '3px');
  }
});
