// Centered in-page ChatGPT overlay (top frame only, every site).
(function () {
  'use strict';

  if (window.top !== window.self) return;

  const HOST_ID = 'cgpt-helper-overlay';
  const FRAME_NAME = 'cgpt_helper_overlay_frame';
  const MESSAGE_SOURCE = 'cgpt-helper';
  const SESSION_KEY = 'cgptHelperOverlayOpen';
  const FOCUS_DELAYS = [0, 80, 180, 350, 700, 1200, 2000, 3500];
  // Hidden branch iframes are full ChatGPT pages; keep only a few reopenable ones.
  const MAX_IDLE_BRANCH_FRAMES = 2;

  let host = null;
  let shadow = null;
  let iframe = null;
  let settings = null;
  let provider = 'chatgpt';
  const frames = new Map();
  let activeBranch = null;
  const frameKey = () => activeBranch ? `btw:${activeBranch.id}` : provider;
  let focusGeneration = 0;
  let frameUse = 0;
  let pendingFocus = null;

  function readSessionProvider() {
    try { return sessionStorage.getItem('cgptHelperProvider') === 'gemini' ? 'gemini' : 'chatgpt'; }
    catch { return 'chatgpt'; }
  }

  function readSessionOpen() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  }

  function writeSessionOpen(value) {
    try {
      sessionStorage.setItem('cgptHelperProvider', provider);
      if (value) sessionStorage.setItem(SESSION_KEY, '1');
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // sandboxed page; ignore
    }
  }

  function isOpen() {
    return host?.getAttribute('data-open') === 'true';
  }

  function targetOrigin() {
    if (activeBranch) return 'https://chatgpt.com';
    try {
      return provider === 'gemini' ? 'https://gemini.google.com' : new URL(settings.targetUrl).origin;
    } catch {
      return 'https://chatgpt.com';
    }
  }

  function ensureWindow() {
    if (host && shadow) return;

    host = document.createElement('div');
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          -webkit-user-select: none !important;
          user-select: none !important;
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483647 !important;
          pointer-events: none !important;
          display: none !important;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        :host([data-open="true"]) {
          display: block !important;
        }
        .overlay {
          position: fixed;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
        }
        /* Exclude the shell from page selection; iframe documents stay selectable. */
        .overlay * {
          -webkit-user-select: none;
          user-select: none;
        }
        .window {
          min-width: 380px;
          min-height: 420px;
          max-width: 96vw;
          max-height: 94vh;
          background: #ffffff;
          color: #111827;
          border: 1px solid rgba(0, 0, 0, 0.18);
          border-radius: 12px;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
          overflow: hidden;
          resize: both;
          pointer-events: auto;
          display: flex;
          flex-direction: column;
        }
        .header {
          height: 42px;
          flex: 0 0 auto;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 0 10px 0 14px;
          background: #111827;
          color: #ffffff;
          user-select: none;
        }
        .title {
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 0 0 auto;
        }
        button {
          all: unset;
          box-sizing: border-box;
          width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          border-radius: 7px;
          cursor: pointer;
          color: #ffffff;
          font-size: 16px;
          line-height: 1;
        }
        button:hover {
          background: rgba(255, 255, 255, 0.14);
        }
        .body {
          position: relative;
          flex: 1 1 auto;
          min-height: 0;
          background: #ffffff;
        }
        iframe {
          display: block;
          width: 100%;
          height: 100%;
          border: 0;
          background: #ffffff;
        }
        iframe[hidden], .frame-status[hidden], button[hidden] { display: none !important; }
        .frame-status {
          position: absolute; inset: 0; z-index: 1; background: #fff;
          display: flex; align-items: center; justify-content: center;
          flex-direction: column; gap: 16px; padding: 28px; text-align: center;
          font-size: 14px; line-height: 1.6;
        }
        .frame-status button { width: auto; padding: 8px 16px; background: #111827; }
        .footer {
          height: 24px;
          flex: 0 0 auto;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 0 10px;
          font-size: 11px;
          color: #4b5563;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .muted { opacity: 0.82; }
      </style>
      <div class="overlay">
        <section class="window" role="dialog" aria-label="ChatGPT temporary chat">
          <div class="header">
            <div class="title">ChatSprig · Temporary Chat</div>
            <div class="actions">
              <button type="button" data-action="focus" title="Focus prompt input">⌖</button>
              <button type="button" data-action="refresh" title="New temporary chat: Alt+N">↻</button>
              <button type="button" data-action="close" title="Close: Alt+K">×</button>
            </div>
          </div>
          <div class="body"><div class="frame-status" hidden role="status"><span></span><button data-action="refresh" type="button">Retry temporary chat</button></div></div>
          <div class="footer">
            <span>Alt+K toggle · Alt+N new chat</span>
            <span class="muted">⌖ focus input</span>
          </div>
        </section>
      </div>
    `;

    shadow.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
      if (!button) return;

      const action = button.getAttribute('data-action');
      if (action === 'focus') requestFocusPrompt();
      else if (action === 'refresh') refresh();
      else if (action === 'close') hide();
    });

    document.documentElement.appendChild(host);
    applySize();
  }

  function applySize() {
    const win = shadow?.querySelector('.window');
    if (!win || !settings) return;
    win.style.width = `min(${Number(settings.windowWidth) || 1100}px, 94vw)`;
    win.style.height = `min(${Number(settings.windowHeight) || 760}px, 88vh)`;
  }

  function renderProvider() {
    const gemini = provider === 'gemini';
    const label = gemini ? 'Gemini' : 'ChatGPT';
    const shortcut = gemini ? 'Alt+G' : 'Alt+K';
    shadow.querySelector('.window').setAttribute('aria-label', activeBranch ? 'ChatGPT branch' : `${label} temporary chat`);
    shadow.querySelector('.title').textContent = activeBranch ? `ChatSprig · BTW · ${activeBranch.title}` : `ChatSprig · ${label} · Temporary Chat`;
    shadow.querySelector('[data-action="refresh"]').hidden = !!activeBranch;
    shadow.querySelector('[data-action="close"]').title = `Close: ${shortcut}`;
    shadow.querySelector('.footer span').textContent = activeBranch ? `${shortcut} close · Alt+N temporary chat` : `${shortcut} toggle · Alt+N new chat`;
    const record = frames.get(frameKey());
    const status = shadow.querySelector('.frame-status');
    status.hidden = (!gemini && !activeBranch) || record?.ready === true;
    if (!status.hidden) {
      status.querySelector('span').textContent = record?.error || (activeBranch ? 'Creating ChatGPT branch…' : 'Opening Gemini temporary chat…');
      status.querySelector('button').hidden = !!activeBranch || !record?.error;
    }
    for (const [key, value] of frames) {
      value.frame.hidden = key !== frameKey();
      value.frame.style.visibility = (key === 'gemini' || key.startsWith('btw:')) && !value.ready ? 'hidden' : '';
    }
    askStatus(record?.askStatus || '⌖ focus input');
  }

  function createOrReplaceIframe() {
    ensureWindow();
    const previous = frames.get(frameKey());
    if (previous) {
      window.clearTimeout(previous.timer);
      previous.frame.remove();
    }
    const frame = document.createElement('iframe');
    const key = frameKey();
    frame.name = activeBranch ? `cgpt_helper_btw_${activeBranch.id}_${activeBranch.session}` : key === 'gemini' ? 'gemini_helper_overlay_frame' : FRAME_NAME;
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads');
    frame.allow = 'clipboard-read; clipboard-write; microphone';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.src = activeBranch ? activeBranch.url : key === 'gemini' ? 'https://gemini.google.com/app' : settings.targetUrl;
    const record = { frame, ready: key !== 'gemini' && !activeBranch, loaded: false, error: '', timer: null };
    frames.set(key, record);
    iframe = frame;
    if (key === 'gemini') {
      record.timer = window.setTimeout(() => {
        if (frames.get(key) !== record || record.ready) return;
        record.error = 'Gemini did not become ready. Sign in at gemini.google.com in a regular tab, check third-party cookie restrictions, then retry.';
        if (provider === key) renderProvider();
      }, 30000);
    }
    frame.addEventListener('load', () => {
      record.loaded = true;
      if (frameKey() === key && frames.get(key) === record && isOpen() && pendingFocus?.frame === frame) requestFocusPrompt();
    });
    shadow.querySelector('.body').appendChild(frame);
  }

  function show({ reload = false, focus = false, provider: nextProvider = provider, branch = null } = {}) {
    ensureWindow();
    if (nextProvider !== provider || branch?.id !== activeBranch?.id) {
      cancelAsk();
      cancelFocusPrompt();
    }
    provider = nextProvider;
    activeBranch = branch;
    host.setAttribute('data-open', 'true');
    writeSessionOpen(true);
    if (reload || !frames.has(frameKey())) createOrReplaceIframe();
    const record = frames.get(frameKey());
    record.used = ++frameUse;
    iframe = record.frame;
    pruneBranchFrames();
    renderProvider();
    if (focus && settings.focusPromptOnOpen) requestFocusPrompt();
  }

  // Composer drafts live only in the frame. Treat an unreadable frame as holding one.
  function hasDraft(record) {
    try {
      const input = record.frame.contentDocument?.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], [data-composer-markdown][contenteditable="true"]');
      if (!input) return !record.frame.contentDocument;
      return !!(input instanceof record.frame.contentWindow.HTMLTextAreaElement ? input.value : input.textContent).trim();
    } catch {
      return true;
    }
  }

  // Only ready branches with a persisted URL can be recreated from btw.js state.
  // Creating and local temporary branches would lose their conversation, and
  // unsent drafts would be lost, so keep those frames.
  function pruneBranchFrames() {
    const idle = [...frames].filter(([key, record]) =>
      key.startsWith('btw:') && key !== frameKey() && record.ready && record.reopenable && !hasDraft(record));
    idle.sort((a, b) => (b[1].used || 0) - (a[1].used || 0));
    for (const [key, record] of idle.slice(MAX_IDLE_BRANCH_FRAMES)) {
      window.clearTimeout(record.timer);
      record.frame.remove();
      frames.delete(key);
    }
  }

  function hide() {
    cancelAsk();
    cancelFocusPrompt();
    if (!host) return;
    host.setAttribute('data-open', 'false');
    writeSessionOpen(false);
  }

  function toggle(nextProvider = 'chatgpt') {
    if (isOpen() && nextProvider === provider) {
      if (settings.altKWhenOpen === 'focus') requestFocusPrompt();
      else hide();
      return;
    }
    show({ provider: nextProvider, focus: true });
  }

  function refresh() {
    cancelAsk();
    cancelFocusPrompt();
    show({ reload: true, focus: true });
  }

  function cancelFocusPrompt() {
    focusGeneration++;
    const request = pendingFocus;
    pendingFocus = null;
    if (request) for (const timer of request.timers) window.clearTimeout(timer);
    if (iframe) iframe.contentWindow?.postMessage({
      source: MESSAGE_SOURCE, action: 'cancelFocusPrompt', ...(request ? { requestId: request.id } : {})
    }, request?.origin || targetOrigin());
  }

  function requestFocusPrompt() {
    if (!iframe || pendingAsk) return;
    cancelFocusPrompt();
    const frame = iframe;
    const key = frameKey();
    const generation = focusGeneration;
    const origin = targetOrigin();
    const request = { frame, origin, id: generation, timers: [] };
    pendingFocus = request;
    const sendFocus = () => {
      if (pendingFocus !== request || frame !== iframe || generation !== focusGeneration || !isOpen() || !frames.get(key)?.ready || !frames.get(key)?.loaded) return;
      frame.focus();
      frame.contentWindow.postMessage({ source: MESSAGE_SOURCE, action: 'focusPrompt', requestId: request.id }, origin);
    };
    for (const delay of FOCUS_DELAYS) {
      request.timers.push(window.setTimeout(sendFocus, delay));
    }
  }

  window.addEventListener('message', (event) => {
    if (event.data?.source === MESSAGE_SOURCE && event.data.action === 'btwBranchReady') {
      const id = event.data.branchId;
      const record = frames.get(`btw:${id}`);
      if (!record || event.source !== record.frame.contentWindow || event.origin !== 'https://chatgpt.com' ||
          (event.data.url !== null && !/^https:\/\/chatgpt\.com\/c\/[a-zA-Z0-9-]+(?:\?temporary-chat=true)?$/.test(event.data.url || ''))) return;
      record.ready = true;
      record.reopenable = !!event.data.url;
      if (frameKey() === `btw:${id}`) renderProvider();
      else pruneBranchFrames();
      if (event.data.url) globalThis.cgptBtwBranchReady?.(id, event.data.url);
      return;
    }
    if (event.data?.source === MESSAGE_SOURCE && event.data.action === 'focusPromptResult') {
      const request = pendingFocus;
      if (!request || event.source !== request.frame.contentWindow || event.origin !== request.origin ||
          event.data.requestId !== request.id || event.data.focused !== true) return;
      for (const timer of request.timers) window.clearTimeout(timer);
      pendingFocus = null;
      return;
    }
    const record = frames.get('gemini');
    if (!record || event.source !== record.frame.contentWindow || event.origin !== 'https://gemini.google.com' ||
        event.data?.source !== MESSAGE_SOURCE || event.data.action !== 'geminiState') return;
    record.ready = event.data.ready === true;
    record.loaded = true;
    record.error = record.ready ? '' : (event.data.error || 'Opening Gemini temporary chat…');
    window.clearTimeout(record.timer);
    if (provider === 'gemini') {
      renderProvider();
      if (record.ready && isOpen() && pendingFocus?.frame === record.frame) requestFocusPrompt();
    }
  });

  let pendingAsk = null;

  function askStatus(text) {
    const record = frames.get(frameKey());
    if (record) record.askStatus = text;
    const label = shadow?.querySelector('.footer .muted');
    if (label) {
      label.setAttribute('role', 'status');
      label.textContent = text;
      label.title = text;
    }
  }

  function cancelAsk() {
    if (!pendingAsk) return;
    pendingAsk.controller.abort();
    chrome.runtime.sendMessage({ type: 'cancelSidebar' }).catch(() => {});
    pendingAsk = null;
  }

  // Shared only with this extension's other content scripts (isolated world).
  globalThis.cgptOpenBtw = async (branch, text = null) => {
    await ready;
    if (pendingAsk) return { message: 'The floating chat is busy. Try again.' };
    if (!branch || !/^[a-zA-Z0-9-]+$/.test(branch.id) || !/^[a-zA-Z0-9-]+$/.test(branch.session) ||
        !/^https:\/\/chatgpt\.com\/(?:c\/[a-zA-Z0-9-]+|branch\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+)(?:\?(?:surface=work|temporary-chat=true)(?:&temporary-chat=true)?)?$/.test(branch.url)) return;
    cancelFocusPrompt();
    show({ provider: 'chatgpt', branch, focus: !text });
    if (!text) return { ok: true };
    const request = { controller: new AbortController() };
    pendingAsk = request;
    askStatus('Creating branch…');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'askBtw', provider: 'chatgpt', branchId: branch.id, text, autoSend: true });
      if (request.controller.signal.aborted) return { message: 'Cancelled. Check the branch draft before retrying.' };
      askStatus(result?.message || 'Could not reach the branch. Your question remains in the main draft.');
      const record = frames.get(`btw:${branch.id}`);
      if (record && !record.ready) {
        record.error = result?.message || 'Branch creation failed. Close this window and keep your question in the main draft.';
        renderProvider();
      }
      return result;
    } catch {
      askStatus('Could not reach the branch. Your question remains in the main draft.');
      return { filled: false };
    } finally {
      if (pendingAsk === request) pendingAsk = null;
    }
  };

  globalThis.cgptAskInSidebar = async (text, requestedProvider = 'chatgpt', explainResponse = false) => {
    await ready;
    if (typeof text !== 'string' || !text.trim()) return;
    if (pendingAsk) return;
    if (!['chatgpt', 'gemini'].includes(requestedProvider)) return;
    if (explainResponse && requestedProvider !== 'gemini') return;
    cancelFocusPrompt();
    show({ provider: requestedProvider, focus: false });
    const controller = new AbortController();
    const request = { controller };
    pendingAsk = request;
    askStatus('Opening sidebar…');
    try {
      // Runtime routing keeps auto-send commands out of the page's message channel.
      const result = await chrome.runtime.sendMessage({
        type: explainResponse ? 'explainGemini' : 'askSidebar', provider: requestedProvider, text, autoSend: settings.autoSendAskInSidebar === true
      });
      if (!controller.signal.aborted) askStatus(result?.message || 'Could not fill sidebar. Please try again.');
    } catch {
      if (!controller.signal.aborted) askStatus('Could not reach sidebar. Please try again.');
    } finally {
      if (pendingAsk === request) pendingAsk = null;
    }
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !['toggleOverlay', 'refreshOverlay'].includes(message.type)) return false;
    if (!settings) {
      ready.then(() => {
        if (message.type === 'toggleOverlay') toggle(message.provider === 'gemini' ? 'gemini' : 'chatgpt');
        else refresh();
        sendResponse({ ok: true, open: isOpen() });
      }).catch(() => sendResponse({ ok: false }));
      return true;
    }

    if (message.type === 'toggleOverlay') {
      toggle(message.provider === 'gemini' ? 'gemini' : 'chatgpt');
      sendResponse({ ok: true, open: isOpen() });
      return false;
    }

    if (message.type === 'refreshOverlay') {
      refresh();
      sendResponse({ ok: true, open: isOpen() });
      return false;
    }

    return false;
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync') return;
    settings = await cgptLoadSettings();
    if ('windowWidth' in changes || 'windowHeight' in changes) applySize();
  });

  async function init() {
    settings = await cgptLoadSettings();
    provider = readSessionProvider();
    if (readSessionOpen()) show({ reload: true, focus: false });
  }

  const ready = init();
})();
