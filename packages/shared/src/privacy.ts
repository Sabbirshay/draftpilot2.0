const patterns: [RegExp, string][] = [
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[TOKEN]"],
  [/\bAKIA[A-Z0-9]{16}\b/g, "[TOKEN]"],
  [/\bBearer\s+[A-Za-z0-9._-]{20,}/gi, "[TOKEN]"],
  [/\b(?:sk|pk|ghp|gho|xoxb|xoxp)[-_][A-Za-z0-9_-]{12,}\b/g, "[TOKEN]"],
  [
    /\b(?:password|passwd|pin|otp|secret|api[_ -]?key|access[_ -]?token)\s*[:=]\s*["']?[^\s,"';]+/gi,
    "[SECRET]",
  ],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]"],
  [/\b(?:\d[ -]*?){13,19}\b/g, "[CARD]"],
  [
    /(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\b\d{2,4})[ .-]\d{3,4}[ .-]\d{3,4}\b/g,
    "[PHONE]",
  ],
  [/\b\d{10,12}\b/g, "[PHONE]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]"],
  [
    /\b\d{1,5}\s+(?:[A-Za-z]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd)\b\.?/gi,
    "[ADDRESS]",
  ],
];
export function scrubPII(text: string) {
  let result = text;
  let count = 0;
  for (const [pattern, token] of patterns)
    result = result.replace(pattern, () => {
      count++;
      return token;
    });
  return { text: result, count };
}
export function cleanDraft(text: string) {
  return scrubPII(
    text
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "")
      .replace(/```[^\n]*\n?|```/g, "")
      .replace(/^(?:here(?:'s| is) (?:your|the) (?:draft|reply):?\s*)/i, "")
      .trim(),
  ).text.slice(0, 12000);
}
export function fallbackDraft(thread: string, tone: string, context?: string) {
  const greeting = tone === "professional" ? "Hello," : "Hi there,";
  const intro =
    tone === "empathetic"
      ? "I’m sorry this has been frustrating. Thank you for letting us know."
      : "Thanks for reaching out.";
  const subject = /refund|return|cancel/i.test(thread)
    ? "your refund or cancellation request"
    : /order|ship|deliver|track/i.test(thread)
      ? "your order"
      : /password|log.?in|access/i.test(thread)
        ? "the trouble accessing your account"
        : /invoice|bill|payment/i.test(thread)
          ? "your billing question"
          : /bug|error|broken/i.test(thread)
            ? "the issue you reported"
            : "your question";
  const body = context
    ? `Here’s the relevant information from our support guidance:\n\n${context}`
    : `We’ll need to check ${subject} before confirming the next steps. Could you share any non-sensitive details that would help us investigate? Please don’t send passwords or payment card information.`;
  return `${greeting}\n\n${intro}\n\n${body}\n\n${tone === "concise" ? "Thank you," : "Happy to help,\n"}Customer Support Team`;
}
export function rankSources(
  query: string,
  items: { id: string; name: string; content: string }[],
  limit = 4,
) {
  const words = new Set(query.toLowerCase().match(/[a-z]{3,}/g) || []);
  return items
    .map((item) => ({
      ...item,
      score: [...words].filter((w) =>
        (item.name + " " + item.content).toLowerCase().includes(w),
      ).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
