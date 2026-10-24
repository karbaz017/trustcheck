import type { SearchHit, SearchProvider } from "./types.js";

export const brave: SearchProvider = {
  name: "brave",
  async search(query: string): Promise<SearchHit[]> {
    const key = process.env.BRAVE_API_KEY;
    if (!key) throw new Error("BRAVE_API_KEY not set");
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?count=5&q=${encodeURIComponent(query)}`, {
      headers: { "x-subscription-token": key, accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
    const body = (await res.json()) as { web?: { results?: { url: string; title: string; description: string }[] } };
    return (body.web?.results ?? []).map((r) => ({ url: r.url, title: r.title ?? "", snippet: stripTags(r.description ?? "") }));
  },
};

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
