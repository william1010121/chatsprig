// Extend ChatGPT's native selection toolbar; never create a nested overlay.
(function () {
  'use strict';
  if (window.top !== window.self || globalThis.cgptSidebarSelectionMounted) return;
  globalThis.cgptSidebarSelectionMounted = true;
  const BUTTON_ID = 'cgpt-helper-ask-sidebar';
  let selectedText = '';
  let dismissingSelection = false;

  function captureSelection() {
    if (dismissingSelection) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    const anchor = selection.anchorNode?.parentElement;
    const focus = selection.focusNode?.parentElement;
    if (anchor?.closest('[contenteditable="true"], textarea, input') ||
        !anchor?.closest('[data-message-author-role]') ||
        !focus?.closest('[data-message-author-role]')) {
      return;
    }
    selectedText = globalThis.cgptGetSelectedLatex?.() ?? selection.toString();
  }

  function mount() {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) return;
    const ask = [...document.querySelectorAll('button')].find((button) =>
      /^(Ask ChatGPT|詢問 ChatGPT|询问 ChatGPT|尋問 ChatGPT)$/.test(button.textContent.trim()));
    if (!ask) return;
    const toolbar = ask.parentElement;
    if (!toolbar || ![...toolbar.querySelectorAll('button')].some((button) =>
      /Share highlighted|Share selection|分享選取|分享所選|分享反白|分享选中|分享所选/.test(button.textContent))) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = ask.className;
    button.textContent = 'Ask in sidebar';
    button.style.whiteSpace = 'nowrap';
    button.setAttribute('aria-label', 'Ask in sidebar');
    // Preserve selection on pointer activation; keyboard activation uses the saved selection.
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (dismissingSelection) return;
      const text = selectedText;
      if (!text.trim()) return;
      if (typeof globalThis.cgptAskInSidebar !== 'function') {
        button.title = 'Sidebar is not ready. Please refresh this page.';
        return;
      }
      dismissingSelection = true;
      selectedText = '';
      // Finish this toolbar interaction before dismissing it. ChatGPT can keep
      // its own highlight/toolbar state after the DOM selection is cleared.
      queueMicrotask(() => {
        try {
          window.getSelection()?.removeAllRanges();
          // Notify outside-interaction handlers without activating a page control
          // or invoking ChatGPT's own Ask action (which would change its draft).
          const options = { bubbles: true, cancelable: true, composed: true, button: 0,
            pointerType: 'mouse', isPrimary: true };
          for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
            const EventType = type.startsWith('pointer') ? PointerEvent : MouseEvent;
            document.body.dispatchEvent(new EventType(type, { ...options, buttons: type.endsWith('down') ? 1 : 0 }));
          }
          window.getSelection()?.removeAllRanges();
          document.dispatchEvent(new Event('selectionchange'));
        } finally {
          dismissingSelection = false;
        }
        globalThis.cgptAskInSidebar(text);
      });
    });
    toolbar.appendChild(button);
  }

  document.addEventListener('selectionchange', captureSelection);
  document.addEventListener('mouseup', captureSelection, true);
  const observer = new MutationObserver(mount);
  observer.observe(document.body, { childList: true, subtree: true });
  mount();
})();
