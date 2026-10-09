// Runs inside the chatgpt.com iframe created by content/overlay.js.
// Hides the sidebar and focuses the prompt input on request.
(function () {
  'use strict';

  const FRAME_NAME = 'cgpt_helper_overlay_frame';
  const MESSAGE_SOURCE = 'cgpt-helper';
  const STYLE_ID = 'cgpt-helper-hide-sidebar-style';
  const HTML_CLASS = 'cgpt-helper-embedded';

  const branchIdentity = /^cgpt_helper_btw_([a-zA-Z0-9-]+)_([a-zA-Z0-9-]+)$/.exec(window.name);
  const branchId = branchIdentity?.[1];
  if (window.top === window.self || (window.name !== FRAME_NAME && !branchId)) return;
  // The native branch route falls back to the source conversation on failure.
  // Never treat that fallback as a successful branch or submit into it.
  const sourceConversation = branchIdentity?.[2] || null;
  const branchReady = () => !branchId || (!!/^\/c\/(?:[a-zA-Z0-9-]+|local-chatgpt(?:%3A|:)[a-zA-Z0-9-]+)$/i.test(location.pathname) &&
    location.pathname !== `/c/${sourceConversation}`);

  function injectSidebarCss() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Hide the layout container, not just the history inside it. */
      html.${HTML_CLASS} #stage-slideover-sidebar,
      html.${HTML_CLASS} #stage-sidebar-tiny-bar,
      html.${HTML_CLASS} [data-testid="sidebar"],
      html.${HTML_CLASS} [data-testid="left-sidebar"],
      html.${HTML_CLASS} [aria-label="Chat history"],
      html.${HTML_CLASS} nav[aria-label*="Chat" i],
      html.${HTML_CLASS} aside {
        display: none !important;
        visibility: hidden !important;
        width: 0 !important;
        min-width: 0 !important;
        max-width: 0 !important;
      }
      html.${HTML_CLASS} body {
        overflow-x: hidden !important;
      }
    `;

    document.documentElement.classList.add(HTML_CLASS);
    document.documentElement.appendChild(style);
  }

  function removeSidebarCss() {
    document.getElementById(STYLE_ID)?.remove();
    document.documentElement.classList.remove(HTML_CLASS);
  }

  function findPromptInput() {
    if (globalThis.cgptChatContext?.getInput) return globalThis.cgptChatContext.getInput();
    return (
      document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]') ||
      document.querySelector('[data-composer-markdown][contenteditable="true"]') ||
      document.querySelector('textarea[placeholder]') ||
      document.querySelector('main textarea') ||
      document.querySelector('div[contenteditable="true"][id*="prompt"]') ||
      document.querySelector('main div[contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"]')
    );
  }

  function focusElement(el) {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }

  function moveCaretToEnd(el) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
      return;
    }
    if (el.isContentEditable) {
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  let focusTimer = null;
  let focusRequest = null;

  function cancelFocusPrompt(requestId) {
    if (requestId !== undefined && focusRequest?.id !== requestId) return;
    if (focusTimer !== null) window.clearInterval(focusTimer);
    focusTimer = null;
    focusRequest = null;
  }

  function focusPromptInputWhenReady(requestId, origin) {
    cancelFocusPrompt();
    if (activeFill) return;
    const request = { id: requestId };
    focusRequest = request;
    let attempts = 0;
    const attempt = () => {
      if (focusRequest !== request || activeFill) { cancelFocusPrompt(); return true; }
      attempts += 1;
      const input = findPromptInput();

      if (input && !input.disabled && input.getClientRects().length) {
        if (document.activeElement !== input) {
          focusElement(input);
          if (document.activeElement === input) moveCaretToEnd(input);
        }
        if (document.activeElement === input) {
          cancelFocusPrompt();
          window.parent.postMessage({ source: MESSAGE_SOURCE, action: 'focusPromptResult', requestId, focused: true }, origin);
          return true;
        }
      }

      if (attempts >= 80) {
        cancelFocusPrompt();
        return true;
      }
      return false;
    };
    if (!attempt()) focusTimer = window.setInterval(attempt, 150);
  }

  async function applySettings() {
    const settings = await cgptLoadSettings();
    if (settings.hideChatgptSidebar) injectSidebarCss();
    else removeSidebarCss();
    return settings;
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || data.source !== MESSAGE_SOURCE) return;
    if (data.action === 'cancelFocusPrompt') cancelFocusPrompt(data.requestId);
    else if (data.action === 'focusPrompt' && Number.isSafeInteger(data.requestId)) focusPromptInputWhenReady(data.requestId, event.origin === 'null' ? '*' : event.origin);
  });

  let activeFill = null;
  const handled = new Set();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (text) => text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
  function inputText(el) {
    if (el instanceof HTMLTextAreaElement) return el.value;
    const read = (node) => {
      if (node.nodeType === 3) return node.nodeValue;
      if (node.nodeName === 'BR') return node.classList.contains('ProseMirror-trailingBreak') ? '' : '\n';
      return [...node.childNodes].map(read).join('');
    };
    return [...el.childNodes].map(read).join('\n');
  }
  const generating = () => !!document.querySelector('[data-testid="stop-button"], button[aria-label="Stop answering"], button[aria-label="停止產生"], button[aria-label="停止生成"], form[data-thread-find-composer] button:is([aria-label="Stop"], [aria-label="停止"])');

  async function fillSelection(message) {
    if (handled.has(message.id) || activeFill) return { message: 'Selection already handled or sidebar busy.' };
    handled.add(message.id);
    const operation = { id: message.id, cancelled: false };
    cancelFocusPrompt();
    activeFill = operation;
    try {
      let input;
      const deadline = Date.now() + 10000;
      let wasGenerating = generating();
      while (!operation.cancelled && Date.now() < deadline) {
        input = findPromptInput();
        wasGenerating ||= generating();
        if (branchReady() && input && (input.isContentEditable || input instanceof HTMLTextAreaElement) &&
            !input.disabled && input.getClientRects().length) break;
        input = null;
        await sleep(150);
      }
      if (operation.cancelled) return { message: 'Cancelled.' };
      if (!input) return { message: 'No input found. Check sidebar sign-in, then try again.' };
      const draft = inputText(input);
      const hasDraft = !!normalize(draft);
      const addition = (hasDraft ? '\n\n' : '') + message.text;
      const expected = (hasDraft ? draft : '') + addition;
      focusElement(input);
      moveCaretToEnd(input);
      if (input instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, expected);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        // insertText updates ProseMirror's document and undo history, not just its DOM.
        if (!document.execCommand('insertText', false, addition)) {
          return { message: 'Could not fill sidebar. Please paste the selection manually.' };
        }
      }
      // The insert is usually visible at once; allow a short settle before failing.
      for (let wait = 0; wait < 200 && normalize(inputText(input)) !== normalize(expected); wait += 20) await sleep(20);
      if (normalize(inputText(input)) !== normalize(expected)) {
        return { message: 'Could not verify the draft. Please check it before sending.' };
      }
      if (operation.cancelled) return { message: 'Cancelled.', filled: true };
      if (!branchReady()) return { message: 'Branch creation failed. Check the floating chat.', filled: false };
      if (hasDraft || wasGenerating || generating() || !message.autoSend) {
        return { filled: true, message: hasDraft ? 'Added to existing draft · review before sending.' : 'Selection added · ready for your question.' };
      }
      const sendDeadline = Date.now() + 3000;
      while (!operation.cancelled && Date.now() < sendDeadline) {
        if (!branchReady() || !input.isConnected || normalize(inputText(input)) !== normalize(expected) || generating()) break;
        const button = input.closest?.('form')?.querySelector('[data-testid="send-button"], #composer-submit-button, button[type="submit"]') ||
          document.querySelector('[data-testid="send-button"], #composer-submit-button, form[data-thread-find-composer] button[type="submit"]');
        if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' && button.getClientRects().length) {
          button.click();
          return { filled: true, sent: true, message: branchId ? 'BTW question sent.' : 'Selection sent.' };
        }
        // ChatGPT enables the send button shortly after the editor state syncs.
        await sleep(20);
      }
      return { filled: true, message: 'Selection filled · please send when ready.' };
    } catch {
      return { message: 'Could not fill sidebar. Check the draft before trying again.' };
    } finally {
      activeFill = null;
    }
  }

  function registerFrame() {
    chrome.runtime.sendMessage({ type: 'sidebarFrameIdentity', provider: 'chatgpt', ...(branchId ? { branchId } : {}) }).catch(() => {});
  }
  registerFrame();
  if (branchId) {
    let checks = 0;
    let reportedPath = null;
    const report = () => {
      if (branchReady()) {
        const temporary = new URLSearchParams(location.search).get('temporary-chat') === 'true' || new URLSearchParams(location.search).get('training_disabled') === 'true';
        const path = `${location.pathname}${temporary ? '?temporary-chat=true' : ''}`;
        if (path === reportedPath) return true;
        reportedPath = path;
        // Local thread URLs cannot be reopened after reload. Report readiness now;
        // save a URL only after ChatGPT assigns its persisted conversation ID.
        const url = /^\/c\/local-chatgpt(?:%3A|:)/i.test(location.pathname) ? null : `https://chatgpt.com${path}`;
        registerFrame();
        let parentOrigin = 'https://chatgpt.com';
        try {
          const referrerOrigin = new URL(document.referrer).origin;
          if (['https://chatgpt.com', 'https://chat.openai.com'].includes(referrerOrigin)) parentOrigin = referrerOrigin;
        } catch {}
        window.parent.postMessage({ source: MESSAGE_SOURCE, action: 'btwBranchReady', branchId,
          url }, parentOrigin);
        return true;
      }
      return ++checks >= 120;
    };
    if (!report()) {
      const timer = window.setInterval(() => { if (report()) window.clearInterval(timer); }, 300);
    }
    // ChatGPT may replace its initial client ID with the persisted conversation ID after sending.
    new MutationObserver(() => {
      if (`${location.pathname}${location.search || ''}` !== reportedPath) report();
    }).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', report);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message?.provider && message.provider !== 'chatgpt') return false;
    if ((message?.branchId || undefined) !== branchId) return false;
    if (message?.type === 'sidebarDiscover') { registerFrame(); return false; }
    if (message?.type === 'sidebarProbe') {
      sendResponse({ ready: branchReady(), provider: 'chatgpt', ...(branchId ? { branchId } : {}) });
      return false;
    }
    if (message?.type === 'sidebarCancel') {
      if (activeFill?.id === message.id) activeFill.cancelled = true;
      return false;
    }
    if (message?.type !== 'sidebarFill' || typeof message.id !== 'string' ||
        typeof message.text !== 'string' || !message.text.trim()) return false;
    fillSelection(message).then(sendResponse);
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && 'hideChatgptSidebar' in changes) applySettings();
  });

  applySettings();
})();
