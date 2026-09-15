// Floating launcher button injected into every page (top frame only).
(function () {
  'use strict';

  if (window.top !== window.self) return;

  const HOST_ID = 'cgpt-helper-launcher';
  const isChatgptHost =
    ['chatgpt.com', 'chat.openai.com'].some((domain) =>
      location.hostname === domain || location.hostname.endsWith('.' + domain));

  let host = null;
  let button = null;
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
          all: initial;
          position: fixed !important;
          display: block !important;
          width: 44px !important;
          height: 44px !important;
          visibility: visible !important;
          opacity: 1 !important;
          z-index: 2147483646 !important;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        button {
          all: unset;
          box-sizing: border-box;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: #111827;
          color: #ffffff;
          display: grid;
          place-items: center;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
          opacity: 0.85;
          transition: opacity 120ms ease, transform 120ms ease;
        }
        button:hover {
          opacity: 1;
          transform: scale(1.06);
        }
        button:focus-visible {
          outline: 2px solid #60a5fa;
          outline-offset: 2px;
        }
        svg {
          width: 22px;
          height: 22px;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .tip {
          position: absolute;
          bottom: 100%;
          right: 0;
          margin-bottom: 8px;
          padding: 6px 10px;
          background: #111827;
          color: #ffffff;
          font-size: 12px;
          line-height: 1.2;
          border-radius: 6px;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transform: translateY(4px);
          transition: opacity 120ms ease, transform 120ms ease;
        }
        :host([data-pos^="top"]) .tip {
          bottom: auto;
          top: 100%;
          margin-bottom: 0;
          margin-top: 8px;
        }
        :host([data-pos$="left"]) .tip {
          right: auto;
          left: 0;
        }
        .wrap { position: relative; }
        .wrap:hover .tip {
          opacity: 1;
          transform: translateY(0);
        }
      </style>
      <div class="wrap">
        <button type="button" aria-label="ChatSprig (Alt+K)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.2A8 8 0 1 1 21 12z"/>
          </svg>
        </button>
        <div class="tip">ChatSprig (Alt+K)</div>
      </div>
    `;

    button = shadow.querySelector('button');
    button.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'toggle' }).catch(() => {});
    });

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
    button = null;
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
