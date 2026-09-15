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
  let pendingFocusUntil = 0;

  function readSessionOpen() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  }

  function writeSessionOpen(value) {
    try {
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
      return new URL(settings.targetUrl).origin;
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
          <div class="body"></div>
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

  function createOrReplaceIframe() {
    ensureWindow();

    const body = shadow.querySelector('.body');
    if (iframe) {
      iframe.remove();
      iframe = null;
    }

    iframe = document.createElement('iframe');
    iframe.name = FRAME_NAME;
    // Keep navigation inside the overlay; do not permit popups or top navigation.
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads');
    iframe.allow = 'clipboard-read; clipboard-write; microphone';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.src = settings.targetUrl;

    iframe.addEventListener('load', () => {
      if (Date.now() < pendingFocusUntil) requestFocusPrompt();
    });

    body.appendChild(iframe);
  }

  function show({ reload = false, focus = false } = {}) {
    ensureWindow();
    host.setAttribute('data-open', 'true');
    writeSessionOpen(true);

    if (reload || !iframe) createOrReplaceIframe();
    if (focus && settings.focusPromptOnOpen) requestFocusPrompt();
  }

  function hide() {
    if (!host) return;
    host.setAttribute('data-open', 'false');
    writeSessionOpen(false);
  }

  function toggle() {
    if (isOpen()) {
      if (settings.altKWhenOpen === 'focus') requestFocusPrompt();
      else hide();
      return;
    }
    show({ reload: !iframe, focus: true });
  }

  function refresh() {
    show({ reload: true, focus: true });
  }

  function requestFocusPrompt() {
    if (!iframe) return;
    pendingFocusUntil = Date.now() + 8000;

    const origin = targetOrigin();
    for (const delay of FOCUS_DELAYS) {
      window.setTimeout(() => {
        if (!iframe || !isOpen()) return;
        try {
          iframe.focus();
        } catch {
          // ignore
        }
        try {
          iframe.contentWindow.postMessage({ source: MESSAGE_SOURCE, action: 'focusPrompt' }, origin);
        } catch {
          // ignore
        }
      }, delay);
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !['toggleOverlay', 'refreshOverlay'].includes(message.type)) return false;
    if (!settings) {
      ready.then(() => {
        if (message.type === 'toggleOverlay') toggle();
        else refresh();
        sendResponse({ ok: true, open: isOpen() });
      }).catch(() => sendResponse({ ok: false }));
      return true;
    }

    if (message.type === 'toggleOverlay') {
      toggle();
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
    if (readSessionOpen()) show({ reload: true, focus: false });
  }

  const ready = init();
})();
