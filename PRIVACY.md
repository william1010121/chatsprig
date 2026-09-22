# ChatSprig Privacy Policy

Effective date: September 16, 2026

ChatSprig is an independent browser extension maintained by the GitHub developer account [william1010121](https://github.com/william1010121). It opens the ChatGPT or Gemini website inside supported web pages and provides shortcuts, layout controls, and LaTeX copying.

## Information accessed and why

- **Preferences:** Chrome's `storage.sync` stores your settings, such as overlay dimensions, launcher placement, target ChatGPT URL, preferred Gemini model, and feature switches. Chrome may sync these settings across devices according to your browser configuration.
- **ChatGPT cookies:** When cookie compatibility is enabled (the default), the extension reads and rewrites eligible cookies for chatgpt.com and chat.openai.com, including authentication/session cookies. Processing occurs in your browser. Cookie values are not sent to the developer or a developer-operated server.
- **Page content:** Content scripts run on supported websites to display the launcher and overlay and handle keyboard shortcuts. They do not automatically send the surrounding page or article to ChatGPT. On ChatGPT pages, scripts inspect relevant interface elements to focus the input, hide the embedded sidebar, and convert selected mathematical content when you copy it.
- **Custom prompt:** If enabled in ChatGPT Chat mode, your saved prompt is prepended to the first message and optionally repeated every k user messages. It is sent to ChatGPT with that message. Work and Gemini do not use this feature. The text, switch, and repeat interval are stored in Chrome Sync. A per-tab session cache stores the verified Chat/Work mode keyed by conversation path, without message content.
- **Selected message text:** Clicking Ask in sidebar passes only the selected message text into an embedded chat of the same service. With auto-send enabled, it may submit that text immediately when the input is empty and the service is not generating; otherwise it preserves it as a draft. Selection alone does not send anything.
- **Clipboard:** When you copy a selection containing supported mathematical content on a ChatGPT page, the extension writes LaTeX text for that selection to your clipboard. It does not collect your clipboard history.
- **Active tab:** Tab access routes your requested overlay action to the active tab. The extension does not keep a browsing-history database.
- **Session state:** The current page's session storage records whether its overlay was open. It also records the last selected service (ChatGPT or Gemini), not conversation content.

## ChatGPT, Gemini, and third parties

ChatGPT is loaded directly from OpenAI's website. Text you submit, files you upload, and interactions with the embedded site are handled by OpenAI under its own terms, account settings, and [privacy policy](https://openai.com/policies/privacy-policy/). OpenAI and the browser may process service data such as account information, cookies, and network metadata. ChatSprig does not offer a separate conversation service.

Gemini is loaded directly from Google’s website. Submitted text, uploads, and embedded interactions are handled by Google under its own terms and [privacy policy](https://policies.google.com/privacy). The extension verifies Gemini temporary mode before making a newly opened Gemini frame available, but temporary chats remain subject to Google’s retention policies.

Chrome Sync is provided by your browser vendor. Its processing is governed by the vendor's policies and your browser settings.

## Cookie and frame compatibility

To allow embedding, the extension removes X-Frame-Options, Content-Security-Policy, and Content-Security-Policy-Report-Only response headers from ChatGPT subframe responses. For Gemini subframes, it removes only X-Frame-Options. Google account cookies are not rewritten. With ChatGPT cookie rewriting enabled, eligible cookies are changed to `SameSite=None; Secure`. These changes relax browser protections for the embedded service, and cookie changes can affect other ChatGPT tabs in the same browser profile.

You may disable cookie rewriting in Settings. Disabling it stops further rewrites; it does not restore cookies previously changed. Browser restrictions may still prevent cross-site sign-in.

## Collection, sharing, and retention

The developer does not operate analytics, advertising, tracking, or a server receiving your conversations, cookies, clipboard contents, or browsing history. The extension does not sell data or share it with advertising or data-broker services. Data access is limited to the user-facing functionality described above and is not used to determine creditworthiness or for unrelated purposes.

ChatSprig does not store conversation transcripts. Preferences remain in Chrome storage until removed through browser controls or replaced. The page visibility flag and selected service last according to the site's session-storage lifecycle. Cookie retention is determined by the cookies' existing expiration and browser/OpenAI behavior. Temporary ChatGPT chats follow OpenAI's retention policy; they are not a promise of zero retention.

ChatSprig's use of user data adheres to the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Your choices

You can change preferences, disable LaTeX copying or cookie rewriting, restrict the extension's site access, or uninstall it through Chrome. Uninstalling stops the extension's processing but does not automatically reverse cookie changes or delete data held by OpenAI or Google.

## Contact and updates

For privacy questions, use the developer contact/support options on ChatSprig's Chrome Web Store listing when available. The maintainer is identified at the GitHub profile linked above. Changes to these practices will be reflected in this policy and its effective date.

ChatSprig is not affiliated with or endorsed by OpenAI or Google.
