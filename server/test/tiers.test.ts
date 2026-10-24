import { describe, expect, it } from "vitest";
import { tierOf } from "../src/pipeline/tierSources.js";

describe("tierOf", () => {
  it("tier 1 for listed domains and subdomains", () => {
    expect(tierOf("https://www.sec.gov/edgar")).toBe(1);
    expect(tierOf("https://data.bls.gov/x")).toBe(1);
  });
  it("tier 1 for any .gov / .mil", () => {
    expect(tierOf("https://example.gov/a")).toBe(1);
    expect(tierOf("https://foo.army.mil/a")).toBe(1);
  });
  it("tier 1 for investor./ir. subdomains", () => {
    expect(tierOf("https://investor.apple.com/news")).toBe(1);
    expect(tierOf("https://ir.tesla.com")).toBe(1);
  });
  it("does not treat a bare ir.com or lookalike as tier 1", () => {
    expect(tierOf("https://ir.com")).toBe(3);
    expect(tierOf("https://sec.gov.evil.com")).toBe(3);
    expect(tierOf("https://notsec.gov.example.com")).toBe(3);
  });
  it("tier 2 for reputable news", () => {
    expect(tierOf("https://www.reuters.com/a")).toBe(2);
    expect(tierOf("https://markets.ft.com/a")).toBe(2);
  });
  it("tier 3 for unknown and malformed", () => {
    expect(tierOf("https://someblog.substack.com/p")).toBe(3);
    expect(tierOf("not a url/")).toBe(3);
    expect(tierOf("")).toBe(3);
  });
  it("does not match on suffix collisions", () => {
    expect(tierOf("https://fakereuters.com")).toBe(3);
  });
});

describe("market sources", () => {
  it("exchanges and the index publisher are primary; established data/research firms are tier 2", () => {
    expect(tierOf("https://www.nasdaq.com/market-activity/stocks/nvda")).toBe(1);
    expect(tierOf("https://www.spglobal.com/spdji/en/indices/equity/sp-500/")).toBe(1);
    expect(tierOf("https://insight.factset.com/x")).toBe(2);
    expect(tierOf("https://finance.yahoo.com/quote/NVDA")).toBe(2);
    expect(tierOf("https://www.yahoo.com/news/x")).toBe(3);
    expect(tierOf("https://seekingalpha.com/x")).toBe(3);
  });
});
