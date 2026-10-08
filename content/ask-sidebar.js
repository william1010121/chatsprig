// Extend ChatGPT's native selection toolbar; never create a nested overlay.
(function () {
  'use strict';
  if (window.top !== window.self || globalThis.cgptSidebarSelectionMounted) return;
  globalThis.cgptSidebarSelectionMounted = true;
  const BUTTON_ID = 'cgpt-helper-ask-sidebar';
  const MESSAGE = '[data-message-author-role], [data-chatgpt-search-unit-key]';
  let selectedText = '';
  let selectedRanges;
  let rangeBoundaries;
  let selectionSourceChanged = false;
  let dismissingSelection = false;
  let nativeToolbar = null;

  function captureSelection() {
    if (dismissingSelection) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    const anchor = selection.anchorNode?.parentElement;
    const focus = selection.focusNode?.parentElement;
    if (anchor?.closest('[contenteditable="true"], textarea, input') ||
        !anchor?.closest(MESSAGE) ||
        !focus?.closest(MESSAGE)) {
      return;
    }
    selectedText = selection.toString();
    selectionSourceChanged = false;
    // Keep the range through toolbar focus changes; cloning its contents is only
    // necessary when the user actually sends the selection.
    selectedRanges = selection.rangeCount ? Array.from({ length: selection.rangeCount },
      (_, index) => selection.getRangeAt(index).cloneRange()) : undefined;
    rangeBoundaries = selectedRanges?.map(range => ({ start: range.startContainer, end: range.endContainer,
      startOffset: range.startOffset, endOffset: range.endOffset, text: range.toString() }));
  }

  function mount(root = document) {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) return;
    const candidates = root.matches?.('button') ? [root] : [];
    candidates.push(...(root.querySelectorAll?.('button') || []));
    const ask = candidates.find((button) =>
      /^(Ask ChatGPT|詢問 ChatGPT|询问 ChatGPT|尋問 ChatGPT)$/.test(button.textContent.trim()));
    if (!ask) return;
    const toolbar = ask.parentElement;
    if (!toolbar) return;
    // Older toolbars pair Ask with Share; newer ones float Ask alone outside the app root.
    const shared = [...toolbar.querySelectorAll('button')].some((button) =>
      /Share highlighted|Share selection|分享選取|分享所選|分享反白|分享选中|分享所选/.test(button.textContent));
    const floating = () => !toolbar.closest('#root, main, form') && !!toolbar.parentElement &&
      getComputedStyle(toolbar.parentElement).position === 'fixed';
    if (!shared && !floating()) return;
    nativeToolbar = toolbar;
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
      if (!selectedText.trim()) return;
      // DOM Ranges are live: a removed/replaced message can retarget them to a
      // different node. In that case retain the captured text instead.
      const stableRanges = !selectionSourceChanged && selectedRanges?.every((range, index) => {
        const saved = rangeBoundaries[index];
        return range.startContainer === saved.start && range.endContainer === saved.end &&
          range.startOffset === saved.startOffset && range.endOffset === saved.endOffset &&
          range.toString() === saved.text;
      }) ? selectedRanges : selectedRanges && [];
      const text = globalThis.cgptGetSelectedLatex?.(stableRanges) ?? selectedText;
      if (!text.trim()) return;
      if (typeof globalThis.cgptAskInSidebar !== 'function') {
        button.title = 'Sidebar is not ready. Please refresh this page.';
        return;
      }
      dismissingSelection = true;
      selectedText = '';
      selectedRanges = undefined;
      rangeBoundaries = undefined;
      selectionSourceChanged = false;
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
  const roots = new Set();
  let scheduled = false;
  function scheduleMount(root) {
    roots.add(root);
    if (scheduled) return;
    scheduled = true;
    const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : queueMicrotask;
    schedule(() => {
      scheduled = false;
      const pending = [...roots];
      roots.clear();
      for (const candidate of pending) {
        if (candidate.isConnected !== false) mount(candidate);
      }
    });
  }
  const observer = new MutationObserver(records => {
    if (!records) { scheduleMount(document); return; }
    for (const record of records) {
      if (record.type === 'attributes' || record.type === 'characterData') {
        // Formula source can change without changing its rendered selection
        // text. Invalidate only mutations intersecting the saved selection.
        if (!selectionSourceChanged && selectedRanges?.some(range => range.intersectsNode(record.target))) selectionSourceChanged = true;
        continue;
      }
      // React can replace a label or remove our button without replacing the
      // native toolbar itself. Otherwise inspect only newly inserted subtrees.
      if (record.target === nativeToolbar || nativeToolbar?.contains?.(record.target)) scheduleMount(nativeToolbar);
      const button = record.target.closest?.('button');
      if (button) scheduleMount(button);
      for (const node of record.addedNodes) {
        if (node.nodeType === 1) scheduleMount(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['data-math-source'] });
  mount();
})();
