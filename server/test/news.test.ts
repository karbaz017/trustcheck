import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mentions, newsFor, parseGoogleNews, parseSecAtom } from "../src/addons/news/feeds.js";

const NOW = Date.parse("2026-10-24T18:00:00Z");
const item = (title: string, src: string, url: string, date: string, link = `https://news.google.com/rss/articles/${encodeURIComponent(title)}`) =>
  `<item><title>${title} - ${src}</title><link>${link}</link><pubDate>${date}</pubDate><source url="${url}">${src}</source></item>`;
const RSS = `<rss><channel>
${item("Nvidia shares slip as AI financing worries grow", "CNBC", "https://www.cnbc.com", "Sat, 24 Oct 2026 16:00:00 GMT")}
${item("Nvidia &amp; Broadcom: who wins?", "Some Blog", "https://someblog.example", "Sat, 24 Oct 2026 15:00:00 GMT")}
${item("Old news from last week", "Reuters", "https://www.reuters.com", "Sat, 17 Oct 2026 15:00:00 GMT")}
${item("Bad link", "Reuters", "https://www.reuters.com", "Sat, 24 Oct 2026 15:00:00 GMT", "javascript:alert(1)")}
</channel></rss>`;

describe("parseGoogleNews", () => {
  it("parses items, strips the ' - Publisher' suffix, tiers by publisher domain, drops old and unsafe links", () => {
    const items = parseGoogleNews(RSS, "NVDA", NOW);
    expect(items.map((i) => [i.title, i.domain, i.tier])).toEqual([
      ["Nvidia shares slip as AI financing worries grow", "cnbc.com", 2],
      ["Nvidia & Broadcom: who wins?", "someblog.example", 3],
    ]);
    expect(items[0].publishedAt).toBe("2026-10-24T16:00:00.000Z");
  });
});

describe("parseSecAtom", () => {
  it("turns recent 8-K entries into official filing items with the reported Items", () => {
    const atom = `<feed><company-info><conformed-name>NVIDIA CORP</conformed-name></company-info>
      <entry><link href="https://www.sec.gov/Archives/edgar/data/1045810/000104581026000078/0001045810-26-000078-index.htm"/><summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-09-02 Item 1.01: Entry into a Material Definitive Agreement Item 9.01: Financial Statements and Exhibits</summary><updated>2026-10-20T16:05:00-04:00</updated></entry>
      <entry><link href="https://evil.example/x"/><updated>2026-10-20T16:05:00-04:00</updated></entry>
    </feed>`;
    const items = parseSecAtom(atom, "NVDA", NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "filing", tier: 1, domain: "sec.gov", source: "SEC EDGAR" });
    expect(items[0].title).toBe("NVIDIA CORP filed an 8-K: Entry into a Material Definitive Agreement; Financial Statements and Exhibits");
  });
});

describe("relevance", () => {
  it("matches aliases on word boundaries; short aliases are case-sensitive", () => {
    expect(mentions("Apple passes Nvidia as most valuable company", ["NVDA", "Nvidia"])).toBe(true);
    expect(mentions("Is Nike Still a Growth Stock?", ["NVDA", "Nvidia"])).toBe(false);
    expect(mentions("Fed set to pause rates", ["Federal Reserve", "Fed"])).toBe(true);
    expect(mentions("Fans fed up with ticket prices", ["Federal Reserve", "Fed"])).toBe(false);
    expect(mentions("Nvidia's role as AI financier", ["Nvidia"])).toBe(true);
  });
});

describe("newsFor", () => {
  const saved = process.env.SEC_USER_AGENT;
  afterEach(() => { vi.unstubAllGlobals(); saved === undefined ? delete process.env.SEC_USER_AGENT : (process.env.SEC_USER_AGENT = saved); });
  it("keeps only relevant tier 1/2 items, skips SEC without a declared User-Agent, and never fetches article pages", async () => {
    delete process.env.SEC_USER_AGENT;
    delete process.env.GOOGLE_CLOUD_PROJECT; // alias lookup falls back to the topic itself
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const f = vi.fn(async (_url: string) => new Response(RSS, { status: 200 }));
    vi.stubGlobal("fetch", f);
    const items = await newsFor("Nvidia");
    vi.useRealTimers();
    expect(items.map((i) => i.domain)).toEqual(["cnbc.com"]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toMatch(/^https:\/\/news\.google\.com\/rss\/search\?q=%22Nvidia%22%20when%3A1d/);
  });
});

describe("POST /api/news", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let base = "";
  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../src/addons/news/feeds.js", () => ({ newsFor: vi.fn(async (t: string) => [{ id: `id-${t}`, topic: t, title: `${t} headline`, source: "Reuters", domain: "reuters.com", tier: 2, url: "https://news.google.com/x", publishedAt: "2026-10-24T16:00:00.000Z", kind: "news" }]) }));
    const { addons } = await import("../src/addons/index.js");
    process.env.FEATURE_NEWS = "true";
    const app = express();
    app.use(express.json());
    app.use("/api", addons);
    await new Promise<void>((r) => (server = app.listen(0, r)));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterEach(() => { delete process.env.FEATURE_NEWS; server.close(); vi.doUnmock("../src/addons/news/feeds.js"); });
  const post = (b: unknown) => fetch(`${base}/news`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

  it("is off by default (404)", async () => {
    delete process.env.FEATURE_NEWS;
    expect((await post({ topics: ["NVDA"] })).status).toBe(404);
  });
  it("validates topics", async () => {
    expect((await post({ topics: [] })).status).toBe(400);
    expect((await post({ topics: Array.from({ length: 11 }, (_, i) => `T${i}x`) })).status).toBe(400);
    expect((await post({ topics: ["<script>"] })).status).toBe(400);
  });
  it("returns merged items for the watchlist", async () => {
    const body = await (await post({ topics: ["NVDA", "Federal Reserve", "NVDA"] })).json();
    expect(body.items.map((i: { topic: string }) => i.topic).sort()).toEqual(["Federal Reserve", "NVDA"]);
    expect(typeof body.filingsEnabled).toBe("boolean");
  });
});
