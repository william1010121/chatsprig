// Selection action on the main Gemini page; embedded chats never create another overlay.
(function () {
  'use strict';
  if (window.top !== window.self || globalThis.geminiSidebarSelectionMounted) return;
  globalThis.geminiSidebarSelectionMounted = true;
  const host = document.createElement('div');
  host.id = 'chatsprig-gemini-selection';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host { all: initial; position: fixed; z-index: 2147483646; display: none; }
    button { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 12px;
      background: #111827; color: white; cursor: pointer; font: 13px system-ui;
      box-shadow: 0 3px 12px #0003; white-space: nowrap; }
    button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 2px; }
  </style><button type="button">Ask in sidebar</button>`;
  document.documentElement.appendChild(host);
  const button = shadow.querySelector('button');
  let selectedText = '';
  let pendingRange = null;
  let positioning = false;
  let buttonWidth = 0;
  function hide() {
    pendingRange = null;
    host.style.display = 'none';
  }
  function position() {
    positioning = false;
    if (!pendingRange) return;
    const rect = pendingRange.getBoundingClientRect();
    host.style.display = 'block';
    // Its label and font do not change while selecting; avoid measuring the
    // same button after every visibility write during a drag.
    if (!buttonWidth) buttonWidth = host.getBoundingClientRect().width;
    host.style.left = `${Math.max(8, Math.min(rect.right - buttonWidth, window.innerWidth - buttonWidth - 8))}px`;
    host.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 44))}px`;
  }
  function captureSelection() {
    const selection = window.getSelection();
    const start = selection?.anchorNode?.parentElement;
    const end = selection?.focusNode?.parentElement;
    const inMessage = (element) => element?.closest('message-content, user-query') &&
      !element.closest('[contenteditable="true"], input, textarea');
    if (!selection || selection.isCollapsed || !inMessage(start) || !inMessage(end)) {
      selectedText = '';
      hide();
      return;
    }
    selectedText = selection.toString();
    if (!selectedText.trim()) { hide(); return; }
    pendingRange = selection.getRangeAt(0);
    if (positioning) return;
    if (typeof requestAnimationFrame !== 'function') { position(); return; }
    positioning = true;
    requestAnimationFrame(position);
  }
  button.addEventListener('pointerdown', (event) => event.preventDefault());
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const text = selectedText;
    if (!text.trim()) return;
    if (typeof globalThis.cgptAskInSidebar !== 'function') {
      button.title = 'Sidebar is not ready. Please refresh this page.';
      return;
    }
    selectedText = '';
    window.getSelection()?.removeAllRanges();
    hide();
    globalThis.cgptAskInSidebar(text, 'gemini');
  });
  document.addEventListener('selectionchange', captureSelection);
  document.addEventListener('mouseup', captureSelection);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', () => { buttonWidth = 0; hide(); });
})();
