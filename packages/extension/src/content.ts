import { watchSource, type WatchSource } from "./watch";
import { scrubPII } from "@draftpilot/shared/privacy";
import {
  adapterForPage,
  editable,
  fingerprint,
  insertText,
  type Captured,
  type Adapter,
} from "./adapters";

// Content scripts execute in Chrome's isolated world, not the page's JS context.
const isolated = globalThis as typeof globalThis & {
  __draftpilotInstalled?: boolean;
};
if (!isolated.__draftpilotInstalled) {
  isolated.__draftpilotInstalled = true;
  let adapter: Adapter = adapterForPage();
  let capture: Captured | null = null,
    capturedKey = "",
    revision = 0;
  let selected: Captured | null = null,
    target: HTMLElement | null = null;
  let host: HTMLDivElement | undefined, root: ShadowRoot | undefined;
  let picking: "message" | "reply" | null = null;
  let requestId = crypto.randomUUID(),
    busy = false,
    generatedRevision = -1;
  let watcher: WatchSource | null = null;
  let watchTimer: ReturnType<typeof setInterval> | undefined;
  let lastSeen = "",
    pending: Captured | null = null,
    due = 0,
    lastRun = 0;
  let draftDirty = false;
  function stopWatching(message?: string) {
    watcher = null;
    pending = null;
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = undefined;
    if (root) {
      get("watch").textContent = "Watch customer replies";
      get("watch-state").textContent = "Watching is off";
    }
    if (message) status(message);
  }
  function pollWatch() {
    if (!watcher) return;
    if (!watcher.valid()) {
      stopWatching(
        "Conversation changed. Select a customer message in the new chat to resume watching.",
      );
      invalidate();
      return;
    }
    if (document.hidden || host?.hidden) return;
    const next = watcher.latest();
    if (!next) {
      stopWatching(
        "Customer message is unavailable. Pick the current customer bubble again.",
      );
      invalidate();
      return;
    }
    const signature = watcher.signature(next);
    if (signature !== lastSeen) {
      if (draftDirty) {
        stopWatching(
          "A new customer reply arrived. Your edited draft is preserved; capture the new message when ready.",
        );
        generatedRevision = -1;
        return;
      }
      lastSeen = signature;
      pending = next;
      due = Date.now() + 1200;
      invalidate();
      status("New customer reply detected. Preparing an updated draft…");
    }
    if (pending && !busy && Date.now() >= due && Date.now() - lastRun >= 6500) {
      const next = pending;
      pending = null;
      lastRun = Date.now();
      useCapture(next);
      void generate().catch((error) => {
        stopWatching("Watching paused: " + (error as Error).message);
      });
    }
  }
  async function toggleWatch() {
    if (watcher) {
      stopWatching("Watching paused. Your ready draft is retained.");
      if (busy) invalidate();
      return;
    }
    if (!capture?.node)
      throw new Error(
        "Use Pick message once to identify a customer bubble, then start watching.",
      );
    const mode = await rpc({ type: "DP_MODE" });
    if (!mode.connected)
      throw new Error(
        "Connect your workspace before watching so drafts can use its knowledge base and tone.",
      );
    current();
    watcher = watchSource(capture.node);
    lastSeen = "";
    lastRun = 0;
    draftDirty = false;
    get("watch").textContent = "Pause watching";
    get("watch-state").textContent =
      "Watching this conversation · automatic drafts · manual insertion";
    watchTimer = setInterval(pollWatch, 400);
    pollWatch();
  }
  let previousFocus: HTMLElement | null = null;
  const get = <T extends HTMLElement>(id: string) =>
    root!.getElementById(id) as T;
  const status = (text: string) => {
    if (root) get("status").textContent = text;
  };
  function selection() {
    const s = window.getSelection();
    const node = s?.anchorNode?.parentElement;
    if (
      s &&
      !s.isCollapsed &&
      node &&
      !host?.contains(node) &&
      node.getRootNode() === document
    ) {
      const text = s.toString().trim();
      if (text) selected = { text, node, fingerprint: fingerprint(node) };
    }
  }
  selection();
  document.addEventListener("selectionchange", selection);
  document.addEventListener("focusin", (event) => {
    const el = event.target;
    if (el instanceof HTMLElement && editable(el)) target = el;
  });
  function invalidate() {
    draftDirty = false;
    revision++;
    generatedRevision = -1;
    requestId = crypto.randomUUID();
    if (root) {
      get<HTMLTextAreaElement>("draft").value = "";
      get("result").hidden = true;
    }
  }
  function useCapture(next: Captured) {
    if (next.text.trim().length < 8 || next.text.length > 16000)
      throw new Error(
        "Select a customer message between 8 and 16,000 characters. Narrow your selection if needed.",
      );
    invalidate();
    target = null;
    adapter = adapterForPage();
    capture = next;
    capturedKey = adapter.key();
    const clean = scrubPII(next.text);
    if (root) {
      get<HTMLTextAreaElement>("context").value = clean.text;
      get("platform").textContent = adapter.label;
      status(
        `${clean.count} sensitive patterns redacted. Review the captured message, then generate.`,
      );
    }
    return clean;
  }
  function read() {
    selection();
    const next =
      selected &&
      selected.node?.isConnected &&
      selected.fingerprint === fingerprint(selected.node)
        ? selected
        : adapterForPage().capture();
    selected = null;
    if (!next)
      throw new Error(
        "Select the customer's message or choose Pick message. Restricted frames must be opened as a regular page.",
      );
    return useCapture(next);
  }
  function current() {
    if (watcher) {
      const latest = watcher.latest();
      if (
        !watcher.valid() ||
        !latest ||
        !capture ||
        watcher.signature(latest) !== watcher.signature(capture)
      )
        throw new Error(
          "A new customer reply or conversation change was detected. Wait for the updated draft.",
        );
    }
    if (
      !capture ||
      capturedKey !== adapter.key() ||
      (capture.node &&
        (!capture.node.isConnected ||
          capture.fingerprint !== fingerprint(capture.node)))
    )
      throw new Error(
        "The conversation changed. Capture the current message and generate a fresh draft first.",
      );
  }
  function insert(text: string) {
    current();
    if (typeof text !== "string" || !text.trim() || text.length > 12000)
      throw new Error("Invalid draft.");
    let editor = target;
    if (editor && !editor.isConnected)
      throw new Error(
        "The reply box changed. Choose the current reply box again.",
      );
    if (!editor) {
      const editors = adapter.editors();
      if (editors.length !== 1)
        throw new Error(
          "Choose the reply box first. DraftPilot will not guess between multiple editors.",
        );
      editor = editors[0];
    }
    insertText(editor, text);
    return { ok: true };
  }
  async function rpc(message: Record<string, unknown>) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result)
      throw new Error(
        "Extension connection unavailable. Reload this page and try again.",
      );
    if (result.error) throw new Error(result.error);
    return result;
  }
  function bind(id: string, fn: () => void | Promise<void>) {
    get(id).addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      Promise.resolve()
        .then(fn)
        .catch((error) => status((error as Error).message));
    });
  }
  function pick(kind: "message" | "reply") {
    if (kind === "message") stopWatching();
    picking = kind;
    status(
      kind === "message"
        ? "Click the customer's message on this page. Escape cancels."
        : "Click the reply box on this page. Escape cancels.",
    );
  }
  document.addEventListener(
    "click",
    (event) => {
      if (!picking || !event.isTrusted || event.composedPath().includes(host!))
        return;
      const el = event.composedPath().find((e) => e instanceof HTMLElement) as
        HTMLElement | undefined;
      if (!el) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        if (picking === "reply") {
          const editor = el.closest<HTMLElement>(
            'textarea,[contenteditable="true"],[contenteditable="plaintext-only"]',
          );
          if (!editor || !editable(editor))
            throw new Error(
              "Choose a writable textarea or rich-text reply box. Password, search and payment fields are not supported.",
            );
          target = editor;
          get("target").textContent = "Reply box selected";
          status(
            "Reply box selected. Review the draft, then click Insert reply.",
          );
        } else {
          if (el.closest('input,textarea,select,[contenteditable="true"]'))
            throw new Error(
              "Select message text instead of capturing an input field.",
            );
          const node =
            el.closest<HTMLElement>(
              'p,blockquote,[data-message],article,[role="article"]',
            ) || el;
          if (node === document.body || node === document.documentElement)
            throw new Error(
              "Click a specific customer message, not the whole page.",
            );
          useCapture({
            text: node.innerText,
            node,
            fingerprint: fingerprint(node),
          });
        }
        picking = null;
      } catch (error) {
        status((error as Error).message);
      }
    },
    true,
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && host && !host.hidden) {
      if (picking) {
        picking = null;
        status("Selection cancelled.");
      } else {
        stopWatching();
        invalidate();
        host.hidden = true;
        host.style.setProperty("display", "none", "important");
        previousFocus?.focus();
      }
    }
  });
  async function generate() {
    current();
    if (busy) return;
    const text = scrubPII(get<HTMLTextAreaElement>("context").value).text;
    get<HTMLTextAreaElement>("context").value = text;
    if (text.trim().length < 8)
      throw new Error("Capture a customer message first.");
    const version = revision;
    busy = true;
    get<HTMLButtonElement>("generate").disabled = true;
    get("generate").textContent = "Preparing your draft…";
    get("result").hidden = true;
    try {
      const result = await rpc({
        type: "DP_GENERATE",
        text,
        tone: get<HTMLSelectElement>("tone").value,
        channel: adapter.id,
        requestId,
      });
      if (version !== revision) {
        status("Context changed while generating. Generate a fresh draft.");
        return;
      }
      current();
      generatedRevision = revision;
      get<HTMLTextAreaElement>("draft").value = result.draft;
      get("source").textContent =
        `${result.source} · ${result.tone || "workspace tone"} · Review required`;
      get("sources").textContent = result.sources?.length
        ? "Sources: " +
          result.sources.map((s: { name: string }) => s.name).join(", ")
        : "No knowledge source. Verify facts before using this draft.";
      get("mode").textContent = result.local
        ? "Local mode · no workspace KB"
        : "Workspace connected";
      get("result").hidden = false;
      status("Draft ready. Choose your reply box if needed, then insert.");
    } finally {
      busy = false;
      get<HTMLButtonElement>("generate").disabled = false;
      get("generate").textContent = "Generate draft";
    }
  }
  function show() {
    if (!host) {
      host = document.createElement("div");
      host.dataset.draftpilotRoot = "";
      host.style.cssText =
        "all:initial!important;position:fixed!important;right:18px!important;top:18px!important;z-index:2147483647!important;width:min(390px,calc(100vw - 36px))!important;";
      root = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `:host{color-scheme:light}*{box-sizing:border-box}section{font:14px/1.5 system-ui,sans-serif;color:#213b2e;background:#fafcf8;border:1px solid #cfdcc9;border-radius:18px;box-shadow:0 16px 65px #142b2240;max-height:calc(100dvh - 36px);overflow:auto;padding:18px}header{display:flex;align-items:center;gap:9px;margin-bottom:10px}header strong{font-size:20px}header b{background:#cff279;border-radius:8px;padding:1px 8px;font-size:23px}header button{margin-left:auto}small{font-size:12px;color:#526755}p{margin:8px 0 12px}label{display:block;font-weight:600;margin:12px 0 5px}textarea,select{font:inherit;color:inherit;background:white;border:1px solid #c7d4c5;border-radius:8px;padding:9px;width:100%;resize:vertical}textarea:focus,select:focus,button:focus-visible{outline:3px solid #83ae3b;outline-offset:2px}button{font:600 12px/1.4 system-ui;border:1px solid #bdcdb9;background:white;color:#29422e;border-radius:8px;padding:9px 11px;cursor:pointer}button:hover{background:#eef5e3}button:disabled{opacity:.6;cursor:wait}.primary{background:#cef279;border-color:#cef279}.row{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.wide{width:100%;margin-top:12px}#status{font-size:12px;border-top:1px solid #dce5d8;padding-top:10px;overflow-wrap:anywhere}#sources{font-size:12px;overflow-wrap:anywhere}#mode{background:#ecf2e5;border-radius:6px;padding:3px 7px}#result{border-top:1px solid #dce5d8;margin-top:15px;padding-top:6px}[hidden]{display:none!important}`;
      root.append(style);
      const panel = document.createElement("section");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "DraftPilot reply assistant");
      // Static template only. Page, source and model text is always assigned through textContent/value.
      panel.innerHTML = `<header><b aria-hidden="true">ϟ</b><strong>DraftPilot.</strong><button id="close" aria-label="Close DraftPilot">✕</button></header>
        <small id="platform"></small> · <small id="mode">Checking workspace…</small>
        <p>Your next reply, right here. Review first. Sending stays in your hands.</p>
        <div class="row"><button id="read">Capture selection / thread</button><button id="pick-message">Pick message</button></div>
        <label for="context">Customer message</label><textarea id="context" rows="4" maxlength="16000" placeholder="Select a message, or click Pick message and choose it on the page."></textarea>
        <label for="tone">Reply tone</label><select id="tone"><option value="">Workspace default</option><option value="friendly">Friendly</option><option value="professional">Professional</option><option value="empathetic">Empathetic</option><option value="concise">Concise</option></select>
        <div class="row"><button id="watch">Watch customer replies</button></div><small id="watch-state">Watching is off</small>
        <button id="generate" class="primary wide">Generate draft</button>
        <div id="result" hidden><label for="draft">Review your draft</label><small id="source"></small><textarea id="draft" rows="7" maxlength="12000"></textarea><p id="sources"></p><div class="row"><button id="pick-reply">Choose reply box</button><button id="insert" class="primary">Insert at chat box</button></div><small id="target">Uses a single empty editor, or the reply box you choose.</small></div>
        <p id="status" role="status" aria-live="polite"></p><button id="connect">Workspace connection</button><p><small>No automatic sending. Redaction can miss personal details.</small></p>`;
      root.append(panel);
      document.documentElement.append(host);
      bind("close", () => {
        stopWatching();
        invalidate();
        host!.hidden = true;
        host!.style.setProperty("display", "none", "important");
        picking = null;
        previousFocus?.focus();
      });
      bind("read", () => {
        stopWatching();
        read();
      });
      bind("pick-message", () => pick("message"));
      bind("pick-reply", () => pick("reply"));
      bind("connect", async () => {
        await rpc({ type: "DP_CONNECT" });
        status(
          "Connect in the secure extension settings tab, then return here.",
        );
      });
      bind("watch", toggleWatch);
      get("context").addEventListener("input", () => {
        stopWatching();
        invalidate();
      });
      get("tone").addEventListener("change", () => {
        stopWatching();
        invalidate();
      });
      get("draft").addEventListener("input", () => {
        draftDirty = true;
      });
      bind("generate", generate);
      bind("insert", () => {
        if (generatedRevision !== revision)
          throw new Error("Generate a draft for the current context first.");
        insert(get<HTMLTextAreaElement>("draft").value);
        status(
          "Inserted as plain text. Review the recipient and reply before sending.",
        );
      });
    }
    previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (previousFocus && editable(previousFocus)) target = previousFocus;
    host.hidden = false;
    host.style.setProperty("display", "block", "important");
    adapter = adapterForPage();
    get("platform").textContent = adapter.label;
    if (!capture) {
      try {
        read();
      } catch (error) {
        status((error as Error).message);
      }
    }
    void rpc({ type: "DP_MODE" })
      .then((result) => {
        get("mode").textContent = result.connected
          ? "Workspace connected"
          : "Local mode · no workspace KB";
      })
      .catch((error) => status((error as Error).message));
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      !message ||
      typeof message.type !== "string"
    )
      return;
    try {
      if (message.type === "SHOW_PANEL") {
        show();
        respond({ ok: true });
      }
      if (message.type === "READ_CONTEXT") respond(read());
      if (message.type === "INSERT_DRAFT") respond(insert(message.text));
    } catch (error) {
      respond({ error: (error as Error).message });
    }
  });
}
