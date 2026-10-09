// Extend ChatGPT's native selection toolbar; never create a nested overlay.
(function () {
  'use strict';
  if (window.top !== window.self || globalThis.cgptSidebarSelectionMounted) return;
  globalThis.cgptSidebarSelectionMounted = true;
  const BUTTON_ID = 'cgpt-helper-ask-sidebar';
  const BRANCH_BUTTON_ID = 'cgpt-helper-ask-branch';
  const MESSAGE = '[data-message-author-role], [data-chatgpt-search-unit-key]';
  // ChatGPT's own selection button (selectedTextOverlay.addToChat / addToCodex) is
  // localized and reads "Add to chat" in Work mode.
  const NATIVE_ASK = /^(Ask ChatGPT|Add to chat|詢問 ChatGPT|询问 ChatGPT|尋問 ChatGPT|問問 ChatGPT|問 ChatGPT|向 ChatGPT 提问|加入聊天|加到對話|添加到对话|ChatGPT に聞く|チャットに追加|ChatGPT에게 물어보세요|채팅에 추가)$/;
  let selectedText = '';
  let selectedRanges;
  let rangeBoundaries;
  let protectedMathRoots = [];
  let selectionSourceChanged = false;
  let dismissingSelection = false;
  let nativeToolbar = null;

  function endpointMath(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    // Match copy-latex's endpoint expansion: its source can live in a hidden
    // sibling annotation outside the original, partially selected Range.
    return element?.closest('[data-math-source]') || element?.closest('.katex') || null;
  }

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
    protectedMathRoots = [...new Set(selectedRanges?.flatMap(range =>
      [endpointMath(range.startContainer), endpointMath(range.endContainer)]).filter(Boolean) || [])];
  }

  // Unknown locales: a fixed toolbar outside the app that ChatGPT shows right at a
  // live message selection.
  function selectionToolbar(toolbar) {
    if (!selectedText.trim() || toolbar.closest('[role="menu"], [role="dialog"], [role="listbox"]') ||
        toolbar.querySelector?.('input, textarea, [contenteditable="true"]')) return false;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
    const target = selection.getRangeAt(0).getBoundingClientRect?.();
    const box = toolbar.getBoundingClientRect?.();
    return !!target && !!box && box.bottom >= target.top - 120 && box.top <= target.bottom + 120;
  }

  function mount(root = document) {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) return;
    const candidates = root.matches?.('button') ? [root] : [];
    candidates.push(...(root.querySelectorAll?.('button') || []));
    const floating = toolbar => !toolbar.closest('#root, main, form') && !!toolbar.parentElement &&
      getComputedStyle(toolbar.parentElement).position === 'fixed';
    let ask = candidates.find((button) => NATIVE_ASK.test(button.textContent.trim()));
    if (!ask) {
      const fallback = candidates.find(button => button.parentElement && floating(button.parentElement));
      if (fallback && selectionToolbar(fallback.parentElement)) ask = fallback.parentElement.querySelector('button');
    }
    if (!ask) return;
    const toolbar = ask.parentElement;
    if (!toolbar) return;
    // Older toolbars pair Ask with Share; newer ones float Ask alone outside the app root.
    const shared = [...toolbar.querySelectorAll('button')].some((button) =>
      /Share highlighted|Share selection|分享選取|分享所選|分享反白|分享选中|分享所选/.test(button.textContent));
    if (!shared && !floating(toolbar)) return;
    nativeToolbar = toolbar;
    toolbar.appendChild(createButton(BUTTON_ID, 'Ask in sidebar', ask.className, 'cgptAskInSidebar',
      'Sidebar is not ready. Please refresh this page.'));
    // Native branches need a saved conversation to branch from.
    if (/^\/c\/[a-zA-Z0-9-]+/.test(globalThis.location?.pathname || '') && !document.getElementById(BRANCH_BUTTON_ID)) {
      toolbar.appendChild(createButton(BRANCH_BUTTON_ID, 'Ask in new branch', ask.className, 'cgptAskInBranch',
        'Branches are not ready. Please refresh this page.'));
    }
  }

  function createButton(id, label, className, action, unavailable) {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.style.whiteSpace = 'nowrap';
    button.setAttribute('aria-label', label);
    // Preserve selection on pointer activation; keyboard activation uses the saved selection.
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (dismissingSelection) return;
      if (!selectedText.trim()) return;
      // A source edit and programmatic activation can happen in the same task,
      // before MutationObserver delivers the change.
      onMutations(observer.takeRecords?.() || []);
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
      if (typeof globalThis[action] !== 'function') {
        button.title = unavailable;
        return;
      }
      dismissingSelection = true;
      selectedText = '';
      selectedRanges = undefined;
      rangeBoundaries = undefined;
      protectedMathRoots = [];
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
        globalThis[action](text);
      });
    });
    return button;
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
  function onMutations(records) {
    if (!records) { scheduleMount(document); return; }
    for (const record of records) {
      if (!selectionSourceChanged && protectedMathRoots.some(root => root.contains(record.target))) selectionSourceChanged = true;
      if (!selectionSourceChanged && selectedRanges?.length && record.type === 'childList') {
        // Fully selected formulas between the endpoints also have protected
        // sources. Avoid treating changes to a broad message ancestor as edits
        // to the selection; check only the math roots involved in the change.
        const mathRoots = [endpointMath(record.target), ...Array.from(record.addedNodes, endpointMath)].filter(Boolean);
        if (mathRoots.some(root => selectedRanges.some(range => range.intersectsNode(root)))) selectionSourceChanged = true;
      }
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
  }
  const observer = new MutationObserver(onMutations);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['data-math-source'] });
  mount();
})();
