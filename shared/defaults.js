// Safe to load from overlapping content-script matches.
(function () {
  'use strict';

  // Shared settings defaults. Loaded as a plain script before content scripts
  // and the options page; background.js imports shared/defaults.mjs instead.
  const DEFAULT_SETTINGS = {
    targetUrl: 'https://chatgpt.com/?temporary-chat=true',
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
    autoSendAskInSidebar: true,
    appendSystemPrompt: false,
    systemPrompt: '',
    systemPromptInterval: 0,
    rewriteCookies: true
  };

  function loadSettings() {
    return chrome.storage.sync.get(DEFAULT_SETTINGS);
  }

  globalThis.CGPT_HELPER_DEFAULTS = DEFAULT_SETTINGS;
  globalThis.cgptLoadSettings = loadSettings;
})();
