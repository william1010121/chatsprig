// Run with: ego-browser nodejs < tests/browser/compact-margins.mjs
// A caller can prefix globalThis.qaSpace / qaPage to reuse its active TaskSpace.
const fs = await import('node:fs/promises');
const root = process.env.CHATSPRIG_ROOT || '/Users/guoshengwei/Project/chatgpt-extension';
const task = await taskSpace(globalThis.qaSpace || 'ChatSprig compact margins regression');
console.log({ spaceId: task.spaceId });
const page = task.page(globalThis.qaPage || 'p1');
const source = await fs.readFile(`${root}/content/compact-view.js`, 'utf8');
const html = `<!doctype html><meta charset="utf-8"><title>Compact margins regression</title>
<style>
* { box-sizing: border-box; } body { margin: 0; font: 16px system-ui; }
#thread { width: 1200px; }
[data-thread-user-message-navigation-content] { width: 100%; max-width: 808px; margin-inline: auto; padding-inline: 20px; }
[data-dil-message-id] { display: flex; flex-direction: column; }
[data-d-component="box"] { padding: 12px; border: 1px solid #aaa; }
form[data-chatgpt-composer] { width: 768px; margin-inline: auto; }
[role="menu"] { position: fixed; right: 0; top: 0; }
</style>
<div id="thread">
  <div data-thread-user-message-navigation-content>
    <div data-markdown-text-style="assistant-message"><div data-dil-message-id="answer">
      <p id="text">Ordinary prose before an interactive form.</p>
      <ul id="list"><li>Ordinary list text</li></ul>
      <div id="card" data-d-component="box"><form>
        <label>Interactive UI <input type="radio" name="choice"></label>
        <p id="card-text">Card typography stays native.</p>
      </form></div>
      <p id="after">Ordinary prose after the interactive form.</p>
    </div></div>
  </div>
  <form data-chatgpt-composer><textarea placeholder="Native composer"></textarea></form>
</div>
<div role="menu"><div data-model-picker-view></div></div>
<script>
window.cgptLoadSettings = async () => ({compactView:true, compactSideMargin:12});
window.chrome = {storage:{sync:{set:async () => {}},onChanged:{addListener() {}}}};
const script = document.createElement('script');
script.textContent = ${JSON.stringify(source).replace(/</g, '\\u003c')};
document.body.appendChild(script);
</script>`;
await fs.mkdir(`${root}/draft/compact-margins`, { recursive: true });
const fixture = `${root}/draft/compact-margins/regression.html`;
await fs.writeFile(fixture, html);
await page.goto(`file://${fixture}`);
await page.waitForSelector('#cgpt-helper-compact-settings');
await page.click('#cgpt-helper-compact-settings');
const results = await page.evaluate(() => {
  const slider = document.querySelector('#cgpt-helper-side-margin');
  const width = selector => document.querySelector(selector).getBoundingClientRect().width;
  const measure = () => Object.fromEntries(['#text', '#list', '#after', '#card', 'form[data-chatgpt-composer]'].map(s => [s, width(s)]));
  const sizes = ['0', '12', '25'].map(value => {
    slider.value = value;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    return { margin: Number(value), ...measure() };
  });
  const wrapper = document.querySelector('[data-thread-user-message-navigation-content]');
  const composer = document.querySelector('form[data-chatgpt-composer]');
  // All supported native composers remain protected when inside this wrapper.
  document.documentElement.classList.remove('cgpt-helper-compact');
  wrapper.appendChild(composer);
  const native = measure();
  document.documentElement.classList.add('cgpt-helper-compact');
  const nestedComposers = ['data-chatgpt-composer', 'data-type', 'data-thread-find-composer'].map(attribute => {
    composer.removeAttribute('data-chatgpt-composer');
    composer.removeAttribute('data-type');
    composer.removeAttribute('data-thread-find-composer');
    composer.setAttribute(attribute, attribute === 'data-type' ? 'unified-composer' : 'true');
    return { attribute, text: width('#text'), padding: getComputedStyle(wrapper).paddingInline };
  });
  document.documentElement.classList.remove('cgpt-helper-compact');
  return { sizes, native, nestedComposers, cardLineHeight: getComputedStyle(document.querySelector('#card-text')).lineHeight };
});
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const near = (a, b) => Math.abs(a - b) < 1;
for (const selector of ['#text', '#list', '#after']) {
  assert(near(results.sizes[0][selector], 1200), `${selector} must expand at 0%`);
  assert(near(results.sizes[1][selector], 912), `${selector} must respond to 12%`);
  assert(near(results.sizes[2][selector], 600), `${selector} must respond to 25%`);
  assert(near(results.native[selector], 768), `${selector} must return to native width when disabled`);
}
for (const size of results.sizes) {
  assert(near(size['#card'], 768), 'Interactive card width must stay native');
  assert(near(size['form[data-chatgpt-composer]'], 768), 'Native composer width must stay native');
}
for (const composer of results.nestedComposers) {
  assert(near(composer.text, 768) && composer.padding === '20px', `${composer.attribute} must protect the native composer wrapper`);
}
console.log({ passed: true, ...results });
if (!globalThis.qaSpace) await task.finish({ keep: [] });
