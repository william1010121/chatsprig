// Intercept composer submission in regular tabs and embedded chats alike.
(function () {
  'use strict';
  if (!/^(chatgpt\.com|chat\.openai\.com)$/.test(location.hostname)) return;
  const context = globalThis.cgptChatContext;
  if (!context) return;
  const inputSelector = '#prompt-textarea, [data-testid="prompt-textarea"]';
  const sendSelector = '[data-testid="send-button"], #composer-submit-button';
  let settings = {};
  let pending = false;
  let replaying = false;
  cgptLoadSettings().then(value => { settings = value; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const key of ['appendSystemPrompt', 'systemPrompt', 'systemPromptInterval']) {
      if (changes[key]) settings[key] = changes[key].newValue;
    }
  });

  function eligibleHistory() {
    if (context.getMode() !== 'chat') return null;
    const history = context.getCountState();
    const k = settings.systemPromptInterval ?? 0;
    if (!Number.isSafeInteger(k) || k < 0) return null;
    return history.cadence === 0 || (k > 0 && history.cadence % k === 0) ? history : null;
  }
  function readText(input) {
    if (input instanceof HTMLTextAreaElement) return input.value;
    const read = node => {
      if (node.nodeType === 3) return node.nodeValue;
      if (node.nodeName === 'BR') return node.classList.contains('ProseMirror-trailingBreak') ? '' : '\n';
      return [...node.childNodes].map(read).join('');
    };
    return [...input.childNodes].map(node =>
      node.childNodes.length === 1 && node.childNodes[0].nodeName === 'BR' ? '' : read(node)
    ).join('\n');
  }
  const normalize = text => text.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
  function prepend(input, prefix) {
    input.focus({ preventScroll: true });
    if (input instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, prefix + input.value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    // Insert at the start without replacing rich text, attachments or mentions.
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return document.execCommand('insertText', false, prefix);
  }
  function removePrefix(input, draft) {
    if (input instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, draft);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const current = readText(input);
    if (!current.endsWith(draft)) return;
    let remaining = current.length - draft.length;
    let end = null;
    const walk = node => {
      if (end) return;
      if (node.nodeType === 3) {
        if (remaining <= node.nodeValue.length) end = [node, remaining];
        else remaining -= node.nodeValue.length;
      } else if (node.nodeName === 'BR') {
        if (!node.classList.contains('ProseMirror-trailingBreak')) remaining--;
      } else {
        for (const child of node.childNodes) walk(child);
      }
    };
    for (const [index, child] of [...input.childNodes].entries()) {
      if (index) remaining--; // The root paragraphs are separated by a newline in readText.
      if (remaining === 0) { end = [child, 0]; break; }
      walk(child);
      if (end) break;
    }
    if (!end || end[1] < 0) return;
    input.focus({ preventScroll: true });
    const range = document.createRange();
    range.setStart(input, 0);
    range.setEnd(...end);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('delete');
  }
  function intercept(event) {
    if (replaying || event.defaultPrevented) return;
    const input = document.querySelector(inputSelector);
    if (!input) return;
    if (event.type === 'keydown') {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey ||
          event.isComposing || event.keyCode === 229 || !input.contains(event.target)) return;
    } else if (event.type === 'click') {
      if (!event.target.closest?.(sendSelector)) return;
    } else if (!event.target.contains(input)) return;
    if (pending) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const prompt = typeof settings.systemPrompt === 'string' ? settings.systemPrompt.trim() : '';
    const history = eligibleHistory();
    if (settings.appendSystemPrompt !== true || !prompt || !history) {
      context.beginSendObservation();
      return;
    }
    const draft = readText(input);
    if (!draft.trim()) return;
    if (normalize(draft).startsWith(normalize(prompt) + '\n\n')) {
      context.beginSendObservation();
      return;
    }
    const button = document.querySelector(sendSelector);
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pending = true;
    const url = location.href;
    const expected = normalize(prompt + '\n\n' + draft);
    const revision = context.revision;
    try {
      if (!prepend(input, prompt + '\n\n')) { pending = false; return; }
    } catch { pending = false; return; }
    // Let the site's editor state settle before replaying this one send intent.
    setTimeout(() => {
      pending = false;
      const current = eligibleHistory();
      const sameSettings = settings.appendSystemPrompt === true && settings.systemPrompt?.trim() === prompt;
      if (location.href !== url || !input.isConnected || context.revision !== revision || !sameSettings ||
          !current || current.cadence !== history.cadence || current.key !== history.key || normalize(readText(input)) !== expected) {
        // Remove only our untouched insertion. Never overwrite a subsequently edited draft.
        if (input.isConnected && normalize(readText(input)) === expected) {
          removePrefix(input, draft);
        }
        return;
      }
      const send = document.querySelector(sendSelector);
      if (!send || send.disabled || send.getAttribute('aria-disabled') === 'true') return;
      context.beginSendObservation();
      replaying = true;
      try { send.click(); } finally { replaying = false; }
    }, 100);
  }
  for (const type of ['click', 'keydown', 'submit']) window.addEventListener(type, intercept, true);
})();
