# Security design and boundaries

No application is unhackable. The controls below reduce specific risks; they are not a penetration-test certification or a guarantee of zero data leakage.

## Trust boundaries

1. The web browser sends same-origin requests to the Next.js backend-for-frontend. Auth cookies are HttpOnly, SameSite=Lax, and Secure in production. State-changing requests require an exact configured Origin match.
2. Next.js forwards an authenticated bearer token only to the fixed, server-configured API origin. Caller input cannot choose the upstream host. Proxy paths and streamed request sizes are bounded. Redirect following is disabled.
3. NestJS verifies Supabase users with the auth service, requires confirmed email, checks the ban list and workspace suspension, derives the team from server-side membership, and enforces roles. A caller cannot supply an authoritative team ID.
4. The API uses a service-role database client, so each operation explicitly scopes tenant queries. RLS independently protects direct authenticated database reads; browsers have no table mutation grants. Service-only RPCs run with invoker privileges; execution is explicitly revoked from PUBLIC, anon, and authenticated roles. The membership lookup is a restricted definer function in a non-exposed private schema.
5. AI providers receive scrubbed context and relevant team-owned passages. No raw customer thread is stored by the application. The generated, redacted reply is retained according to workspace settings.
6. Extension tokens are independent of Supabase access tokens. Pairing codes are high-entropy, one-use and short-lived. Tokens are hashed in the database, expire, are revocable, and only authorize the draft endpoint.

## Controls implemented

- CSP with a request-specific script nonce; no unsafe-inline scripts in production. Frame blocking, nosniff, restricted permissions, strict referrer policy and production HSTS.
- Request schemas, strict unknown-field rejection, body/text size limits, fixed provider endpoints, and bounded inference timeouts.
- A process-local IP throttle plus a database-backed authenticated-user limiter, draft-generation limiter and quota ledger.
- Monthly quota reservation under a database row lock; unique request IDs; idempotent failures and reservation refunds. A scheduled cleanup handles abandoned pending work.
- Composite foreign keys prevent attaching another team's user/document to a tenant record. RLS also checks suspensions, bans, and paid-seat capacity.
- Owner/admin/member authorization; MFA and server-assigned app metadata for platform operations.
- Stripe webhook verification against the original raw bytes, idempotent event IDs, authoritative subscription fetches and event ordering.
- No email sending on behalf of the support agent. Universal insertion uses native plain-text editing, refuses to overwrite text, and checks captured conversation/source/editor identity. Tokens stay in the extension worker, never the host-page panel. Temporary activeTab access is granted by explicit toolbar/context-menu actions.
- Audit events exclude customer content and provider secrets. Generic server failures do not expose database errors or stack traces to clients.
- Production boot refuses missing essential API configuration. The web app does not silently turn into a customer-facing demo if setup is missing.

## Known residual risks and required operations

- Regex redaction misses names, unusual addresses, novel tokens and context-dependent personal information. It can also over-redact order numbers. Users must review context and output.
- LLM source references show supplied context, not verified entailment. Malicious references or emails can influence a model despite instruction separation. No tool execution or auto-send is granted to the model.
- Spreadsheet imports run in a separate worker with file, archive, output, row and time limits. This is a constrained parser, not a malware-scanning service. Import only approved knowledge.
- Gmail/Zendesk DOM selectors and controlled editors can change. Live draft persistence, localization, internal notes and frame restrictions need staging validation. Fixture tests verify DOM handling, not a platform's private application internals.
- In-page replies become visible to the host website by design. Use capture only on approved support platforms. Browser-internal/store pages, inaccessible frames and closed shadow roots are not bypassed.
- A generation emergency stop is available with GENERATION_PAUSED=1 on every API instance after restart/redeploy. It is not an instant distributed feature flag.
- Successful web logout revokes extension tokens and unredeemed pairing codes before signing out. Inaccessible/disabled accounts are already denied by the API guard.
- Supabase service-role credentials are highly privileged. Keep them only in the API secret store, rotate them, restrict operator access, and monitor their use.
- Configure provider spending limits, abuse controls, Supabase Auth rate limits/CAPTCHA as appropriate, edge request limits and alerts. Never add an automation bypass secret to public code or URLs.
- Operate a daily retention job. Without it, a retention preference alone does not delete old records. Backups and third-party retention have separate lifecycles.
- Use HTTPS and secure secret management. Validate backup restoration, incident response, log retention and key rotation before customer launch.
- Run dependency checks regularly. A clean advisory report is time-specific and cannot detect every vulnerability.
- Invite creation is manually shared, not emailed. Team role changes, removal and seat enforcement are implemented; the live subscription and invitation lifecycle must be tested before selling a self-service team plan.

For security reports, publish your own monitored contact address and disclosure policy before launch. No contact identity has been invented in this package.

## Provider-key and cost isolation

AI keys entered by MFA-verified platform administrators are encrypted server-side with AES-256-GCM before persistence. A separate API-only master key is required. Neither keys nor ciphertext are returned by read endpoints or included in audit details. Disable hosting request-body/header logs and session replay on credential/authentication pages. Encryption at rest does not protect a compromised API runtime holding the master key.

Customer generation accepts only restricted extension credentials; browser-session generation is rejected by both proxy and API. Admin testing has a separate role/MFA check. A copied extension bearer token cannot become a platform administrator, select a different global model, or bypass user/workspace quotas and the shared daily paid-attempt ceiling. It can still use its remaining permitted quota until revoked.

Model activation requires a recent successful inference test for the current credential revision. Rotation invalidates activation and pauses generation atomically. Provider URLs are fixed, redirects disabled, responses size-limited and requests timed out. Attempts, including failed/embedding/admin requests, count toward `AI_DAILY_CALL_LIMIT`. This ceiling limits requests, not currency; also configure provider spending controls and alerts.
