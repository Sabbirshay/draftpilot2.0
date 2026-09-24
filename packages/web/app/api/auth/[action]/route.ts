import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  authClient,
  cookieOptions,
  trustedOrigin,
  setSession,
  clearSession,
  accessToken,
  readBounded,
} from "@/lib/server-auth";
export const dynamic = "force-dynamic";
const credentials = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(128),
  workspace: z.string().max(80).optional(),
});
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  if (!trustedOrigin(request))
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 4096)
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  try {
    const { action } = await params;
    const client = authClient();
    if (action === "reset-request") {
      const body = z
        .object({ email: z.email().max(254) })
        .strict()
        .safeParse(JSON.parse(await readBounded(request, 4096)));
      if (!body.success)
        return NextResponse.json(
          { error: "Enter a valid email address." },
          { status: 400 },
        );
      await client.auth.resetPasswordForEmail(body.data.email, {
        redirectTo: (process.env.APP_URL || "http://127.0.0.1:3000") + "/reset",
      });
      return NextResponse.json({
        ok: true,
        message: "If an account exists, a recovery code will arrive shortly.",
      });
    }
    if (action === "recover") {
      const body = z
        .object({
          email: z.email().max(254),
          code: z.string().regex(/^\d{6,10}$/),
          password: z.string().min(12).max(128),
        })
        .strict()
        .safeParse(JSON.parse(await readBounded(request, 4096)));
      if (!body.success)
        return NextResponse.json(
          {
            error:
              "Enter your email, recovery code, and a new password of at least 12 characters.",
          },
          { status: 400 },
        );
      const verified = await client.auth.verifyOtp({
        email: body.data.email,
        token: body.data.code,
        type: "recovery",
      });
      if (verified.error || !verified.data.session)
        return NextResponse.json(
          {
            error:
              "That recovery code is invalid or expired. Request a new code.",
          },
          { status: 400 },
        );
      const updated = await client.auth.updateUser({
        password: body.data.password,
      });
      if (updated.error)
        return NextResponse.json(
          {
            error:
              "The password could not be updated. Request a new code and choose a different password.",
          },
          { status: 400 },
        );
      await client.auth.signOut({ scope: "global" });
      await clearSession();
      return NextResponse.json({ ok: true });
    }
    if (action === "logout") {
      const token = await accessToken();
      if (token && process.env.API_INTERNAL_URL) {
        const revoked = await fetch(
          process.env.API_INTERNAL_URL + "/extension/sessions",
          {
            method: "DELETE",
            headers: { Authorization: "Bearer " + token },
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          },
        );
        if (!revoked.ok && ![401, 403].includes(revoked.status))
          return NextResponse.json(
            {
              error:
                "Unable to revoke extension sessions. Try signing out again.",
            },
            { status: 503 },
          );
      }
      if (token)
        await fetch(process.env.SUPABASE_URL + "/auth/v1/logout", {
          method: "POST",
          headers: {
            apikey: process.env.SUPABASE_ANON_KEY!,
            Authorization: "Bearer " + token,
          },
        });
      await clearSession();
      return NextResponse.json({ ok: true });
    }
    if (action === "mfa") {
      const jar = await cookies();
      const token = await accessToken();
      const refresh = jar.get("dp_refresh")?.value;
      if (!token || !refresh)
        return NextResponse.json({ error: "Sign in first." }, { status: 401 });
      await client.auth.setSession({
        access_token: token,
        refresh_token: refresh,
      });
      const raw = JSON.parse(await readBounded(request, 4096));
      if (raw.action === "existing") {
        const { data, error } = await client.auth.mfa.listFactors();
        const factor = data?.totp.find((f) => f.status === "verified");
        if (error || !factor)
          return NextResponse.json(
            { error: "No verified authenticator. Set one up first." },
            { status: 400 },
          );
        return NextResponse.json({ factorId: factor.id });
      }
      if (raw.action === "enroll") {
        const { data, error } = await client.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "DraftPilot authenticator",
        });
        if (error)
          return NextResponse.json(
            { error: "Unable to enroll authenticator." },
            { status: 400 },
          );
        return NextResponse.json({
          factorId: data.id,
          secret: data.totp.secret,
        });
      }
      if (
        raw.action === "verify" &&
        typeof raw.code === "string" &&
        /^\d{6}$/.test(raw.code) &&
        typeof raw.factorId === "string"
      ) {
        const { data, error } = await client.auth.mfa.challengeAndVerify({
          factorId: raw.factorId,
          code: raw.code,
        });
        if (error)
          return NextResponse.json(
            { error: "Invalid authenticator code." },
            { status: 400 },
          );
        const { data: session } = await client.auth.getSession();
        if (session.session) await setSession(session.session);
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json(
        { error: "Invalid MFA request." },
        { status: 400 },
      );
    }
    if (!["login", "signup"].includes(action))
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    const raw = await readBounded(request, 4096);
    if (raw.length > 4096)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );
    const parsed = credentials.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return NextResponse.json(
        {
          error:
            "Enter a valid email and a password of at least 12 characters.",
        },
        { status: 400 },
      );
    const result =
      action === "signup"
        ? await client.auth.signUp({
            email: parsed.data.email,
            password: parsed.data.password,
            options: {
              emailRedirectTo:
                (process.env.APP_URL || "http://127.0.0.1:3000") +
                "/api/auth/callback",
            },
          })
        : await client.auth.signInWithPassword(parsed.data);
    if (result.error)
      return NextResponse.json(
        {
          error:
            action === "login"
              ? "Unable to sign in. Check your details and email confirmation."
              : "Unable to create an account. Please try again later.",
        },
        { status: 400 },
      );
    if (result.data.session) await setSession(result.data.session);
    return NextResponse.json({
      ok: true,
      confirmationRequired: !result.data.session,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Authentication is unavailable. Check the server configuration.",
      },
      { status: 503 },
    );
  }
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  const origin = process.env.APP_URL || "http://127.0.0.1:3000";
  if (!["google", "callback"].includes(action))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)
    return NextResponse.json(
      { error: "Authentication is not configured." },
      { status: 503 },
    );
  const jar = await cookies();
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      auth: {
        flowType: "pkce",
        autoRefreshToken: false,
        persistSession: false,
        storage: {
          getItem: () => jar.get("dp_pkce")?.value || null,
          setItem: (_key, value) => {
            jar.set("dp_pkce", value, { ...cookieOptions, maxAge: 600 });
          },
          removeItem: () => {
            jar.delete("dp_pkce");
          },
        },
      },
    },
  );
  if (action === "google") {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: origin + "/api/auth/callback",
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url)
      return NextResponse.json(
        { error: "Google sign-in is unavailable." },
        { status: 503 },
      );
    return NextResponse.redirect(data.url);
  }
  const code = new URL(request.url).searchParams.get("code");
  if (!code) return NextResponse.redirect(origin + "/login?auth=confirm-email");
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.session)
    return NextResponse.redirect(origin + "/login?auth=failed");
  await setSession(data.session);
  return NextResponse.redirect(origin + "/app");
}
