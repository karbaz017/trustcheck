import { hypeTerms } from "../config/loadConfig.js";

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function hypeFlags(text: string, terms: string[] = hypeTerms): string[] {
  const t = norm(text);
  return terms.filter((term) => new RegExp(`(?<![a-z0-9])${escape(norm(term))}(?![a-z0-9])`, "i").test(t));
}
