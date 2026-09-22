// Shared DOM evidence for prompt visibility and submission. Unknown means disabled.
(function () {
  'use strict';
  const isChatgpt = /^(chatgpt\.com|chat\.openai\.com)$/.test(location.hostname);
  const visible = el => !el.closest('[hidden], [aria-hidden="true"]') && el.getClientRects().length > 0;
  const conversationPath = path => /\/c\/[^/]+/.test(path);
  let known = null;
  function remember(mode, composer) {
    const changed = known?.mode !== mode || known?.path !== location.pathname;
    known = { mode, composer, path: location.pathname };
    if (changed && conversationPath(location.pathname)) {
      try { sessionStorage.setItem('chatsprig:surface:' + location.pathname, mode); } catch {}
    }
    return mode;
  }
  function getMode() {
    if (!isChatgpt) return 'unknown';
    const composer = document.querySelector('form[data-type="unified-composer"]');
    if (!composer) return 'unknown';
    // Verified on the live site: Work's model trigger has a CSS-module WorkTrigger token.
    // A missing WorkTrigger alone is NEVER Chat evidence.
    const triggers = [...composer.querySelectorAll('button[aria-haspopup="menu"]')];
    if (triggers.some(el => [...el.classList].some(name => name.endsWith('_WorkTrigger')))) return remember('work', composer);
    const groups = [...document.querySelectorAll('[role="radiogroup"]')].filter(el =>
      el.getClientRects().length && !el.closest('[hidden], [data-message-author-role]'));
    const evidence = new Set();
    let hasSelector = false;
    for (const group of groups) {
      const controls = [...group.querySelectorAll('[role="radio"][data-tpp-toggle-value]')];
      if (!controls.some(el => el.getAttribute('data-tpp-toggle-value') === 'chatgpt') ||
          !controls.some(el => el.getAttribute('data-tpp-toggle-value') === 'work')) continue;
      hasSelector = true;
      for (const control of controls) {
        if (control.getAttribute('aria-checked') === 'true') {
          const value = control.getAttribute('data-tpp-toggle-value');
          evidence.add(value === 'chatgpt' ? 'chat' : value === 'work' ? 'work' : 'unknown');
        }
      }
    }
    if (hasSelector) {
      if (evidence.size === 1 && !evidence.has('unknown')) return remember([...evidence][0], composer);
      known = null;
      try { sessionStorage.removeItem('chatsprig:surface:' + location.pathname); } catch {}
      return 'unknown';
    }
    // Existing conversations omit the surface radio group. Inspect the composer-owned
    // menu: Chat explicitly offers Latest; Work explicitly offers Fast mode.
    for (const trigger of triggers) {
      const menuId = trigger.getAttribute('aria-controls');
      const menu = menuId && document.getElementById(menuId);
      const picker = menu?.querySelector('[data-testid="composer-intelligence-picker-content"]');
      if (!picker || !picker.getClientRects().length) continue;
      if (picker.querySelector('[data-fast-mode-enabled]')) return remember('work', composer);
      if ([...picker.querySelectorAll('[role="menuitemradio"]')].some(el =>
        /^(Latest|最新)$/i.test(el.textContent.trim()))) return remember('chat', composer);
      return 'unknown';
    }
    // Retain positive evidence when its portal closes. A reload can reuse the same
    // conversation's verified surface; live Work evidence above always takes priority.
    if (known?.composer === composer && (known.path === location.pathname ||
        (!conversationPath(known.path) && conversationPath(location.pathname) &&
         document.querySelector('[data-testid="conversation-turn-1"] [data-message-author-role="user"]')))) {
      return remember(known.mode, composer);
    }
    if (conversationPath(location.pathname)) {
      try {
        const cached = sessionStorage.getItem('chatsprig:surface:' + location.pathname);
        if (cached === 'chat' || cached === 'work') return remember(cached, composer);
      } catch {}
    }
    return 'unknown';
  }
  function getHistory() {
    const main = document.querySelector('main');
    if (!main || main.querySelector('[aria-busy="true"]')) return null;
    // Hidden alternative branches do not belong to the current conversation.
    const turns = [...main.querySelectorAll('[data-testid^="conversation-turn-"]')].filter(visible);
    const containers = [...main.querySelectorAll('[data-turn-id-container]')].filter(visible);
    if (containers.some(el => el.getAttribute('data-turn-id-container') !== 'client-created-root' &&
        !el.getAttribute('data-testid')?.startsWith('conversation-turn-') &&
        !el.querySelector('[data-testid^="conversation-turn-"]'))) return null;
    const messages = [...main.querySelectorAll('[data-message-author-role]')].filter(visible);
    if (!turns.length) {
      if (messages.length || /\/c\/[^/]+/.test(location.pathname)) return null;
      return { count: 0, key: '' };
    }
    // A truncated/virtualized history must not become a smaller, guessed count.
    const indices = turns.map(turn => Number(/^conversation-turn-(\d+)$/.exec(turn.getAttribute('data-testid'))?.[1] ?? NaN));
    if (indices.some((index, i) => !Number.isSafeInteger(index) || index !== i + 1)) return null;
    if (messages.some(message => !turns.some(turn => turn.contains(message)))) return null;
    const users = [];
    for (const turn of turns) {
      const entries = [...turn.querySelectorAll('[data-message-author-role]')].filter(visible);
      if (!entries.length) return null;
      const userEntries = entries.filter(el => el.getAttribute('data-message-author-role') === 'user');
      if (userEntries.length > 1) return null;
      if (userEntries.length) {
        const id = userEntries[0].getAttribute('data-message-id') || turn.getAttribute('data-turn-id');
        if (!id) return null;
        users.push(id);
      }
    }
    if (!users.length || new Set(users).size !== users.length) return null;
    return { count: users.length, key: JSON.stringify(users) };
  }
  let mode = getMode();
  let revision = 0;
  function refreshMode() {
    const current = getMode();
    if (current !== mode) {
      mode = current;
      revision++;
      window.dispatchEvent(new Event('cgpt-helper-mode-change'));
    }
    return mode;
  }
  globalThis.cgptChatContext = { getMode: refreshMode, getHistory, get revision() { refreshMode(); return revision; } };
  new MutationObserver(refreshMode).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['aria-selected', 'aria-checked', 'aria-pressed', 'aria-label', 'aria-controls', 'data-tpp-toggle-value', 'aria-hidden', 'hidden', 'class', 'style']
  });
})();
