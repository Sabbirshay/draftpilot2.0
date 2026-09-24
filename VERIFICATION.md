# Live admin overview — 25 September 2026

**68 unit/API/database tests and 42 browser tests passed.** Production build and TypeScript checks passed. See `verification/live-overview-*`.

Checks cover live account/workspace totals, provider accounting, cached-token estimates, unknown/failed usage, service-role-only tables and aggregates, denial without administrator MFA, blocking provider requests when ledger reservation fails, duplicate draft requests, draft counters surviving deletion, and periodic UI refresh while preserving edits. The browser test creates a new workspace and usage event through the real local database, observes automatic updates, simulates outage/recovery, and confirms access revocation clears the overview. The layout was checked at desktop and mobile sizes.

These tests run real controllers/migrations against local PostgreSQL-compatible PGlite fixtures. Hosted authentication/provider transport is substituted; no paid AI calls or live billing reconciliation were performed. Production requires the included migration and configured services. The unconfigured local preview remains explicitly sample data.

---

# Public homepage verification — 24 September 2026

**41 browser tests and 63 unit/API/database tests passed.** Production build and workspace TypeScript checks passed. After the final contrast and menu-label corrections, a fresh production web build and all 5 new landing tests passed again. Evidence: `verification/landing-*.txt`.

The new tests cover signup and sample-workspace navigation, pricing anchors, native FAQs, desktop scroll-state progression, runtime reduced-motion changes, mobile navigation, 320px/dark presentation, horizontal overflow, and use without JavaScript. Desktop/mobile screenshots were visually inspected. Existing Gmail, Outlook, Zendesk, Crisp/Mevrik watcher, generic capture, admin, quota, account and workspace regressions pass.

Final Lighthouse simulated-mobile scores on the local production build: **Performance 98, Accessibility 100, Best Practices 100, SEO 100**. See `verification/landing-lighthouse.json`; these are lab measurements, not field guarantees or a comprehensive accessibility certification. Self-hosted fonts and animation assets are served under the existing CSP. The public homepage makes no AI calls.

Public site: `/`. Workspace: `/app`. Configured live accounts, SMTP, billing and signed-in inbox staging acceptance remain separate deployment requirements.

---

# Outlook adapter update — 23 September 2026

Extension 1.3.0: **36 browser tests and 63 unit/API/database tests passed; production build, extension packaging and TypeScript checks passed.** Four new Outlook cases cover the three mail hosts and stale/occupied editor safeguards. Existing Gmail and universal capture regressions pass. Evidence: `verification/outlook-*.txt`. Actual signed-in Outlook remains a staging check; automated tests use representative local DOM fixtures and real extension/API code.

---

# Authentication and protected AI verification — 23 September 2026

Latest checks: **63 unit/API/database tests passed; 32 production browser tests passed; ordered production build, final web rebuild and TypeScript checks passed.** Evidence: `verification/auth-ai-*.txt`.

Customer `/login`, `/signup`, `/reset`, password confirmation, recovery states and extension-only navigation were checked. The customer studio and web generation route are removed/blocked. The recovery completion test substitutes the auth transport; real SMTP delivery, expired/used OTP rejection by hosted Supabase and real account lifecycle remain staging checks.

Provider verification covers randomized authenticated encryption, missing-master rejection, ciphertext tampering/provider swapping, ordinary-user/non-MFA denial, ciphertext-only persistence, sanitized admin reads/audits, model catalog filtering, mandatory recent live-test activation, key rotation, global model use by the actual extension-scoped API, knowledge and tone in the provider payload, atomic daily attempt limits and database role denials. OpenAI/OpenRouter network responses are controlled fixtures, not actual paid requests.

The browser admin flow runs the real AuthGuard/controllers and migrations against PGlite: enter key → catalog → live-test action → activation → private playground. Hosted Auth/PostgREST and provider transport are substituted. No real API key, paid model call, email or payment was used. The UI deliberately disables credential storage and real tests in unconfigured demo mode.

Gmail regression and all 10 universal extension fixture tests passed, including Zendesk, arbitrary-page selection, Crisp/Mevrik watchers, knowledge/tone, insertion safeguards and revoked sessions. Actual signed-in platform acceptance is still separate. Agent-browser confirmed customer sign-in and home navigation without browser errors; login and pipeline screenshots were visually inspected.

Run the configured local preview with the instructions in README/ADMIN-CONTROL. Set TEST_BASE_URL to the demo preview origin and ADMIN_TEST_URL to a second configured-mode test web instance to run all 32 tests. Both must use the matching APP_URL. Without ADMIN_TEST_URL, the three configured-admin browser tests are intentionally skipped.

---

# Local verification — 21 September 2026

**Status: local audit remediation and universal capture implemented and verified. Hosted release and real signed-in platform acceptance remain pending.**

## Results

| Check | Result |
| --- | --- |
| TypeScript checks for shared, API, web and extension | Passed |
| Ordered production build: shared, API, extension, web | Passed |
| Unit, API and embedded PostgreSQL tests | 53 passed (control-center update) |
| Complete production browser suite | 29 passed (control-center update) |
| Existing Gmail regression test | Passed |
| Real extension + local Zendesk fixture + API + PGlite | Passed |
| Generic selection capture on unrelated fixture page | Passed |
| Uploaded policy content and saved workspace tone in reply | Passed |
| Picker, multiple editors, overwrite protection, changed conversation/editor/URL | Passed |
| Synthetic host-page clicks and revoked extension sessions | Rejected |
| Production dependency advisory audit | 0 known vulnerabilities reported |
| Interactive local preview | Available on port 3000; integration labels updated |

Workstream 1 was checked before Workstream 2: 40 tests, the 13 pre-existing browser workflows and a production build passed. An additional explicit new-user admin-profile insertion regression brings the final unit/database count to 41. All 20 audit findings are triaged in AUDIT-REMEDIATION.md, including features absent/retired in this replacement. The historical GitHub snapshot was not modified.

The final browser suite consists of 13 existing workspace/security/Gmail/import flows and 10 universal-extension flows. The extension flows run the actual bundled service worker, content script and secure pairing settings page in Chrome for Testing. They exercise real workspace ingestion, pairing/exchange, AuthGuard, quota reservation, source retrieval, generation and history completion through production controllers and the actual SQL migration in PGlite. Test-only transport substitutes for hosted Supabase Auth/PostgREST. No live secrets or customer accounts are involved. AI credentials are absent: the deterministic, source-grounded fallback is verified; separate unit tests inspect the full provider payload and provider cascade.

The local Zendesk and arbitrary helpdesk HTML are fixtures served at browser-intercepted test URLs. The test extension copy receives explicit fixture-host permissions to simulate a toolbar-granted activeTab permission. The release manifest grants permanent access to Gmail, the three supported Outlook web hosts, and the configured API; it has no blanket website permission. Browser toolbar/context-menu gestures, real signed-in Zendesk/Gmail editor persistence, sandboxed cross-origin frames and extension store approval remain manual staging checks.

Visual review caught and fixed a rich-text newline normalization mismatch. Tests now assert the successful insertion message as well as actual editor contents. Zendesk/generic screenshots were inspected after correction. The local app was also checked with agent-browser.

## Evidence and reproduction

Current logs are under verification/: unit/database tests, complete browser suite, typechecks, production build, final extension build and dependency audit. Earlier evidence is retained with explicit audit-baseline names. Use README.md and UNIVERSAL-CAPTURE.md to reproduce; run pnpm build before browser tests so compiled controllers and extension assets exist. Install Playwright Chromium, then pnpm test:e2e against a running web server. Set TEST_BASE_URL and APP_URL to the same origin when changing ports. CHROME_PATH/EXTENSION_CHROME_PATH can override the installed Chromium executable.

## Remaining acceptance boundaries

No live Supabase/Stripe/AI/Google/SMTP/Zendesk accounts were available. Live payment lifecycle, hosted auth and isolation, real model accuracy, historical credential rotation, real platform editor behavior, Docker execution, GitHub CI execution, backups and independent penetration testing remain unverified. This is not a claim that every website permits extension access, or that the application is invulnerable. Follow LAUNCH.md before customer release.

## Watcher update — September 21, 2026

Extension 1.2.0 adds an opt-in foreground conversation watcher, Crisp/Mevrik channel profiles and a subscription-free local simulator. Fresh build/typechecks and 41 unit/database tests pass. The complete browser run covers 23 flows, including both platform-profile fixtures, the exact Mevrik port 4220 origin, ignoring outgoing messages, preserving edited drafts and stopping on conversation changes. These are local fixtures, not live inbox acceptance.

The simulator was also exercised in the in-app browser: initial capture → automatic KB-backed empathetic draft → new customer reply → updated captured context → Insert at chat box → populated native textarea. No send action was taken. The example policy and source name were displayed correctly. No external AI credentials are configured; this demonstrates the grounded fallback pipeline.

Both supplied live URLs were opened. Crisp redirected to `/initiate/login/`; Mevrik redirected to its sign-in page on port 4220. Signed-in customer-message and editor markup therefore remain unverified. A signed-in compatibility pass is still required before advertising live Crisp/Mevrik support.

Evidence: `verification/watch-build.txt`, `watch-typecheck.txt`, `watch-unit.txt`, `watch-browser.txt`. The first attempt found a missing temporary Chrome executable; the final suite uses cached Chrome for Testing. Run `pnpm demo:watch` for the disposable local demonstration.

## Super-admin update — September 22, 2026

The control center is implemented at `/admin`: searchable/paginated user and workspace directories, monthly individual quota counters, draft-only restrictions, global account suspension, manual workspace plan overrides, AI pipeline configuration, provider-presence diagnostics, synthetic pipeline tests and before/after audit history. Workspace navigation exposes the entry to server-verified platform admins, plus the explicitly labeled local preview. See ADMIN-CONTROL.md for operation and migration instructions.

Fresh checks: **53 unit/API/database tests, 29 browser tests, all project typechecks and ordered production build passed**. The production browser suite includes 23 previous flows plus four admin-preview workflows and two configured-mode admin flows. One drives the actual admin UI → test HTTP transport → actual AuthGuard/AdminController → real SQL migration/PGlite → persisted control after reload → denied draft request. The other verifies denial for an ordinary account. Supabase authentication and PostgREST remain test-only transport substitutions; no real MFA service is impersonated in production code. Signed Stripe payloads are verified by the real SDK, while subscription retrieval is stubbed locally. No real charge or webhook delivery occurred.

Tests cover separate user/workspace quotas, duplicate requests, concurrent reservation attempts, once-only refunds, immediate denial for suspended existing sessions, extension revocation, restricted RLS reads, persistence of suspension after membership removal, manual overrides through paid/canceled/stale/duplicate subscription events, restoration of billing entitlements, global pause, disabled-provider failure/refund, synthetic template diagnostics, model/token/temperature settings reaching the provider request, rejected unauthorized fields and atomic rollback on audit failure. PGlite serializes its embedded execution; hosted PostgreSQL concurrency/load testing remains a staging check.

Desktop and mobile screenshots were inspected; directory text contrast was improved and a zero-quota percentage display was guarded against division by zero. Test selector ambiguities were corrected before the complete passing run. CI now starts a second configured-mode fixture web server for the two admin API workflows. CI execution itself has not been run on GitHub.

Evidence: `verification/admin-unit.txt`, `admin-build.txt`, `admin-typecheck.txt`, `admin-browser.txt`. Preview: `http://127.0.0.1:3105/admin` while the local server is running. For browser reproduction set `TEST_BASE_URL` to the demo server and `ADMIN_TEST_URL` to the separate configured-mode test server; the CI workflow documents the non-secret fixture environment. Neither test server is a hosted deployment.

Live Supabase MFA/metadata setup and advisors, applying the upgrade to a backed-up hosted database, real Stripe lifecycle delivery, provider/model compatibility and live AI quality remain staging requirements. Provider credentials remain server-managed; the panel never returns them. Production readiness is not a claim of invulnerability.
