# DraftPilot

A customer-support drafting workspace with a Next.js web app, NestJS API, Supabase/PostgreSQL data model, and a Chrome Manifest V3 universal capture extension.

**Current delivery: built and verified locally. Not deployed or approved for customer launch.** No live credentials, emails, payments, or customer data were used. The local demo uses in-memory sample data and resets when reloaded. AI provider, OAuth, billing, and real Gmail compatibility need staging verification once accounts are available.

## Open the local workspace

Requirements: Node.js 22.16+ and pnpm 11.19.0. The extension packaging script also uses Python 3.

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000 for the public homepage and http://127.0.0.1:3000/app for the workspace. Without Supabase configuration, development mode shows an explicitly labeled, fully interactive local demo. No provider calls occur in the demo. Demo edits are intentionally temporary.

To run the API separately:

```bash
pnpm dev:api
```

The unconfigured API provides `/health` and rejects protected operations. `/ready` returns 503 until the database is configured. Local Swagger documentation is at http://127.0.0.1:3001/docs and is disabled in production.

## What is included

- Responsive dashboard, extension-only customer drafting, editable macros, knowledge library, history, team interface, settings, integration guide, command search, and accessible native dialogs.
- Browser and server sensitive-pattern redaction; editable replies with source references and an explicit review step.
- Deterministic local templates that never pretend to be a live AI service.
- One extension-scoped NestJS drafting endpoint. A verified global model selected by the platform admin, encrypted API credentials, model discovery, live testing and a private admin playground; bounded provider calls and shared daily attempt limits.
- Team-scoped keyword retrieval and optional OpenAI/pgvector semantic retrieval.
- Knowledge ingestion by pasted text or TXT/Markdown/XLSX/CSV/TSV files, with local worker parsing, archive/row/size limits, chunking, redaction, and optional embeddings.
- Supabase email/password authentication, recovery codes and Google OAuth, HttpOnly cookies, refresh handling, and sign-out.
- Owner/admin/member authorization, role changes, member removal, paid-seat enforcement, email-bound invitation links, and atomic invitation acceptance. Links are created for manual sharing; the app does not send invitation emails.
- Stripe Checkout, customer portal, raw-body webhook signatures, duplicate-event handling, and ordered subscription entitlement updates.
- One-time extension pairing codes and hashed, expiring, revocable draft-only extension tokens. No access-token bridge through a webpage.
- MFA-gated platform operations at `/admin`: authenticators, workspace access controls, real metrics, and provider configuration status. Server API also supports quota overrides and account bans.
- SQL migrations, automated tests, CI, API Dockerfile, Vercel configuration, retention job, configuration checks, and launch instructions.

## Repository

| Path | Purpose |
| --- | --- |
| `packages/web` | Next.js 16.3.5, React 19, TypeScript, Tailwind 4, custom responsive UI |
| `packages/api` | NestJS 11, Express, validation, auth guards, AI, billing, and administration |
| `packages/shared` | Shared schemas, types, redaction, deterministic drafting and source ranking |
| `packages/extension` | Vite, TypeScript, Chrome MV3 side panel and Gmail content script |
| `packages/api/supabase/migrations` | PostgreSQL, pgvector, RLS, quotas, retention and pairing routines |
| `tests` | Unit tests, embedded PostgreSQL security tests, and browser workflows |

Dependency versions are pinned by `pnpm-lock.yaml`. Frameworks were upgraded from the document's older major versions. A pnpm override selects multer 2.4.0 to fix advisories in the transitive dependency. CSS motion respects reduced-motion preferences. No provider credentials are exposed through `NEXT_PUBLIC_*` variables.

## Connect accounts later

Copy `packages/web/.env.example` to `packages/web/.env.local`, and `packages/api/.env.example` to `packages/api/.env`. Populate the values in your local secret files, never in source control or chat. The API development command reads its package-local `.env`.

1. Create a new Supabase project; apply all SQL files in `packages/api/supabase/migrations` in filename order to a fresh database. Do not point this at the historical project mentioned in the PDF.
2. Configure Supabase Auth site URL and redirect allowlist for your chosen app origin. Enable email confirmation, production SMTP, and optionally Google OAuth. Choose an access-token lifetime around one hour. Configure the recovery-email template to display `{{ .Token }}` as described in `LAUNCH.md`, and confirm these flows in staging.
3. Configure server encryption, then connect/test/activate your AI provider through `/admin` as described in `ADMIN-CONTROL.md`. Set provider spending limits and the global daily call ceiling.
4. Add Stripe test-mode keys, a recurring $19/seat/month price, and a webhook destination. Use the event and deployment instructions in `LAUNCH.md`.
5. Rebuild the extension for the selected API origin and explicitly allow its `chrome-extension://<id>` origin in the API configuration.
6. Run the live launch checks described in `LAUNCH.md` before collecting customer data or enabling paid accounts.

## Build and test

```bash
pnpm --filter @draftpilot/shared build
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
```

`pnpm test` includes real PostgreSQL semantics through PGlite with pgvector. It creates isolated, disposable in-memory databases and requires no live Supabase project. These tests verify SQL permissions and behavior, but do not replace staging tests against hosted Supabase Auth, PostgREST, and concurrent production traffic.

Browser checks require Chromium or Chrome for Testing with extension side-loading support (ordinary branded Chrome can disable this flag). Build all packages first. With the web app running:

```bash
pnpm exec playwright install chromium
CHROME_PATH=/path/to/chromium pnpm test:e2e
```

On this workstation Chrome is `/usr/bin/google-chrome`. For an optimized local demo:

```bash
pnpm build
DRAFTPILOT_DEMO=1 pnpm --filter @draftpilot/web start
```

An unconfigured production web build shows a setup-required page unless `DRAFTPILOT_DEMO=1` is explicitly set. Never enable demo mode on the customer deployment.

## Universal capture extension

```bash
pnpm build:ext
```

Load `packages/extension/dist` using Chrome → Extensions → Developer mode → Load unpacked. The downloadable ZIP is `packages/web/public/draftpilot-extension.zip`.

Open Gmail or Zendesk and click the DraftPilot toolbar action. On another regular web page, select the customer message first, then click DraftPilot (or right-click the selection → DraftPilot). The floating panel captures the message, generates with workspace knowledge and the saved tone, and offers **Insert at chat box**. You can also use **Pick message** and **Choose reply box**. Existing text is never silently replaced; changed conversations and replaced editors are rejected. Sending remains your separate action.

The extension uses temporary `activeTab` access on ordinary sites. It does not read every website continuously. Browser-internal pages, Chrome Web Store pages, PDF viewers, closed shadow roots and restricted/cross-origin frames may prevent capture/insertion. Open the conversation in an accessible top-level page; there is no clipboard-watching bypass. See UNIVERSAL-CAPTURE.md for adapter and validation details.

The extension works in local template mode without accounts. For account mode, use Integrations → Pair extension in the web app, then **Workspace connection** in the floating panel; enter the five-minute code in the secure extension settings tab. Credentials never pass through the host page. The scoped token expires after seven days, is held in Chrome session storage, and can be revoked from the web workspace.

To build for production:

```bash
DRAFTPILOT_API_URL=https://api.your-domain.example pnpm --filter @draftpilot/extension build
```

The generated manifest permanently allows Gmail, the three supported Outlook web hosts, and the chosen API host. Generic capture uses `activeTab`, `scripting` and `contextMenus` after an explicit action, without blanket permanent website access. Chrome Web Store submission, branding screenshots, privacy disclosures, and live Gmail verification are still required.

## Scope and honest limitations

- Gmail, Outlook web and Zendesk have dedicated DOM adapters. Intercom and other accessible web pages use generic selection/pick capture and in-page insertion. This is browser DOM assistance, not native OAuth/API integration; compatibility varies with editors and frame restrictions. Live signed-in Zendesk and Gmail validation is still required.
- TXT/Markdown/XLSX/CSV/TSV ingestion is implemented. PDF, DOCX, arbitrary URL crawling and other binary formats are not included in this release. Spreadsheet files are parsed locally, never uploaded as binaries.
- The original seven named models were not copied blindly: availability must be checked in your provider account. The shorter configurable cascade bounds latency and avoids silently sending data to numerous providers.
- No shared root passkeys, default administrator identities, public AI keys, direct extension-to-database fallback, or fabricated production metrics were carried over.
- Workspace ownership transfer, an automated onboarding email sequence, and a public marketing/legal website are not implemented. Resolve the launch-impacting items for your intended market before releasing.
- The demo is not a backend emulator and does not persist real workspace data. Production authentication, live AI, Stripe, and provider-side email behavior have not been tested because accounts are not available.
- Pattern redaction does not detect all personal data. Prompt instructions do not guarantee freedom from hallucination or prompt injection. Review every reply, follow privacy obligations, monitor abuse, and obtain independent security testing before launch.

See `SECURITY.md`, `VERIFICATION.md`, and `LAUNCH.md` for the tested controls and remaining launch requirements.

## Automatic draft simulator

Run `pnpm demo:watch` and open http://127.0.0.1:3103 to try customer-message watching, knowledge-based draft updates and **Insert at chat box** without platform subscriptions. This uses disposable local test data. Crisp and Mevrik channel profiles are included; their signed-in DOM/editor compatibility remains unverified. See UNIVERSAL-CAPTURE.md.

## Super-admin operations

Open `/admin` for user overview, per-user quotas, suspension and draft-only restrictions, workspace billing/manual overrides, AI provider controls, synthetic pipeline testing and the audit log. Local demo mode provides sample controls; connected mode requires a server-assigned platform admin with MFA. Read [ADMIN-CONTROL.md](ADMIN-CONTROL.md) before enabling production administration.

## Customer authentication and protected AI setup

Customer routes: `/login`, `/signup`, `/reset`. The workspace has no customer AI playground; drafting is available only through a paired extension. `/admin` contains write-only API-token connection, provider model discovery, required live testing, global activation, and the private playground. Real authentication, email delivery and provider access need configured accounts; the preview does not simulate successful credential verification. See `ADMIN-CONTROL.md` for encryption and cost controls.
