// Run with: python3 scripts/test_browser.py btw-frame-limit
// Many BTW branches keep only a bounded number of hidden, reopenable iframes.
const fs = await import('node:fs/promises');
const root = globalThis.qaRoot || process.env.CHATSPRIG_ROOT;
if (!root) throw new Error('Run this test with scripts/test_browser.py to supply the checkout path.');
const task = await taskSpace(globalThis.qaSpace || 'ChatSprig BTW frame limit verification');
console.log({spaceId:task.spaceId});
const page = task.page(globalThis.qaPage || 'p1');
const sources = {};
for (const file of ['background.js','content/overlay.js','content/btw.js','content/frame-helper.js']) sources[file]=await fs.readFile(`${root}/${file}`,'utf8');
const shim=await fs.readFile(`${root}/tests/browser/btw-fixture.js`,'utf8');
let html=await fs.readFile(`${root}/tests/fixtures/btw.html`,'utf8');
html=html.replace('</html>',`<script>window.qaSources=${JSON.stringify(sources).replace(/<\//g,'<\\/')};<\/script><script>${shim}<\/script></html>`);
await fs.mkdir(`${root}/draft/btw-frame-limit`,{recursive:true});
const path=`${root}/draft/btw-frame-limit/btw.html`;
await fs.writeFile(path,html);
await page.goto(`file://${path}`);
await page.evaluate(()=>localStorage.removeItem('qaBtwStorage'));
await page.reload();await page.waitForFunction(()=>window.qaReady);
const assert = (condition, message) => { if(!condition) throw new Error(message); };
const frames = () => page.evaluate(()=>[...document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelectorAll('iframe')]
  .map(f=>({id:/^cgpt_helper_btw_([a-zA-Z0-9-]+)_/.exec(f.name)?.[1],hidden:f.hidden})));
const ids = [];
async function createBranch(i) {
  await page.fill('#prompt-textarea',`/btw 問題 ${i}`);
  await page.press('#prompt-textarea','Enter');
  await page.waitForFunction(n=>qa.sends.length===n && document.querySelector('#prompt-textarea').textContent==='',i);
  ids.push((await frames()).find(f=>!f.hidden).id);
  await page.click('loc=css:button[data-action=close]');
}
const open = id => page.evaluate(id=>globalThis.cgptOpenBtw(Object.values(qa.storage).find(branch=>branch?.id===id)),id);
const visibleDraft = () => page.evaluate(()=>[...document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelectorAll('iframe')].find(f=>!f.hidden).contentDocument.querySelector('#prompt-textarea').textContent);
for (let i = 1; i <= 4; i++) await createBranch(i);
let current = await frames();
assert(current.length===3,`Expected active + 2 idle frames, got ${current.length}`);
assert(!current.some(f=>f.id===ids[0]),'Oldest idle branch frame was not released');
assert(ids.slice(1).every(id=>current.some(f=>f.id===id)),'Recent branch frames were released');
// Reopening a released branch recreates it from its persisted /c/ URL without resending.
const routesBefore=await page.evaluate(()=>qa.routes.length);
await open(ids[0]);
await page.waitForFunction(n=>qa.routes.length===n+1,routesBefore);
let result=await page.evaluate(()=>({url:qa.routes.at(-1).url,sends:qa.sends.length}));
assert(/\/c\/[a-zA-Z0-9-]+$/.test(result.url) && result.sends===4,'Released branch was not reopened from its saved URL');
await page.click('loc=css:button[data-action=close]');
current = await frames();
assert(current.length===3 && !current.some(f=>f.id===ids[1]) && current.some(f=>f.id===ids[0]),'Least recently used branch was not the one released');
// An unsent draft pins its branch frame, even when it is the least recently used.
await open(ids[2]);
await page.evaluate(()=>{[...document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelectorAll('iframe')].find(f=>!f.hidden).contentDocument.querySelector('#prompt-textarea').textContent='分支三草稿';});
await page.click('loc=css:button[data-action=close]');
await createBranch(5);
await createBranch(6);
current = await frames();
assert(current.some(f=>f.id===ids[2]),'Branch frame with an unsent draft was released');
assert(current.length===4,`Expected active + 2 idle + 1 draft frame, got ${current.length}`);
await open(ids[2]);
assert(await visibleDraft()==='分支三草稿','Draft-bearing branch lost its draft');
// Clearing the draft makes the frame releasable again.
await page.evaluate(()=>{[...document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelectorAll('iframe')].find(f=>!f.hidden).contentDocument.querySelector('#prompt-textarea').innerHTML='<p><br></p>';});
await page.click('loc=css:button[data-action=close]');
await createBranch(7);
assert((await frames()).length===3,'Cleared branch frame stayed pinned');
// Attachment-only drafts and streaming responses pin their frames too.
const decorate = (id, html) => page.evaluate(([id,html])=>{
  const frame=[...document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelectorAll('iframe')].find(f=>f.name.includes(id));
  frame.contentDocument.querySelector('form').insertAdjacentHTML('afterbegin',html);
},[id,html]);
const live = async () => (await frames()).map(f=>f.id);
const idle = (await live()).filter(id=>id!==ids.at(-1));
await decorate(idle[0],'<button type="button" aria-label="Remove file: notes.pdf">×</button>');
await decorate(idle[1],'<button type="button" data-testid="stop-button">Stop</button>');
await createBranch(8);
await createBranch(9);
const pinned = await live();
assert(pinned.includes(idle[0]),'Attachment-only draft frame was released');
assert(pinned.includes(idle[1]),'Generating branch frame was released');
assert(pinned.length===5,`Expected active + 2 idle + 2 busy frames, got ${pinned.length}`);
const results={passed:true,ids,frames:await frames(),routes:await page.evaluate(()=>qa.routes.length)};
console.log(results);
await page.screenshot({path:`${root}/draft/btw-frame-limit/after.png`});
if (!globalThis.qaSpace) await task.finish({ keep: [] });
