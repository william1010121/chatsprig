// Runs inside the chatgpt.com iframe created by content/overlay.js.
// Hides the sidebar and focuses the prompt input on request.
(function () {
  'use strict';

  const FRAME_NAME = 'cgpt_helper_overlay_frame';
  const MESSAGE_SOURCE = 'cgpt-helper';
  const STYLE_ID = 'cgpt-helper-hide-sidebar-style';
  const HTML_CLASS = 'cgpt-helper-embedded';

  if (window.top === window.self || window.name !== FRAME_NAME) return;

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
    return (
      document.querySelector('#prompt-textarea') ||
      document.querySelector('[data-testid="prompt-textarea"]') ||
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

  function focusPromptInputWhenReady() {
    if (focusTimer) window.clearInterval(focusTimer);

    let attempts = 0;
    focusTimer = window.setInterval(() => {
      attempts += 1;
      const input = findPromptInput();

      if (input) {
        focusElement(input);
        moveCaretToEnd(input);
        window.clearInterval(focusTimer);
        focusTimer = null;
        return;
      }

      if (attempts >= 80) {
        window.clearInterval(focusTimer);
        focusTimer = null;
      }
    }, 150);
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
    if (data.action === 'focusPrompt') focusPromptInputWhenReady();
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
  const generating = () => !!document.querySelector('[data-testid="stop-button"], button[aria-label="Stop answering"], button[aria-label="停止產生"], button[aria-label="停止生成"]');

  async function fillSelection(message) {
    if (handled.has(message.id) || activeFill) return { message: 'Selection already handled or sidebar busy.' };
    handled.add(message.id);
    const operation = { id: message.id, cancelled: false };
    activeFill = operation;
    try {
      let input;
      const deadline = Date.now() + 10000;
      let wasGenerating = generating();
      while (!operation.cancelled && Date.now() < deadline) {
        input = findPromptInput();
        wasGenerating ||= generating();
        if (input && (input.isContentEditable || input instanceof HTMLTextAreaElement) &&
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
      await sleep(100);
      if (normalize(inputText(input)) !== normalize(expected)) {
        return { message: 'Could not verify the draft. Please check it before sending.' };
      }
      if (hasDraft || wasGenerating || generating() || !message.autoSend) {
        return { message: hasDraft ? 'Added to existing draft · review before sending.' : 'Selection added · ready for your question.' };
      }
      const sendDeadline = Date.now() + 3000;
      while (!operation.cancelled && Date.now() < sendDeadline) {
        if (!input.isConnected || normalize(inputText(input)) !== normalize(expected) || generating()) break;
        const button = document.querySelector('[data-testid="send-button"], #composer-submit-button');
        if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' && button.getClientRects().length) {
          button.click();
          return { message: 'Selection sent.' };
        }
        await sleep(100);
      }
      return { message: 'Selection filled · please send when ready.' };
    } catch {
      return { message: 'Could not fill sidebar. Check the draft before trying again.' };
    } finally {
      activeFill = null;
    }
  }

  function registerFrame() {
    chrome.runtime.sendMessage({ type: 'sidebarFrameIdentity', provider: 'chatgpt' }).catch(() => {});
  }
  registerFrame();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message?.provider && message.provider !== 'chatgpt') return false;
    if (message?.type === 'sidebarDiscover') { registerFrame(); return false; }
    if (message?.type === 'sidebarProbe') {
      sendResponse({ ready: true, provider: 'chatgpt' });
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

  applySettings().then((settings) => {
    if (settings.focusPromptOnOpen) focusPromptInputWhenReady();
  });
})();
