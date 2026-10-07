declare const __API_URL__: string;
// Keep the persistent device credential out of content scripts and sync storage.
async function secureStorage() {
  await chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"});
}
export async function connectionToken(): Promise<string | undefined> {
  await secureStorage();
  const current = (await chrome.storage.local.get("dp_token")).dp_token;
  if (typeof current === "string" && current) return current;
  const legacy = (await chrome.storage.session.get("dp_token")).dp_token;
  if (typeof legacy === "string" && legacy) {
    await chrome.storage.local.set({dp_token: legacy});
    await chrome.storage.session.remove("dp_token");
  }
  return typeof legacy === "string" ? legacy : undefined;
}
export async function saveConnection(value: string) {
  await secureStorage();
  await chrome.storage.local.set({dp_token: value});
  await chrome.storage.session.remove("dp_token");
}
export async function clearConnection() {
  await chrome.storage.session.remove("dp_token");
  await chrome.storage.local.remove("dp_token");
}
export async function disconnectConnection() {
  const token = await connectionToken();
  if (token) {
    const r = await fetch(__API_URL__ + "/extension/disconnect", {
      method: "POST", headers: {Authorization: "Bearer " + token},
      signal: AbortSignal.timeout(15000), redirect: "error",
    });
    if (!r.ok) throw new Error("Could not revoke this connection. Check your network and try Disconnect again.");
  }
  await clearConnection();
}
