import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("google-auth-library", () => ({ GoogleAuth: class { async getAccessToken() { return "fake-token"; } } }));
import { geminiSearch } from "../src/search/geminiSearch.js";
import { configuredProviders } from "../src/search/retrieve.js";

afterEach(() => vi.unstubAllGlobals());

describe("geminiSearch", () => {
  it("maps grounded chunks to hits, resolving Google redirects to publisher URLs", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "proj";
    process.env.GEMINI_MODEL = "m";
    const redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("aiplatform.googleapis.com")) {
        expect(url).toContain("/projects/proj/locations/us-central1/publishers/google/models/m:generateContent");
        expect((init!.headers as Record<string, string>).authorization).toBe("Bearer fake-token");
        expect(JSON.parse(init!.body as string).tools).toEqual([{ google_search: {} }]);
      }
      if (url === redirect) return new Response(null, { status: 302, headers: { location: "https://www.sec.gov/filing/1" } });
      return new Response(JSON.stringify({
        candidates: [{ groundingMetadata: {
          groundingChunks: [{ web: { uri: redirect, title: "sec.gov" } }, { web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/zzz", title: "blog.example.com" } }, { web: { uri: "https://x.com/no-support", title: "x.com" } }],
          groundingSupports: [
            { segment: { text: "Revenue was $5B." }, groundingChunkIndices: [0] },
            { segment: { text: "Revenue was $5B." }, groundingChunkIndices: [0] },
            { segment: { text: "Some blog claim." }, groundingChunkIndices: [1] },
          ],
        } }],
      }), { status: 200 });
    }));
    const hits = await geminiSearch.search("acme revenue");
    expect(hits[0]).toEqual({ url: "https://www.sec.gov/filing/1", title: "sec.gov", snippet: "Revenue was $5B." });
    // redirect not resolvable (mock returns the JSON body, no location) -> falls back to the domain in the chunk title
    expect(hits[1].url).toBe("https://blog.example.com");
    // chunks with no grounded text are dropped
    expect(hits).toHaveLength(2);
  });

  it("throws on HTTP errors so the caller can fall back", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "proj";
    process.env.GEMINI_MODEL = "m";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    await expect(geminiSearch.search("q")).rejects.toThrow(/500/);
  });
});

describe("configuredProviders", () => {
  it("defaults to Gemini only; tavily/brave are opt-in", () => {
    delete process.env.SEARCH_PROVIDERS;
    expect(configuredProviders().map((p) => p.name)).toEqual(["gemini-google-search"]);
    process.env.SEARCH_PROVIDERS = "gemini, tavily";
    expect(configuredProviders().map((p) => p.name)).toEqual(["gemini-google-search", "tavily"]);
    delete process.env.SEARCH_PROVIDERS;
  });
});
