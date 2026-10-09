# ChatSprig submission notes

- Version: 2.6.2 (upload ZIP: dist/chatsprig-2.6.2.zip; pending review, resubmitted October 9, 2026)
- Category: Productivity (Tools if the dashboard uses a subcategory)
- Language: English
- Source repository: https://github.com/william1010121/chatsprig (public)
- Privacy policy (dashboard): https://github.com/william1010121/chatsprig/blob/main/PRIVACY.md (mirror: https://gist.github.com/william1010121/9a6d44e13a9d5cd3b10cf0744228c479)

## Single purpose

Provide an in-page workspace for temporary ChatGPT and Gemini conversations, with keyboard access, explicit selection-to-sidebar actions, focused layout, and LaTeX copying for mathematical responses.

## Changes in 2.6.2

- Hovering or focusing an item in the open-chats dock shows a × badge that closes that chat. It only drops the live frame: branch conversations stay in ChatGPT and in the Branches list. A branch with an unsent draft or a response in progress asks first. Closing the visible chat switches to the most recently used one; closing the last chat closes the window.

## Changes in 2.6.1

- Send `/btw` questions and Ask in sidebar selections sooner: the filled draft is verified as soon as it appears and the send button is checked every 20 ms instead of after fixed 100 ms waits.
- Skip composer lookups in `/btw` scroll, resize and key handlers when the command menu is not involved, reducing layout work while ChatGPT streams.
- Follow ChatGPT's dark theme in the Branches bar and the Clean chip. ChatGPT now marks its theme with `data-theme` instead of a `dark` class, and no longer exposes the surface variables the bar used, so the bar matches the page background directly.

## Changes in 2.6.0

- Nest branch chats under their source conversation in ChatGPT's history sidebar, including branches of branches, for both `/btw` branches and ChatGPT's native branches. Native branches are matched by shared message identifiers through ChatGPT's own conversation endpoint; only conversation-ID links are stored locally.
- Add **Clean · N** on a source conversation's sidebar row to delete every branch chat below it after confirmation, closing any deleted branch that is open in the floating window.
- Add an open-chats dock beside the floating window that switches between live ChatGPT, Gemini and BTW frames without reloading them.
- Keep at most two idle, reopenable BTW branch frames; creating, busy and draft-holding frames are kept.
- Never swallow a send when prepending the saved prompt fails.
- Add Paragraph spacing and List item spacing sliders to Compact view.
- Open links clicked inside the floating window in a new tab (the iframe sandbox now allows popups, which escape the sandbox; top navigation remains disallowed).

## Changes in 2.5.2

- Handle synchronous and asynchronous BTW storage errors after extension reloads. Invalidated scripts detach their UI, stop observers and input interception, and preserve drafts until the page is reloaded.
- Add browser regressions for context invalidation during navigation, storage reads/writes, and branch delivery.

## Changes in 2.5.1

- Add `/btw` native ChatGPT branches, slash completion, and a local branch list with recent shortcuts.
- Recognize the visible composer and conversation in newer ChatGPT layouts, including hidden composers retained during navigation.
- Keep `//system-prompt` available when unconfigured so it can open Settings without changing the draft.
- Fix Compact view side margins when a response contains an interactive form; ordinary text adjusts while UI cards retain native width.

## Permission explanations

- storage: Store and sync user-selected overlay, launcher, shortcut behavior, LaTeX-copy, and cookie compatibility settings using chrome.storage.sync; store user-created text templates, BTW branch metadata, and branch-to-source conversation ID links in chrome.storage.local.
- cookies: Read and rewrite eligible chatgpt.com and chat.openai.com cookies to SameSite=None; Secure when cookie compatibility is enabled. This allows existing ChatGPT sign-in cookies to work in a cross-site iframe where browser policy permits. Cookie values stay in the browser and are not sent to the developer. Enabled by default; Settings can stop future rewrites but cannot undo earlier changes.
- declarativeNetRequestWithHostAccess: Apply the packaged static rules.json rules to remove frame-blocking response headers from ChatGPT subframes and X-Frame-Options from Gemini subframes. Rules require granted host access to the listed service domains.
- Host/content-script access: Content scripts on supported web pages provide the floating launcher, keyboard fallback, and overlay host. ChatGPT and Gemini scripts offer skill completion when the user types `//` in the prompt. ChatGPT-specific scripts focus the prompt, hide its embedded sidebar, provide Compact view and optional saved instructions, and convert selected math when copying. Gemini-specific scripts verify temporary mode and the requested model. Access to the ChatGPT and Gemini hosts supports these user-facing features and frame compatibility. The surrounding page is not automatically sent to either service.

## Remote content disclosure

Tab routing only uses tab IDs, messaging, and removal events; opening the shortcut settings uses tabs.create. These operations do not require the `tabs` permission. Neither `tabs` nor `activeTab` is requested.

All extension JavaScript is included in the uploaded ZIP. The overlays load https://chatgpt.com/?temporary-chat=true and https://gemini.google.com/app as external sandboxed iframes. Those services execute their own website code inside the frames; no remote script is fetched for execution in the extension service worker, options page, or content-script context. Local content scripts interact with the embedded DOM to provide the disclosed features. These interactions and cookie/header changes are visible in the submitted source. Disclose the external iframes to reviewers; do not describe this as an entirely offline tool.

## Data practices

Do not make a blanket assertion that the extension accesses no user data. It locally accesses ChatGPT authentication cookies, sidebar conversation titles and IDs, message identifiers and timestamps of chats titled as native branches (requested from ChatGPT's own endpoint with the user's session, to nest branches; only ID links are stored), explicitly selected ChatGPT or Gemini message text, relevant ChatGPT conversation state when optional prompt repetition is enabled, active-tab state, preferences, and the clipboard write path. User-entered messages are sent directly to the selected provider through its embedded website. It does not transmit this data to a developer-operated server, sell it, use it for advertising, or use it for credit decisions.

## Reviewer test steps

1. Install the upload ZIP. Click the toolbar icon to view English settings and the cookie disclosure.
2. Open ChatGPT in a normal tab; use an account if sign-in is required by the website.
3. Open a normal website and click the ChatGPT launcher or press Alt+K / Option+K. Confirm the ChatGPT overlay appears.
4. Press Alt+G / Option+G and confirm Gemini opens only after temporary mode is active. Switch between services and verify each draft is preserved.
5. Press Alt+N / Option+N to create a fresh temporary chat in the current service.
6. On the main ChatGPT or Gemini website, select message text and choose Ask in sidebar. Verify only that selection is transferred to the matching service.
7. On ChatGPT, test Compact view (including the Paragraph spacing and List item spacing sliders), optional saved instructions in Chat mode, and LaTeX copying. In a response containing an interactive form, adjust Side margins and confirm ordinary text changes width while the UI card and native composer keep their widths.
8. In Settings, add a skill, then type `//` in a ChatGPT or Gemini prompt. Select it with Enter and confirm the draft is filled without sending. Test `//system-prompt` after setting prompt text.
9. Disable cookie rewriting to stop future ChatGPT cookie changes. Browser restrictions and provider availability may still limit cross-site login.
10. In an existing ChatGPT Chat or Work conversation, send `/btw a side question`. Verify a native branch opens in the floating window with the same mode, the source conversation receives no message, and Branches · N lists it above the composer. Verify `/btw` also appears in the native `/` menu. Create another branch, switch between them, and reload the source page to reopen a saved branch without sending again. Native-branch initialization errors must preserve the main draft and must never send to the source conversation. In a new conversation, the bar must remain above the visible composer after the first message, even while an old hidden home composer remains mounted.

11. In ChatGPT's history sidebar, verify branch chats (from step 10 or ChatGPT's own branch action) are indented under their source. Hover the source row, choose **Clean · N**, confirm, and verify only the branch chats below it are deleted and the source remains. Cancel the confirmation once to verify nothing is deleted.
12. In the floating window, click a link in a response and verify it opens in a new tab.
13. With ChatGPT and Gemini open, hover an item in the dock beside the window and click its × badge. Verify only that chat closes and the window switches to the remaining one.

## Dashboard record

- Item ID: `ecgdiaglcgfknjopckmjjcokanaldobe`
- Status: 2.6.2 pending review; resubmitted October 9, 2026 after cancelling its first review to set the homepage URL to https://chatsprig.driseam.com/. It replaces the 2.6.1 submission, whose review is cancelled. Version 2.3.2 is published. Last recorded submission: Version 2.3.2 pending review; submitted September 28, 2026 after cancelling the 2.3.1 review (ChatGPT layout change broke skills, Compact view, Ask in sidebar, and system prompts on chatgpt.com). Automatic publishing after approval is enabled. Version 2.2.0 is published.
- Publisher contact email verified; submission completed.
- Dashboard notice: broad host permissions may require an in-depth review.
- Distribution: free of charge, public, all regions.
- Data categories disclosed: Authentication information, Personal communications, Website content.
- Remote code: Yes, with the external ChatGPT iframe explanation above.
- Assets: actual in-browser overlay and Settings screenshots (1280×800); small promotional tile (440×280).
- Dashboard: https://chrome.google.com/webstore/devconsole/7d239134-e33a-4eea-89ec-2266ce5ae641/ecgdiaglcgfknjopckmjjcokanaldobe/edit/listing
