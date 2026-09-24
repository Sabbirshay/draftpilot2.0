import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ServiceUnavailableException,
  HttpException,
} from "@nestjs/common";
import { serviceDb, assertGenerationEnabled } from "./config";
import { checked } from "./validation";
export type Provider = "openai" | "openrouter";
export const endpoints = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};
function master() {
  const value = process.env.AI_KEY_ENCRYPTION_KEY || "";
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value)
    throw new ServiceUnavailableException(
      "Configure a 32-byte base64 AI_KEY_ENCRYPTION_KEY on the API server first.",
    );
  return key;
}
export function encryptKey(provider: Provider, key: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", master(), iv);
  cipher.setAAD(Buffer.from("draftpilot:v1:" + provider));
  const data = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((x) => x.toString("base64"))
    .join(".");
}
export function decryptKey(provider: Provider, value: string) {
  try {
    const [iv, tag, data] = value
      .split(".")
      .map((x) => Buffer.from(x, "base64"));
    const cipher = createDecipheriv("aes-256-gcm", master(), iv);
    cipher.setAAD(Buffer.from("draftpilot:v1:" + provider));
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new ServiceUnavailableException(
      "Provider credential unavailable. Reconnect it in the admin panel.",
    );
  }
}
export async function boundedJSON(response: Response) {
  if (!response.ok)
    throw new BadRequestException(
      "Provider rejected the request. Check the key, billing and model access.",
    );
  const reader = response.body?.getReader();
  if (!reader) throw new BadRequestException("Empty provider response.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2000000) throw new Error("size");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BadRequestException("Invalid provider response.");
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function discoverModels(
  provider: Provider,
  key: string,
  fetcher: typeof fetch = fetch,
) {
  const get = async (path: string) =>
    boundedJSON(
      await fetcher(endpoints[provider] + path, {
        headers: { Authorization: "Bearer " + key },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      }),
    );
  try {
    if (provider === "openrouter") {
      const account = await get("/key");
      if (account.data?.is_management_key || account.data?.is_provisioning_key)
        throw new Error("management");
    }
    const data = await get("/models");
    if (!Array.isArray(data.data)) throw new Error("catalog");
    const models = data.data
      .filter(
        (m: any) =>
          typeof m.id === "string" &&
          /^[a-zA-Z0-9][a-zA-Z0-9_./:-]{0,119}$/.test(m.id) &&
          (provider === "openai"
            ? /^(gpt-|chatgpt-|o[134](?:-|$))/.test(m.id) &&
              !/(audio|realtime|transcribe|tts|image|search)/.test(m.id)
            : m.architecture?.output_modalities?.includes("text")),
      )
      .slice(0, 1000)
      .map((m: any) => ({
        id: m.id,
        name: String(m.name || m.id).slice(0, 160),
      }));
    if (!models.length) throw new Error("empty");
    return models;
  } catch {
    throw new BadRequestException(
      "Unable to validate this key and load chat models. Check provider access and billing.",
    );
  }
}
export async function reserveProviderCall() {
  assertGenerationEnabled();
  const limit = Number(process.env.AI_DAILY_CALL_LIMIT || "1000");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000)
    throw new ServiceUnavailableException(
      "Invalid provider spending controls.",
    );
  const allowed = checked(
    await serviceDb().rpc("reserve_ai_call", { p_limit: limit }),
  );
  if (!allowed)
    throw new HttpException(
      "The platform daily AI request limit has been reached.",
      429,
    );
}
export async function activeCredential() {
  const db = serviceDb();
  const settings = checked(
    await db
      .from("platform_settings")
      .select("active_provider,active_model,active_revision")
      .eq("id", true)
      .single(),
  );
  if (!settings?.active_provider) return null;
  const row = checked(
    await db
      .from("ai_credentials")
      .select("ciphertext,revision")
      .eq("provider", settings.active_provider)
      .single(),
  );
  if (!row || row.revision !== settings.active_revision)
    throw new ServiceUnavailableException(
      "The global AI model must be tested and reactivated.",
    );
  return {
    provider: settings.active_provider as Provider,
    model: settings.active_model as string,
    key: decryptKey(settings.active_provider, row.ciphertext),
  };
}
