// ES module twin of defaults.js for the background service worker.
export const DEFAULT_SETTINGS = {
  targetUrl: 'https://chatgpt.com/?temporary-chat=true',
  geminiModel: 'current', // 'current' | 'flash-lite' | 'flash' | 'pro'
  altKWhenOpen: 'hide',
  windowWidth: 1100,
  windowHeight: 760,
  hideChatgptSidebar: true,
  focusPromptOnOpen: true,
  showLauncher: true,
  launcherPosition: 'bottom-right',
  launcherHideOnChatgpt: false,
  enableLatexCopy: true,
  compactView: false,
  compactJoinParagraphs: true,
  autoSendAskInSidebar: true,
  appendSystemPrompt: false,
  systemPrompt: '',
  systemPromptInterval: 0,
  rewriteCookies: true
};

export function loadSettings() {
  return chrome.storage.sync.get(DEFAULT_SETTINGS);
}
