import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../content/system-prompt.js', import.meta.url), 'utf8');
async function harness({ enabled = true, prompt = '使用繁體中文\n保持簡潔', history = false, path = '/', draft = '第一個問題', gemini = false, disabled = false, count = history ? 1 : 0, interval = 0, mode = 'chat', complete = !path.includes('/c/'), branch = 'original' } = {}) {
  const listeners = {};
  const timers = [];
  const sent = [];
  let change;
  let revision = 0;
  class TextArea {
    constructor() { this._value = draft; this.isConnected = true; }
    get value() { return this._value; }
    set value(value) { this._value = value; }
    focus() {}
    dispatchEvent() {}
    contains(node) { return node === this; }
  }
  const input = new TextArea();
  const button = { disabled, getAttribute() { return null; }, closest() { return this; }, click() { dispatch('click', { target: button }); } };
  const location = { hostname: gemini ? 'gemini.google.com' : 'chatgpt.com', pathname: path, href: path };
  function dispatch(type, overrides = {}) {
    const event = { type, target: input, key: 'Enter', defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() {}, ...overrides };
    listeners[type]?.(event);
    if (!event.defaultPrevented) sent.push(input.value);
    return event;
  }
  vm.runInNewContext(source, {
    location, HTMLTextAreaElement: TextArea, Event: class {},
    cgptLoadSettings: async () => ({ appendSystemPrompt: enabled, systemPrompt: prompt, systemPromptInterval: interval }),
    chrome: { storage: { onChanged: { addListener(fn) { change = fn; } } } },
    cgptChatContext: { getMode: () => mode, getHistory: () => complete ? { count, key: `${branch}:${count}` } : null, get revision() { return revision; } },
    window: { addEventListener(type, fn) { listeners[type] = fn; } },
    setTimeout(fn) { timers.push(fn); },
    document: { querySelector(selector) {
      if (selector.includes('conversation-turn') || selector === 'user-query, model-response') return history ? {} : null;
      if (selector.includes('send-button')) return button;
      return input;
    } }
  });
  await Promise.resolve();
  return { input, sent, button, location, dispatch, setHistory(value) { count = value ? 1 : 0; },
    setCount(value) { count = value; },
    setBranch(value) { branch = value; },
    setMode(value) { mode = value; revision++; },
    change(values) { change(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), 'sync'); },
    flush() { while (timers.length) timers.shift()(); } };
}
test('first click, Enter and form submit prepend multiline instructions, then send exactly once', async () => {
  for (const type of ['click', 'keydown', 'submit']) {
    const h = await harness();
    const target = type === 'click' ? h.button : type === 'submit' ? { contains: () => true } : h.input;
    h.dispatch(type, { target });
    assert.equal(h.sent.length, 0);
    h.flush();
    assert.deepEqual(h.sent, ['使用繁體中文\n保持簡潔\n\n第一個問題']);
    h.setHistory(true);
    h.input.value = '第二個問題';
    h.button.click();
    assert.equal(h.sent[1], '第二個問題');
  }
});
test('disabled, empty instructions and existing or loading conversations remain unchanged', async () => {
  for (const options of [{ enabled: false }, { prompt: '  ' }, { history: true }, { path: '/c/existing' }, { gemini: true, path: '/app/existing' }]) {
    const h = await harness(options);
    h.button.click(); h.flush();
    assert.deepEqual(h.sent, ['第一個問題']);
  }
});
test('IME, modified Enter and unrelated clicks never prepend', async () => {
  for (const extra of [{ isComposing: true }, { keyCode: 229 }, { shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
    const h = await harness(); h.dispatch('keydown', extra); h.flush();
    assert.equal(h.input.value, '第一個問題');
  }
  const h = await harness(); h.dispatch('click', { target: { closest: () => null } });
  assert.equal(h.input.value, '第一個問題');
});
test('rapid double click and retry do not duplicate instructions', async () => {
  const h = await harness(); h.button.click(); h.button.click(); h.flush();
  assert.equal(h.sent.length, 1);
  h.button.click(); h.flush();
  assert.equal(h.sent[1], h.sent[0]);
});
test('navigation, removal, disabled send or edited drafts cancel deferred submission', async () => {
  for (const mutate of [h => { h.location.href = '/c/other'; }, h => { h.input.isConnected = false; }, h => { h.input.value += 'edited'; }, h => { h.button.disabled = true; }]) {
    const h = await harness(); h.button.click(); mutate(h); h.flush();
    assert.equal(h.sent.length, 0);
  }
});
test('synced setting changes apply to the next send and new chats', async () => {
  const h = await harness({ enabled: false });
  h.change({ appendSystemPrompt: true, systemPrompt: '新的風格' });
  h.button.click(); h.flush();
  assert.deepEqual(h.sent, ['新的風格\n\n第一個問題']);
  h.setHistory(true); h.input.value = '第二則'; h.button.click();
  h.setHistory(false); h.input.value = '新對話'; h.button.click(); h.flush();
  assert.equal(h.sent[2], '新的風格\n\n新對話');
});

test('k = 0, 1, 3 attaches at the correct user-message positions in loaded conversations', async () => {
  for (const interval of [0, 1, 3]) {
    const h = await harness({ interval, path: '/c/loaded', complete: true });
    for (let count = 0; count < 10; count++) {
      h.setCount(count); h.input.value = `message ${count + 1}`;
      h.button.click(); h.flush();
      const expected = count === 0 || (interval > 0 && count % interval === 0);
      assert.equal(h.sent.at(-1).startsWith('使用繁體中文'), expected, `k=${interval}, count=${count}`);
    }
  }
});
test('Work, unknown and Gemini never append, even with repeat-every-message enabled', async () => {
  for (const options of [{ mode: 'work' }, { mode: 'unknown' }, { gemini: true }]) {
    const h = await harness({ interval: 1, ...options }); h.button.click(); h.flush();
    assert.deepEqual(h.sent, ['第一個問題']);
  }
});
test('mode, branch, history or preference changes cancel and remove an untouched insertion', async () => {
  for (const change of [
    h => h.setMode('work'), h => h.setMode('unknown'),
    h => { h.setMode('work'); h.setMode('chat'); },
    h => h.setBranch('other'), h => h.setCount(1),
    h => h.change({ appendSystemPrompt: false }), h => h.change({ systemPrompt: 'changed' })
  ]) {
    const h = await harness(); h.button.click(); change(h); h.flush();
    assert.equal(h.sent.length, 0); assert.equal(h.input.value, '第一個問題');
  }
});
test('interval changes recalculate from the conversation start; failed attempts do not advance', async () => {
  const h = await harness({ count: 3, interval: 2 });
  h.change({ systemPromptInterval: 3 }); h.button.click(); h.flush();
  assert.match(h.sent.at(-1), /^使用繁體中文/);
  h.input.value = 'retry'; h.button.click(); h.flush();
  assert.match(h.sent.at(-1), /^使用繁體中文/);
  h.setCount(4); h.input.value = 'next'; h.button.click(); h.flush();
  assert.equal(h.sent.at(-1), 'next');
});
test('invalid synced intervals and incomplete history do not append', async () => {
  for (const interval of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '3']) {
    const h = await harness({ interval }); h.button.click(); h.flush();
    assert.deepEqual(h.sent, ['第一個問題']);
  }
  const h = await harness({ interval: 1, complete: false }); h.button.click(); h.flush();
  assert.deepEqual(h.sent, ['第一個問題']);
});
test('cancelling a switched-mode send preserves user edits made after insertion', async () => {
  const h = await harness(); h.button.click(); h.input.value += ' edited';
  const edited = h.input.value; h.setMode('work'); h.flush();
  assert.equal(h.sent.length, 0); assert.equal(h.input.value, edited);
});
