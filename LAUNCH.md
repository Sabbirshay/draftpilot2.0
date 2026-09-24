# DraftPilot launch runbook

**Status: verified local implementation; live launch is not yet approved.** The owner requested local build and verification because production accounts are not ready. This package makes no claim that hosted authentication, payments, live model inference, or Chrome Web Store review has passed.

## 1. Prepare the environments

Use separate staging and production projects. Do not reuse the Supabase URL, keys, default administrators, or fallback secrets referenced in the historical PDF.

- Web: Vercel, with project root directory `packages/web`. Set the build-time `DRAFTPILOT_API_URL` to your HTTPS API origin so the downloadable extension is rebuilt for production. Python 3 must be available for ZIP packaging. The package-local `vercel.json` sets the build command; allow the project to include files outside its root directory so the shared workspace can be built.
- API: a long-running Node 22 service. Build from the repository root with `docker build -f packages/api/Dockerfile -t draftpilot-api .`, or use `pnpm --filter @draftpilot/api build` after building the shared package. The Dockerfile runs as a non-root user. The container image itself has not been built in this environment.
- Database/auth: a new Supabase PostgreSQL project with pgvector available.
- Email: production SMTP configured in Supabase Auth.
- AI: server-owned OpenRouter and/or OpenAI account, with spending limits and approved model/data-retention settings.
- Billing: a Stripe account, initially in test mode.
- Extension: a Chrome developer account and your intended distribution policy.

Use HTTPS for the public web and API origins. Keep secrets in each hosting platform's secret store, not in source, query strings, browser variables, or extension bundles. `APP_URL` must exactly match the web origin used by browsers.

## 2. Apply the initial database schema

`packages/api/supabase/migrations` contains the ordered schema migrations, including the platform control-center upgrade. Apply all files in filename order once to the new project's SQL editor or adapt it to your normal reviewed migration workflow. It is not an in-place upgrade for the old repository's schema.

Check that the service role can invoke the explicitly granted RPCs, and that authenticated users can read only their active, licensed team. Do not expose the `private` schema through the Data API. Keep direct browser table mutations disabled.

Run Supabase's database/security advisors after installation and resolve findings. Confirm backup availability and test a restore before entering real customer data. The local PGlite suite verifies SQL behavior; it cannot verify your hosted project's settings, grants outside this migration, or connection policies.

## 3. Configure authentication

Set the app URL and exact callback redirect in Supabase Auth:

- `https://your-app.example/`
- `https://your-app.example/api/auth/callback`
- `https://your-app.example/reset`

For staging, add only its exact equivalents. Avoid unrestricted wildcard redirects. Enable email confirmation. Set the minimum password length to at least 12, turn on available compromised-password protections, and use a short access-token lifetime (for example one hour).

Configure Google OAuth with the callback URL shown by Supabase. The application uses PKCE for Google and server-only cookie sessions. New OAuth users choose or join a workspace; the app does not automatically create one while they accept an invitation.

**Password recovery email template:** this implementation asks the user to enter an email recovery code. Configure Supabase's Reset Password template to display `{{ .Token }}` and a link to `{{ .SiteURL }}/reset`. Do not leave it as only the default implicit-flow link. Use the project-configured OTP length between 6 and 10 digits. The application verifies a recovery OTP, updates the password, signs out other refresh sessions, and asks the user to sign in again. Existing access tokens can remain valid until their short expiry. Extension tokens issued before a later account sign-in are rejected.

The default signup confirmation email can verify the email and return the user to the app; then they can sign in. Test its redirect behavior before launch. Configure rate limits and CAPTCHA/WAF controls for the public auth endpoints as appropriate to your traffic and threat model.

To assign a platform operator, set `platform_admin: true` in the user's **app metadata** through a trusted administration process. Never use user-editable metadata. Visit `/admin`, enroll and verify TOTP, and confirm that ordinary users and administrators without MFA are denied. No passkey bypass exists.

## 4. Configure the API and AI

Start from `packages/api/.env.example` and supply the production values. Startup intentionally fails when essential production configuration is missing. Set `HOST=0.0.0.0` only on the deployed service; local development binds to loopback.

Set `GENERATION_PAUSED=1` on every API instance and restart/redeploy to stop new generation before quota or provider work. This is an environment control, not an instant distributed flag.

Configure the server-only `AI_KEY_ENCRYPTION_KEY` and an appropriate `AI_DAILY_CALL_LIMIT`. In `/admin`, connect a provider key, load its model catalog, run a real model test and activate the global model. Follow `ADMIN-CONTROL.md`. Production refuses customer generation without an activated model. OpenAI credentials support optional embeddings for newly imported knowledge; existing sources remain available through keyword retrieval.

No API accepts an arbitrary model-provider URL. Provider calls are bounded; an activated global model fails closed on outage and does not switch to another paid model. The model has no tools and no ability to send email.

Validate a real draft in staging using test information. Check both provider success and visible outage failure, source selection, redaction, review/editing, history persistence, quota use, and duplicate request IDs. Confirm that no customer message or provider key appears in operational logs.

## 5. Configure billing and paid seats

Create a recurring Stripe price for the Team plan, $19 USD per seat per month, and put its price ID in `STRIPE_TEAM_PRICE_ID`. The app does not create products or prices automatically.

Register `https://api.your-app.example/billing/webhook` for:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Configure the customer billing portal for the intended cancellation, payment-method, and quantity-change policy. Do not configure the portal to switch to unrelated products, since entitlements are tied to the approved price ID.

Test Checkout, duplicate webhooks, delayed webhooks, failed payment, cancellations, renewals, and seat quantity changes with Stripe test data. The free plan has one seat and 50 monthly drafts. The Team plan allocates 1,000 drafts per paid seat. Invitation acceptance locks the team row and refuses an unavailable seat. If a subscription shrinks below existing membership, the owner retains access and excess members are denied until seats are restored or membership is reduced.

Deleting a member revokes their extension tokens and workspace access, while preserving team-owned draft history with an empty author reference. The owner cannot be removed through member management. Transfer of workspace ownership is an operator-assisted process in this release.

Only change to live Stripe keys after the full test-mode lifecycle passes and your customer policies are published.

## 6. Build and verify the universal extension

```bash
DRAFTPILOT_API_URL=https://api.your-app.example pnpm --filter @draftpilot/extension build
```

Load the unpacked extension in a staging Chrome profile. Add its exact `chrome-extension://<id>` origin to `EXTENSION_ORIGINS`. Repeat with the final Web Store ID before release. Confirm that the generated manifest contains Gmail, outlook.office.com, outlook.office365.com, outlook.live.com and your expected API host.

Test real Gmail conversations, long threads, quoted text, signatures, multiple compose boxes, changed conversations, paste/edit behavior and reload persistence. The automated DOM fixture tests do not prove that Gmail commits inserted text under every Gmail layout.

The extension reads a conversation only when the agent asks using its toolbar/context-menu action. The action injects an in-page panel with temporary activeTab access on generic sites. Pairing stays in a secure extension-origin tab. It never presses Send and never silently overwrites a nonempty reply. Pairing is one-time and expires after five minutes; tokens are scoped to drafting, expire after seven days, and are held in Chrome session storage.

Before Web Store submission, prepare icons, screenshots, a monitored support contact, privacy disclosures, the required data-use declarations, and a reviewer account. The packaged local extension is not a Web Store-approved listing.

Gmail, Outlook web and Zendesk have dedicated DOM adapters. Other accessible sites, including Intercom, use selection/pick capture and reviewed insertion. These are not native OAuth integrations. Test the actual signed-in editors and frame layouts before promising compatibility; restricted pages cannot be covered by the generic fallback.

## 7. Operate retention, backups and alerts

Run `scripts/retention.mjs` daily from a trusted scheduler with `API_PUBLIC_URL` and a strong `RETENTION_JOB_SECRET`. Alert if it fails. It clears expired draft content, old audit events, expired codes and abandoned quota reservations. Workspace settings alone do not run the cleanup.

Monitor `/health` for liveness and `/ready` for database readiness. Monitor error rates, quota failures, generation latency, provider expenditure, auth failures, webhook delivery, and retention completion. Redact request bodies and authentication headers in any hosting-level logs or monitoring integration.

Configure backup recovery, key rotation, operator access reviews, incident response, and a vulnerability-reporting contact. Third-party providers and backup copies can have separate retention rules.

## 8. Final release checks

```bash
pnpm install --frozen-lockfile
pnpm --filter @draftpilot/shared build
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
# With a local or staging web server running:
pnpm test:e2e
# Load production configuration securely, then:
pnpm check:launch
```

The launch script checks configuration, not business or security approval. It intentionally fails while accounts are unconfigured or the extension still points to localhost.

Before accepting customers, confirm:

- Real Supabase signup, confirmation, sign-in, Google OAuth, refresh, recovery, logout, MFA and invitations work with your chosen settings.
- Two genuinely separate tenants cannot read or mutate each other's data through API or direct database access.
- Concurrent quota requests behave correctly on hosted PostgreSQL, including retries and server restarts.
- Stripe's full lifecycle and entitlement changes work in staging, then with an authorized live test.
- Real Gmail draft insertion persists without sending or overwriting existing work.
- Auth abuse controls, secret handling, backup restoration, retention scheduling and alerts are operating.
- Privacy notice, terms, billing/refund policies, support contact and provider agreements are approved for your market. None are fabricated in this repository.
- An independent security review/pentest has been completed for the deployed system and its configuration.

Only then remove any demonstration access, open paid signup, and announce launch.

## Customer access and provider launch checks (22 September update)

- Verify `/signup`, confirmation email, `/login`, logout and `/reset` using staging SMTP. Confirm the recovery template includes the one-time token and reused/expired codes fail. Local browser tests do not establish email delivery.
- Apply the new credential migration, verify platform-admin MFA, connect a real inference key through the protected panel, test and activate the selected model. Keep request-body/header logging and third-party session replay disabled on admin/auth pages.
- Confirm an ordinary web session cannot call `/drafts/generate` or any `/admin` endpoint; a paired extension can draft using the global model, knowledge and tone. Check existing and newly created customers.
- Exercise the daily attempt ceiling and key rotation in staging. Verify that a rotated key pauses drafts and needs a new successful test/activation. Set provider spending/credit limits and alerts; OpenAI project budget alerts alone must not be treated as an application-enforced hard spend ceiling.
