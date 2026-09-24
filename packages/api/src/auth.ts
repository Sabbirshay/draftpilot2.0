import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Request } from "express";
import { createHash } from "node:crypto";
import { serviceDb } from "./config";
export type Principal = {
  id: string;
  email: string;
  teamId: string;
  role: string;
  extension: boolean;
  platformAdmin: boolean;
  aal2: boolean;
};
export type AuthRequest = Request & { principal: Principal; bearer: string };
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function rate(key: string, limit = 60, seconds = 60) {
  const { data, error } = await serviceDb().rpc("consume_rate_limit", {
    p_key: hash(key),
    p_limit: limit,
    p_seconds: seconds,
  });
  if (error)
    throw new ServiceUnavailableException("Rate limit service unavailable.");
  if (!data)
    throw new HttpException(
      "Too many requests. Please try again shortly.",
      429,
    );
}
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.headers.authorization?.match(
      /^Bearer ([A-Za-z0-9._-]{20,4096})$/,
    )?.[1];
    if (!token) throw new UnauthorizedException("Sign in to continue.");
    const db = serviceDb();
    let user;
    let extension = false;
    if (token.startsWith("dp_")) {
      extension = true;
      const { data: t, error } = await db
        .from("extension_tokens")
        .select("user_id,team_id,created_at")
        .eq("token_hash", hash(token))
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (error || !t)
        throw new UnauthorizedException(
          "Extension session expired. Reconnect from your workspace.",
        );
      const result = await db.auth.admin.getUserById(t.user_id);
      user = result.data.user;
      if (!user) throw new UnauthorizedException();
      if (
        user.last_sign_in_at &&
        Date.parse(user.last_sign_in_at) > Date.parse(t.created_at)
      )
        throw new UnauthorizedException(
          "Your account signed in again. Reconnect the extension from your workspace.",
        );
    } else {
      const result = await db.auth.getUser(token);
      if (result.error || !result.data.user)
        throw new UnauthorizedException(
          "Session expired. Please sign in again.",
        );
      user = result.data.user;
    }
    if (!user.email || !user.email_confirmed_at)
      throw new ForbiddenException("Confirm your email before continuing.");
    const [
      { data: ban, error: banError },
      { data: profile, error: profileError },
    ] = await Promise.all([
      db
        .from("banned_emails")
        .select("email")
        .eq("email", user.email.toLowerCase())
        .maybeSingle(),
      db.from("users").select("team_id,role").eq("id", user.id).maybeSingle(),
    ]);
    if (banError || profileError)
      throw new ServiceUnavailableException(
        "Account verification unavailable.",
      );
    if (ban) throw new ForbiddenException("Account disabled.");
    {
      const control = await db
        .from("user_controls")
        .select("suspended")
        .eq("user_id", user.id)
        .maybeSingle();
      if (control.error)
        throw new ServiceUnavailableException(
          "Account verification unavailable.",
        );
      if (control.data?.suspended)
        throw new ForbiddenException("Account suspended. Contact support.");
    }
    let aal2 = false;
    try {
      aal2 =
        JSON.parse(
          Buffer.from(token.split(".")[1] || "", "base64url").toString(),
        ).aal === "aal2";
    } catch {}
    req.principal = {
      id: user.id,
      email: user.email,
      teamId: profile?.team_id || "",
      role: profile?.role || "member",
      extension,
      platformAdmin: !extension && user.app_metadata?.platform_admin === true,
      aal2,
    };
    req.bearer = token;
    if (extension && !/^\/drafts(?:\/generate)?(?:\?|$)/.test(req.path))
      throw new ForbiddenException(
        "This extension token is limited to drafting.",
      );
    const adminOperation =
      req.path.startsWith("/admin/") && req.principal.platformAdmin && aal2;
    if (profile && !adminOperation) {
      const { data: team, error } = await db
        .from("teams")
        .select("frozen")
        .eq("id", profile.team_id)
        .single();
      if (error) throw new ServiceUnavailableException();
      if (team.frozen) throw new ForbiddenException("Workspace is suspended.");
    }
    if (profile && !adminOperation) {
      const seat = await db.rpc("has_workspace_seat", {
        p_team: profile.team_id,
        p_user: user.id,
      });
      if (seat.error)
        throw new ServiceUnavailableException("Seat verification unavailable.");
      if (!seat.data)
        throw new ForbiddenException(
          "This workspace needs another paid seat. Ask the owner to update the plan.",
        );
    }
    await rate("user:" + user.id);
    return true;
  }
}
export function requireTeam(req: AuthRequest) {
  if (!req.principal.teamId)
    throw new ForbiddenException("Create or join a workspace first.");
  return req.principal.teamId;
}
export function requireRole(req: AuthRequest, roles = ["owner", "admin"]) {
  requireTeam(req);
  if (req.principal.extension || !roles.includes(req.principal.role))
    throw new ForbiddenException("Your role cannot perform this action.");
}
export function requirePlatformAdmin(req: AuthRequest) {
  if (
    req.principal.extension ||
    !req.principal.platformAdmin ||
    !req.principal.aal2
  )
    throw new ForbiddenException(
      "Platform administration requires an administrator account with MFA.",
    );
}
export async function audit(
  req: AuthRequest,
  action: string,
  resource?: string,
) {
  const { error } = await serviceDb()
    .from("audit_events")
    .insert({
      team_id: req.principal.teamId || null,
      actor_id: req.principal.id,
      action,
      resource_id: resource,
    });
  if (error) throw new ServiceUnavailableException("Audit log unavailable.");
}
