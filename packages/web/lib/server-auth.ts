import "server-only";
import { cookies } from "next/headers";
import { createClient, type Session } from "@supabase/supabase-js";
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export function authClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)
    throw new Error("Authentication is not configured.");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function setSession(session: Session) {
  const jar = await cookies();
  jar.set("dp_access", session.access_token, {
    ...cookieOptions,
    maxAge: session.expires_in,
  });
  jar.set("dp_refresh", session.refresh_token, {
    ...cookieOptions,
    maxAge: 7 * 86400,
  });
}
export async function clearSession() {
  const jar = await cookies();
  jar.delete("dp_access");
  jar.delete("dp_refresh");
}
export function trustedOrigin(request: Request) {
  const expected = process.env.APP_URL || "http://127.0.0.1:3000";
  const origin = request.headers.get("origin");
  return origin === new URL(expected).origin;
}
export async function accessToken() {
  const jar = await cookies();
  const token = jar.get("dp_access")?.value;
  const client = authClient();
  if (token) {
    const { data, error } = await client.auth.getUser(token);
    if (!error && data.user) return token;
  }
  const refresh = jar.get("dp_refresh")?.value;
  if (!refresh) return null;
  const { data, error } = await client.auth.refreshSession({
    refresh_token: refresh,
  });
  if (error || !data.session) {
    await clearSession();
    return null;
  }
  await setSession(data.session);
  return data.session.access_token;
}

export async function readBounded(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Request exceeds the permitted size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
