import "server-only";
import { cookies } from "next/headers";
import { isGoogleAdministrator } from "@draftpilot/shared";
import { authClient } from "./server-auth";

export async function adminSession() {
  const token = (await cookies()).get("dp_access")?.value;
  if (!token) return null;
  const { data, error } = await authClient().auth.getUser(token);
  if (error || !data.user) return null;
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    if (!isGoogleAdministrator(data.user, claims)) return null;
    return { aal2: claims.aal === "aal2" };
  } catch { return null; }
}
