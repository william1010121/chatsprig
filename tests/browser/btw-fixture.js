// Offline Chrome runtime + native-branch simulator. Production scripts run unchanged.
// This verifies DOM/editor/routing behavior, not ChatGPT's remote branch service.
(async function () {
  const SOURCE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  sessionStorage.removeItem('cgptHelperOverlayOpen');
  const docs = new Map(), storage = JSON.parse(localStorage.getItem('qaBtwStorage') || '{}'), storageListeners = [];
  let backgroundListener, nextDoc = 0;
  window.qa = { routes: [], sends: [], mainSends: [], docs, storage, failBranch: false, holdFill: false, releaseFill: null };
  const event = () => ({ addListener() {} });
  const sources = window.qaSources;
  window.qaLocation = {hostname:'chatgpt.com',pathname:`/c/${SOURCE}`,search:'',href:`https://chatgpt.com/c/${SOURCE}`};
  function runtime(documentId, frameId, url) {
    const listeners = [];
    if (documentId) docs.set(documentId, listeners);
    return { id:'offline-btw', onMessage:{addListener:fn=>listeners.push(fn)}, sendMessage: message => new Promise(resolve => {
      if (!backgroundListener(message, { id:'offline-btw', tab:{id:1}, frameId, documentId, url }, resolve)) resolve(undefined);
    }) };
  }
  const chrome = window.chrome = {
    runtime:runtime('top',0,window.qaLocation.href),
    storage:{local:{get:async key=>key === null ? {...storage} : {[key]:storage[key]},set:async values=>{
      const changes = {};
      for(const [key,value] of Object.entries(values)) { changes[key]={oldValue:storage[key],newValue:JSON.parse(JSON.stringify(value))};storage[key]=changes[key].newValue; }
      localStorage.setItem('qaBtwStorage',JSON.stringify(storage));
      for(const fn of storageListeners) fn(changes,'local');
    }},onChanged:{addListener:fn=>storageListeners.push(fn)}}
  };
  const bg = {
    runtime:{onMessage:{addListener:fn=>backgroundListener=fn},onInstalled:event(),onStartup:event()},
    commands:{onCommand:event()},action:{onClicked:event()},storage:{onChanged:event()},cookies:{onChanged:event()},
    tabs:{onRemoved:event(),sendMessage: async (_tab,message,options) => {
      const targets = options?.documentId ? [docs.get(options.documentId)] : [...docs.values()];
      if (message.type==='sidebarFill' && window.qa.holdFill) await new Promise(resolve=>window.qa.releaseFill=resolve);
      for(const listeners of targets) for(const fn of listeners || []) {
        let responded = false, response;
        const result = fn(message,{id:'offline-btw'},value=>{responded=true;response=value;});
        if (result === true) return await new Promise(resolve => {
          const check=()=> responded ? resolve(response) : setTimeout(check,10); check();
        });
        if (responded) return response;
      }
    }}
  };
  window.cgptLoadSettings = async()=>({targetUrl:'https://chatgpt.com/?temporary-chat=true',windowWidth:860,windowHeight:620,hideChatgptSidebar:false,focusPromptOnOpen:true,altKWhenOpen:'hide',...window.qaSettings});
  new Function('chrome','loadSettings','DEFAULT_SETTINGS',sources['background.js'].replace(/^import .*;\n/,''))(bg,window.cgptLoadSettings,{});
  const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'src');
  Object.defineProperty(HTMLIFrameElement.prototype,'src',{get:srcDescriptor.get,set(url){
    window.qa.routes.push({name:this.name,url});
    this.dataset.requestedUrl=url;
    this.srcdoc=`<!doctype html><html><style>body{font:16px system-ui;margin:24px}form{position:fixed;bottom:20px;left:24px;right:24px}#prompt-textarea{min-height:48px;border:1px solid #aaa;border-radius:16px;padding:12px;white-space:pre-wrap}</style><main><p>Branched context from the main conversation.</p><div id="answers"></div></main><form data-thread-find-composer><div id="prompt-textarea" contenteditable="true" role="textbox" aria-label="Branch question"><p><br class="ProseMirror-trailingBreak"></p></div><button type="submit" data-testid="send-button">Send</button></form><script>parent.qaInitFrame(window);<\/script></html>`;
  }});
  window.qaInitFrame = frameWindow => {
    const doc = frameWindow.document;
    const id = `frame-${++nextDoc}`;
    const branchId = /^cgpt_helper_btw_([a-zA-Z0-9-]+)_/.exec(frameWindow.name)?.[1];
    const fakeLocation = {hostname:'chatgpt.com',pathname:branchId ? `/branch/${SOURCE}/22222222-2222-4222-8222-222222222222` : '/',href:'https://chatgpt.com/',search:''};
    frameWindow.chrome = {runtime:runtime(id,1,'https://chatgpt.com/'),storage:chrome.storage};
    frameWindow.cgptLoadSettings = window.cgptLoadSettings;
    // Route init mirrors the native /branch -> /c navigation; failed branches return to their source.
    if(branchId) fakeLocation.pathname = window.qa.failBranch ? `/c/${SOURCE}` : window.qa.localBranch ? `/c/local-chatgpt:${branchId}` : `/c/${branchId}`;
    frameWindow.sessionStorage.setItem(`chatsprig:btw-source:${branchId}`,SOURCE);
    const helper = sources['content/frame-helper.js'].replace("window.parent.postMessage({ source: MESSAGE_SOURCE, action: 'btwBranchReady', branchId,", "window.parent.qaBranchReport(window, { source: MESSAGE_SOURCE, action: 'btwBranchReady', branchId,");
    frameWindow.Function('location',helper)(fakeLocation);
    const input=doc.querySelector('#prompt-textarea');
    const readText = el => [...el.childNodes].map(node => node.textContent).join('\n');
    doc.querySelector('form').addEventListener('submit',e=>e.preventDefault());
    doc.querySelector('[data-testid="send-button"]').addEventListener('click',()=>{
      window.qa.sends.push({branchId,text:readText(input)});
      const answer=doc.createElement('p');answer.textContent=`You: ${input.innerText}`;doc.querySelector('#answers').appendChild(answer);input.innerHTML='<p><br></p>';
    });
  };
  window.qaBranchReport = (source,data) => window.dispatchEvent(new MessageEvent('message',{source,data,origin:'https://chatgpt.com'}));
  for (const file of ['content/overlay.js','content/btw.js']) new Function('location',sources[file])(window.qaLocation);
  const form=document.querySelector('#prompt-textarea, [data-composer-markdown]')?.closest('form');
  form?.addEventListener('submit',e=>{e.preventDefault();window.qa.mainSends.push(document.querySelector('#prompt-textarea, [data-composer-markdown]').innerText);});
  window.qaReady=true;
})();
