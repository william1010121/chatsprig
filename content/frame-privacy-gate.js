// document_start, isolated world: guard user input before provider helpers load.
// An inert iframe alone does not stop its document from focusing its own editor.
(function () {
  'use strict';
  const names = new Set(['gemini_helper_overlay_frame', 'chatsprig_claude_frame', 'chatsprig_grok_frame']);
  if (window.top === window.self || !names.has(window.name)) return;
  let ready = false;
  let validate = null;
  let lockedRoot = null;
  let restoreInert = false;
  const permitted = () => {
    if (!ready) return false;
    try { return !validate || validate() === true; } catch { return false; }
  };
  // Lock the actual child document, not just the parent's iframe element.
  // Noncancelable IME/dictation edits cannot be secured by preventDefault().
  // Inert keeps layout alive, so synthetic provider initialization still works.
  const syncInteractivity = () => {
    const root = document.documentElement;
    if (permitted()) {
      if (lockedRoot && restoreInert) lockedRoot.inert = false;
      lockedRoot = null;
      restoreInert = false;
      return;
    }
    if (!root) return;
    if (root !== lockedRoot) {
      if (lockedRoot && restoreInert) lockedRoot.inert = false;
      lockedRoot = root;
      restoreInert = !root.inert;
    }
    if (!root.inert) root.inert = true;
  };
  // document_start may run before <html>; also handle a replaced root or a
  // provider removing inert during hydration. Do not rewrite editor contents.
  const watchRoot = () => {
    rootObserver.disconnect();
    rootObserver.observe(document, { childList: true });
    if (document.documentElement) rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['inert'] });
    syncInteractivity();
  };
  const rootObserver = new MutationObserver(watchRoot);
  watchRoot();
  // Only extension helpers in this document's isolated world can release the
  // gate. No page message or readiness report from a previous document can do so.
  window.cgptSetFramePrivacyReady = (value, check) => {
    ready = value === true;
    validate = typeof check === 'function' ? check : null;
    syncInteractivity();
  };
  const block = event => {
    // Providers' synthetic private-mode toggles must still initialize. This is
    // a user-input gate, not a firewall against programmatic provider requests.
    syncInteractivity();
    if (permitted() || !event.isTrusted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const type of ['keydown', 'keypress', 'keyup', 'compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input', 'focusin', 'paste', 'cut', 'drop', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'submit']) {
    window.addEventListener(type, block, { capture: true, passive: false });
  }
})();
