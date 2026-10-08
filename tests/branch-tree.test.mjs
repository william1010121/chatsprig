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

test('inferred native branches join the tree but never duplicate /btw records', () => {
  const { branchIndex, descendants } = helpers();
  const index = branchIndex(Object.fromEntries([
    record('root', 'b1', 'child'),
    ['branchTreeParents', { child: 'elsewhere', native: 'root', nested: 'native', self: 'self', bad: 'x/y' }]
  ]));
  const result = descendants(index, 'root');
  assert.deepEqual([...result.chats].sort(), ['child', 'native', 'nested']);
  assert.deepEqual([...result.keys], ['btwBranch:root:b1']);
  assert.deepEqual([...descendants(index, 'elsewhere').chats], []);
});
