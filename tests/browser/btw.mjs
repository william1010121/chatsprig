// Run with: ego-browser nodejs < tests/browser/btw.mjs
// A caller can prefix globalThis.qaSpace / qaPage to reuse its active TaskSpace.
const fs = await import('node:fs/promises');
// Ego's Node bridge has cwd=/; use the workspace path unless explicitly overridden.
const root = process.env.CHATSPRIG_ROOT || '/Users/guoshengwei/Project/chatgpt-extension';
const task = await taskSpace(globalThis.qaSpace || 'ChatSprig BTW HTML verification');
console.log({spaceId:task.spaceId});
const page = task.page(globalThis.qaPage || 'p1');
await fs.mkdir(`${root}/draft/btw-2.5.1`,{recursive:true});
const sources = {};
for (const file of ['background.js','content/overlay.js','content/btw.js','content/frame-helper.js']) sources[file]=await fs.readFile(`${root}/${file}`,'utf8');
const shim=await fs.readFile(`${root}/tests/browser/btw-fixture.js`,'utf8');
let html=await fs.readFile(`${root}/tests/fixtures/btw.html`,'utf8');
html=html.replace('</html>',`<script>window.qaSources=${JSON.stringify(sources).replace(/<\//g,'<\\/')};<\/script><script>${shim}<\/script></html>`);
const path=`${root}/draft/btw-2.5.1/btw.html`;
await fs.writeFile(path,html);
await page.goto(`file://${path}`);
await page.waitForFunction(()=>window.qaReady);
console.log(await page.snapshot());

// Build a second fixture from the downloaded, real ChatGPT HTML (when available).
try {
  let saved=await fs.readFile(`${root}/draft/performance/KK.html`,'utf8');
  saved=saved.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi,'');
  const bootstrap=`document.querySelectorAll('[id^="cgpt-helper"]').forEach(el=>el.remove());window.qaSources=${JSON.stringify(sources).replace(/<\//g,'<\\/')};`;
  saved=saved.replace('</body>',`<script>${bootstrap}<\/script><script>${shim}<\/script></body>`);
  await fs.writeFile(`${root}/draft/btw-2.5.1/saved-chatgpt.html`,saved);
} catch(error) { console.log({savedHtmlFixture:error.message}); }
const assert = (condition, message) => { if(!condition) throw new Error(message); };
// Reset only this fixture's test-owned data, then verify persistence by reloading later.
await page.evaluate(()=>localStorage.removeItem('qaBtwStorage'));
await page.reload();await page.waitForFunction(()=>qaReady);
// Native SPA transitions retain a connected but hidden home composer and main.
await page.evaluate(()=>{
  const old=document.querySelector('form'),next=old.cloneNode(true);
  next.querySelector('#cgpt-helper-btw')?.remove();
  next.id='qa-thread-composer';old.id='qa-home-composer';old.hidden=true;document.body.appendChild(next);
  const hiddenMain=document.createElement('main');hiddenMain.hidden=true;document.body.prepend(hiddenMain);
});
await page.waitForFunction(()=>document.querySelector('#cgpt-helper-btw')?.parentElement.id==='qa-thread-composer');
assert(await page.evaluate(()=>document.querySelector('#qa-home-composer').isConnected),'Old composer must still be connected');
await page.evaluate(()=>{document.querySelector('#qa-thread-composer').remove();document.querySelector('#qa-home-composer').hidden=false;});
await page.waitForFunction(()=>document.querySelector('#cgpt-helper-btw')?.parentElement.id==='qa-home-composer');
await page.fill('#prompt-textarea','/btw 第一個問題');
await page.press('#prompt-textarea','Enter');
await page.waitForFunction(()=>qa.sends.length===1 && document.querySelector('#prompt-textarea').textContent==='');
await page.click('loc=css:button[data-action=close]');
await page.fill('#prompt-textarea','/btw 第二個問題\n保留多行');
await page.click('loc=css:form > .controls [data-testid=send-button]');
await page.waitForFunction(()=>qa.sends.length===2 && document.querySelector('#prompt-textarea').textContent==='');
let result=await page.evaluate(()=>({routes:qa.routes.length,sends:qa.sends,mainSends:qa.mainSends.length}));
assert(result.routes===2 && result.mainSends===0 && result.sends[1].text==='第二個問題\n保留多行','BTW submission/routing failed');
await page.click('loc=css:button[data-action=close]');
await page.click('loc=css:button.toggle');
await page.screenshot({path:`${root}/draft/btw-2.5.1/branch-list.png`});
await page.click('loc=css:button.branch >> nth=0');
await page.fill("loc=css:[aria-label='Branch question']",'分支一草稿');
await page.click('loc=css:button[data-action=close]');
await page.click('loc=css:button.toggle');
await page.click('loc=css:button.branch >> nth=1');
await page.click('loc=css:button[data-action=close]');
await page.click('loc=css:button.toggle');
await page.click('loc=css:button.branch >> nth=0');
result=await page.evaluate(()=>({routes:qa.routes.length,sends:qa.sends.length,draft:[...document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelectorAll('iframe')].find(f=>!f.hidden).contentDocument.querySelector('#prompt-textarea').textContent}));
assert(result.routes===2 && result.sends===2 && result.draft==='分支一草稿','Switching did not retain branches/drafts');
await page.click('loc=css:button[data-action=close]');
await page.fill('#prompt-textarea','/btw ');await page.press('#prompt-textarea','Enter');
result=await page.evaluate(()=>({routes:qa.routes.length,status:document.querySelector('#cgpt-helper-btw').shadowRoot.querySelector('[role=status]').textContent}));
assert(result.routes===2 && result.status.includes('Add your question'),'Empty BTW was not guarded');
await page.fill('#prompt-textarea','/btw line one');await page.press('#prompt-textarea','Shift+Enter');
assert(await page.evaluate(()=>qa.routes.length===2),'Shift+Enter created a branch');
await page.evaluate(()=>{qaLocation.pathname='/c/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';dispatchEvent(new PopStateEvent('popstate'));});
await page.waitForFunction(()=>document.querySelector('#cgpt-helper-btw').shadowRoot.querySelector('.toggle').textContent==='Branches · 0');
await page.evaluate(()=>{qaLocation.pathname='/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';dispatchEvent(new PopStateEvent('popstate'));});
await page.waitForFunction(()=>document.querySelector('#cgpt-helper-btw').shadowRoot.querySelector('.toggle').textContent==='Branches · 2');
await page.reload();await page.waitForFunction(()=>qaReady && document.querySelector('#cgpt-helper-btw').shadowRoot.querySelector('.toggle').textContent==='Branches · 2');
await page.click('loc=css:button.toggle');await page.click('loc=css:button.branch >> nth=0');
await page.waitForFunction(()=>qa.routes.length===1);
result=await page.evaluate(()=>({url:qa.routes[0].url,sends:qa.sends.length}));
assert(result.url.includes('/c/') && result.sends===0,'Reload re-created/resubmitted a branch');
await page.click('loc=css:button[data-action=close]');
await page.evaluate(()=>qa.failBranch=true);
await page.fill('#prompt-textarea','/btw 保留失敗的問題');await page.press('#prompt-textarea','Enter');
await page.waitForFunction(()=>document.querySelector('#cgpt-helper-btw').shadowRoot.querySelector('[role=status]').textContent.includes('not ready'),undefined,{timeout:40000});
result=await page.evaluate(()=>({draft:document.querySelector('#prompt-textarea').textContent,sends:qa.sends.length,mainSends:qa.mainSends.length,masked:!document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelector('.frame-status').hidden}));
assert(result.draft==='/btw 保留失敗的問題' && result.sends===0 && result.mainSends===0 && result.masked,'Failed branch was not safely handled');
await page.click('loc=css:button[data-action=close]');
await page.evaluate(()=>{
  qa.failBranch=false;
  const main=[...document.querySelectorAll('main')].find(el=>!el.hidden),region=document.createElement('section');
  region.setAttribute('role','region');region.setAttribute('aria-label','Conversation');
  while(main.firstChild)region.appendChild(main.firstChild);main.replaceWith(region);
  for(const article of region.querySelectorAll('[data-turn-id]'))article.removeAttribute('data-turn-id');
  for(const node of region.querySelectorAll('[data-message-author-role]')){
    const role=node.getAttribute('data-message-author-role'),id=node.getAttribute('data-message-id');
    node.setAttribute('data-chatgpt-search-unit-key',`fallback-turn-0:0:${role}`);
    node.setAttribute('data-chatgpt-search-message-ids',`${id} ${id}`);
    node.removeAttribute('data-message-author-role');node.removeAttribute('data-message-id');
  }
});
await page.fill('#prompt-textarea','/btw New ChatGPT layout test');await page.press('#prompt-textarea','Enter');
await page.waitForFunction(()=>qa.sends.length===1 && document.querySelector('#prompt-textarea').textContent==='');
assert(await page.evaluate(()=>qa.routes.at(-1).url.endsWith('/22222222-2222-4222-8222-222222222222')),'New ChatGPT region/search-message IDs were not recognized');
const results={passed:true,checks:['connected hidden composer transition','hidden old main ignored','Enter','send button','multiline','source isolation','separate frames','draft retention','empty command','Shift+Enter','conversation scoping','reload without rebranch/resend','native failure preserves source draft','new ChatGPT region/search-message IDs'],nativeService:'simulated',savedHtml:`${root}/draft/btw-2.5.1/saved-chatgpt.html`};
await fs.writeFile(`${root}/draft/btw-2.5.1/browser-results.json`,JSON.stringify(results,null,2));
console.log(results);
console.log(await page.snapshot());
if (!globalThis.qaSpace) await task.finish({ keep: [] });
