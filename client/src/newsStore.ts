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

export const loadWatchlist = () => read<string[]>("tc.watchlist", []);
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
