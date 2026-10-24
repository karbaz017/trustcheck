import { createHash } from "node:crypto";
import { store } from "../db/index.js";
import type { Evidence } from "../types.js";
import { domainOf } from "../pipeline/tierSources.js";
import { brave } from "./brave.js";
import { geminiSearch } from "./geminiSearch.js";
import { tavily } from "./tavily.js";
import type { SearchHit, SearchProvider } from "./types.js";

const hash = (q: string) => createHash("sha256").update(q.trim().toLowerCase()).digest("hex");

const MAX_SNIPPET = 1200;

/** Try each provider in order; cache successes for 24h. Throws if every provider fails (caller marks claim unverifiable). */
const ALL: Record<string, SearchProvider> = { gemini: geminiSearch, tavily, brave };
/** SEARCH_PROVIDERS="gemini,tavily,brave" picks the order; default is Gemini (Google Search grounding) only. */
export const configuredProviders = (): SearchProvider[] =>
  (process.env.SEARCH_PROVIDERS ?? "gemini").split(",").map((n) => ALL[n.trim()]).filter(Boolean);

export async function searchWithFallback(query: string, providers: SearchProvider[] = configuredProviders()): Promise<SearchHit[]> {
  const key = hash(query);
  const cached = await store.getSearchCache(key);
  if (cached) return cached;
  const errors: string[] = [];
  for (const p of providers) {
    try {
      const hits = await p.search(query);
      await store.putSearchCache(key, hits);
      return hits;
    } catch (e) {
      errors.push(`${p.name}: ${(e as Error).message}`);
    }
  }
  throw new Error(`All search providers failed (${errors.join("; ")})`);
}

/** Search both queries, de-duplicate by URL, assign ids e1.. Tiers are applied by the separate tier stage. */
export async function retrieveEvidence(queries: string[]): Promise<Evidence[]> {
  const results = await Promise.all(queries.map((q) => searchWithFallback(q)));
  const seen = new Set<string>();
  const now = new Date().toISOString();
  const out: Evidence[] = [];
  for (const hit of results.flat()) {
    const domain = domainOf(hit.url);
    if (!domain || !/^https?:\/\//i.test(hit.url)) continue;
    const norm = hit.url.replace(/#.*$/, "").replace(/\/$/, "");
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({
      id: `e${out.length + 1}`,
      url: hit.url,
      domain,
      title: hit.title.slice(0, 200),
      tier: 3, // placeholder; real tier assigned by applyTiers()
      snippet: hit.snippet.slice(0, MAX_SNIPPET),
      retrievedAt: now,
    });
  }
  return out;
}
