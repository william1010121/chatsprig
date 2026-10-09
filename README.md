<div align="center">
  <img src="assets/branding/chatsprig-icon-concept.png" width="112" alt="ChatSprig — a conversation with room to grow">
  <h1>ChatSprig</h1>
  <p><strong>Ask here. Stay here.</strong></p>
  <p>Temporary ChatGPT and Gemini conversations, right on your page.</p>
  <p>
    <a href="https://chromewebstore.google.com/detail/chatsprig-%E2%80%94-temporary-cha/ecgdiaglcgfknjopckmjjcokanaldobe"><img src="https://img.shields.io/badge/Chrome_Web_Store-Install-174D3B?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Install ChatSprig from the Chrome Web Store"></a>
    <a href="https://github.com/william1010121/chatsprig/stargazers"><img src="https://img.shields.io/badge/%E2%98%85-Star%20on%20GitHub-174D3B?style=for-the-badge" alt="Star on GitHub"></a>
    <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-FAF7EF?style=for-the-badge&logo=googlechrome&logoColor=174D3B" alt="Chrome Manifest V3">
    <img src="https://img.shields.io/badge/version-2.6.3-174D3B?style=for-the-badge" alt="Version 2.6.3">
  </p>
  <p><a href="#meet-chatsprig">Features</a> · <a href="#get-started">Get started</a> · <a href="#keyboard-shortcuts">Shortcuts</a> · <a href="#privacy--permissions">Privacy</a></p>
</div>

---

## Meet ChatSprig

Reading an article. Working through a problem. A quick question comes to mind.
Open ChatSprig, ask ChatGPT, and return to what you were doing — all in the same page.

| A little less friction | What you get |
| --- | --- |
| **Chat where you are** | A centered, resizable ChatGPT or Gemini overlay on supported web pages. |
| **Start fresh** | Open a temporary chat, or reload the overlay for a new one. |
| **Keep your focus** | Hide the embedded sidebar and jump straight into the prompt. |
| **Reach it your way** | Keyboard shortcuts or a floating launcher in your preferred corner. |
| **Take the math with you** | Copy supported math on ChatGPT pages as LaTeX source. |
| **Make it yours** | Click the toolbar icon for settings that sync with Chrome. |

ChatSprig opens the ChatGPT and Gemini websites directly. On either service’s main page, select message text and choose **Ask in sidebar** to send just that selection to the matching floating chat. It does not send the surrounding conversation or page. You can also type or paste context yourself.

![ChatSprig running inside a Wikipedia page](store/screenshot-overlay.png)

## Get started

**Chrome Web Store:** [install ChatSprig](https://chromewebstore.google.com/detail/chatsprig-%E2%80%94-temporary-cha/ecgdiaglcgfknjopckmjjcokanaldobe). The local extension is version 2.6.3, with ChatGPT `/btw` branches, Ask in new branch, a nested branch sidebar with Clean, Gemini support, Ask in sidebar, Compact view controls, custom prompts, and skill completion.

### Demo

The [ChatSprig showcase site](https://chatsprig.driseam.com/) walks through all 14 features with live demos and a 3-minute tour video. Its source is in [`web/`](web/README.md).

Watch the [ChatSprig 2.1.1 workflow demo](demo/ChatSprig-2.1.1-demo-1080p.mp4), with the keyboard interaction and the full open → ask → return flow shown on screen. See the [demo notes and attribution](demo/README.md).

### Install from this repository

1. Clone or download this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the project folder.
4. Refresh your web pages, then press **Alt+K** on Windows or **Option+K** on macOS.

Sign in to ChatGPT in a normal tab first if needed. ChatGPT account, usage, and plan restrictions still apply. Disable any older userscript version of this helper to avoid duplicate actions.

## Keyboard shortcuts

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Open / switch to ChatGPT | `Alt+K` | `Option+K` |
| Open / switch to Gemini | `Alt+G` | `Option+G` |
| Start a new temporary chat in the current service | `Alt+N` | `Option+N` |
| Open settings | Click the extension toolbar icon | Click the extension toolbar icon |

Change browser command assignments at `chrome://extensions/shortcuts`.
The fixed Alt/Option+K, Alt/Option+G, and Alt/Option+N page shortcuts also work as a fallback, including inside the embedded prompt. They remain active even if browser commands are remapped and require focus inside a web page.

## Your workspace, your settings

- Choose the overlay size and launcher corner.
- Hide the sidebar inside either service’s overlay.
- Focus the prompt automatically when opening.
- Choose whether the toggle shortcut closes the overlay or focuses it.
- Save text templates in Settings → Skills. Type `//` at the start of a line or after a space in a ChatGPT or Gemini prompt, then type a name to filter. Arrow keys and Enter select a skill; Escape closes the menu. Selection inserts editable text without sending. Custom skills stay in this browser (`chrome.storage.local`).
- `//system-prompt` inserts the current text from Settings → System prompt wherever skill completion is available. If no text is configured, its entry opens Settings and preserves the draft. It is separate from automatic append, so using both may repeat the text.
- Show or hide the launcher, including specifically on ChatGPT websites.
- Enable LaTeX copying and configure cross-site sign-in compatibility.
- Toggle **Compact view** with the control at the bottom of ChatGPT’s model picker in both Chat and Work. It uses comfortable paragraph/list spacing, with default 1.65 line height and 12% side margins. The gear at the upper right of the Compact view control opens live sliders for line spacing (1.2–2.4), paragraph spacing (0–24px), list item spacing (0–12px) and symmetric side margins (0–25%). Paragraph spacing also sets the gap below headings, and twice that value above them; list item spacing also applies to nested lists. Opening the panel enables Compact view for immediate preview; releasing a slider saves the choice across tabs. Reset restores 1.65, 8px, 3px and 12%. Intelligent UI cards retain their native responsive width and internal typography as the surrounding prose changes. Settings → Compact view has a **Join adjacent text paragraphs** option, on by default; turn it off to keep paragraph breaks. The choices sync across tabs and also apply inside the overlay; turning Compact view off restores ChatGPT’s layout.

### Gemini and switching services

Press **Alt+G** (Option+G on macOS) to open Gemini. **Alt+K** switches to ChatGPT. Only one service is visible per page; switching or closing keeps each loaded frame, conversation, and draft. **Alt+N** replaces only the current service with a fresh temporary chat, even when the overlay is closed. Before either service has been used, Alt+N defaults to ChatGPT. Reloading the host page restores the open service with a new temporary conversation.

The two launcher buttons overlap in the selected corner. Hover or focus them with the keyboard to expand inward, then choose ChatGPT or Gemini. The existing “Hide launcher on ChatGPT” setting applies only to ChatGPT websites.

Gemini loads `/app`, activates Temporary chat, and verifies that mode before exposing the input. If initialization or embedded sign-in fails, the overlay shows a retry message; it does not silently use an ordinary conversation. Sign in at gemini.google.com in a regular tab first. Google cookies are not rewritten. Browser restrictions can still prevent embedded sign-in. Switching back preserves the existing temporary chat; reloading creates a new one.

In Settings, **Default Gemini model** selects Flash-Lite, Flash, or Pro for new temporary chats. The default leaves Gemini’s current choice unchanged. Switching back to an existing conversation does not change its model. If a requested model is unavailable or cannot be verified, initialization reports an error instead of silently using another model.

Gemini supports the overlay and Ask in sidebar. LaTeX copying and Compact view remain ChatGPT-only.

On the main ChatGPT page, the Gemini sparkle icon in each response’s action row has the tooltip **explain with gemini**. It takes the complete response from ChatGPT’s native Copy action and passes that exact text to the existing Gemini floating chat. Settings → Explain with Gemini lets you edit the prefix; the default is `explain this to me`. An empty prefix sends only the copied response. The action preserves the user’s clipboard. It follows the shared Auto-send preference and preserves existing drafts; it does not send the surrounding conversation.

### BTW branches (ChatGPT only)

In a saved ChatGPT conversation, type `/btw your question` at the start of the prompt and press Enter or the send button. You can also select **/btw** in ChatGPT's native `/` menu to fill the command, then enter your question. ChatSprig uses ChatGPT's native branch route to copy the conversation through the latest visible message, then sends your question in a separate floating chat. Chat and Work branches retain their source mode. The command is removed from the question, and the source conversation receives no message. Shift+Enter still inserts a newline; an empty `/btw` asks you to add a question. Wait for any current response to finish before branching. Layouts without native conversation/message identifiers cannot create a branch; the draft stays available with a status message.

Typing `/b`, `/bt`, or `/btw` selects the BTW suggestion. Enter completes it to `/btw ` without sending; add your question afterward. The suggestion remains available when ChatGPT's native search has no matching commands. Arrow keys and pointer selection still work, and Escape closes completion while retaining the draft.

Hover over **Branches · N** above the prompt to see the BTW branches created for this conversation; click to keep the list open, or use the keyboard/touch controls. The right side shows up to three recent ready branches, newest first, with truncated titles for one-click access. Narrow composers show fewer shortcuts. Select a branch to open its floating window. Switching and closing retain loaded conversations and drafts. Branch titles and resolved URLs are stored locally per source conversation, so a page reload can reopen an existing branch without creating it again or resending its question. Unsent iframe drafts survive switching, but not a host-page reload. Gemini and embedded composers do not offer `/btw`.

**Copy links**, beside **Branches · N**, copies plain links to the current conversation and every branch below it, including branches of branches, as an indented list. Nothing is shared or published; each line is the chat's title (when known) and its `https://chatgpt.com/c/…` link:

```text
- Trip plan — https://chatgpt.com/c/…
  - Hotels — https://chatgpt.com/c/…
    - Branch · Trip plan — https://chatgpt.com/c/…
```

In ChatGPT's left history sidebar, branch chats are nested under the conversation they came from, and branches of branches nest one level further, each indented with a guide line. A group sits where its topmost member appears in the native list, and nesting applies within the same native list (Pinned, Recents or a project). `/btw` branches use their local records. Native branches (titled `分支 · …` or `Branch · …`, including ones made with ChatGPT's own branch action or in another browser) are matched once to the loaded conversation with the same source title that shares the most copied messages, and the result is remembered locally. Hover over a conversation that has branches to show **Clean · N** at the right of its row; after confirmation it deletes every branch chat below it, including branches of branches, through ChatGPT's normal delete, and removes their local records. The source conversation itself is kept. If you are viewing a deleted branch, ChatSprig returns to the source conversation.

BTW always attempts to send its explicit question once, independently of the Ask in sidebar Auto-send setting. Existing branch drafts or generation keep the question as a draft instead. If branch creation or delivery fails, the source draft stays available; check the floating chat before retrying. A branch uses ChatGPT's normal conversation retention unless the source URL explicitly identifies temporary mode. Alt+N opens a fresh temporary chat while retaining your branch.

### Ask in sidebar

On Gemini, select message text and click **Ask in sidebar** beside the selection to open the Gemini overlay. Only plain selected text is passed.

On ChatGPT, select message text, then click **Ask in sidebar** beside the native **Ask ChatGPT** action (shown as **Add to chat** in Work mode and localized in other interface languages, such as **問問 ChatGPT**). The existing floating chat opens without reloading or starting a new conversation.

In a saved ChatGPT conversation, **Ask in new branch** sits beside it. It works like `/btw` with the selection as the question: a native branch of the conversation opens in the floating window and appears in **Branches · N**. The source conversation receives nothing. Unlike `/btw`, it follows the Auto-send setting below.

- **Auto-send** is available in Settings → Ask in sidebar and is on by default. Turn it off to fill the prompt and add your own question before sending. The preference is shared by both services and syncs across tabs.
- **Append system prompt** is the document-plus icon beside Compact view at the bottom of the model picker. It is shown only when ChatGPT **Chat** mode is explicitly identified; Work, Gemini and unrecognized modes never append instructions. The switch is off by default. Edit the text and **Repeat every k user messages** in Settings → System prompt: `0` (default) means first message only, `1` means every message, and `3` means messages 1, 4, 7, 10… The current conversation branch determines the count; AI responses and regenerations do not count. Changing k recalculates from the start, and a new conversation starts over. Manual sends and Ask in sidebar follow the same rule. Unknown or incomplete history skips appending. Existing conversations without a Chat/Work switch are identified when their model menu is opened; verified mode is remembered per conversation in that tab across reloads. Without positive mode evidence, appending stays disabled. Empty text adds nothing; the instructions are ordinary message text, not an API system role.
- When **Copy LaTeX** is enabled, selected formulas use the same LaTeX conversion as copying, including inline `\(...\)` and display `\[...\]` delimiters. Disabling Copy LaTeX keeps plain selected text.
- Existing drafts are preserved; the selection is appended after a blank line and waits for review. If the sidebar is generating, the selection stays in the input and is not automatically sent later.
- Selecting text alone never sends anything. This action is available on the main ChatGPT and Gemini pages, not inside the floating chat. Each selection goes to its source service.
- The floating chat footer reports filling or delivery problems. Check its draft before retrying. Closing, switching services, or refreshing the floating chat cancels pending work.

The main ChatGPT website keeps its own sidebar. The sidebar preference applies only to ChatSprig's embedded chat.

## Privacy & permissions

**No developer-operated analytics, advertising, or conversation backend.** Settings are stored through Chrome Sync. Chat messages go directly to the selected service and are subject to OpenAI’s or Google’s terms and privacy practices.

| Access | Purpose |
| --- | --- |
| Web-page content scripts | Display the launcher, handle shortcuts, and host the overlay. On ChatGPT, also focus the prompt, hide the embedded sidebar, nest branch chats in the history sidebar, and convert selected math when copying. |
| Storage | Sync preferences and save custom skill templates, BTW branch metadata and branch-to-source links locally. |
| ChatGPT cookies | Support cross-site sign-in when cookie rewriting is enabled. |
| Declarative network rules with host access | Remove frame-blocking response headers from ChatGPT subframes and X-Frame-Options from Gemini subframes, limited to granted host access. |

Tab routing uses tab IDs and messaging without requesting the `tabs` or `activeTab` permission.

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
node --test tests/*.test.mjs

# Run browser regressions (requires ego-browser)
python3 scripts/test_browser.py btw
python3 scripts/test_browser.py btw-completion
python3 scripts/test_browser.py btw-invalidation
python3 scripts/test_browser.py compact-margins

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
web/                Showcase site and tour video (chatsprig.driseam.com)
scripts/            Icon export and release packaging
```

</details>

## Support and license

Report bugs or suggest improvements in [GitHub Issues](https://github.com/william1010121/chatsprig/issues). ChatSprig is available under the [MIT License](LICENSE).

---

<div align="center">
  <p><strong>A little chat. Keep your flow.</strong></p>
  <p>If ChatSprig helps you, <a href="https://github.com/william1010121/chatsprig/stargazers">give it a star ★</a>.</p>
  <p><sub>Independent project. Not affiliated with or endorsed by OpenAI or Google. ChatGPT is an OpenAI product.</sub></p>
</div>
