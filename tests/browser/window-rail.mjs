// Run with: python3 scripts/test_browser.py window-rail
// The overlay rail lists every live frame and switches between them in place.
const fs = await import('node:fs/promises');
const root = globalThis.qaRoot || process.env.CHATSPRIG_ROOT;
if (!root) throw new Error('Run this test with scripts/test_browser.py to supply the checkout path.');
const task = await taskSpace(globalThis.qaSpace || 'ChatSprig window rail verification');
console.log({spaceId:task.spaceId});
const page = task.page(globalThis.qaPage || 'p1');
const sources = {};
for (const file of ['background.js','content/overlay.js','content/btw.js','content/frame-helper.js']) sources[file]=await fs.readFile(`${root}/${file}`,'utf8');
const shim=await fs.readFile(`${root}/tests/browser/btw-fixture.js`,'utf8');
let html=await fs.readFile(`${root}/tests/fixtures/btw.html`,'utf8');
html=html.replace('</html>',`<script>window.qaSettings={focusPromptOnOpen:false};window.qaSources=${JSON.stringify(sources).replace(/<\//g,'<\\/')};<\/script><script>${shim}<\/script></html>`);
await fs.mkdir(`${root}/draft/window-rail`,{recursive:true});
const path=`${root}/draft/window-rail/rail.html`;
await fs.writeFile(path,html);
await page.goto(`file://${path}`);
await page.evaluate(()=>localStorage.removeItem('qaBtwStorage'));
await page.reload();await page.waitForFunction(()=>window.qaReady);
const assert = (condition, message) => { if(!condition) throw new Error(message); };
const rail = () => page.evaluate(()=>{
  const shadow=document.querySelector('#cgpt-helper-overlay').shadowRoot;
  return {items:[...shadow.querySelectorAll('.rail button')].map(b=>({key:b.dataset.key,label:b.getAttribute('aria-label'),text:b.textContent,current:b.getAttribute('aria-current')==='true'})),
    visible:[...shadow.querySelectorAll('iframe')].filter(f=>!f.hidden).map(f=>f.name),frames:shadow.querySelectorAll('iframe').length,
    title:shadow.querySelector('.title').textContent};
});
const message = msg => page.evaluate(msg=>{for(const fn of qa.docs.get('top'))fn(msg,{id:'offline-btw'},()=>{});},msg);
await message({type:'toggleOverlay'});
let state=await rail();
assert(state.items.length===1 && state.items[0].key==='chatgpt' && state.items[0].current,'ChatGPT was not listed');
await message({type:'toggleOverlay',provider:'gemini'});
state=await rail();
assert(state.items.map(i=>i.key).join()==='chatgpt,gemini' && state.items[1].current,'Gemini was not listed as current');
await page.click('loc=css:button[data-action=close]');
for (const question of ['研究方向的問題','另一個支線']) {
  await page.fill('#prompt-textarea',`/btw ${question}`);
  await page.press('#prompt-textarea','Enter');
  await page.waitForFunction(q=>qa.sends.some(s=>s.text===q)&&document.querySelector('#prompt-textarea').textContent==='',question);
}
state=await rail();
assert(state.items.length===4,'Branches were not listed');
assert(state.items[3].current && state.items[3].text==='另' && state.items[3].label==='BTW · 另一個支線','Active branch item is wrong');
await page.screenshot({path:`${root}/draft/window-rail/rail.png`});
const layout=await page.evaluate(()=>{
  const shadow=document.querySelector('#cgpt-helper-overlay').shadowRoot,win=shadow.querySelector('.window').getBoundingClientRect(),dock=shadow.querySelector('.rail').getBoundingClientRect();
  return {inside:!!shadow.querySelector('.window .rail'),gap:dock.left-win.right,top:dock.top-win.top,separators:shadow.querySelectorAll('.rail hr').length};
});
assert(!layout.inside && layout.gap>0 && Math.abs(layout.top)<2 && layout.separators===1,`Dock is not beside the window: ${JSON.stringify(layout)}`);
await page.hover("loc=css:.rail button[aria-label='BTW · 研究方向的問題']");
await page.waitForTimeout(250);
await page.screenshot({path:`${root}/draft/window-rail/rail-hover.png`});
// Labels open toward the window and stay inside the viewport.
const tip=await page.evaluate(()=>{
  const shadow=document.querySelector('#cgpt-helper-overlay').shadowRoot,el=shadow.querySelector('.rail-tip'),t=el.getBoundingClientRect(),dock=shadow.querySelector('.rail').getBoundingClientRect();
  return {hidden:el.hidden,text:el.textContent,left:t.left,right:t.right,dockLeft:dock.left};
});
assert(!tip.hidden && tip.text==='BTW · 研究方向的問題' && tip.right<=tip.dockLeft && tip.left>=0,`Tooltip is misplaced: ${JSON.stringify(tip)}`);
// A short viewport scrolls the dock instead of pushing items off screen.
await page.cdp('Emulation.setDeviceMetricsOverride',{width:900,height:200,deviceScaleFactor:1,mobile:false});
const short=await page.evaluate(()=>{const r=document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelector('.rail');const b=r.getBoundingClientRect();return {bottom:b.bottom,height:innerHeight,scrolls:r.scrollHeight>r.clientHeight};});
assert(short.scrolls && short.bottom<=short.height,`Dock does not fit a short viewport: ${JSON.stringify(short)}`);
await page.evaluate(()=>{const r=document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelector('.rail');r.scrollTop=r.scrollHeight;});
await page.click("loc=css:.rail button[aria-label='BTW · 研究方向的問題']");
assert(await page.evaluate(()=>document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelector(".rail button[aria-label='BTW · 研究方向的問題']").getAttribute('aria-current')==='true'),'Scrolled dock item was not reachable');
await page.screenshot({path:`${root}/draft/window-rail/rail-short.png`});
// A narrow viewport shrinks the window so the dock stays on screen.
await page.cdp('Emulation.setDeviceMetricsOverride',{width:400,height:700,deviceScaleFactor:1,mobile:false});
const narrow=await page.evaluate(()=>{const b=document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelector('.rail').getBoundingClientRect();return {left:b.left,right:b.right,width:innerWidth};});
assert(narrow.left>=0 && narrow.right<=narrow.width,`Dock is off screen in a narrow viewport: ${JSON.stringify(narrow)}`);
await page.click("loc=css:.rail button[aria-label='Gemini temporary chat']");
assert(await page.evaluate(()=>document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelector(".rail button[aria-label='Gemini temporary chat']").getAttribute('aria-current')==='true'),'Narrow dock item was not clickable');
await page.screenshot({path:`${root}/draft/window-rail/rail-narrow.png`});
await page.cdp('Emulation.clearDeviceMetricsOverride',{});
await page.click("loc=css:.rail button[aria-label='BTW · 另一個支線']");
// Switching keeps each frame and its draft; no frame is recreated.
const routes=await page.evaluate(()=>qa.routes.length);
await page.evaluate(()=>{[...document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelectorAll('iframe')].find(f=>!f.hidden).contentDocument.querySelector('#prompt-textarea').textContent='支線草稿';});
await page.click("loc=css:.rail button[aria-label='ChatGPT temporary chat']");
state=await rail();
assert(state.items[0].current && state.visible[0]==='cgpt_helper_overlay_frame' && state.title.includes('ChatGPT'),'Switch to ChatGPT failed');
await page.click("loc=css:.rail button[aria-label='Gemini temporary chat']");
assert((await rail()).items[1].current,'Switch to Gemini failed');
await page.click("loc=css:.rail button[aria-label='BTW · 另一個支線']");
state=await rail();
const draft=await page.evaluate(()=>[...document.querySelector('#cgpt-helper-overlay').shadowRoot.querySelectorAll('iframe')].find(f=>!f.hidden).contentDocument.querySelector('#prompt-textarea').textContent);
assert(state.items[3].current && state.title.includes('BTW') && draft==='支線草稿','Switch back to branch lost its draft');
assert(await page.evaluate(()=>qa.routes.length)===routes && state.frames===4,'Switching recreated a frame');
// Keyboard switching keeps focus on the dock when prompt auto-focus is off.
await page.focus("loc=css:.rail button[aria-label='Gemini temporary chat']");
await page.press("loc=css:.rail button[aria-label='Gemini temporary chat']",'Enter');
const focused=await page.evaluate(()=>{const s=document.querySelector('#cgpt-helper-overlay').shadowRoot;return {label:s.activeElement?.getAttribute('aria-label'),current:s.querySelector(".rail button[aria-current='true']").getAttribute('aria-label')};});
assert(focused.current==='Gemini temporary chat','Enter did not switch chats');
assert(focused.label==='Gemini temporary chat',`Keyboard focus was lost: ${JSON.stringify(focused)}`);
const results={passed:true,items:state.items};
console.log(results);
if (!globalThis.qaSpace) await task.finish({ keep: [] });
