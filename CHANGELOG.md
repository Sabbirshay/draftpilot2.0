# Live Users Command overview — 25 September 2026

Added automatically refreshed user/workspace totals, retained completed-draft counters, API process uptime, monthly AI tokens and reported/estimated costs inside the Users tab. Recorded managed provider attempts in a content-free, service-only usage ledger; missing charges remain unknown. Added stale/recovery states and preserved unsaved edits during polling. Verified by 68 unit/API/database tests, 42 browser tests, production build and typechecks. See ADMIN-CONTROL.md for rollout and accounting limitations.

---

# Public homepage — 24 September 2026

Created a dedicated public homepage with self-hosted Manrope, the existing forest/lime brand, responsive product illustrations, platform coverage, pricing, and native FAQs. Added Lenis smooth scrolling and a GSAP walkthrough with reduced-motion and touch fallbacks. Customer workspace moved from `/` to `/app`; OAuth success, invite continuation, and the administrator workspace link were updated accordingly. Existing account and protected generation flows are reused.

The landing page makes no AI/provider requests and includes no customer drafting playground. Illustrations and compatibility limitations are identified in the copy. Native links and FAQs work without JavaScript. See LANDING-DESIGN.md for applied skill guidance and route tracing.

---

# Local change record — 23 September 2026

Customer generation previously worked through both the web studio and extension. It now requires an extension-scoped credential; web sessions are rejected before quota/provider work and the customer studio is removed. Dedicated sign-in/signup routes expose the existing authenticated account flow; recovery now confirms the new password before submission.

Platform administrators can connect an encrypted provider key, discover chat models, run a bounded inference test, and activate one model for all accounts. The server requires MFA, a current tested credential revision and an audit reason. Key rotation pauses generation and invalidates activation. The private playground is administrator-only.

Shared atomic daily provider-attempt limits cover drafts, embeddings and admin testing. Input/output caps, existing tenant/user quotas, request limits, fixed provider URLs, response bounds and secret-free logs reduce credential exposure and uncontrolled spending. Keys and ciphertext are never returned by administration reads. Provider-side spending controls remain necessary.

Verification: 63 unit/API/database tests, 32 browser tests, production build and TypeScript checks passed. Provider/Auth transports use fixtures locally; real keys, SMTP and hosted acceptance remain pending. There is no Git repository in this delivered workspace, so changes are documented here rather than claiming a commit or pull request.

## Outlook web capture — extension 1.3.0

Replaced selection-only Outlook capture with a dedicated reading-pane/body/editor adapter for Microsoft 365 and Outlook.com. Added specific Outlook host permissions and content-script matches, Outlook-aware legacy side-panel capture/channel/insertion, integration guidance, and four full extension regression cases. The adapter excludes compose/list/hidden content and rejects ambiguous panes, changed conversations and occupied reply editors. Verified by 36 browser tests, 63 unit/API/database tests, build and typechecks. Live signed-in Outlook acceptance remains pending.
