import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

class Element {
  constructor() { this.children = []; this.listeners = {}; this.attributes = {}; this.value = ''; this.textContent = ''; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  replaceChildren(...children) { this.children = children; }
  click() { return this.listeners.click?.(); }
  focus() {}
  reset() { this.resetFields?.(); }
}

test('options page adds, edits, and deletes local skills; reserved and duplicate names are rejected', async () => {
  const html = read('options/options.html');
  for (const id of ['skill-list', 'skill-form', 'skill-name', 'skill-content', 'skill-save', 'skill-cancel', 'skill-status']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  const elements = Object.fromEntries(['skill-list', 'skill-form', 'skill-name', 'skill-content', 'skill-save', 'skill-cancel', 'skill-status']
    .map(id => [id, new Element()]));
  elements['skill-form'].resetFields = () => {
    elements['skill-name'].value = '';
    elements['skill-content'].value = '';
  };
  const saved = [];
  vm.runInNewContext(read('options/skills.js'), {
    document: { getElementById: id => elements[id], createElement: () => new Element() },
    chrome: { storage: { local: {
      get: async () => ({ skills: [] }),
      set: async value => saved.push(value.skills)
    }, onChanged: { addListener() {} } } }
  });
  await tick();
  const name = elements['skill-name'];
  const content = elements['skill-content'];
  async function submit() { await elements['skill-form'].listeners.submit({ preventDefault() {} }); }
  name.value = 'system-prompt'; content.value = 'bad'; await submit();
  assert.equal(saved.length, 0);
  name.value = 'Summary'; content.value = 'First\nsecond'; await submit();
  assert.deepEqual(JSON.parse(JSON.stringify(saved.at(-1))), [{ name: 'Summary', content: 'First\nsecond' }]);
  name.value = 'summary'; content.value = 'Duplicate'; await submit();
  assert.equal(saved.length, 1);
  const firstRow = elements['skill-list'].children[0];
  firstRow.children[1].children[0].click();
  name.value = 'Brief'; content.value = 'Updated'; await submit();
  assert.deepEqual(JSON.parse(JSON.stringify(saved.at(-1))), [{ name: 'Brief', content: 'Updated' }]);
  await elements['skill-list'].children[0].children[1].children[1].click();
  assert.deepEqual(JSON.parse(JSON.stringify(saved.at(-1))), []);
});

test('skill completion loads before ChatGPT send interception and in both providers', () => {
  const manifest = JSON.parse(read('manifest.json'));
  for (const provider of ['content/system-prompt.js', 'content/gemini-frame-helper.js']) {
    const entry = manifest.content_scripts.find(item => item.js.includes(provider));
    assert.ok(entry.js.indexOf('content/skill-completion.js') < entry.js.indexOf(provider));
  }
  assert.match(read('content/system-prompt.js'), /event\.defaultPrevented/);
});
