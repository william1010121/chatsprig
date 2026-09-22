// Page fallback when the browser does not dispatch an extension command.
(function () {
  'use strict';

  window.addEventListener('keydown', (event) => {
    if (!event.isTrusted || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const command = event.code === 'KeyK' ? 'toggle-chat'
      : event.code === 'KeyG' ? 'toggle-gemini'
      : event.code === 'KeyN' ? 'refresh-chat' : null;
    if (!command || !chrome.runtime?.id) return;

    // Option+N can be a dead key; match code before composition starts.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    chrome.runtime.sendMessage({ type: 'shortcut', command }).catch(() => {});
  }, true);
})();
