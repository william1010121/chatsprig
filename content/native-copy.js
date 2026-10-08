// Runs in ChatGPT's MAIN world to capture exactly what its Copy action writes.
// No clipboard-read permission or reconstruction of response content is needed.
(function () {
  'use strict';
  const REQUEST = 'chatsprig-copy-response';
  const RESULT = 'chatsprig-copy-response-result';
  document.addEventListener(REQUEST, async event => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement) ||
        !button.matches('button[data-testid="copy-turn-action-button"], button[aria-label="Copy"], button[aria-label="Copied"], button[aria-label="已複製"], button[aria-label="已复制"], button[aria-label="複製"], button[aria-label="复制"]') ||
        button.closest('pre, .markdown, [data-markdown-text-style]')) return;
    let id;
    try { id = JSON.parse(event.detail).id; } catch { return; }
    if (typeof id !== 'string') return;
    // While ChatGPT displays "Copied", its click handler is temporarily a no-op.
    // Wait for the real Copy action to become available before capturing it.
    const copied = () => /^(Copied|已複製|已复制)$/.test(button.getAttribute?.('aria-label') || '');
    const deadline = Date.now() + 2500;
    while (copied() && button.isConnected !== false && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (copied() || button.isConnected === false) {
      document.dispatchEvent(new CustomEvent(RESULT, { detail: JSON.stringify({ id, error: 'Copy is not ready. Please try again.' }) }));
      return;
    }
    const captured = [];
    const clipboard = navigator.clipboard;
    const write = clipboard?.write;
    const writeText = clipboard?.writeText;
    const execCommand = document.execCommand;
    let error;
    try {
      if (clipboard) {
        clipboard.writeText = text => { captured.push(Promise.resolve(String(text))); return Promise.resolve(); };
        clipboard.write = items => {
          const item = [...items].find(value => value.types.includes('text/plain'));
          if (item) captured.push(item.getType('text/plain').then(blob => blob.text()));
          return Promise.resolve();
        };
      }
      document.execCommand = function (command, ...args) {
        if (command.toLowerCase() === 'copy') {
          captured.push(Promise.resolve(document.activeElement?.value ?? window.getSelection()?.toString() ?? ''));
          return true;
        }
        return execCommand.call(this, command, ...args);
      };
      // ChatGPT calls write/writeText synchronously; ClipboardItem data may
      // resolve later. Restore the methods immediately after this one action.
      button.click();
    } catch { error = 'Could not copy this response.'; }
    finally {
      if (clipboard) { clipboard.write = write; clipboard.writeText = writeText; }
      document.execCommand = execCommand;
    }
    let text = '';
    try { text = captured.length ? await captured[0] : ''; } catch { error = 'Could not read the copied response.'; }
    if (!text.trim()) error ||= 'ChatGPT did not provide copied response text. Please try again.';
    document.dispatchEvent(new CustomEvent(RESULT, { detail: JSON.stringify({ id, text, error }) }));
  });
})();
