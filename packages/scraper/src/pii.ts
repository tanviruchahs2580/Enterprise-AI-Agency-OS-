/**
 * Lightweight PII detection & redaction.
 *
 * Pattern-based (no ML dependency) covering the most common direct
 * identifiers: emails, phone numbers, credit-card-like sequences, and IPv4
 * addresses. Redaction replaces matches with stable tokens so downstream
 * storage/analytics never persists raw PII. For stronger guarantees, pair this
 * with the orchestrator's governance layer (approval gates, access policy).
 */

export interface PiiResult {
  text: string;
  found: string[];
}

// Order matters: more specific patterns (card, ip) run before the looser
// phone pattern so a 16-digit card number is not swallowed by PHONE.
const PATTERNS: Record<string, RegExp> = {
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  CREDIT_CARD: /\b(?:\d[ -]?){13,16}\b/g,
  IPV4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  PHONE: /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{3,4}(?:[\s.-]?\d{0,4})?\b/g,
};

export function redactPII(input: string): PiiResult {
  let text = input;
  const found: string[] = [];
  for (const [kind, re] of Object.entries(PATTERNS)) {
    re.lastIndex = 0;
    if (re.test(text)) {
      found.push(kind);
      re.lastIndex = 0;
      text = text.replace(re, `[${kind}]`);
    }
  }
  return { text, found };
}

/** Redact values inside an arbitrary extracted structure (shallow + 1 level). */
export function redactValues(
  data: Record<string, unknown>,
  enabled: boolean
): { data: Record<string, unknown>; found: string[] } {
  if (!enabled) return { data, found: [] };
  const found = new Set<string>();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string") {
      const r = redactPII(v);
      r.found.forEach((f) => found.add(f));
      out[k] = r.text;
    } else if (Array.isArray(v)) {
      const arr: unknown[] = [];
      for (const item of v) {
        if (typeof item === "string") {
          const r = redactPII(item);
          r.found.forEach((f) => found.add(f));
          arr.push(r.text);
        } else arr.push(item);
      }
      out[k] = arr;
    } else {
      out[k] = v;
    }
  }
  return { data: out, found: [...found] };
}
