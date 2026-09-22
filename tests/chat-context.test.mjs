import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../content/chat-context.js', import.meta.url), 'utf8');
const node = (attrs = {}, textContent = '') => ({
  textContent, attrs, hidden: false, inMessage: false,
  getAttribute(key) { return this.attrs[key] ?? null; },
  closest(selector) { return (selector.includes('hidden') && this.hidden) || (selector.includes('data-message-author-role') && this.inMessage) ? {} : null; },
  getClientRects() { return [{}]; }
});
function harness({ hostname = 'chatgpt.com', pathname = '/', busy = false } = {}) {
  let observe;
  const groups = [], turns = [], containers = [], triggers = [];
  const composer = { querySelectorAll: () => triggers };
  const menus = new Map(), cache = new Map();
  const main = {
    querySelector() { return busy ? {} : null; },
    querySelectorAll(selector) {
      if (selector === '[data-turn-id-container]') return containers;
      if (selector.includes('data-message-author-role')) return turns.flatMap(turn => turn.entries);
      return turns;
    }
  };
  const context = vm.createContext({ location: { hostname, pathname }, Event: class {},
    document: { documentElement: {},
      querySelector(selector) { return selector === 'main' ? main : selector.startsWith('form') ? composer : turns[0]?.entries[0] || null; },
      querySelectorAll() { return groups; }, getElementById: id => menus.get(id) },
    sessionStorage: { setItem: (k,v) => cache.set(k,v), getItem: k => cache.get(k), removeItem: k => cache.delete(k) },
    window: { dispatchEvent() {} }, MutationObserver: class { constructor(fn) { observe = fn; } observe() {} }
  });
  vm.runInContext(source, context);
  function group(mode) {
    const chat = node({ 'aria-checked': String(mode === 'chat'), 'data-tpp-toggle-value': 'chatgpt' }, 'Chat');
    const work = node({ 'aria-checked': String(mode === 'work'), 'data-tpp-toggle-value': 'work' }, 'Work');
    const result = node(); result.querySelectorAll = () => [chat, work];
    result.select = mode => { chat.attrs['aria-checked'] = String(mode === 'chat'); work.attrs['aria-checked'] = String(mode === 'work'); observe(); };
    groups.push(result); return result;
  }
  function turn(index, role, id = `${role}-${index}`) {
    const entry = node({ 'data-message-author-role': role, 'data-message-id': id });
    const result = node({ 'data-testid': `conversation-turn-${index}`, 'data-turn-id': id });
    result.entries = [entry]; result.querySelectorAll = () => result.entries;
    result.contains = el => result.entries.includes(el);
    turns.push(result); return result;
  }
  return { api: context.cgptChatContext, group, turn, turns, containers, triggers, menus, cache, location: context.location };
}
test('mode requires visible paired controls and an explicit, unambiguous selection', () => {
  const h = harness(); assert.equal(h.api.getMode(), 'unknown');
  const group = h.group('chat'); assert.equal(h.api.getMode(), 'chat');
  const revision = h.api.revision;
  group.select('work'); assert.equal(h.api.getMode(), 'work'); assert.ok(h.api.revision > revision);
  group.select('chat'); assert.equal(h.api.getMode(), 'chat');
  const hidden = harness(); hidden.group('chat').hidden = true; assert.equal(hidden.api.getMode(), 'unknown');
  const inMessage = harness(); inMessage.group('chat').inMessage = true; assert.equal(inMessage.api.getMode(), 'unknown');
  group.inMessage = false; h.group('work'); assert.equal(h.api.getMode(), 'unknown');
  const other = harness({ hostname: 'gemini.google.com' }); other.group('chat'); assert.equal(other.api.getMode(), 'unknown');
});
test('counts only user messages in complete 1-based turns, matching the saved KK page structure', () => {
  const h = harness({ pathname: '/c/existing' });
  assert.equal(h.api.getHistory(), null);
  h.turn(1, 'user'); h.turn(2, 'assistant'); h.turn(3, 'user'); h.turn(4, 'assistant');
  assert.equal(h.api.getHistory().count, 2);
  const key = h.api.getHistory().key;
  h.turns[3].entries[0].attrs['data-message-id'] = 'regenerated';
  assert.equal(h.api.getHistory().key, key);
  h.turns[2].entries[0].attrs['data-message-id'] = 'other-branch';
  assert.notEqual(h.api.getHistory().key, key);
  h.turns.splice(2); assert.equal(h.api.getHistory().count, 1);
});
test('fresh routes reset, but busy, incomplete, duplicate and virtualized history is unknown', () => {
  assert.equal(harness().api.getHistory().count, 0);
  assert.equal(harness({ busy: true }).api.getHistory(), null);
  const missingHead = harness(); missingHead.turn(3, 'user'); assert.equal(missingHead.api.getHistory(), null);
  const gap = harness(); gap.turn(1, 'user'); gap.turn(3, 'user'); assert.equal(gap.api.getHistory(), null);
  const duplicate = harness(); duplicate.turn(1, 'user', 'same'); duplicate.turn(2, 'user', 'same'); assert.equal(duplicate.api.getHistory(), null);
  const placeholder = harness(); placeholder.turn(1, 'user');
  const container = node({ 'data-turn-id-container': 'unrendered' }); container.querySelector = () => null;
  placeholder.containers.push(container); assert.equal(placeholder.api.getHistory(), null);
  container.attrs['data-turn-id-container'] = 'client-created-root'; assert.equal(placeholder.api.getHistory().count, 1);
});
test('hidden alternative branches are not counted and missing user identity is rejected', () => {
  const h = harness(); h.turn(1, 'user'); h.turn(2, 'assistant');
  const alternative = h.turn(1, 'user'); alternative.hidden = true; alternative.entries[0].hidden = true;
  assert.equal(h.api.getHistory().count, 1);
  delete h.turns[0].entries[0].attrs['data-message-id']; delete h.turns[0].attrs['data-turn-id'];
  assert.equal(h.api.getHistory(), null);
});

test('verified composer menu identifies existing chats, survives portal close and never overrides Work', () => {
  const h = harness({ pathname: '/c/existing' });
  const trigger = node({ 'aria-controls': 'menu' }); trigger.classList = [];
  h.triggers.push(trigger);
  const picker = node(); picker.querySelector = () => null;
  picker.querySelectorAll = () => [node({}, 'Latest')];
  h.menus.set('menu', { querySelector: () => picker });
  assert.equal(h.api.getMode(), 'chat');
  h.menus.clear(); assert.equal(h.api.getMode(), 'chat');
  assert.equal(h.cache.get('chatsprig:surface:/c/existing'), 'chat');
  trigger.classList.push('prefix_WorkTrigger'); assert.equal(h.api.getMode(), 'work');
  const reloaded = harness({ pathname: '/c/existing' });
  reloaded.cache.set('chatsprig:surface:/c/existing', 'chat'); assert.equal(reloaded.api.getMode(), 'chat');
  reloaded.location.pathname = '/c/other'; assert.equal(reloaded.api.getMode(), 'unknown');
});
test('unselected surface controls do not reuse earlier Chat evidence', () => {
  const h = harness(); const group = h.group('chat'); assert.equal(h.api.getMode(), 'chat');
  group.select('none'); assert.equal(h.api.getMode(), 'unknown');
});
