import { createClient } from "@supabase/supabase-js";
import { ServiceUnavailableException } from "@nestjs/common";
export const config = {
  appUrl: process.env.APP_URL || "http://127.0.0.1:3000",
  apiUrl: process.env.API_PUBLIC_URL || "http://localhost:3001",
  supabaseUrl: process.env.SUPABASE_URL || "",
  anonKey: process.env.SUPABASE_ANON_KEY || "",
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
};
export const configured = !!(
  config.supabaseUrl &&
  config.anonKey &&
  config.serviceKey
);
export function serviceDb() {
  if (!configured)
    throw new ServiceUnavailableException(
      "Connect Supabase to enable this service.",
    );
  return createClient(config.supabaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function scopedDb(token: string) {
  return createClient(config.supabaseUrl, config.anonKey, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function assertProduction() {
  if (process.env.NODE_ENV === "production") {
    const required = [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "APP_URL",
      "API_PUBLIC_URL",
    ];
    for (const name of required)
      if (!process.env[name])
        throw new Error(`Missing required setting: ${name}`);
    for (const name of ["APP_URL", "API_PUBLIC_URL", "SUPABASE_URL"])
      if (new URL(process.env[name]!).protocol !== "https:")
        throw new Error(`${name} must use HTTPS`);
    if (
      Buffer.from(process.env.AI_KEY_ENCRYPTION_KEY || "", "base64").length !==
      32
    )
      throw new Error("Configure AI_KEY_ENCRYPTION_KEY before launching.");
  }
}

export function assertGenerationEnabled() {
  if (process.env.GENERATION_PAUSED === "1")
    throw new ServiceUnavailableException(
      "Draft generation is temporarily paused. Please try again later.",
    );
}
