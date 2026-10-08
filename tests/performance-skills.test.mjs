import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../content/skill-completion.js', import.meta.url), 'utf8');

async function harness({ skills = [], systemPrompt = '', richText = false } = {}) {
  const listeners = {};
  const metrics = { replacements: 0, previews: 0, lowerNames: 0, beforeReads: 0 };
  const commands = [];
  const inputEvents = [];
  const requests = [];
  let storageChange;
  let host;
  class Element {
    constructor(tag = 'div') {
      this.tag = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.style = {};
      this.isConnected = true; this.offsetWidth = 320; this.rect = { left: 20, top: 400, height: 100 };
    }
    addEventListener() {}
    attachShadow() { this.shadow = new Element(); this.shadow.menu = new Element(); return this.shadow; }
    querySelector() { return this.menu; }
    querySelectorAll() { return this.children.filter(child => child.tag === 'button'); }
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    replaceChildren(...children) { metrics.replacements++; this.children = children; }
    getBoundingClientRect() { return this.rect; }
    closest() { return this === input ? this : null; }
    contains(node) { return node === this || node === textNode; }
    focus() {}
    dispatchEvent(event) { inputEvents.push(event.type); dispatch(event.type); }
  }
  class TextArea extends Element {
    constructor() { super('textarea'); this.value = ''; this.selectionStart = this.selectionEnd = 0; }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    setRangeText(content, start, end) {
      this.value = this.value.slice(0, start) + content + this.value.slice(end);
      this.selectionStart = this.selectionEnd = start + content.length;
    }
  }
  const input = richText ? new Element() : new TextArea();
  input.isContentEditable = richText;
  input.text = '';
  const textNode = { nodeType: 3, parentElement: input, get length() { return input.text.length; } };
  const caret = {
    collapsed: true, startContainer: textNode, startOffset: 0,
    cloneRange() {
      return { start: 0, setStart(node, offset) { this.start = offset; },
        toString() { return input.text.slice(this.start, caret.startOffset); } };
    }
  };
  const selection = { rangeCount: 1, getRangeAt: () => caret, removeAllRanges() {}, addRange() {} };
  const document = {
    activeElement: input,
    documentElement: { appendChild(element) { host = element; } },
    createElement: tag => new Element(tag),
    addEventListener(type, fn) { listeners[type] = fn; },
    createRange() {
      return { selectNodeContents() {}, setEnd() {}, toString() {
        metrics.beforeReads++; return input.text.slice(0, caret.startOffset);
      } };
    },
    createTreeWalker() {
      let visited = false;
      return { currentNode: textNode, nextNode() { if (visited) return false; visited = true; return true; } };
    },
    execCommand(...args) { commands.push(args); return true; }
  };
  const context = vm.createContext({
    document, location: { hostname: 'chatgpt.com' }, HTMLTextAreaElement: TextArea,
    NodeFilter: { SHOW_TEXT: 4 }, Event: class { constructor(type) { this.type = type; } },
    performance, queueMicrotask, innerWidth: 1000, metrics,
    window: { getSelection: () => selection, addEventListener(type, fn) { listeners[type] = fn; } },
    chrome: { runtime: { sendMessage: async message => { requests.push(message); } }, storage: { local: { get: async () => ({ skills }) },
      onChanged: { addListener(fn) { storageChange = fn; } } } },
    cgptLoadSettings: async () => ({ systemPrompt })
  });
  vm.runInContext(`
    const originalReplace = String.prototype.replace;
    String.prototype.replace = function (...args) {
      if (this.length > 1000) metrics.previews++;
      return originalReplace.apply(this, args);
    };
    const originalLower = String.prototype.toLocaleLowerCase;
    String.prototype.toLocaleLowerCase = function (...args) {
      if (this.startsWith('Template-')) metrics.lowerNames++;
      return originalLower.apply(this, args);
    };
  `, context);
  vm.runInContext(source, context);
  await new Promise(setImmediate);
  function dispatch(type, extra = {}) {
    const event = { target: input, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {}, ...extra };
    listeners[type]?.(event);
    return event;
  }
  function draft(value) {
    if (richText) { input.text = value; caret.startOffset = value.length; }
    else { input.value = value; input.selectionStart = input.selectionEnd = value.length; }
    dispatch('input');
  }
  return { input, metrics, commands, inputEvents, requests, context, draft, dispatch,
    get host() { return host; }, get menu() { return host.shadow.menu; },
    change(changes, area) { storageChange(changes, area); } };
}

test('large template previews and normalized names are cached across query changes', async () => {
  const skills = Array.from({ length: 40 }, (_, i) => ({ name: `Template-${i}`, content: 'long template\n'.repeat(2000) }));
  const h = await harness({ skills });
  const loaded = { ...h.metrics };
  assert.ok(loaded.previews >= skills.length);
  assert.ok(loaded.lowerNames >= skills.length);
  for (const query of ['', 't', 'te', 'template', 'template-3']) h.draft(`//${query}`);
  assert.equal(h.metrics.previews, loaded.previews);
  assert.equal(h.metrics.lowerNames, loaded.lowerNames);
  assert.equal(h.menu.children.length, 11);
  assert.equal(h.menu.children[0].children[1].textContent.length, 100);
  h.change({ skills: { newValue: [{ name: 'Template-new', content: 'fresh\ncontent' }] } }, 'local');
  h.draft('//new');
  assert.equal(h.menu.children[0].children[1].textContent, 'fresh content');
});

test('unchanged trigger preserves buttons and keyboard selection while repositioning', async () => {
  const h = await harness({ skills: [{ name: 'First', content: 'one' }, { name: 'Second', content: 'two' }] });
  h.draft('//');
  const second = h.menu.children[1];
  h.dispatch('keydown', { key: 'ArrowDown' });
  const replacements = h.metrics.replacements;
  h.input.rect.top = 500;
  h.dispatch('selectionchange');
  assert.equal(h.metrics.replacements, replacements);
  assert.equal(h.menu.children[1], second);
  assert.equal(second.attributes['aria-selected'], 'true');
  assert.equal(h.host.style.top, '394px');
  h.change({ appendSystemPrompt: { newValue: true } }, 'sync');
  assert.equal(h.metrics.replacements, replacements);
  h.dispatch('keydown', { key: 'Enter' });
  assert.equal(h.input.value, 'two');
  assert.deepEqual(h.inputEvents, ['input']);
});

test('system prompt updates refresh cached previews and insertion content', async () => {
  const h = await harness({ systemPrompt: 'initial\nprompt' });
  h.draft('//system');
  assert.equal(h.menu.children[0].children[1].textContent, 'initial prompt');
  h.change({ systemPrompt: { newValue: 'updated\nprompt' } }, 'sync');
  assert.equal(h.menu.children[0].children[1].textContent, 'updated prompt');
  h.dispatch('keydown', { key: 'Enter' });
  assert.equal(h.input.value, 'updated\nprompt');
});

test('empty system prompt keeps its double-slash entry and opens Settings without deleting the draft', async () => {
  const h = await harness();
  h.draft('//system-prompt');
  assert.equal(h.menu.children[0].children[0].textContent, '//system-prompt');
  assert.match(h.menu.children[0].children[1].textContent, /Settings/);
  h.dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(h.requests.map(request => ({ ...request })), [{ type: 'openChatSprigSettings' }]);
  assert.equal(h.input.value, '//system-prompt');
  assert.deepEqual(h.inputEvents, []);
});

test('rich text trigger reads its preceding range once and retains native insertion', async () => {
  const h = await harness({ richText: true, skills: [{ name: 'Summary', content: 'native\ninsertion' }] });
  h.draft('prefix //Summary');
  assert.equal(h.metrics.beforeReads, 1);
  h.dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(h.commands, [['insertText', false, 'native\ninsertion']]);
});

test('IME hides completion until composition finishes and composing Enter never inserts', async () => {
  const h = await harness({ skills: [{ name: 'Summary', content: 'result' }] });
  h.draft('//');
  h.dispatch('compositionstart');
  assert.equal(h.host.hidden, true);
  h.draft('//Summary');
  h.dispatch('keydown', { key: 'Enter', isComposing: true });
  assert.equal(h.input.value, '//Summary');
  h.dispatch('compositionend');
  assert.equal(h.host.hidden, false);
  h.dispatch('keydown', { key: 'Enter', keyCode: 229 });
  assert.equal(h.input.value, '//Summary');
  h.dispatch('keydown', { key: 'Enter' });
  assert.equal(h.input.value, 'result');
});
