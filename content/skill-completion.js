// Text-template completion in ChatGPT and Gemini composers.
(function () {
  'use strict';
  if (!/^(chatgpt\.com|chat\.openai\.com|gemini\.google\.com)$/.test(location.hostname)) return;

  const composerSelector = '#prompt-textarea, [data-testid="prompt-textarea"], .ql-editor[contenteditable="true"][role="textbox"]';
  const name = 'chatsprig-skills';
  let skills = [];
  let systemPrompt = '';
  let active = null;
  let selectedIndex = 0;
  let composing = false;
  let host;
  let list;
  let choices = [];
  let inserting = false;
  let lastTiming = null;
  let lastUpdateTiming = null;

  function composer(target) {
    const el = target?.closest?.(composerSelector);
    return el && (el.isContentEditable || el instanceof HTMLTextAreaElement) ? el : null;
  }
  function triggerFor(input) {
    if (input instanceof HTMLTextAreaElement) {
      if (input.selectionStart !== input.selectionEnd) return null;
      const before = input.value.slice(0, input.selectionStart);
      const match = before.match(/(?:^|\s)\/\/([^\r\n]{0,80})$/u);
      if (!match) return null;
      const token = '//' + match[1];
      return { input, query: match[1], token, start: input.selectionStart - token.length, end: input.selectionStart };
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const caret = selection.getRangeAt(0);
    if (!caret.collapsed || !input.contains(caret.startContainer)) return null;
    const beforeRange = document.createRange();
    const container = caret.startContainer.nodeType === 1 ? caret.startContainer : caret.startContainer.parentElement;
    const paragraph = container?.closest('p');
    beforeRange.selectNodeContents(paragraph && input.contains(paragraph) ? paragraph : input);
    beforeRange.setEnd(caret.startContainer, caret.startOffset);
    const match = beforeRange.toString().match(/(?:^|\s)\/\/([^\r\n]{0,80})$/u);
    if (!match) return null;
    const token = '//' + match[1];
    const root = paragraph && input.contains(paragraph) ? paragraph : input;
    const target = beforeRange.toString().length - token.length;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (target <= offset + node.length) {
        const range = caret.cloneRange();
        range.setStart(node, target - offset);
        if (range.toString() === token) return { input, query: match[1], token, range };
        break;
      }
      offset += node.length;
    }
    return null;
  }
  function available() {
    const items = skills.filter(skill => skill && typeof skill.name === 'string' && typeof skill.content === 'string');
    if (systemPrompt.trim()) items.unshift({ name: 'system-prompt', content: systemPrompt });
    return items;
  }
  function matches(query) {
    const needle = query.trim().toLocaleLowerCase();
    return available().filter(skill => skill.name.toLocaleLowerCase().includes(needle));
  }
  function ensureMenu() {
    if (host) return;
    host = document.createElement('div');
    host.id = name;
    host.hidden = true;
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host { all: initial; position: fixed; z-index: 2147483647; width: min(320px, 90vw); font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; color: #17212b; }
      :host([hidden]) { display: none !important; }
      .menu { max-height: 260px; overflow: auto; background: #fff; border: 1px solid #c7ccd1; border-radius: 10px; box-shadow: 0 12px 35px #0003; padding: 5px; }
      button { box-sizing: border-box; width: 100%; display: block; border: 0; border-radius: 6px; padding: 8px 10px; text-align: left; font: inherit; color: inherit; background: transparent; cursor: pointer; }
      button[aria-selected="true"], button:hover { background: #e8f1ee; }
      strong { display: block; overflow-wrap: anywhere; }
      small { display: block; color: #64717c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .empty { padding: 9px 10px; color: #64717c; }
    </style><div class="menu" role="listbox" aria-label="Skills"></div>`;
    list = shadow.querySelector('.menu');
    shadow.addEventListener('mousedown', event => event.preventDefault());
    shadow.addEventListener('click', event => {
      const button = event.target.closest('button[data-index]');
      if (button) choose(Number(button.dataset.index));
    });
    document.documentElement.appendChild(host);
  }
  function close() {
    active = null;
    choices = [];
    if (host) host.hidden = true;
  }
  function select(index) {
    selectedIndex = index;
    if (!list) return;
    for (const button of list.querySelectorAll('button[data-index]')) {
      button.setAttribute('aria-selected', String(Number(button.dataset.index) === index));
    }
  }
  function render() {
    if (!active) return;
    ensureMenu();
    choices = matches(active.query);
    selectedIndex = Math.min(selectedIndex, Math.max(0, choices.length - 1));
    list.replaceChildren();
    if (!choices.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = available().length ? 'No matching skills' : 'Add skills in ChatSprig Settings';
      list.appendChild(empty);
    }
    choices.forEach((skill, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.index = String(index);
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === selectedIndex));
      const title = document.createElement('strong');
      title.textContent = `//${skill.name}`;
      const preview = document.createElement('small');
      preview.textContent = skill.content.replace(/\s+/g, ' ').slice(0, 100);
      button.append(title, preview);
      list.appendChild(button);
    });
    host.hidden = false;
    const rect = active.input.getBoundingClientRect();
    const height = host.getBoundingClientRect().height;
    host.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - host.offsetWidth - 8))}px`;
    host.style.top = `${Math.max(8, rect.top - height - 6)}px`;
  }
  function update() {
    if (composing || inserting) return;
    const start = performance.now();
    const input = composer(document.activeElement);
    const next = input && triggerFor(input);
    const triggerMs = performance.now() - start;
    if (!next) { close(); return; }
    const changed = !active || active.input !== next.input || active.query !== next.query;
    if (changed) selectedIndex = 0;
    active = next;
    if (changed) render();
    lastUpdateTiming = { triggerMs, renderMs: performance.now() - start - triggerMs };
  }
  function choose(index) {
    if (!active) return;
    const start = performance.now();
    const skill = choices[index];
    if (!skill) { close(); return; }
    const { input } = active;
    if (!input.isConnected) { close(); return; }
    const trigger = active;
    close();
    const menuMs = performance.now() - start;
    inserting = true;
    let placementMs = 0;
    let insertionMs = 0;
    try {
      const placementStart = performance.now();
      input.focus({ preventScroll: true });
      if (input instanceof HTMLTextAreaElement) {
        input.setSelectionRange(trigger.start, trigger.end);
      } else {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(trigger.range);
      }
      placementMs = performance.now() - placementStart;
      const insertionStart = performance.now();
      if (input instanceof HTMLTextAreaElement) {
        input.setRangeText(skill.content, trigger.start, trigger.end, 'end');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        // Native editing updates ProseMirror and Quill and preserves undo.
        document.execCommand('insertText', false, skill.content);
      }
      insertionMs = performance.now() - insertionStart;
    } finally {
      inserting = false;
      lastTiming = { menuMs, placementMs, insertionMs, totalMs: performance.now() - start,
        contentLength: skill.content.length, ...lastUpdateTiming };
      const insertedAt = performance.now();
      queueMicrotask(() => {
        if (lastTiming?.contentLength === skill.content.length) {
          lastTiming.postInsertMs = performance.now() - insertedAt;
          lastTiming.settledMs = performance.now() - start;
        }
      });
    }
  }
  window.addEventListener('keydown', event => {
    if (!active || event.isComposing || event.keyCode === 229 || !composer(event.target)) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); close(); return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopImmediatePropagation();
      const count = choices.length;
      if (count) selectedIndex = (selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
      select(selectedIndex);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault(); event.stopImmediatePropagation();
      choose(selectedIndex);
    }
  }, true);
  document.addEventListener('input', event => {
    if (!inserting && composer(event.target)) update();
  }, true);
  document.addEventListener('selectionchange', () => {
    if (!inserting && active && document.activeElement === active.input) update();
  });
  document.addEventListener('compositionstart', event => {
    if (composer(event.target)) { composing = true; close(); }
  }, true);
  document.addEventListener('compositionend', event => {
    if (composer(event.target)) { composing = false; update(); }
  }, true);
  document.addEventListener('pointerdown', event => {
    if (active && !composer(event.target) && !host?.contains(event.target)) close();
  }, true);
  chrome.storage.local.get({ skills: [] }).then(result => {
    skills = Array.isArray(result.skills) ? result.skills : [];
    render();
  }).catch(() => {});
  cgptLoadSettings().then(settings => {
    systemPrompt = typeof settings.systemPrompt === 'string' ? settings.systemPrompt : '';
    render();
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.skills) skills = Array.isArray(changes.skills.newValue) ? changes.skills.newValue : [];
    if (area === 'sync' && changes.systemPrompt) {
      systemPrompt = typeof changes.systemPrompt.newValue === 'string' ? changes.systemPrompt.newValue : '';
    }
    render();
  });
  globalThis.cgptSkillCompletion = { isMenuOpen: () => !!active, getLastTiming: () => lastTiming };
})();
