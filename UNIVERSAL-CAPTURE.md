# Universal query capture and in-page delivery

## Agent workflow

1. Open a Gmail or Outlook web conversation, or a Zendesk ticket and click the DraftPilot toolbar icon. On other sites, select the customer message first, then click the icon or use the selection context menu.
2. Review the captured text in the floating panel. If there is no reliable adapter/selection, click **Pick message**, then click the customer's message. No clipboard is read or watched.
3. Choose **Workspace default** to use the saved team tone, or explicitly override the tone for this reply. Click **Generate draft**.
4. Review/edit the draft and its source names. Click **Insert at chat box** for a single empty editor, or use **Choose reply box** when there are multiple editors. The existing reply is never replaced. Click Send yourself in the platform.

Pairing is a separate, one-time setup step: use the web workspace's pairing code in **Workspace connection**, which opens a secure extension-origin settings tab. The host page never receives a bearer token or pairing code. Unpaired mode is labeled Local mode and has no workspace knowledge access. A paired authorization/quota error is shown, not converted into a successful fallback draft.

## Architecture

`background.ts` owns the fixed API origin and trusted session token. Toolbar/context-menu actions inject `content.js` on demand with `activeTab` and `scripting`. It does not grant permanent access to all websites. The worker accepts only known message types from this extension's content scripts and validates request lengths/channel/tone. No externally_connectable or page-window token messages exist.

`adapters.ts` defines a small adapter contract: matching, capture, editor discovery and conversation key. Gmail uses its conversation/body/editor markup. Zendesk uses ticket-comment and editor selectors, with generic selection/picking when those selectors do not match. New adapters can be added without changing the authenticated generation pipeline.

`content.ts` renders a shadow-root panel, captures explicit selection or a picked element, redacts before transport, and holds only the current page's context in memory. All captured/source/model text uses textContent/value/plain text; only a static UI template uses HTML. Synthetic page clicks cannot trigger generate/insert/picker controls. Capturing new context or changing tone invalidates the previous draft. URL/conversation changes and removed/changed source nodes block insertion. A removed selected editor must be selected again. Already populated editors are never overwritten.

Insertion uses the native textarea value setter with input/change events, or contenteditable insertText with a plain-text fallback. It checks the resulting text and never clicks a send control. Compatibility with framework-specific editors still needs testing because some platforms may reject or later rerender synthetic edits.

The API resolves identity/team and seat access, then applies the stored team tone when the caller omits a tone. It retrieves only that workspace's knowledge, reserves quota atomically with the request ID, generates through the existing provider/fallback path, and persists a source-labeled draft. An extension has no direct database credentials or provider keys.

## Limits and deliberate choices

- One-click insertion confirmation is required. Automatic sending is never implemented.
- Generic capture is user-directed, not an attempt to scrape an entire page or guess which text belongs to a customer.
- Plain textarea/contenteditable reply boxes are supported. Password, search, payment and read-only inputs are not insertion targets.
- Chrome settings/store pages, PDF viewers, closed shadow roots, and sandboxed/cross-origin frames may block access. The extension reports capture failure or a toolbar warning. Open the message/editor in an accessible top-level page; there is no clipboard-watch or permission-bypass fallback.
- Zendesk selectors and Gmail markup can change. If the adapter cannot find the content, selection/picking remains available when browser permissions and the DOM allow it.
- Extension tokens live in trusted Chrome session storage, expire, and are revoked by successful web logout or explicit session revocation. Restarting Chrome requires pairing again.

## Local verification method

`tests/e2e/universal.spec.ts` loads the actual bundled extension (content script, service worker and secure settings page) in Chromium with extension side-loading support. It uploads policy content through the real workspace controller, pairs through the real pairing/exchange routines, and generates through the real AuthGuard and DraftsController backed by the real migration in PGlite. A test-only adapter replaces hosted Supabase Auth/PostgREST transport; no production account is impersonated. AI keys are absent, so the source-grounded deterministic fallback runs. Unit tests separately inspect model prompt composition and provider failover.

The browser opens local HTML fixtures at intercepted Zendesk/example origins; it never contacts a Zendesk account. The test extension copy receives only fixture-origin permissions to emulate the access a real toolbar action grants. Release manifests are unchanged by this harness. Thus these checks verify the data and insertion flow, not live Zendesk compatibility, real provider output quality, the browser toolbar gesture itself, or hosted Supabase configuration.

Before release, manually validate the toolbar/context-menu permission flow, signed-in Gmail and Zendesk (public reply and internal note), multiple ticket tabs, nested frames, attachments/quoted text, controlled editors and draft persistence after blur/reload. Those checks require the accounts and permissions absent from this local environment.

Reference: Chrome's [activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) grants temporary access after a user gesture; [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting) provides injection within those permissions.

## Customer reply watcher (extension 1.2.0)

After pairing your workspace, pick a customer bubble and click **Watch customer replies**. On supported incoming-message layouts, DraftPilot watches only the selected conversation while the tab and panel are visible. It coalesces changes for 1.2 seconds and spaces generation starts at least 6.5 seconds apart. The latest four customer bubbles feed the existing workspace KB/tone pipeline. Agent bubbles are excluded. Review the draft and click **Insert at chat box**; sending remains manual.

Watching requires explicit customer/incoming DOM markers. Unsupported layouts fail visibly instead of guessing message ownership. Changing the conversation, losing the source or an API error stops watching. A new message invalidates an old draft; manually edited drafts are preserved and watching pauses. Closing the panel stops the watcher. Generic selection/pick and manual generation remain available when watching is unsupported.

Crisp's app domain and Mevrik inbox subdomains are recognized as channel profiles. The supplied Mevrik URL, `https://inbox.mevrik.com:4220/inbox`, is covered in the local browser fixture tests, including its nonstandard port. These profiles reuse generic capture; they are not yet verified native inbox parsers. On September 21, 2026, the actual Crisp URL redirected to its login page and Mevrik to its sign-in page. No customer conversation/editor markup was accessible, so live compatibility remains pending signed-in inspection.

### Try without a subscription

Run `pnpm demo:watch` from the project root, then open `http://127.0.0.1:3103`. Click **Watch customer replies**, wait for a draft, click **Add customer reply**, then **Insert at chat box**. The clearly labeled simulator uses disposable example policy data (37-day returns), actual API controllers and PGlite, with a test-only authentication transport and deterministic grounded generation. It is not a Crisp/Mevrik emulator or a production authentication service. Never deploy this simulator. Restarting it resets its data.

## Outlook web adapter — extension 1.3.0

Outlook now follows the Gmail capture flow: open an email, open its Reply box, click DraftPilot, review the captured text, generate using the workspace knowledge/tone, then click **Insert at chat box**. No clipboard transfer is required. Sending remains manual.

Supported host profiles are outlook.office.com, outlook.office365.com and outlook.live.com under `/mail/`. The adapter prefers one visible reading pane, excludes message-list previews, hidden messages and editable compose text, deduplicates nested body markup, and identifies rich-text reply boxes. Multiple visible panes fail closed; multiple reply editors require an explicit target. Existing reply text is never overwritten. A changed message, URL or detached source invalidates the old draft. Unknown layouts retain selection/pick fallback.

The manifest adds only these three specific Outlook origins alongside Gmail and the configured API. Update/reload the unpacked extension (or accept the new permissions on upgrade) and refresh Outlook. The legacy side panel also supports Outlook capture and insertion. This does not enable native Outlook desktop/mobile applications or self-hosted Exchange domains.

Four Outlook browser fixtures cover the three hosts, redaction, knowledge-grounded draft generation through the actual local API, Outlook channel history, plain-text insertion/input events, no send action, stale conversations and overwrite protection. Full suite: 36 browser tests; 63 unit/API/database tests. Production build and all typechecks pass. Fixtures do not establish compatibility with a signed-in Microsoft account: verify actual body/editor markup and persistence after blur before customer rollout.
