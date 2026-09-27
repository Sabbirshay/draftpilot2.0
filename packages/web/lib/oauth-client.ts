import { createClient } from "@supabase/supabase-js";

export function oauthClient(
  url: string,
  key: string,
  verifier: { get(): string | null; set(value: string): void; remove(): void },
  fetcher?: typeof fetch,
) {
  const storageKey = "dp_oauth";
  const memory = new Map<string, string>();
  return createClient(url, key, {
    global: fetcher ? { fetch: fetcher } : undefined,
    auth: {
      flowType: "pkce",
      // Supabase ignores custom storage when persistence is disabled.
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey,
      storage: {
        getItem: (name) => name === `${storageKey}-code-verifier`
          ? verifier.get() : memory.get(name) ?? null,
        setItem: (name, value) => {
          if (name === `${storageKey}-code-verifier`) verifier.set(value);
          else memory.set(name, value);
        },
        removeItem: (name) => {
          if (name === `${storageKey}-code-verifier`) verifier.remove();
          else memory.delete(name);
        },
      },
    },
  });
}
