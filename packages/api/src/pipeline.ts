import { z } from "zod";
import { ServiceUnavailableException } from "@nestjs/common";
import { serviceDb } from "./config";
import { checked } from "./validation";
const model = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_./:-]*$/);
export const aiConfigSchema = z
  .object({
    openai_enabled: z.boolean().default(true),
    openrouter_enabled: z.boolean().default(true),
    embeddings_enabled: z.boolean().default(true),
    fallback_enabled: z.boolean().default(true),
    openai_model: model.default(process.env.OPENAI_MODEL || "gpt-4o-mini"),
    router_models: z
      .array(model)
      .min(1)
      .max(2)
      .default(
        (process.env.OPENROUTER_MODELS || "openai/gpt-4o-mini")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 2),
      ),
    temperature: z.number().min(0).max(1).default(0.3),
  })
  .strict();
export type AIPolicy = z.infer<typeof aiConfigSchema> & {
  max_output_tokens: number;
  managed?: boolean;
  credential?: {
    provider: "openai" | "openrouter";
    key: string;
    model: string;
  };
};
export async function pipelineSettings() {
  const value = checked(
    await serviceDb()
      .from("platform_settings")
      .select("generation_paused,max_output_tokens,ai_config")
      .eq("id", true)
      .single(),
  );
  if (!value) throw new ServiceUnavailableException("AI settings unavailable.");
  const parsed = aiConfigSchema.safeParse(value.ai_config);
  if (!parsed.success)
    throw new ServiceUnavailableException(
      "AI settings are invalid. Contact your administrator.",
    );
  return { ...value, ai_config: parsed.data };
}
