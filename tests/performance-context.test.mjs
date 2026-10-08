import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL(`../content/${name}.js`, import.meta.url), 'utf8');
function contextHarness() {
  const frames = [], timers = [], turns = [], orphanMessages = [], events = [];
  const stats = { modeScans: 0, userScans: 0, turnScans: 0, contains: 0 };
  let observer;
  const node = (attrs = {}) => ({
    attrs, nodeType: 1, hidden: false,
    getAttribute(key) { return this.attrs[key] ?? null; },
    closest(selector) {
      if (selector.includes('[hidden]') && this.hidden) return this;
      if (selector.includes('data-message-author-role') && this.message) return this;
      if (selector.includes('radiogroup') && this === group) return this;
      return null;
    },
    getClientRects() { return [{}]; }
  });
  const chat = node({ 'aria-checked': 'true', 'data-tpp-toggle-value': 'chatgpt' });
  const work = node({ 'aria-checked': 'false', 'data-tpp-toggle-value': 'work' });
  const group = node();
  group.querySelectorAll = () => [chat, work];
  const composer = { querySelectorAll: () => [] };
  const main = {
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === '[data-turn-id-container]') return [];
      if (selector.includes('data-message-author-role')) return [...turns.flatMap(turn => turn.entries), ...orphanMessages];
      return turns;
    }
  };
  const location = { hostname: 'chatgpt.com', pathname: '/c/perf' };
  const context = vm.createContext({
    location, requestAnimationFrame: fn => frames.push(fn), queueMicrotask,
    setTimeout(fn, delay) { timers.push({ fn, delay }); },
    Event: class { constructor(type) { this.type = type; } },
    document: {
      documentElement: {},
      querySelector: selector => selector === 'main' ? main : composer,
      querySelectorAll(selector) {
        if (selector.includes('main [data-message-author-role=')) {
          if (selector.includes('"user"')) stats.userScans++;
          return turns.flatMap(turn => turn.entries).filter(entry => selector.includes(`"${entry.attrs['data-message-author-role']}"`));
        }
        if (selector.startsWith('main ')) return [];
        stats.modeScans++;
        return [group];
      },
      getElementById: () => null
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { dispatchEvent: event => events.push(event.type) },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} }
  });
  vm.runInContext(read('chat-context'), context);
  function turn(index, role = 'user') {
    const entry = node({ 'data-message-author-role': role, 'data-message-id': `${role}-${index}` });
    entry.message = true;
    entry.matches = selector => selector.includes('[data-message-author-role]');
    const result = node({ 'data-testid': `conversation-turn-${index}`, 'data-turn-id': `turn-${index}` });
    result.entries = [entry];
    result.querySelectorAll = () => { stats.turnScans++; return result.entries; };
    result.contains = el => { stats.contains++; return result.entries.includes(el); };
    turns.push(result);
    return entry;
  }
  return { api: context.cgptChatContext, stats, frames, timers, turns, orphanMessages, group, location, events, turn,
    mutate: records => observer(records),
    work() { chat.attrs['aria-checked'] = 'false'; work.attrs['aria-checked'] = 'true'; },
    flush() { while (frames.length) frames.shift()(); }
  };
}

test('history membership scans each turn once and still rejects orphan messages and missing prefixes', () => {
  const h = contextHarness();
  for (let i = 1; i <= 500; i++) h.turn(i, i % 2 ? 'user' : 'assistant');
  assert.equal(h.api.getHistory().count, 250);
  assert.equal(h.stats.turnScans, 500);
  assert.equal(h.stats.contains, 0, 'no pairwise message/turn membership checks');
  const orphan = h.turn(501);
  h.turns.pop();
  h.orphanMessages.push(orphan);
  assert.equal(h.api.getHistory(), null, 'messages outside the indexed turn set fail closed');
  h.orphanMessages.pop();
  h.turns.shift();
  assert.equal(h.api.getHistory(), null, 'a virtualized prefix must not become a smaller count');
});

test('streaming and editor mutations skip mode scans; mode evidence coalesces and synchronous reads stay current', () => {
  const h = contextHarness();
  const assistant = h.turn(1, 'assistant');
  const editor = { closest: selector => selector.includes('#prompt-textarea') ? editor : h.group };
  const before = h.stats.modeScans;
  for (let i = 0; i < 200; i++) {
    h.mutate([{ type: 'characterData', target: { nodeType: 3, parentElement: assistant } }]);
    h.mutate([{ type: 'childList', target: assistant, addedNodes: [{ nodeType: 3 }], removedNodes: [] }]);
    h.mutate([{ type: 'childList', target: editor, addedNodes: [{ nodeType: 3 }], removedNodes: [] }]);
  }
  assert.equal(h.stats.modeScans, before);
  assert.equal(h.frames.length, 0);
  h.work();
  for (let i = 0; i < 20; i++) h.mutate([{ type: 'attributes', target: h.group, attributeName: 'aria-checked' }]);
  assert.equal(h.frames.length, 1);
  assert.equal(h.api.getMode(), 'work', 'send-time reads do not wait for observer scheduling');
  h.flush();
  assert.equal(h.stats.modeScans, before + 2, 'one synchronous read plus one coalesced refresh');
  assert.ok(h.events.includes('cgpt-helper-mode-change'));
});

test('ancestor visibility changes and navigation invalidate mode; new user turns still update local counts', async () => {
  const h = contextHarness();
  const before = h.stats.modeScans;
  h.group.hidden = true;
  h.mutate([{ type: 'attributes', target: { contains: root => root === h.group }, attributeName: 'hidden' }]);
  assert.equal(h.frames.length, 1);
  h.flush();
  assert.equal(h.stats.modeScans, before + 1, 'visibility of an evidence ancestor triggers a refresh');
  h.group.hidden = false;
  h.turn(9);
  h.api.beginSendObservation();
  const added = h.turn(10);
  h.mutate([{ type: 'childList', target: {}, addedNodes: [added], removedNodes: [] }]);
  await Promise.resolve();
  h.flush();
  assert.equal(h.api.getCountState().cadence, 1);
  assert.ok(h.events.includes('cgpt-helper-count-change'));
  h.location.pathname = '/c/other';
  h.mutate([{ type: 'characterData', target: { nodeType: 3 } }]);
  assert.equal(h.frames.length, 1);
});

test('hidden tabs count pending sends before their timeout without running animation frames', async () => {
  const h = contextHarness();
  h.turn(9); // Virtualized history: local cadence is the only reliable count.
  assert.equal(h.api.getHistory(), null);
  h.api.beginSendObservation();
  const before = h.stats.userScans;
  const added = h.turn(10);
  for (let i = 0; i < 20; i++) {
    h.mutate([{ type: 'childList', target: {}, addedNodes: [added], removedNodes: [] }]);
  }
  assert.equal(h.stats.userScans, before, 'mutation delivery coalesces send checks');
  await Promise.resolve();
  assert.equal(h.stats.userScans, before + 1);
  assert.equal(h.frames.length, 0, 'message counting does not schedule a mode frame');
  assert.deepEqual(h.timers.map(timer => timer.delay), [10000]);
  h.timers[0].fn(); // Background tab remains suspended past the send timeout.
  assert.equal(h.api.getCountState().cadence, 1);
  assert.equal(h.events.filter(type => type === 'cgpt-helper-count-change').length, 1);
  const scans = h.stats.userScans;
  h.mutate([{ type: 'childList', target: added, addedNodes: [], removedNodes: [] }]);
  await Promise.resolve();
  assert.equal(h.stats.userScans, scans, 'completed sends stop bookkeeping during streaming');
});

test('a queued mode frame cannot block pending send counting or cancellation on navigation', async () => {
  const h = contextHarness();
  h.turn(9);
  h.api.beginSendObservation();
  h.mutate([{ type: 'attributes', target: h.group, attributeName: 'aria-checked' }]);
  assert.equal(h.frames.length, 1);
  const modeScans = h.stats.modeScans;
  const added = h.turn(10);
  h.mutate([{ type: 'childList', target: {}, addedNodes: [added], removedNodes: [] }]);
  await Promise.resolve();
  assert.equal(h.api.getCountState().cadence, 1);
  assert.equal(h.stats.modeScans, modeScans, 'counting does not flush the queued mode scan');
  assert.equal(h.frames.length, 1);

  h.api.beginSendObservation();
  h.location.pathname = '/c/other';
  h.mutate([{ type: 'characterData', target: { nodeType: 3 } }]);
  await Promise.resolve();
  assert.equal(h.frames.length, 1, 'navigation keeps mode refresh coalesced');
  assert.equal(h.events.filter(type => type === 'cgpt-helper-count-change').length, 2,
    'the pending send is cancelled before the hidden mode frame resumes');
  h.location.pathname = '/c/perf';
  const unrelated = h.turn(11);
  h.mutate([{ type: 'childList', target: {}, addedNodes: [unrelated], removedNodes: [] }]);
  await Promise.resolve();
  h.timers.forEach(timer => timer.fn());
  h.flush();
  assert.equal(h.events.filter(type => type === 'cgpt-helper-count-change').length, 2,
    'a send cancelled on another route cannot count a later message');
});

test('disabled and empty prompts avoid history reads; ordinary keystrokes and unrelated clicks avoid input lookup', async () => {
  for (const settings of [{ appendSystemPrompt: false, systemPrompt: 'prefix' }, { appendSystemPrompt: true, systemPrompt: '  ' }]) {
    const listeners = {};
    let historyReads = 0, lookups = 0, observations = 0;
    class TextArea { contains(target) { return target === this; } }
    const input = new TextArea();
    const button = { closest: () => button };
    vm.runInNewContext(read('system-prompt'), {
      location: { hostname: 'chatgpt.com' }, HTMLTextAreaElement: TextArea,
      cgptLoadSettings: async () => settings,
      cgptChatContext: { getMode: () => 'chat', getCountState() { historyReads++; return { cadence: 0 }; }, beginSendObservation() { observations++; } },
      chrome: { storage: { onChanged: { addListener() {} } } },
      document: { querySelector() { lookups++; return input; } },
      window: { addEventListener(type, fn) { listeners[type] = fn; } }
    });
    await Promise.resolve();
    for (let i = 0; i < 200; i++) listeners.keydown({ type: 'keydown', key: 'x', target: input });
    listeners.keydown({ type: 'keydown', key: 'Enter', isComposing: true, target: input });
    listeners.click({ type: 'click', target: { closest: () => null } });
    assert.equal(lookups, 0);
    listeners.click({ type: 'click', target: button });
    assert.equal(historyReads, 0);
    assert.equal(observations, 1, 'local cadence observation remains active');
    assert.equal(lookups, 1);
  }
});

async function compactHarness() {
  const elements = [], frames = [];
  const variables = {};
  const stats = { lookups: 0 };
  let observer;
  let composer = null;
  function element() {
    const el = { nodeType: 1, children: [], attrs: {}, style: { setProperty() {} }, classList: { toggle() {} },
      append(...children) { this.children.push(...children); }, appendChild(child) { this.append(child); },
      setAttribute(key, value) { this.attrs[key] = value; }, addEventListener() {},
      querySelector(selector) { return this.children.flatMap(child => [child, ...child.children]).find(child => selector === `#${child.id}` || selector === `.${child.className}`) || null; }
    };
    elements.push(el);
    return el;
  }
  let picker = element();
  picker.closest = selector => selector.includes('composer-intelligence-picker-content') ? picker : null;
  const documentElement = element();
  documentElement.style.setProperty = (key, value) => { variables[key] = value; };
  const document = {
    documentElement, body: {}, createElement: element,
    getElementById: id => elements.find(el => el.id === id) || null,
    querySelector(selector) { stats.lookups++; return selector.startsWith('form') ? composer : picker; }
  };
  vm.runInNewContext(read('compact-view'), {
    location: { pathname: '/' }, document, requestAnimationFrame: fn => frames.push(fn),
    window: { addEventListener() {} },
    cgptChatContext: { getMode: () => 'chat', getCountState: () => ({ count: 0 }) },
    cgptLoadSettings: async () => ({}),
    chrome: { storage: { onChanged: { addListener() {} } } },
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} }
  });
  await Promise.resolve();
  return { stats, frames, document, variables, mutate: records => observer(records),
    replaceComposer(width) {
      if (composer) composer.isConnected = false;
      composer = { isConnected: true, matches: selector => selector.includes('form[data-chatgpt-composer]'),
        getBoundingClientRect: () => ({ width }) };
      return composer;
    },
    replacePicker() {
      picker = element();
      picker.matches = selector => selector.includes('composer-intelligence-picker-content');
      return picker;
    },
    flush() { while (frames.length) frames.shift()(); }
  };
}

test('compact observer skips streaming, coalesces portal replacements and remounts controls', async () => {
  const h = await compactHarness();
  const before = h.stats.lookups;
  const message = { closest: selector => selector.includes('data-message-author-role') ? message : null };
  for (let i = 0; i < 200; i++) h.mutate([{ type: 'childList', target: message, addedNodes: [{ nodeType: 3 }], removedNodes: [] }]);
  assert.equal(h.stats.lookups, before);
  assert.equal(h.frames.length, 0);
  const picker = h.replacePicker();
  for (let i = 0; i < 20; i++) h.mutate([{ type: 'childList', target: {}, addedNodes: [picker], removedNodes: [] }]);
  assert.equal(h.frames.length, 1);
  h.flush();
  assert.equal(picker.children[0].children.length, 3);
  assert.equal(h.stats.lookups, before + 2, 'one composer lookup and one picker lookup for the entire batch');
});

test('compact observer measures replacement composers and recovers when the previous composer disconnects', async () => {
  const h = await compactHarness();
  const first = h.replaceComposer(640);
  h.mutate([{ type: 'childList', target: {}, addedNodes: [first], removedNodes: [] }]);
  h.flush();
  assert.equal(h.variables['--cgpt-helper-native-content-width'], '640px');
  h.replaceComposer(720);
  const message = { closest: selector => selector.includes('data-message-author-role') ? message : null };
  h.mutate([{ type: 'childList', target: message, addedNodes: [], removedNodes: [] }]);
  assert.equal(h.frames.length, 1, 'a disconnected composer invalidates the cached width target');
  h.flush();
  assert.equal(h.variables['--cgpt-helper-native-content-width'], '720px');
});
