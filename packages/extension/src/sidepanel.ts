import {connectionToken, saveConnection, disconnectConnection} from "./connection";
import { scrubPII, fallbackDraft } from "@draftpilot/shared/privacy";
import "./style.css";
declare const __API_URL__: string;
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const context = el<HTMLTextAreaElement>("context"),
  draft = el<HTMLTextAreaElement>("draft"),
  tone = el<HTMLSelectElement>("tone");
const agentContext = el<HTMLTextAreaElement>("agent-context");
let inputRevision = 0;
function changed() { inputRevision++; el("result-section").hidden = true; }
agentContext.addEventListener("input", changed);
context.addEventListener("input", changed);
tone.addEventListener("change", changed);
el("clear-context").onclick = () => { agentContext.value = ""; changed(); };
chrome.tabs.onActivated.addListener(() => { agentContext.value = ""; context.value = ""; changed(); });
chrome.tabs.onUpdated.addListener((id, info) => { if (id === contextTabId && info.url) { agentContext.value = ""; context.value = ""; changed(); } });
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
      "outlook.cloud.microsoft",
        "outlook.office365.com",
        "outlook.live.com",
      ].includes(url.hostname) &&
        /^\/mail(?:\/|$)/.test(url.pathname))
    )
  )
    throw new Error("Open Gmail or Outlook web mail in the active tab.");
  return tab.id;
}
const getToken = connectionToken;
async function updateMode() {
  el("mode").textContent = (await getToken())
    ? "Workspace connected"
    : "Local mode";
}
el("read").onclick = async () => {
  try {
    const id = await activeTab();
    await chrome.scripting.executeScript({target: {tabId: id}, files: ["content.js"]});
    const result = await chrome.tabs.sendMessage(id, { type: "READ_CONTEXT" });
    if (result.error) throw new Error(result.error);
    agentContext.value = "";
    changed();
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
  const version = inputRevision;
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
          agentContext: scrubPII(agentContext.value).text,
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
    if (token !== await getToken()) throw new Error("Connection changed. Generate a fresh draft after connecting.");
    if (version !== inputRevision) { status("Context changed. Generate a fresh draft."); return; }
    draft.value = text;
    el("source").textContent = source;
    el("sources").textContent = sources.length
      ? "Sources: " + sources.map((s) => s.name).join(", ")
      : "No policy source. Verify the reply before using it.";
    el("result-section").hidden = false;
    status(token ? "Draft ready using your context and available knowledge. Review before inserting." : "Local template only: context and workspace knowledge were not used. Connect your workspace for AI drafting.");
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
    await saveConnection(result.token);
    el<HTMLInputElement>("code").value = "";
    await updateMode();
    status("Workspace connected. Your token is limited to drafting.");
  } catch (e) {
    status((e as Error).message);
  }
};
el("disconnect").onclick = async () => {
  const button = el<HTMLButtonElement>("disconnect"); button.disabled = true;
  try {
    await disconnectConnection();
    agentContext.value = ""; context.value = ""; draft.value = ""; changed();
    await updateMode(); status("Disconnected. This connection has been revoked on the server.");
  } catch (error) { status((error as Error).message); }
  finally {button.disabled = false;}
};
chrome.storage.onChanged.addListener((changes, area) => {
 if (area === "local" && changes.dp_token) { changed(); void updateMode(); }
});
updateMode().catch(() => status("Unable to load extension session."));
