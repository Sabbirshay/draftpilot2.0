# Audit remediation and PR description

## Scope

The supplied audit reviews GitHub `Sabbirshay/draftpilot` commit `61df6161da51540b8544dd73749ac37b28c3e85b` (Next.js 14, eight migrations). This workspace contains the replacement Next.js 16/NestJS implementation previously delivered. The user explicitly chose to continue locally and prioritize Zendesk. No changes or claims are made about that remote commit or any deployed installation. This workspace has no Git repository, so this document supplies the requested commit/PR description without inventing commits.

## Triage and disposition

The supplied report has 2 critical, 9 high and 9 medium findings; no low findings. “Retired” means the unsafe feature/path is absent from this replacement and is not advertised as available; it does not mean the historical implementation was repaired in place.

| # | Severity | Local disposition and evidence |
|---|---|---|
| 1 | Critical | Resolved by server-only provisioning and mutation grants in `001_secure_workspace.sql`; platform authorization uses server app metadata plus MFA in `auth.ts`. DB tests deny browser role/quota mutations and service RPC execution; role tests deny platform access without metadata/MFA. |
| 2 | Critical | Retired `/api/drafts/record`; only authenticated `DraftsController.generate` can reserve and record drafts using membership-derived IDs. Anonymous protected requests return 401; DB tests reject cross-team quota reservations. |
| 3 | High | Strict shared input schema rejects tenant, test, model, prompt and budget overrides. Missing membership fails `requireTeam`. Added explicit override regressions. Server-owned models and fixed output budget. |
| 4 | High | UI calls authenticated checkout/portal via the server proxy; only Stripe webhook reconciliation updates billing entitlements. No optimistic paid-plan success or direct browser plan mutation. Demo explicitly reports unconfigured billing. |
| 5 | High | Annual and Enterprise pricing retired; only $19 USD/month/seat is offered. NEW: checkout retrieves and validates the actual Stripe price amount, interval, currency, active state and licensed billing scheme; regression tests reject inconsistent configuration. Quantity is bounded by Stripe Checkout. |
| 6 | High | Owner-only checkout/portal; signed webhooks retrieve subscription state and atomically reconcile configured price and seat quantity. Event IDs/order, seat quota and downgrades are covered by DB tests. DB failure throws rather than acknowledging success. No Enterprise entitlement is offered. |
| 7 | High | Shared neutral fallback requires review and never fabricates account/refund/shipping actions. No confidence percentages. Existing regressions cover refund and delivery claims. NEW: fallback output is scrubbed at the provider boundary as well. |
| 8 | High | NEW: every provider prompt segment (thread, agent guidance, source names and source text) is scrubbed at the final boundary; PIN/OTP assignments are included. Embeddings already scrub all input. Added outbound-payload regression. Legacy custom-regex settings are retired; the UI does not promise custom-rule persistence. Regex redaction remains limited. |
| 9 | High | Legacy webpage token handshake retired. Only explicit one-time pairing; tokens are hashed, expiring, revocable and draft-scoped. Tokens stay in trusted Chrome session storage. No Vercel wildcard permission or page localStorage credential transfer. |
| 10 | High | Shared utilities have a separate package; every package type-checks and production builds. Browser globals remain in extension compilation. CI runs type checks before builds. |
| 11 | High | Legacy feature flag/onboarding/cadence/custom-regex writes retired; current SQL covers current fields. All authoritative writes check errors. NEW: GENERATION_PAUSED=1 denies generation before any quota/provider work, after restarting/redeploying every API instance. Workspace suspension is persisted and enforced in API and RLS. No fictional propagation claim. |
| 12 | Medium | Atomic reserve_draft RPC locks quota and uses unique request ID; failure refunds once. One authoritative monthly usage counter; zero quotas remain zero. DB tests cover duplicates, limits, refunds and cross-tenant attempts. |
| 13 | Medium | Durable, email-bound invitation links and acceptance implemented. Links explicitly require manual sharing, no fake sent state. Phantom support ticket and protective reset controls retired. Demo data is labeled temporary. |
| 14 | Medium | Unsupported PDF/Word uploads rejected and not advertised. TXT/MD/XLSX/CSV/TSV have actual extraction, bounded spreadsheet worker and transactional content-preserving chunks. Optional embeddings feed real vector retrieval; keyword fallback is documented. Browser tests cover XLSX/CSV/malformed input and content persistence in demo; DB tests cover schema. |
| 15 | Medium | One authoritative NestJS provider route: at most 2 OpenRouter attempts + 1 OpenAI, 10 seconds each, optional embedding 10 seconds, inside the 60-second client/proxy budget. No arbitrary provider selectors or alternate-URL retries. Authorization/quota errors surface as errors without silently falling back. |
| 16 | Medium | Shared root passkeys retired completely; individual administrator sessions require MFA and server-owned metadata. Config endpoints disclose only configured status/model names, never raw keys. |
| 17 | Medium | Monthly usage is queried for the current UTC month; retained history is separate. No synthetic revenue estimates or date-range/max-count blending. Demo counts/graphs are explicitly samples. |
| 18 | Medium | Server cookies verify and refresh sessions; one email-verification/provisioning contract. Account bans/suspension/seat status fail closed. Scoped extension sessions expire/revoke and cannot call DB directly. NEW: successful web logout revokes the user's extension tokens and outstanding pairing codes before session logout. |
| 19 | Medium | Mutable global catalogs/broadcasts and process-memory feature flags retired. Workspace macros/settings are durable DB records with checked writes. No in-memory production authority. |
| 20 | Medium | One pnpm toolchain/lockfile; CI runs package typechecks, real unit/PostgreSQL tests, production builds, audit and Chromium flows. No success-printing lint scripts or helper-oracle E2E claims. Hosted services remain explicitly outside local verification. |

## Changes and reasons

The new boundary redaction addresses old or externally inserted knowledge as well as normal scrubbed ingestion. Price validation prevents a mistyped configured Stripe ID from charging a different cadence or amount. The emergency stop replaces unimplemented maintenance promises with an actual gate. Logout revocation prevents a separately paired extension session from remaining usable after web sign-out.

## Verification boundary

Local checks verify this replacement. Live Supabase Auth/PostgREST, Stripe payments, historical credential exposure/rotation and deployed security settings cannot be verified without accounts. No customer-facing release approval or zero-vulnerability guarantee is implied. See VERIFICATION.md and the evidence files. Real platform compatibility must distinguish local DOM fixtures from signed-in production testing.

## Final local evidence

41 unit/database tests and 20 production-browser workflows pass after both workstreams. The clean production build and package typechecks pass; the production dependency audit reports zero known advisories. Local findings have dispositions above; historical deployments and hosted integrations remain outside the verified scope.

## Universal capture changes

Added a temporary-permission generic capture layer, Gmail/Zendesk adapters, a floating review panel, and guarded native plain-text insertion. Generation uses the existing authoritative API and now inherits the workspace tone when omitted. Pairing remains in a secure extension-origin tab. Browser tests use the actual built worker/content code and a PostgreSQL-backed controller harness, including uploaded KB content, source names, tone, revocation and stale-editor protection. See UNIVERSAL-CAPTURE.md for limits and fixture versus live validation.
