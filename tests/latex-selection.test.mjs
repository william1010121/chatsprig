import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Gemini consumes and clears selection before opening the sidebar', () => {
  let capture;
  let click;
  let selected = true;
  const sent = [];
  const anchor = { closest: (selector) => selector === 'message-content, user-query' ? {} : null };
  const selection = {
    get isCollapsed() { return !selected; },
    anchorNode: { parentElement: anchor }, focusNode: { parentElement: anchor },
    toString: () => '選取內容',
    getRangeAt: () => ({ getBoundingClientRect: () => ({ right: 200, bottom: 100 }) }),
    removeAllRanges() { selected = false; capture(); }
  };
  const button = { addEventListener(type, fn) { if (type === 'click') click = fn; } };
  const host = {
    style: {}, attachShadow: () => ({ querySelector: () => button }),
    getBoundingClientRect: () => ({ width: 120 })
  };
  const window = { getSelection: () => selection, innerWidth: 800, innerHeight: 600, addEventListener() {} };
  window.top = window.self = window;
  const context = vm.createContext({
    window,
    document: {
      createElement: () => host, documentElement: { appendChild() {} },
      addEventListener(type, fn) { if (type === 'selectionchange') capture = fn; }
    },
    cgptAskInSidebar(text, provider) {
      assert.equal(selected, false);
      assert.equal(host.style.display, 'none');
      sent.push({ text, provider });
    }
  });
  vm.runInContext(read('content/gemini-ask-sidebar.js'), context);
  capture();
  assert.equal(host.style.display, 'block');
  click({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(sent, [{ text: '選取內容', provider: 'gemini' }]);
  click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(sent.length, 1);
});

function copyHarness({ source = 'x^2', display = false } = {}) {
  let changed;
  const listeners = {};
  const selection = {
    isCollapsed: false, rangeCount: 1, toString: () => '公式 x²',
    getRangeAt() { return {
      cloneRange() { return this; }, toString: selection.toString,
      cloneContents() {
        let text = '公式 x²';
        const math = {
          getAttribute: () => source, matches: () => display,
          querySelector() {}, closest() {}, replaceWith(node) { text = `公式 ${node.textContent}`; }
        };
        return { get textContent() { return text; }, querySelectorAll: (selector) => selector === '[data-math-source]' && source ? [math] : [] };
      }
    }; }
  };
  const context = vm.createContext({
    Node: { ELEMENT_NODE: 1 },
    window: { getSelection: () => selection, addEventListener(type, fn) { listeners[type] = fn; } },
    document: { createTextNode: (textContent) => ({ textContent }) },
    chrome: { storage: { onChanged: { addListener(fn) { changed = fn; } } } },
    cgptLoadSettings: async () => ({ enableLatexCopy: true })
  });
  vm.runInContext(read('content/copy-latex.js'), context);
  return { context, listeners, selection, toggle: (enabled) => changed({ enableLatexCopy: { newValue: enabled } }, 'sync') };
}

test('sidebar helper and clipboard use identical inline and display LaTeX', async () => {
  for (const display of [false, true]) {
    const h = copyHarness({ display });
    await Promise.resolve();
    let copied;
    h.listeners.copy({ preventDefault() {}, stopImmediatePropagation() {}, clipboardData: { setData(_type, text) { copied = text; } } });
    assert.equal(h.context.cgptGetSelectedLatex(), copied);
    assert.equal(copied, display ? '公式 \\[x^2\\]' : '公式 \\(x^2\\)');
    h.toggle(false);
    assert.equal(h.context.cgptGetSelectedLatex(), null);
    h.toggle(true);
    assert.equal(h.context.cgptGetSelectedLatex(), copied);
  }
});

test('plain text and collapsed selection fall back without LaTeX conversion', () => {
  assert.equal(copyHarness({ source: '' }).context.cgptGetSelectedLatex(), null);
  const h = copyHarness();
  h.selection.isCollapsed = true;
  assert.equal(h.context.cgptGetSelectedLatex(), null);
});

test('Ask in sidebar dismisses page-owned selection state before sending saved LaTeX', async () => {
  let capture;
  let click;
  let sent;
  let converted = '公式 \\(x^2\\)';
  let selected = true;
  let pageHighlight = true;
  let pageToolbar = true;
  const outsideEvents = [];
  const anchor = { closest: (selector) => selector === '[data-message-author-role]' ? {} : null };
  const selection = { get isCollapsed() { return !selected; }, anchorNode: { parentElement: anchor }, focusNode: { parentElement: anchor }, toString: () => '公式 x²', removeAllRanges() { selected = false; } };
  const toolbar = { querySelectorAll: () => [{ textContent: 'Share highlighted' }], appendChild() {} };
  const window = { getSelection: () => selection };
  window.top = window.self = window;
  const context = vm.createContext({
    queueMicrotask, Event, MouseEvent: Event, PointerEvent: Event,
    window, cgptGetSelectedLatex: () => converted, cgptAskInSidebar: (text) => {
      assert.equal(selected, false, 'clear the selection before opening the sidebar');
      assert.equal(pageHighlight, false, 'dismiss page-owned highlighting');
      assert.equal(pageToolbar, false, 'dismiss the native toolbar');
      sent = text;
    },
    MutationObserver: class { observe() {} },
    document: {
      body: { dispatchEvent(event) {
        outsideEvents.push(event.type);
        if (event.type === 'mousedown') {
          // Page-owned state does not disappear just because removeAllRanges ran.
          pageHighlight = false;
          pageToolbar = false;
        }
        if (event.type === 'mouseup') {
          selected = true;
          capture(); // A page handler restoring its range must not refill our cache.
        }
      } },
      dispatchEvent(event) { if (event.type === 'selectionchange') capture(); },
      getElementById() {}, querySelectorAll: () => [{ textContent: 'Ask ChatGPT', parentElement: toolbar }],
      addEventListener(type, fn) { if (type === 'selectionchange') capture = fn; },
      createElement: () => ({ style: {}, setAttribute() {}, addEventListener(type, fn) { if (type === 'click') click = fn; } })
    }
  });
  vm.runInContext(read('content/ask-sidebar.js'), context);
  capture();
  selected = false;
  capture();
  click({ preventDefault() {}, stopPropagation() {} });
  click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(sent, undefined, 'wait for the original toolbar event to finish');
  await Promise.resolve();
  assert.deepEqual(outsideEvents, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
  assert.equal(sent, '公式 \\(x^2\\)');
  selected = true;
  converted = null;
  capture();
  click({ preventDefault() {}, stopPropagation() {} });
  await Promise.resolve();
  assert.equal(sent, '公式 x²');
  sent = undefined;
  click({ preventDefault() {}, stopPropagation() {} });
  await Promise.resolve();
  assert.equal(sent, undefined, 'do not reuse a consumed selection');
});
