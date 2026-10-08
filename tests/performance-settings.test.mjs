import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const flush = () => new Promise(setImmediate);
const event = () => ({ addListener(fn) { this.listener = fn; } });

function settingsHarness() {
  const reads = [];
  const onChanged = event();
  const context = vm.createContext({ chrome: { storage: {
    onChanged,
    sync: { get(defaults) {
      return new Promise((resolve, reject) => reads.push({ defaults, resolve, reject }));
    } }
  } } });
  const inject = () => vm.runInContext(read('shared/defaults.js'), context);
  inject();
  return { context, reads, onChanged, inject };
}

test('overlapping injections share concurrent settings reads without keeping a stale cache', async () => {
  const h = settingsHarness();
  const loader = h.context.cgptLoadSettings;
  const first = loader();
  h.inject();
  assert.equal(h.context.cgptLoadSettings, loader);
  const rest = Array.from({ length: 6 }, () => loader());
  assert.equal(h.reads.length, 1);
  h.reads[0].resolve({ ...h.reads[0].defaults, windowWidth: 900 });
  const results = await Promise.all([first, ...rest]);
  results[0].windowWidth = 1;
  assert.equal(results[1].windowWidth, 900);
  const next = loader();
  assert.equal(h.reads.length, 2);
  h.reads[1].resolve({ ...h.reads[1].defaults, windowWidth: 1200 });
  assert.equal((await next).windowWidth, 1200);
});

test('settings changes and removals during an initial read override its old snapshot', async () => {
  const h = settingsHarness();
  const pending = h.context.cgptLoadSettings();
  h.onChanged.listener({ windowWidth: { newValue: 700 }, showLauncher: { newValue: false } }, 'sync');
  h.onChanged.listener({ windowWidth: {} }, 'sync');
  h.onChanged.listener({ showLauncher: { newValue: true } }, 'local');
  h.reads[0].resolve({ ...h.reads[0].defaults, windowWidth: 900, showLauncher: true });
  const settings = await pending;
  assert.equal(settings.windowWidth, h.reads[0].defaults.windowWidth);
  assert.equal(settings.showLauncher, false);
});

test('a failed shared settings read rejects every consumer and can be retried', async () => {
  const h = settingsHarness();
  const results = Promise.allSettled([h.context.cgptLoadSettings(), h.context.cgptLoadSettings()]);
  h.reads[0].reject(new Error('unavailable'));
  for (const result of await results) {
    assert.equal(result.status, 'rejected');
    assert.match(result.reason.message, /unavailable/);
  }
  const retry = h.context.cgptLoadSettings();
  h.reads[1].resolve(h.reads[1].defaults);
  assert.equal((await retry).rewriteCookies, true);
});

function sidebarHarness({ probe } = {}) {
  let clock = 0;
  let timerId = 0;
  const timers = new Map();
  const routed = [];
  const chrome = {
    runtime: { onMessage: event(), onInstalled: event(), onStartup: event() },
    commands: { onCommand: event() }, action: { onClicked: event() },
    storage: { onChanged: event() }, cookies: { onChanged: event() },
    tabs: { onRemoved: event(), async sendMessage(tabId, message, options) {
      routed.push({ tabId, message, options });
      if (message.type === 'sidebarProbe') return probe ? probe(message, options) : { ready: true, provider: message.provider };
      return { message: 'Selection sent.' };
    } }
  };
  vm.runInNewContext(read('background.js').replace(/^import .*;\n/, ''), {
    chrome, DEFAULT_SETTINGS: {}, loadSettings: async () => ({}),
    crypto: { randomUUID: () => 'request-1' }, Date: { now: () => clock },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  const sender = { tab: { id: 7 }, frameId: 0, url: 'https://chatgpt.com/c/test' };
  const dispatch = (message, source = sender) => new Promise(resolve => {
    if (!chrome.runtime.onMessage.listener(message, source, resolve)) resolve(undefined);
  });
  return { routed, timers, chrome, sender, dispatch,
    register(provider = 'chatgpt', documentId = 'embedded-document') {
      return dispatch({ type: 'sidebarFrameIdentity', provider }, {
        ...sender, frameId: 1, documentId,
        url: provider === 'gemini' ? 'https://gemini.google.com/app' : 'https://chatgpt.com/'
      });
    },
    async advance(ms) {
      clock += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= clock) { timers.delete(id); timer.fn(); }
      }
      await flush();
    }
  };
}

test('sidebar registration immediately wakes discovery and fills the exact registered document', async () => {
  const h = sidebarHarness();
  const result = h.dispatch({ type: 'askSidebar', text: 'selection' });
  await flush();
  assert.equal(h.routed.length, 1);
  assert.equal(h.timers.size, 1);
  await h.register('gemini', 'other-provider');
  await flush();
  assert.equal(h.routed.length, 1);
  await h.register();
  assert.match((await result).message, /sent/);
  assert.deepEqual(h.routed.map(call => call.message.type), ['sidebarDiscover', 'sidebarProbe', 'sidebarFill']);
  assert.equal(h.routed.at(-1).options.documentId, 'embedded-document');
  assert.equal(h.timers.size, 0);
});

test('missing sidebar discovery is bounded to one broadcast per second and keeps its deadline', async () => {
  const h = sidebarHarness();
  const result = h.dispatch({ type: 'askSidebar', text: 'selection' });
  await h.advance(200);
  assert.equal(h.routed.length, 1);
  await h.advance(800);
  assert.equal(h.routed.length, 2);
  for (let i = 0; i < 34; i++) await h.advance(1000);
  assert.match((await result).message, /not ready/);
  assert.equal(h.routed.length, 35);
  assert.equal(h.timers.size, 0);
});

test('a registered sidebar still probes readiness every 200 ms', async () => {
  let ready = false;
  const h = sidebarHarness({ probe: message => ({ ready, provider: message.provider }) });
  await h.register();
  const result = h.dispatch({ type: 'askSidebar', text: 'selection' });
  await flush();
  ready = true;
  await h.advance(200);
  assert.match((await result).message, /sent/);
  assert.equal(h.routed.filter(call => call.message.type === 'sidebarProbe').length, 2);
});

test('cancelling or removing a tab wakes discovery without filling', async () => {
  for (const removeTab of [false, true]) {
    const h = sidebarHarness();
    const result = h.dispatch({ type: 'askSidebar', text: 'selection' });
    await flush();
    if (removeTab) h.chrome.tabs.onRemoved.listener(7);
    else await h.dispatch({ type: 'cancelSidebar' });
    assert.match((await result).message, /Cancelled/);
    assert.equal(h.timers.size, 0);
    await h.register();
    assert.equal(h.routed.filter(call => call.message.type === 'sidebarFill').length, 0);
  }
});

test('a document replaced during a readiness probe never receives the fill', async () => {
  let releaseProbe;
  const h = sidebarHarness({ probe: (message, options) => options.documentId === 'old-document'
    ? new Promise(resolve => { releaseProbe = () => resolve({ ready: true, provider: message.provider }); })
    : { ready: true, provider: message.provider } });
  await h.register('chatgpt', 'old-document');
  const result = h.dispatch({ type: 'askSidebar', text: 'selection' });
  await flush();
  await h.register('chatgpt', 'new-document');
  releaseProbe();
  assert.match((await result).message, /sent/);
  const fills = h.routed.filter(call => call.message.type === 'sidebarFill');
  assert.equal(fills.length, 1);
  assert.equal(fills[0].options.documentId, 'new-document');
});
