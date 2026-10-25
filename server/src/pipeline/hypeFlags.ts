import { hypePatterns, hypeTerms } from "../config/loadConfig.js";

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function hypeFlags(text: string, terms: string[] = hypeTerms, patterns: Record<string, string> = hypePatterns): string[] {
  const t = norm(text);
  const found = terms.filter((term) => new RegExp(`(?<![a-z0-9])${escape(norm(term))}(?![a-z0-9])`, "i").test(t));
  // Patterns catch the same pressure with words in between ("buy TESLA now"); reported under one label.
  for (const [label, re] of Object.entries(patterns)) if (!found.includes(label) && new RegExp(re, "i").test(t)) found.push(label);
  return found;
}
