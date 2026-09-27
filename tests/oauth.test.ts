import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { oauthClient } from "../packages/web/lib/oauth-client";

test("Google PKCE survives separate requests without persisting provider/session tokens", async () => {
  let cookie: string | null = null;
  const writes: string[] = [];
  const storage = {
    get: () => cookie,
    set: (value: string) => { cookie = value; writes.push(value); },
    remove: () => { cookie = null; },
  };
  const first = oauthClient("https://example.supabase.co", "test-key", storage);
  const { data, error } = await first.auth.signInWithOAuth({ provider: "google", options: {
    redirectTo: "https://draftpilot.example/api/auth/callback", skipBrowserRedirect: true,
  } });
  assert.equal(error, null);
  assert.ok(cookie, "verifier must be stored before the redirect");
  const challenge = new URL(data.url!).searchParams.get("code_challenge");
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.auth_code, "single-use-code");
    assert.equal(createHash("sha256").update(body.code_verifier).digest("base64url"), challenge);
    return new Response(JSON.stringify({ access_token: "access-token", refresh_token: "refresh-token",
      token_type: "bearer", expires_in: 3600, provider_token: "google-provider-token",
      user: { id: "test-user", aud: "authenticated", email: "test@example.com" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const callback = oauthClient("https://example.supabase.co", "test-key", storage, fetcher);
  const result = await callback.auth.exchangeCodeForSession("single-use-code");
  assert.equal(result.error, null);
  assert.equal(result.data.session?.access_token, "access-token");
  assert.equal(cookie, null, "verifier must be cleared after exchange");
  assert.ok(writes.every(value => !/access-token|refresh-token|google-provider-token/.test(value)));
});

test("missing verifier fails closed before any token request", async () => {
  let requests = 0;
  const callback = oauthClient("https://example.supabase.co", "test-key", {
    get: () => null, set: () => {}, remove: () => {},
  }, async () => { requests++; throw new Error("Unexpected token request"); });
  const result = await callback.auth.exchangeCodeForSession("invalid-code");
  assert.ok(result.error);
  assert.equal(result.data.session, null);
  assert.equal(requests, 0);
});
