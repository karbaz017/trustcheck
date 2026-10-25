import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cryptoPriceTool } from "../src/tools/coingecko.js";
import { finnhubQuote, quoteText, stockQuoteTool } from "../src/tools/finnhub.js";
import { economicSeriesTool } from "../src/tools/fred.js";
import { excerpt, secFilingsTool } from "../src/tools/sec.js";
import { MAX_TOOL_CALLS, liveEvidenceFor, validateCalls } from "../src/tools/planner.js";
import { availableTools } from "../src/tools/registry.js";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const ENV = ["FINNHUB_API_KEY", "SEC_USER_AGENT", "FEATURE_LIVE_DATA", "GOOGLE_CLOUD_PROJECT"];
let saved: Record<string, string | undefined> = {};
beforeEach(() => { saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]])); ENV.forEach((k) => delete process.env[k]); });
afterEach(() => { vi.unstubAllGlobals(); ENV.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))); });

describe("Finnhub stock quote", () => {
  it("formats an exact quote from the feed; key goes in a header, not the URL", async () => {
    process.env.FINNHUB_API_KEY = "k";
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).not.toContain("token=");
      expect((init!.headers as Record<string, string>)["X-Finnhub-Token"]).toBe("k");
      return url.includes("/quote") ? json({ c: 210.96, d: -0.97, dp: -0.4557, h: 213.4, l: 208.1, o: 212, pc: 211.93, t: 1792872000 })
        : json({ metric: { "52WeekHigh": 243.37, "52WeekLow": 164.27, marketCapitalization: 5150000 } });
    });
    vi.stubGlobal("fetch", f);
    const hits = await stockQuoteTool({ symbol: "nvda" });
    expect(hits[0].snippet).toMatch(/price \$210\.96; change -\$0\.97 \(-0\.46%\) from previous close \$211\.93/);
    expect(hits[0].snippet).toMatch(/52-week range \$164\.27 to \$243\.37; market cap about \$5\.15 trillion/);
    expect(hits[0].live).toBe(true);
  });
  it("rejects bad symbols and unknown tickers; off without a key", async () => {
    process.env.FINNHUB_API_KEY = "k";
    await expect(finnhubQuote("../etc")).rejects.toThrow(/invalid symbol/);
    vi.stubGlobal("fetch", vi.fn(async () => json({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 })));
    await expect(finnhubQuote("ZZZZ")).rejects.toThrow(/unknown symbol/);
    delete process.env.FINNHUB_API_KEY;
    expect(availableTools()).not.toContain("get_stock_quote");
  });
  it("quoteText omits fields that are missing instead of guessing", () => {
    expect(quoteText({ provider: "Finnhub", symbol: "X", price: 10, asOf: "2026-10-23T20:00:00.000Z", url: "u" })).toBe("Finnhub market data for X at 2026-10-23 20:00 UTC: price $10.00.");
  });
});

describe("CoinGecko crypto price", () => {
  it("resolves a symbol to an id and reports price and changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/search")) return json({ coins: [{ id: "bitcoin", symbol: "btc", market_cap_rank: 1 }, { id: "bitcoin-cash", symbol: "bch", market_cap_rank: 20 }] });
      if (url.includes("ids=btc")) return json([]);
      return json([{ id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 80508, market_cap: 1.6e12, high_24h: 81500, low_24h: 79800, ath: 126000, ath_date: "2025-10-06T00:00:00Z", last_updated: "2026-10-24T18:00:00Z", price_change_percentage_24h_in_currency: -0.63, price_change_percentage_7d_in_currency: -3.2, price_change_percentage_30d_in_currency: -8.4 }]);
    }));
    const [h] = await cryptoPriceTool({ coin: "BTC" });
    expect(h.url).toBe("https://www.coingecko.com/en/coins/bitcoin");
    expect(h.snippet).toMatch(/Bitcoin \(BTC\).*price \$80,508\.00; 24-hour change -0\.63%; 7-day change -3\.20%; 30-day change -8\.40%/);
    expect(h.snippet).toMatch(/all-time high \$126,000\.00 on 2025-10-06/);
  });
});

describe("SEC filings", () => {
  const efts = { hits: { hits: [{ _id: "0001045810-26-000078:nvda-20260902.htm", _source: { ciks: ["0001045810"], display_names: ["NVIDIA CORP  (NVDA)  (CIK 0001045810)"], file_date: "2026-09-02", form: "8-K" } }, { _id: "../../evil:x", _source: { ciks: ["1"] } }] } };
  it("is off until SEC_USER_AGENT is set", async () => {
    expect(availableTools()).not.toContain("search_sec_filings");
    await expect(secFilingsTool({ phrase: "Hugging Face" })).rejects.toThrow(/SEC_USER_AGENT/);
  });
  it("searches, builds a safe filing URL, sends the declared User-Agent, and excerpts around the phrase", async () => {
    process.env.SEC_USER_AGENT = "Verifin test contact@example.com";
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      expect((init!.headers as Record<string, string>)["User-Agent"]).toBe("Verifin test contact@example.com");
      if (url.startsWith("https://efts.sec.gov/")) return json(efts);
      return new Response("<html><body><p>On September 2, 2026, NVIDIA Corporation entered into an agreement to acquire Hugging Face, Inc. The transaction is expected to close in the first half of 2027.</p></body></html>", { status: 200, headers: { "content-type": "text/html" } });
    }));
    const hits = await secFilingsTool({ phrase: "Hugging Face", company: "NVIDIA" });
    expect(urls[0]).toContain(encodeURIComponent('"Hugging Face" "NVIDIA"'));
    expect(urls[1]).toBe("https://www.sec.gov/Archives/edgar/data/1045810/000104581026000078/nvda-20260902.htm");
    expect(urls).toHaveLength(2); // the malformed second hit is never fetched
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("SEC filing: NVIDIA CORP (NVDA) (CIK 0001045810), Form 8-K, filed 2026-09-02");
    expect(hits[0].snippet).toMatch(/entered into an agreement to acquire Hugging Face/);
  });
  it("excerpt returns null when the phrase is absent", () => expect(excerpt("nothing here", "Hugging Face")).toBeNull());
});

describe("FRED economic data (public CSV, no key)", () => {
  it("is available without a key and reports the latest value; CPI year-over-year is computed in code", async () => {
    expect(availableTools()).toContain("get_economic_series");
    const f = vi.fn(async (url: string) => {
      expect(url).toMatch(/^https:\/\/fred\.stlouisfed\.org\/graph\/fredgraph\.csv\?id=CPIAUCSL&cosd=\d{4}-01-01$/);
      return new Response("observation_date,CPIAUCSL\n2025-09-01,320.0\n2025-10-01,.\n2026-08-01,329.0\n2026-09-01,330.0\n", { status: 200 });
    });
    vi.stubGlobal("fetch", f);
    const [h] = await economicSeriesTool({ series_id: "CPIAUCSL" });
    expect(h.url).toBe("https://fred.stlouisfed.org/series/CPIAUCSL");
    expect(h.snippet).toMatch(/330\.0 for 2026-09-01 \(latest\)\. That is 3\.1% higher than 2025-09-01/);
  });
  it("percent series get a % sign", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("observation_date,DFEDTARU\n2026-10-23,4.00\n2026-10-24,4.00\n", { status: 200 })));
    const [h] = await economicSeriesTool({ series_id: "DFEDTARU" });
    expect(h.snippet).toMatch(/: 4\.00% for 2026-10-24 \(latest\)/);
  });
  it("only allow-listed series", async () => {
    await expect(economicSeriesTool({ series_id: "ANYTHING" })).rejects.toThrow(/unsupported/);
  });
});

describe("planner safety", () => {
  it("validateCalls keeps only allowed tools with valid args, de-duplicated, capped", () => {
    const allowed = ["get_crypto_price", "get_stock_quote"];
    const calls = validateCalls([
      { name: "delete_everything", args: {} },
      { name: "get_stock_quote", args: {} },
      { name: "get_crypto_price", args: { coin: "bitcoin" } },
      { name: "get_crypto_price", args: { coin: "bitcoin" } },
      { name: "search_sec_filings", args: { phrase: "Hugging Face" } },
      { name: "get_crypto_price", args: { coin: "eth" } },
      { name: "get_stock_quote", args: { symbol: "NVDA" } },
      { name: "get_stock_quote", args: { symbol: "AAPL" } },
    ], allowed);
    expect(calls.map((c) => `${c.name}:${JSON.stringify(c.args)}`)).toEqual([
      'get_crypto_price:{"coin":"bitcoin"}', 'get_crypto_price:{"coin":"eth"}', 'get_stock_quote:{"symbol":"NVDA"}',
    ]);
    expect(calls.length).toBeLessThanOrEqual(MAX_TOOL_CALLS);
  });
  it("does nothing when the live-data feature is off", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await liveEvidenceFor("Bitcoin is above $100,000")).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});
