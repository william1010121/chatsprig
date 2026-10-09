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
          min-width: min(380px, calc(96vw - 60px));
          min-height: 420px;
          max-width: calc(96vw - 60px);
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
        .stage {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          pointer-events: none;
        }
        /* Floating dock beside the window: one button per live chat. */
        .rail {
          pointer-events: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 6px;
          max-height: 88vh;
          box-sizing: border-box;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: none;
          background: rgba(17, 24, 39, 0.94);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.32);
          -webkit-backdrop-filter: blur(12px);
          backdrop-filter: blur(12px);
        }
        .rail::-webkit-scrollbar { display: none; }
        .rail hr {
          width: 22px;
          margin: 2px 0;
          border: 0;
          border-top: 1px solid rgba(255, 255, 255, 0.14);
        }
        .rail .chat {
          position: relative;
          flex: 0 0 auto;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          color: #d1d5db;
          font-size: 13px;
          font-weight: 600;
          transition: background-color 0.15s, color 0.15s, transform 0.15s;
        }
        .rail .chat:hover { background: rgba(255, 255, 255, 0.1); color: #ffffff; }
        .rail .chat:active { transform: scale(0.94); }
        .rail .chat:focus-visible { outline: 2px solid #93c5fd; outline-offset: 1px; }
        .rail .chat[aria-current="true"] { background: #ffffff; color: #111827; }
        .rail .chat[aria-current="true"]::before {
          content: "";
          position: absolute;
          left: -5px;
          top: 9px;
          bottom: 9px;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: #ffffff;
        }
        .rail .chat.branch { color: #ffffff; }
        .rail .chat.branch > span {
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          border-radius: 7px;
          background: var(--chip, #6366f1);
          font-size: 12px;
        }
        .rail .chat[data-hue="0"] { --chip: #6366f1; }
        .rail .chat[data-hue="1"] { --chip: #0ea5e9; }
        .rail .chat[data-hue="2"] { --chip: #10b981; }
        .rail .chat[data-hue="3"] { --chip: #f59e0b; }
        .rail .chat[data-hue="4"] { --chip: #ef4444; }
        .rail .chat[data-hue="5"] { --chip: #d946ef; }
        .rail .item { position: relative; flex: 0 0 auto; }
        /* Hover or focus reveals a badge that drops the chat from the dock. */
        .rail .dismiss {
          position: absolute;
          top: -5px;
          right: -5px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #4b5563;
          color: #ffffff;
          font-size: 11px;
          box-shadow: 0 0 0 1.5px rgba(17, 24, 39, 0.94);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.12s, background-color 0.12s;
        }
        .rail .item:hover .dismiss, .rail .item:focus-within .dismiss { opacity: 1; pointer-events: auto; }
        .rail .dismiss:hover { background: #ef4444; }
        .rail .dismiss:focus-visible { opacity: 1; outline: 2px solid #93c5fd; outline-offset: 1px; }
        /* Labels open toward the window, so the viewport edge never clips them. */
        .rail-tip {
          position: fixed;
          z-index: 1;
          max-width: 280px;
          padding: 6px 10px;
          border-radius: 8px;
          background: #111827;
          color: #ffffff;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
          font-size: 12px;
          font-weight: 500;
          line-height: 1.4;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          transform: translate(-100%, -50%);
        }
        .rail-tip[hidden] { display: none; }
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
      <div class="overlay"><div class="stage">
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
        <nav class="rail" aria-label="Open chats"></nav>
      </div></div>
      <div class="rail-tip" role="tooltip" hidden></div>
    `;

    shadow.addEventListener('click', (event) => {
      const button = event.target instanceof Element ? event.target.closest('button[data-action]') : null;
      if (!button) return;

      const action = button.getAttribute('data-action');
      if (action === 'focus') requestFocusPrompt();
      else if (action === 'refresh') refresh();
      else if (action === 'close') hide();
      else if (action === 'switch') switchTo(button.dataset.key);
      else if (action === 'dismiss') dismiss(button.dataset.key);
    });
    const railButton = event => event.target instanceof Element ? event.target.closest('.rail button') : null;
    shadow.addEventListener('pointerover', event => showRailTip(railButton(event)));
    shadow.addEventListener('focusin', event => showRailTip(railButton(event)));
    shadow.addEventListener('pointerout', hideRailTip);
    shadow.addEventListener('focusout', hideRailTip);
    shadow.addEventListener('scroll', hideRailTip, { capture: true, passive: true });

    document.documentElement.appendChild(host);
    applySize();
  }

  function applySize() {
    const win = shadow?.querySelector('.window');
    if (!win || !settings) return;
    win.style.width = `min(${Number(settings.windowWidth) || 1100}px, calc(94vw - 60px))`;
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
    renderRail();
  }

  const RAIL_ICONS = {
    chatgpt: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    gemini: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C10.8 8.3 8.3 10.8 2 12c6.3 1.2 8.8 3.7 10 10 1.2-6.3 3.7-8.8 10-10-6.3-1.2-8.8-3.7-10-10Z" fill="currentColor"/></svg>'
  };

  // One button per live frame, so switching never recreates a conversation.
  function renderRail() {
    const rail = shadow.querySelector('.rail');
    // Rebuilding drops the focused button; hand focus to its replacement.
    const focusedKey = shadow.activeElement?.closest?.('.rail .chat')?.dataset.key;
    hideRailTip();
    rail.replaceChildren();
    let branches = 0;
    const entries = [...frames].sort(([, a], [, b]) => Number(!!a.branch) - Number(!!b.branch));
    for (const [key, record] of entries) {
      const branch = record.branch;
      if (branch && !branches++ && rail.childElementCount) rail.appendChild(document.createElement('hr'));
      const item = document.createElement('div');
      item.className = 'item';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chat';
      button.dataset.action = 'switch';
      button.dataset.key = key;
      const label = branch ? `BTW · ${branch.title}` : key === 'gemini' ? 'Gemini temporary chat' : 'ChatGPT temporary chat';
      button.dataset.label = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-current', String(key === frameKey()));
      if (branch) {
        button.className = 'chat branch';
        button.dataset.hue = String([...branch.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6);
        const chip = document.createElement('span');
        chip.textContent = [...(branch.title || '').trim()][0] || '↳';
        button.appendChild(chip);
      } else {
        button.innerHTML = RAIL_ICONS[key] || RAIL_ICONS.chatgpt;
      }
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'dismiss';
      close.dataset.action = 'dismiss';
      close.dataset.key = key;
      close.dataset.label = `Close ${label}`;
      close.setAttribute('aria-label', `Close ${label}`);
      close.textContent = '×';
      item.appendChild(button);
      item.appendChild(close);
      rail.appendChild(item);
      if (key === focusedKey) button.focus({ preventScroll: true });
    }
  }

  function showRailTip(button) {
    const tip = shadow.querySelector('.rail-tip');
    if (!button) { tip.hidden = true; return; }
    const rail = shadow.querySelector('.rail').getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    tip.textContent = button.dataset.label;
    tip.style.left = `${rail.left - 8}px`;
    tip.style.top = `${rect.top + rect.height / 2}px`;
    tip.style.maxWidth = `${Math.max(120, Math.min(280, rail.left - 16))}px`;
    tip.hidden = false;
  }

  function hideRailTip() {
    const tip = shadow?.querySelector('.rail-tip');
    if (tip) tip.hidden = true;
  }

  // Drops a live frame from the dock. ChatGPT keeps persisted branch conversations,
  // which stay reopenable from the Branches list; temporary chats end like Alt+N.
  function dismiss(key) {
    const record = frames.get(key);
    if (!record) return;
    // Until ChatGPT assigns a persisted ID, the branch lives only in this frame.
    const loss = !record.branch ? '' : !record.reopenable ? 'This branch cannot be reopened yet, so its conversation will be lost.' :
      frameBusy(record) ? 'Its unsent draft or response in progress will be lost.' : '';
    if (loss && !window.confirm(`Close “${record.branch.title}”? ${loss}`)) return;
    const current = key === frameKey();
    if (current) { cancelAsk(); cancelFocusPrompt(); }
    window.clearTimeout(record.timer);
    record.frame.remove();
    frames.delete(key);
    if (current) {
      const next = [...frames].sort(([, a], [, b]) => (b.used || 0) - (a.used || 0))[0]?.[0];
      if (next) {
        const nextRecord = frames.get(next);
        if (nextRecord.branch) show({ provider: 'chatgpt', branch: nextRecord.branch, focus: true });
        else show({ provider: next, focus: true });
        return;
      }
      hide();
      activeBranch = null; iframe = null;
    }
    renderRail();
  }

  function switchTo(key) {
    const record = frames.get(key);
    if (!record || key === frameKey()) return;
    if (record.branch) show({ provider: 'chatgpt', branch: record.branch, focus: true });
    else show({ provider: key, focus: true });
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
    // Response links use target=_blank. Popups escape the sandbox so they open as normal tabs.
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox');
    frame.allow = 'clipboard-read; clipboard-write; microphone';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.src = activeBranch ? activeBranch.url : key === 'gemini' ? 'https://gemini.google.com/app' : settings.targetUrl;
    const record = { frame, branch: activeBranch, ready: key !== 'gemini' && !activeBranch, loaded: false, error: '', timer: null };
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

  // Unsent drafts, attachments and in-flight responses live only in the frame.
  // Treat an unreadable frame as busy.
  function frameBusy(record) {
    try {
      const doc = record.frame.contentDocument;
      if (!doc) return true;
      if (doc.querySelector('[data-testid="stop-button"], button[aria-label="Stop answering"], button[aria-label="停止產生"], button[aria-label="停止生成"], form[data-thread-find-composer] button:is([aria-label="Stop"], [aria-label="停止"])')) return true;
      const input = doc.querySelector('#prompt-textarea, [data-testid="prompt-textarea"], [data-composer-markdown][contenteditable="true"]');
      if (!input) return false;
      if ((input instanceof record.frame.contentWindow.HTMLTextAreaElement ? input.value : input.textContent).trim()) return true;
      const composer = input.closest('form') || input.parentElement;
      return !!composer?.querySelector('img, [data-testid*="attachment"], [data-testid*="composer-files"], button[aria-label^="Remove file"]') ||
        [...(composer?.querySelectorAll('input[type="file"]') || [])].some(file => file.files?.length);
    } catch {
      return true;
    }
  }

  // Only ready branches with a persisted URL can be recreated from btw.js state.
  // Creating and local temporary branches would lose their conversation, and
  // busy frames would lose unsent or streaming content, so keep those frames.
  function pruneBranchFrames() {
    const idle = [...frames].filter(([key, record]) =>
      key.startsWith('btw:') && key !== frameKey() && record.ready && record.reopenable && !frameBusy(record));
    idle.sort((a, b) => (b[1].used || 0) - (a[1].used || 0));
    for (const [key, record] of idle.slice(MAX_IDLE_BRANCH_FRAMES)) {
      window.clearTimeout(record.timer);
      record.frame.remove();
      frames.delete(key);
    }
    if (idle.length > MAX_IDLE_BRANCH_FRAMES) renderRail();
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

  // The sidebar's Clean deleted these chats. Drop their branch frames; a deleted branch
  // that is showing gives way to the main ChatGPT chat.
  globalThis.cgptCloseBtwChats = chats => {
    const gone = new Set(chats);
    const chatOf = record => {
      try {
        const id = /^\/c\/([a-zA-Z0-9-]+)/.exec(record.frame.contentWindow.location.pathname)?.[1];
        if (id) return id;
      } catch {}
      return /^https:\/\/chatgpt\.com\/c\/([a-zA-Z0-9-]+)/.exec(record.branch?.url || '')?.[1] || null;
    };
    let showing = false, changed = false;
    for (const [key, record] of [...frames]) {
      if (!key.startsWith('btw:') || !gone.has(chatOf(record))) continue;
      if (key === frameKey()) showing = true;
      window.clearTimeout(record.timer);
      record.frame.remove();
      frames.delete(key);
      changed = true;
    }
    if (showing) {
      if (isOpen()) show({ provider: 'chatgpt' });
      else { cancelAsk(); cancelFocusPrompt(); activeBranch = null; iframe = null; }
    }
    if (changed) renderRail();
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
