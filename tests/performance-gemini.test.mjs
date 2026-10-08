import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../content/gemini-frame-helper.js', import.meta.url), 'utf8');
const tick = () => new Promise(setImmediate);

function harness() {
  let receive, runtimeReceive, observer, clock = 0, focusCount = 0, caretMoves = 0;
  let promptAvailable = true, focusAllowed = true;
  const reports = [], queries = [], watches = [];
  const makeChat = (temporary = true) => {
    const node = { isConnected: true, temporary };
    node.classList = { contains() { return node.temporary; } };
    return node;
  };
  let chat = makeChat();
  const input = {
    isConnected: true, isContentEditable: true,
    childNodes: [{ nodeName: 'P', childNodes: [{ nodeName: 'BR' }] }],
    focus() { focusCount++; if (focusAllowed) document.activeElement = this; },
    getClientRects: () => [{}]
  };
  const document = {
    activeElement: null,
    documentElement: { classList: { toggle() {} }, appendChild() {} },
    getElementById: () => null, createElement: () => ({}),
    createRange: () => ({ selectNodeContents() { caretMoves++; }, collapse() {} }),
    execCommand(_command, _ui, text) {
      input.childNodes = [{ nodeName: 'P', childNodes: [{ nodeType: 3, nodeValue: text }] }];
      return true;
    },
    querySelector(selector) {
      queries.push(selector);
      if (selector === 'chat-window.is-temporary-chat') return chat.isConnected && chat.temporary ? chat : null;
      if (selector.startsWith('.ql-editor')) return promptAvailable ? input : null;
      return null;
    }
  };
  const window = {
    self: {}, top: {}, name: 'gemini_helper_overlay_frame',
    parent: { postMessage(data) { reports.push(data); } },
    addEventListener(_type, fn) { receive = fn; },
    getSelection: () => ({ removeAllRanges() {}, addRange() {} })
  };
  vm.runInNewContext(code, {
    window, document, Date: { now: () => clock },
    setTimeout(fn, ms) { clock += ms; queueMicrotask(fn); },
    cgptLoadSettings: async () => ({ geminiModel: 'current' }),
    MutationObserver: class {
      constructor(fn) { observer = fn; }
      observe(target, options) { watches.push({ target, options }); }
      disconnect() {}
    },
    chrome: {
      runtime: { id: 'extension', sendMessage: async () => ({}), onMessage: { addListener(fn) { runtimeReceive = fn; } } },
      storage: { onChanged: { addListener() {} } }
    }
  });
  return {
    reports, queries, watches, input, document, chat: () => chat,
    focusCount: () => focusCount, caretMoves: () => caretMoves,
    promptAvailable(value) { promptAvailable = value; },
    focusAllowed(value) { focusAllowed = value; },
    message(action, requestId, source = window.parent) {
      receive({ source, data: { source: 'cgpt-helper', action, requestId } });
    },
    mutate(records = [{ type: 'childList', target: input }]) { observer(records); },
    replace(temporary) {
      chat.isConnected = false;
      chat = makeChat(temporary);
      observer([{ type: 'childList', target: document.documentElement }]);
    },
    dispatch(message) {
      return new Promise(resolve => {
        if (!runtimeReceive({ provider: 'gemini', ...message }, { id: 'extension' }, resolve)) resolve(undefined);
      });
    }
  };
}

test('Gemini focuses ready input synchronously, acknowledges the request, and preserves an existing caret', async () => {
  const h = harness(); await tick();
  h.message('focusPrompt', 1);
  assert.equal(h.focusCount(), 1);
  assert.equal(h.caretMoves(), 1);
  assert.equal(h.reports.at(-1).action, 'focusPromptResult');
  assert.equal(h.reports.at(-1).requestId, 1);
  assert.equal(h.reports.at(-1).focused, true);
  h.message('focusPrompt', 2);
  assert.equal(h.focusCount(), 1);
  assert.equal(h.caretMoves(), 1);
  assert.equal(h.reports.at(-1).requestId, 2);
  const reportCount = h.reports.length;
  h.message('focusPrompt', 3, {});
  assert.equal(h.reports.length, reportCount);
});

test('Gemini does not acknowledge or move the caret when focus fails, and retries the pending request', async () => {
  const h = harness(); await tick();
  h.focusAllowed(false);
  h.message('focusPrompt', 1);
  assert.equal(h.caretMoves(), 0);
  assert.equal(h.reports.some(report => report.action === 'focusPromptResult'), false);
  h.focusAllowed(true);
  h.mutate();
  assert.equal(h.caretMoves(), 1);
  assert.equal(h.reports.at(-1).requestId, 1);
});

test('pending Gemini focus survives initialization and matching cancellation prevents later focus', async () => {
  const pending = harness();
  pending.message('focusPrompt', 1);
  await tick();
  assert.equal(pending.focusCount(), 1);
  assert.equal(pending.reports.at(-1).requestId, 1);

  const cancelled = harness();
  cancelled.message('focusPrompt', 2);
  cancelled.message('cancelFocusPrompt', 2);
  await tick();
  assert.equal(cancelled.focusCount(), 0);

  const delayed = harness(); await tick();
  delayed.promptAvailable(false);
  delayed.message('focusPrompt', 3);
  delayed.message('cancelFocusPrompt', 2);
  delayed.promptAvailable(true); delayed.mutate();
  assert.equal(delayed.focusCount(), 1);
  assert.equal(delayed.reports.at(-1).requestId, 3);

  delayed.document.activeElement = null;
  delayed.promptAvailable(false); delayed.message('focusPrompt', 4);
  delayed.message('cancelFocusPrompt');
  delayed.promptAvailable(true); delayed.mutate();
  assert.equal(delayed.focusCount(), 1);
});

test('Gemini streamed mutations perform no document queries and watch class changes only on the chat window', async () => {
  const h = harness(); await tick();
  const initialQueries = h.queries.length;
  for (let i = 0; i < 1000; i++) h.mutate();
  assert.equal(h.queries.length, initialQueries);
  assert.equal(h.watches.length, 2);
  assert.equal(h.watches[0].options.attributes, undefined);
  assert.equal(h.watches[1].target, h.chat());
  assert.equal(h.watches[1].options.attributes, true);
  assert.equal(h.watches[1].options.subtree, undefined);
  h.chat().temporary = false;
  assert.equal((await h.dispatch({ type: 'sidebarProbe' })).ready, false);
  h.mutate([{ type: 'attributes', target: h.chat() }]);
  assert.equal(h.reports.at(-1).ready, false);
  assert.match(h.reports.at(-1).error, /left temporary mode/);
  assert.match((await h.dispatch({ type: 'sidebarFill', id: 'revoked', text: 'do not send' })).message, /not ready/);
});

test('Gemini chat replacement rechecks temporary mode and retains fail-closed revocation', async () => {
  const h = harness(); await tick();
  const before = h.queries.length;
  h.replace(true);
  assert.equal(h.queries.length, before + 1);
  assert.equal((await h.dispatch({ type: 'sidebarProbe' })).ready, true);
  h.replace(false);
  assert.equal(h.reports.at(-1).ready, false);
  assert.equal((await h.dispatch({ type: 'sidebarProbe' })).ready, false);
});

test('Gemini selection filling clears pending focus and ignores focus requests while verifying the draft', async () => {
  const h = harness(); await tick();
  h.promptAvailable(false);
  h.message('focusPrompt', 7);
  h.promptAvailable(true);
  const filling = h.dispatch({ type: 'sidebarFill', id: 'fill', text: 'selected text', autoSend: false });
  h.document.activeElement = null;
  h.message('focusPrompt', 8);
  h.mutate();
  await filling;
  h.mutate();
  assert.equal(h.focusCount(), 1);
  assert.equal(h.reports.some(report => report.action === 'focusPromptResult'), false);
});
