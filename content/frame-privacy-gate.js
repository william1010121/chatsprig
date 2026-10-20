// document_start, isolated world: guard user input before provider helpers load.
// An inert iframe alone does not stop its document from focusing its own editor.
(function () {
  'use strict';
  const names = new Set(['gemini_helper_overlay_frame', 'chatsprig_claude_frame', 'chatsprig_grok_frame']);
  if (window.top === window.self || !names.has(window.name)) return;
  let ready = false;
  let validate = null;
  // Only extension helpers in this document's isolated world can release the
  // gate. No page message or readiness report from a previous document can do so.
  window.cgptSetFramePrivacyReady = (value, check) => {
    ready = value === true;
    validate = typeof check === 'function' ? check : null;
  };
  const block = event => {
    // Providers' synthetic private-mode toggles must still initialize. This is
    // a user-input gate, not a firewall against programmatic provider requests.
    let permitted = ready;
    if (permitted && validate) {
      try { permitted = validate() === true; } catch { permitted = false; }
    }
    if (permitted || !event.isTrusted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of ['keydown', 'keypress', 'keyup', 'beforeinput', 'paste', 'cut', 'drop', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'submit']) {
    window.addEventListener(type, block, { capture: true, passive: false });
  }
})();
