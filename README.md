<div align="center">
  <img src="assets/branding/chatsprig-icon-concept.png" width="112" alt="ChatSprig — a conversation with room to grow">
  <h1>ChatSprig</h1>
  <p><strong>Ask here. Stay here.</strong></p>
  <p>Temporary ChatGPT conversations, right on your page.</p>
  <p>
    <a href="https://github.com/william1010121/chatsprig/stargazers"><img src="https://img.shields.io/badge/%E2%98%85-Star%20on%20GitHub-174D3B?style=for-the-badge" alt="Star on GitHub"></a>
    <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-FAF7EF?style=for-the-badge&logo=googlechrome&logoColor=174D3B" alt="Chrome Manifest V3">
    <img src="https://img.shields.io/badge/version-2.1.0-174D3B?style=for-the-badge" alt="Version 2.1.0">
  </p>
  <p><a href="#meet-chatsprig">Features</a> · <a href="#get-started">Get started</a> · <a href="#keyboard-shortcuts">Shortcuts</a> · <a href="#privacy--permissions">Privacy</a></p>
</div>

---

## Meet ChatSprig

Reading an article. Working through a problem. A quick question comes to mind.
Open ChatSprig, ask ChatGPT, and return to what you were doing — all in the same page.

| A little less friction | What you get |
| --- | --- |
| **Chat where you are** | A centered, resizable ChatGPT overlay on supported web pages. |
| **Start fresh** | Open a temporary chat, or reload the overlay for a new one. |
| **Keep your focus** | Hide the embedded sidebar and jump straight into the prompt. |
| **Reach it your way** | Keyboard shortcuts or a floating launcher in your preferred corner. |
| **Take the math with you** | Copy supported math on ChatGPT pages as LaTeX source. |
| **Make it yours** | Click the toolbar icon for settings that sync with Chrome. |

ChatSprig opens ChatGPT itself. It does not automatically read an article or send the surrounding page to ChatGPT. Type or paste the context you want to discuss.

## Get started

**Chrome Web Store:** submission preparation is in progress. A store link will be added after approval.

### Install from this repository

Repository access is required while this project is private.

1. Clone or download this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the project folder.
4. Refresh your web pages, then press **Alt+K** on Windows or **Option+K** on macOS.

Sign in to ChatGPT in a normal tab first if needed. ChatGPT account, usage, and plan restrictions still apply. Disable any older userscript version of this helper to avoid duplicate actions.

## Keyboard shortcuts

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Open or close the chat | `Alt+K` | `Option+K` |
| Start a new temporary chat | `Alt+N` | `Option+N` |
| Open settings | Click the extension toolbar icon | Click the extension toolbar icon |

Change browser command assignments at `chrome://extensions/shortcuts`.
The fixed Alt/Option+K and Alt/Option+N page shortcuts also work as a fallback, including inside the embedded prompt. They remain active even if browser commands are remapped and require focus inside a web page.

## Your workspace, your settings

- Choose the overlay size and launcher corner.
- Hide the ChatGPT sidebar inside the overlay.
- Focus the prompt automatically when opening.
- Choose whether the toggle shortcut closes the overlay or focuses it.
- Show or hide the launcher, including specifically on ChatGPT websites.
- Enable LaTeX copying and configure cross-site sign-in compatibility.

The main ChatGPT website keeps its own sidebar. The sidebar preference applies only to ChatSprig's embedded chat.

## Privacy & permissions

**No developer-operated analytics, advertising, or conversation backend.** Settings are stored through Chrome Sync. Chat messages go directly to the ChatGPT website and are subject to OpenAI's terms and privacy practices.

| Access | Purpose |
| --- | --- |
| Web-page content scripts | Display the launcher, handle shortcuts, and host the overlay. On ChatGPT, also focus the prompt, hide the embedded sidebar, and convert selected math when copying. |
| Tabs | Find the active tab and route overlay actions. |
| Storage | Save and sync preferences. |
| ChatGPT cookies | Support cross-site sign-in when cookie rewriting is enabled. |
| Declarative network rules | Remove frame-blocking response headers from ChatGPT subframe responses so the site can be embedded. |

### Cross-site sign-in compatibility

Cookie rewriting is **enabled by default**. It changes eligible ChatGPT cookies to `SameSite=None; Secure`, including session cookies, in the browser's cookie store. This weakens SameSite-based cross-site request forgery protection and can affect ChatGPT outside the overlay. The extension does not send those cookie values to its developer.

Turning this setting off stops future rewrites; **it does not restore cookies already changed**. ChatGPT may replace them during subsequent account activity. Chrome's third-party-cookie restrictions can still prevent sign-in inside other websites.

Read the [privacy policy](PRIVACY.md) for details.

## Know the limits

- Chrome internal pages, the Web Store, some PDF viewers, and restricted pages cannot host the overlay. Failed shortcuts show a `!` badge; ChatSprig does not open a fallback ChatGPT tab or window.
- The embedded frame blocks popups and top-level navigation. Sign-in flows or links requiring a separate window may not work.
- Website security rules, browser cookie policies, and changes to ChatGPT can affect embedding.
- Temporary chats follow ChatGPT's own retention rules; “temporary” does not mean that OpenAI retains no data.
- Windows keyboard behavior is covered by automated tests; the current browser layout was verified on macOS. Linux has not been manually verified.

## Development

Plain JavaScript. Manifest V3. No runtime framework or build step.

```bash
# Run regression checks (Node.js)
node --test tests/regression.test.mjs

# Regenerate icon sizes from the approved artwork (macOS)
python3 scripts/make_icons.py

# Create a clean Chrome Web Store upload
python3 scripts/package_extension.py
```

<details>
<summary><strong>Project map</strong></summary>

```text
background.js       Commands, tab routing, settings, cookie compatibility
content/            Overlay, launcher, keyboard handling, LaTeX copying
shared/             Shared settings defaults
options/            Settings page
icons/              Packaged extension icons
assets/branding/    Approved GPT Image artwork and generation prompts
store/              Listing copy, review notes, and promotional assets
scripts/            Icon export and release packaging
```

</details>

---

<div align="center">
  <p><strong>A little chat. Keep your flow.</strong></p>
  <p>If ChatSprig helps you, <a href="https://github.com/william1010121/chatsprig/stargazers">give it a star ★</a>.</p>
  <p><sub>The Star link is available to repository collaborators while this repository is private. No public star count is exposed.</sub></p>
  <p><sub>Independent project. Not affiliated with or endorsed by OpenAI. ChatGPT is an OpenAI product.</sub></p>
</div>
