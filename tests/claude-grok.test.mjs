import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_SETTINGS } from '../shared/defaults.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const event = () => ({ addListener(fn) { this.listener = fn; } });

test('Claude and Grok shortcuts route to their own overlay provider', async () => {
  const messages = [];
  const chrome = {
    tabs: { onRemoved: event(), query: async () => [{ id: 7 }], sendMessage: async (...args) => { messages.push(args); return { ok: true }; } },
    action: { onClicked: event(), setBadgeText: async () => {}, setTitle: async () => {} },
    commands: { onCommand: event() },
    runtime: { onMessage: event(), onInstalled: event(), onStartup: event() },
    cookies: { onChanged: event() }, storage: { onChanged: event() }
  };
  vm.runInContext(read('background.js').replace(/^import .*;\n/, ''), vm.createContext({ chrome }));
  for (const command of ['toggle-claude', 'toggle-grok']) {
    chrome.commands.onCommand.listener(command, { id: 7 });
    await new Promise(setImmediate);
  }
  for (const provider of ['claude', 'grok', 'unknown']) {
    await new Promise((resolve) => chrome.runtime.onMessage.listener({ type: 'toggle', provider }, { tab: { id: 7 } }, resolve));
  }
  assert.deepEqual(messages.map(([, message]) => message.provider), ['claude', 'grok', 'claude', 'grok', 'chatgpt']);
  assert.ok(messages.every(([, message, options]) => message.type === 'toggleOverlay' && options.frameId === 0));

  const keys = [];
  let keydown;
  vm.runInContext(read('content/shortcuts.js'), vm.createContext({
    window: { addEventListener(_type, fn) { keydown = fn; } },
    chrome: { runtime: { id: 'test', sendMessage: async (message) => keys.push(message.command) } }
  }));
  for (const code of ['KeyC', 'KeyX']) {
    keydown({ isTrusted: true, altKey: true, code, preventDefault() {}, stopImmediatePropagation() {} });
  }
  assert.deepEqual(keys, ['toggle-claude', 'toggle-grok']);

  const manifest = JSON.parse(read('manifest.json'));
  assert.ok(manifest.commands['toggle-claude'] && manifest.commands['toggle-grok']);
  assert.ok(Object.values(manifest.commands).filter((command) => command.suggested_key).length <= 4);
  const rules = JSON.parse(read('rules.json'));
  for (const host of ['claude.ai', 'grok.com']) {
    assert.ok(manifest.host_permissions.includes(`https://${host}/*`));
    const rule = rules.find((item) => item.condition.urlFilter === `||${host}/`);
    assert.deepEqual(rule.action.responseHeaders.map((header) => header.header).sort(),
      ['content-security-policy', 'content-security-policy-report-only', 'x-frame-options']);
  }
});

function loadOverlay(settings) {
  const frames = [];
  const attributes = new Map();
  const body = { appendChild(frame) { frames.push(frame); } };
  const element = () => ({ style: {}, hidden: false, textContent: '', setAttribute() {}, querySelector: () => element() });
  const shadow = {
    innerHTML: '', addEventListener() {},
    querySelector(selector) { return selector === '.body' ? body : selector === '.rail' ? { replaceChildren() {}, appendChild() {} } : element(); }
  };
  const host = {
    attachShadow: () => shadow,
    setAttribute: (key, value) => attributes.set(key, value),
    getAttribute: (key) => attributes.get(key)
  };
  const onMessage = event();
  const posts = [];
  const timers = [];
  const windowListeners = {};
  const window = { addEventListener(type, fn) { windowListeners[type] = fn; }, clearTimeout() {}, setTimeout(fn) { timers.push(fn); } };
  window.top = window.self = window;
  const context = vm.createContext({
    window, URL, CGPT_HELPER_DEFAULTS: DEFAULT_SETTINGS,
    chrome: { runtime: { onMessage }, storage: { onChanged: event() } },
    cgptLoadSettings: async () => settings,
    sessionStorage: { getItem() {}, setItem() {}, removeItem() {} },
    document: {
      documentElement: { appendChild() {} },
      createElement(tag) {
        if (tag === 'div' && !host.mounted) { host.mounted = true; return host; }
        if (tag !== 'iframe') return { dataset: {}, setAttribute() {}, appendChild() {} };
        const frame = {
          style: {}, listeners: {}, focus() {},
          setAttribute(key, value) { this[key] = value; },
          addEventListener(type, fn) { this.listeners[type] = fn; },
          remove() {},
          contentWindow: { postMessage: (data, origin) => posts.push([frame.name, origin, data.action]) }
        };
        return frame;
      }
    }
  });
  vm.runInContext(read('content/overlay.js'), context);
  return { frames, onMessage, posts, timers, windowListeners };
}

test('Claude and Grok overlays load their configured URL in a named frame', async () => {
  const { frames, onMessage } = loadOverlay({ ...DEFAULT_SETTINGS, claudeUrl: 'https://claude.ai/new?model=x' });
  await new Promise(setImmediate);
  onMessage.listener({ type: 'toggleOverlay', provider: 'claude' }, {}, () => {});
  onMessage.listener({ type: 'toggleOverlay', provider: 'grok' }, {}, () => {});
  assert.deepEqual(frames.map((frame) => [frame.name, frame.src]), [
    ['chatsprig_claude_frame', 'https://claude.ai/new?model=x&incognito'],
    ['chatsprig_grok_frame', DEFAULT_SETTINGS.grokUrl]
  ]);
  // Switching back reuses the live frame instead of reloading the conversation.
  onMessage.listener({ type: 'toggleOverlay', provider: 'claude' }, {}, () => {});
  assert.equal(frames.length, 2);
});

test('Focus messages only reach a loaded frame, at that frame\'s own origin', async () => {
  const { frames, onMessage, posts, timers } = loadOverlay({ ...DEFAULT_SETTINGS, focusPromptOnOpen: true });
  await new Promise(setImmediate);
  const runTimers = () => timers.splice(0).forEach((fn) => fn());
  // A just-created frame is still about:blank with the host page's origin: nothing may be posted to it.
  for (const provider of ['claude', 'grok', 'chatgpt']) onMessage.listener({ type: 'toggleOverlay', provider }, {}, () => {});
  runTimers();
  assert.deepEqual(posts, []);
  onMessage.listener({ type: 'toggleOverlay', provider: 'claude' }, {}, () => {});
  frames[0].listeners.load();
  runTimers();
  assert.ok(posts.length && posts.every(([name, origin, action]) =>
    name === 'chatsprig_claude_frame' && origin === 'https://claude.ai' && action === 'focusPrompt'));
  // Switching away cancels in the Claude frame, never in the new Grok frame or at another origin.
  posts.length = 0;
  onMessage.listener({ type: 'toggleOverlay', provider: 'grok' }, {}, () => {});
  runTimers();
  assert.deepEqual(posts, [['chatsprig_claude_frame', 'https://claude.ai', 'cancelFocusPrompt']]);
});

test('Grok stays covered until its helper confirms private mode', async () => {
  for (const confirmed of [true, false]) {
    const { frames, onMessage, posts, timers, windowListeners } = loadOverlay({ ...DEFAULT_SETTINGS, focusPromptOnOpen: true });
    await new Promise(setImmediate);
    onMessage.listener({ type: 'toggleOverlay', provider: 'grok' }, {}, () => {});
    frames[0].listeners.load();
    timers.splice(0).forEach((fn) => fn());
    // A regular Grok composer must not receive focus before private mode is confirmed.
    assert.deepEqual(posts, []);
    windowListeners.message({ source: frames[0].contentWindow, origin: 'https://grok.com',
      data: { source: 'cgpt-helper', action: 'assistantState', provider: 'grok', private: confirmed } });
    timers.splice(0).forEach((fn) => fn());
    assert.equal(posts.length > 0, confirmed);
    assert.ok(posts.every(([, origin, action]) => origin === 'https://grok.com' && action === 'focusPrompt'));
  }
  // With private mode off, Grok is usable as soon as it loads.
  const { frames, onMessage, posts, timers } = loadOverlay({ ...DEFAULT_SETTINGS, privateAssistantChats: false, focusPromptOnOpen: true });
  await new Promise(setImmediate);
  onMessage.listener({ type: 'toggleOverlay', provider: 'grok' }, {}, () => {});
  frames[0].listeners.load();
  timers.splice(0).forEach((fn) => fn());
  assert.equal(posts[0]?.[2], 'focusPrompt');
});

test('Claude and Grok URLs outside their own origin fall back to the defaults', async () => {
  const { frames, onMessage } = loadOverlay({ ...DEFAULT_SETTINGS, claudeUrl: 'https://evil.example/claude.ai', grokUrl: 'not a url' });
  await new Promise(setImmediate);
  onMessage.listener({ type: 'toggleOverlay', provider: 'claude' }, {}, () => {});
  onMessage.listener({ type: 'toggleOverlay', provider: 'grok' }, {}, () => {});
  assert.deepEqual(frames.map((frame) => frame.src), ['https://claude.ai/new?incognito', DEFAULT_SETTINGS.grokUrl]);
});

test('Claude opens a regular chat when private assistant chats are off', async () => {
  const { frames, onMessage } = loadOverlay({ ...DEFAULT_SETTINGS, privateAssistantChats: false });
  await new Promise(setImmediate);
  onMessage.listener({ type: 'toggleOverlay', provider: 'claude' }, {}, () => {});
  assert.equal(frames[0].src, 'https://claude.ai/new');
});

test('Grok frame helper sends its private-chat shortcut, then reports confirmed private mode', async () => {
  const posted = [];
  const keys = [];
  let incognito = false;
  let watch;
  const input = { disabled: false, getClientRects: () => [1] };
  const classes = new Set();
  const window = { name: 'chatsprig_grok_frame', addEventListener() {}, parent: { postMessage: (data) => posted.push(data) } };
  window.top = {};
  const document = {
    documentElement: { appendChild() {}, classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } },
    getElementById: () => null,
    createElement: () => ({}),
    querySelector: (selector) => selector === '.bg-surface-incognito' && incognito ? {} : null,
    querySelectorAll: () => [input],
    body: { dispatchEvent(event) { keys.push(event); incognito = true; } }
  };
  class KeyboardEvent { constructor(type, init) { Object.assign(this, { type }, init); } }
  const context = vm.createContext({
    window, document, KeyboardEvent, URLSearchParams, location: { search: '' }, setTimeout, setInterval: (fn) => { watch = fn; }, MutationObserver: class { observe() {} disconnect() {} },
    chrome: { storage: { onChanged: event() } },
    cgptLoadSettings: async () => ({ ...DEFAULT_SETTINGS })
  });
  vm.runInContext(read('content/assistant-frame-helper.js'), context);
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.equal(keys.length, 1);
  assert.deepEqual([keys[0].type, keys[0].code, keys[0].ctrlKey, keys[0].shiftKey], ['keydown', 'KeyJ', true, true]);
  assert.deepEqual(JSON.parse(JSON.stringify(posted)), [{ source: 'cgpt-helper', action: 'assistantState', provider: 'grok', private: true }]);
  assert.ok(classes.has('chatsprig-assistant-compact'));
  // Leaving private mode inside Grok updates the overlay title; an unchanged state stays quiet.
  watch();
  assert.equal(posted.length, 1);
  incognito = false;
  watch();
  assert.deepEqual(JSON.parse(JSON.stringify(posted.at(-1))), { source: 'cgpt-helper', action: 'assistantState', provider: 'grok', private: false });
  watch();
  assert.equal(posted.length, 2);
});
