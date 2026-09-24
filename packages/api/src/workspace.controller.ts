import { pipelineSettings } from "./pipeline";
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { scrubPII } from "@draftpilot/shared";
import {
  AuthGuard,
  AuthRequest,
  requireTeam,
  requireRole,
  audit,
  hash,
  rate,
} from "./auth";
import { serviceDb, config } from "./config";
import { embed } from "./ai";
import {
  parse,
  uuid,
  checked,
  found,
  macroSchema,
  settingsSchema,
} from "./validation";
@Controller()
@UseGuards(AuthGuard)
export class WorkspaceController {
  @Post("auth/provision") async provision(
    @Req() req: AuthRequest,
    @Body() raw: unknown,
  ) {
    const body = parse(
      z.object({ name: z.string().trim().min(1).max(80) }).strict(),
      raw,
    );
    const id = checked(
      await serviceDb().rpc("provision_workspace", {
        p_user: req.principal.id,
        p_email: req.principal.email,
        p_name: body.name,
      }),
    );
    return { teamId: id };
  }
  @Get("workspace") async workspace(@Req() req: AuthRequest) {
    const teamId = requireTeam(req),
      db = serviceDb(),
      month = new Date().toISOString().slice(0, 7) + "-01";
    const result = await Promise.all([
      db
        .from("teams")
        .select(
          "id,name,plan,monthly_draft_limit,tone,retention_days,seat_limit",
        )
        .eq("id", teamId)
        .single(),
      db
        .from("users")
        .select("id,email,role,full_name")
        .eq("id", req.principal.id)
        .single(),
      db
        .from("usage")
        .select("draft_count")
        .eq("team_id", teamId)
        .eq("month", month)
        .maybeSingle(),
      db
        .from("macros")
        .select("id,name,content,category,tags,usage_count")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("knowledge_documents")
        .select("id,name,status,chunks_count,created_at")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("draft_history")
        .select("id,generated_draft,created_at,source,channel,status,sources")
        .eq("team_id", teamId)
        .in("status", ["draft", "reviewed"])
        .order("created_at", { ascending: false })
        .limit(100),
      db.from("users").select("id,email,role,full_name").eq("team_id", teamId),
    ]);
    const [team, user, usage, macros, documents, history, members] = result.map(
      (r) => checked(r as { data: any; error: unknown }),
    );
    const [control, individualUsage] = await Promise.all([
      db
        .from("user_controls")
        .select("monthly_limit,generation_blocked")
        .eq("user_id", req.principal.id)
        .maybeSingle(),
      db
        .from("user_usage")
        .select("draft_count")
        .eq("user_id", req.principal.id)
        .eq("month", month)
        .maybeSingle(),
    ]);
    const limits = checked(control),
      used = checked(individualUsage);
    return {
      platformAdmin: req.principal.platformAdmin,
      userQuota: {
        limit: limits?.monthly_limit ?? null,
        used: used?.draft_count || 0,
        generationBlocked: limits?.generation_blocked || false,
      },
      team,
      user,
      usage: usage?.draft_count || 0,
      macros,
      documents,
      history,
      members,
    };
  }
  @Patch("workspace") async settings(
    @Req() req: AuthRequest,
    @Body() raw: unknown,
  ) {
    requireRole(req, ["owner"]);
    const body = parse(settingsSchema, raw);
    await audit(req, "workspace.update");
    checked(
      await serviceDb().from("teams").update(body).eq("id", requireTeam(req)),
    );
    return { ok: true };
  }
  @Post("macros") async addMacro(
    @Req() req: AuthRequest,
    @Body() raw: unknown,
  ) {
    requireRole(req);
    const body = parse(macroSchema, raw);
    await audit(req, "macro.create");
    return checked(
      await serviceDb()
        .from("macros")
        .insert({
          ...body,
          content: scrubPII(body.content).text,
          team_id: requireTeam(req),
        })
        .select("id")
        .single(),
    );
  }
  @Patch("macros/:id") async editMacro(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    requireRole(req);
    const body = parse(macroSchema, raw);
    await audit(req, "macro.update", uuid(id));
    return found(
      await serviceDb()
        .from("macros")
        .update({ ...body, content: scrubPII(body.content).text })
        .eq("id", id)
        .eq("team_id", requireTeam(req))
        .select("id")
        .maybeSingle(),
    );
  }
  @Delete("macros/:id") async deleteMacro(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    requireRole(req);
    await audit(req, "macro.delete", uuid(id));
    return found(
      await serviceDb()
        .from("macros")
        .delete()
        .eq("id", id)
        .eq("team_id", requireTeam(req))
        .select("id")
        .maybeSingle(),
    );
  }
  @Post("knowledge") async knowledge(
    @Req() req: AuthRequest,
    @Body() raw: unknown,
  ) {
    requireRole(req);
    await rate("knowledge:" + req.principal.teamId, 10, 3600);
    const body = parse(
      z
        .object({
          name: z.string().trim().min(1).max(100),
          content: z.string().trim().min(20).max(100000),
        })
        .strict(),
      raw,
    );
    const text = scrubPII(body.content).text;
    const chunks = [];
    for (let i = 0; i < text.length; i += 1100)
      chunks.push(text.slice(i, i + 1200));
    await audit(req, "knowledge.create");
    const id = checked(
      await serviceDb().rpc("add_knowledge", {
        p_team: requireTeam(req),
        p_name: body.name,
        p_chunks: chunks,
      }),
    );
    const pipeline = await pipelineSettings();
    const vectors = pipeline.ai_config.embeddings_enabled
      ? await embed(chunks)
      : null;
    if (vectors) {
      const rows = checked(
        await serviceDb()
          .from("document_chunks")
          .select("id,chunk_index,chunk_text")
          .eq("document_id", id)
          .eq("team_id", requireTeam(req)),
      );
      checked(
        await serviceDb()
          .from("document_chunks")
          .upsert(
            (rows || []).map((row) => ({
              ...row,
              document_id: id,
              team_id: requireTeam(req),
              embedding: vectors[row.chunk_index],
            })),
          ),
      );
    }
    return { id };
  }
  @Delete("knowledge/:id") async deleteKnowledge(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    requireRole(req);
    await audit(req, "knowledge.delete", uuid(id));
    return found(
      await serviceDb()
        .from("knowledge_documents")
        .delete()
        .eq("id", id)
        .eq("team_id", requireTeam(req))
        .select("id")
        .maybeSingle(),
    );
  }
  @Patch("drafts/:id") async updateDraft(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    const body = parse(
      z
        .object({
          generated_draft: z.string().min(1).max(12000),
          status: z.literal("reviewed"),
        })
        .strict(),
      raw,
    );
    uuid(id);
    return found(
      await serviceDb()
        .from("draft_history")
        .update({
          ...body,
          generated_draft: scrubPII(body.generated_draft).text,
        })
        .eq("id", id)
        .eq("team_id", requireTeam(req))
        .in("status", ["draft", "reviewed"])
        .select("id")
        .maybeSingle(),
    );
  }
  @Delete("drafts/:id") async deleteDraft(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    uuid(id);
    await audit(req, "draft.delete", id);
    return found(
      await serviceDb()
        .from("draft_history")
        .delete()
        .eq("id", id)
        .eq("team_id", requireTeam(req))
        .select("id")
        .maybeSingle(),
    );
  }
  @Post("team/invites") async invite(
    @Req() req: AuthRequest,
    @Body() raw: unknown,
  ) {
    requireRole(req);
    await rate("invites:" + req.principal.id, 10, 3600);
    const body = parse(
      z
        .object({
          email: z.email().max(254),
          role: z.enum(["admin", "member"]),
        })
        .strict(),
      raw,
    );
    if (body.role === "admin" && req.principal.role !== "owner")
      throw new ForbiddenException("Only owners can invite admins.");
    const token = randomBytes(32).toString("base64url");
    await audit(req, "team.invite");
    checked(
      await serviceDb()
        .from("team_invites")
        .insert({
          team_id: requireTeam(req),
          email: body.email.toLowerCase(),
          role: body.role,
          token_hash: hash(token),
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        }),
    );
    return { url: config.appUrl + "/invite#" + token };
  }
  @Post("team/accept") async accept(
    @Req() req: AuthRequest,
    @Body() raw: unknown,
  ) {
    const body = parse(
      z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(),
      raw,
    );
    const { data, error } = await serviceDb().rpc("accept_invite", {
      p_hash: hash(body.token),
      p_user: req.principal.id,
      p_email: req.principal.email,
    });
    if (error)
      throw new BadRequestException(
        error.message.includes("NO_SEAT_AVAILABLE")
          ? "No seat is available. Ask the workspace owner to add seats."
          : "Invite is invalid, expired, or this account already belongs to a workspace.",
      );
    return { teamId: data };
  }
  @Patch("team/members/:id") async role(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    requireRole(req, ["owner"]);
    uuid(id);
    const body = parse(
      z.object({ role: z.enum(["admin", "member"]) }).strict(),
      raw,
    );
    await audit(req, "team.role.change", id);
    const { error } = await serviceDb().rpc("manage_member", {
      p_team: requireTeam(req),
      p_actor: req.principal.id,
      p_target: id,
      p_action: "role",
      p_role: body.role,
    });
    if (error) throw new ForbiddenException("Cannot change this membership.");
    return { ok: true };
  }
  @Delete("team/members/:id") async removeMember(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    requireRole(req);
    uuid(id);
    await audit(req, "team.member.remove", id);
    const { error } = await serviceDb().rpc("manage_member", {
      p_team: requireTeam(req),
      p_actor: req.principal.id,
      p_target: id,
      p_action: "remove",
    });
    if (error) throw new ForbiddenException("Cannot remove this membership.");
    return { ok: true };
  }
  @Post("extension/pair") async pair(@Req() req: AuthRequest) {
    requireTeam(req);
    await rate("pair:" + req.principal.id, 5, 300);
    const code = randomBytes(24).toString("base64url");
    checked(
      await serviceDb()
        .from("extension_codes")
        .insert({
          code_hash: hash(code),
          team_id: req.principal.teamId,
          user_id: req.principal.id,
          expires_at: new Date(Date.now() + 5 * 60000).toISOString(),
        }),
    );
    return { code, expiresIn: 300 };
  }
  @Get("extension/sessions") async sessions(@Req() req: AuthRequest) {
    return checked(
      await serviceDb()
        .from("extension_tokens")
        .select("id,name,expires_at,created_at")
        .eq("user_id", req.principal.id)
        .eq("team_id", requireTeam(req))
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString()),
    );
  }
  @Delete("extension/sessions") async revokeAll(@Req() req: AuthRequest) {
    checked(
      await serviceDb()
        .from("extension_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", req.principal.id)
        .is("revoked_at", null),
    );
    checked(
      await serviceDb()
        .from("extension_codes")
        .delete()
        .eq("user_id", req.principal.id),
    );
    return { ok: true };
  }
  @Delete("extension/sessions/:id") async revoke(
    @Req() req: AuthRequest,
    @Param("id") id: string,
  ) {
    uuid(id);
    checked(
      await serviceDb()
        .from("extension_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", req.principal.id)
        .eq("team_id", requireTeam(req)),
    );
    return { ok: true };
  }
}
