export type Channel =
  "gmail" | "zendesk" | "outlook" | "intercom" | "crisp" | "mevrik" | "other";
export type Captured = {
  text: string;
  node?: HTMLElement;
  fingerprint?: string;
};
export type Adapter = {
  id: Channel;
  label: string;
  matches(): boolean;
  capture(): Captured | null;
  editors(): HTMLElement[];
  key(): string;
};
export const visible = (el: HTMLElement) =>
  el.isConnected &&
  el.getClientRects().length > 0 &&
  getComputedStyle(el).visibility !== "hidden" &&
  !el.closest('[inert],[aria-hidden="true"]');
export const all = (selector: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(visible);
export const editable = (el: HTMLElement): boolean => {
  if (!visible(el) || el.closest("[data-draftpilot-root]")) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  return (
    el.isContentEditable &&
    !el.closest('[contenteditable="false"]') &&
    el.getAttribute("aria-readonly") !== "true"
  );
};
export const value = (el: HTMLElement) =>
  el instanceof HTMLTextAreaElement ? el.value : el.innerText;
export const fingerprint = (el: HTMLElement) =>
  (el.innerText || "").slice(0, 20000);
const captured = (nodes: HTMLElement[]): Captured | null => {
  const node = nodes.at(-1);
  return node
    ? {
        text: nodes
          .slice(-8)
          .map((el) => el.innerText)
          .join("\n\n"),
        node,
        fingerprint: fingerprint(node),
      }
    : null;
};
// Outlook has multiple inbox layouts. Prefer an explicit reading pane and
// fail closed when more than one pane is visible; never scrape the message list.
function outlookPane(): HTMLElement | null {
  const explicit = all(
    '[data-app-section="ReadingPane"], [data-testid="reading-pane"]',
  );
  const roots = explicit.filter(
    (el) => !explicit.some((other) => other !== el && other.contains(el)),
  );
  if (roots.length) return roots.length === 1 ? roots[0] : null;
  const main = all('[role="main"],main');
  const unique = main.filter(
    (el) => !main.some((other) => other !== el && other.contains(el)),
  );
  return unique.length === 1 ? unique[0] : null;
}
function outlookBodies(): HTMLElement[] {
  const pane = outlookPane();
  if (!pane) return [];
  const candidates = Array.from(
    pane.querySelectorAll<HTMLElement>(
      '[data-testid="message-body"], [role="document"], .allowTextSelection',
    ),
  ).filter(
    (el) =>
      visible(el) &&
      !el.isContentEditable &&
      !el.closest(
        '[contenteditable="true"],[contenteditable="plaintext-only"],[role="listbox"],[role="option"],[data-draftpilot-root]',
      ) &&
      !el.querySelector(
        '[contenteditable="true"],[contenteditable="plaintext-only"]',
      ) &&
      !!el.innerText.trim(),
  );
  return candidates.filter(
    (el) => !candidates.some((other) => other !== el && other.contains(el)),
  );
}
const outlook: Adapter = {
  id: "outlook",
  label: "Outlook",
  matches: () =>
    [
      "outlook.office.com",
      "outlook.office365.com",
      "outlook.live.com",
    ].includes(location.hostname) && /^\/mail(?:\/|$)/.test(location.pathname),
  capture: () => captured(outlookBodies()),
  editors: () => {
    const pane = outlookPane();
    if (!pane) return [];
    return Array.from(
      pane.querySelectorAll<HTMLElement>(
        '[contenteditable="true"][role="textbox"],[contenteditable="plaintext-only"][role="textbox"],[contenteditable="true"][aria-label="Message body"]',
      ),
    ).filter(editable);
  },
  key: () =>
    location.href +
    "|" +
    outlookBodies()
      .map((el) => fingerprint(el))
      .join("\n"),
};
export const adapters: Adapter[] = [
  outlook,
  {
    id: "gmail",
    label: "Gmail",
    matches: () => location.hostname === "mail.google.com",
    capture: () => {
      const result = captured(all(".a3s.aiL"));
      return (
        result && {
          ...result,
          text:
            (document.querySelector("h2.hP")?.textContent || "") +
            "\n" +
            result.text,
        }
      );
    },
    editors: () =>
      all('div[role="textbox"][g_editable="true"]').filter(editable),
    key: () =>
      location.href +
      "|" +
      (document.querySelector("h2.hP")?.textContent || ""),
  },
  {
    id: "zendesk",
    label: "Zendesk",
    matches: () =>
      /(^|\.)zendesk\.com$/.test(location.hostname) &&
      location.pathname.startsWith("/agent/"),
    capture: () =>
      captured(
        all(
          '[data-test-id="ticket-comment"] [data-test-id="comment-body"], [data-test-id="ticket-comment-body"], .zd-comment',
        ),
      ),
    editors: () =>
      all(
        '[data-test-id="ticket-comment-input"] [contenteditable="true"], [data-test-id="ticket-comment-input"][contenteditable="true"], textarea[data-test-id="ticket-comment-input"], [contenteditable="true"][role="textbox"]',
      ).filter(editable),
    key: () => location.href,
  },
];
export const generic: Adapter = {
  id: "other",
  label: "Universal capture",
  matches: () => true,
  capture: () => null,
  editors: () =>
    all(
      'textarea,[contenteditable="true"],[contenteditable="plaintext-only"]',
    ).filter(editable),
  key: () => location.href,
};
const platformProfiles: Adapter[] = [
  {
    ...generic,
    id: "crisp",
    label: "Crisp",
    matches: () => location.hostname === "app.crisp.chat",
  },
  {
    ...generic,
    id: "mevrik",
    label: "Mevrik",
    matches: () =>
      /(^|\.)mevrik\.com$/.test(location.hostname) &&
      !["mevrik.com", "www.mevrik.com"].includes(location.hostname),
  },
];
export const adapterForPage = () =>
  adapters.find((a) => a.matches()) ||
  platformProfiles.find((a) => a.matches()) ||
  generic;

/** Plain text only. Native input events let controlled editors commit the change. */
export function insertText(editor: HTMLElement, text: string) {
  if (!editable(editor))
    throw new Error("That reply box is no longer available. Choose it again.");
  if (value(editor).trim())
    throw new Error(
      "Your reply box already contains text. DraftPilot will not overwrite it.",
    );
  editor.focus();
  if (editor instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(editor, text);
  } else {
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // insertText preserves editor undo/transaction handling; never insertHTML.
    if (!document.execCommand("insertText", false, text)) {
      editor.replaceChildren(document.createTextNode(text));
    }
  }
  editor.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertText",
      data: text,
    }),
  );
  editor.dispatchEvent(new Event("change", { bubbles: true }));
  if (
    value(editor).replace(/\s+/g, " ").trim() !==
    text.replace(/\s+/g, " ").trim()
  )
    throw new Error(
      "This editor did not retain the draft. Review the reply box before trying again.",
    );
}
