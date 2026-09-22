import { DEFAULT_SETTINGS, loadSettings } from './shared/defaults.mjs';

const COOKIE_DOMAINS = ['chatgpt.com', 'chat.openai.com'];

/* ---------- Overlay routing ---------- */

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

async function sendToTab(tabId, type, provider) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type, ...(provider ? { provider } : {}) }, { frameId: 0 });
    return response?.ok === true;
  } catch {
    return false;
  }
}

async function routeOverlay(tab, type, provider) {
  tab = tab || (await getActiveTab());
  if (!tab?.id) return false;

  const ok = await sendToTab(tab.id, type, provider);
  await chrome.action.setBadgeText({ tabId: tab.id, text: ok ? '' : '!' });
  await chrome.action.setTitle({
    tabId: tab.id,
    title: ok
      ? 'ChatSprig Settings'
      : 'Chat cannot be embedded on this page. Refresh a regular web page and try again.'
  });
  return ok;
}

function toggleOverlay(tab, provider = 'chatgpt') {
  return routeOverlay(tab, 'toggleOverlay', provider);
}

function refreshOverlay(tab) {
  return routeOverlay(tab, 'refreshOverlay');
}

// A browser command and a page key event can describe the same physical press.
let lastShortcut = null;
async function handleShortcut(command, tab, source) {
  if (!['toggle-chat', 'toggle-gemini', 'refresh-chat'].includes(command)) return false;
  tab = tab || (await getActiveTab());
  if (!tab?.id) return false;
  const now = Date.now();
  if (lastShortcut && lastShortcut.tabId === tab.id &&
      lastShortcut.command === command && lastShortcut.source !== source &&
      now - lastShortcut.time < 250) return true;
  lastShortcut = { tabId: tab.id, command, source, time: now };
  return command === 'refresh-chat' ? refreshOverlay(tab)
    : toggleOverlay(tab, command === 'toggle-gemini' ? 'gemini' : 'chatgpt');
}

chrome.commands.onCommand.addListener((command, tab) => {
  handleShortcut(command, tab, 'browser');
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

const sidebarRequests = new Map();
const sidebarFrames = new Map();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const providerForUrl = (url = '') => /^https:\/\/gemini\.google\.com\//.test(url) ? 'gemini'
  : /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url) ? 'chatgpt' : null;

async function askSidebar(message, sender) {
  const tabId = sender.tab.id;
  const provider = message.provider || 'chatgpt';
  if (sidebarRequests.has(tabId)) return { message: 'Sidebar is still handling the previous selection.' };
  const request = { id: crypto.randomUUID(), provider, documentId: null };
  sidebarRequests.set(tabId, request);
  try {
    const deadline = Date.now() + 35000;
    while (Date.now() < deadline && sidebarRequests.get(tabId) === request) {
      const documentId = sidebarFrames.get(`${tabId}:${provider}`);
      if (documentId) {
        let frame;
        try {
          frame = await chrome.tabs.sendMessage(tabId, { type: 'sidebarProbe', provider }, { documentId });
        } catch {
          if (sidebarFrames.get(`${tabId}:${provider}`) === documentId) sidebarFrames.delete(`${tabId}:${provider}`);
        }
        if (frame?.ready && frame.provider === provider && sidebarRequests.get(tabId) === request) {
          request.documentId = documentId;
          return await chrome.tabs.sendMessage(tabId, {
            type: 'sidebarFill', provider, id: request.id, text: message.text, autoSend: message.autoSend === true
          }, { documentId });
        }
      } else {
        // Helpers register their own exact document; discovery responses are never used as a fill target.
        chrome.tabs.sendMessage(tabId, { type: 'sidebarDiscover', provider }).catch(() => {});
      }
      await pause(200);
    }
    return { message: 'Sidebar is not ready. Check sign-in and temporary mode, then try again.' };
  } catch {
    return { message: 'Sidebar changed while filling. Check the draft before trying again.' };
  } finally {
    if (sidebarRequests.get(tabId) === request) sidebarRequests.delete(tabId);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  sidebarRequests.delete(tabId);
  for (const provider of ['chatgpt', 'gemini']) sidebarFrames.delete(`${tabId}:${provider}`);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'sidebarFrameIdentity' && sender.tab && sender.frameId > 0 && sender.documentId &&
      providerForUrl(sender.url) === message.provider) {
    sidebarFrames.set(`${sender.tab.id}:${message.provider}`, sender.documentId);
    sendResponse({ documentId: sender.documentId });
    return false;
  }

  if (['askSidebar', 'cancelSidebar'].includes(message.type)) {
    if (!sender.tab || sender.frameId !== 0) return false;
    if (message.type === 'cancelSidebar') {
      const request = sidebarRequests.get(sender.tab.id);
      sidebarRequests.delete(sender.tab.id);
      if (request?.documentId) chrome.tabs.sendMessage(sender.tab.id, {
        type: 'sidebarCancel', provider: request.provider, id: request.id
      }, { documentId: request.documentId }).catch(() => {});
      sendResponse({ ok: true });
      return false;
    }
    const provider = message.provider || 'chatgpt';
    if (providerForUrl(sender.url) !== provider || typeof message.text !== 'string' || !message.text.trim()) return false;
    askSidebar(message, sender).then(sendResponse);
    return true;
  }

  if (message.type === 'shortcut' && sender.tab) {
    handleShortcut(message.command, sender.tab, 'page')
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'toggle') {
    toggleOverlay(sender.tab, message.provider === 'gemini' ? 'gemini' : 'chatgpt').then((ok) => sendResponse({ ok }));
    return true;
  }

  if (message.type === 'getSettings') {
    loadSettings().then(sendResponse);
    return true;
  }

  if (message.type === 'rewriteCookiesNow') {
    rewriteAllCookies().then((count) => sendResponse({ ok: true, count }));
    return true;
  }

  return false;
});

/* ---------- Cookie rewriting (SameSite=Lax -> None) ----------
 * ChatGPT's session cookies are SameSite=Lax, so they are not sent to a
 * chatgpt.com iframe embedded in another site. Rewriting them to
 * SameSite=None; Secure keeps the overlay logged in. This weakens CSRF
 * protection for chatgpt.com; the user opted in and can disable it.
 */

function isChatgptCookie(cookie) {
  const domain = cookie.domain.replace(/^\./, '');
  return COOKIE_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d));
}

function cookieUrl(cookie) {
  return `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
}

async function makeCrossSite(cookie) {
  if (cookie.sameSite === 'no_restriction') return false;
  if (cookie.partitionKey) return false;

  const details = {
    url: cookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: true,
    httpOnly: cookie.httpOnly,
    sameSite: 'no_restriction',
    storeId: cookie.storeId
  };

  if (!cookie.hostOnly) details.domain = cookie.domain;
  if (cookie.expirationDate) details.expirationDate = cookie.expirationDate;

  try {
    await chrome.cookies.set(details);
    return true;
  } catch (error) {
    console.warn('[ChatSprig] cookie rewrite failed:', cookie.name, error);
    return false;
  }
}

async function rewriteAllCookies() {
  const settings = await loadSettings();
  if (!settings.rewriteCookies) return 0;

  let count = 0;
  for (const domain of COOKIE_DOMAINS) {
    const cookies = await chrome.cookies.getAll({ domain });
    for (const cookie of cookies) {
      if (await makeCrossSite(cookie)) count += 1;
    }
  }
  return count;
}

chrome.cookies.onChanged.addListener(async ({ removed, cookie }) => {
  if (removed) return;
  if (!isChatgptCookie(cookie)) return;
  if (cookie.sameSite === 'no_restriction') return;

  const settings = await loadSettings();
  if (!settings.rewriteCookies) return;

  await makeCrossSite(cookie);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.rewriteCookies?.newValue === true) {
    rewriteAllCookies();
  }
});

/* ---------- Lifecycle ---------- */

chrome.runtime.onInstalled.addListener(async (details) => {
  const existing = await chrome.storage.sync.get(null);
  const missing = {};
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(key in existing)) missing[key] = value;
  }
  // Restore the requested visible launcher once when upgrading the affected releases.
  if (details.reason === 'update' && ['2.0.0', '2.0.1', '2.0.2'].includes(details.previousVersion)) {
    Object.assign(missing, {
      showLauncher: true,
      launcherHideOnChatgpt: false,
      launcherPosition: 'bottom-right'
    });
  }
  if (Object.keys(missing).length) await chrome.storage.sync.set(missing);

  await rewriteAllCookies();
});

chrome.runtime.onStartup.addListener(() => {
  rewriteAllCookies();
});
