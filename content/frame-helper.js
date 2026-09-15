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
    if (!data || data.source !== MESSAGE_SOURCE) return;
    if (data.action === 'focusPrompt') focusPromptInputWhenReady();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && 'hideChatgptSidebar' in changes) applySettings();
  });

  applySettings().then((settings) => {
    if (settings.focusPromptOnOpen) focusPromptInputWhenReady();
  });
})();
