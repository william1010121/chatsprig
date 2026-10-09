// /btw is a native ChatGPT branch, hosted by the existing floating window.
(function () {
  'use strict';
  if (window.top !== window.self || !/^(chatgpt\.com|chat\.openai\.com)$/.test(location.hostname)) return;

  const INPUT = '#prompt-textarea, [data-testid="prompt-textarea"], [data-composer-markdown][contenteditable="true"]';
  const SEND = '[data-testid="send-button"], #composer-submit-button, form[data-thread-find-composer] button[type="submit"]';
  const PREFIX = 'btwBranch:';
  const knownBranches = new Map();
  let host, shadow, mountedForm, currentSession = null;
  let branches = [], expanded = false, pending = false, notice = '', loadRevision = 0;
  let hoverOpen = false, hoverTimer = null;
  let invalidated = false, mountObserver, themeObserver;
  const lifetime = new AbortController();
  function stop() {
    if (invalidated) return;
    invalidated = true;
    ++loadRevision;
    lifetime.abort();
    mountObserver?.disconnect(); themeObserver?.disconnect();
    window.clearTimeout(hoverTimer);
    removeCommand(); host?.remove();
  }
  function extensionActive() {
    if (!invalidated) {
      try { if (chrome.runtime?.id) return true; } catch {}
    }
    stop();
    return false;
  }
  function storageError(error) {
    if (/Extension context invalidated/i.test(error?.message || '')) stop();
    else extensionActive();
  }
  // ChatGPT marks its theme with data-theme (older builds: a .dark class); neither follows the OS setting.
  const darkTheme = () => {
    const html = document.documentElement, theme = html.dataset.theme;
    return theme ? theme === 'dark' : html.classList.contains('dark') || (!html.classList.contains('light') && matchMedia('(prefers-color-scheme: dark)').matches);
  };
  function applyTheme() {
    if (!host) return;
    host.style.colorScheme = darkTheme() ? 'dark' : 'light';
    // ChatGPT no longer exposes its surface variables here, so match the page background.
    const surface = getComputedStyle(document.body).backgroundColor;
    host.style.setProperty('--cgpt-btw-surface', /^rgba\(.*,\s*0\)$|^transparent$/.test(surface) ? 'Canvas' : surface);
  }
  const session = () => /\/c\/([a-zA-Z0-9-]+)(?:\/|$)/.exec(location.pathname)?.[1] || null;
  const visible = el => !el.closest('[hidden], [aria-hidden="true"]') && el.getClientRects().length > 0;
  const getInput = () => extensionActive() ? [...document.querySelectorAll(INPUT)].filter(visible).at(-1) : null;
  function readText(input) {
    if (input instanceof HTMLTextAreaElement) return input.value;
    const read = node => node.nodeType === Node.TEXT_NODE ? node.nodeValue : node.nodeName === 'BR' ?
      (node.classList.contains('ProseMirror-trailingBreak') ? '' : '\n') : [...node.childNodes].map(read).join('');
    return [...input.childNodes].map(read).join('\n');
  }
  function clearDraft(input) {
    input.focus({ preventScroll: true });
    if (input instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const range = document.createRange();
      range.selectNodeContents(input);
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      document.execCommand('delete');
    }
  }
  function storageKey(branch) { return `${PREFIX}${branch.session}:${branch.id}`; }
  async function save(branch) {
    if (!extensionActive()) throw new Error('Extension context invalidated.');
    try { await chrome.storage.local.set({ [storageKey(branch)]: branch }); }
    catch (error) { storageError(error); throw error; }
  }
  async function loadBranches(next, revision) {
    try {
      const items = await chrome.storage.local.get(null);
      if (!extensionActive() || revision !== loadRevision) return;
      branches = Object.entries(items).filter(([key, branch]) => key.startsWith(`${PREFIX}${next}:`) && validBranch(branch, next))
        .map(([, branch]) => branch).sort((a, b) => a.createdAt - b.createdAt);
      for (const branch of branches) knownBranches.set(branch.id, branch);
      render();
    } catch (error) { storageError(error); }
  }
  function updateListVisibility() {
    const open = expanded || hoverOpen;
    shadow.querySelector('.toggle').setAttribute('aria-expanded', String(open));
    shadow.querySelector('.list').hidden = !open;
  }
  function endHover() {
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => { hoverOpen = false; updateListVisibility(); }, 140);
  }
  function closeList() {
    window.clearTimeout(hoverTimer);
    expanded = false; hoverOpen = false;
  }
  function render() {
    if (!shadow || invalidated) return;
    const toggle = shadow.querySelector('.toggle');
    toggle.textContent = `Branches · ${branches.length}`;
    const status = shadow.querySelector('[role="status"]');
    status.textContent = notice;
    shadow.querySelector('.hint').textContent = pending ? 'Opening branch…' : '/btw + question';
    const list = shadow.querySelector('.list');
    updateListVisibility();
    const recent = shadow.querySelector('.recent');
    recent.replaceChildren();
    const latest = [...branches].filter(branch => branch.state === 'ready').sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
    for (const branch of latest) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'recent-branch'; button.dataset.id = branch.id;
      button.textContent = branch.title; button.title = branch.title;
      recent.appendChild(button);
    }
    list.replaceChildren();
    if (!branches.length) {
      const empty = document.createElement('p'); empty.textContent = 'No branches yet. Send /btw followed by your question.'; list.appendChild(empty);
    }
    for (const branch of branches) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'branch'; button.dataset.id = branch.id;
      button.textContent = branch.title;
      button.title = branch.title;
      const state = document.createElement('span');
      state.textContent = branch.state === 'opening' ? 'Opening…' : branch.state === 'failed' ? 'Check' : '↗';
      button.appendChild(state); list.appendChild(button);
    }
  }
  function mount() {
    const input = getInput();
    const form = input?.closest('form');
    if (!form) { host?.remove(); mountedForm = null; return; }
    if (!host) {
      host = document.createElement('div'); host.id = 'cgpt-helper-btw';
      host.style.cssText = 'width:100%;flex:0 0 auto;position:relative;z-index:5';
      shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<style>
        :host{font:12px ui-sans-serif,system-ui,-apple-system,sans-serif;color:inherit}
        :host{container-type:inline-size}
        .bar{display:flex;align-items:center;gap:10px;padding:5px 6px 8px;border-radius:16px;background:var(--bg-primary,var(--main-surface-primary,var(--cgpt-btw-surface,Canvas)))}
        .toggle,.hint{flex-shrink:0}.recent{margin-left:auto;display:flex;justify-content:flex-end;gap:6px;min-width:0;overflow:hidden;flex:0 1 auto}
        .recent-branch{min-width:0;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:0 1 150px;text-align:left;border-color:#8883;background:#8881}
        @container (max-width:650px){.recent-branch:nth-child(n+3){display:none}}
        @container (max-width:480px){.hint{display:none}.recent-branch:nth-child(n+2){display:none}}
        button{font:inherit;color:inherit;cursor:pointer;border:1px solid #8886;background:transparent;border-radius:16px;padding:5px 11px}
        button:hover{background:#8882}button:focus-visible{outline:2px solid #6da88b;outline-offset:2px}
        .hint{opacity:.55;font-size:11px}.list{position:absolute;bottom:100%;left:0;right:0;margin-bottom:6px;max-height:260px;overflow:auto;background:var(--cgpt-btw-surface,Canvas);color:CanvasText;box-shadow:0 8px 28px #0003;border:1px solid #8885;border-radius:14px;padding:6px}
        .list[hidden]{display:none}.branch{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;border:0;border-radius:8px;text-align:left;padding:10px 12px;overflow-wrap:anywhere}.branch span{opacity:.6;flex-shrink:0}
        p{margin:10px;opacity:.65;line-height:1.5}[role=status]:empty{display:none}[role=status]{padding:0 8px 7px;line-height:1.5}
      </style><div class="bar"><button type="button" class="toggle" aria-expanded="false" aria-controls="btw-list">Branches · 0</button><span class="hint">/btw + question</span><div class="recent" role="group" aria-label="Recent branches"></div></div><div class="list" id="btw-list" aria-label="Session branches" hidden></div><div role="status" aria-live="polite"></div>`;
      const beginHover = event => {
        if (event.pointerType !== 'mouse') return;
        window.clearTimeout(hoverTimer); hoverOpen = true; updateListVisibility();
      };
      for (const element of [shadow.querySelector('.toggle'), shadow.querySelector('.list')]) {
        element.addEventListener('pointerenter', beginHover);
        element.addEventListener('pointerleave', endHover);
      }
      host.addEventListener('pointerleave', endHover);
      shadow.addEventListener('click', async event => {
        if (!extensionActive()) return;
        const button = event.target.closest('button');
        if (!button) return;
        if (button.classList.contains('toggle')) { expanded = !expanded; hoverOpen = false; render(); return; }
        const branch = branches.find(item => item.id === button.dataset.id);
        if (!branch || pending) return;
        closeList(); render();
        try { await globalThis.cgptOpenBtw?.(branch); }
        catch (error) { storageError(error); }
      });
    }
    if (!host.style.colorScheme) applyTheme();
    if (mountedForm !== form || !host.isConnected) { form.prepend(host); mountedForm = form; }
    const next = session();
    if (next !== currentSession) {
      currentSession = next; branches = []; closeList(); notice = '';
      const revision = ++loadRevision;
      // Chrome can throw synchronously after an extension reload, before a
      // Promise exists. The async loader handles both throws and rejections.
      if (next) void loadBranches(next, revision);
      render();
    }
  }
  function validBranch(branch, expectedSession) {
    return branch?.session === expectedSession && /^[a-zA-Z0-9-]+$/.test(branch.id || '') && typeof branch.title === 'string' &&
      /^https:\/\/chatgpt\.com\/(?:c\/[a-zA-Z0-9-]+|branch\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+)(?:\?(?:surface=work|temporary-chat=true)(?:&temporary-chat=true)?)?$/.test(branch.url || '');
  }
  function branchPoint() {
    if (!session()) return null;
    if ([...document.querySelectorAll('[data-testid="stop-button"], button[aria-label="Stop answering"], form[data-thread-find-composer] button:is([aria-label="Stop"], [aria-label="停止"])')].some(visible)) return null;
    const root = [...document.querySelectorAll('main, [role="region"][aria-label="Conversation"]')].filter(visible).at(-1);
    if (!root) return null;
    const turns = [...root.querySelectorAll('[data-message-author-role][data-message-id], [data-turn-id], [data-chatgpt-search-unit-key][data-chatgpt-search-message-ids]')].filter(visible);
    const last = turns.at(-1);
    // data-turn-id is the native turn's last message ID. Hidden alternatives are excluded.
    const id = last?.getAttribute('data-message-id') || last?.getAttribute('data-chatgpt-search-message-ids')?.trim().split(/\s+/).at(-1) || last?.getAttribute('data-turn-id');
    return id && /^[a-zA-Z0-9-]+$/.test(id) ? id : null;
  }
  // input/draft: the main /btw draft to clear once the branch is filled. A selection
  // has no draft and follows the Ask in sidebar auto-send setting.
  async function createBranch(input, draft, question, autoSend = true) {
    const source = session();
    const messageId = branchPoint();
    if (!source || !messageId) {
      notice = input ? 'Wait for a response in a saved ChatGPT conversation before using /btw.' :
        'Wait for the response to finish before asking in a new branch.';
      render(); return;
    }
    if (!globalThis.cgptOpenBtw) { notice = 'Floating chat is unavailable. Reload the page and try again.'; render(); return; }
    pending = true; notice = ''; closeList();
    const temporary = new URLSearchParams(location.search).get('temporary-chat') === 'true' || new URLSearchParams(location.search).get('training_disabled') === 'true';
    const params = new URLSearchParams();
    if (globalThis.cgptChatContext?.getMode() === 'work') params.set('surface', 'work');
    if (temporary) params.set('temporary-chat', 'true');
    const branch = { id: crypto.randomUUID(), session: source, title: question.replace(/\s+/g, ' ').slice(0,100),
      url: `https://chatgpt.com/branch/${source}/${messageId}${params.size ? '?' + params : ''}`, createdAt: Date.now(), state: 'opening' };
    knownBranches.set(branch.id, branch); branches.push(branch); render();
    try {
      await save(branch);
      if (!extensionActive()) return;
      const result = await globalThis.cgptOpenBtw(branch, question, autoSend);
      if (!extensionActive()) return;
      if (result?.filled) {
        branch.state = 'ready';
        if (input && session() === source && input.isConnected && readText(input) === draft) clearDraft(input);
      } else {
        branch.state = 'failed';
        notice = result?.message || (input ? 'Could not fill the branch. Your question is still in the main draft.' : 'Could not fill the branch.');
      }
      await save(branch);
    } catch {
      branch.state = 'failed';
      notice = input ? 'Could not open or save the branch. Your question is still in the main draft.' : 'Could not open or save the branch.';
    }
    finally { pending = false; render(); }
  }
  // Join the native slash palette instead of displaying a second popup.
  let commandButton, commandList, nativeCommandClass, selectedCommand = null, commandQuery = null;
  const emptyCommandRows = new Set();
  const listeningCommandLists = new WeakSet();
  let commandTemplate, templateList, fallbackMenu, anchorOffset = -6, dismissedQuery = null;
  const slashQuery = input => input && /^\/(?:btw|bt|b)?$/.test(readText(input));
  function chooseCommand() {
    const input = getInput();
    if (!slashQuery(input)) return;
    input.focus({ preventScroll: true });
    if (input instanceof HTMLTextAreaElement) {
      input.setRangeText('/btw ', 0, input.value.length, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const range = document.createRange(); range.selectNodeContents(input);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.execCommand('insertText', false, '/btw ');
    }
    removeCommand();
  }
  function removeCommand() {
    commandButton?.remove();
    for (const row of emptyCommandRows) row.hidden = false;
    emptyCommandRows.clear();
    commandButton = commandList = null; selectedCommand = null; commandQuery = null;
    fallbackMenu?.remove(); fallbackMenu = null;
  }
  function positionFallback(input) {
    const form = input?.closest('form');
    if (!fallbackMenu || !form) return;
    const rect = input.getBoundingClientRect(), formRect = form.getBoundingClientRect();
    const top = Math.max(8, rect.top + anchorOffset);
    Object.assign(fallbackMenu.style, { left: `${formRect.left}px`, top: `${top}px`, width: `${formRect.width}px` });
    fallbackMenu.style.setProperty('--composer-overlay-available-height', `${top - 8}px`);
    fallbackMenu.style.setProperty('--max-height-suggestion-menu', `${top - 8}px`);
  }
  function fallbackList(input) {
    if (readText(input) === '/') return null;
    if (!commandTemplate) {
      // A paste or fast typing can reach /btw before the first native popup paints.
      commandTemplate = document.createElement('div');
      commandTemplate.setAttribute('data-composer-overlay-floating-ui', 'true');
      commandTemplate.innerHTML = '<div class="text-default text-sm border-default bg-surface-elevated-secondary overflow-hidden" style="border:var(--suggestion-menu-border-width,1px) solid var(--border-default,#8883);border-radius:var(--radius-suggestion-menu,16px);box-shadow:var(--suggestion-menu-shadow,0 4px 16px #0001)"><div data-mention-list-scroll-area class="flex flex-col overflow-y-auto"></div></div>';
    }
    if (!fallbackMenu) {
      fallbackMenu = commandTemplate.cloneNode(true);
      fallbackMenu.id = 'chatsprig-btw-palette';
      fallbackMenu.style.cssText = 'position:fixed;z-index:50;transform:translateY(-100%);';
      document.body.appendChild(fallbackMenu);
    }
    positionFallback(input);
    return fallbackMenu.querySelector('[data-mention-list-scroll-area]');
  }
  function commandButtons() {
    return [...commandList.querySelectorAll('button[data-list-navigation-item]')].filter(visible);
  }
  function selectCommand(button) {
    selectedCommand = button;
    for (const item of commandButtons()) {
      const selected = item === button;
      if (item.getAttribute('aria-current') !== String(selected)) item.setAttribute('aria-current', String(selected));
      item.classList.toggle('bg-primary-ghost-hover', selected);
    }
  }
  function syncCommand(input) {
    const query = readText(input);
    const queryChanged = query !== commandQuery;
    const buttons = commandButtons();
    const native = buttons.filter(button => button !== commandButton);
    // Native filtering can replace every other row without replacing the list.
    // Reconcile on each update, including empty rows added after our button.
    if (!native.length) for (const row of commandList.children) {
      if (row === commandButton || row.hasAttribute('data-mention-section-id')) continue;
      emptyCommandRows.add(row);
      if (!row.hidden) row.hidden = true;
    }
    if (queryChanged) {
      commandQuery = query;
      selectedCommand = query !== '/' ? commandButton : null;
    }
    if (!buttons.includes(selectedCommand)) selectedCommand = query !== '/' || !native.length ? commandButton :
      native.find(button => button.getAttribute('aria-current') === 'true') || native[0];
    selectCommand(selectedCommand);
    if (queryChanged && selectedCommand === commandButton) commandButton.scrollIntoView({ block: 'nearest' });
  }
  function mountCommand() {
    const input = getInput();
    if (!slashQuery(input) || readText(input) === dismissedQuery) { removeCommand(); return; }
    if (!input.contains(document.activeElement) && !commandList?.contains(document.activeElement)) { removeCommand(); return; }
    let list = [...document.querySelectorAll('[data-composer-overlay-floating-ui] [data-mention-list-scroll-area]')]
      .find(el => !el.closest('#chatsprig-btw-palette') && visible(el));
    if (list) {
      const shell = list.closest('[data-composer-overlay-floating-ui]');
      if (templateList !== list) {
        templateList = list; commandTemplate = shell.cloneNode(true);
        commandTemplate.querySelector('[data-mention-list-scroll-area]').replaceChildren();
      }
      const offset = shell.getBoundingClientRect().bottom - input.getBoundingClientRect().top;
      if (offset >= -80 && offset <= 40) anchorOffset = offset;
    } else list = fallbackList(input);
    if (!list) { removeCommand(); return; }
    if (commandButton?.isConnected && commandList === list) { syncCommand(input); return; }
    // Remove the previous row without destroying the new fallback's shell.
    const nextFallback = fallbackMenu;
    if (nextFallback && nextFallback.contains(list)) fallbackMenu = null;
    removeCommand(); fallbackMenu = nextFallback?.contains(list) ? nextFallback : null; commandList = list;
    const native = list.querySelector('button[data-list-navigation-item]');
    if (native) nativeCommandClass = native.className;
    commandButton = document.createElement('button');
    commandButton.id = 'chatsprig-btw-command'; commandButton.type = 'button';
    commandButton.className = nativeCommandClass || 'text-default outline-hidden focus:bg-primary-ghost-hover cursor-interaction flex w-full items-center rounded-xl px-row-x py-row-y text-start text-sm';
    commandButton.classList.remove('bg-primary-ghost-hover', 'opacity-100', 'menu-row-opacity');
    commandButton.dataset.listNavigationItem = 'true';
    commandButton.setAttribute('aria-label', '/btw — Ask in a new branch');
    commandButton.innerHTML = '<div class="flex w-full items-center gap-menu-row-content"><svg aria-hidden="true" class="shrink-0" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="6" cy="4" r="2"/><circle cx="6" cy="16" r="2"/><circle cx="14" cy="4" r="2"/><path d="M6 6v8m0-3c5 0 8-2 8-5"/></svg><div class="flex min-w-0 flex-1 items-center gap-menu-row-content"><span class="truncate flex-none">/btw</span><span class="min-w-0 flex-1 truncate text-sm text-codex-description">Ask in a new branch</span></div></div>';
    commandButton.addEventListener('mousedown', event => event.preventDefault());
    commandButton.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); chooseCommand(); });
    if (!listeningCommandLists.has(list)) {
      listeningCommandLists.add(list);
      list.addEventListener('pointerover', event => {
        if (commandList !== list || !commandButton?.isConnected) return;
        const button = event.target.closest('button[data-list-navigation-item]');
        if (button && list.contains(button)) selectCommand(button);
      });
    }
    // Append after existing sections so their React-owned children stay untouched.
    list.appendChild(commandButton);
    syncCommand(input);
  }
  window.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    const input = getInput();
    if (!input?.contains(event.target)) return;
    if (event.key === 'Escape' && commandButton?.isConnected) {
      dismissedQuery = readText(input); removeCommand(); return;
    }
    if (!slashQuery(input)) return;
    // Enter can arrive between the native unmount and our next animation frame.
    if (!commandButton?.isConnected) {
      if (event.key === 'Enter' && readText(input) !== '/' && readText(input) !== dismissedQuery) {
        event.preventDefault(); event.stopImmediatePropagation(); chooseCommand();
      }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    syncCommand(input);
    const buttons = commandButtons();
    const current = Math.max(0, buttons.indexOf(selectedCommand));
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === 'Enter') { selectedCommand?.click(); return; }
    selectCommand(buttons[(current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]);
    selectedCommand?.scrollIntoView({ block: 'nearest' });
  }, { capture: true, signal: lifetime.signal });
  function intercept(event) {
    if (event.defaultPrevented) return;
    if (event.type === 'keydown' && (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.keyCode === 229)) return;
    if (event.type === 'click' && !event.target.closest?.(SEND)) return;
    const input = getInput();
    if (!input || (event.type === 'keydown' ? !input.contains(event.target) : event.type === 'submit' && !event.target.contains(input))) return;
    const draft = readText(input);
    const match = /^\s*\/btw(?:\s+([\s\S]*))?$/.exec(draft);
    if (!match) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (pending) return;
    const question = match[1]?.trim();
    if (!question) { notice = 'Add your question after /btw.'; render(); return; }
    void createBranch(input, draft, question);
  }
  // Run before system-prompt submission interception so /btw is never prefixed or sent to the source.
  for (const name of ['keydown', 'click', 'submit']) window.addEventListener(name, intercept, { capture: true, signal: lifetime.signal });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (expanded || hoverOpen)) { closeList(); render(); shadow.querySelector('.toggle').focus(); }
  }, { signal: lifetime.signal });
  document.addEventListener('pointerdown', event => {
    if (!extensionActive()) return;
    if ((expanded || hoverOpen) && !event.composedPath().includes(host)) { closeList(); render(); }
    const input = getInput();
    if (commandButton && !input?.contains(event.target) && !commandList?.contains(event.target)) {
      dismissedQuery = input && readText(input); removeCommand();
    }
  }, { signal: lifetime.signal });
  // Ask in new branch: the selection toolbar's counterpart to /btw.
  globalThis.cgptAskInBranch = async text => {
    if (!extensionActive() || pending || typeof text !== 'string' || !text.trim()) return;
    // Match Ask in sidebar; if settings cannot be read, leave a draft rather than send.
    let autoSend = false;
    try { autoSend = (await globalThis.cgptLoadSettings?.())?.autoSendAskInSidebar === true; } catch {}
    if (!extensionActive() || pending) return;
    await createBranch(null, null, text.trim(), autoSend);
  };
  globalThis.cgptBtwBranchReady = (id, url) => {
    if (!extensionActive()) return;
    const branch = knownBranches.get(id);
    if (!branch) return;
    branch.url = url; branch.state = 'ready';
    void save(branch).catch(() => {}); render();
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (!extensionActive() || area !== 'local' || !currentSession) return;
    for (const [key, change] of Object.entries(changes)) {
      if (!key.startsWith(`${PREFIX}${currentSession}:`)) continue;
      const index = branches.findIndex(branch => storageKey(branch) === key);
      if (validBranch(change.newValue, currentSession)) {
        if (index >= 0) Object.assign(branches[index], change.newValue);
        else branches.push(change.newValue);
        knownBranches.set(change.newValue.id, index >= 0 ? branches[index] : change.newValue);
      } else if (index >= 0) branches.splice(index, 1);
    }
    render();
  });
  let scheduled = false;
  mountObserver = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(); mountCommand(); });
  });
  mountObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current'] });
  document.addEventListener('input', event => {
    const input = getInput();
    if (!input?.contains(event.target)) return;
    // Native Escape can emit an input event without changing the text.
    if (readText(input) !== dismissedQuery) dismissedQuery = null;
    mountCommand();
  }, { capture: true, signal: lifetime.signal });
  document.addEventListener('focusin', event => {
    if (getInput()?.contains(event.target)) mountCommand();
  }, { capture: true, signal: lifetime.signal });
  document.addEventListener('focusout', event => {
    const input = getInput();
    if (input?.contains(event.target) && !commandList?.contains(event.relatedTarget)) {
      requestAnimationFrame(() => {
        const current = getInput();
        if (!current?.contains(document.activeElement) && !commandList?.contains(document.activeElement)) removeCommand();
      });
    }
  }, { capture: true, signal: lifetime.signal });
  // ChatGPT's global Escape handler can consume keydown and blur the editor.
  window.addEventListener('keyup', event => {
    if (event.key !== 'Escape') return;
    const input = getInput();
    if (slashQuery(input)) {
      dismissedQuery = readText(input); removeCommand();
    }
  }, { capture: true, signal: lifetime.signal });
  // Streaming auto-scroll fires constantly; skip the layout-reading input lookup unless the fallback menu is open.
  window.addEventListener('resize', () => { if (fallbackMenu) positionFallback(getInput()); }, { signal: lifetime.signal });
  document.addEventListener('scroll', () => { if (fallbackMenu) positionFallback(getInput()); }, { capture: true, signal: lifetime.signal });
  themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme, { signal: lifetime.signal });
  window.addEventListener('popstate', mount, { signal: lifetime.signal });
  mount(); render();
})();
