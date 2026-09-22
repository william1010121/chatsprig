// Centered in-page ChatGPT overlay (top frame only, every site).
(function () {
  'use strict';

  if (window.top !== window.self) return;

  const HOST_ID = 'cgpt-helper-overlay';
  const FRAME_NAME = 'cgpt_helper_overlay_frame';
  const MESSAGE_SOURCE = 'cgpt-helper';
  const SESSION_KEY = 'cgptHelperOverlayOpen';
  const FOCUS_DELAYS = [0, 80, 180, 350, 700, 1200, 2000, 3500];

  let host = null;
  let shadow = null;
  let iframe = null;
  let settings = null;
  let provider = 'chatgpt';
  const frames = new Map();
  let focusGeneration = 0;
  let pendingFocusUntil = 0;

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
    shadow.querySelector('.window').setAttribute('aria-label', `${label} temporary chat`);
    shadow.querySelector('.title').textContent = `ChatSprig · ${label} · Temporary Chat`;
    shadow.querySelector('[data-action="close"]').title = `Close: ${shortcut}`;
    shadow.querySelector('.footer span').textContent = `${shortcut} toggle · Alt+N new chat`;
    const record = frames.get(provider);
    const status = shadow.querySelector('.frame-status');
    status.hidden = !gemini || record?.ready === true;
    if (!status.hidden) {
      status.querySelector('span').textContent = record?.error || 'Opening Gemini temporary chat…';
      status.querySelector('button').hidden = !record?.error;
    }
    for (const [key, value] of frames) {
      value.frame.hidden = key !== provider;
      value.frame.style.visibility = key === 'gemini' && !value.ready ? 'hidden' : '';
    }
    askStatus(record?.askStatus || '⌖ focus input');
  }

  function createOrReplaceIframe() {
    ensureWindow();
    const previous = frames.get(provider);
    if (previous) {
      window.clearTimeout(previous.timer);
      previous.frame.remove();
    }
    const frame = document.createElement('iframe');
    const key = provider;
    frame.name = key === 'gemini' ? 'gemini_helper_overlay_frame' : FRAME_NAME;
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads');
    frame.allow = 'clipboard-read; clipboard-write; microphone';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.src = key === 'gemini' ? 'https://gemini.google.com/app' : settings.targetUrl;
    const record = { frame, ready: key !== 'gemini', loaded: false, error: '', timer: null };
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
      if (provider === key && frames.get(key) === record && isOpen() && Date.now() < pendingFocusUntil) requestFocusPrompt();
    });
    shadow.querySelector('.body').appendChild(frame);
  }

  function show({ reload = false, focus = false, provider: nextProvider = provider } = {}) {
    ensureWindow();
    if (nextProvider !== provider) {
      cancelAsk();
      focusGeneration++;
    }
    provider = nextProvider;
    host.setAttribute('data-open', 'true');
    writeSessionOpen(true);
    if (reload || !frames.has(provider)) createOrReplaceIframe();
    iframe = frames.get(provider).frame;
    renderProvider();
    if (focus && settings.focusPromptOnOpen) requestFocusPrompt();
  }

  function hide() {
    cancelAsk();
    focusGeneration++;
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
    focusGeneration++;
    show({ reload: true, focus: true });
  }

  function requestFocusPrompt() {
    if (!iframe) return;
    pendingFocusUntil = Date.now() + 8000;
    const frame = iframe;
    const key = provider;
    const generation = ++focusGeneration;
    const origin = targetOrigin();
    for (const delay of FOCUS_DELAYS) {
      window.setTimeout(() => {
        if (frame !== iframe || generation !== focusGeneration || !isOpen() || !frames.get(key)?.ready || !frames.get(key)?.loaded) return;
        frame.focus();
        frame.contentWindow.postMessage({ source: MESSAGE_SOURCE, action: 'focusPrompt' }, origin);
      }, delay);
    }
  }

  window.addEventListener('message', (event) => {
    const record = frames.get('gemini');
    if (!record || event.source !== record.frame.contentWindow || event.origin !== 'https://gemini.google.com' ||
        event.data?.source !== MESSAGE_SOURCE || event.data.action !== 'geminiState') return;
    record.ready = event.data.ready === true;
    record.loaded = true;
    record.error = record.ready ? '' : (event.data.error || 'Opening Gemini temporary chat…');
    window.clearTimeout(record.timer);
    if (provider === 'gemini') {
      renderProvider();
      if (record.ready && isOpen() && settings.focusPromptOnOpen) requestFocusPrompt();
    }
  });

  let pendingAsk = null;

  function askStatus(text) {
    const record = frames.get(provider);
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
  globalThis.cgptAskInSidebar = async (text, requestedProvider = 'chatgpt') => {
    await ready;
    if (typeof text !== 'string' || !text.trim()) return;
    if (pendingAsk) return;
    if (!['chatgpt', 'gemini'].includes(requestedProvider)) return;
    show({ provider: requestedProvider, focus: false });
    const controller = new AbortController();
    const request = { controller };
    pendingAsk = request;
    askStatus('Opening sidebar…');
    try {
      // Runtime routing keeps auto-send commands out of the page's message channel.
      const result = await chrome.runtime.sendMessage({
        type: 'askSidebar', provider: requestedProvider, text, autoSend: settings.autoSendAskInSidebar === true
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
