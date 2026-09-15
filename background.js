import { DEFAULT_SETTINGS, loadSettings } from './shared/defaults.mjs';

const COOKIE_DOMAINS = ['chatgpt.com', 'chat.openai.com'];

/* ---------- Overlay routing ---------- */

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

async function sendToTab(tabId, type) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type }, { frameId: 0 });
    return response?.ok === true;
  } catch {
    return false;
  }
}

async function routeOverlay(tab, type) {
  tab = tab || (await getActiveTab());
  if (!tab?.id) return false;

  const ok = await sendToTab(tab.id, type);
  await chrome.action.setBadgeText({ tabId: tab.id, text: ok ? '' : '!' });
  await chrome.action.setTitle({
    tabId: tab.id,
    title: ok
      ? 'ChatSprig Settings'
      : 'ChatGPT cannot be embedded on this page. Refresh a regular web page and try again.'
  });
  return ok;
}

function toggleOverlay(tab) {
  return routeOverlay(tab, 'toggleOverlay');
}

function refreshOverlay(tab) {
  return routeOverlay(tab, 'refreshOverlay');
}

// A browser command and a page key event can describe the same physical press.
let lastShortcut = null;
async function handleShortcut(command, tab, source) {
  if (!['toggle-chat', 'refresh-chat'].includes(command)) return false;
  tab = tab || (await getActiveTab());
  if (!tab?.id) return false;
  const now = Date.now();
  if (lastShortcut && lastShortcut.tabId === tab.id &&
      lastShortcut.command === command && lastShortcut.source !== source &&
      now - lastShortcut.time < 250) return true;
  lastShortcut = { tabId: tab.id, command, source, time: now };
  return command === 'toggle-chat' ? toggleOverlay(tab) : refreshOverlay(tab);
}

chrome.commands.onCommand.addListener((command, tab) => {
  handleShortcut(command, tab, 'browser');
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'shortcut' && sender.tab) {
    handleShortcut(message.command, sender.tab, 'page')
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'toggle') {
    toggleOverlay(sender.tab).then((ok) => sendResponse({ ok }));
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
