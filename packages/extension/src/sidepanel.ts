import { scrubPII, fallbackDraft } from "@draftpilot/shared/privacy";
import "./style.css";
declare const __API_URL__: string;
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const context = el<HTMLTextAreaElement>("context"),
  draft = el<HTMLTextAreaElement>("draft"),
  tone = el<HTMLSelectElement>("tone");
let contextTabId: number | undefined;
let contextChannel: "gmail" | "outlook" = "gmail";
function status(text: string) {
  el("status").textContent = text;
}
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ? new URL(tab.url) : null;
  if (
    !tab?.id ||
    !url ||
    !(
      url.hostname === "mail.google.com" ||
      ([
        "outlook.office.com",
        "outlook.office365.com",
        "outlook.live.com",
      ].includes(url.hostname) &&
        /^\/mail(?:\/|$)/.test(url.pathname))
    )
  )
    throw new Error("Open Gmail or Outlook web mail in the active tab.");
  return tab.id;
}
async function getToken() {
  return (await chrome.storage.session.get("dp_token")).dp_token as
    string | undefined;
}
async function updateMode() {
  el("mode").textContent = (await getToken())
    ? "Workspace connected"
    : "Local mode";
}
el("read").onclick = async () => {
  try {
    const id = await activeTab();
    const result = await chrome.tabs.sendMessage(id, { type: "READ_CONTEXT" });
    if (result.error) throw new Error(result.error);
    context.value = result.text;
    contextTabId = id;
    const tab = await chrome.tabs.get(id);
    contextChannel =
      new URL(tab.url!).hostname === "mail.google.com" ? "gmail" : "outlook";
    el("privacy").textContent =
      `${result.count} sensitive patterns redacted. Review for any remaining personal details.`;
    status("Conversation ready. Review the context before generating.");
  } catch (e) {
    status((e as Error).message);
  }
};
el("generate").onclick = async () => {
  const button = el<HTMLButtonElement>("generate");
  if (context.value.trim().length < 8) {
    status("Add a customer message first.");
    return;
  }
  button.disabled = true;
  button.textContent = "Preparing your draft…";
  try {
    const clean = scrubPII(context.value);
    context.value = clean.text;
    const token = await getToken();
    let text: string,
      source: string,
      sources: { name: string }[] = [];
    if (token) {
      const response = await fetch(__API_URL__ + "/drafts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          threadContent: clean.text,
          ...(tone.value ? { tone: tone.value } : {}),
          channel: contextChannel,
          requestId: crypto.randomUUID(),
        }),
        signal: AbortSignal.timeout(60000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Unable to generate.");
      text = result.draft;
      source = result.source;
      sources = result.sources || [];
    } else {
      text = fallbackDraft(clean.text, tone.value || "friendly");
      source = "Local template";
    }
    draft.value = text;
    el("source").textContent = source;
    el("sources").textContent = sources.length
      ? "Sources: " + sources.map((s) => s.name).join(", ")
      : "No policy source. Verify the reply before using it.";
    el("result-section").hidden = false;
    status("Draft ready for your review.");
  } catch (e) {
    status((e as Error).message);
  } finally {
    button.disabled = false;
    button.textContent = "✧ Generate draft";
  }
};
el("insert").onclick = async () => {
  try {
    const id = await activeTab();
    if (contextTabId !== undefined && contextTabId !== id)
      throw new Error(
        "The active tab changed. Read the current conversation before inserting.",
      );
    const result = await chrome.tabs.sendMessage(id, {
      type: "INSERT_DRAFT",
      text: draft.value,
    });
    if (result.error) throw new Error(result.error);
    status(
      "Inserted into your reply box. Review the recipient and reply before sending.",
    );
  } catch (e) {
    status((e as Error).message);
  }
};
el("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(draft.value);
    status("Copied. Review before sending.");
  } catch {
    status("Select the draft and copy it manually.");
  }
};
el("connect").onclick = async () => {
  try {
    const response = await fetch(__API_URL__ + "/extension/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: el<HTMLInputElement>("code").value.trim() }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to connect.");
    await chrome.storage.session.set({ dp_token: result.token });
    el<HTMLInputElement>("code").value = "";
    await updateMode();
    status("Workspace connected. Your token is limited to drafting.");
  } catch (e) {
    status((e as Error).message);
  }
};
el("disconnect").onclick = async () => {
  await chrome.storage.session.remove("dp_token");
  await updateMode();
  status(
    "Disconnected locally. Revoke the session in your web workspace to invalidate it on the server.",
  );
};
updateMode().catch(() => status("Unable to load extension session."));
