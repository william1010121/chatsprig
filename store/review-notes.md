# ChatSprig submission notes

- Version: 2.1.0
- Category: Productivity (Tools if the dashboard uses a subcategory)
- Language: English
- Source repository: https://github.com/william1010121/chatsprig (private)
- Privacy policy: https://gist.github.com/william1010121/9a6d44e13a9d5cd3b10cf0744228c479

## Single purpose

Provide an in-page workspace for temporary ChatGPT conversations, with keyboard access, focused layout, and LaTeX copying for mathematical responses.

## Permission explanations

- storage: Store and sync user-selected overlay, launcher, shortcut behavior, LaTeX-copy, and cookie compatibility settings using chrome.storage.sync.
- tabs: Locate the active tab and route user-requested open, close, and refresh actions to its top frame. No browsing-history database is kept.
- cookies: Read and rewrite eligible chatgpt.com and chat.openai.com cookies to SameSite=None; Secure when cookie compatibility is enabled. This allows existing ChatGPT sign-in cookies to work in a cross-site iframe where browser policy permits. Cookie values stay in the browser and are not sent to the developer. Enabled by default; Settings can stop future rewrites but cannot undo earlier changes.
- declarativeNetRequest: Apply the packaged static rules.json rules that remove X-Frame-Options and Content-Security-Policy headers only from ChatGPT sub_frame responses, allowing the user-requested ChatGPT iframe to load.
- Host/content-script access: Content scripts on supported web pages provide the floating launcher, keyboard fallback, and overlay host. ChatGPT-specific scripts focus the prompt, hide its embedded sidebar, and convert selected math when copying. Access to the two ChatGPT hosts supports cookie and frame compatibility. The surrounding page is not automatically sent to ChatGPT.

## Remote content disclosure

All extension JavaScript is included in the uploaded ZIP. The overlay loads https://chatgpt.com/?temporary-chat=true as an external sandboxed iframe. ChatGPT executes its own website code inside that frame; no remote script is fetched for execution in the extension service worker, options page, or content-script context. Local content scripts interact with the embedded DOM to provide focus and sidebar features. These interactions and cookie/header changes are visible in the submitted source. Disclose the external iframe to reviewers; do not describe this as an entirely offline tool.

## Data practices

Do not make a blanket assertion that the extension accesses no user data. It locally accesses authentication cookies, relevant ChatGPT page content/selected text, active-tab state, preferences, and the clipboard write path. User-entered messages are sent directly to OpenAI through the embedded ChatGPT website. It does not transmit this data to a developer-operated server, sell it, use it for advertising, or use it for credit decisions.

## Reviewer test steps

1. Install the upload ZIP. Click the toolbar icon to view English settings and the cookie disclosure.
2. Open ChatGPT in a normal tab; use an account if sign-in is required by the website.
3. Open a normal website and click the floating launcher or press Alt+K / Option+K.
4. Confirm an iframe overlay appears within the existing page, with its sidebar removed when enabled.
5. Press Alt+N / Option+N to create a fresh temporary chat. Toggle closed and open again.
6. On the main ChatGPT website, copy selected supported math and verify the clipboard contains LaTeX.
7. Disable cookie rewriting to stop future changes. Browser third-party-cookie restrictions and OpenAI service availability may still limit cross-site login.

## Dashboard record

- Item ID: `ecgdiaglcgfknjopckmjjcokanaldobe`
- Status: Draft; package, listing, assets, privacy disclosures, and test instructions saved.
- Submission blocker: publisher contact email must be supplied and verified in account Settings.
- Distribution: free of charge, public, all regions.
- Data categories disclosed: Authentication information, Personal communications, Website content.
- Remote code: Yes, with the external ChatGPT iframe explanation above.
- Assets: actual in-browser overlay and Settings screenshots (1280×800); small promotional tile (440×280).
- Dashboard: https://chrome.google.com/webstore/devconsole/7d239134-e33a-4eea-89ec-2266ce5ae641/ecgdiaglcgfknjopckmjjcokanaldobe/edit/listing
