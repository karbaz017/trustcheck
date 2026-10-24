import type { SearchHit, SearchProvider } from "./types.js";

export const tavily: SearchProvider = {
  name: "tavily",
  async search(query: string): Promise<SearchHit[]> {
    const key = process.env.TAVILY_API_KEY;
    if (!key) throw new Error("TAVILY_API_KEY not set");
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({ query, max_results: 5, search_depth: "basic", include_answer: false }),
    });
    if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
    const body = (await res.json()) as { results?: { url: string; title: string; content: string }[] };
    return (body.results ?? []).map((r) => ({ url: r.url, title: r.title ?? "", snippet: r.content ?? "" }));
  },
};
