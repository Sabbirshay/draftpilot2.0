# Super-admin control center

Open `/admin`, or **Control center** in the workspace navigation. The local demo (`DRAFTPILOT_DEMO=1` without configured services) is an explicitly labeled, in-memory preview. Sample changes reset on reload. Configured deployments never use demo administration.

## Production authorization

Create/sign in to your own Supabase Auth account and have a trusted deployment operator assign `app_metadata.platform_admin=true` through the Supabase Dashboard/Admin API. Never use user-editable metadata, browser flags or a public signup path for this role. There is no default admin password and no public role-grant endpoint. Enroll/verify an authenticator at `/admin`. Every admin request verifies the Auth user, server-assigned role and AAL2; extension tokens and ordinary workspace owners are rejected. A platform administrator can reach recovery controls if their workspace is frozen or lacks seats, but individually suspended/banned administrators remain blocked.

Apply **all** SQL migrations in filename order before running this version, including `20260921200836_platform_control_center.sql` and `20260922062355_protected_ai_credentials.sql`. Existing installations apply only unapplied migrations. The old GitHub schema is not a supported migration target. Back up a populated database before upgrading.

## Users and quotas

The directory covers provisioned workspace users, with name/email search and 50-row pagination. It displays workspace membership, effective plan, monthly consumption and access state. Previously controlled accounts remain listed after workspace removal, so their restrictions can still be managed. Auth-only signups that have never created/joined a workspace are not listed. Monthly usage follows UTC calendar months.

An individual quota is an additional ceiling beneath the shared workspace quota. Blank means no separate individual cap; zero denies new drafts. Neither a plan change nor a quota edit resets usage. Reservations charge both counters in one transaction; failed pending drafts refund both once. Persistent counters are independent of retained draft text. The migration seeds individual counters from retained non-failed history; historical drafts already deleted before this migration cannot be reconstructed.

**Block draft generation** preserves workspace browsing. **Suspend account** blocks existing API sessions and direct tenant reads and revokes extension tokens/pairing codes. Restoring access does not restore revoked extension tokens; users pair again. These controls do not delete data or ban a person at the identity-provider level. Operations already executing when a restriction is applied may complete; new reservations and requests are denied. The administrator cannot suspend their own account through this panel.

## Plans and payments

Billing remains workspace-based: upgrading a user’s plan upgrades the workspace and affects all its members. The panel shows the workspace and member count before saving. It does not charge, refund or cancel Stripe subscriptions.

The configured Stripe Team price remains $19 USD per licensed seat per month, with 1,000 drafts per seat and a maximum of 100 seats. Signed subscription events fetch current Stripe subscription state, deduplicate event IDs, ignore stale event timestamps and update billing entitlements. Active/trialing eligible subscriptions grant Team access; other statuses restore Free entitlements under the existing billing policy. There is no arbitrary-price client upgrade endpoint.

Manual overrides store a plan, seat limit and workspace draft cap separately from Stripe state. Subsequent payment events update billing state but preserve the override. Overrides are indefinite until removed. Removing one immediately restores the latest billing entitlements. Suspending a workspace does not cancel its payments.

## AI pipeline

Customer generation is extension-only. The customer web app contains knowledge, macros, history, settings and extension setup, with no AI playground. Both the web proxy and API reject web-session generation, including requests forged with `channel=gmail`. The admin playground has a separate MFA-protected endpoint and never grants a customer this permission.

### Connect, test and activate

1. Configure `AI_KEY_ENCRYPTION_KEY` on the API server only: a randomly generated 32-byte base64 key (`openssl rand -base64 32`). Back it up separately from the database. Never use a `NEXT_PUBLIC_` variable or put it in the extension. All API replicas need the same key. Changing the master requires a planned re-encryption/reconnection; existing ciphertext cannot be decrypted with a new master.
2. Sign in as a platform administrator, verify MFA, and open **AI pipeline**. Choose OpenAI or OpenRouter, enter an inference API key and an audit reason, then choose **Validate key & load models**. The input clears after submission. Provider URLs are fixed and cannot be supplied by a caller. OpenRouter management/provisioning keys are rejected.
3. Select a chat model from the returned provider catalog. **Run live model test** makes one bounded inference request with synthetic reference facts. Catalog membership alone does not guarantee Chat Completions compatibility or billing access. A failed test cannot activate a model.
4. **Activate for all users** requires a successful test of that model and current key revision within one hour. Every new draft uses the global selection, so existing and future accounts inherit it automatically. Activation does not unpause generation: review the pause checkbox below and save with a reason.
5. Use **Private AI playground** to test sample questions, reference facts and tone against the active model. It is only available to MFA-verified platform administrators and is limited to three tests per minute. No customer content or provider credential is written to its audit events.

Keys are encrypted with AES-256-GCM, a random nonce and provider-bound associated data. The database table has RLS and no public/anonymous/authenticated access. Admin reads return model metadata, never ciphertext or key fragments. Credential changes and activation audit only the actor, provider, revision, model and reason. Rotating the active provider key pauses generation and invalidates its previous test/activation. In-flight work may finish; new work fails closed until the replacement is tested and activated.

### Spending and generation controls

Production requires a tested, activated model; inference failures do not silently switch to another paid provider or a template. Environment-provider cascades/templates remain only for unactivated local development and regression fixtures. OpenAI uses `max_completion_tokens` and OpenRouter uses `max_tokens`; reasoning models may not accept every option or return a reply within the configured cap, so test your exact model. Temperature is omitted for OpenAI o-series/GPT-5 reasoning families.

The saved policy controls pause, output cap (100–1,200 tokens), temperature for compatible models, and semantic retrieval. A saved OpenAI credential can supply embeddings; an OpenRouter-only configuration uses keyword retrieval unless a separate OpenAI credential is configured. Disabling embeddings prevents paid semantic calls. Missing/unavailable embeddings leave keyword retrieval usable.

`AI_DAILY_CALL_LIMIT` sets an atomic, shared UTC-day ceiling for paid request attempts (default 1,000; 1–100,000). It covers drafts, admin probes/playground, embeddings and local-development provider retries. Failed attempts remain counted because a provider may already have billed them. Input sizes, output tokens, per-user request rates and individual/workspace monthly quotas are also bounded. The environment `GENERATION_PAUSED=1` overrides the panel and blocks new paid calls after deployment/restart. In-flight calls are not cancelled.

A request ceiling is **not a currency budget**: model prices and token use vary. Configure a dedicated restricted provider project/key, provider-enforced spending/credit limits where available, and expenditure alerts before launch. A stolen extension token is still a bearer credential and could be used outside the browser until revoked; its server-side scope, limits and expiry remain enforced.

The local preview cannot save keys or perform live tests without configured authentication, database and encryption. No fake successful connection is shown.

## Audit and verification

User, workspace and pipeline mutations require an 8–300 character reason. The database commits before/after values, actor ID, target and change together; an audit insertion failure rolls back the change. The panel shows the latest 50 platform events, with 90-day retention. It does not display customer messages or knowledge-base content.

Local verification uses actual controllers and the real migration in PGlite. Auth/PostgREST transport is replaced only in test helpers. Stripe tests validate signed synthetic webhook payloads and use a stub authoritative subscription response; no payment is taken. Live hosted Supabase, payment delivery and AI provider connectivity still require configured accounts and staging verification. See `VERIFICATION.md` for run results.

Provider protocol references: [OpenAI model listing](https://developers.openai.com/api/reference/resources/models/methods/list), [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [OpenRouter models](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties), [OpenRouter key validation](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key).


## Live Command overview (Users tab)

The Users tab refreshes the directory and platform totals every five seconds while visible, and on focus/reconnect. It keeps edits intact, labels stale snapshots, and clears protected data when access expires. No additional navigation tab was added.

Apply `packages/api/supabase/migrations/20260923195503_live_command_overview.sql` before deploying the new API. Usage tables and aggregation functions are service-role-only; HTTP reads still require platform-admin authorization and MFA. The local unconfigured demo is explicitly sample data, not a live monitor.

The overview shows provisioned users, current workspaces, completed drafts this UTC month, current API process uptime, AI input/output tokens, and AI costs. Process uptime resets on instance restart and is not historical availability/SLA. Draft counters survive content retention; only still-retained historic drafts can be backfilled.

Every managed chat and embedding provider attempt (including retries and admin tests) reserves a durable content-free event before spending. Usage is persisted from the response. Missing costs/tokens stay unknown; interrupted processes leave visible pending events. Accounting reservation failure prevents the paid request; finalization failure stops the chat cascade. Provider invoices remain the billing authority.

OpenRouter costs use provider-reported `usage.cost`. OpenAI estimates use verified standard rates for exact `gpt-4o-mini`, `gpt-4o-mini-2024-07-18`, and `text-embedding-3-small` model names, including cached input discounts. Unknown model prices remain unpriced. Server-only `AI_USAGE_PRICES_JSON` can add/override exact OpenAI model rates, e.g. `{"your-model":{"input":1,"cached":0.1,"output":5}}`, in USD per million tokens. Update these rates when prices or your contract change. Estimates exclude taxes and account-level adjustments; no past usage is invented.

References: [OpenRouter accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting), [GPT-4o mini pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini), [embedding pricing](https://developers.openai.com/api/docs/models/text-embedding-3-small), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
