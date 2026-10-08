// Run with: python3 scripts/test_browser.py btw-completion
// A caller can prefix globalThis.qaSpace / qaPage to reuse its active TaskSpace.
const fs = await import('node:fs/promises');
const root = globalThis.qaRoot || process.env.CHATSPRIG_ROOT;
if (!root) throw new Error('Run this test with scripts/test_browser.py to supply the checkout path.');
const task = await taskSpace(globalThis.qaSpace || 'ChatSprig BTW completion regression');
console.log({spaceId:task.spaceId});
const page = task.page(globalThis.qaPage || 'p1');
const sources = {};
for (const file of ['background.js','content/overlay.js','content/btw.js','content/frame-helper.js']) sources[file]=await fs.readFile(`${root}/${file}`,'utf8');
let html=await fs.readFile(`${root}/tests/fixtures/btw.html`,'utf8');
const shim=await fs.readFile(`${root}/tests/browser/btw-fixture.js`,'utf8');
const palette=await fs.readFile(`${root}/tests/browser/btw-completion-fixture.js`,'utf8');
const nativeEscape='window.addEventListener("keydown",event=>{if(event.key==="Escape"&&window.qa?.captureEscape){document.activeElement.blur();window.qaCloseNativePalette();event.stopImmediatePropagation();event.preventDefault();}},true);';
html=html.replace('</html>',`<script>${nativeEscape}<\/script><script>window.qaSources=${JSON.stringify(sources).replace(/<\//g,'<\\/')};<\/script><script>${shim}<\/script><script>${palette}<\/script></html>`);
const path=`${root}/draft/btw-2.5.1/btw-completion.html`;
await fs.mkdir(`${root}/draft/btw-2.5.1`, {recursive:true});
await fs.writeFile(path,html); await page.goto(`file://${path}`); await page.waitForFunction(()=>qaReady);
const assert=(test,message)=>{if(!test)throw new Error(message)};
async function selected() {
  await page.waitForFunction(()=>document.querySelector('#chatsprig-btw-command')?.getAttribute('aria-current')==='true');
  return await page.evaluate(()=>({draft:document.querySelector('#prompt-textarea').textContent,selected:[...document.querySelectorAll('[data-list-navigation-item][aria-current=true]')].map(e=>e.id||e.textContent),emptyVisible:!!document.querySelector('[data-qa-empty]:not([hidden])')}));
}
const steps=[];
await page.fill('#prompt-textarea','/');await page.waitForSelector('#chatsprig-btw-command');
for (const key of ['b','t','w']) { await page.press('#prompt-textarea',key); const state=await selected();assert(state.selected.length===1&&!state.emptyVisible,'BTW lost native selection or showed No commands');steps.push(state); }
// Native rerenders and resets selection without changing the query.
await page.evaluate(()=>qaRenderNativePalette());const rerender=await selected();assert(rerender.selected.length===1&&!rerender.emptyVisible,'Native rerender broke selection');
for (const expected of ['/bt','/b']) {await page.press('#prompt-textarea','Backspace');assert((await selected()).draft===expected,'Backspace lost matching selection');}
await page.press('#prompt-textarea','Backspace');await page.press('#prompt-textarea','ArrowUp');await selected();
await page.press('#prompt-textarea','Enter');
assert(await page.evaluate(()=>document.querySelector('#prompt-textarea').textContent==='/btw '&&qa.routes.length===0&&qa.mainSends.length===0&&qa.nativeEnter===0),'Enter sent instead of completing the command');
for(const prefix of ['/b','/bt','/btw']) {await page.fill('#prompt-textarea',prefix);await selected();await page.press('#prompt-textarea','Enter');assert(await page.evaluate(()=>document.querySelector('#prompt-textarea').textContent==='/btw '),'Prefix Enter did not choose BTW');}
await page.fill('#prompt-textarea','/');await page.waitForSelector('#chatsprig-btw-command');await page.press('#prompt-textarea','ArrowDown');await page.press('#prompt-textarea','Enter');
assert(await page.evaluate(()=>qa.nativeCommands.at(-1)==='Model'),'Native keyboard navigation was broken');
await page.hover('#chatsprig-btw-command');await selected();await page.click('#chatsprig-btw-command');
assert(await page.evaluate(()=>document.querySelector('#prompt-textarea').textContent==='/btw '),'Pointer selection did not complete BTW');
await page.fill('#prompt-textarea','/btw a question');assert(await page.evaluate(()=>!document.querySelector('#chatsprig-btw-command')),'Question text kept the completion open');
await page.fill('#prompt-textarea','//system-prompt');assert(await page.evaluate(()=>!document.querySelector('#chatsprig-btw-command')),'BTW interfered with double slash');
// Chat closes the native palette for unknown commands; Work keeps an empty row.
await page.evaluate(()=>qa.hideUnmatched=true);
await page.fill('#prompt-textarea','/');await page.waitForSelector('#chatsprig-btw-command');
for (const key of ['b','t','w']) {await page.press('#prompt-textarea',key);await selected();}
assert(await page.evaluate(()=>!!document.querySelector('#chatsprig-btw-palette')),'Native close lost the BTW palette');
await page.press('#prompt-textarea','Escape');await page.waitForFunction(()=>!document.querySelector('#chatsprig-btw-command'));assert(await page.evaluate(()=>document.querySelector('#prompt-textarea').textContent==='/btw'),'Escape deleted the draft');
await page.fill('#prompt-textarea','/bt');await selected();await page.press('#prompt-textarea','Enter');assert(await page.evaluate(()=>document.querySelector('#prompt-textarea').textContent==='/btw '),'Fallback Enter failed');
await page.reload();await page.waitForFunction(()=>qaReady);await page.evaluate(()=>qa.hideUnmatched=true);
await page.fill('#prompt-textarea','/btw');await selected();await page.press('#prompt-textarea','Enter');assert(await page.evaluate(()=>document.querySelector('#prompt-textarea').textContent==='/btw '),'Fast typing/paste lost completion');
await page.fill('#prompt-textarea','/');await page.waitForSelector('#chatsprig-btw-command');
const fastEnter=await page.evaluate(()=>{const input=document.querySelector('#prompt-textarea');input.innerHTML='<p>/btw</p>';qaRenderNativePalette();input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));return input.textContent;});
assert(fastEnter==='/btw ','Enter between native unmount and the next frame failed');
await page.evaluate(()=>qa.captureEscape=true);await page.fill('#prompt-textarea','/btw');await selected();await page.press('#prompt-textarea','Escape');await page.waitForFunction(()=>!document.querySelector('#chatsprig-btw-command'));assert(await page.evaluate(()=>document.querySelector('#prompt-textarea').textContent==='/btw'),'Native capture Escape deleted the draft');
await page.fill('#prompt-textarea','/bt');await selected();await page.evaluate(()=>{const input=document.querySelector('#prompt-textarea');input.blur();input.focus();});await selected();
const result={passed:true,steps,checks:['incremental selection','one selected row','No commands hidden','native rerender','Backspace','Enter at every prefix','completion does not send','native arrows and click','pointer selection','question dismisses completion','double slash unchanged','native closes unmatched queries','Escape retains draft','fallback Enter','fast typing/paste','Enter during native unmount','native capture Escape and blur','transient editor blur']};
await fs.writeFile(`${root}/draft/btw-2.5.1/btw-completion-results.json`,JSON.stringify(result,null,2));console.log(result);
if(!globalThis.qaSpace)await task.finish({keep:[]});
