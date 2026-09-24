import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod";
import { AuthGuard, AuthRequest, requirePlatformAdmin, rate } from "./auth";
import { serviceDb, assertGenerationEnabled } from "./config";
import { checked, parse, uuid } from "./validation";
import { aiConfigSchema, pipelineSettings } from "./pipeline";
import { generateReply } from "./ai";
import { randomUUID } from "node:crypto";
import {
  encryptKey,
  decryptKey,
  discoverModels,
  type Provider,
} from "./provider-vault";
const providerSchema = z.enum(["openai", "openrouter"]);
const reason = z.string().trim().min(8).max(300);
const override = z
  .object({
    plan: z.enum(["free", "team"]),
    seats: z.number().int().min(1).max(100),
    limit: z.number().int().min(0).max(1000000),
  })
  .strict();
@Controller("admin")
@UseGuards(AuthGuard)
export class AdminController {
  @Get("providers") async providers(@Req() req: AuthRequest) {
    requirePlatformAdmin(req);
    const credentials = checked(
      await serviceDb()
        .from("ai_credentials")
        .select("provider,revision,models,tested_model,tested_at,updated_at"),
    );
    const active = checked(
      await serviceDb()
        .from("platform_settings")
        .select("active_provider,active_model,active_revision")
        .eq("id", true)
        .single(),
    );
    return {
      credentials,
      active,
      encryptionReady:
        Buffer.from(process.env.AI_KEY_ENCRYPTION_KEY || "", "base64")
          .length === 32,
      dailyCallLimit: Number(process.env.AI_DAILY_CALL_LIMIT || "1000"),
    };
  }
  @Post("providers/:provider/connect") async connectProvider(
    @Req() req: AuthRequest,
    @Param("provider") rawProvider: string,
    @Body() raw: unknown,
  ) {
    requirePlatformAdmin(req);
    const provider = parse(providerSchema, rawProvider);
    const body = parse(
      z
        .object({
          key: z
            .string()
            .trim()
            .min(20)
            .max(512)
            .regex(/^[!-~]+$/),
          reason,
        })
        .strict(),
      raw,
    );
    await rate("provider-connect:" + req.principal.id, 3, 60);
    const ciphertext = encryptKey(provider, body.key);
    const models = await discoverModels(provider, body.key);
    const revision = randomUUID();
    checked(
      await serviceDb().rpc("admin_ai_change", {
        p_actor: req.principal.id,
        p_action: "save",
        p_provider: provider,
        p_revision: revision,
        p_payload: { ciphertext, models },
        p_reason: body.reason,
      }),
    );
    return { ok: true, models, revision };
  }
  @Post("providers/:provider/test") async testProvider(
    @Req() req: AuthRequest,
    @Param("provider") rawProvider: string,
    @Body() raw: unknown,
  ) {
    requirePlatformAdmin(req);
    assertGenerationEnabled();
    const provider = parse(providerSchema, rawProvider);
    const body = parse(
      z
        .object({ revision: z.uuid(), model: z.string().min(1).max(120) })
        .strict(),
      raw,
    );
    await rate("pipeline-test:" + req.principal.id, 3, 60);
    const row = checked(
      await serviceDb()
        .from("ai_credentials")
        .select("ciphertext,revision,models")
        .eq("provider", provider)
        .single(),
    );
    if (
      !row ||
      row.revision !== body.revision ||
      !row.models.some((m: { id: string }) => m.id === body.model)
    )
      throw new BadRequestException(
        "Reload the provider catalog and choose an available model.",
      );
    const started = Date.now();
    const result = await generateReply(
      {
        thread: "What is the return window?",
        tone: "concise",
        instruction: "",
        sources: [
          {
            id: "test",
            name: "Test policy",
            content: "Returns are accepted within 37 days.",
          },
        ],
      },
      fetch,
      {
        ...aiConfigSchema.parse({}),
        max_output_tokens: 256,
        fallback_enabled: false,
        managed: true,
        credential: {
          provider,
          model: body.model,
          key: decryptKey(provider, row.ciphertext),
        },
      },
    );
    checked(
      await serviceDb().rpc("admin_ai_change", {
        p_actor: req.principal.id,
        p_action: "test",
        p_provider: provider,
        p_revision: body.revision,
        p_payload: { model: body.model },
        p_reason: "Live synthetic model verification",
      }),
    );
    return { ...result, liveProvider: true, durationMs: Date.now() - started };
  }
  @Post("providers/:provider/activate") async activateProvider(
    @Req() req: AuthRequest,
    @Param("provider") rawProvider: string,
    @Body() raw: unknown,
  ) {
    requirePlatformAdmin(req);
    const provider = parse(providerSchema, rawProvider);
    const body = parse(
      z
        .object({
          revision: z.uuid(),
          model: z.string().min(1).max(120),
          reason,
        })
        .strict(),
      raw,
    );
    const result = await serviceDb().rpc("admin_ai_change", {
      p_actor: req.principal.id,
      p_action: "activate",
      p_provider: provider,
      p_revision: body.revision,
      p_payload: { model: body.model },
      p_reason: body.reason,
    });
    if (result.error)
      throw new BadRequestException(
        "Run a successful live test for this model and current key within the last hour before activation.",
      );
    return { ok: true };
  }
  @Get("overview") async overview(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    requirePlatformAdmin(req);
    const q = parse(
      z
        .object({
          q: z.string().trim().max(100).default(""),
          offset: z.coerce.number().int().min(0).max(1000000).default(0),
        })
        .strict(),
      query,
    );
    const [directory, command] = await Promise.all([
      serviceDb().rpc("admin_overview", { p_query: q.q, p_offset: q.offset }),
      serviceDb().rpc("admin_live_metrics", {}),
    ]);
    return {
      ...checked(directory),
      command: {
        ...checked(command),
        uptimeSeconds: Math.floor(process.uptime()),
        observedAt: new Date().toISOString(),
        service: "operational",
      },
    };
  }
  async change(
    req: AuthRequest,
    kind: string,
    id: string | null,
    changes: unknown,
    why: string,
  ) {
    const result = await serviceDb().rpc("admin_change", {
      p_actor: req.principal.id,
      p_kind: kind,
      p_target: id,
      p_changes: changes,
      p_reason: why,
    });
    if (result.error?.message.includes("NOT_FOUND"))
      throw new NotFoundException("Account or workspace not found.");
    if (result.error?.message.includes("SELF_RESTRICTION"))
      throw new BadRequestException(
        "You cannot restrict your own administrator account.",
      );
    checked(result);
    return { ok: true };
  }
  @Patch("users/:id") async user(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    requirePlatformAdmin(req);
    uuid(id);
    const { reason: why, ...body } = parse(
      z
        .object({
          reason,
          suspended: z.boolean().optional(),
          generation_blocked: z.boolean().optional(),
          monthly_limit: z
            .number()
            .int()
            .min(0)
            .max(1000000)
            .nullable()
            .optional(),
        })
        .strict(),
      raw,
    );
    if (!Object.keys(body).length)
      throw new BadRequestException("Choose a change.");
    return this.change(req, "user", id, body, why);
  }
  @Patch("workspaces/:id") async workspace(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() raw: unknown,
  ) {
    requirePlatformAdmin(req);
    uuid(id);
    const { reason: why, ...body } = parse(
      z
        .object({
          reason,
          frozen: z.boolean().optional(),
          manual_override: override.nullable().optional(),
        })
        .strict(),
      raw,
    );
    if (!Object.keys(body).length)
      throw new BadRequestException("Choose a change.");
    return this.change(req, "workspace", id, body, why);
  }
  @Get("pipeline") async pipeline(@Req() req: AuthRequest) {
    requirePlatformAdmin(req);
    const stored =
      checked(await serviceDb().from("ai_credentials").select("provider")) ||
      [];
    return {
      ...(await pipelineSettings()),
      environmentPaused: process.env.GENERATION_PAUSED === "1",
      integrations: {
        openai:
          stored.some((c) => c.provider === "openai") ||
          !!process.env.OPENAI_API_KEY,
        openrouter:
          stored.some((c) => c.provider === "openrouter") ||
          !!process.env.OPENROUTER_API_KEY,
        stripe: !!process.env.STRIPE_SECRET_KEY,
        stripePrice: !!process.env.STRIPE_TEAM_PRICE_ID,
        stripeWebhook: !!process.env.STRIPE_WEBHOOK_SECRET,
      },
    };
  }
  @Patch("pipeline") async updatePipeline(
    @Req() req: AuthRequest,
    @Body() raw: unknown,
  ) {
    requirePlatformAdmin(req);
    const { reason: why, ...body } = parse(
      z
        .object({
          reason,
          generation_paused: z.boolean(),
          max_output_tokens: z.number().int().min(100).max(1200),
          ai_config: aiConfigSchema,
        })
        .strict(),
      raw,
    );
    return this.change(req, "pipeline", null, body, why);
  }
  @Post("pipeline/test") async test(
    @Req() req: AuthRequest,
    @Body() raw?: unknown,
  ) {
    requirePlatformAdmin(req);
    assertGenerationEnabled();
    await rate("pipeline-test:" + req.principal.id, 3, 60);
    const settings = await pipelineSettings();
    if (settings.generation_paused)
      throw new BadRequestException("Resume generation before testing.");
    const input = parse(
      z
        .object({
          question: z
            .string()
            .trim()
            .min(8)
            .max(4000)
            .default("What is the example return window?"),
          reference: z
            .string()
            .trim()
            .min(10)
            .max(8000)
            .default("Example returns are accepted within 37 days."),
          tone: z
            .enum(["friendly", "professional", "empathetic", "concise"])
            .default("concise"),
        })
        .strict(),
      raw ?? {},
    );
    const started = Date.now();
    const result = await generateReply(
      {
        thread: input.question,
        tone: input.tone,
        instruction: "",
        sources: [
          {
            id: "synthetic",
            name: "Synthetic test policy",
            content: input.reference,
          },
        ],
      },
      fetch,
      {
        ...settings.ai_config,
        max_output_tokens: settings.max_output_tokens,
        managed: true,
      },
    );
    // Admin-only test content; no credentials or request content is logged.
    return {
      ...result,
      durationMs: Date.now() - started,
      liveProvider: result.source !== "Local template",
    };
  }
}
