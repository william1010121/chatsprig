# ChatSprig submission notes

- Version: 2.2.0
- Category: Productivity (Tools if the dashboard uses a subcategory)
- Language: English
- Source repository: https://github.com/william1010121/chatsprig (public)
- Privacy policy: https://gist.github.com/william1010121/9a6d44e13a9d5cd3b10cf0744228c479

## Single purpose

Provide an in-page workspace for temporary ChatGPT and Gemini conversations, with keyboard access, explicit selection-to-sidebar actions, focused layout, and LaTeX copying for mathematical responses.

## Permission explanations

- storage: Store and sync user-selected overlay, launcher, shortcut behavior, LaTeX-copy, and cookie compatibility settings using chrome.storage.sync.
- cookies: Read and rewrite eligible chatgpt.com and chat.openai.com cookies to SameSite=None; Secure when cookie compatibility is enabled. This allows existing ChatGPT sign-in cookies to work in a cross-site iframe where browser policy permits. Cookie values stay in the browser and are not sent to the developer. Enabled by default; Settings can stop future rewrites but cannot undo earlier changes.
- declarativeNetRequestWithHostAccess: Apply the packaged static rules.json rules to remove frame-blocking response headers from ChatGPT subframes and X-Frame-Options from Gemini subframes. Rules require granted host access to the listed service domains.
- Host/content-script access: Content scripts on supported web pages provide the floating launcher, keyboard fallback, and overlay host. ChatGPT-specific scripts focus the prompt, hide its embedded sidebar, provide Compact view and optional saved instructions, and convert selected math when copying. Gemini-specific scripts verify temporary mode and the requested model. Access to the ChatGPT and Gemini hosts supports these user-facing features and frame compatibility. The surrounding page is not automatically sent to either service.

## Remote content disclosure

Tab routing only uses tab IDs, messaging, and removal events; opening the shortcut settings uses tabs.create. These operations do not require the `tabs` permission. Neither `tabs` nor `activeTab` is requested.

All extension JavaScript is included in the uploaded ZIP. The overlays load https://chatgpt.com/?temporary-chat=true and https://gemini.google.com/app as external sandboxed iframes. Those services execute their own website code inside the frames; no remote script is fetched for execution in the extension service worker, options page, or content-script context. Local content scripts interact with the embedded DOM to provide the disclosed features. These interactions and cookie/header changes are visible in the submitted source. Disclose the external iframes to reviewers; do not describe this as an entirely offline tool.

## Data practices

Do not make a blanket assertion that the extension accesses no user data. It locally accesses ChatGPT authentication cookies, explicitly selected ChatGPT or Gemini message text, relevant ChatGPT conversation state when optional prompt repetition is enabled, active-tab state, preferences, and the clipboard write path. User-entered messages are sent directly to the selected provider through its embedded website. It does not transmit this data to a developer-operated server, sell it, use it for advertising, or use it for credit decisions.

## Reviewer test steps

1. Install the upload ZIP. Click the toolbar icon to view English settings and the cookie disclosure.
2. Open ChatGPT in a normal tab; use an account if sign-in is required by the website.
3. Open a normal website and click the ChatGPT launcher or press Alt+K / Option+K. Confirm the ChatGPT overlay appears.
4. Press Alt+G / Option+G and confirm Gemini opens only after temporary mode is active. Switch between services and verify each draft is preserved.
5. Press Alt+N / Option+N to create a fresh temporary chat in the current service.
6. On the main ChatGPT or Gemini website, select message text and choose Ask in sidebar. Verify only that selection is transferred to the matching service.
7. On ChatGPT, test Compact view, optional saved instructions in Chat mode, and LaTeX copying.
8. Disable cookie rewriting to stop future ChatGPT cookie changes. Browser restrictions and provider availability may still limit cross-site login.

## Dashboard record

- Item ID: `ecgdiaglcgfknjopckmjjcokanaldobe`
- Status: Draft 2.2.0 prepared for review on September 22, 2026. Automatic publishing after approval should be enabled on submission.
- Publisher contact email verified; submission completed.
- Dashboard notice: broad host permissions may require an in-depth review.
- Distribution: free of charge, public, all regions.
- Data categories disclosed: Authentication information, Personal communications, Website content.
- Remote code: Yes, with the external ChatGPT iframe explanation above.
- Assets: actual in-browser overlay and Settings screenshots (1280×800); small promotional tile (440×280).
- Dashboard: https://chrome.google.com/webstore/devconsole/7d239134-e33a-4eea-89ec-2266ce5ae641/ecgdiaglcgfknjopckmjjcokanaldobe/edit/listing
