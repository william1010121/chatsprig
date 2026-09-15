import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_SETTINGS } from '../shared/defaults.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const event = () => ({ addListener(fn) { this.listener = fn; } });

test('overlapping manifest entries can load defaults repeatedly in the same world', async () => {
  const context = vm.createContext({ chrome: { storage: { sync: { get: async (defaults) => defaults } } } });
  const manifest = JSON.parse(read('manifest.json'));
  for (const entry of manifest.content_scripts) {
    for (const file of entry.js.filter((file) => file === 'shared/defaults.js')) {
      vm.runInContext(read(file), context, { filename: file });
    }
  }
  assert.deepEqual(JSON.parse(JSON.stringify(await context.cgptLoadSettings())), DEFAULT_SETTINGS);
  assert.equal(vm.runInContext('typeof DEFAULT_SETTINGS', context), 'undefined');
});

test('every ChatGPT entry routes to the top frame and never opens a window or tab', async () => {
  const messages = [];
  const badges = [];
  let response = { ok: true };
  let settingsOpened = 0;
  const chrome = {
    tabs: {
      query: async () => [{ id: 7 }],
      sendMessage: async (...args) => {
        messages.push(args);
        if (response instanceof Error) throw response;
        return response;
      },
      create() { assert.fail('must not create a tab'); }
    },
    windows: { create() { assert.fail('must not create a window'); } },
    action: {
      onClicked: event(),
      setBadgeText: async (value) => badges.push(value),
      setTitle: async () => {}
    },
    commands: { onCommand: event() },
    runtime: { onMessage: event(), onInstalled: event(), onStartup: event(),
      openOptionsPage: async () => { settingsOpened += 1; } },
    cookies: { onChanged: event() },
    storage: { onChanged: event() }
  };
  const context = vm.createContext({ chrome, DEFAULT_SETTINGS, loadSettings: async () => DEFAULT_SETTINGS });
  vm.runInContext(read('background.js').replace(/^import .*;\n/, ''), context);
  for (response of [{ ok: true }, undefined, new Error('no content script')]) {
    for (const command of ['toggle-chat', 'refresh-chat']) {
      chrome.commands.onCommand.listener(command);
      await new Promise(setImmediate);
    }
    chrome.action.onClicked.listener({ id: 7 });
    await new Promise(setImmediate);
    const reply = await new Promise((resolve) => chrome.runtime.onMessage.listener({ type: 'toggle' }, { tab: { id: 7 } }, resolve));
    assert.equal(reply.ok, response?.ok === true);
    assert.equal(badges.at(-1).text, reply.ok ? '' : '!');
  }
  assert.equal(messages.length, 9);
  assert.equal(settingsOpened, 3);
  for (const [id, message, options] of messages) {
    assert.equal(id, 7);
    assert.equal(options.frameId, 0);
    assert.ok(['toggleOverlay', 'refreshOverlay'].includes(message.type));
  }
});

test('early overlay request waits for settings and creates a sandboxed in-page frame', async () => {
  let resolveSettings;
  const frames = [];
  const attributes = new Map();
  const body = { appendChild(frame) { frames.push(frame); } };
  const shadow = {
    innerHTML: '', addEventListener() {},
    querySelector(selector) { return selector === '.body' ? body : { style: {} }; }
  };
  const host = {
    attachShadow: () => shadow,
    setAttribute: (key, value) => attributes.set(key, value),
    getAttribute: (key) => attributes.get(key)
  };
  const onMessage = event();
  const window = { setTimeout() {}, open() { assert.fail('must not open a popup'); } };
  window.top = window.self = window;
  const context = vm.createContext({
    window, URL,
    chrome: { runtime: { onMessage }, storage: { onChanged: event() } },
    cgptLoadSettings: () => new Promise((resolve) => { resolveSettings = resolve; }),
    sessionStorage: { getItem() {}, setItem() {}, removeItem() {} },
    document: {
      documentElement: { appendChild() {} },
      createElement(tag) {
        if (tag === 'div') return host;
        assert.equal(tag, 'iframe');
        return { setAttribute(key, value) { this[key] = value; }, addEventListener() {}, remove() {} };
      }
    }
  });
  vm.runInContext(read('content/overlay.js'), context);
  let reply;
  assert.equal(onMessage.listener({ type: 'toggleOverlay' }, {}, (value) => { reply = value; }), true);
  resolveSettings(DEFAULT_SETTINGS);
  await new Promise(setImmediate);
  assert.equal(reply.ok, true);
  assert.equal(reply.open, true);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].src, DEFAULT_SETTINGS.targetUrl);
  assert.equal(frames[0].sandbox, 'allow-scripts allow-same-origin allow-forms allow-downloads');
  assert.ok(!shadow.innerHTML.includes('newtab'));
  onMessage.listener({ type: 'refreshOverlay' }, {}, () => {});
  assert.equal(frames.length, 2);
  onMessage.listener({ type: 'toggleOverlay' }, {}, () => {});
  assert.equal(attributes.get('data-open'), 'false');
});

test('Windows Alt and macOS Option shortcuts work in every frame and input', () => {
  const messages = [];
  let keydown;
  const context = vm.createContext({
    window: { addEventListener(type, fn, capture) {
      assert.equal(type, 'keydown'); assert.equal(capture, true); keydown = fn;
    } },
    chrome: { runtime: { id: 'test', sendMessage: async (message) => messages.push(message) } }
  });
  vm.runInContext(read('content/shortcuts.js'), context);
  function press(overrides) {
    let prevented = false;
    keydown({ isTrusted: true, altKey: true, code: 'KeyK', key: '˚',
      preventDefault() { prevented = true; }, stopImmediatePropagation() {}, ...overrides });
    return prevented;
  }
  assert.equal(press({}), true);
  assert.equal(press({ code: 'KeyN', key: 'Dead', target: { isContentEditable: true } }), true);
  assert.deepEqual(messages.map((message) => message.command), ['toggle-chat', 'refresh-chat']);
  assert.equal(press({ key: 'k' }), true);
  assert.equal(press({ code: 'KeyN', key: 'n' }), true);
  assert.deepEqual(messages.slice(2).map((message) => message.command), ['toggle-chat', 'refresh-chat']);
  assert.equal(press({ repeat: true }), true);
  for (const overrides of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true },
    { altKey: false }, { code: 'KeyA' }, { isTrusted: false }]) {
    assert.equal(press(overrides), false);
  }
  assert.equal(messages.length, 4);
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.commands['toggle-chat'].suggested_key.windows, 'Alt+K');
  assert.equal(manifest.commands['refresh-chat'].suggested_key.windows, 'Alt+N');
  const entry = JSON.parse(read('manifest.json')).content_scripts.find((entry) => entry.js.includes('content/shortcuts.js'));
  assert.equal(entry.all_frames, true);
  assert.equal(entry.run_at, 'document_start');
});

test('browser and page events for one shortcut toggle only once', async () => {
  const messages = [];
  const chrome = {
    tabs: { query: async () => [{ id: 7 }], sendMessage: async (...args) => { messages.push(args); return { ok: true }; } },
    action: { onClicked: event(), setBadgeText: async () => {}, setTitle: async () => {} },
    commands: { onCommand: event() },
    runtime: { onMessage: event(), onInstalled: event(), onStartup: event() },
    cookies: { onChanged: event() }, storage: { onChanged: event() }
  };
  const context = vm.createContext({ chrome });
  vm.runInContext(read('background.js').replace(/^import .*;\n/, ''), context);
  for (const command of ['toggle-chat', 'refresh-chat']) {
    chrome.commands.onCommand.listener(command, { id: 7 });
    await new Promise((resolve) => chrome.runtime.onMessage.listener(
      { type: 'shortcut', command }, { tab: { id: 7 }, frameId: 12 }, resolve));
  }
  assert.equal(messages.length, 2);
  assert.equal(messages[0][2].frameId, 0);
  assert.equal(messages[1][1].type, 'refreshOverlay');
});

test('ChatGPT launcher survives page removal and respects visibility changes', async () => {
  let settings = { ...DEFAULT_SETTINGS };
  const children = [];
  let observer;
  let buttonClick;
  const onChanged = event();
  const messages = [];
  const window = {}; window.top = window.self = window;
  const root = { appendChild(host) { host.isConnected = true; children.push(host); } };
  const context = vm.createContext({
    window, location: { hostname: 'chatgpt.com' },
    cgptLoadSettings: async () => settings,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observer = this; }
      observe() {} disconnect() { this.disconnected = true; }
    },
    chrome: { storage: { onChanged }, runtime: { sendMessage: async (message) => messages.push(message) } },
    document: { documentElement: root, createElement() {
      return { style: {}, isConnected: false, setAttribute() {}, remove() { this.isConnected = false; },
        attachShadow() { return { innerHTML: '', querySelector() { return {
          addEventListener(type, callback) { buttonClick = callback; }
        }; } }; }
      };
    } }
  });
  vm.runInContext(read('content/launcher.js'), context);
  await new Promise(setImmediate);
  assert.equal(children.length, 1);
  const host = children[0];
  assert.equal(host.style.bottom, '20px');
  assert.equal(host.style.right, '20px');
  buttonClick();
  assert.equal(messages[0].type, 'toggle');
  host.remove(); observer.callback();
  assert.equal(host.isConnected, true);
  assert.equal(children.at(-1), host);
  settings = { ...settings, launcherHideOnChatgpt: true };
  onChanged.listener({ launcherHideOnChatgpt: {} }, 'sync');
  await new Promise(setImmediate);
  assert.equal(host.isConnected, false);
  assert.equal(observer.disconnected, true);
  settings = { ...settings, launcherHideOnChatgpt: false };
  onChanged.listener({ launcherHideOnChatgpt: {} }, 'sync');
  await new Promise(setImmediate);
  assert.equal(children.at(-1).isConnected, true);
});

test('upgrade restores the missing launcher once, while later upgrades keep preferences', async () => {
  let saved;
  const existing = { ...DEFAULT_SETTINGS, showLauncher: false, launcherHideOnChatgpt: true, launcherPosition: 'top-left' };
  const chrome = {
    commands: { onCommand: event() }, action: { onClicked: event() },
    runtime: { onMessage: event(), onInstalled: event(), onStartup: event() },
    cookies: { onChanged: event() },
    storage: { onChanged: event(), sync: { get: async () => existing, set: async (value) => { saved = value; } } }
  };
  const context = vm.createContext({ chrome, DEFAULT_SETTINGS, loadSettings: async () => ({ rewriteCookies: false }) });
  vm.runInContext(read('background.js').replace(/^import .*;\n/, ''), context);
  await chrome.runtime.onInstalled.listener({ reason: 'update', previousVersion: '2.0.2' });
  assert.equal(saved.showLauncher, true);
  assert.equal(saved.launcherHideOnChatgpt, false);
  assert.equal(saved.launcherPosition, 'bottom-right');
  saved = undefined;
  await chrome.runtime.onInstalled.listener({ reason: 'update', previousVersion: '2.0.3' });
  assert.equal(saved, undefined);
});
