// Shared DOM evidence for prompt visibility and submission. Unknown means disabled.
(function () {
  'use strict';
  const isChatgpt = /^(chatgpt\.com|chat\.openai\.com)$/.test(location.hostname);
  const visible = el => !el.closest('[hidden], [aria-hidden="true"]') && el.getClientRects().length > 0;
  const conversationPath = path => /\/c\/[^/]+/.test(path);
  let known = null;
  let modeRoots = [];
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
    const composer = document.querySelector('form[data-type="unified-composer"], form[data-thread-find-composer]');
    modeRoots = composer ? [composer] : [];
    if (!composer) return 'unknown';
    const triggers = [...composer.querySelectorAll('button[aria-haspopup="menu"]')];
    const allGroups = [...document.querySelectorAll('[role="radiogroup"]')];
    modeRoots.push(...allGroups);
    const groups = allGroups.filter(el =>
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
    // Newer layouts: new chats show a pressed Chat/Work button; every Chat
    // composer carries data-chatgpt-composer, which Work composers omit.
    if (composer.hasAttribute?.('data-thread-find-composer')) {
      const pressedButtons = [...document.querySelectorAll('[role="group"][aria-label="Composer mode"] button[aria-pressed="true"]')];
      modeRoots.push(...pressedButtons);
      const pressed = pressedButtons.filter(visible).map(el => el.textContent.trim());
      if (pressed.length === 1 && /^(Chat|聊天|對話|对话)$/i.test(pressed[0])) return remember('chat', composer);
      if (pressed.length === 1 && /^(Work|工作)$/i.test(pressed[0])) return remember('work', composer);
      return remember(composer.hasAttribute('data-chatgpt-composer') ? 'chat' : 'work', composer);
    }
    // Existing Chat conversations have a Thinking effort pill. The Work pill
    // carries WorkTrigger; inspect descendants because the wrapper can move.
    const workTrigger = triggers.some(el => [el, ...el.querySelectorAll?.('*') || []].some(node =>
      [...node.classList].some(name => name.endsWith('_WorkTrigger'))));
    // Existing conversations omit the surface radio group. Inspect the composer-owned
    // menu: Chat explicitly offers Latest; Work explicitly offers Fast mode.
    for (const trigger of triggers) {
      const menuId = trigger.getAttribute('aria-controls');
      const menu = menuId && document.getElementById(menuId);
      const picker = menu?.querySelector('[data-testid="composer-intelligence-picker-content"]');
      if (picker) modeRoots.push(picker);
      if (!picker || !picker.getClientRects().length) continue;
      if (picker.querySelector('[data-fast-mode-enabled]')) return remember('work', composer);
      if ([...picker.querySelectorAll('[role="menuitemradio"]')].some(el =>
        /^(Latest|最新)$/i.test(el.textContent.trim()))) return remember('chat', composer);
      return 'unknown';
    }
    if (workTrigger) return remember('work', composer);
    if (conversationPath(location.pathname) && triggers.some(el =>
      el.getAttribute('aria-label') === 'Thinking effort' ||
      el.getAttribute('aria-describedby') && /TriggerWrapper/.test(el.innerHTML) &&
      /Thinking effort|Extra High|High|Medium|Low|極高|高|中|低/.test(el.textContent))) {
      return remember('chat', composer);
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
  // Newer layouts key each turn and tag its user/assistant units with message ids.
  function keyedHistory(turns) {
    const users = [];
    for (const [i, turn] of turns.entries()) {
      const key = turn.querySelector('[data-content-search-turn-key]')?.getAttribute('data-content-search-turn-key') || '';
      if (Number(/-turn-(\d+)$/.exec(key)?.[1] ?? NaN) !== i) return null;
      const units = [...turn.querySelectorAll('[data-chatgpt-search-unit-key]')].filter(visible);
      if (!units.length) return null;
      const userUnits = units.filter(el => el.getAttribute('data-chatgpt-search-unit-key').endsWith(':user'));
      if (userUnits.length > 1) return null;
      if (userUnits.length) {
        const id = userUnits[0].getAttribute('data-chatgpt-search-message-ids')?.split(' ')[0] || turn.getAttribute('data-turn-key');
        if (!id) return null;
        users.push(id);
      }
    }
    if (!users.length || new Set(users).size !== users.length) return null;
    return { count: users.length, key: JSON.stringify(users) };
  }
  function getHistory() {
    const main = document.querySelector('main');
    if (!main || main.querySelector('[aria-busy="true"]')) return null;
    // Hidden alternative branches do not belong to the current conversation.
    const turns = [...main.querySelectorAll('[data-testid^="conversation-turn-"]')].filter(visible);
    const keyed = turns.length ? [] : [...main.querySelectorAll('[data-turn-key]')].filter(visible);
    if (keyed.length) return keyedHistory(keyed);
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
    const users = [];
    const turnMessages = new Set();
    for (const turn of turns) {
      const entries = [...turn.querySelectorAll('[data-message-author-role]')].filter(visible);
      if (!entries.length) return null;
      for (const entry of entries) turnMessages.add(entry);
      const userEntries = entries.filter(el => el.getAttribute('data-message-author-role') === 'user');
      if (userEntries.length > 1) return null;
      if (userEntries.length) {
        const id = userEntries[0].getAttribute('data-message-id') || turn.getAttribute('data-turn-id');
        if (!id) return null;
        users.push(id);
      }
    }
    if (messages.some(message => !turnMessages.has(message))) return null;
    if (!users.length || new Set(users).size !== users.length) return null;
    return { count: users.length, key: JSON.stringify(users) };
  }
  const localRecords = new Map();
  let pendingSend = null;
  const storageKey = 'chatsprig:local-counts';
  try {
    for (const [path, records] of JSON.parse(sessionStorage.getItem(storageKey) || '[]')) {
      if (Array.isArray(records)) localRecords.set(path, records);
    }
  } catch {}
  const unitId = el => el.getAttribute('data-chatgpt-search-message-ids')?.split(' ')[0];
  function visibleUserIds() {
    const ids = [...document.querySelectorAll('main [data-message-author-role="user"]')]
      .filter(visible).map(el => el.getAttribute('data-message-id') || el.closest('[data-turn-id]')?.getAttribute('data-turn-id'))
      .filter(Boolean);
    if (ids.length) return ids;
    return [...document.querySelectorAll('main [data-chatgpt-search-unit-key$=":user"]')].filter(visible).map(unitId).filter(Boolean);
  }
  function assistantMarker() {
    const entries = [...document.querySelectorAll('main [data-message-author-role="assistant"]')].filter(visible);
    const entry = entries.at(-1);
    if (!entry) {
      const unit = [...document.querySelectorAll('main [data-chatgpt-search-unit-key$=":assistant"]')].filter(visible).at(-1);
      const index = /-turn-(\d+):/.exec(unit?.getAttribute('data-chatgpt-search-unit-key') || '')?.[1];
      if (unit && index !== undefined) return { id: unitId(unit) || '', index: Number(index) + 1 };
    }
    const turn = entry?.closest('[data-testid^="conversation-turn-"]');
    return { id: entry?.getAttribute('data-message-id') || '',
      index: Number(/^conversation-turn-(\d+)$/.exec(turn?.getAttribute('data-testid') || '')?.[1] || 0) };
  }
  function localRecord() {
    const path = location.pathname;
    const ids = visibleUserIds();
    const last = ids.at(-1) || '';
    const assistant = assistantMarker();
    const records = localRecords.get(path) || [];
    let record = records.find(item => item.ids.at(-1) === last &&
      (!assistant.id || item.assistantId === assistant.id || assistant.index > item.assistantIndex)) ||
      records.find(item => item.anchor === last && item.count === 0 && item.assistantId === assistant.id);
    if (!record) {
      record = { anchor: last, ids: last ? [last] : [], count: 0,
        assistantId: assistant.id, assistantIndex: assistant.index };
      records.push(record);
      localRecords.set(path, records);
    } else if (assistant.index > record.assistantIndex) {
      record.assistantId = assistant.id;
      record.assistantIndex = assistant.index;
    }
    return record;
  }
  function getCountState() {
    const history = getHistory();
    if (history) return { count: history.count, cadence: history.count, key: history.key, complete: true };
    const record = localRecord();
    return { count: null, cadence: record.count,
      key: location.pathname + ':' + record.anchor + ':' + record.assistantId, complete: false };
  }
  function beginSendObservation() {
    if (getMode() !== 'chat' || pendingSend) return;
    const record = localRecord();
    pendingSend = { path: location.pathname, record, before: new Set(visibleUserIds()) };
    setTimeout(() => { if (pendingSend?.record === record) pendingSend = null; }, 10000);
  }
  function checkSend() {
    if (!pendingSend) return;
    if (location.pathname !== pendingSend.path &&
        !(pendingSend.path === '/' && conversationPath(location.pathname))) {
      pendingSend = null;
      window.dispatchEvent(new Event('cgpt-helper-count-change'));
      return;
    }
    const added = visibleUserIds().filter(id => !pendingSend.before.has(id));
    if (!added.length) return;
    const { record } = pendingSend;
    pendingSend = null;
    record.count++;
    record.ids.push(added.at(-1));
    record.ids = record.ids.slice(-20);
    try { sessionStorage.setItem(storageKey, JSON.stringify([...localRecords])); } catch {}
    window.dispatchEvent(new Event('cgpt-helper-count-change'));
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
  globalThis.cgptChatContext = { getMode: refreshMode, getHistory, getCountState, beginSendObservation,
    get revision() { refreshMode(); return revision; } };
  const modeSelector = 'form[data-type="unified-composer"], form[data-thread-find-composer], [role="radiogroup"], [role="group"][aria-label="Composer mode"], [data-testid="composer-intelligence-picker-content"], [data-tpp-toggle-value]';
  const messageSelector = '[data-message-author-role], [data-chatgpt-search-unit-key]';
  const editorSelector = '#prompt-textarea, [data-testid="prompt-textarea"], [data-composer-markdown]';
  const elementOf = node => node?.nodeType === 3 ? node.parentElement : node;
  const hasMatch = (node, selector) => !!(node?.matches?.(selector) || node?.querySelector?.(selector));
  let observedPath = location.pathname;
  let scheduled = false;
  let sendScheduled = false;
  let modeDirty = false;
  let sendDirty = false;
  function flushContext() {
    scheduled = false;
    const updateMode = modeDirty;
    modeDirty = false;
    observedPath = location.pathname;
    if (updateMode) refreshMode();
  }
  function scheduleContext() {
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flushContext);
    else if (typeof queueMicrotask === 'function') queueMicrotask(flushContext);
    else flushContext();
  }
  function scheduleSendCheck() {
    if (sendScheduled) return;
    sendScheduled = true;
    // Hidden tabs can suspend animation frames beyond the send timeout. Count
    // bookkeeping must run independently of the coalesced mode UI refresh.
    const flushSend = () => {
      sendScheduled = sendDirty = false;
      if (pendingSend) checkSend();
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(flushSend);
    else Promise.resolve().then(flushSend);
  }
  new MutationObserver(records => {
    // Keep direct refreshes synchronous; production callbacks always carry records.
    if (!records) { refreshMode(); if (pendingSend) checkSend(); return; }
    if (observedPath !== location.pathname) modeDirty = sendDirty = true;
    for (const record of records) {
      const target = elementOf(record.target);
      const inMessage = target?.closest?.(messageSelector);
      const inEditor = target?.closest?.(editorSelector);
      if (!inMessage && !inEditor && target?.closest?.(modeSelector)) modeDirty = true;
      if (record.type === 'attributes' && !inMessage && !inEditor &&
          modeRoots.some(root => target === root || target?.contains?.(root))) modeDirty = true;
      if (pendingSend && inMessage && record.type !== 'characterData') sendDirty = true;
      if (record.type !== 'childList') continue;
      for (const node of [...(record.addedNodes || []), ...(record.removedNodes || [])]) {
        if (!inMessage && !inEditor && hasMatch(node, modeSelector)) modeDirty = true;
        if (pendingSend && hasMatch(node, messageSelector)) sendDirty = true;
      }
    }
    if (modeDirty) scheduleContext();
    if (sendDirty && pendingSend) scheduleSendCheck();
  }).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['aria-selected', 'aria-checked', 'aria-pressed', 'aria-label', 'aria-controls', 'aria-describedby', 'role', 'data-tpp-toggle-value', 'data-chatgpt-composer', 'data-thread-find-composer', 'data-message-id', 'data-chatgpt-search-message-ids', 'aria-hidden', 'hidden', 'class', 'style']
  });
})();
