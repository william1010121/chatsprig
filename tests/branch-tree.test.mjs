import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function helpers() {
  // A subframe exposes only the pure helpers and never touches the DOM.
  const context = vm.createContext({ window: { top: {}, self: {} }, location: { hostname: 'chatgpt.com' }, URL });
  vm.runInContext(read('content/branch-tree.js'), context);
  return context.cgptBranchTree;
}
const record = (session, id, chat) => [`btwBranch:${session}:${id}`, { session, id, title: id, url: chat ? `https://chatgpt.com/c/${chat}` : `https://chatgpt.com/branch/${session}/m1`, createdAt: 1, state: chat ? 'ready' : 'opening' }];

test('manifest loads the branch tree in ChatGPT frames after BTW', () => {
  const entry = JSON.parse(read('manifest.json')).content_scripts.find(item => item.js.includes('content/branch-tree.js'));
  assert.ok(entry.js.indexOf('content/branch-tree.js') > entry.js.indexOf('content/btw.js'));
  assert.deepEqual(entry.matches, ['https://chatgpt.com/*', 'https://chat.openai.com/*']);
});

test('descendants include branches of branches, unopened records, and survive cycles', () => {
  const { branchIndex, descendants } = helpers();
  const index = branchIndex(Object.fromEntries([
    record('root', 'b1', 'child'), record('child', 'b2', 'grandchild'), record('root', 'b3', null),
    record('grandchild', 'b4', 'root'), record('other', 'b5', 'unrelated'),
    ['btwBranch:root:forged', { session: 'elsewhere', id: 'forged', url: 'https://chatgpt.com/c/x' }], ['unrelated', { session: 'root' }]
  ]));
  const result = descendants(index, 'root');
  assert.deepEqual([...result.chats], ['child', 'grandchild']);
  assert.deepEqual([...result.keys].sort(), ['btwBranch:child:b2', 'btwBranch:grandchild:b4', 'btwBranch:root:b1', 'btwBranch:root:b3']);
  assert.deepEqual([...descendants(index, 'nobody').keys], []);
});

test('arrange nests children under parents at the group\'s topmost position', () => {
  const { arrange } = helpers();
  const rows = ['newBranch', 'a', 'b', 'parent', 'nested', 'c'].map(id => ({ id }));
  const parentOf = new Map([['newBranch', 'parent'], ['nested', 'newBranch'], ['orphan', 'missing']]);
  const out = [...arrange(rows, parentOf)].map(({ id, depth }) => `${id}:${depth}`);
  assert.deepEqual(out, ['parent:0', 'newBranch:1', 'nested:2', 'a:0', 'b:0', 'c:0']);
});

test('arrange keeps cyclic rows visible instead of dropping them', () => {
  const { arrange } = helpers();
  const out = arrange([{ id: 'x' }, { id: 'y' }], new Map([['x', 'y'], ['y', 'x']]));
  assert.deepEqual([...out].map(row => row.id).sort(), ['x', 'y']);
});

test('native branch titles reduce to the source title', () => {
  const { baseTitle } = helpers();
  assert.equal(baseTitle('分支 · 空戰記憶策略建議'), '空戰記憶策略建議');
  assert.equal(baseTitle('Branch · 分支 · Topic'), 'Topic');
  assert.equal(baseTitle('  Plain title '), 'Plain title');
});

test('pickParent chooses the older chat sharing the most copied message nodes', () => {
  const { pickParent } = helpers();
  const chat = (id, created, nodes) => ({ id, created, nodes: new Set(nodes) });
  const parent = chat('parent', 1, ['a', 'b', 'c', 'd']);
  const sibling = chat('sibling', 2, ['a', 'b', 's1']);
  const child = chat('child', 3, ['a', 'b', 'c', 'd', 'x']);
  const later = chat('later', 4, ['a', 'b', 'c', 'd', 'x', 'y']);
  assert.equal(pickParent(child, [sibling, parent, later]), 'parent');
  // A branch of a branch shares more with its direct source than with the original.
  assert.equal(pickParent(chat('grandchild', 5, ['a', 'b', 'c', 'd', 'x', 'g']), [parent, child, sibling]), 'child');
  // Equal overlap goes to the original (oldest) conversation.
  assert.equal(pickParent(chat('twin', 6, ['a', 'b', 't']), [sibling, parent]), 'parent');
  assert.equal(pickParent(chat('unrelated', 9, ['z']), [parent]), null);
});

test('pickParent skips an older sibling that shares only copied messages', () => {
  const { pickParent } = helpers();
  const chat = (id, created, nodes, own) => ({ id, created, nodes: new Set(nodes), own: new Set(own) });
  const sibling = chat('sibling', 2, ['a', 'b', 's1'], ['s1']);
  const child = chat('child', 3, ['a', 'b', 'x'], ['x']);
  // Without the source loaded, the sibling (overlap a, b) must not be chosen.
  assert.equal(pickParent(child, [sibling]), null);
  assert.equal(pickParent(child, [sibling, chat('source', 1, ['a', 'b', 'c'], ['a', 'b', 'c'])]), 'source');
  assert.equal(pickParent(chat('nested', 4, ['a', 'b', 's1', 'n'], ['n']), [sibling]), 'sibling');
});

test('inferred native branches join the tree but never duplicate /btw records', () => {
  const { branchIndex, descendants } = helpers();
  const index = branchIndex(Object.fromEntries([
    record('root', 'b1', 'child'),
    ['branchParent:child', { parent: 'elsewhere' }], ['branchParent:native', { parent: 'root', candidates: ['root'] }],
    ['branchParent:nested', { parent: 'native' }], ['branchParent:self', { parent: 'self' }], ['branchParent:bad', { parent: 'x/y' }], ['branchParent:empty', { parent: null }]
  ]));
  const result = descendants(index, 'root');
  assert.deepEqual([...result.chats].sort(), ['child', 'native', 'nested']);
  assert.deepEqual([...result.keys], ['btwBranch:root:b1']);
  assert.deepEqual([...descendants(index, 'elsewhere').chats], []);
});

test('recently opening /btw records stay owned by btw.js; abandoned ones do not', () => {
  const { branchIndex } = helpers();
  const [key, branch] = record('root', 'b1', null);
  const fresh = branchIndex({ [key]: { ...branch, createdAt: 1000 } }, 1000 + 60_000).get('root')[0];
  const stale = branchIndex({ [key]: { ...branch, createdAt: 1000 } }, 1000 + 11 * 60_000).get('root')[0];
  assert.equal(fresh.opening, true);
  assert.equal(stale.opening, false);
});

test('linkTree lists plain links for a chat and every branch below it, indented by level', () => {
  const { branchIndex, linkTree } = helpers();
  const index = branchIndex(Object.fromEntries([
    record('root', 'b1', 'child'), record('child', 'b2', 'grandchild'), record('root', 'b3', null),
    record('root', 'b4', 'sibling'), record('grandchild', 'b5', 'root'), record('other', 'b6', 'unrelated'),
    ['branchParent:native', { parent: 'child' }], ['branchParent:gone', { parent: 'root' }]
  ]));
  const titles = { root: 'Trip  plan', child: 'Hotels', native: 'Branch · Trip plan' };
  const { text, count } = linkTree(index, 'root', id => titles[id] || '', id => id === 'gone');
  assert.equal(text, [
    '- Trip plan — https://chatgpt.com/c/root',
    '  - Hotels — https://chatgpt.com/c/child',
    '    - https://chatgpt.com/c/grandchild',
    '    - Branch · Trip plan — https://chatgpt.com/c/native',
    '  - https://chatgpt.com/c/sibling'
  ].join('\n'));
  assert.equal(count, 5);
  assert.equal(linkTree(index, 'lonely').text, '- https://chatgpt.com/c/lonely');
  // A partly failed Clean keeps a deleted branch's records so a surviving child stays reachable.
  assert.equal(linkTree(index, 'root', () => '', id => id === 'child' || id === 'gone').text, [
    '- https://chatgpt.com/c/root',
    '  - https://chatgpt.com/c/grandchild',
    '  - https://chatgpt.com/c/native',
    '  - https://chatgpt.com/c/sibling'
  ].join('\n'));
});
