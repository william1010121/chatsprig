// Runs inside the Claude and Grok iframes created by content/overlay.js.
// Hides the sidebar, enters Grok private mode, reports private state, and focuses the prompt.
(function () {
  'use strict';

  const FRAME_NAMES = { chatsprig_claude_frame: 'claude', chatsprig_grok_frame: 'grok' };
  const MESSAGE_SOURCE = 'cgpt-helper';
  const STYLE_ID = 'chatsprig-assistant-sidebar';
  const HTML_CLASS = 'chatsprig-assistant-compact';
  const provider = FRAME_NAMES[window.name];
  if (window.top === window.self || !provider) return;

  let settings = {};
  let focusRequest = null;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Claude reserves the sidebar width as padding on its content frame; Grok sizes
  // its content from --sidebar-width. Both must collapse with the sidebar.
  function applySettings() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        html.${HTML_CLASS} .dframe-root > div > aside,
        html.${HTML_CLASS} aside[aria-label="Sidebar"],
        html.${HTML_CLASS} .peer:has(> * > [data-sidebar="sidebar"]) { display: none !important; }
        html.${HTML_CLASS} .dframe-content-inner { padding-left: 0 !important; }
        html.${HTML_CLASS} [style*="--sidebar-width"] { --sidebar-width: 0px !important; }
        /* Claude's incognito header and inset frame shrink the already small window. */
        .animate-incognito-header-in, .animate-incognito-frame-in { display: none !important; }
        #main-content:has(~ .animate-incognito-frame-in) { padding: 0 !important; }
      `;
      document.documentElement.appendChild(style);
    }
    document.documentElement.classList.toggle(HTML_CLASS, settings.hideChatgptSidebar === true);
  }

  // Claude encodes incognito in the URL; Grok paints its composer with an incognito surface.
  const isPrivate = () => provider === 'claude'
    ? new URLSearchParams(location.search).has('incognito')
    : !!document.querySelector('.bg-surface-incognito');

  let reported = null;
  function report() {
    reported = isPrivate();
    window.cgptSetFramePrivacyReady?.(settings.privateAssistantChats === false || reported,
      () => settings.privateAssistantChats === false || isPrivate());
    window.parent.postMessage({ source: MESSAGE_SOURCE, action: 'assistantState', provider, private: reported }, '*');
  }

  // Leaving private mode in-app (SPA navigation or the header switch) must update the
  // overlay title, so keep reporting whenever the state changes after the first report.
  function watchPrivateState() {
    setInterval(() => {
      // A trusted event may have relocked the document during a brief mode loss
      // that ended between polls. Resync interactivity even if the title is unchanged.
      window.cgptSetFramePrivacyReady?.(settings.privateAssistantChats === false || isPrivate(),
        () => settings.privateAssistantChats === false || isPrivate());
      if (isPrivate() !== reported) report();
    }, 1000);
  }

  // Grok has no private URL. Its own Ctrl+Shift+J shortcut sets (never toggles) private
  // mode on a new chat; the header switch is the fallback.
  async function enterGrokPrivate() {
    const deadline = Date.now() + 20000;
    let attempts = 0;
    while (Date.now() < deadline) {
      if (isPrivate()) return true;
      if (findPromptInput()) {
        attempts += 1;
        const toggle = attempts > 2 && document.querySelector('a[href$="#private"]');
        if (toggle) toggle.click();
        else document.body.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'J', code: 'KeyJ', keyCode: 74, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true
        }));
        await sleep(600);
      } else {
        await sleep(250);
      }
    }
    return isPrivate();
  }

  function findPromptInput() {
    const candidates = document.querySelectorAll(
      'div.ProseMirror[contenteditable="true"], [data-testid="chat-input"] [contenteditable="true"], textarea, [contenteditable="true"][role="textbox"]'
    );
    return [...candidates].find((el) => !el.disabled && el.getClientRects().length) || null;
  }

  function moveCaretToEnd(el) {
    if (el instanceof HTMLTextAreaElement) {
      el.setSelectionRange(el.value.length, el.value.length);
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function tryFocusPrompt() {
    if (!focusRequest) return;
    const input = findPromptInput();
    if (!input) return;
    if (document.activeElement !== input) {
      input.focus({ preventScroll: true });
      if (document.activeElement !== input) return;
      moveCaretToEnd(input);
    }
    const { requestId } = focusRequest;
    focusRequest = null;
    observer.disconnect();
    window.parent.postMessage({ source: MESSAGE_SOURCE, action: 'focusPromptResult', requestId, focused: true }, '*');
  }

  // The composer mounts after hydration; wait for it instead of polling.
  const observer = new MutationObserver(tryFocusPrompt);

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.source !== MESSAGE_SOURCE) return;
    if (event.data.action === 'focusPrompt') {
      focusRequest = { requestId: event.data.requestId };
      observer.observe(document.documentElement, { childList: true, subtree: true });
      tryFocusPrompt();
    }
    if (event.data.action === 'cancelFocusPrompt' &&
        (event.data.requestId === undefined || focusRequest?.requestId === event.data.requestId)) {
      focusRequest = null;
      observer.disconnect();
    }
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync' || !changes.hideChatgptSidebar) return;
    settings = await cgptLoadSettings();
    applySettings();
  });

  (async () => {
    settings = await cgptLoadSettings();
    applySettings();
    if (provider === 'grok' && settings.privateAssistantChats === true) await enterGrokPrivate();
    report();
  })().catch(report).finally(watchPrivateState);
})();
