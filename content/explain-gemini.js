// Explain one assistant response in the existing Gemini floating chat.
(function () {
  'use strict';
  if (window.top !== window.self || globalThis.cgptGeminiExplainMounted) return;
  globalThis.cgptGeminiExplainMounted = true;
  const MESSAGE = '[data-message-author-role="assistant"], [data-chatgpt-search-unit-key$=":assistant"]';
  const BUTTON = 'cgpt-helper-explain-gemini';
  let explainPrompt = 'explain this to me';
  let promptChanged = false;
  const ready = cgptLoadSettings().then(settings => {
    if (!promptChanged && typeof settings.geminiExplainPrompt === 'string') explainPrompt = settings.geminiExplainPrompt;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.geminiExplainPrompt) return;
    promptChanged = true;
    explainPrompt = typeof changes.geminiExplainPrompt.newValue === 'string' ? changes.geminiExplainPrompt.newValue : 'explain this to me';
  });
  function copyResponse(copy) {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const receive = event => {
        let result;
        try { result = JSON.parse(event.detail); } catch { return; }
        if (result.id !== id) return;
        clearTimeout(timer);
        document.removeEventListener('chatsprig-copy-response-result', receive);
        if (result.error || typeof result.text !== 'string' || !result.text.trim()) reject(new Error(result.error || 'No response text was copied.'));
        else resolve(result.text);
      };
      const timer = setTimeout(() => {
        document.removeEventListener('chatsprig-copy-response-result', receive);
        reject(new Error('Copy timed out. Please refresh this page and try again.'));
      }, 5000);
      document.addEventListener('chatsprig-copy-response-result', receive);
      copy.dispatchEvent(new CustomEvent('chatsprig-copy-response', { bubbles: true, detail: JSON.stringify({ id }) }));
    });
  }

  function mount() {
    for (const message of document.querySelectorAll(MESSAGE)) {
      // The response actions are siblings of the message in older ChatGPT layouts.
      const scope = message.closest('[data-talvt-turn-state], [data-testid^="conversation-turn-"]') || message;
      const copy = [...scope.querySelectorAll('button[data-testid="copy-turn-action-button"], button[aria-label="Copy"], button[aria-label="Copied"], button[aria-label="已複製"], button[aria-label="已复制"], button[aria-label="複製"], button[aria-label="复制"]')]
        .find(button => !button.closest('pre, .markdown, [data-markdown-text-style]'));
      if (!copy) continue;
      const toolbar = copy.parentElement?.tagName === 'SPAN' ? copy.parentElement.parentElement : copy.parentElement;
      if (!toolbar || toolbar.querySelector(`.${BUTTON}`)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${copy.className} ${BUTTON}`;
      button.title = 'explain with gemini';
      button.setAttribute('aria-label', 'explain with gemini');
      button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C10.8 8.3 8.3 10.8 2 12c6.3 1.2 8.8 3.7 10 10 1.2-6.3 3.7-8.8 10-10-6.3-1.2-8.8-3.7-10-10Z" fill="currentColor"/></svg>';
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof globalThis.cgptAskInSidebar !== 'function') {
          button.title = 'Gemini sidebar is not ready. Please refresh this page.';
          return;
        }
        if (button.disabled) return;
        button.disabled = true;
        const path = location.pathname;
        try {
          const [text] = await Promise.all([copyResponse(copy), ready]);
          if (!message.isConnected || location.pathname !== path) return;
          const prefix = explainPrompt.trim();
          await globalThis.cgptAskInSidebar(prefix ? `${prefix}\n\n${text}` : text, 'gemini', true);
          button.title = 'explain with gemini';
        } catch (error) {
          button.title = error.message || 'Could not explain this response. Please try again.';
        } finally {
          button.disabled = false;
        }
      });
      toolbar.appendChild(button);
    }
  }
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; mount(); });
  }).observe(document.body, { childList: true, subtree: true });
  mount();
})();
