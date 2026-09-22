import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function frameHarness({ draft = '', generating = false, sendEnabled = true, inputPresent = true, rich = false } = {}) {
  let listener;
  let sends = 0;
  let clock = 0;
  class TextArea {
    constructor() { this._value = draft; this.isConnected = true; }
    get value() { return this._value; }
    set value(value) { this._value = value; }
    focus() {}
    setSelectionRange() {}
    dispatchEvent() {}
    getClientRects() { return [{}]; }
  }
  const input = rich ? {
    isContentEditable: true, isConnected: true, focus() {}, getClientRects() { return [{}]; },
    get value() { return this.childNodes.map((p) => p.childNodes[0].nodeValue).join('\n'); },
    set value(text) { this.childNodes = text.split('\n').map((line) => ({ nodeName: 'P', childNodes: [{ nodeType: 3, nodeValue: line }] })); }
  } : new TextArea();
  if (rich) input.value = draft;
  const send = { disabled: !sendEnabled, getAttribute() { return null; }, getClientRects() { return [{}]; }, click() { sends++; } };
  const window = { name: 'cgpt_helper_overlay_frame', top: {}, self: {}, parent: {}, addEventListener() {}, getSelection() { return { removeAllRanges() {}, addRange() {} }; } };
  const context = vm.createContext({
    window, HTMLTextAreaElement: TextArea, HTMLInputElement: TextArea, Event: class {},
    Date: { now: () => clock }, setTimeout(fn, ms) { clock += ms; queueMicrotask(fn); },
    chrome: { runtime: { id: 'extension', sendMessage: async () => ({}), onMessage: { addListener(fn) { listener = fn; } } }, storage: { onChanged: { addListener() {} } } },
    cgptLoadSettings: async () => ({ hideChatgptSidebar: false, focusPromptOnOpen: false }),
    document: {
      createRange() { return { selectNodeContents() {}, collapse() {} }; },
      execCommand(command, _ui, text) { assert.equal(command, 'insertText'); input.value += text; return true; },
      getElementById() { return null; }, documentElement: { classList: { remove() {} } },
      querySelector(selector) {
        if (selector === '#prompt-textarea') return inputPresent ? input : null;
        if (selector.includes('stop-button')) return generating ? {} : null;
        if (selector.includes('send-button')) return send;
        return null;
      }
    }
  });
  vm.runInContext(read('content/frame-helper.js'), context);
  return { input, sends: () => sends, dispatch: (message, sender = { id: 'extension' }) => new Promise((resolve) => {
    if (!listener(message, sender, resolve)) resolve(undefined);
  }) };
}
const fill = (overrides = {}) => ({ type: 'sidebarFill', id: 'one', text: '第一行\n第二行', autoSend: true, ...overrides });

test('sidebar sends Chinese multiline selection once and rejects duplicate IDs', async () => {
  const h = frameHarness();
  assert.match((await h.dispatch(fill())).message, /sent/);
  assert.equal(h.input.value, '第一行\n第二行');
  await h.dispatch(fill());
  assert.equal(h.sends(), 1);
});

test('Auto-send off, existing drafts, generation and unavailable send never auto-submit', async () => {
  for (const options of [{ autoSend: false }, { draft: '我的問題' }, { generating: true }, { sendEnabled: false }]) {
    const h = frameHarness(options);
    await h.dispatch(fill({ autoSend: options.autoSend !== false }));
    assert.equal(h.sends(), 0);
    assert.equal(h.input.value, (options.draft ? '我的問題\n\n' : '') + '第一行\n第二行');
  }
});

test('missing input times out without sending; foreign runtime sender is ignored', async () => {
  const h = frameHarness({ inputPresent: false });
  assert.match((await h.dispatch(fill())).message, /No input/);
  assert.equal(h.sends(), 0);
  const other = frameHarness();
  assert.equal(await other.dispatch(fill(), { id: 'foreign' }), undefined);
  assert.equal(other.input.value, '');
});

test('cancelling a pending fill prevents input and submission', async () => {
  const h = frameHarness({ inputPresent: false });
  const result = h.dispatch(fill());
  await h.dispatch({ type: 'sidebarCancel', id: 'one' });
  assert.match((await result).message, /Cancelled/);
  assert.equal(h.sends(), 0);
});

function backgroundHarness({ holdFill = false } = {}) {
  let releaseFill;
  let listener;
  const routed = [];
  const event = () => ({ addListener() {} });
  const chrome = {
    runtime: { onMessage: { addListener(fn) { listener = fn; } }, onInstalled: event(), onStartup: event() },
    commands: { onCommand: event() }, action: { onClicked: event() },
    storage: { onChanged: event() }, cookies: { onChanged: event() },
    tabs: { onRemoved: event(), async sendMessage(tabId, message, options) {
      routed.push({ tabId, message, options });
      if (holdFill && message.type === 'sidebarFill') return new Promise(resolve => { releaseFill = resolve; });
      return message.type === 'sidebarProbe' ? { ready: true, provider: message.provider } : { message: 'Selection sent.' };
    } }
  };
  vm.runInNewContext(read('background.js').replace(/^import .*;\n/, ''), {
    chrome, crypto: { randomUUID: () => 'request-1' }, setTimeout,
    DEFAULT_SETTINGS: {}, loadSettings: async () => ({})
  });
  return { routed, release: () => releaseFill({ message: 'Cancelled.' }), dispatch: (message, sender) => new Promise((resolve) => {
    if (!listener(message, sender, resolve)) resolve(undefined);
  }) };
}

test('routing probes then fills the exact embedded document only once', async () => {
  const h = backgroundHarness();
  await h.dispatch({ type: 'sidebarFrameIdentity', provider: 'chatgpt' }, {
    tab: { id: 7 }, frameId: 1, documentId: 'embedded-document', url: 'https://chatgpt.com/'
  });
  await h.dispatch({ type: 'askSidebar', text: '中文', autoSend: true }, {
    tab: { id: 7 }, frameId: 0, url: 'https://chatgpt.com/c/test'
  });
  assert.equal(h.routed.length, 2);
  assert.equal(h.routed[0].message.type, 'sidebarProbe');
  assert.equal(h.routed[1].message.type, 'sidebarFill');
  assert.equal(h.routed[1].options.documentId, 'embedded-document');
  assert.equal(h.routed[1].message.text, '中文');
});

test('routing rejects nested frames, other websites, and empty selections', async () => {
  const h = backgroundHarness();
  for (const sender of [
    { tab: { id: 7 }, frameId: 1, url: 'https://chatgpt.com/' },
    { tab: { id: 7 }, frameId: 0, url: 'https://example.com/' },
    { tab: { id: 7 }, frameId: 0, url: 'https://chatgpt.com.evil.test/' }
  ]) await h.dispatch({ type: 'askSidebar', text: 'test' }, sender);
  await h.dispatch({ type: 'askSidebar', text: '  ' }, { tab: { id: 7 }, frameId: 0, url: 'https://chatgpt.com/' });
  assert.equal(h.routed.length, 0);
});


test('ProseMirror paragraphs verify as single newlines and retain a blank separator for drafts', async () => {
  const empty = frameHarness({ rich: true });
  assert.match((await empty.dispatch(fill())).message, /sent/);
  assert.equal(empty.input.value, '第一行\n第二行');
  assert.equal(empty.sends(), 1);
  const draft = frameHarness({ rich: true, draft: '原有第一段\n原有第二段' });
  await draft.dispatch(fill());
  assert.equal(draft.input.value, '原有第一段\n原有第二段\n\n第一行\n第二行');
  assert.equal(draft.sends(), 0);
});

test('two registered providers route exclusively to their own document and reject cross-provider selections', async () => {
  const h = backgroundHarness();
  for (const provider of ['chatgpt', 'gemini']) {
    const url = provider === 'gemini' ? 'https://gemini.google.com/app' : 'https://chatgpt.com/';
    await h.dispatch({ type: 'sidebarFrameIdentity', provider }, { tab: { id: 7 }, frameId: 1, documentId: provider + '-document', url });
  }
  for (const provider of ['gemini', 'chatgpt']) {
    const url = provider === 'gemini' ? 'https://gemini.google.com/app' : 'https://chatgpt.com/';
    await h.dispatch({ type: 'askSidebar', provider, text: '選取文字' }, { tab: { id: 7 }, frameId: 0, url });
    assert.equal(h.routed.at(-1).options.documentId, provider + '-document');
    assert.equal(h.routed.at(-1).message.provider, provider);
  }
  const count = h.routed.length;
  await h.dispatch({ type: 'askSidebar', provider: 'chatgpt', text: 'wrong destination' }, { tab: { id: 7 }, frameId: 0, url: 'https://gemini.google.com/app' });
  assert.equal(h.routed.length, count);
});

test('cancellation targets only the in-flight document and concurrent fills are rejected', async () => {
  const h = backgroundHarness({ holdFill: true });
  const sender = { tab: { id: 7 }, frameId: 0, url: 'https://gemini.google.com/app' };
  await h.dispatch({ type: 'sidebarFrameIdentity', provider: 'gemini' }, { ...sender, frameId: 1, documentId: 'gemini-document' });
  const pending = h.dispatch({ type: 'askSidebar', provider: 'gemini', text: 'text' }, sender);
  await new Promise(setImmediate);
  const duplicate = await h.dispatch({ type: 'askSidebar', provider: 'gemini', text: 'text' }, sender);
  assert.match(duplicate.message, /previous selection/);
  await h.dispatch({ type: 'cancelSidebar' }, sender);
  assert.equal(h.routed.at(-1).message.type, 'sidebarCancel');
  assert.equal(h.routed.at(-1).message.provider, 'gemini');
  assert.equal(h.routed.at(-1).options.documentId, 'gemini-document');
  assert.equal(h.routed.filter(call => call.message.type === 'sidebarFill').length, 1);
  h.release(); await pending;
});
