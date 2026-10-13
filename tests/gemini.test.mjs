import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_SETTINGS } from '../shared/defaults.mjs';
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tick = () => new Promise(setImmediate);

function overlayHarness(session = {}) {
  let listener, receive;
  const sent = [], created = [], timers = [];
  const node = () => ({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } });
  const labels = new Map();
  const status = { ...node(), querySelector(selector) { return labels.get(selector) || (labels.set(selector, node()), labels.get(selector)); } };
  const shadow = { addEventListener() {}, querySelector(selector) {
    if (selector === '.body') return { appendChild() {} };
    if (selector === '.rail') return { replaceChildren() {}, appendChild() {} };
    if (selector === '.frame-status') return status;
    if (!labels.has(selector)) labels.set(selector, node());
    return labels.get(selector);
  } };
  const host = { ...node(), attachShadow: () => shadow };
  const window = { setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
    addEventListener(type, fn) { receive = fn; } };
  window.top = window.self = window;
  const context = vm.createContext({ window, URL, AbortController,
    sessionStorage: { getItem: (key) => session[key], setItem: (key, val) => { session[key] = val; }, removeItem: (key) => { delete session[key]; } },
    cgptLoadSettings: async () => DEFAULT_SETTINGS,
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } }, sendMessage: async (message) => { sent.push(message); return { message: 'filled' }; } }, storage: { onChanged: { addListener() {} } } },
    document: { documentElement: { appendChild() {} }, createElement(tag) {
      if (tag === 'div' && !host.mounted) { host.mounted = true; return host; }
      if (tag !== 'iframe') return { ...node(), dataset: {}, appendChild() {} };
      const frame = { ...node(), focusCount: 0, focus() { this.focusCount++; }, addEventListener() {},
        remove() { this.removed = true; }, contentWindow: { postMessage() {} } };
      created.push(frame); return frame;
    } }
  });
  vm.runInContext(read('content/overlay.js'), context);
  return { created, host, status, sent, session, timers, labels,
    send(message) { listener(message, {}, () => {}); },
    ready(frame, extra = {}) { receive({ source: frame.contentWindow, origin: 'https://gemini.google.com', data: { source: 'cgpt-helper', action: 'geminiState', ready: true }, ...extra }); },
    ask: (...args) => context.cgptAskInSidebar(...args)
  };
}

test('providers retain separate frames and drafts, with exactly one visible; refresh only replaces the active frame', async () => {
  const h = overlayHarness(); await tick();
  h.send({ type: 'toggleOverlay' });
  const chatgpt = h.created[0]; chatgpt.draft = 'keep GPT';
  h.send({ type: 'toggleOverlay', provider: 'gemini' });
  const gemini = h.created[1]; gemini.draft = 'keep Gemini'; h.ready(gemini);
  assert.equal(chatgpt.hidden, true); assert.equal(gemini.hidden, false);
  h.send({ type: 'toggleOverlay', provider: 'chatgpt' });
  assert.equal(h.created.length, 2); assert.equal(chatgpt.hidden, false); assert.equal(gemini.hidden, true);
  h.send({ type: 'toggleOverlay', provider: 'gemini' });
  assert.equal(gemini.draft, 'keep Gemini');
  h.send({ type: 'refreshOverlay' });
  assert.equal(gemini.removed, true); assert.equal(chatgpt.removed, undefined); assert.equal(chatgpt.draft, 'keep GPT');
  assert.equal(h.created[2].src, 'https://gemini.google.com/app');
  h.ready(gemini); // A stale document must never unlock the replacement.
  assert.equal(h.status.hidden, false);
  h.ready(h.created[2]); assert.equal(h.status.hidden, true);
});

test('hidden refresh uses the last provider; page restoration and the legacy open flag work', async () => {
  const h = overlayHarness({ cgptHelperOverlayOpen: '1', cgptHelperProvider: 'gemini' }); await tick();
  assert.equal(h.created[0].name, 'gemini_helper_overlay_frame');
  h.send({ type: 'toggleOverlay', provider: 'gemini' });
  assert.equal(h.host.attrs['data-open'], 'false');
  h.send({ type: 'refreshOverlay' });
  assert.equal(h.host.attrs['data-open'], 'true'); assert.equal(h.created[1].src, 'https://gemini.google.com/app');
  const legacy = overlayHarness({ cgptHelperOverlayOpen: '1' }); await tick();
  assert.equal(legacy.created[0].src, DEFAULT_SETTINGS.targetUrl);
});

test('stale focus callbacks cannot focus another provider and foreign readiness messages do not unlock Gemini', async () => {
  const h = overlayHarness(); await tick();
  h.send({ type: 'toggleOverlay' }); h.send({ type: 'toggleOverlay', provider: 'gemini' });
  h.ready(h.created[1], { origin: 'https://example.com' }); assert.equal(h.status.hidden, false);
  h.ready(h.created[1]); h.send({ type: 'toggleOverlay', provider: 'gemini' });
  for (const timer of h.timers) timer();
  assert.equal(h.created[0].focusCount, 0); assert.equal(h.created[1].focusCount, 0);
});

test('Gemini stays rendered behind the loading/error cover until temporary readiness is confirmed', async () => {
  const h = overlayHarness(); await tick();
  h.send({ type: 'toggleOverlay', provider: 'gemini' });
  assert.equal(h.status.hidden, false);
  assert.equal(h.created[0].hidden, false);
  assert.equal(h.created[0].style.visibility, '');
  assert.equal(h.created[0].inert, true);
  const error = 'Could not enable Gemini temporary chat. Diagnostics: { "signInMarker": false, "storageAccess": false }';
  h.ready(h.created[0], { data: { source: 'cgpt-helper', action: 'geminiState', ready: false, error } });
  assert.equal(h.status.hidden, false);
  assert.equal(h.status.querySelector('span').textContent, error);
  assert.equal(h.status.querySelector('button').hidden, false);
  assert.equal(h.created[0].style.visibility, '');
  h.ready(h.created[0]);
  assert.equal(h.status.hidden, true);
  assert.equal(h.created[0].style.visibility, '');
  assert.equal(h.created[0].inert, false);
});

test('Ask explicitly switches to its source provider and carries the provider to background routing', async () => {
  const h = overlayHarness(); await tick();
  h.send({ type: 'toggleOverlay' });
  await h.ask('selected Gemini text', 'gemini');
  assert.equal(h.created[0].hidden, true);
  assert.equal(h.sent.at(-1).provider, 'gemini');
  await h.ask('selected GPT text');
  assert.equal(h.created.length, 2); assert.equal(h.created[0].hidden, false);
  assert.equal(h.sent.at(-1).provider, 'chatgpt');
});

function geminiHarness({ availableAt = 0, enabled = false, missing = false, clickFails = false, dropClicks = 0, applyDelay = 0, signInMarker = false, chatPresent = true, inputMissing = false, hasStorageAccess, draft = '', generating = false, model = 'current', currentModel = 'Pro', availableModels = ['3.5 Flash-Lite', '3.8 Flash', '3.1 Pro'] } = {}) {
  let clock = 0, clicks = 0, sends = 0, listener, mutated, toggledOn = false, onAt = Infinity;
  const reports = [];
  let menuOpen = false, modelClicks = 0;
  const modelTrigger = { disabled: false, click() { menuOpen = true; },
    getAttribute(name) { return name === 'aria-expanded' ? String(menuOpen) : 'false'; },
    querySelector(selector) { return selector === 'button' ? null : { textContent: currentModel }; }
  };
  const modelOptions = availableModels.map(label => ({
    querySelector() { return { textContent: label }; }, getAttribute() { return 'false'; },
    click() { currentModel = label; menuOpen = false; modelClicks++; }
  }));
  const input = {
    isContentEditable: true, isConnected: true, focus() {}, getClientRects: () => [{}],
    get value() { return this.childNodes.map(p => p.childNodes[0].nodeValue || '').join('\n'); },
    set value(text) { this.childNodes = text.split('\n').map(line => ({ nodeName: 'P', childNodes: [line ? { nodeType: 3, nodeValue: line } : { nodeName: 'BR' }] })); }
  }; input.value = draft;
  const sendButton = { disabled: false, getAttribute: () => null, getClientRects: () => [{}], click() { sends++; } };
  // Like Gemini: an accepted click marks the toggle temp-chat-on at once and applies the mode after applyDelay;
  // a click while on exits temporary mode. Dropped clicks change nothing.
  const tempButton = { disabled: false, getAttribute: () => null, closest: (selector) => selector === '.temp-chat-on' && toggledOn ? {} : null,
    click() {
      clicks++;
      if (clickFails || clicks <= dropClicks) return;
      toggledOn = !toggledOn;
      if (toggledOn) onAt = clock + applyDelay; else { onAt = Infinity; enabled = false; }
    } };
  const window = { self: {}, top: {}, name: 'gemini_helper_overlay_frame', addEventListener() {},
    parent: { postMessage: (data) => reports.push(data) }, getSelection: () => ({ removeAllRanges() {}, addRange() {} }) };
  const context = vm.createContext({ window, Date: { now: () => clock }, Event: class {}, HTMLTextAreaElement: class {},
    setTimeout(fn, ms) {
      if (ms === 1000) return setTimeout(fn, ms); // Diagnostic deadline uses a cancellable timer.
      clock += ms; queueMicrotask(fn);
    }, clearTimeout,
    MutationObserver: class { constructor(fn) { mutated = fn; } observe() {} },
    cgptLoadSettings: async () => ({ ...DEFAULT_SETTINGS, geminiModel: model }),
    chrome: { runtime: { id: 'extension', sendMessage: async () => ({}), onMessage: { addListener(fn) { listener = fn; } } }, storage: { onChanged: { addListener() {} } } },
    document: { hasStorageAccess, documentElement: { classList: { toggle() {} }, appendChild() {} }, getElementById: () => null, createElement: () => ({}),
      createRange: () => ({ selectNodeContents() {}, collapse() {} }),
      execCommand(_command, _ui, text) { input.value += text; return true; },
      querySelectorAll() { return menuOpen ? modelOptions : []; },
      querySelector(selector) {
        if (selector === '[data-test-id="bard-mode-menu-button"]') return modelTrigger;
        if (selector === 'a[href*="accounts.google.com/SignOutOptions"]') return signInMarker ? {} : null;
        if (selector === 'chat-window') return chatPresent ? {} : null;
        if (selector === 'chat-window.is-temporary-chat') return enabled || clock >= onAt ? {} : null;
        if (selector.startsWith('.ql-editor')) return inputMissing ? null : input;
        if (selector.includes('temp-chat-button-container') || selector.includes('Temporary chat')) return !missing && clock >= availableAt ? tempButton : null;
        if (selector.includes('Stop response')) return generating ? {} : null;
        if (selector.includes('button.send-button')) return sendButton;
        return null;
      }
    }
  });
  vm.runInContext(read('content/gemini-frame-helper.js'), context);
  return { reports, input, currentModel: () => currentModel, modelClicks: () => modelClicks, clicks: () => clicks, sends: () => sends,
    leave() { enabled = false; toggledOn = false; onAt = Infinity; mutated(); },
    dispatch: (message, sender = { id: 'extension' }) => new Promise(resolve => {
      const async = listener({ provider: 'gemini', ...message }, sender, resolve);
      if (!async) resolve(undefined);
    })
  };
}

test('Gemini waits for the temporary entry, activates exactly once, and recognizes an already active temporary chat', async () => {
  for (const enabled of [false, true]) {
    const h = geminiHarness({ availableAt: 600, enabled }); await tick();
    assert.equal(h.clicks(), enabled ? 0 : 1); assert.equal(h.reports.at(-1).ready, true);
    assert.equal((await h.dispatch({ type: 'sidebarProbe' })).ready, true);
  }
});

test('a dropped temporary-chat click is retried, but a slowly applied one is never toggled off', async () => {
  const dropped = geminiHarness({ dropClicks: 1 }); await tick();
  assert.equal(dropped.clicks(), 2); assert.equal(dropped.reports.at(-1).ready, true);
  const slow = geminiHarness({ applyDelay: 8000 }); await tick();
  assert.equal(slow.clicks(), 1); assert.equal(slow.reports.at(-1).ready, true);
});

test('missing or failing temporary entry fails closed; leaving temporary mode revokes readiness', async () => {
  for (const options of [{ missing: true }, { clickFails: true }]) {
    const h = geminiHarness(options); await tick();
    assert.equal(h.reports.at(-1).ready, false); assert.match(h.reports.at(-1).error, /Could not enable/);
    const result = await h.dispatch({ type: 'sidebarFill', id: '1', text: 'never send', autoSend: true });
    assert.match(result.message, /not ready/); assert.equal(h.sends(), 0); assert.equal(h.input.value, '');
  }
  const h = geminiHarness(); await tick(); h.leave();
  assert.equal(h.reports.at(-1).ready, false);
  assert.equal((await h.dispatch({ type: 'sidebarProbe' })).ready, false);
});

const diagnosticsFrom = (h) => JSON.parse(h.reports.at(-1).error.split('Diagnostics: ')[1]);

test('timeout diagnostics distinguish absent sign-in UI from a failed temporary-mode switch', async () => {
  const absent = geminiHarness({ missing: true, chatPresent: false, inputMissing: true, hasStorageAccess: async () => false });
  await tick();
  assert.deepEqual(diagnosticsFrom(absent), {
    signInMarker: false, temporaryButton: false, temporaryButtonDisabled: null,
    chatWindow: false, temporaryMode: false, promptInput: false, storageAccess: false
  });
  const failed = geminiHarness({ signInMarker: true, clickFails: true, hasStorageAccess: async () => true });
  await tick();
  assert.deepEqual(diagnosticsFrom(failed), {
    signInMarker: true, temporaryButton: true, temporaryButtonDisabled: false,
    chatWindow: true, temporaryMode: false, promptInput: true, storageAccess: true
  });
  assert.equal(failed.reports.at(-1).ready, false);
});

test('timeout diagnostics report temporary mode even when its input is missing', async () => {
  const h = geminiHarness({ enabled: true, inputMissing: true }); await tick();
  assert.equal(diagnosticsFrom(h).temporaryMode, true);
  assert.equal(diagnosticsFrom(h).promptInput, false);
  assert.equal(h.reports.at(-1).ready, false);
});

test('unsupported and rejected storage-access checks preserve the original timeout error', async () => {
  for (const [hasStorageAccess, expected] of [
    [undefined, 'unsupported'],
    [() => { throw Object.assign(new Error('private details'), { name: 'SecurityError' }); }, 'error:SecurityError'],
    [async () => { throw new Error('private details'); }, 'error:Error']
  ]) {
    const h = geminiHarness({ missing: true, hasStorageAccess }); await tick();
    assert.match(h.reports.at(-1).error, /Could not enable Gemini temporary chat/);
    assert.equal(diagnosticsFrom(h).storageAccess, expected);
    assert.doesNotMatch(h.reports.at(-1).error, /private details/);
  }
});

test('a stalled storage-access check cannot suppress the timeout error', async () => {
  const h = geminiHarness({ missing: true, hasStorageAccess: () => new Promise(() => {}) });
  await tick();
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(diagnosticsFrom(h).storageAccess, 'timeout');
  assert.equal(h.reports.at(-1).ready, false);
});

test('Gemini Quill drafts append with a blank line, auto-send occurs once, and generating/draft/manual modes never send', async () => {
  for (const options of [{}, { draft: '原本草稿' }, { generating: true }, { autoSend: false }]) {
    const h = geminiHarness(options); await tick();
    const message = { type: 'sidebarFill', id: 'one', text: '第一行\n第二行', autoSend: options.autoSend !== false };
    await h.dispatch(message); await h.dispatch(message);
    assert.equal(h.input.value, (options.draft ? options.draft + '\n\n' : '') + message.text);
    assert.equal(h.sends(), options.draft || options.generating || options.autoSend === false ? 0 : 1);
  }
});

test('Gemini helper ignores messages for ChatGPT or from a foreign sender', async () => {
  const h = geminiHarness(); await tick();
  await h.dispatch({ type: 'sidebarFill', provider: 'chatgpt', id: '1', text: 'wrong service', autoSend: true });
  await h.dispatch({ type: 'sidebarFill', id: '2', text: 'foreign', autoSend: true }, { id: 'other' });
  assert.equal(h.input.value, ''); assert.equal(h.sends(), 0);
});

test('default model selects the exact model family, preserves current by default, and does not confuse Flash with Flash-Lite', async () => {
  for (const [model, expected] of [['current', 'Pro'], ['flash-lite', '3.5 Flash-Lite'], ['flash', '3.8 Flash'], ['pro', '3.1 Pro']]) {
    const h = geminiHarness({ model, currentModel: model === 'current' ? 'Pro' : 'Other' }); await tick();
    assert.equal(h.reports.at(-1).ready, true);
    assert.equal(h.currentModel(), expected); assert.equal(h.modelClicks(), model === 'current' ? 0 : 1);
  }
  const existing = geminiHarness({ model: 'pro', currentModel: 'Pro' }); await tick();
  assert.equal(existing.modelClicks(), 0); assert.equal(existing.reports.at(-1).ready, true);
});

test('an unavailable preferred model fails initialization without accepting or sending selection text', async () => {
  const h = geminiHarness({ model: 'pro', currentModel: 'Flash', availableModels: ['3.8 Flash'] }); await tick();
  assert.equal(h.reports.at(-1).ready, false); assert.match(h.reports.at(-1).error, /model is unavailable/);
  await h.dispatch({ type: 'sidebarFill', id: 'one', text: 'Do not send', autoSend: true });
  assert.equal(h.sends(), 0); assert.equal(h.input.value, '');
});

test('cancelling a Gemini fill during draft verification prevents automatic sending', async () => {
  const h = geminiHarness(); await tick();
  const pending = h.dispatch({ type: 'sidebarFill', id: 'one', text: 'Draft only', autoSend: true });
  await h.dispatch({ type: 'sidebarCancel', id: 'one' });
  await pending;
  assert.equal(h.sends(), 0);
});

test('Explain action opens the existing Gemini frame and uses its dedicated cross-service request', async () => {
  const h = overlayHarness(); await tick();
  await h.ask('explain this to me\n\nComplete response', 'gemini', true);
  assert.equal(h.sent.at(-1).type, 'explainGemini');
  assert.equal(h.sent.at(-1).provider, 'gemini');
  assert.equal(h.created[0].name, 'gemini_helper_overlay_frame');
});
