import type { NewsResponse } from "../../server/src/addons/news/types";
export type { NewsItem, NewsResponse } from "../../server/src/addons/news/types";

// Per-viewer conveniences only, so browser storage is fine. Every access is guarded.
const read = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ }
};

/** Same character rule as the server; anything else is turned into a space. */
export const cleanTopic = (t: string) => t.replace(/[^\p{L}\p{N} .&'-]/gu, " ").replace(/\s+/g, " ").trim();
const validTopic = (t: string) => t.length >= 2 && t.length <= 60 && t.split(" ").length <= 5;

/** Topics are short names ("NVDA, Federal Reserve"). A question, a sentence or a percentage is a claim to check. */
export function looksLikeClaim(text: string): boolean {
  const parts = text.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
  const statement = /\b(will|is|are|was|were|gonna|going to|should|could|would|has|have|did|does|can)\b/i;
  return /\?/.test(text) || parts.some((p) => p.split(/\s+/).length > 5 || /\d\s*%|\$\s?\d/.test(p) || (p.split(/\s+/).length >= 3 && statement.test(p)));
}

/** Splits, cleans and de-duplicates topics; drops anything that isn't a short name. */
export const parseTopics = (text: string) => [...new Set(text.split(/[,;\n]/).map(cleanTopic).filter(validTopic))].slice(0, 10);

// Older versions could store a whole sentence as a topic; those are dropped on load.
export const loadWatchlist = () => read<string[]>("tc.watchlist", []).map(cleanTopic).filter(validTopic);
export const saveWatchlist = (w: string[]) => write("tc.watchlist", w);
export const loadSeen = () => new Set(read<string[]>("tc.newsSeen", []));
export const saveSeen = (s: Set<string>) => write("tc.newsSeen", [...s].slice(-500));

export async function fetchNews(topics: string[]): Promise<NewsResponse> {
  const res = await fetch("/api/news", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topics }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Couldn't load news right now.");
  return body;
}

export const POLL_MS = 3 * 60_000;
