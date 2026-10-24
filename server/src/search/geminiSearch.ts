import { callModel } from "../llm/client.js";
import type { SearchHit, SearchProvider } from "./types.js";

interface Grounded {
  candidates?: {
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
      groundingSupports?: { segment?: { text?: string }; groundingChunkIndices?: number[] }[];
    };
  }[];
}

const REDIRECT_HOST = "vertexaisearch.cloud.google.com";

/** Grounded results link through a Google redirect; resolve it to the publisher URL so tiering sees the real domain. */
export async function resolveRedirect(uri: string, titleFallback: string): Promise<string | null> {
  try {
    const u = new URL(uri);
    if (u.hostname !== REDIRECT_HOST) return uri;
    const res = await fetch(uri, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    const loc = res.headers.get("location");
    if (loc && /^https?:\/\//i.test(loc)) return loc;
  } catch {
    /* fall through */
  }
  // The chunk title is normally the publisher's domain.
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(titleFallback) ? `https://${titleFallback.toLowerCase()}` : null;
}

export const geminiSearch: SearchProvider = {
  name: "gemini-google-search",
  async search(query: string): Promise<SearchHit[]> {
    const res = await callModel(
      {
        systemInstruction: {
          parts: [{ text: "You are a neutral research tool. Search the web and report ONLY what sources state: specific numbers, dates, names. Prefer primary sources (regulators, government statistics, company filings and investor-relations pages) and established news organizations (Reuters, AP, Bloomberg, The Wall Street Journal, Financial Times, CNBC). Avoid blogs, forums, social media and content farms. No opinions, no advice, no speculation. If sources disagree or say nothing relevant, say so plainly." }],
        },
        contents: [{ role: "user", parts: [{ text: `Find what reliable sources say about: ${query}` }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0 },
      },
      25_000,
    );
    if (!res.ok) throw new Error(`Vertex AI search HTTP ${res.status}`);
    const meta = ((await res.json()) as Grounded).candidates?.[0]?.groundingMetadata;
    const chunks = meta?.groundingChunks ?? [];

    // Snippet for each source = the grounded statements that cite it.
    const texts: string[][] = chunks.map(() => []);
    for (const s of meta?.groundingSupports ?? []) {
      for (const i of s.groundingChunkIndices ?? []) if (s.segment?.text && texts[i]) texts[i].push(s.segment.text.trim());
    }
    const hits = await Promise.all(
      chunks.slice(0, 8).map(async (c, i): Promise<SearchHit | null> => {
        if (!c.web?.uri || !texts[i].length) return null;
        const url = await resolveRedirect(c.web.uri, c.web.title ?? "");
        return url ? { url, title: c.web.title ?? url, snippet: [...new Set(texts[i])].join(" ") } : null;
      }),
    );
    return hits.filter((h): h is SearchHit => h !== null);
  },
};
