import { activeCredential } from "./provider-vault";
import { pipelineSettings } from "./pipeline";
import {
  Controller,
  Post,
  Req,
  Body,
  UseGuards,
  HttpException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { draftSchema, scrubPII, rankSources } from "@draftpilot/shared";
import { AuthGuard, AuthRequest, requireTeam, rate } from "./auth";
import { serviceDb, assertGenerationEnabled } from "./config";
import { parse, checked } from "./validation";
import { generateReply, embed, type Source } from "./ai";
@Controller("drafts")
@UseGuards(AuthGuard)
export class DraftsController {
  @Post("generate") async generate(
    @Req() req: AuthRequest,
    @Body() raw: unknown,
  ) {
    if (!req.principal.extension)
      throw new ForbiddenException(
        "Generate replies from your paired browser extension.",
      );
    assertGenerationEnabled();
    const pipeline = await pipelineSettings();
    if (pipeline.generation_paused)
      throw new ServiceUnavailableException(
        "Draft generation is paused by the platform administrator.",
      );
    const credential = await activeCredential();
    if (process.env.NODE_ENV === "production" && !credential)
      throw new ServiceUnavailableException(
        "Activate a tested global AI model first.",
      );
    const body = parse(draftSchema.strict(), raw),
      teamId = requireTeam(req),
      db = serviceDb();
    const settings = checked(
      await db.from("teams").select("tone").eq("id", teamId).single(),
    );
    const tone = body.tone || settings?.tone || "friendly";
    await rate("generation:" + req.principal.id, 10, 60);
    const reservation = await db.rpc("reserve_draft", {
      p_team: teamId,
      p_user: req.principal.id,
      p_request: body.requestId,
      p_channel: body.channel,
    });
    if (reservation.error) {
      if (reservation.error.message.includes("USER_QUOTA_EXCEEDED"))
        throw new HttpException(
          "You have reached your individual monthly draft limit.",
          429,
        );
      if (
        /USER_RESTRICTED|FORBIDDEN|WORKSPACE_DISABLED/.test(
          reservation.error.message,
        )
      )
        throw new ForbiddenException(
          "Drafting is restricted for this account or workspace.",
        );
      if (reservation.error.message.includes("GENERATION_PAUSED"))
        throw new ServiceUnavailableException("Draft generation is paused.");
      if (reservation.error.message.includes("QUOTA_EXCEEDED"))
        throw new HttpException(
          "Your workspace has reached its monthly draft limit.",
          429,
        );
      throw new ServiceUnavailableException("Unable to reserve this draft.");
    }
    const { record, existing } = reservation.data;
    if (existing) {
      if (["draft", "reviewed"].includes(record.status))
        return {
          id: record.id,
          draft: record.generated_draft,
          source: record.source,
          sources: record.sources,
        };
      throw new ConflictException(
        "This request is already pending or failed. Use a new request ID to retry.",
      );
    }
    try {
      const [macroResult, chunkResult, docResult] = await Promise.all([
        db
          .from("macros")
          .select("id,name,content")
          .eq("team_id", teamId)
          .limit(200),
        db
          .from("document_chunks")
          .select("id,document_id,chunk_text")
          .eq("team_id", teamId)
          .limit(600),
        db
          .from("knowledge_documents")
          .select("id,name")
          .eq("team_id", teamId)
          .eq("status", "ready")
          .limit(200),
      ]);
      const macros = checked(macroResult) || [],
        chunks = checked(chunkResult) || [],
        docs = checked(docResult) || [];
      const all: Source[] = [
        ...macros,
        ...chunks.map((c) => ({
          id: c.id,
          name:
            docs.find((d) => d.id === c.document_id)?.name ||
            "Knowledge source",
          content: c.chunk_text,
        })),
      ];
      const clean = scrubPII(body.threadContent).text;
      let sources: Source[] = rankSources(clean, all, 4);
      // When embeddings are configured, combine semantic matches with explicit macro selection.
      const vector = pipeline.ai_config.embeddings_enabled
        ? await embed([clean])
        : null;
      if (vector) {
        const matches = await db.rpc("match_document_chunks", {
          query_embedding: vector[0],
          p_team_id: teamId,
          match_count: 4,
        });
        if (!matches.error && Array.isArray(matches.data)) {
          const semantic = matches.data
            .filter((m: { similarity: number }) => m.similarity > 0.3)
            .map(
              (m: { id: string; document_id: string; chunk_text: string }) => ({
                id: m.id,
                name:
                  docs.find((d) => d.id === m.document_id)?.name ||
                  "Knowledge source",
                content: m.chunk_text,
              }),
            );
          if (semantic.length)
            sources = [...semantic, ...sources]
              .filter((s, i, a) => a.findIndex((v) => v.id === s.id) === i)
              .slice(0, 4);
        }
      }
      if (body.macroId) {
        const chosen = macros.find((m) => m.id === body.macroId);
        if (chosen)
          sources = [
            chosen,
            ...sources.filter((s) => s.id !== chosen.id),
          ].slice(0, 4);
      }
      const result = await generateReply(
        {
          thread: clean,
          tone,
          instruction: scrubPII(body.instruction).text,
          sources,
        },
        fetch,
        {
          ...pipeline.ai_config,
          managed: true,
          ...(credential ? { credential } : {}),
          max_output_tokens: pipeline.max_output_tokens,
        },
      );
      const refs = sources.map((s) => ({ id: s.id, name: s.name }));
      checked(
        await db
          .from("draft_history")
          .update({
            generated_draft: result.draft,
            source: result.source,
            sources: refs,
            status: "draft",
          })
          .eq("id", record.id)
          .eq("team_id", teamId),
      );
      return {
        id: record.id,
        ...result,
        sources: refs,
        reviewRequired: true,
        tone,
      };
    } catch (error) {
      await db.rpc("fail_draft", { p_team: teamId, p_id: record.id });
      throw error;
    }
  }
}
