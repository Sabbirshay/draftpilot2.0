import { fingerprint, visible, type Captured } from "./adapters";
export type WatchSource = {
  latest(): Captured | null;
  key(): string;
  valid(): boolean;
  signature(capture: Captured): string;
};
const markers = [
  ["data-sender", ["customer", "visitor", "user"]],
  ["data-author-type", ["customer", "visitor", "user"]],
  ["data-direction", ["incoming", "inbound"]],
  ["data-message-direction", ["incoming", "inbound"]],
] as const;
const incomingClasses = [
  "message-incoming",
  "message--incoming",
  "message-inbound",
  "message--received",
  "message-customer",
  "message-visitor",
];
/** Learn from the bubble the agent chose, never from a whole-page text scrape. */
export function watchSource(seed: HTMLElement): WatchSource {
  let bubble: HTMLElement | null = seed,
    selector = "";
  for (
    let depth = 0;
    bubble && depth < 6;
    depth++, bubble = bubble.parentElement
  ) {
    for (const [attribute, values] of markers) {
      const value = bubble.getAttribute(attribute);
      if (value && (values as readonly string[]).includes(value)) {
        selector = `[${attribute}="${CSS.escape(value)}"]`;
        break;
      }
    }
    if (!selector) {
      const name = incomingClasses.find((name) =>
        bubble!.classList.contains(name),
      );
      if (name) selector = "." + CSS.escape(name);
    }
    if (selector) break;
  }
  if (!bubble || !selector)
    throw new Error(
      "Choose a customer message bubble with a distinguishable incoming-message layout. This page's customer/agent markup needs a verified adapter before automatic watching is available.",
    );
  const scope =
    bubble.parentElement?.closest<HTMLElement>(
      '[data-conversation-id],[data-session-id],[data-ticket-id],[role="log"]',
    ) || bubble.parentElement;
  if (!scope || scope === document.body || scope === document.documentElement)
    throw new Error(
      "Choose a message inside the active conversation, not the whole page.",
    );
  const identity = () =>
    ["data-conversation-id", "data-session-id", "data-ticket-id"]
      .map((a) => scope.getAttribute(a) || "")
      .join("|");
  const initialIdentity = identity(),
    initialUrl = location.href;
  const hasIdentity = initialIdentity.replaceAll("|", "").length > 0;
  const key = () => location.href + "|" + identity();
  return {
    key,
    valid: () =>
      scope.isConnected &&
      visible(scope) &&
      location.href === initialUrl &&
      identity() === initialIdentity &&
      (hasIdentity || seed.isConnected),
    latest: () => {
      const nodes = Array.from(
        scope.querySelectorAll<HTMLElement>(selector),
      ).filter(
        (node) => visible(node) && !node.closest("[data-draftpilot-root]"),
      );
      const node = nodes.at(-1);
      if (!node) return null;
      let text = nodes
        .slice(-4)
        .map((node) => node.innerText.trim())
        .filter(Boolean)
        .join("\n\n");
      if (text.length > 16000) text = node.innerText.trim();
      if (text.length < 8 || text.length > 16000) return null;
      return { text, node, fingerprint: fingerprint(node) };
    },
    signature: (capture) =>
      (capture.node?.getAttribute("data-message-id") ||
        capture.node?.id ||
        "") +
      "|" +
      capture.text,
  };
}
