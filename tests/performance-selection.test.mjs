import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = file => fs.readFileSync(new URL(`../content/${file}`, import.meta.url), 'utf8');
class Element {
  constructor(kind = 'div', props = {}) {
    Object.assign(this, { kind, nodeType: 1, children: [], style: {}, listeners: {}, className: '',
      textContent: '', isConnected: true, queries: [], tagName: kind.toUpperCase() }, props);
  }
  matches(selector) {
    return selector.split(',').some(part => {
      const s = part.trim();
      if (s.startsWith('.')) return this.className.split(' ').includes(s.slice(1));
      if (s === 'button') return this.kind === 'button';
      if (s === '[data-math-source]') return !!this.mathSource;
      if (s.includes('conversation-turn-') || s.includes('data-talvt-turn-state')) return !!this.turn;
      if (s.includes('data-message-author-role') || s.includes('data-chatgpt-search-unit-key')) return !!this.message;
      if (s.startsWith('button[')) return this.kind === 'button' && this.copy;
      return false;
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  contains(node) { return node === this || this.children.some(child => child === node || child.contains?.(node)); }
  querySelectorAll(selector) {
    this.queries.push(selector);
    return this.children.flatMap(child => [
      ...(child.matches?.(selector) ? [child] : []), ...(child.querySelectorAll?.(selector) || [])
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  remove(child) { this.children = this.children.filter(node => node !== child); child.isConnected = false; }
  setAttribute() {}
  addEventListener(type, listener) { this.listeners[type] = listener; }
}
function harness(file, children = [], extra = {}) {
  const body = new Element('body');
  children.forEach(child => body.appendChild(child));
  const listeners = {}, frames = [], pendingRecords = [];
  let observe;
  const window = { getSelection: () => null };
  window.top = window.self = window;
  const document = new Element('document');
  document.appendChild(body);
  Object.assign(document, { body, addEventListener(type, callback) { listeners[type] = callback; },
    createElement: kind => new Element(kind) });
  // getElementById is indexed in real DOM and must not inflate the scan counter.
  document.getElementById = id => {
    const walk = node => node.id === id ? node : node.children?.map(walk).find(Boolean);
    return walk(document);
  };
  const context = {
    window, document, queueMicrotask,
    requestAnimationFrame: callback => { frames.push(callback); },
    cgptLoadSettings: async () => ({}),
    chrome: { storage: { onChanged: { addListener() {} } } },
    MutationObserver: class { constructor(callback) { observe = callback; } observe() {}
      takeRecords() { return pendingRecords.splice(0); } },
    ...extra
  };
  vm.runInNewContext(source(file), context);
  return { document, body, listeners, context, window, frames,
    mutate(records) { observe(records); },
    queueMutations(records) { pendingRecords.push(...records); },
    flush() { while (frames.length) frames.shift()(); } };
}
function turn() {
  const root = new Element('article', { turn: true });
  const message = root.appendChild(new Element('div', { message: true }));
  const toolbar = root.appendChild(new Element('div'));
  const copy = toolbar.appendChild(new Element('button', { copy: true }));
  return { root, message, toolbar, copy };
}

test('Explain stream mutations inspect only the changed turn and coalesce into a frame', () => {
  const turns = Array.from({ length: 100 }, turn);
  const h = harness('explain-gemini.js', turns.map(item => item.root));
  const fullScans = h.document.queries.length;
  const untouchedQueries = turns[0].root.queries.length;
  const affected = turns.at(-1);
  const queries = affected.root.queries.length;
  for (let i = 0; i < 100; i++) h.mutate([{ target: affected.message, addedNodes: [{ nodeType: 3 }] }]);
  assert.equal(h.frames.length, 1);
  h.flush();
  assert.equal(h.document.queries.length, fullScans, 'no historical message rescan');
  assert.equal(turns[0].root.queries.length, untouchedQueries, 'untouched turn is skipped');
  assert.equal(affected.root.queries.length - queries, 2, 'one message lookup and one existing-control lookup without querying copy buttons');
});

test('Explain remounts controls after React removes or replaces its toolbar and handles historical hydration', () => {
  const item = turn();
  const h = harness('explain-gemini.js', [item.root]);
  const control = item.toolbar.children.at(-1);
  assert.match(control.className, /cgpt-helper-explain-gemini/);
  item.toolbar.remove(control);
  h.mutate([{ target: item.toolbar, addedNodes: [], removedNodes: [control] }]);
  h.flush();
  assert.equal(item.toolbar.children.length, 2);
  item.root.remove(item.toolbar);
  const replacement = item.root.appendChild(new Element('div'));
  replacement.appendChild(new Element('button', { copy: true }));
  h.mutate([{ target: item.root, addedNodes: [replacement] }]);
  h.flush();
  assert.equal(replacement.children.length, 2);
  const historical = turn();
  h.body.appendChild(historical.root);
  h.mutate([{ target: h.body, addedNodes: [historical.root] }]);
  h.flush();
  assert.equal(historical.toolbar.children.length, 2);
});

function selectionToolbar() {
  const toolbar = new Element();
  const ask = toolbar.appendChild(new Element('button', { textContent: 'Ask ChatGPT' }));
  toolbar.appendChild(new Element('button', { textContent: 'Share highlighted' }));
  return { toolbar, ask };
}
test('Ask ignores streamed text and mounts only added/changed toolbars, including control removal', () => {
  const message = new Element('div', { message: true });
  const h = harness('ask-sidebar.js', [message]);
  const scans = h.document.queries.length;
  for (let i = 0; i < 100; i++) h.mutate([{ target: message, addedNodes: [{ nodeType: 3 }] }]);
  assert.equal(h.frames.length, 0);
  assert.equal(h.document.queries.length, scans);
  const { toolbar } = selectionToolbar();
  h.body.appendChild(toolbar);
  h.mutate([{ target: h.body, addedNodes: [toolbar] }]);
  h.flush();
  const control = toolbar.children.at(-1);
  assert.equal(control.id, 'cgpt-helper-ask-sidebar');
  toolbar.remove(control);
  h.mutate([{ target: toolbar, addedNodes: [], removedNodes: [control] }]);
  h.flush();
  assert.equal(toolbar.children.at(-1).id, 'cgpt-helper-ask-sidebar');
  assert.equal(h.document.queries.length, scans);
});

test('Ask snapshots cross-message selection without conversion and converts after keyboard focus clears it', async () => {
  const first = new Element('div', { message: true }), last = new Element('div', { message: true });
  const start = first.appendChild(new Element('span')), end = last.appendChild(new Element('span'));
  const range = { startContainer: start, endContainer: end, startOffset: 1, endOffset: 3,
    toString: () => 'two messages x²', cloneRange() { return { ...this }; } };
  const selection = { isCollapsed: false, rangeCount: 1, anchorNode: { parentElement: start },
    focusNode: { parentElement: end }, toString: () => 'two messages x²', getRangeAt: () => range,
    removeAllRanges() { this.isCollapsed = true; this.rangeCount = 0; } };
  const { toolbar } = selectionToolbar();
  let conversions = 0, sent;
  const h = harness('ask-sidebar.js', [first, last, toolbar], {
    cgptGetSelectedLatex(ranges) {
      conversions++;
      assert.equal(ranges.length, 1);
      assert.equal(ranges[0].startContainer, start);
      assert.equal(ranges[0].endContainer, end);
      return 'two messages \\(x^2\\)';
    },
    cgptAskInSidebar(text) { sent = text; }, Event, MouseEvent: Event, PointerEvent: Event
  });
  h.body.dispatchEvent = () => {};
  h.document.dispatchEvent = () => {};
  h.window.getSelection = () => selection;
  for (let i = 0; i < 100; i++) h.listeners.selectionchange();
  assert.equal(conversions, 0, 'dragging does not clone/convert message contents');
  selection.removeAllRanges();
  h.listeners.selectionchange();
  toolbar.children.at(-1).listeners.click({ preventDefault() {}, stopPropagation() {} });
  await Promise.resolve();
  assert.equal(conversions, 1);
  assert.equal(sent, 'two messages \\(x^2\\)');
  toolbar.children.at(-1).listeners.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(conversions, 1, 'consumed selection never reads another live selection');
});

test('snapshot conversion rejects detached ranges instead of using an unrelated current selection', async () => {
  const context = { Node: { ELEMENT_NODE: 1 }, cgptLoadSettings: async () => ({ enableLatexCopy: true }),
    window: { addEventListener() {}, getSelection: () => ({ isCollapsed: false, rangeCount: 1,
      getRangeAt() { throw new Error('must not inspect a different selection'); } }) },
    chrome: { storage: { onChanged: { addListener() {} } } } };
  vm.runInNewContext(source('copy-latex.js'), context);
  await Promise.resolve();
  assert.equal(context.cgptGetSelectedLatex([{ startContainer: { isConnected: false } }]), null);
  assert.equal(context.cgptGetSelectedLatex([]), null);
});

test('Ask falls back to saved text when a live range was retargeted by message removal', async () => {
  const message = new Element('div', { message: true });
  const boundary = message.appendChild(new Element('span'));
  const saved = { startContainer: boundary, endContainer: boundary, startOffset: 0, endOffset: 2,
    toString: () => 'original text' };
  const selection = { isCollapsed: false, rangeCount: 1, anchorNode: { parentElement: boundary },
    focusNode: { parentElement: boundary }, toString: () => 'original text',
    getRangeAt: () => ({ cloneRange: () => saved }), removeAllRanges() {} };
  const { toolbar } = selectionToolbar();
  let sent;
  const h = harness('ask-sidebar.js', [message, toolbar], {
    cgptGetSelectedLatex(ranges) { assert.equal(ranges.length, 0); return null; },
    cgptAskInSidebar(text) { sent = text; }, Event, MouseEvent: Event, PointerEvent: Event
  });
  h.body.dispatchEvent = () => {};
  h.document.dispatchEvent = () => {};
  h.window.getSelection = () => selection;
  h.listeners.selectionchange();
  saved.startContainer = h.body;
  toolbar.children.at(-1).listeners.click({ preventDefault() {}, stopPropagation() {} });
  await Promise.resolve();
  assert.equal(sent, 'original text');
});

test('Ask rejects same-node text rewrites and source-only math mutations before deferred conversion', async () => {
  for (const mutation of ['text', 'math-source']) {
    const message = new Element('div', { message: true });
    const boundary = message.appendChild(new Element('span'));
    let currentText = 'original x²';
    const saved = { startContainer: boundary, endContainer: boundary, startOffset: 0, endOffset: 11,
      toString: () => currentText, intersectsNode: node => node === boundary };
    const selection = { isCollapsed: false, rangeCount: 1, anchorNode: { parentElement: boundary },
      focusNode: { parentElement: boundary }, toString: () => currentText,
      getRangeAt: () => ({ cloneRange: () => saved }), removeAllRanges() {} };
    const { toolbar } = selectionToolbar();
    let sent;
    const h = harness('ask-sidebar.js', [message, toolbar], {
      cgptGetSelectedLatex(ranges) { assert.equal(ranges.length, 0, mutation); return null; },
      cgptAskInSidebar(text) { sent = text; }, Event, MouseEvent: Event, PointerEvent: Event
    });
    h.body.dispatchEvent = () => {};
    h.document.dispatchEvent = () => {};
    h.window.getSelection = () => selection;
    h.listeners.selectionchange();
    if (mutation === 'text') currentText = 'modified y²';
    else h.mutate([{ type: 'attributes', attributeName: 'data-math-source', target: boundary }]);
    toolbar.children.at(-1).listeners.click({ preventDefault() {}, stopPropagation() {} });
    await Promise.resolve();
    assert.equal(sent, 'original x²', mutation);
  }
});

test('Ask preserves conversion for KaTeX and multiple paragraphs with different rendered/raw selection text', async () => {
  for (const [raw, rendered, latex] of [
    ['x^2x²', 'x²', '\\(x^2\\)'],
    ['First paragraphx^2x²Second paragraph', 'First paragraph\nx²\nSecond paragraph', 'First paragraph\n\\(x^2\\)\nSecond paragraph']
  ]) {
    const message = new Element('div', { message: true });
    const boundary = message.appendChild(new Element('span'));
    const range = { startContainer: boundary, endContainer: boundary, startOffset: 0, endOffset: 2,
      toString: () => raw, cloneRange() { return { ...this }; } };
    const selection = { isCollapsed: false, rangeCount: 1, anchorNode: { parentElement: boundary },
      focusNode: { parentElement: boundary }, toString: () => rendered, getRangeAt: () => range,
      removeAllRanges() {} };
    const { toolbar } = selectionToolbar();
    let sent;
    const h = harness('ask-sidebar.js', [message, toolbar], {
      cgptGetSelectedLatex(ranges) { assert.equal(ranges.length, 1); return latex; },
      cgptAskInSidebar(text) { sent = text; }, Event, MouseEvent: Event, PointerEvent: Event
    });
    h.body.dispatchEvent = () => {};
    h.document.dispatchEvent = () => {};
    h.window.getSelection = () => selection;
    h.listeners.selectionchange();
    toolbar.children.at(-1).listeners.click({ preventDefault() {}, stopPropagation() {} });
    await Promise.resolve();
    assert.equal(sent, latex);
  }
});

test('partial formula selection protects hidden sibling sources until deferred conversion', async () => {
  for (const mathType of ['katex', 'data-math-source']) {
    for (const mutation of ['unchanged', 'characterData', 'childList', 'same-task', 'unrelated']) {
      const message = new Element('div', { message: true });
      const math = message.appendChild(new Element('span', mathType === 'katex'
        ? { className: 'katex' } : { mathSource: true }));
      const mathml = math.appendChild(new Element('span', { className: 'katex-mathml' }));
      const annotation = mathml.appendChild(new Element('annotation'));
      let annotationText = annotation.appendChild({ nodeType: 3, data: 'x^2', isConnected: true });
      const html = math.appendChild(new Element('span', { className: 'katex-html' }));
      const selectedNode = html.appendChild({ nodeType: 3, data: 'x', isConnected: true });
      const range = { startContainer: selectedNode, endContainer: selectedNode, startOffset: 0, endOffset: 1,
        toString: () => 'x', cloneRange() { return { ...this }; },
        intersectsNode: node => node === selectedNode };
      const selection = { isCollapsed: false, rangeCount: 1, anchorNode: selectedNode, focusNode: selectedNode,
        toString: () => 'x', getRangeAt: () => range, removeAllRanges() {} };
      const { toolbar } = selectionToolbar();
      let sent, conversions = 0;
      const h = harness('ask-sidebar.js', [message, toolbar], {
        cgptGetSelectedLatex(ranges) {
          if (!ranges.length) return null;
          conversions++;
          return `\\(${annotationText.data}\\)`;
        },
        cgptAskInSidebar(text) { sent = text; }, Event, MouseEvent: Event, PointerEvent: Event
      });
      h.body.dispatchEvent = () => {};
      h.document.dispatchEvent = () => {};
      h.window.getSelection = () => selection;
      h.listeners.selectionchange();
      assert.equal(conversions, 0, 'source conversion stays deferred');
      const documentScans = h.document.queries.length;
      if (mutation === 'characterData' || mutation === 'same-task') {
        annotationText.data = 'y^2';
        const records = [{ type: 'characterData', target: annotationText }];
        if (mutation === 'same-task') h.queueMutations(records);
        else h.mutate(records);
      } else if (mutation === 'childList') {
        const removed = annotationText;
        annotation.remove(removed);
        annotationText = annotation.appendChild({ nodeType: 3, data: 'y^2', isConnected: true });
        h.mutate([{ type: 'childList', target: annotation, addedNodes: [annotationText], removedNodes: [removed] }]);
      } else if (mutation === 'unrelated') {
        const otherMath = h.body.appendChild(new Element('span', { className: 'katex' }));
        const otherAnnotation = otherMath.appendChild(new Element('annotation'));
        const text = otherAnnotation.appendChild({ nodeType: 3, data: 'y^2', isConnected: true });
        h.mutate([{ type: 'characterData', target: text },
          { type: 'childList', target: otherAnnotation, addedNodes: [text], removedNodes: [] }]);
      }
      toolbar.children.at(-1).listeners.click({ preventDefault() {}, stopPropagation() {} });
      await Promise.resolve();
      const changed = !['unchanged', 'unrelated'].includes(mutation);
      assert.equal(sent, changed ? 'x' : '\\(x^2\\)', `${mathType}: ${mutation}`);
      assert.equal(conversions, changed ? 0 : 1, `${mathType}: ${mutation}`);
      assert.equal(h.document.queries.length, documentScans, 'mutation guard never scans historical messages');
      assert.equal(h.frames.length, 0, 'source-only or unrelated streamed text does not schedule toolbar scans');
    }
  }
});

test('fully selected intermediate formula sources reject mutations without invalidating unrelated message additions', async () => {
  for (const mutation of ['characterData', 'childList', 'attributes', 'unrelated-childList']) {
    const message = new Element('div', { message: true });
    const start = message.appendChild(new Element('span'));
    const math = message.appendChild(new Element('span', { className: 'katex', mathSource: true }));
    const annotation = math.appendChild(new Element('annotation'));
    let annotationText = annotation.appendChild({ nodeType: 3, data: 'x^2', isConnected: true });
    const end = message.appendChild(new Element('span'));
    // Keep raw text stable to verify mutation invalidation independently of the
    // existing text/boundary guard (data-math-source is not rendered text).
    const range = { startContainer: start, endContainer: end, startOffset: 0, endOffset: 1,
      toString: () => 'before x after', cloneRange() { return { ...this }; },
      intersectsNode: node => node === math || math.contains(node) };
    const selection = { isCollapsed: false, rangeCount: 1, anchorNode: { parentElement: start },
      focusNode: { parentElement: end }, toString: () => 'before x after', getRangeAt: () => range,
      removeAllRanges() {} };
    const { toolbar } = selectionToolbar();
    let sent, conversions = 0;
    const h = harness('ask-sidebar.js', [message, toolbar], {
      cgptGetSelectedLatex(ranges) {
        if (!ranges.length) return null;
        conversions++;
        return `before \\(${annotationText.data}\\) after`;
      },
      cgptAskInSidebar(text) { sent = text; }, Event, MouseEvent: Event, PointerEvent: Event
    });
    h.body.dispatchEvent = () => {};
    h.document.dispatchEvent = () => {};
    h.window.getSelection = () => selection;
    h.listeners.selectionchange();
    const scans = h.document.queries.length;
    if (mutation === 'characterData') {
      annotationText.data = 'y^2';
      h.mutate([{ type: 'characterData', target: annotationText }]);
    } else if (mutation === 'childList') {
      const removed = annotationText;
      annotation.remove(removed);
      annotationText = annotation.appendChild({ nodeType: 3, data: 'y^2', isConnected: true });
      h.mutate([{ type: 'childList', target: annotation, addedNodes: [annotationText], removedNodes: [removed] }]);
    } else if (mutation === 'attributes') {
      annotationText.data = 'y^2';
      h.mutate([{ type: 'attributes', attributeName: 'data-math-source', target: math }]);
    } else {
      const unrelated = message.appendChild(new Element('div'));
      unrelated.appendChild(new Element('span', { className: 'katex' }));
      h.mutate([{ type: 'childList', target: message, addedNodes: [unrelated], removedNodes: [] }]);
    }
    toolbar.children.at(-1).listeners.click({ preventDefault() {}, stopPropagation() {} });
    await Promise.resolve();
    const unchanged = mutation === 'unrelated-childList';
    assert.equal(sent, unchanged ? 'before \\(x^2\\) after' : 'before x after', mutation);
    assert.equal(conversions, unchanged ? 1 : 0, mutation);
    assert.equal(h.document.queries.length, scans, 'no full-page mutation scans');
  }
});

test('Gemini selection positioning runs once per frame, reuses width and stays hidden after scroll', () => {
  const frames = [], listeners = {}, windowListeners = {};
  let layoutReads = 0, rangeReads = 0;
  const button = { addEventListener() {} };
  const host = { style: {}, attachShadow: () => ({ querySelector: () => button }),
    getBoundingClientRect() { layoutReads++; return { width: 120 }; } };
  const anchor = { closest: selector => selector === 'message-content, user-query' ? {} : null };
  const selection = { isCollapsed: false, anchorNode: { parentElement: anchor }, focusNode: { parentElement: anchor },
    toString: () => 'selected text', getRangeAt: () => ({ getBoundingClientRect() {
      rangeReads++; return { right: 200, bottom: 100 };
    } }) };
  const window = { getSelection: () => selection, innerWidth: 800, innerHeight: 600,
    addEventListener(type, listener) { windowListeners[type] = listener; } };
  window.top = window.self = window;
  vm.runInNewContext(source('gemini-ask-sidebar.js'), { window,
    requestAnimationFrame: callback => frames.push(callback),
    document: { createElement: () => host, documentElement: { appendChild() {} },
      addEventListener(type, listener) { listeners[type] = listener; } } });
  for (let i = 0; i < 100; i++) listeners.selectionchange();
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(layoutReads, 1);
  assert.equal(rangeReads, 1);
  listeners.selectionchange(); frames.shift()();
  assert.equal(layoutReads, 1, 'button width is reused');
  listeners.selectionchange(); listeners.scroll(); frames.shift()();
  assert.equal(host.style.display, 'none', 'pending frame must not reshow a dismissed action');
  windowListeners.resize(); listeners.selectionchange(); frames.shift()();
  assert.equal(layoutReads, 2, 'resize invalidates the width');
});
