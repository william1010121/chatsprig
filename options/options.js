(function () {
  'use strict';

  const DEFAULT_SETTINGS = globalThis.CGPT_HELPER_DEFAULTS;
  const loadSettings = globalThis.cgptLoadSettings;

  const fields = [...document.querySelectorAll('[data-key]')];
  const status = document.getElementById('status');
  let statusTimer = null;

  function showStatus(text) {
    status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status.textContent = '';
    }, 1500);
  }

  function readField(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') {
      const value = Number(el.value);
      return Number.isFinite(value) ? value : DEFAULT_SETTINGS[el.dataset.key];
    }
    return el.value;
  }

  function writeField(el, value) {
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
  }

  async function load() {
    const settings = await loadSettings();
    for (const el of fields) writeField(el, settings[el.dataset.key]);
  }

  async function save(el) {
    const key = el.dataset.key;
    let value = readField(el);
    if (key === 'systemPromptInterval') {
      value = Number(el.value);
      if (!el.value.trim() || !Number.isSafeInteger(value) || value < 0) {
        el.setAttribute('aria-invalid', 'true');
        clearTimeout(statusTimer);
        status.textContent = 'Repeat interval must be a non-negative whole number (0 = first message only).';
        return;
      }
      el.removeAttribute('aria-invalid');
    }

    if (key === 'targetUrl') {
      value = String(value).trim();
      if (!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(value)) {
        value = DEFAULT_SETTINGS.targetUrl;
        writeField(el, value);
        showStatus('Use an HTTPS URL on chatgpt.com or chat.openai.com. Default restored.');
        await chrome.storage.sync.set({ [key]: value });
        return;
      }
    }

    await chrome.storage.sync.set({ [key]: value });
    showStatus('Saved');
  }

  for (const el of fields) {
    el.addEventListener('change', () => save(el).catch(() => {
      clearTimeout(statusTimer);
      status.textContent = 'Could not save. The prompt may exceed Chrome Sync’s size limit. Shorten it and try again.';
    }));
  }

  document.getElementById('open-shortcuts').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  document.getElementById('rewrite-now').addEventListener('click', async () => {
    const result = await chrome.runtime.sendMessage({ type: 'rewriteCookiesNow' });
    showStatus(`Cookies rewritten: ${result?.count ?? 0}`);
  });

  load();
})();
