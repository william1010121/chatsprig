// Comfortable reading layout, toggled from ChatGPT's composer model picker.
(function () {
  'use strict';
  const STYLE_ID = 'cgpt-helper-compact-style';
  const BUTTON_ID = 'cgpt-helper-compact-toggle';
  const SETTINGS_ID = 'cgpt-helper-compact-settings';
  const PANEL_ID = 'cgpt-helper-compact-panel';
  const BOX = '[data-d-component="box"], [data-d-component="row"], [data-d-component="grid"], [data-d-component="radio-group"], [data-d-component="table"]';
  const UI_LAYOUT = '[data-d-component="box"], [data-d-component="row"], [data-d-component="grid"], [data-d-component="radio-group"]';
  const PROSE = `:not(:is(${BOX}) *)`;
  const PROMPT_ID = 'cgpt-helper-system-prompt-toggle';
  const CLASS = 'cgpt-helper-compact';
  const JOIN_CLASS = 'cgpt-helper-compact-join-paragraphs';
  const PICKER = '[data-testid="composer-intelligence-picker-content"], [role="menu"]:has(> [data-model-picker-view])';
  // Older builds nest .markdown in the author-role wrapper; newer ones tag the markdown root.
  const MARKDOWN = ':is([data-message-author-role="assistant"] .markdown, [data-markdown-text-style="assistant-message"])';
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .cgpt-helper-picker-controls {
      display: flex; justify-content: flex-end; align-items: center; gap: 6px;
      margin: 6px 8px 0; flex-shrink: 0;
    }
    #${BUTTON_ID}, #${PROMPT_ID}, #${SETTINGS_ID} {
      display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      box-sizing: border-box; width: 30px; height: 30px; padding: 6px; border-radius: 8px;
      border: 1px solid transparent; background: transparent;
      color: var(--text-secondary, #888); cursor: pointer;
    }
    #${SETTINGS_ID} { width: 24px; height: 24px; padding: 4px; align-self: flex-start; }
    #${SETTINGS_ID}:hover { background: var(--bg-surface-secondary, #8882); }
    #${SETTINGS_ID}:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    #${PANEL_ID} {
      position: fixed; z-index: 2147483647; top: 64px; right: 20px;
      box-sizing: border-box; width: min(300px, calc(100vw - 32px)); padding: 16px;
      border: 1px solid var(--border-default, #8884); border-radius: 14px;
      background: var(--bg-primary, #fff); color: var(--text-primary, #222);
      box-shadow: 0 8px 32px #0002; font: 13px/1.4 system-ui, sans-serif;
    }
    #${PANEL_ID}[hidden] { display: none; }
    #${PANEL_ID} header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    #${PANEL_ID} header button { background: transparent; border: 0; color: inherit; cursor: pointer; font-size: 20px; }
    #${PANEL_ID} label { display: block; margin-top: 16px; }
    #${PANEL_ID} output { float: right; font-variant-numeric: tabular-nums; }
    #${PANEL_ID} input[type="range"] { appearance: none; display: block; width: 100%; height: 20px; margin: 10px 0 0; background: transparent; cursor: pointer; }
    #${PANEL_ID} input[type="range"]::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: #8885; }
    #${PANEL_ID} input[type="range"]::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; margin-top: -6px; border-radius: 50%; background: #168052; }
    #${PANEL_ID} input[type="range"]::-moz-range-track { height: 4px; border-radius: 2px; background: #8885; }
    #${PANEL_ID} input[type="range"]::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: #168052; }
    #${PANEL_ID} .cgpt-helper-compact-reset { margin-top: 16px; background: transparent; color: inherit; border: 1px solid #8885; border-radius: 6px; padding: 4px 8px; cursor: pointer; }
    #${PROMPT_ID}[hidden] { display: none; }
    #${PROMPT_ID} { position: relative; }
    #${PROMPT_ID} .cgpt-helper-prompt-count {
      position: absolute; top: -6px; left: -7px; min-width: 13px; height: 13px;
      box-sizing: border-box; padding: 0 2px; border-radius: 7px;
      background: var(--bg-primary, #fff); color: var(--text-secondary, #666);
      border: 1px solid currentColor; font: 9px/11px system-ui, sans-serif;
      text-align: center; pointer-events: none;
    }
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
    html.${CLASS} ${MARKDOWN} :is(p, ul, ol, blockquote, pre, table)${PROSE} {
      margin-top: 8px !important; margin-bottom: 8px !important;
    }
    html.${CLASS} ${MARKDOWN} li${PROSE} {
      margin-top: 3px !important; margin-bottom: 3px !important;
    }
    html.${CLASS} ${MARKDOWN} li > p${PROSE} {
      margin-top: 0 !important; margin-bottom: 0 !important;
    }
    html.${CLASS} ${MARKDOWN} :is(h1,h2,h3,h4)${PROSE} {
      margin-top: 16px !important; margin-bottom: 8px !important;
    }
    html.${CLASS} ${MARKDOWN} :is(p,li,blockquote)${PROSE} {
      line-height: var(--cgpt-helper-compact-line-height, 1.65) !important;
    }
    html.${CLASS} ${MARKDOWN} hr${PROSE} { margin: 8px 0 !important; }
    /* Join adjacent prose visually; leave React's message DOM untouched. */
    html.${CLASS}.${JOIN_CLASS} ${MARKDOWN} > :is(
      p:not(:has(.katex-display, math[display="block"], img, br)):has(+ p:not(:has(.katex-display, math[display="block"], img, br))),
      p:not(:has(.katex-display, math[display="block"], img, br)) + p:not(:has(.katex-display, math[display="block"], img, br))
    ) { display: inline !important; }
    html.${CLASS}.${JOIN_CLASS} ${MARKDOWN} >
      p:not(:has(.katex-display, math[display="block"], img, br)):has(+ p:not(:has(.katex-display, math[display="block"], img, br)))::after {
      content: " "; white-space: pre;
    }
    /* Adjustable reading margins; the native composer remains untouched. */
    html.${CLASS} [data-turn-id] > div:has(> [data-conversation-screenshot-content]) {
      padding-inline: var(--cgpt-helper-compact-side-margin, 12%) !important;
    }
    html.${CLASS} [data-turn-id] [data-conversation-screenshot-content] {
      max-width: none !important;
    }
    /* Some layouts place the composer inside this wrapper. Keep its native width. */
    html.${CLASS} [data-thread-user-message-navigation-content]:not(:has(form)) {
      max-width: none !important; margin-inline: 0 !important; padding-inline: var(--cgpt-helper-compact-side-margin, 12%) !important;
    }
    /* The composer measures ChatGPT's responsive native content width. Let UI
       cards keep that width, even when prose becomes narrower or wider. */
    html.${CLASS} [data-dil-message-id] > :is(${UI_LAYOUT}) {
      box-sizing: border-box;
      width: var(--cgpt-helper-native-content-width, 100%) !important;
      max-width: none !important;
      margin-inline: calc((100% - var(--cgpt-helper-native-content-width, 100%)) / 2) !important;
      flex-shrink: 0;
    }
    /* Native tables use bleed margins based on the original thread width.
       Reset that bleed when prose has a custom width. */
    html.${CLASS} [data-dil-message-id] > [data-d-component="table"] {
      width: 100% !important; max-width: 100% !important;
      margin-inline: 0 !important; padding-inline: 0 !important;
    }
    html.${CLASS} [data-dil-message-id] > [data-d-component="table"] > table {
      width: min(100%, var(--cgpt-helper-native-content-width, 100%)) !important;
      margin-inline: auto !important;
    }
  `;
  document.documentElement.appendChild(style);

  let lineHeight = 1.65;
  let sideMargin = 12;
  const validLineHeight = value => typeof value === 'number' && Number.isFinite(value) && value >= 1.2 && value <= 2.4 ? value : 1.65;
  const validSideMargin = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 25 ? value : 12;
  let nativeComposer = null;
  const nativeWidthObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateNativeWidth) : null;
  function updateNativeWidth() {
    const width = nativeComposer?.getBoundingClientRect().width;
    if (width > 0) document.documentElement.style.setProperty('--cgpt-helper-native-content-width', `${width}px`);
  }
  function watchNativeWidth() {
    const composer = document.querySelector('form[data-chatgpt-composer], form[data-type="unified-composer"], form[data-thread-find-composer]');
    if (composer === nativeComposer) return;
    nativeWidthObserver?.disconnect();
    nativeComposer = composer;
    if (composer) nativeWidthObserver?.observe(composer);
    updateNativeWidth();
  }
  window.addEventListener('resize', updateNativeWidth);
  let enabled = false;
  let joinParagraphs = true;
  let saving = false;
  let appendPrompt = false;
  let savingPrompt = false;
  let interval = 0;
  function updatePromptVisibility() {
    const toggle = document.getElementById(PROMPT_ID);
    if (!toggle) return;
    const hidden = globalThis.cgptChatContext?.getMode() !== 'chat';
    if (toggle.hidden !== hidden) toggle.hidden = hidden;
    if (!hidden) {
      const count = globalThis.cgptChatContext?.getCountState().count;
      const badge = toggle.querySelector('.cgpt-helper-prompt-count');
      if (badge) badge.textContent = count === null ? '—' : String(count);
    }
  }
  window.addEventListener('cgpt-helper-mode-change', updatePromptVisibility);
  window.addEventListener('cgpt-helper-count-change', updatePromptVisibility);
  function render() {
    document.documentElement.style.setProperty('--cgpt-helper-compact-line-height', String(lineHeight));
    document.documentElement.style.setProperty('--cgpt-helper-compact-side-margin', `${sideMargin}%`);
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.querySelector('[data-setting="compactLineHeight"]').value = String(lineHeight);
      panel.querySelector('[data-setting="compactSideMargin"]').value = String(sideMargin);
      panel.querySelector('[data-value="compactLineHeight"]').textContent = lineHeight.toFixed(2);
      panel.querySelector('[data-value="compactSideMargin"]').textContent = `${sideMargin}%`;
    }
    document.documentElement.classList.toggle(CLASS, enabled);
    document.documentElement.classList.toggle(JOIN_CLASS, joinParagraphs);
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

  function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.hidden = true;
    document.getElementById(SETTINGS_ID)?.setAttribute('aria-expanded', 'false');
  }
  async function saveLayout() {
    const panel = document.getElementById(PANEL_ID);
    try {
      await chrome.storage.sync.set({ compactView: enabled, compactLineHeight: lineHeight, compactSideMargin: sideMargin });
      if (panel) panel.querySelector('[role="status"]').textContent = '';
    } catch {
      if (panel) panel.querySelector('[role="status"]').textContent = 'Could not save. Please try again.';
    }
  }
  function openPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', 'Compact view settings');
      panel.innerHTML = `
        <header><strong>Compact view</strong><button type="button" aria-label="Close compact settings">×</button></header>
        <label for="cgpt-helper-line-height">Line spacing <output data-value="compactLineHeight"></output></label>
        <input id="cgpt-helper-line-height" data-setting="compactLineHeight" type="range" min="1.2" max="2.4" step="0.05" aria-label="Line spacing">
        <label for="cgpt-helper-side-margin">Side margins <output data-value="compactSideMargin"></output></label>
        <input id="cgpt-helper-side-margin" data-setting="compactSideMargin" type="range" min="0" max="25" step="1" aria-label="Side margins">
        <button type="button" class="cgpt-helper-compact-reset">Reset</button><div role="status"></div>`;
      panel.querySelector('header button').addEventListener('click', closePanel);
      for (const input of panel.querySelectorAll('input[type="range"]')) {
        input.addEventListener('input', () => {
          if (input.dataset.setting === 'compactLineHeight') lineHeight = validLineHeight(Number(input.value));
          else sideMargin = validSideMargin(Number(input.value));
          render();
        });
        input.addEventListener('change', saveLayout);
      }
      panel.querySelector('.cgpt-helper-compact-reset').addEventListener('click', () => {
        lineHeight = 1.65; sideMargin = 12; render(); saveLayout();
      });
      // Keep native menu keyboard handlers from consuming the slider's arrows.
      panel.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') { closePanel(); document.getElementById(SETTINGS_ID)?.focus(); }
      });
      document.body.appendChild(panel);
    }
    panel.hidden = false;
    enabled = true;
    document.getElementById(SETTINGS_ID)?.setAttribute('aria-expanded', 'true');
    render();
    saveLayout();
    panel.querySelector('input').focus();
  }
  function mount() {
    watchNativeWidth();
    const picker = document.querySelector(PICKER);
    if (!picker) return;
    const existing = picker.querySelector(`#${BUTTON_ID}`);
    if (existing) {
      if (picker.querySelector(`#${PROMPT_ID}`) && picker.querySelector(`#${SETTINGS_ID}`)) return;
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
    promptToggle.innerHTML = '<span class="cgpt-helper-prompt-count" aria-hidden="true">—</span><svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M11 3H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6M7 9h3m-3 3h6m-6 3h4M15 2v6m-3-3h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
    const settingsButton = document.createElement('button');
    settingsButton.id = SETTINGS_ID;
    settingsButton.type = 'button';
    settingsButton.title = 'Compact view settings';
    settingsButton.setAttribute('aria-label', 'Compact view settings');
    settingsButton.setAttribute('aria-haspopup', 'dialog');
    settingsButton.setAttribute('aria-expanded', String(document.getElementById(PANEL_ID)?.hidden === false));
    settingsButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-5h4l.5 3 2 1.2 2.8-1 2 3.5-2.3 2v2.6l2.3 2-2 3.5-2.8-1-2 1.2-.5 3h-4l-.5-3-2-1.2-2.8 1-2-3.5 2.3-2v-2.6l-2.3-2 2-3.5 2.8 1 2-1.2.5-3Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    settingsButton.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openPanel(); });
    controls.append(promptToggle, button, settingsButton);
    picker.appendChild(controls);
    render();
  }

  // The picker is a short-lived React portal; remount only when DOM children change.
  let lastPath = location.pathname;
  let mountScheduled = false;
  function flushMount() {
    mountScheduled = false;
    mount();
    if (lastPath !== location.pathname) {
      lastPath = location.pathname;
      updatePromptVisibility();
    }
  }
  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flushMount);
    else if (typeof queueMicrotask === 'function') queueMicrotask(flushMount);
    else flushMount();
  }
  const mountSelector = `form[data-chatgpt-composer], form[data-type="unified-composer"], form[data-thread-find-composer], ${PICKER}`;
  const observer = new MutationObserver(records => {
    if (!records) { flushMount(); return; }
    let relevant = lastPath !== location.pathname || nativeComposer?.isConnected === false;
    for (const record of records) {
      const target = record.target?.nodeType === 3 ? record.target.parentElement : record.target;
      if (target?.closest?.('.cgpt-helper-picker-controls, [data-message-author-role], [data-chatgpt-search-unit-key]')) continue;
      if (target?.closest?.(PICKER)) relevant = true;
      for (const node of [...(record.addedNodes || []), ...(record.removedNodes || [])]) {
        if (node?.matches?.(mountSelector) || node?.querySelector?.(mountSelector)) relevant = true;
      }
    }
    if (relevant) scheduleMount();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.systemPromptInterval) interval = Number.isSafeInteger(changes.systemPromptInterval.newValue) && changes.systemPromptInterval.newValue >= 0 ? changes.systemPromptInterval.newValue : 0;
    if (changes.compactLineHeight) lineHeight = validLineHeight(changes.compactLineHeight.newValue);
    if (changes.compactSideMargin) sideMargin = validSideMargin(changes.compactSideMargin.newValue);
    if (changes.compactView) enabled = changes.compactView.newValue === true;
    if (changes.compactJoinParagraphs) joinParagraphs = changes.compactJoinParagraphs.newValue === true;
    if (changes.appendSystemPrompt) appendPrompt = changes.appendSystemPrompt.newValue === true;
    render();
  });
  mount();
  cgptLoadSettings().then((settings) => {
    lineHeight = validLineHeight(settings.compactLineHeight);
    sideMargin = validSideMargin(settings.compactSideMargin);
    interval = Number.isSafeInteger(settings.systemPromptInterval) && settings.systemPromptInterval >= 0 ? settings.systemPromptInterval : 0;
    enabled = settings.compactView === true;
    joinParagraphs = settings.compactJoinParagraphs !== false;
    appendPrompt = settings.appendSystemPrompt === true;
    mount();
    render();
  });
})();
