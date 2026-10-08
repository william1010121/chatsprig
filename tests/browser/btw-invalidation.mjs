// Run with: ego-browser nodejs < tests/browser/btw-invalidation.mjs
// A caller can prefix globalThis.qaSpace / qaPage to reuse its active TaskSpace.
const fs = await import('node:fs/promises');
const root = '/Users/guoshengwei/Project/chatgpt-extension';
const task = await taskSpace(globalThis.qaSpace || 'ChatSprig BTW context invalidation');
console.log({ spaceId: task.spaceId });
const page = task.page(globalThis.qaPage || 'p1');
const source = await fs.readFile(`${root}/content/btw.js`, 'utf8');
const html = `<!doctype html><meta charset="utf-8"><title>BTW invalidation regression</title>
<style>body{font:16px system-ui}form{width:768px}textarea{width:100%;height:80px}</style>
<main><div data-turn-id="last-message">Source context</div></main>
<form data-chatgpt-composer><textarea id="prompt-textarea">/btw retained draft</textarea><button type="submit" data-testid="send-button">Send</button></form>
<script>
window.qa={valid:true, mode:'ok', gets:0, sets:0, opens:0, errors:[]};
addEventListener('error',e=>qa.errors.push(e.message));
addEventListener('unhandledrejection',e=>qa.errors.push(String(e.reason)));
const invalid=()=>new Error('Extension context invalidated.');
window.chrome={runtime:{get id(){if(qa.mode==='id-throw')throw invalid();return qa.valid?'qa-btw':undefined;}},storage:{
  local:{get(){qa.gets++;if(qa.mode==='sync-get')throw invalid();if(qa.mode==='reject-get')return Promise.reject(invalid());
    if(qa.mode==='ordinary-error')return Promise.reject(new Error('Storage unavailable'));
    if(qa.mode==='hold-get')return new Promise(resolve=>qa.release=resolve);return Promise.resolve({});},
    set(){qa.sets++;if(qa.mode==='sync-set')throw invalid();return Promise.resolve();}},
  onChanged:{addListener(fn){qa.storageChanged=fn;}}
}};
window.qaLocation={hostname:'chatgpt.com',pathname:'/c/source',search:''};
window.cgptOpenBtw=async()=>{qa.opens++;if(qa.mode==='fill-invalidates')qa.valid=false;return {filled:true};};
window.qaNavigate=()=>{qaLocation.pathname+='-next';dispatchEvent(new PopStateEvent('popstate'));};
document.querySelector('form').addEventListener('submit',e=>e.preventDefault());
new Function('location',${JSON.stringify(source).replace(/</g, '\\u003c')})(qaLocation);
window.qaReady=true;
</script>`;
await fs.mkdir(`${root}/draft/btw-invalidation`, { recursive: true });
const fixture = `${root}/draft/btw-invalidation/regression.html`;
await fs.writeFile(fixture, html);
await page.goto(`file://${fixture}`);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function reset() {
  await page.reload();
  await page.waitForFunction(() => qaReady && !!document.querySelector('#cgpt-helper-btw'));
}
async function stopped(mode) {
  await page.waitForFunction(() => !document.querySelector('#cgpt-helper-btw'));
  const result = await page.evaluate(async () => {
    const before = { gets: qa.gets, sets: qa.sets };
    qaNavigate();
    document.body.appendChild(document.createElement('div'));
    document.documentElement.classList.toggle('dark');
    qa.storageChanged({}, 'local');
    const input = document.querySelector('#prompt-textarea');
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { before, gets: qa.gets, sets: qa.sets, errors: qa.errors, draft: input.value,
      prevented: event.defaultPrevented, remounted: !!document.querySelector('#cgpt-helper-btw'), opens: qa.opens };
  });
  assert(result.errors.length === 0, `${mode}: unhandled error ${result.errors}`);
  assert(result.before.gets === result.gets && result.before.sets === result.sets, `${mode}: stale callbacks still call storage`);
  assert(!result.prevented && !result.remounted, `${mode}: stale script still intercepts or remounts`);
  assert(result.draft === '/btw retained draft', `${mode}: draft was changed`);
  return { mode, ...result };
}
const results = [];
for (const mode of ['missing-id', 'id-throw', 'sync-get', 'reject-get', 'hold-get']) {
  await reset();
  await page.evaluate(mode => {
    qa.mode = mode;
    if (mode === 'missing-id') qa.valid = false;
    qaNavigate();
  }, mode);
  if (mode === 'hold-get') {
    await page.waitForFunction(() => typeof qa.release === 'function');
    await page.evaluate(() => { qa.valid = false; document.querySelector('#prompt-textarea').dispatchEvent(new Event('input', { bubbles: true })); qa.release({}); });
  }
  results.push(await stopped(mode));
}
for (const mode of ['sync-set', 'fill-invalidates']) {
  await reset();
  await page.evaluate(mode => { qa.mode = mode; document.querySelector('[data-testid="send-button"]').click(); }, mode);
  results.push(await stopped(mode));
}
await reset();
await page.evaluate(() => { qa.mode = 'ordinary-error'; qaNavigate(); });
await page.waitForFunction(() => qa.gets >= 2);
assert(await page.evaluate(() => !!document.querySelector('#cgpt-helper-btw')), 'Ordinary storage failure must not permanently disable BTW');
await page.evaluate(() => { qa.mode = 'ok'; qaNavigate(); });
await page.waitForFunction(() => qa.gets >= 3);
console.log({ passed: true, checks: results, ordinaryStorageFailureRecovers: true });
if (!globalThis.qaSpace) await task.finish({ keep: [] });
