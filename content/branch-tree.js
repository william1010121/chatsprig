// Nest branch chats under their source conversation in ChatGPT's history sidebar.
(function () {
  'use strict';
  const PREFIX = 'btwBranch:';
  const PARENTS = 'branchTreeParents';
  const ID = /^[a-zA-Z0-9-]+$/;
  // btw.js still owns a branch that is opening; an older "opening" record was abandoned.
  const OPENING_GRACE = 10 * 60 * 1000;
  // ChatGPT names a native branch "分支 · <source title>" / "Branch · <source title>".
  const BRANCH_TITLE = /^\s*(?:分支|Branch)\s*·\s*/i;
  const conversationId = url => /^https:\/\/chatgpt\.com\/c\/([a-zA-Z0-9-]+)(?:\?|$)/.exec(url || '')?.[1] || null;
  const baseTitle = title => { let base = title.trim(); while (BRANCH_TITLE.test(base)) base = base.replace(BRANCH_TITLE, ''); return base; };
  // Source conversation → its branches. /btw records carry a storage key; inferred links do not.
  function branchIndex(items, now = Date.now()) {
    const index = new Map();
    const add = (parent, record) => {
      if (!index.has(parent)) index.set(parent, []);
      if (!index.get(parent).some(item => item.chat && item.chat === record.chat)) index.get(parent).push(record);
    };
    for (const [key, branch] of Object.entries(items || {})) {
      if (!ID.test(branch?.session || '') || !ID.test(branch?.id || '') || key !== `${PREFIX}${branch.session}:${branch.id}`) continue;
      const opening = branch.state === 'opening' && !(now - branch.createdAt > OPENING_GRACE);
      add(branch.session, { key, chat: conversationId(branch.url), opening });
    }
    const known = new Set([...index.values()].flat().map(record => record.chat));
    for (const [chat, entry] of Object.entries(items?.[PARENTS] || {})) {
      const parent = typeof entry === 'string' ? entry : entry?.parent;
      if (ID.test(chat) && ID.test(parent || '') && chat !== parent && !known.has(chat)) add(parent, { key: null, chat });
    }
    return index;
  }
  // Every branch below root, including branches of branches. Cycle-safe.
  function descendants(index, root) {
    const seen = new Set([root]), keys = [], chats = [];
    const visit = id => {
      for (const { key, chat } of index.get(id) || []) {
        if (key) keys.push(key);
        if (!chat || seen.has(chat)) continue;
        seen.add(chat); chats.push(chat); visit(chat);
      }
    };
    visit(root);
    return { keys, chats };
  }
  // A native branch copies its source's message nodes, IDs and timestamps included. A chat's
  // own nodes are those created after the chat itself. The source is an older candidate whose
  // own nodes the child shares (an older sibling shares only copied ones), then the one sharing
  // the most nodes; a tie goes to the oldest.
  function pickParent(child, candidates) {
    let best = null, bestShared = 0;
    for (const candidate of candidates) {
      if (!(candidate.created < child.created)) continue;
      if (![...(candidate.own || candidate.nodes)].some(node => child.nodes.has(node))) continue;
      let shared = 0;
      for (const node of candidate.nodes) if (child.nodes.has(node)) shared++;
      if (shared > bestShared || (shared && shared === bestShared && candidate.created < best.created)) { best = candidate; bestShared = shared; }
    }
    return best?.id || null;
  }
  // rows: [{ id, ... }] in sidebar order. Each group sits where its topmost member was.
  function arrange(rows, parentOf) {
    const present = new Set(rows.map(row => row.id));
    const position = new Map(rows.map((row, index) => [row.id, index]));
    const children = new Map(), roots = [];
    for (const row of rows) {
      const parent = parentOf.get(row.id);
      if (parent && parent !== row.id && present.has(parent)) {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(row);
      } else roots.push(row);
    }
    const seen = new Set();
    const subtree = (row, depth, out) => {
      if (seen.has(row.id)) return out;
      seen.add(row.id); out.push({ ...row, depth });
      for (const child of children.get(row.id) || []) subtree(child, depth + 1, out);
      return out;
    };
    const groups = roots.map(row => subtree(row, 0, []));
    // A parent/child cycle has no root; show its members flat rather than dropping them.
    for (const row of rows) if (!seen.has(row.id)) groups.push(subtree(row, 0, []));
    const top = group => Math.min(...group.map(row => position.get(row.id)));
    return groups.sort((a, b) => top(a) - top(b)).flat();
  }
  globalThis.cgptBranchTree = { branchIndex, descendants, pickParent, arrange, baseTitle };

  if (window.top !== window.self || !/^(chatgpt\.com|chat\.openai\.com)$/.test(location.hostname)) return;

  // Older layouts: nav > ul > li > a[data-sidebar-item]. Current: nav [role=list] > [role=listitem] … a[data-interactive-row-link].
  const CHAT_LINK = 'a[href*="/c/"]:is([data-sidebar-item], [data-interactive-row-link]), nav a[href*="/c/"]';
  const STYLE_ID = 'cgpt-helper-branch-tree-style';
  let items = {}, index = new Map(), parentOf = new Map();
  const deleted = new Set();
  let marked = new Set(), markedLists = new Set();
  let root = null, observer = null, scheduled = false, invalidated = false, busy = false;
  let host, chip, hoverRow = null, hoverId = null;
  const lifetime = new AbortController();

  function stop() {
    if (invalidated) return;
    invalidated = true;
    lifetime.abort(); observer?.disconnect(); window.clearInterval(watch); window.clearTimeout(retryTimer);
    unmark(new Set(), new Set());
    document.getElementById(STYLE_ID)?.remove(); host?.remove();
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
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [data-chatsprig-tree] { display: flex !important; flex-direction: column; }
    [data-chatsprig-depth] { position: relative; padding-inline-start: calc(var(--chatsprig-depth) * 14px) !important; }
    [data-chatsprig-depth]::before {
      content: ''; position: absolute; inset-block: 6px; pointer-events: none;
      inset-inline-start: calc(var(--chatsprig-depth) * 14px - 5px); border-inline-start: 1px solid #8886;
    }
    [data-chatsprig-deleted] { display: none !important; }
  `;
  document.documentElement.appendChild(style);

  const chatOf = link => {
    try { return /\/c\/([a-zA-Z0-9-]+)\/?$/.exec(new URL(link.href, location.href).pathname)?.[1] || null; }
    catch { return null; }
  };
  const rowOf = link => link.closest('[role="listitem"], li') || link;
  const titleOf = link => (link.getAttribute('aria-label') || link.textContent || '').replace(/, pinned conversation$/, '').trim();
  function unmark(keep, keepLists) {
    for (const row of marked) if (!keep.has(row)) {
      row.removeAttribute('data-chatsprig-depth'); row.removeAttribute('data-chatsprig-deleted');
      row.style.removeProperty('--chatsprig-depth'); row.style.removeProperty('order');
    }
    for (const list of markedLists) if (!keepLists.has(list)) list.removeAttribute('data-chatsprig-tree');
    marked = keep; markedLists = keepLists;
  }
  function setAttr(element, name, value) {
    if (value === null) { if (element.hasAttribute(name)) element.removeAttribute(name); }
    else if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }
  function setStyle(element, name, value) {
    if (value === null) { if (element.style.getPropertyValue(name)) element.style.removeProperty(name); }
    else if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  }
  // "New chat" and friends live in a separate nav; anchor on a conversation link.
  const findRoot = () => document.querySelector(CHAT_LINK)?.closest('nav, aside') || null;
  function sidebarChats() {
    const chats = [];
    for (const link of root?.querySelectorAll(CHAT_LINK) || []) {
      const id = chatOf(link);
      if (id) chats.push({ id, link, row: rowOf(link), title: titleOf(link) });
    }
    return chats;
  }
  function apply() {
    if (!extensionActive()) return;
    if (!root?.isConnected) attach();
    if (!root) { unmark(new Set(), new Set()); return; }
    const chats = sidebarChats();
    // Each native list (Pinned, Chats, a project) is arranged on its own.
    const lists = new Map();
    for (const chat of chats) {
      const list = chat.row.parentElement;
      if (!lists.has(list)) lists.set(list, []);
      if (!lists.get(list).some(row => row.row === chat.row)) lists.get(list).push(chat);
    }
    const keep = new Set(), keepLists = new Set();
    for (const [list, rows] of lists) {
      const nested = rows.some(row => rows.some(other => other.id === parentOf.get(row.id)));
      if (nested) { setAttr(list, 'data-chatsprig-tree', ''); keepLists.add(list); }
      // Order every child: unordered siblings (loading rows, other items) would otherwise share order 0.
      const byRow = new Map(rows.map(row => [row.row, row]));
      const ordered = nested ? arrange([...list.children].map((element, slot) => byRow.get(element) || { id: `\0${slot}`, row: element }), parentOf) :
        rows.map(row => ({ ...row, depth: 0 }));
      ordered.forEach(({ id, row, depth }, order) => {
        const gone = deleted.has(id);
        if (!nested && !gone) return;
        keep.add(row);
        setStyle(row, 'order', nested ? String(order) : null);
        setStyle(row, '--chatsprig-depth', depth ? String(depth) : null);
        setAttr(row, 'data-chatsprig-depth', depth ? String(depth) : null);
        setAttr(row, 'data-chatsprig-deleted', gone ? '' : null);
      });
    }
    unmark(keep, keepLists);
    if (hoverRow && !hoverRow.isConnected) hideChip();
    void infer(chats);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; apply(); });
  }
  // Watch only the sidebar; it remounts when collapsed, so re-find it occasionally.
  function attach() {
    const next = findRoot();
    if (next === root) return;
    observer?.disconnect(); root = next;
    if (root) observer.observe(root, { childList: true, subtree: true });
  }
  observer = new MutationObserver(schedule);
  const watch = window.setInterval(() => { if (!root?.isConnected) schedule(); }, 1500);

  // ChatGPT's own API, with the signed-in page session.
  let token = null;
  async function api(path, init = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!token) {
        token = (await (await fetch('/api/auth/session', { credentials: 'include' })).json())?.accessToken || null;
        if (!token) throw new Error('Not signed in');
      }
      const response = await fetch(path, { credentials: 'include', ...init,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
      if (response.status !== 401) return response;
      token = null;
    }
    throw new Error('Not signed in');
  }
  // A native branch is compared once per candidate set; the answer and the candidates it
  // considered are kept in local storage. A newly loaded candidate triggers a re-comparison.
  // tried: candidates compared without a match. retry: failed lookups wait with exponential backoff.
  const tried = new Map(), retry = new Map();
  let retryTimer = 0;
  let inferring = false, rerun = false;
  // Conversations keep growing, so mappings are cached for one inference pass only.
  async function conversation(id, nodes) {
    if (!nodes.has(id)) {
      const response = await api(`/backend-api/conversation/${id}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json(), created = Number(data.create_time) || 0;
      const mapping = Object.entries(data.mapping || {});
      nodes.set(id, { id, created, nodes: new Set(mapping.map(([node]) => node)),
        own: new Set(mapping.filter(([, item]) => Number(item?.message?.create_time) >= created).map(([node]) => node)) });
    }
    return nodes.get(id);
  }
  async function infer(chats) {
    // Rows that load during a pass are inferred right after it.
    if (inferring || busy) { rerun = true; return; }
    const known = items[PARENTS] || {};
    const btw = new Set([...index.values()].flat().filter(record => record.key).map(record => record.chat));
    const pending = [], waiting = new Set();
    for (const chat of chats) {
      if (!BRANCH_TITLE.test(chat.title) || btw.has(chat.id) || deleted.has(chat.id)) continue;
      const base = baseTitle(chat.title), entry = known[chat.id];
      const compared = new Set([...(entry?.candidates || []), ...(typeof entry === 'string' ? [entry] : []), ...(tried.get(chat.id) || [])]);
      const loaded = chats.filter(other => other.id !== chat.id && baseTitle(other.title) === base).map(other => other.id);
      if (!loaded.length || loaded.every(id => compared.has(id))) continue;
      if (retry.get(chat.id)?.at > Date.now()) { waiting.add(chat.id); continue; }
      // Earlier candidates may have scrolled out of the sidebar; keep comparing them by ID.
      pending.push({ id: chat.id, candidates: [...new Set([...compared, ...loaded])].filter(id => !deleted.has(id)) });
    }
    // Keep retries only for branches still waiting or about to run; anything else (left the
    // sidebar, deleted, settled) restarts fresh if it becomes eligible again.
    for (const id of retry.keys()) if (!waiting.has(id) && !pending.some(item => item.id === id)) retry.delete(id);
    if (!pending.length) { armRetry(); return; }
    inferring = true;
    const found = {}, nodes = new Map();
    try {
      for (const { id, candidates } of pending) {
        if (!extensionActive()) return;
        try {
          const child = await conversation(id, nodes);
          // A candidate deleted elsewhere (404) cannot be the source; other errors retry.
          const compared = (await Promise.all(candidates.map(candidate => conversation(candidate, nodes).catch(error => {
            if (/HTTP 404/.test(error.message)) return null;
            throw error;
          })))).filter(Boolean);
          const parent = pickParent(child, compared);
          tried.set(id, candidates); retry.delete(id);
          if (parent) found[id] = { parent, candidates };
        } catch {
          // Offline, 429 or 5xx: try again later instead of treating the comparison as settled.
          const wait = Math.min((retry.get(id)?.wait || 15000) * 2, 10 * 60 * 1000);
          retry.set(id, { wait, at: Date.now() + wait });
        }
      }
      if (Object.keys(found).length && extensionActive()) {
        const current = (await chrome.storage.local.get(PARENTS))[PARENTS] || {};
        await chrome.storage.local.set({ [PARENTS]: { ...current, ...found } });
      }
    } catch (error) { storageError(error); }
    finally {
      inferring = false; armRetry();
      if (rerun) { rerun = false; schedule(); }
    }
  }
  // Wake for the earliest outstanding retry, whichever lookups succeeded meanwhile.
  function armRetry() {
    window.clearTimeout(retryTimer);
    if (retry.size && !invalidated) retryTimer = window.setTimeout(schedule, Math.max(0, Math.min(...[...retry.values()].map(item => item.at)) - Date.now()));
  }

  async function load() {
    try {
      const next = await chrome.storage.local.get(null);
      if (!extensionActive()) return;
      items = next; index = branchIndex(items);
      parentOf = new Map();
      for (const [parent, records] of index) for (const { chat } of records) if (chat && !parentOf.has(chat)) parentOf.set(chat, parent);
      apply();
    } catch (error) { storageError(error); }
  }

  // The Clean chip floats over the hovered row so React's row markup stays untouched.
  function mountChip() {
    host = document.createElement('div');
    host.id = 'cgpt-helper-branch-clean';
    host.style.cssText = 'position:fixed;z-index:2147483000;display:none';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      button{font:12px ui-sans-serif,system-ui,-apple-system,sans-serif;cursor:pointer;border:1px solid #8886;border-radius:10px;
        padding:2px 8px;color:CanvasText;background:Canvas;box-shadow:0 1px 4px #0002;white-space:nowrap}
      button:hover{border-color:#d33;color:#d33}button:disabled{cursor:progress;opacity:.7}
      button:focus-visible{outline:2px solid #6da88b;outline-offset:2px}
    </style><button type="button"></button>`;
    chip = shadow.querySelector('button');
    chip.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const link = hoverRow?.querySelector(CHAT_LINK);
      if (hoverId) void clean(hoverId, link ? baseTitle(titleOf(link)) : '');
    });
    host.addEventListener('pointerleave', event => { if (!hoverRow?.contains(event.relatedTarget)) hideChip(); });
    document.body.appendChild(host);
  }
  function hideChip() {
    if (busy || !host) return;
    host.style.display = 'none'; hoverRow = null; hoverId = null;
  }
  function showChip(row, id) {
    const count = descendants(index, id).chats.filter(chat => !deleted.has(chat)).length;
    if (!count) { hideChip(); return; }
    if (!host) mountChip();
    hoverRow = row; hoverId = id;
    chip.textContent = `Clean · ${count}`;
    chip.title = `Delete ${count} branch chat${count === 1 ? '' : 's'} under this conversation, including branches of branches`;
    chip.setAttribute('aria-label', chip.title);
    host.style.colorScheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    host.style.display = 'block';
    // Sit just left of the native trailing buttons (options, pin).
    const rect = row.getBoundingClientRect();
    const buttons = [...row.querySelectorAll('button')].map(button => button.getBoundingClientRect()).filter(box => box.width && box.left > rect.left + rect.width / 2);
    const right = buttons.length ? Math.min(...buttons.map(box => box.left)) - 4 : rect.right - 40;
    const box = host.getBoundingClientRect();
    host.style.left = `${Math.max(rect.left + 4, right - box.width)}px`;
    host.style.top = `${rect.top + (rect.height - box.height) / 2}px`;
  }
  document.addEventListener('pointerover', event => {
    if (busy || invalidated || host?.contains(event.target)) return;
    const link = event.target.closest?.(CHAT_LINK) || event.target.closest?.('[role="listitem"], li')?.querySelector(CHAT_LINK);
    const id = link && root?.contains(link) ? chatOf(link) : null;
    if (!id) { if (hoverRow && !hoverRow.contains(event.target)) hideChip(); return; }
    const row = rowOf(link);
    if (row !== hoverRow || id !== hoverId) showChip(row, id);
  }, { capture: true, passive: true, signal: lifetime.signal });
  document.addEventListener('scroll', hideChip, { capture: true, passive: true, signal: lifetime.signal });

  async function clean(rootId, title) {
    if (busy || !extensionActive()) return;
    const { keys, chats } = descendants(index, rootId);
    const targets = chats.filter(chat => !deleted.has(chat));
    if (!targets.length) { hideChip(); return; }
    const name = title.length > 60 ? `${title.slice(0, 60)}…` : title;
    if (!window.confirm(`Delete ${targets.length} branch chat${targets.length === 1 ? '' : 's'} under “${name}”?\n\nThis includes branches of branches and cannot be undone.`)) return;
    busy = true; chip.disabled = true; chip.textContent = 'Deleting…';
    const failed = new Set();
    for (const chat of targets) {
      try {
        const response = await api(`/backend-api/conversation/${chat}`, { method: 'PATCH',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_visible: false }) });
        // Already deleted elsewhere counts as done.
        if (response.ok || response.status === 404) deleted.add(chat); else failed.add(chat);
      } catch { failed.add(chat); }
    }
    // Prune local links only after a complete success: a surviving descendant must stay
    // reachable from the source, and a retry treats already-deleted chats (404) as done.
    // Branches btw.js is still creating are left to it.
    const opening = new Set([...index.values()].flat().filter(record => record.key && record.opening).map(record => record.key));
    const stale = keys.filter(key => !opening.has(key));
    try {
      if (!failed.size && extensionActive()) {
        const parents = { ...((await chrome.storage.local.get(PARENTS))[PARENTS] || {}) };
        for (const chat of deleted) delete parents[chat];
        await chrome.storage.local.set({ [PARENTS]: parents });
        if (stale.length) await chrome.storage.local.remove(stale);
      }
    } catch (error) { storageError(error); }
    // A deleted branch may still be open in the floating window.
    if (deleted.size) globalThis.cgptCloseBtwChats?.([...deleted]);
    busy = false;
    if (chip) chip.disabled = false;
    hideChip(); apply();
    if (failed.size) window.alert(`Could not delete ${failed.size} branch chat${failed.size === 1 ? '' : 's'}. Reload ChatGPT and try again.`);
    const current = /\/c\/([a-zA-Z0-9-]+)(?:\/|$)/.exec(location.pathname)?.[1];
    if (current && deleted.has(current)) location.assign(`/c/${rootId}`);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (!extensionActive() || area !== 'local') return;
    if (Object.keys(changes).some(key => key === PARENTS || key.startsWith(PREFIX))) void load();
  });
  void load();
})();
