import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_SETTINGS } from '../shared/defaults.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tick = () => new Promise(setImmediate);

function clock() {
  let now = 0, nextId = 0;
  const tasks = new Map();
  const schedule = (fn, ms, interval) => {
    const id = ++nextId;
    tasks.set(id, { fn, at: now + ms, interval });
    return id;
  };
  return {
    timers: {
      setTimeout: (fn, ms) => schedule(fn, ms, 0), clearTimeout: (id) => tasks.delete(id),
      setInterval: (fn, ms) => schedule(fn, ms, ms), clearInterval: (id) => tasks.delete(id)
    },
    now: () => now,
    advance(target) {
      for (;;) {
        const next = [...tasks].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, task] = next;
        now = task.at;
        if (task.interval) task.at += task.interval;
        else tasks.delete(id);
        task.fn();
      }
      now = target;
    },
    count: () => tasks.size
  };
}

function helperHarness({ present = true } = {}) {
  const time = clock(), replies = [], focusedAt = [], caretAt = [];
  let receive, runtimeListener, inputPresent = present;
  const parent = { postMessage(data, origin) { replies.push({ data, origin }); } };
  const document = {
    activeElement: null,
    getElementById: () => null,
    documentElement: { classList: { remove() {} } },
    querySelector: (selector) => selector === '#prompt-textarea' && inputPresent ? input : null
  };
  class TextArea {
    _value = 'existing draft';
    get value() { return this._value; }
    set value(value) { this._value = value; }
    isConnected = true;
    focus() { focusedAt.push(time.now()); document.activeElement = this; }
    setSelectionRange() { caretAt.push(time.now()); }
    getClientRects() { return [{}]; }
    dispatchEvent() {}
  }
  const input = new TextArea();
  const window = { ...time.timers, top: {}, self: {}, parent, name: 'cgpt_helper_overlay_frame',
    addEventListener(type, listener) { if (type === 'message') receive = listener; } };
  vm.runInNewContext(read('content/frame-helper.js'), {
    window, document, HTMLInputElement: TextArea, HTMLTextAreaElement: TextArea, Event: class {},
    ...time.timers, Date: { now: time.now },
    cgptLoadSettings: async () => ({ hideChatgptSidebar: false, focusPromptOnOpen: true }),
    chrome: { runtime: { id: 'extension', sendMessage: async () => ({}), onMessage: { addListener(fn) { runtimeListener = fn; } } },
      storage: { onChanged: { addListener() {} } } }
  });
  return { time, replies, focusedAt, caretAt, document, input,
    present(value) { inputPresent = value; },
    send(action, requestId = 1, extra = {}) {
      receive({ source: parent, origin: 'https://example.com', data: { source: 'cgpt-helper', action, requestId }, ...extra });
    },
    fill(message) {
      return new Promise((resolve) => runtimeListener({ type: 'sidebarFill', id: 'fill', text: 'selection', autoSend: false, ...message }, { id: 'extension' }, resolve));
    }
  };
}

function overlayHarness() {
  const time = clock(), created = [], labels = new Map();
  let receive, runtimeListener;
  const node = () => ({ style: {}, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, getAttribute(key) { return this.attrs[key]; } });
  const status = { ...node(), querySelector(selector) {
    if (!labels.has(selector)) labels.set(selector, node());
    return labels.get(selector);
  } };
  const shadow = { addEventListener() {}, querySelector(selector) {
    if (selector === '.body') return { appendChild() {} };
    if (selector === '.rail') return { replaceChildren() {}, appendChild() {} };
    if (selector === '.frame-status') return status;
    if (!labels.has(selector)) labels.set(selector, node());
    return labels.get(selector);
  } };
  const host = { ...node(), attachShadow: () => shadow };
  const window = { ...time.timers, addEventListener(type, listener) { if (type === 'message') receive = listener; } };
  window.top = window.self = window;
  const context = vm.createContext({ window, URL, AbortController, Date: { now: time.now },
    sessionStorage: { getItem() {}, setItem() {}, removeItem() {} },
    cgptLoadSettings: async () => DEFAULT_SETTINGS,
    chrome: { runtime: { sendMessage: async () => ({ message: 'filled' }), onMessage: { addListener(fn) { runtimeListener = fn; } } },
      storage: { onChanged: { addListener() {} } } },
    document: { documentElement: { appendChild() {} }, createElement(tag) {
      if (tag === 'div' && !host.mounted) { host.mounted = true; return host; }
      if (tag !== 'iframe') return { ...node(), dataset: {}, appendChild() {} };
      const frame = { ...node(), sent: [], focusCount: 0, focus() { this.focusCount++; },
        addEventListener(type, listener) { if (type === 'load') this.load = listener; }, remove() {},
        contentWindow: { postMessage(data, origin) { frame.sent.push({ data, origin }); } } };
      created.push(frame);
      return frame;
    } }
  });
  vm.runInContext(read('content/overlay.js'), context);
  return { time, created, context,
    toggle(provider = 'chatgpt') { runtimeListener({ type: 'toggleOverlay', provider }, {}, () => {}); },
    ack(frame, requestId, extra = {}) {
      receive({ source: frame.contentWindow, origin: 'https://chatgpt.com',
        data: { source: 'cgpt-helper', action: 'focusPromptResult', requestId, focused: true }, ...extra });
    }
  };
}

test('ready ChatGPT input focuses immediately and an already focused editor retains its caret', async () => {
  const h = helperHarness(); await tick();
  assert.equal(h.focusedAt.length, 0, 'initialization waits for the parent focus request');
  h.send('focusPrompt');
  assert.deepEqual(h.focusedAt, [0]);
  assert.deepEqual(h.caretAt, [0]);
  assert.equal(h.time.count(), 0);
  assert.equal(h.replies[0].data.requestId, 1);
  assert.equal(h.replies[0].origin, 'https://example.com');
  h.send('focusPrompt', 2);
  assert.deepEqual(h.caretAt, [0]);
  assert.equal(h.replies[1].data.requestId, 2);
});

test('a visible editor that rejects focus keeps retrying until focus is confirmed', () => {
  const h = helperHarness();
  const realFocus = h.input.focus.bind(h.input);
  h.input.focus = () => {};
  h.send('focusPrompt', 7);
  assert.equal(h.replies.length, 0);
  assert.equal(h.caretAt.length, 0);
  assert.equal(h.time.count(), 1);
  h.input.focus = realFocus;
  h.time.advance(150);
  assert.deepEqual(h.focusedAt, [150]);
  assert.deepEqual(h.caretAt, [150]);
  assert.equal(h.replies[0].data.requestId, 7);
  assert.equal(h.time.count(), 0);
});

test('helper cancels pending focus by request ID and ignores foreign sources', () => {
  const h = helperHarness({ present: false });
  h.send('focusPrompt', 1, { source: {} });
  assert.equal(h.time.count(), 0);
  h.send('focusPrompt', 2);
  h.send('cancelFocusPrompt', 1);
  assert.equal(h.time.count(), 1, 'a stale cancel cannot stop a newer request');
  h.send('cancelFocusPrompt', 2);
  h.present(true);
  h.time.advance(13000);
  assert.equal(h.focusedAt.length, 0);
  assert.equal(h.time.count(), 0);
});

test('selection filling cancels focus retries and focus requests cannot disturb active filling', async () => {
  const h = helperHarness({ present: false });
  h.send('focusPrompt');
  const filling = h.fill();
  h.send('focusPrompt', 2);
  h.present(true);
  h.time.advance(150);
  await tick();
  h.time.advance(250);
  await filling;
  assert.deepEqual(h.focusedAt, [150]);
  assert.deepEqual(h.caretAt, [150]);
  assert.equal(h.input.value, 'existing draft\n\nselection');
  assert.equal(h.replies.length, 0);
});

test('matching ACK stops overlay retries; forged origin, frame and stale request IDs do not', async () => {
  const h = overlayHarness(); await tick();
  h.toggle();
  const frame = h.created[0]; frame.load();
  h.time.advance(0);
  const request = frame.sent.find(({ data }) => data.action === 'focusPrompt').data;
  h.ack(frame, request.requestId, { origin: 'https://evil.example' });
  h.ack(frame, request.requestId, { source: {} });
  h.ack(frame, request.requestId - 1);
  h.time.advance(80);
  assert.equal(frame.focusCount, 2);
  h.ack(frame, request.requestId);
  h.time.advance(4000);
  assert.equal(frame.focusCount, 2);
  assert.equal(h.time.count(), 0);
});

test('hide and provider switching cancel helper requests and leave stale parent callbacks inert', async () => {
  for (const action of ['hide', 'switch']) {
    const h = overlayHarness(); await tick();
    h.toggle();
    const frame = h.created[0]; frame.load(); h.time.advance(0);
    const requestId = frame.sent.find(({ data }) => data.action === 'focusPrompt').data.requestId;
    h.toggle(action === 'switch' ? 'gemini' : 'chatgpt');
    assert.ok(frame.sent.some(({ data }) => data.action === 'cancelFocusPrompt' && data.requestId === requestId));
    h.time.advance(4000);
    assert.equal(frame.focusCount, 1);
  }
});

test('slow iframe loads still receive requested focus, while Ask cancels previous focus', async () => {
  const h = overlayHarness(); await tick();
  h.toggle(); const frame = h.created[0];
  h.time.advance(9000); frame.load(); h.time.advance(9000);
  assert.equal(frame.focusCount, 1);
  await h.context.cgptAskInSidebar('selection');
  h.time.advance(13000);
  assert.equal(frame.focusCount, 1);
  assert.equal(frame.sent.at(-1).data.action, 'cancelFocusPrompt');
});
