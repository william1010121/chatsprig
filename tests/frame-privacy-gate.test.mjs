import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../content/frame-privacy-gate.js', import.meta.url), 'utf8');
function load(name, top = false, root = { inert: false }) {
  const listeners = new Map();
  const window = { name, addEventListener(type, fn, options) { listeners.set(type, { fn, options }); } };
  window.self = window; window.top = top ? window : {};
  const document = { documentElement: root };
  const observers = [];
  vm.runInNewContext(source, { window, document, MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} disconnect() {} } });
  return { window, listeners, document, flush: () => observers.forEach(fn => fn()) };
}
test('privacy gate installs at document_start for every guarded provider', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url)));
  const entry = manifest.content_scripts.find(item => item.js.includes('content/frame-privacy-gate.js'));
  assert.equal(entry.run_at, 'document_start');
  assert.equal(entry.all_frames, true);
  assert.notEqual(entry.world, 'MAIN', 'The page must not be able to release the isolated gate');
  assert.deepEqual(entry.matches, ['https://gemini.google.com/*', 'https://claude.ai/*', 'https://grok.com/*']);
});
test('only extension-owned provider frames block trusted input until local confirmation', () => {
  for (const name of ['gemini_helper_overlay_frame', 'chatsprig_claude_frame', 'chatsprig_grok_frame']) {
    const { window, listeners } = load(name);
    assert.deepEqual([...listeners.keys()], ['keydown', 'keypress', 'keyup', 'compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input', 'focusin', 'paste', 'cut', 'drop', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'submit']);
    for (const [type, { fn, options }] of listeners) {
      assert.equal(options.capture, true); assert.equal(options.passive, false);
      const fire = isTrusted => { let blocked = 0; fn({ isTrusted, preventDefault() { blocked++; }, stopImmediatePropagation() { blocked++; } }); return blocked; };
      assert.equal(fire(true), 2, type);
      assert.equal(fire(false), 0, 'Synthetic provider private-mode initialization remains possible');
      window.cgptSetFramePrivacyReady(true);
      assert.equal(fire(true), 0, type);
      window.cgptSetFramePrivacyReady(false);
      assert.equal(fire(true), 2, type);
    }
  }
  assert.equal(load('chatsprig_claude_frame', true).listeners.size, 0);
  assert.equal(load('unrelated-frame').listeners.size, 0);
  assert.equal(load('cgpt_helper_overlay_frame').listeners.size, 0);
});
test('a new document fails closed independently of the previous document', () => {
  const old = load('chatsprig_grok_frame'), current = load('chatsprig_grok_frame');
  old.window.cgptSetFramePrivacyReady(true);
  let blocked = false;
  current.listeners.get('keydown').fn({ isTrusted: true, preventDefault() { blocked = true; }, stopImmediatePropagation() {} });
  assert.equal(blocked, true);
});

test('trusted events revalidate current privacy state without waiting for helper polling', () => {
  const { window, listeners } = load('chatsprig_grok_frame');
  let privateMode = true, blocked = 0;
  window.cgptSetFramePrivacyReady(true, () => privateMode);
  const fire = () => listeners.get('beforeinput').fn({ isTrusted: true, preventDefault() { blocked++; }, stopImmediatePropagation() {} });
  fire(); assert.equal(blocked, 0);
  privateMode = false; fire(); assert.equal(blocked, 1);
  window.cgptSetFramePrivacyReady(true, () => { throw new Error('navigation'); });
  fire(); assert.equal(blocked, 2);
});

test('root lock handles early injection, hydration, replacement and restoration', () => {
  const h = load('gemini_helper_overlay_frame', false, null);
  const first = h.document.documentElement = { inert: false };
  h.flush(); assert.equal(first.inert, true, 'late html must lock');
  first.inert = false; h.flush(); assert.equal(first.inert, true, 'hydration must not remove gate');
  const next = h.document.documentElement = { inert: false };
  h.flush(); assert.equal(first.inert, false, 'detached root must not retain owned lock');
  assert.equal(next.inert, true);
  h.window.cgptSetFramePrivacyReady(true);
  assert.equal(next.inert, false);
  h.document.documentElement = first; h.flush(); assert.equal(first.inert, false);
});
test('release preserves provider-owned inert and existing draft state', () => {
  const root = { inert: true, draft: 'untouched' };
  const h = load('chatsprig_claude_frame', false, root);
  h.window.cgptSetFramePrivacyReady(true);
  assert.equal(root.inert, true);
  assert.equal(root.draft, 'untouched');
});
