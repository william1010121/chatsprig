// Floating launcher button injected into every page (top frame only).
(function () {
  'use strict';

  if (window.top !== window.self) return;

  const HOST_ID = 'cgpt-helper-launcher';
  const isChatgptHost =
    ['chatgpt.com', 'chat.openai.com'].some((domain) =>
      location.hostname === domain || location.hostname.endsWith('.' + domain));

  let host = null;
  let mountObserver = null;

  const POSITIONS = {
    'bottom-right': { bottom: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'top-left': { top: '20px', left: '20px' }
  };

  function build() {
    if (host) return;

    host = document.createElement('div');
    host.id = HOST_ID;

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial; position: fixed !important; display: block !important;
          width: 56px !important; height: 52px !important;
          visibility: visible !important; opacity: 1 !important; z-index: 2147483646 !important;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        .wrap { position: absolute; width: 56px; height: 52px; right: 0; bottom: 0; }
        .wrap:hover, .wrap:focus-within { width: 104px; }
        button {
          all: unset; box-sizing: border-box; position: absolute; bottom: 0; right: 0;
          width: 44px; height: 44px; border-radius: 50%; background: #111827;
          color: white; display: grid; place-items: center; cursor: pointer;
          box-shadow: 0 4px 14px #0004; transition: transform 160ms ease, background 160ms ease;
        }
        button[data-provider="chatgpt"] { z-index: 2; }
        button[data-provider="gemini"] { background: #36417d; transform: translate(-12px, -8px); }
        .wrap:hover button[data-provider="gemini"], .wrap:focus-within button[data-provider="gemini"] {
          transform: translate(-60px, 0);
        }
        button:hover { background: #263448; }
        button[data-provider="gemini"]:hover { background: #4858a0; }
        button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 3px; }
        svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
        .tip {
          position: absolute; bottom: 52px; right: 0; padding: 6px 10px; background: #111827;
          color: white; font-size: 12px; line-height: 1.2; border-radius: 6px;
          white-space: nowrap; opacity: 0; pointer-events: none;
        }
        button:hover .tip, button:focus-visible .tip { opacity: 1; }
        :host([data-pos$="left"]) .wrap { right: auto; left: 0; }
        :host([data-pos$="left"]) button { right: auto; left: 0; }
        :host([data-pos$="left"]) button[data-provider="gemini"] { transform: translate(12px, -8px); }
        :host([data-pos$="left"]) .wrap:hover button[data-provider="gemini"],
        :host([data-pos$="left"]) .wrap:focus-within button[data-provider="gemini"] { transform: translate(60px, 0); }
        :host([data-pos$="left"]) .tip { right: auto; left: 0; }
        :host([data-pos^="top"]) .wrap { top: 0; bottom: auto; }
        :host([data-pos^="top"]) button { top: 0; bottom: auto; }
        :host([data-pos^="top"]) .tip { top: 52px; bottom: auto; }
        :host([data-pos="top-right"]) button[data-provider="gemini"] { transform: translate(-12px, 8px); }
        :host([data-pos="top-left"]) button[data-provider="gemini"] { transform: translate(12px, 8px); }
        :host([data-pos="top-right"]) .wrap:hover button[data-provider="gemini"],
        :host([data-pos="top-right"]) .wrap:focus-within button[data-provider="gemini"] { transform: translate(-60px, 0); }
        :host([data-pos="top-left"]) .wrap:hover button[data-provider="gemini"],
        :host([data-pos="top-left"]) .wrap:focus-within button[data-provider="gemini"] { transform: translate(60px, 0); }
        @media (prefers-reduced-motion: reduce) { button { transition: none; } }
      </style>
      <div class="wrap">
        <button type="button" data-provider="chatgpt" aria-label="ChatGPT (Alt+K)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.2A8 8 0 1 1 21 12z"/></svg>
          <span class="tip">ChatGPT (Alt+K)</span>
        </button>
        <button type="button" data-provider="gemini" aria-label="Gemini (Alt+G)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C10.8 8.3 8.3 10.8 2 12c6.3 1.2 8.8 3.7 10 10 1.2-6.3 3.7-8.8 10-10-6.3-1.2-8.8-3.7-10-10Z" fill="currentColor" stroke="none"/></svg>
          <span class="tip">Gemini (Alt+G)</span>
        </button>
      </div>
    `;
    for (const item of shadow.querySelectorAll('button[data-provider]')) {
      item.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'toggle', provider: item.dataset.provider }).catch(() => {});
      });
    }

    document.documentElement.appendChild(host);
    // Page hydration can remove nodes injected before the app finishes mounting.
    mountObserver = new MutationObserver(() => {
      if (host && !host.isConnected) document.documentElement.appendChild(host);
    });
    mountObserver.observe(document.documentElement, { childList: true });
  }

  function destroy() {
    mountObserver?.disconnect();
    mountObserver = null;
    host?.remove();
    host = null;
  }

  function applyPosition(position) {
    if (!host) return;
    const pos = POSITIONS[position] || POSITIONS['bottom-right'];
    host.style.top = pos.top || '';
    host.style.bottom = pos.bottom || '';
    host.style.left = pos.left || '';
    host.style.right = pos.right || '';
    host.setAttribute('data-pos', position in POSITIONS ? position : 'bottom-right');
  }

  function shouldShow(settings) {
    if (!settings.showLauncher) return false;
    if (isChatgptHost && settings.launcherHideOnChatgpt) return false;
    return true;
  }

  async function render() {
    const settings = await cgptLoadSettings();
    if (shouldShow(settings)) {
      build();
      applyPosition(settings.launcherPosition);
    } else {
      destroy();
    }
  }

  async function init() {
    await render();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (
        'showLauncher' in changes ||
        'launcherPosition' in changes ||
        'launcherHideOnChatgpt' in changes
      ) {
        render();
      }
    });
  }

  init();
})();
