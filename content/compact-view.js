// Comfortable reading layout, toggled from ChatGPT's composer model picker.
(function () {
  'use strict';
  const STYLE_ID = 'cgpt-helper-compact-style';
  const BUTTON_ID = 'cgpt-helper-compact-toggle';
  const PROMPT_ID = 'cgpt-helper-system-prompt-toggle';
  const CLASS = 'cgpt-helper-compact';
  const PICKER = '[data-testid="composer-intelligence-picker-content"]';
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cgpt-helper-picker-controls {
      display: flex; justify-content: flex-end; align-items: center; gap: 6px;
      margin: 6px 8px 0; flex-shrink: 0;
    }
    #${BUTTON_ID}, #${PROMPT_ID} {
      display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      box-sizing: border-box; width: 30px; height: 30px; padding: 6px; border-radius: 8px;
      border: 1px solid transparent; background: transparent;
      color: var(--text-secondary, #888); cursor: pointer;
    }
    #${PROMPT_ID}[hidden] { display: none; }
    #${BUTTON_ID} { width: auto; gap: 6px; padding-inline: 9px; }
    #${BUTTON_ID}::after {
      content: "Compact view"; font: 12px/1.2 system-ui, sans-serif;
    }
    #${BUTTON_ID}:hover, #${PROMPT_ID}:hover { background: var(--bg-surface-secondary, #8882); }
    #${BUTTON_ID}[aria-pressed="true"], #${PROMPT_ID}[aria-pressed="true"] {
      color: #168052; background: #1680521c; border-color: #16805255;
    }
    .dark #${BUTTON_ID}[aria-pressed="true"], .dark #${PROMPT_ID}[aria-pressed="true"] {
      color: #8bdeb4; background: #8bdeb41c; border-color: #8bdeb455;
    }
    #${BUTTON_ID}:focus-visible, #${PROMPT_ID}:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    html.${CLASS} [data-message-author-role="assistant"] .markdown :is(p, ul, ol, blockquote, pre, table) {
      margin-top: 8px !important; margin-bottom: 8px !important;
    }
    html.${CLASS} [data-message-author-role="assistant"] .markdown li {
      margin-top: 3px !important; margin-bottom: 3px !important;
    }
    html.${CLASS} [data-message-author-role="assistant"] .markdown li > p {
      margin-top: 0 !important; margin-bottom: 0 !important;
    }
    html.${CLASS} [data-message-author-role="assistant"] .markdown :is(h1,h2,h3,h4) {
      margin-top: 16px !important; margin-bottom: 8px !important;
    }
    html.${CLASS} [data-message-author-role="assistant"] .markdown :is(p,li,blockquote) {
      line-height: 1.65 !important;
    }
    html.${CLASS} [data-message-author-role="assistant"] .markdown hr { margin: 8px 0 !important; }
    /* Join adjacent prose visually; leave React's message DOM untouched. */
    html.${CLASS} [data-message-author-role="assistant"] .markdown > :is(
      p:not(:has(.katex-display, math[display="block"], img, br)):has(+ p:not(:has(.katex-display, math[display="block"], img, br))),
      p:not(:has(.katex-display, math[display="block"], img, br)) + p:not(:has(.katex-display, math[display="block"], img, br))
    ) { display: inline !important; }
    html.${CLASS} [data-message-author-role="assistant"] .markdown >
      p:not(:has(.katex-display, math[display="block"], img, br)):has(+ p:not(:has(.katex-display, math[display="block"], img, br)))::after {
      content: " "; white-space: pre;
    }
    /* Match the preview's 12% side margins, scoped to conversation turns. */
    html.${CLASS} [data-turn-id] > div:has(> [data-conversation-screenshot-content]) {
      padding-inline: 12% !important;
    }
    html.${CLASS} [data-turn-id] [data-conversation-screenshot-content] {
      max-width: none !important;
    }
  `;
  document.documentElement.appendChild(style);

  let enabled = false;
  let saving = false;
  let appendPrompt = false;
  let savingPrompt = false;
  let interval = 0;
  function updatePromptVisibility() {
    const toggle = document.getElementById(PROMPT_ID);
    if (!toggle) return;
    const hidden = globalThis.cgptChatContext?.getMode() !== 'chat';
    if (toggle.hidden !== hidden) toggle.hidden = hidden;
  }
  window.addEventListener('cgpt-helper-mode-change', updatePromptVisibility);
  function render() {
    document.documentElement.classList.toggle(CLASS, enabled);
    const promptToggle = document.getElementById(PROMPT_ID);
    if (promptToggle) {
      promptToggle.setAttribute('aria-pressed', String(appendPrompt));
      promptToggle.title = `Append system prompt · Chat only · ${interval > 0 ? `Every ${interval} messages, starting with the first` : 'First message only'} · ${appendPrompt ? 'On' : 'Off'}`;
      updatePromptVisibility();
    }
    const button = document.getElementById(BUTTON_ID);
    if (button) {
      button.setAttribute('aria-pressed', String(enabled));
      button.title = `Compact view · 舒適緊湊（${enabled ? '已開啟' : '已關閉'}）`;
    }
  }

  function mount() {
    const picker = document.querySelector(PICKER);
    if (!picker) return;
    const existing = picker.querySelector(`#${BUTTON_ID}`);
    if (existing) {
      if (picker.querySelector(`#${PROMPT_ID}`)) return;
      // Replace controls left by an older loaded extension version.
      existing.closest('.cgpt-helper-picker-controls')?.remove();
    }
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.setAttribute('aria-label', 'Compact view');
    button.innerHTML = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 7h12M4 10h12M4 13h12M10 1v3m-2-2 2 2 2-2M10 19v-3m-2 2 2-2 2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (saving) return;
      const previous = enabled;
      enabled = !enabled;
      render();
      saving = true;
      try {
        await chrome.storage.sync.set({ compactView: enabled });
      } catch {
        enabled = previous;
        render();
        button.title = '無法儲存 Compact view，請重新整理後再試';
      } finally {
        saving = false;
      }
    });
    const controls = document.createElement('div');
    controls.className = 'cgpt-helper-picker-controls';
    const promptToggle = document.createElement('button');
    promptToggle.id = PROMPT_ID;
    promptToggle.type = 'button';
    promptToggle.hidden = true;
    promptToggle.innerHTML = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M11 3H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6M7 9h3m-3 3h6m-6 3h4M15 2v6m-3-3h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    promptToggle.setAttribute('aria-label', 'Append system prompt');
    promptToggle.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (savingPrompt || globalThis.cgptChatContext?.getMode() !== 'chat') return;
      const previous = appendPrompt;
      appendPrompt = !appendPrompt;
      render();
      savingPrompt = true;
      try {
        await chrome.storage.sync.set({ appendSystemPrompt: appendPrompt });
      } catch {
        appendPrompt = previous;
        render();
        promptToggle.title = 'Could not save Append system prompt. Please try again.';
      } finally {
        savingPrompt = false;
      }
    });
    controls.append(promptToggle, button);
    picker.appendChild(controls);
    render();
  }

  // The picker is a short-lived React portal; remount only when DOM children change.
  const observer = new MutationObserver(() => { mount(); updatePromptVisibility(); });
  observer.observe(document.body, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.systemPromptInterval) interval = Number.isSafeInteger(changes.systemPromptInterval.newValue) && changes.systemPromptInterval.newValue >= 0 ? changes.systemPromptInterval.newValue : 0;
    if (changes.compactView) enabled = changes.compactView.newValue === true;
    if (changes.appendSystemPrompt) appendPrompt = changes.appendSystemPrompt.newValue === true;
    render();
  });
  mount();
  cgptLoadSettings().then((settings) => {
    interval = Number.isSafeInteger(settings.systemPromptInterval) && settings.systemPromptInterval >= 0 ? settings.systemPromptInterval : 0;
    enabled = settings.compactView === true;
    appendPrompt = settings.appendSystemPrompt === true;
    mount();
    render();
  });
})();
