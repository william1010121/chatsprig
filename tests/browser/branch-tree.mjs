// Run with: python3 scripts/test_browser.py branch-tree
// A caller can prefix globalThis.qaSpace / qaPage to reuse its active TaskSpace.
// Uses a synthetic sidebar with both ChatGPT layouts; ChatGPT's API is stubbed.
const fs = await import('node:fs/promises');
const root = globalThis.qaRoot || process.env.CHATSPRIG_ROOT;
if (!root) throw new Error('Run this test with scripts/test_browser.py to supply the checkout path.');
const task = await taskSpace(globalThis.qaSpace || 'ChatSprig branch tree regression');
console.log({ spaceId: task.spaceId });
const page = task.page(globalThis.qaPage || 'p1');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const source = await fs.readFile(`${root}/content/branch-tree.js`, 'utf8');
let html = await fs.readFile(`${root}/tests/fixtures/chatgpt-sidebar.html`, 'utf8');
const shim = `
(function () {
  const id = n => '00000000-0000-4000-8000-0000000000' + n;
  const ids = { parent: id('01'), child: id('02'), grandchild: id('03'), native: id('10'), nativeBranch: id('11'), other: id('20'), oldParent: id('30'), oldChild: id('31') };
  const storage = window.qaStorage = {}, listeners = [];
  const put = (session, branch, chat, extra = {}) => storage['btwBranch:' + session + ':' + branch] =
    { id: branch, session, title: branch, url: 'https://chatgpt.com/c/' + chat, createdAt: 1, state: 'ready', ...extra };
  put(ids.parent, 'b1', ids.child); put(ids.child, 'b2', ids.grandchild); put(ids.oldParent, 'b4', ids.oldChild);
  // Still being created by btw.js: Clean must leave this record alone.
  storage['btwBranch:' + ids.parent + ':b3'] = { id: 'b3', session: ids.parent, title: 'opening', url: 'https://chatgpt.com/branch/' + ids.parent + '/m1', createdAt: Date.now(), state: 'opening' };
  // Looks abandoned, but resolves to a new chat while Clean is deleting: it must survive.
  storage['btwBranch:' + ids.parent + ':b5'] = { id: 'b5', session: ids.parent, title: 'late', url: 'https://chatgpt.com/branch/' + ids.parent + '/m2', createdAt: 1, state: 'opening' };
  // Abandoned for good: Clean removes it.
  storage['btwBranch:' + ids.parent + ':b6'] = { id: 'b6', session: ids.parent, title: 'abandoned', url: 'https://chatgpt.com/branch/' + ids.parent + '/m3', createdAt: 1, state: 'failed' };
  window.qa = { ...ids, fetches: [], assigned: null, confirmed: null, failOnce: ids.grandchild, failLookupOnce: ids.nativeBranch, alerts: [] };
  window.alert = message => qa.alerts.push(message);
  window.cgptCloseBtwChats = chats => { qa.closed = chats; };
  window.chrome = { runtime: { id: 'qa' }, storage: { onChanged: { addListener: fn => listeners.push(fn) }, local: {
    get: async key => key ? { [key]: storage[key] } : { ...storage },
    set: async values => { const changes = {}; for (const [key, value] of Object.entries(values)) { changes[key] = { newValue: value }; storage[key] = value; } listeners.forEach(fn => fn(changes, 'local')); },
    remove: async keys => { const changes = {}; for (const key of keys) { changes[key] = { oldValue: storage[key] }; delete storage[key]; } listeners.forEach(fn => fn(changes, 'local')); }
  } } };
  window.confirm = message => { qa.confirmed = message; return true; };
  // A native branch shares its source's message node IDs.
  const message = time => ({ message: { create_time: time } });
  const conversations = { [ids.native]: { create_time: 1, mapping: { r: {}, m1: message(1.1), m2: message(1.2) } },
    [ids.nativeBranch]: { create_time: 2, mapping: { r: {}, m1: message(1.1), m2: message(1.2), x: message(2.1) } } };
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  window.fetch = async (url, init = {}) => {
    qa.fetches.push({ url, method: init.method || 'GET', auth: init.headers?.Authorization, body: init.body });
    if (url === '/api/auth/session') return reply(200, { accessToken: 'token' });
    const chat = url.split('/').pop();
    if (init.method === 'PATCH') {
      if (qa.failOnce === chat) { qa.failOnce = null; return reply(500, {}); }
      if (qa.resolveLate) {
        qa.resolveLate = false;
        const key = 'btwBranch:' + ids.parent + ':b5';
        await window.chrome.storage.local.set({ [key]: { ...storage[key], url: 'https://chatgpt.com/c/' + id('40'), state: 'ready' } });
      }
      return reply(200, { success: true });
    }
    // A transient error must be retried later, not cached as a settled comparison.
    if (qa.failLookupOnce === chat) { qa.failLookupOnce = null; return reply(500, {}); }
    return conversations[chat] ? reply(200, conversations[chat]) : reply(404, {});
  };
  const location = { hostname: 'chatgpt.com', href: 'https://chatgpt.com/c/' + ids.grandchild, pathname: '/c/' + ids.grandchild, assign: url => qa.assigned = url };
  new Function('location', ${JSON.stringify(source).replace(/</g, '\\u003c')})(location);
})();`;
html = html.replace(/<\/script>\s*$/, `</script><script>${shim.replace(/<\//g, '<\\/')}</script>\n`);
await fs.mkdir(`${root}/draft/branch-tree`, { recursive: true });
const fixture = `${root}/draft/branch-tree/sidebar.html`;
await fs.writeFile(fixture, html);
await page.goto(`file://${fixture}`);
// The native branch is nested only after its message nodes were compared; the first lookup fails.
await page.waitForFunction(() => qa.failLookupOnce === null);
const started = Date.now();
await page.waitForFunction(() => document.querySelector(`a[href="/c/${qa.nativeBranch}"]`).closest('[role="listitem"]').getAttribute('data-chatsprig-depth') === '1', undefined, { timeout: 60000 });
const retriedAfter = Date.now() - started;
console.log({ retriedAfter });
assert(retriedAfter > 20000, 'A failed lookup must back off before retrying');

const layout = await page.evaluate(() => {
  const row = chat => document.querySelector(`a[href="/c/${chat}"]`).closest('[role="listitem"], li');
  const top = chat => Math.round(row(chat).getBoundingClientRect().top);
  const recents = [...document.querySelectorAll('#recents > *')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    .map(item => item.querySelector('a')?.getAttribute('aria-label') || item.className);
  const indent = chat => Math.round(document.querySelector(`a[href="/c/${chat}"]`).getBoundingClientRect().left);
  return { recents, indents: [qa.parent, qa.child, qa.grandchild].map(indent),
    pinned: [qa.oldParent, qa.oldChild].map(top), oldDepth: row(qa.oldChild).getAttribute('data-chatsprig-depth'),
    cached: qaStorage.branchTreeParents?.[qa.nativeBranch]?.parent === qa.native };
});
console.log(layout);
assert(JSON.stringify(layout.recents) === JSON.stringify(['Topic A', 'Side question', 'Follow-up question', 'Other one', 'skeleton', 'Native topic', '分支 · Native topic', 'Other two']),
  'Groups must sit at their topmost member, with unrelated rows and placeholders kept in place');
assert(layout.indents[1] - layout.indents[0] === 14 && layout.indents[2] - layout.indents[1] === 14, 'Each level must indent by 14px');
assert(layout.pinned[1] - layout.pinned[0] === 36 && layout.oldDepth === '1', 'The older ul/li layout must nest too');
assert(layout.cached, 'The inferred parent must be cached');
await page.screenshot({ path: `${root}/draft/branch-tree/tree.png` });

const chipText = () => page.evaluate(() => {
  const host = document.querySelector('#cgpt-helper-branch-clean');
  return host?.style.display === 'block' ? host.shadowRoot.querySelector('button').textContent : null;
});
const hover = async name => page.hover(`loc=css:a[href="/c/${await page.evaluate(key => qa[key], name)}"]`);
// Hovering a leaf offers nothing; hovering the source counts every descendant chat.
await hover('grandchild');
assert(await chipText() === null, 'A leaf must not offer Clean');
await hover('parent');
await page.waitForFunction(() => document.querySelector('#cgpt-helper-branch-clean')?.style.display === 'block');
const chip = await page.evaluate(() => {
  const rect = document.querySelector('#cgpt-helper-branch-clean').getBoundingClientRect();
  const item = document.querySelector(`a[href="/c/${qa.parent}"]`).closest('[role="listitem"]');
  const row = item.getBoundingClientRect(), actions = item.querySelector('button').getBoundingClientRect();
  return { inside: rect.top >= row.top - 1 && rect.bottom <= row.bottom + 1, beforeActions: rect.right <= actions.left };
});
assert(await chipText() === 'Clean · 2' && chip.inside && chip.beforeActions, 'Source must offer Clean · 2 inside its row, left of the native actions');
await page.screenshot({ path: `${root}/draft/branch-tree/clean-hover.png` });

// First attempt: the grandchild delete fails, so every local link must survive.
await page.evaluate(() => document.querySelector('#cgpt-helper-branch-clean').shadowRoot.querySelector('button').click());
await page.waitForFunction(() => qa.alerts.length === 1);
const partial = await page.evaluate(() => ({ keys: Object.keys(qaStorage).filter(key => key.startsWith('btwBranch:')).length, assigned: qa.assigned,
  childHidden: getComputedStyle(document.querySelector(`a[href="/c/${qa.child}"]`).closest('[role="listitem"]')).display }));
console.log({ partial });
assert(partial.keys === 6 && !partial.assigned && partial.childHidden === 'none', 'A partial failure must keep every local link and stay put');
// The retry offers only the survivor, then prunes everything except the opening branch.
await hover('other');
await hover('parent');
await page.waitForFunction(() => document.querySelector('#cgpt-helper-branch-clean')?.style.display === 'block');
assert(await chipText() === 'Clean · 1', 'Retry must count only the surviving branch');
await page.evaluate(() => { qa.fetches = []; qa.resolveLate = true; document.querySelector('#cgpt-helper-branch-clean').shadowRoot.querySelector('button').click(); });
await page.waitForFunction(() => qa.assigned);
const result = await page.evaluate(() => ({
  patches: qa.fetches.filter(item => item.method === 'PATCH'), confirmed: qa.confirmed, assigned: qa.assigned, parent: qa.parent, grandchild: qa.grandchild,
  keys: Object.keys(qaStorage).filter(key => key.startsWith('btwBranch:')).map(key => key.split(':').pop()).sort(), closed: [...qa.closed].sort(), child: qa.child,
  hidden: [qa.child, qa.grandchild].map(chat => getComputedStyle(document.querySelector(`a[href="/c/${chat}"]`).closest('[role="listitem"]')).display),
  parentVisible: getComputedStyle(document.querySelector(`a[href="/c/${qa.parent}"]`).closest('[role="listitem"]')).display
}));
console.log(result);
assert(result.patches.length === 1 && result.patches[0].url.endsWith(result.grandchild) && result.patches[0].auth === 'Bearer token' &&
  result.patches[0].body === '{"is_visible":false}', 'Retry must delete only the surviving branch');
assert(JSON.stringify(result.closed) === JSON.stringify([result.child, result.grandchild].sort()), 'Deleted chats must be closed in the floating window');
assert(/Delete 1 branch chat /.test(result.confirmed), 'Deletion must be confirmed first');
assert(JSON.stringify(result.keys) === '["b3","b4","b5"]', 'Opening, late-resolved and unrelated records remain; abandoned and deleted ones go');
assert(result.hidden.every(display => display === 'none') && result.parentVisible !== 'none', 'Only deleted rows are hidden');
assert(result.assigned === `/c/${result.parent}`, 'Viewing a deleted branch must return to the source');
console.log('branch-tree: ok');
if (!globalThis.qaSpace) await task.finish({ keep: [] });
