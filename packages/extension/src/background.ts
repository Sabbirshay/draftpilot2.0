import { fallbackDraft, scrubPII } from "@draftpilot/shared/privacy";
declare const __API_URL__: string;
const tones = ["friendly", "professional", "empathetic", "concise"];
const channels = ["gmail", "zendesk", "outlook", "intercom", "crisp", "mevrik", "other"];
const active = new Map<number, number>();
async function token() {
  return (await chrome.storage.session.get("dp_token")).dp_token as
    string | undefined;
}
async function api(path: string, body: unknown, auth?: string) {
  const response = await fetch(__API_URL__ + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer " + auth } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55000),
    redirect: "error",
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401)
      await chrome.storage.session.remove("dp_token");
    throw new Error(
      result.message || "DraftPilot could not complete this request.",
    );
  }
  return result;
}
export async function show(tab: chrome.tabs.Tab, frameId = 0) {
  if (!tab.id || !/^https?:\/\//.test(tab.url || ""))
    throw new Error(
      "DraftPilot works on regular web pages. Browser settings, stores and protected documents restrict extensions.",
    );
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [frameId] },
    files: ["content.js"],
  });
  await chrome.tabs.sendMessage(tab.id, { type: "SHOW_PANEL" }, { frameId });
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session
    .setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
    .catch(() => {});
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => {});
  chrome.contextMenus.removeAll(() =>
    chrome.contextMenus.create({
      id: "draftpilot-capture",
      title: "DraftPilot: capture selected message",
      contexts: ["selection"],
    }),
  );
});
async function report(tab: chrome.tabs.Tab, action: () => Promise<void>) {
  try {
    await action();
    if (tab.id) await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  } catch {
    if (tab.id) {
      await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
      await chrome.action.setTitle({
        tabId: tab.id,
        title:
          "Page access restricted. Open the message in a regular top-level web page and try DraftPilot again.",
      });
    }
  }
}
chrome.action.onClicked.addListener((tab) => {
  void report(tab, () => show(tab));
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab && info.menuItemId === "draftpilot-capture")
    void report(tab, () => show(tab, info.frameId || 0));
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    !sender.tab?.id ||
    !/^https?:\/\//.test(sender.url || "")
  )
    return;
  const tabId = sender.tab.id;
  const run = async () => {
    if (message.type === "DP_MODE") return { connected: !!(await token()) };
    if (message.type === "DP_CONNECT") {
      await chrome.tabs.create({
        url: chrome.runtime.getURL("sidepanel.html"),
      });
      return { ok: true };
    }
    if (message.type !== "DP_GENERATE")
      throw new Error("Unsupported extension request.");
    if (
      typeof message.text !== "string" ||
      message.text.trim().length < 8 ||
      message.text.length > 16000 ||
      (message.tone && !tones.includes(message.tone)) ||
      !channels.includes(message.channel) ||
      typeof message.requestId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(message.requestId)
    )
      throw new Error("Capture a valid customer message first.");
    if (active.has(tabId))
      throw new Error("A draft is already being prepared in this tab.");
    active.set(tabId, Date.now());
    try {
      const clean = scrubPII(message.text).text,
        credential = await token();
      if (!credential)
        return {
          draft: fallbackDraft(clean, message.tone || "friendly"),
          source: "Local template",
          sources: [],
          tone: message.tone || "friendly",
          local: true,
        };
      const result = await api(
        "/drafts/generate",
        {
          threadContent: clean,
          ...(message.tone ? { tone: message.tone } : {}),
          channel: message.channel,
          requestId: message.requestId,
        },
        credential,
      );
      if (typeof result.draft !== "string" || result.draft.length > 12000)
        throw new Error("Invalid draft response.");
      return {
        draft: result.draft,
        source: result.source,
        sources: result.sources,
        tone: result.tone,
        local: false,
      };
    } finally {
      active.delete(tabId);
    }
  };
  void run()
    .then(respond)
    .catch((error) =>
      respond({
        error:
          error instanceof Error
            ? error.message
            : "Unable to complete request.",
      }),
    );
  return true;
});
