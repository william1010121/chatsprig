// Copy ChatGPT math (KaTeX) as original LaTeX source.
(function () {
  'use strict';

  let enabled = true;

  cgptLoadSettings().then((settings) => {
    enabled = Boolean(settings.enableLatexCopy);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && 'enableLatexCopy' in changes) {
      enabled = Boolean(changes.enableLatexCopy.newValue);
    }
  });

  const DELIMITERS = {
    inline: ['\\(', '\\)'],
    display: ['\\[', '\\]']
  };

  function asElement(node) {
    if (!node) return null;
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  }

  function closestMath(node) {
    const element = asElement(node);
    return element?.closest('[data-math-source]') || element?.closest('.katex') || null;
  }

  function expandRange(range) {
    const result = range.cloneRange();
    const startMath = closestMath(result.startContainer);
    const endMath = closestMath(result.endContainer);

    if (startMath) result.setStartBefore(startMath);
    if (endMath) result.setEndAfter(endMath);

    return result;
  }

  function isDisplayMath(element) {
    return Boolean(
      element.matches?.('[style*="display: block"]') ||
        element.querySelector?.('.katex-display') ||
        element.closest?.('.katex-display') ||
        element.querySelector?.('math[display="block"]')
    );
  }

  function wrapLatex(source, display) {
    const [left, right] = display ? DELIMITERS.display : DELIMITERS.inline;
    return `${left}${source.trim()}${right}`;
  }

  function convertFragment(fragment) {
    let foundMath = false;

    const mathElements = [...fragment.querySelectorAll('[data-math-source]')].filter(
      (element) => !element.parentElement?.closest('[data-math-source]')
    );

    for (const element of mathElements) {
      const source = element.getAttribute('data-math-source');
      if (!source?.trim()) continue;

      foundMath = true;
      element.replaceWith(document.createTextNode(wrapLatex(source, isDisplayMath(element))));
    }

    // Compatibility with older KaTeX pages.
    fragment.querySelectorAll('.katex-mathml').forEach((mathml) => {
      const annotation = mathml.querySelector('annotation[encoding="application/x-tex"]');
      const source = annotation?.textContent;
      if (!source?.trim()) return;

      foundMath = true;

      const text = wrapLatex(source, isDisplayMath(mathml));
      const katex = mathml.closest('.katex');
      (katex || mathml).replaceWith(document.createTextNode(text));
    });

    return foundMath ? fragment.textContent || '' : null;
  }

  function getSelectedLatex() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

    const parts = [];
    let foundMath = false;

    for (let index = 0; index < selection.rangeCount; index++) {
      const range = expandRange(selection.getRangeAt(index));
      const converted = convertFragment(range.cloneContents());

      if (converted !== null) foundMath = true;
      parts.push(converted ?? range.toString());
    }

    const text = parts.join('');
    return foundMath && text.trim() ? text : null;
  }

  // Reuse the exact clipboard conversion from other extension content scripts.
  // Capture while the selection still exists; opening the overlay moves focus.
  globalThis.cgptGetSelectedLatex = () => enabled ? getSelectedLatex() : null;

  function isCopyShortcut(event) {
    return (
      event.key?.toLowerCase() === 'c' &&
      (event.metaKey || event.ctrlKey) &&
      !(event.metaKey && event.ctrlKey) &&
      !event.altKey
    );
  }

  function onKeydown(event) {
    if (!enabled || !isCopyShortcut(event)) return;

    const text = getSelectedLatex();
    if (!text) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    navigator.clipboard.writeText(text).catch(console.error);
  }

  function onCopy(event) {
    if (!enabled) return;

    const text = getSelectedLatex();
    if (!text) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.clipboardData) {
      event.clipboardData.setData('text/plain', text);
    } else {
      navigator.clipboard.writeText(text).catch(console.error);
    }
  }

  window.addEventListener('keydown', onKeydown, true);
  window.addEventListener('copy', onCopy, true);
})();
