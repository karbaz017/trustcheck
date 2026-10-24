import type { Evidence } from "../types.js";

const normText = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** Quote must be a verbatim (whitespace/case/quote-style normalized) substring of the snippet, max 25 words. */
export function isVerbatimQuote(quote: string, snippet: string): boolean {
  const q = normText(quote).replace(/^["'….]+|["'….]+$/g, "");
  if (!q) return false;
  if (q.split(" ").length > 25) return false;
  return normText(snippet).includes(q);
}

const ID_RE = /\be\d+\b/g;

/** Returns ids referenced in text that are not in the allowed set. */
export function unknownEvidenceIds(text: string, allowed: Set<string>): string[] {
  return (text.match(ID_RE) ?? []).filter((id) => !allowed.has(id));
}

export function allIdsKnown(ids: string[], evidence: Evidence[]): boolean {
  const set = new Set(evidence.map((e) => e.id));
  return ids.every((id) => set.has(id));
}

const ADVICE_PATTERNS = [
  /\byou should (buy|sell|hold|invest|avoid|put|move|trade)\b/i,
  /\bi (recommend|suggest|advise)\b/i,
  /\bwe (recommend|suggest|advise)\b/i,
  /\b(buy|sell|hold) (it |this |that |them )?now\b/i,
  /\binvest in\b/i,
  /\bavoid investing\b/i,
  /\bdon'?t invest\b/i,
  /\bdo not invest\b/i,
  /\byou (must|need to|ought to) (buy|sell|invest|avoid)\b/i,
  /\b(go ahead and|consider) (buying|selling|investing)\b/i,
  /\bshould (you )?(buy|sell|invest)\b/i,
];

export function containsAdvice(text: string): boolean {
  return ADVICE_PATTERNS.some((re) => re.test(text));
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
