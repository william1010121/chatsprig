// Safe to load from overlapping content-script matches.
(function () {
  'use strict';

  if (globalThis.cgptLoadSettings) return;

  // Shared settings defaults. Loaded as a plain script before content scripts
  // and the options page; background.js imports shared/defaults.mjs instead.
  const DEFAULT_SETTINGS = {
    targetUrl: 'https://chatgpt.com/?temporary-chat=true',
    geminiExplainPrompt: 'explain this to me',
    geminiModel: 'current', // 'current' | 'flash-lite' | 'flash' | 'pro'
    altKWhenOpen: 'hide', // 'hide' | 'focus'
    windowWidth: 1100,
    windowHeight: 760,
    hideChatgptSidebar: true,
    focusPromptOnOpen: true,
    showLauncher: true,
    launcherPosition: 'bottom-right', // 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
    launcherHideOnChatgpt: false,
    enableLatexCopy: true,
    compactView: false,
    compactJoinParagraphs: true,
    compactLineHeight: 1.65,
    compactParagraphSpacing: 8,
    compactListSpacing: 3,
    compactSideMargin: 12,
    autoSendAskInSidebar: true,
    appendSystemPrompt: false,
    systemPrompt: '',
    systemPromptInterval: 0,
    rewriteCookies: true
  };

  let pending = null;
  function loadSettings() {
    if (!pending) {
      const changes = {};
      const promise = chrome.storage.sync.get(DEFAULT_SETTINGS)
        .then((settings) => ({ ...settings, ...changes }))
        .finally(() => { pending = null; });
      pending = { promise, changes };
    }
    // Share only an in-flight read; later calls always see current storage.
    return pending.promise.then((settings) => ({ ...settings }));
  }

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'sync' || !pending) return;
    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULT_SETTINGS) {
        pending.changes[key] = 'newValue' in change ? change.newValue : DEFAULT_SETTINGS[key];
      }
    }
  });

  globalThis.CGPT_HELPER_DEFAULTS = DEFAULT_SETTINGS;
  globalThis.cgptLoadSettings = loadSettings;
})();
