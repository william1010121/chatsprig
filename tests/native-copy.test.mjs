import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../content/native-copy.js', import.meta.url), 'utf8');
function harness(via) {
  let request;
  const results = [], writes = [];
  const text = 'Complete reply\n\n| header |\n| --- |\n\n\\[x^2\\]';
  const clipboard = { write: value => writes.push(value), writeText: value => writes.push(value) };
  const originalWrite = clipboard.write, originalWriteText = clipboard.writeText;
  const execCommand = () => false;
  const document = { activeElement: { value: text }, execCommand,
    addEventListener(_type, fn) { request = fn; }, dispatchEvent(event) { results.push(JSON.parse(event.detail)); } };
  let copied = via === 'copied';
  class Button {
    getAttribute() { return copied ? 'Copied' : 'Copy'; }
    matches() { return true; } closest() { return null; }
    click() {
      if (via === 'write') return clipboard.write([{ types: ['text/plain', 'text/html'], getType: async () => new Blob([text]) }]);
      if (via === 'writeText' || via === 'copied') return clipboard.writeText(text);
      if (via === 'exec') return document.execCommand('copy');
      if (via === 'throws') throw new Error('failed');
    }
  }
  vm.runInNewContext(source, { setTimeout(fn) { copied = false; fn(); }, document, navigator: { clipboard }, HTMLButtonElement: Button,
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } } });
  return { results, writes, clipboard, document, originalWrite, originalWriteText, execCommand, text,
    copy: () => request({ target: new Button(), detail: JSON.stringify({ id: 'copy-1' }) }) };
}
test('native Copy payload is captured verbatim through ClipboardItem, writeText and legacy copy', async () => {
  for (const via of ['write', 'writeText', 'exec', 'copied']) {
    const h = harness(via); await h.copy();
    assert.equal(h.results[0].text, h.text);
    assert.equal(h.results[0].id, 'copy-1');
    assert.equal(h.writes.length, 0, 'does not overwrite the user clipboard');
    assert.equal(h.clipboard.write, h.originalWrite);
    assert.equal(h.clipboard.writeText, h.originalWriteText);
    assert.equal(h.document.execCommand, h.execCommand);
  }
});
test('failed or missing native copy restores APIs and reports failure', async () => {
  for (const via of ['throws', 'missing']) {
    const h = harness(via); await h.copy();
    assert.ok(h.results[0].error);
    assert.equal(h.clipboard.write, h.originalWrite);
    assert.equal(h.document.execCommand, h.execCommand);
  }
});
