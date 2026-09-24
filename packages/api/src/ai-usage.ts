import { randomUUID } from "node:crypto";
import { ServiceUnavailableException } from "@nestjs/common";
import { serviceDb } from "./config";
import { checked } from "./validation";
import { boundedJSON } from "./provider-vault";

export class UsageUnavailable extends ServiceUnavailableException {
  constructor() {
    super("AI usage accounting is unavailable. Please retry later.");
  }
}
const tokenCount = (value: unknown): number | null =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= 1e9
    ? value
    : null;
type Rate = { input: number; cached: number; output: number };
// USD per million tokens, standard text pricing. Versioned estimates, never invoices.
// Official model pages verified 2026-09-24. Exact model matching avoids guessing prices.
const defaults: Record<string, Rate> = {
  "gpt-4o-mini": { input: 0.15, cached: 0.075, output: 0.6 },
  "gpt-4o-mini-2024-07-18": { input: 0.15, cached: 0.075, output: 0.6 },
  "text-embedding-3-small": { input: 0.02, cached: 0.02, output: 0 },
};
export function usageValues(provider: string, model: string, result: any) {
  const usage = result?.usage;
  const input = tokenCount(usage?.prompt_tokens),
    output = tokenCount(
      usage?.completion_tokens ??
        (model === "text-embedding-3-small" ? 0 : undefined),
    );
  const reportedTotal = tokenCount(usage?.total_tokens);
  const total =
    reportedTotal ??
    (input !== null && output !== null ? input + output : null);
  let cost: number | null = null,
    basis = "unknown";
  if (
    provider === "openrouter" &&
    typeof usage?.cost === "number" &&
    Number.isFinite(usage.cost) &&
    usage.cost >= 0 &&
    usage.cost <= 1e6
  ) {
    cost = usage.cost;
    basis = "reported";
  } else if (provider === "openai" && input !== null && output !== null) {
    let rates = defaults;
    try {
      rates = {
        ...defaults,
        ...JSON.parse(process.env.AI_USAGE_PRICES_JSON || "{}"),
      };
    } catch {
      /* Unknown pricing remains visible. */
    }
    const rate = Object.hasOwn(rates, model) ? rates[model] : null;
    const cached = Math.min(
      input,
      tokenCount(usage?.prompt_tokens_details?.cached_tokens) ?? 0,
    );
    if (
      rate &&
      [rate.input, rate.cached, rate.output].every(
        (n) =>
          typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1e6,
      )
    ) {
      cost =
        ((input - cached) * rate.input +
          cached * rate.cached +
          output * rate.output) /
        1e6;
      basis = "estimated";
    }
  }
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    cost_usd: cost,
    cost_basis: basis,
  };
}

/** Reserve a durable event BEFORE spending; finish it once, without storing content or keys. */
export async function measuredJSON(
  provider: string,
  model: string,
  kind: "chat" | "embedding",
  request: () => Promise<Response>,
) {
  const id = randomUUID();
  try {
    checked(
      await serviceDb()
        .from("ai_usage_events")
        .insert({ id, provider, model, kind }),
    );
  } catch {
    throw new UsageUnavailable();
  }
  let result: any,
    success = false;
  try {
    result = await boundedJSON(await request());
    success = true;
    return result;
  } finally {
    try {
      checked(
        await serviceDb()
          .from("ai_usage_events")
          .update({
            ...usageValues(provider, model, result),
            status: success ? "completed" : "failed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", id),
      );
    } catch {
      throw new UsageUnavailable();
    }
  }
}
