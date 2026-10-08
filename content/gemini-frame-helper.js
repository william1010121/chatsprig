// Gemini integration is active only in the extension-owned embedded frame.
(function () {
  'use strict';
  if (window.top === window.self || window.name !== 'gemini_helper_overlay_frame') return;
  const MESSAGE_SOURCE = 'cgpt-helper';
  let ready = false;
  let initialized = false;
  let focusRequest = null;
  let chatWindow = null;
  let settings = {};
  const isTemporaryWindow = (node) => !!node && node.isConnected !== false &&
    (node.classList ? node.classList.contains('is-temporary-chat') : !!document.querySelector('chat-window.is-temporary-chat'));
  const temporaryReady = () => ready && isTemporaryWindow(chatWindow);
  const findPromptInput = () => document.querySelector('.ql-editor[contenteditable="true"][role="textbox"]');
  const focusElement = (el) => el.focus({ preventScroll: true });
  function moveCaretToEnd(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
  function tryFocusPrompt() {
    if (!focusRequest || !temporaryReady() || activeFill) return;
    const input = findPromptInput();
    if (!input) return;
    if (document.activeElement !== input) {
      focusElement(input);
      if (document.activeElement !== input) return;
      moveCaretToEnd(input);
    }
    const { requestId } = focusRequest;
    focusRequest = null;
    if (requestId !== undefined) {
      window.parent.postMessage({ source: MESSAGE_SOURCE, action: 'focusPromptResult', requestId, focused: true }, '*');
    }
  }
  function focusPrompt(requestId) {
    if (activeFill) return;
    focusRequest = { requestId };
    tryFocusPrompt();
  }
  function report(error = '') {
    window.parent.postMessage({ source: MESSAGE_SOURCE, action: 'geminiState', ready: temporaryReady(), error }, '*');
  }
  function applySettings() {
    let style = document.getElementById('chatsprig-gemini-sidebar');
    if (!style) {
      style = document.createElement('style');
      style.id = 'chatsprig-gemini-sidebar';
      style.textContent = 'html.chatsprig-gemini-compact bard-sidenav { display: none !important; } html.chatsprig-gemini-compact mat-sidenav-content { margin-left: 0 !important; margin-right: 0 !important; }';
      document.documentElement.appendChild(style);
    }
    document.documentElement.classList.toggle('chatsprig-gemini-compact', settings.hideChatgptSidebar === true);
  }
  const MODEL_LABELS = {
    'flash-lite': /^(?:Gemini\s+)?(?:\d+(?:\.\d+)*\s+)?Flash[-\s]Lite$/i,
    flash: /^(?:Gemini\s+)?(?:\d+(?:\.\d+)*\s+)?Flash$/i,
    pro: /^(?:Gemini\s+)?(?:\d+(?:\.\d+)*\s+)?Pro$/i
  };
  async function selectDefaultModel(deadline) {
    const preferred = settings.geminiModel || 'current';
    if (preferred === 'current') return true;
    const pattern = MODEL_LABELS[preferred];
    if (!pattern) return false;
    let opened = false;
    let chosen = false;
    while (Date.now() < deadline) {
      const trigger = document.querySelector('[data-test-id="bard-mode-menu-button"]');
      const label = (trigger?.querySelector('.picker-secondary-text') || trigger?.querySelector('.picker-primary-text') ||
        trigger?.querySelector('[data-test-id="logo-pill-label-container"]'))?.textContent?.trim() || '';
      // A versionless trigger label is sufficient for Flash/Pro but must never confuse Flash with Flash-Lite.
      if (pattern.test(label) && (!opened || trigger.getAttribute('aria-expanded') !== 'true')) return true;
      if (trigger && !opened && !trigger.disabled && trigger.getAttribute('aria-disabled') !== 'true') {
        opened = true;
        (trigger.querySelector('button') || trigger).click();
      }
      if (opened && !chosen) {
        const options = [...document.querySelectorAll('[role="menuitem"][data-mode-id]')];
        const option = options.find(item => pattern.test(item.querySelector('.label')?.textContent?.trim() || ''));
        if (option && option.getAttribute('aria-disabled') !== 'true') {
          chosen = true;
          option.click();
        }
      }
      await sleep(150);
    }
    return false;
  }

  async function initialize() {
    settings = await cgptLoadSettings();
    applySettings();
    const deadline = Date.now() + 25000;
    let clicked = false;
    while (Date.now() < deadline) {
      if (document.querySelector('chat-window.is-temporary-chat') && findPromptInput()) {
        if (!await selectDefaultModel(deadline)) {
          report('The selected Gemini model is unavailable or could not be confirmed. Change Default Gemini model in ChatSprig Settings, then retry.');
          return;
        }
        chatWindow = document.querySelector('chat-window.is-temporary-chat');
        if (!isTemporaryWindow(chatWindow)) {
          report('Gemini left temporary mode. Start a new temporary chat to continue.');
          return;
        }
        temporaryObserver.observe(chatWindow, { attributes: true, attributeFilter: ['class'] });
        ready = initialized = true;
        report();
        tryFocusPrompt();
        return;
      }
      const button = document.querySelector('[data-test-id="temp-chat-button-container"] button') ||
        document.querySelector('button[aria-label="Temporary chat"], button[aria-label="臨時對話"], button[aria-label="临时对话"]');
      if (button && !clicked && !button.disabled && !document.querySelector('chat-window.is-temporary-chat')) {
        clicked = true;
        button.click();
      }
      await sleep(150);
    }
    report('Could not enable Gemini temporary chat. Sign in at gemini.google.com in a regular tab, check third-party cookie restrictions, then retry.');
  }

  let activeFill = null;
  const handled = new Set();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (text) => text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
  function inputText(el) {
    const read = (node) => {
      if (node.nodeType === 3) return node.nodeValue;
      if (node.nodeName === 'BR') return '\n';
      return [...node.childNodes].map(read).join('');
    };
    return [...el.childNodes].map(node =>
      node.childNodes.length === 1 && node.childNodes[0].nodeName === 'BR' ? '' : read(node)
    ).join('\n');
  }
  const generating = () => !!document.querySelector('button[aria-label="Stop response"], button[aria-label="停止回覆"], button[aria-label="停止生成"], button[aria-label="停止回答"], button .stop-icon, button [fonticon="stop"]');

  async function fillSelection(message) {
    if (!temporaryReady()) return { message: 'Gemini temporary mode is not ready.' };
    if (handled.has(message.id) || activeFill) return { message: 'Selection already handled or sidebar busy.' };
    focusRequest = null;
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
        if (input && input.isContentEditable &&
            !input.disabled && input.getClientRects().length) break;
        input = null;
        await sleep(150);
      }
      if (operation.cancelled || !temporaryReady()) return { message: 'Cancelled.' };
      if (!input) return { message: 'No input found. Check sidebar sign-in, then try again.' };
      const draft = inputText(input);
      const hasDraft = !!normalize(draft);
      const addition = (hasDraft ? '\n\n' : '') + message.text;
      const expected = (hasDraft ? draft : '') + addition;
      focusElement(input);
      moveCaretToEnd(input);
      // insertText updates Quill's document and undo history, not just its DOM.
      if (!document.execCommand('insertText', false, addition)) {
        return { message: 'Could not fill sidebar. Please paste the selection manually.' };
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
        if (!temporaryReady() || !input.isConnected || normalize(inputText(input)) !== normalize(expected) || generating()) break;
        const button = document.querySelector('button.send-button, button[aria-label="Send message"], button[aria-label="傳送訊息"], button[aria-label="发送消息"]');
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
    chrome.runtime.sendMessage({ type: 'sidebarFrameIdentity', provider: 'gemini' }).catch(() => {});
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.provider !== 'gemini') return false;
    if (message.type === 'sidebarDiscover') { registerFrame(); return false; }
    if (message.type === 'sidebarProbe') { sendResponse({ ready: temporaryReady(), provider: 'gemini' }); return false; }
    if (message.type === 'sidebarCancel') {
      if (activeFill?.id === message.id) activeFill.cancelled = true;
      return false;
    }
    if (message.type !== 'sidebarFill' || typeof message.id !== 'string' || typeof message.text !== 'string' || !message.text.trim()) return false;
    fillSelection(message).then(sendResponse);
    return true;
  });
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.source !== MESSAGE_SOURCE) return;
    if (event.data.action === 'focusPrompt') focusPrompt(event.data.requestId);
    if (event.data.action === 'cancelFocusPrompt' &&
        (event.data.requestId === undefined || focusRequest?.requestId === event.data.requestId)) focusRequest = null;
  });
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'sync' || !changes.hideChatgptSidebar) return;
    settings = await cgptLoadSettings();
    applySettings();
  });
  const temporaryObserver = new MutationObserver((records) => {
    if (!initialized || !ready) return;
    // Streamed text and unrelated class changes do not need a document-wide query.
    // A detached chat window may have been replaced during Angular navigation.
    if (chatWindow?.isConnected === false) {
      chatWindow = document.querySelector('chat-window.is-temporary-chat');
      temporaryObserver.disconnect();
      temporaryObserver.observe(document.documentElement, { childList: true, subtree: true });
      if (chatWindow) temporaryObserver.observe(chatWindow, { attributes: true, attributeFilter: ['class'] });
    }
    if ((!records || records.some(record => record.type === 'childList' || record.target === chatWindow)) &&
        !isTemporaryWindow(chatWindow)) {
      ready = false;
      focusRequest = null;
      if (activeFill) activeFill.cancelled = true;
      report('Gemini left temporary mode. Start a new temporary chat to continue.');
    }
    tryFocusPrompt();
  });
  temporaryObserver.observe(document.documentElement, { childList: true, subtree: true });
  registerFrame();
  initialize().catch(() => report('Gemini could not initialize. Retry temporary chat.'));
})();
