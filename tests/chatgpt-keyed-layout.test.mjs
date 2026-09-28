import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Mirrors the ChatGPT layout observed on 2026-09-28: keyed turns, search-unit
// message tags, a Composer mode button group, and no data-testid hooks.
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const el = (attrs = {}, extra = {}) => ({
  attrs, getAttribute(key) { return this.attrs[key] ?? null; }, hasAttribute(key) { return key in this.attrs; },
  closest() { return null; }, getClientRects() { return [{}]; }, ...extra
});

function contextHarness({ pathname = '/', chatComposer = true, pressed = null } = {}) {
  const composer = el({ 'data-thread-find-composer': 'true', ...(chatComposer ? { 'data-chatgpt-composer': '' } : {}) },
    { querySelectorAll: () => [] });
  const turns = [];
  const main = {
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === '[data-turn-key]') return turns;
      return [];
    }
  };
  const buttons = pressed ? [el({ 'aria-pressed': 'true' }, { textContent: pressed })] : [];
  const context = vm.createContext({ location: { hostname: 'chatgpt.com', pathname }, Event: class { constructor(type) { this.type = type; } },
    document: { documentElement: {},
      querySelector(selector) { return selector === 'main' ? main : selector.startsWith('form') ? composer : null; },
      querySelectorAll(selector) {
        if (selector.includes('Composer mode')) return buttons;
        if (selector.includes(':user"]')) return turns.flatMap(turn => turn.units.filter(unit => unit.role === 'user'));
        if (selector.includes(':assistant"]')) return turns.flatMap(turn => turn.units.filter(unit => unit.role === 'assistant'));
        return [];
      }, getElementById: () => null },
    sessionStorage: { setItem() {}, getItem() {}, removeItem() {} },
    window: { dispatchEvent() {} }, setTimeout() {}, MutationObserver: class { observe() {} }
  });
  vm.runInContext(read('content/chat-context.js'), context);
  function turn(index, { user = `u${index}`, assistant = `a${index}`, searchKey = `fallback-turn-${index}` } = {}) {
    const units = [];
    if (user) units.push(Object.assign(el({ 'data-chatgpt-search-unit-key': `${searchKey}:0:user`, 'data-chatgpt-search-message-ids': user }), { role: 'user' }));
    if (assistant) units.push(Object.assign(el({ 'data-chatgpt-search-unit-key': `${searchKey}:1:assistant`, 'data-chatgpt-search-message-ids': `${assistant} ${assistant}` }), { role: 'assistant' }));
    const result = el({ 'data-turn-key': user || `turn-${index}` }, {
      units,
      querySelector: selector => selector === '[data-content-search-turn-key]' ? el({ 'data-content-search-turn-key': searchKey }) : null,
      querySelectorAll: selector => selector === '[data-chatgpt-search-unit-key]' ? units : []
    });
    turns.push(result);
    return result;
  }
  return { api: context.cgptChatContext, turn, turns };
}

test('keyed layout: Composer mode buttons decide new chats; the Chat-only composer marker decides threads', () => {
  assert.equal(contextHarness({ pressed: 'Chat' }).api.getMode(), 'chat');
  assert.equal(contextHarness({ pressed: 'Work', chatComposer: true }).api.getMode(), 'work');
  assert.equal(contextHarness({ pathname: '/c/abc' }).api.getMode(), 'chat');
  assert.equal(contextHarness({ pathname: '/c/abc', chatComposer: false }).api.getMode(), 'work');
});

test('keyed layout: history counts user units per turn and rejects gaps or unmounted turns', () => {
  const h = contextHarness({ pathname: '/c/abc' });
  h.turn(0); h.turn(1);
  assert.deepEqual({ ...h.api.getHistory() }, { count: 2, key: JSON.stringify(['u0', 'u1']) });
  assert.deepEqual({ ...h.api.getCountState() }, { count: 2, cadence: 2, key: JSON.stringify(['u0', 'u1']), complete: true });

  const gap = contextHarness({ pathname: '/c/abc' });
  gap.turn(0); gap.turn(2, { searchKey: 'fallback-turn-2' });
  assert.equal(gap.api.getHistory(), null, 'a virtualized prefix must not shrink the count');

  const unmounted = contextHarness({ pathname: '/c/abc' });
  unmounted.turn(0); unmounted.turn(1, { user: null, assistant: null });
  assert.equal(unmounted.api.getHistory(), null);
});

function sidebarHarness({ fixed = true, inApp = false }) {
  let appended = null;
  const wrapper = {};
  const toolbar = {
    parentElement: wrapper,
    closest: selector => inApp && selector.includes('main') ? {} : null,
    querySelectorAll: () => [{ textContent: 'Ask ChatGPT' }],
    appendChild(child) { appended = child; }
  };
  const window = { getSelection: () => null };
  window.top = window.self = window;
  vm.runInNewContext(read('content/ask-sidebar.js'), {
    window, queueMicrotask, getComputedStyle: node => ({ position: node === wrapper && fixed ? 'fixed' : 'static' }),
    MutationObserver: class { observe() {} },
    document: {
      body: {}, getElementById: () => null, addEventListener() {},
      querySelectorAll: () => [{ textContent: 'Ask ChatGPT', className: 'native', parentElement: toolbar }],
      createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} })
    }
  });
  return appended;
}

test('keyed layout: Ask in sidebar joins the floating Ask-only toolbar, never an in-app button row', () => {
  const button = sidebarHarness({});
  assert.equal(button?.textContent, 'Ask in sidebar');
  assert.equal(button.className, 'native');
  assert.equal(sidebarHarness({ fixed: false }), null);
  assert.equal(sidebarHarness({ inApp: true }), null);
});

test('keyed layout: composer, send, stop, picker and markdown hooks are recognized', () => {
  for (const file of ['content/skill-completion.js', 'content/system-prompt.js', 'content/frame-helper.js']) {
    assert.match(read(file), /\[data-composer-markdown\]\[contenteditable="true"\]/, file);
  }
  for (const file of ['content/system-prompt.js', 'content/frame-helper.js']) {
    assert.match(read(file), /form\[data-thread-find-composer\] button\[type="submit"\]/, file);
  }
  assert.match(read('content/frame-helper.js'), /button:is\(\[aria-label="Stop"\]/);
  const compact = read('content/compact-view.js');
  assert.match(compact, /\[role="menu"\]:has\(> \[data-model-picker-view\]\)/);
  assert.match(compact, /\[data-markdown-text-style="assistant-message"\]/);
});
