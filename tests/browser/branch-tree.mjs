// Run with: python3 scripts/test_browser.py branch-tree
// A caller can prefix globalThis.qaSpace / qaPage to reuse its active TaskSpace.
// Uses the saved real ChatGPT sidebar markup; the remote delete API is stubbed.
const fs = await import('node:fs/promises');
const root = globalThis.qaRoot || process.env.CHATSPRIG_ROOT;
if (!root) throw new Error('Run this test with scripts/test_browser.py to supply the checkout path.');
const task = await taskSpace(globalThis.qaSpace || 'ChatSprig branch tree regression');
console.log({ spaceId: task.spaceId });
const page = task.page(globalThis.qaPage || 'p1');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const source = await fs.readFile(`${root}/content/branch-tree.js`, 'utf8');
let html = await fs.readFile(`${root}/draft/chatgpt-source/page.html`, 'utf8');
html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '');
const shim = `
(function () {
  // Parent, child and grandchild come from the same native list, in scrambled sidebar order.
  const list = [...document.querySelectorAll('ul')].map(ul => [...ul.querySelectorAll(':scope > li > a[data-sidebar-item][href^="/c/"]')])
    .sort((a, b) => b.length - a.length)[0];
  const id = link => link.getAttribute('href').split('/').pop().split('?')[0];
  const [child, , grandchild, , parent] = list.map(id);
  const storage = window.qaStorage = {}, listeners = [];
  const put = (session, branch, chat) => storage['btwBranch:' + session + ':' + branch] =
    { id: branch, session, title: branch, url: 'https://chatgpt.com/c/' + chat, createdAt: 1, state: 'ready' };
  put(parent, 'b1', child); put(child, 'b2', grandchild);
  storage['btwBranch:' + parent + ':b3'] = { id: 'b3', session: parent, title: 'unopened', url: 'https://chatgpt.com/branch/' + parent + '/m1', createdAt: 2, state: 'opening' };
  window.qa = { parent, child, grandchild, fetches: [], assigned: null, confirmed: null };
  window.chrome = { runtime: { id: 'qa' }, storage: { onChanged: { addListener: fn => listeners.push(fn) }, local: {
    get: async key => key ? { [key]: storage[key] } : { ...storage },
    set: async values => { const changes = {}; for (const [key, value] of Object.entries(values)) { changes[key] = { newValue: value }; storage[key] = value; } listeners.forEach(fn => fn(changes, 'local')); },
    remove: async keys => { const changes = {}; for (const key of keys) { changes[key] = { oldValue: storage[key] }; delete storage[key]; } listeners.forEach(fn => fn(changes, 'local')); }
  } } };
  window.confirm = message => { qa.confirmed = message; return true; };
  window.fetch = async (url, init = {}) => {
    qa.fetches.push({ url, method: init.method || 'GET', auth: init.headers?.Authorization, body: init.body });
    return { ok: true, status: 200, json: async () => ({ accessToken: 'token' }) };
  };
  const location = { hostname: 'chatgpt.com', href: 'https://chatgpt.com/c/' + grandchild, pathname: '/c/' + grandchild, assign: url => qa.assigned = url };
  new Function('location', ${JSON.stringify(source).replace(/</g, '\\u003c')})(location);
})();`;
html = html.replace('</body>', `<script>${shim.replace(/<\//g, '<\\/')}<\/script></body>`);
await fs.mkdir(`${root}/draft/branch-tree`, { recursive: true });
const fixture = `${root}/draft/branch-tree/sidebar.html`;
await fs.writeFile(fixture, html);
await page.goto(`file://${fixture}`);
await page.waitForFunction(() => document.querySelector('[data-chatsprig-tree]'));

const layout = await page.evaluate(() => {
  const row = id => document.querySelector(`a[href="/c/${id}"]`).closest('li');
  const box = id => { const { top, bottom } = row(id).getBoundingClientRect(); return { top, bottom }; };
  const link = id => document.querySelector(`a[href="/c/${id}"]`).getBoundingClientRect();
  return { parent: box(qa.parent), child: box(qa.child), grandchild: box(qa.grandchild),
    indent: [link(qa.parent).left, link(qa.child).left, link(qa.grandchild).left] };
});
console.log(layout);
assert(layout.child.top > layout.parent.top && Math.abs(layout.child.top - layout.parent.bottom) < 2, 'Child must sit directly below its parent');
assert(Math.abs(layout.grandchild.top - layout.child.bottom) < 2, 'Grandchild must sit directly below the child');
assert(layout.indent[1] - layout.indent[0] === 14 && layout.indent[2] - layout.indent[1] === 14, 'Each level must indent by 14px');
await page.screenshot({ path: `${root}/draft/branch-tree/tree.png` });

// Hovering a leaf offers nothing; hovering the parent counts every descendant chat.
await page.hover(`loc=css:a[href="/c/${await page.evaluate(() => qa.grandchild)}"]`);
assert(await page.evaluate(() => getComputedStyle(document.querySelector('#cgpt-helper-branch-clean') || document.body).display !== 'block' || !document.querySelector('#cgpt-helper-branch-clean')), 'A leaf must not offer Clean');
await page.hover(`loc=css:a[href="/c/${await page.evaluate(() => qa.parent)}"]`);
await page.waitForFunction(() => document.querySelector('#cgpt-helper-branch-clean')?.style.display === 'block');
const chip = await page.evaluate(() => {
  const host = document.querySelector('#cgpt-helper-branch-clean'), rect = host.getBoundingClientRect();
  const row = document.querySelector(`a[href="/c/${qa.parent}"]`).getBoundingClientRect();
  return { text: host.shadowRoot.querySelector('button').textContent, inside: rect.top >= row.top - 1 && rect.bottom <= row.bottom + 1 && rect.right <= row.right };
});
console.log(chip);
assert(chip.text === 'Clean · 2' && chip.inside, 'Parent must offer Clean · 2 inside its row');
await page.screenshot({ path: `${root}/draft/branch-tree/clean-hover.png` });

await page.evaluate(() => document.querySelector('#cgpt-helper-branch-clean').shadowRoot.querySelector('button').click());
await page.waitForFunction(() => qa.assigned);
const result = await page.evaluate(() => ({
  fetches: qa.fetches, confirmed: qa.confirmed, keys: Object.keys(qaStorage), assigned: qa.assigned, parent: qa.parent,
  hidden: [qa.child, qa.grandchild].map(id => getComputedStyle(document.querySelector(`a[href="/c/${id}"]`).closest('li')).display),
  parentVisible: getComputedStyle(document.querySelector(`a[href="/c/${qa.parent}"]`).closest('li')).display
}));
console.log(result);
const patches = result.fetches.filter(item => item.method === 'PATCH');
assert(patches.length === 2 && patches.every(item => item.auth === 'Bearer token' && item.body === '{"is_visible":false}'), 'Both branch chats must be deleted');
assert(/Delete 2 branch chats/.test(result.confirmed), 'Deletion must be confirmed first');
assert(result.keys.every(key => !key.startsWith('btwBranch:')), 'All branch records under the parent, including unopened ones, must be removed');
assert(result.hidden.every(display => display === 'none') && result.parentVisible !== 'none', 'Only deleted rows are hidden');
assert(result.assigned === `/c/${result.parent}`, 'Viewing a deleted branch must return to the parent');
console.log('branch-tree: ok');
