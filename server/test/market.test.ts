import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { annotate } from "../src/addons/market/research.js";
import { computeOutlook } from "../src/addons/market/outlook.js";
import { sanitize, segmentsBySource, supportedBy } from "../src/addons/market/structure.js";
import type { MarketBrief, MarketSource } from "../src/addons/market/types.js";

const src = (id: string, domain: string, tier: 1 | 2 | 3): MarketSource => ({ id, url: `https://${domain}/x`, domain, title: domain, tier });
const SOURCES = [src("s1", "nasdaq.com", 1), src("s2", "reuters.com", 2), src("s3", "blog.example", 3), src("s4", "other.example", 3), src("s5", "factset.com", 2)];
const drv = (direction: "up" | "down" | "mixed" | "unclear", ids: string[], headline = `${direction} ${ids.join()}`): MarketBrief["drivers"][number] =>
  ({ headline, explanation: "e", direction, sourceIds: ids });

describe("computeOutlook (code decides)", () => {
  it("strong upward drivers lean toward an 'up' prediction and against a 'down' one", () => {
    const d = [drv("up", ["s1"]), drv("up", ["s2"]), drv("down", ["s3"])];
    expect(computeOutlook(d, SOURCES, { text: "X will rise", direction: "up" }).verdict).toBe("leans_toward");
    const against = computeOutlook(d, SOURCES, { text: "X will fall", direction: "down" });
    expect(against.verdict).toBe("leans_against");
    expect(against.upWeight).toBe(5);
    expect(against.downWeight).toBe(0.5);
    expect(against.headline).toMatch(/point upward, the opposite direction to “X will fall”/);
    expect(computeOutlook(d, SOURCES, { text: "X will soar", direction: "up" }).headline).toMatch(/say nothing about how far or how fast/);
  });
  it("tier 3 alone can never make it lean (capped, so stays insufficient)", () => {
    const d = [drv("up", ["s3"]), drv("up", ["s4"]), drv("up", ["s3"])];
    expect(computeOutlook(d, SOURCES, { direction: "up" }).verdict).toBe("insufficient");
  });
  it("each source domain counts once per side", () => {
    const d = [drv("up", ["s2"]), drv("up", ["s2"]), drv("up", ["s2"])];
    expect(computeOutlook(d, SOURCES, { direction: "up" }).upWeight).toBe(2);
  });
  it("comparable weight on both sides is mixed; mixed drivers add half to each side", () => {
    expect(computeOutlook([drv("up", ["s1"]), drv("down", ["s2"])], SOURCES, { direction: "up" }).verdict).toBe("mixed");
    const m = computeOutlook([drv("mixed", ["s1"])], SOURCES, { direction: "down" });
    expect([m.upWeight, m.downWeight]).toEqual([1.5, 1.5]);
    expect(m.verdict).toBe("mixed");
  });
  it("no prediction: reports the balance only, never a verdict on a claim", () => {
    const o = computeOutlook([drv("down", ["s1"]), drv("down", ["s5"])], SOURCES, { direction: "none" });
    expect(o.verdict).toBe("no_prediction");
    expect(o.balance).toBe("leans_down");
    expect(o.headline).toMatch(/downward pressure/);
  });
  it("unknown source ids are ignored; caveat always present and never advice", () => {
    const o = computeOutlook([drv("up", ["s99"])], SOURCES, { direction: "up" });
    expect(o.verdict).toBe("insufficient");
    expect(o.caveat).toMatch(/not a forecast, a probability, or advice/);
    expect(JSON.stringify(o)).not.toMatch(/\b(you should|buy now|sell now|we recommend)\b/i);
  });
});

describe("sanitize (no invented numbers, citations or advice)", () => {
  const notes = "NVDA price closed at $210.96 on October 23, 2026 [S1]. Revenue was $96.2 billion [S2]. Analysts rate NVIDIA a consensus Buy [S2]. Supporters cite strong datacenter demand [S2].";
  const base = { subject: { name: "NVIDIA", ticker: "NVDA", assetType: "stock" as const }, snapshot: [] as { label: string; value: string; asOf?: string; sourceIds: string[] }[], drivers: [], fundamentals: [], analysts: [], upcoming: [], bullCase: [], bearCase: [], risks: [], notFound: [], prediction: undefined, predictionDirection: "none" as const };
  it("keeps cited items whose numbers appear in the notes", () => {
    const { brief, dropped } = sanitize({ ...base, snapshot: [{ label: "NVDA price closed", value: "$210.96", asOf: "Oct 23", sourceIds: ["s1"] }] }, SOURCES, notes);
    expect(brief.snapshot).toHaveLength(1);
    expect(dropped).toBe(0);
  });
  it("drops a number the notes never mention", () => {
    const { brief, dropped } = sanitize({ ...base, snapshot: [{ label: "NVDA price closed", value: "$250.00", sourceIds: ["s1"] }] }, SOURCES, notes);
    expect(brief.snapshot).toHaveLength(0);
    expect(dropped).toBe(1);
  });
  it("drops items citing unknown sources or none", () => {
    const { brief } = sanitize({ ...base, risks: [{ point: "Chip export rules", sourceIds: ["s42"] }, { point: "Competition", sourceIds: [] }] }, SOURCES, notes);
    expect(brief.risks).toHaveLength(0);
  });
  it("drops advice-like text even when cited", () => {
    const { brief } = sanitize({ ...base, bullCase: [{ point: "Supporters cite strong datacenter demand, so you should buy this stock now", sourceIds: ["s2"] }] }, SOURCES, notes);
    expect(brief.bullCase).toHaveLength(0);
  });
  it("normalizes citation ids and de-duplicates them", () => {
    const { brief } = sanitize({ ...base, analysts: [{ statement: "Analysts rate NVIDIA a consensus Buy", sourceIds: ["S2", "s2"] }] }, SOURCES, notes);
    expect(brief.analysts[0].sourceIds).toEqual(["s2"]);
  });
});

describe("citation must match what the source was linked to", () => {
  const notes = "NVIDIA guided Q3 revenue to $108 billion. [S1] Some investors worry about AI financing costs and custom chips. [S3]";
  it("maps grounded sentences to source ids", () => {
    const m = segmentsBySource(notes);
    expect(m.get("s1")).toMatch(/guided Q3 revenue/);
    expect(m.get("s3")).toMatch(/AI financing/);
    expect(m.get("s1")).not.toMatch(/financing/);
  });
  it("keeps a correct citation and drops a misattributed one", () => {
    const m = segmentsBySource(notes);
    expect(supportedBy("Concerns about AI financing costs", m.get("s3"))).toBe(true);
    expect(supportedBy("Concerns about AI financing costs", m.get("s1"))).toBe(false);
  });
  it("sanitize removes the wrong source and keeps the item under the right one", () => {
    const base = { subject: { name: "N", assetType: "stock" as const }, snapshot: [], fundamentals: [], analysts: [], upcoming: [], bullCase: [], bearCase: [], risks: [], notFound: [], predictionDirection: "none" as const };
    const { brief } = sanitize({ ...base, drivers: [{ headline: "AI financing worries", explanation: "Investors worry about AI financing costs", direction: "down", sourceIds: ["s1", "s3"] }] }, SOURCES, notes);
    expect(brief.drivers[0].sourceIds).toEqual(["s3"]);
    const { brief: b2, dropped } = sanitize({ ...base, drivers: [{ headline: "AI financing worries", explanation: "Investors worry about AI financing costs", direction: "down", sourceIds: ["s1"] }] }, SOURCES, notes);
    expect(b2.drivers).toHaveLength(0);
    expect(dropped).toBe(1);
  });
});

describe("annotate", () => {
  it("inserts [S#] markers at byte offsets, including after multi-byte text", () => {
    const text = "Price fell — sharply. Earnings rose.";
    const firstEnd = Buffer.byteLength("Price fell — sharply.");
    const out = annotate(text, [{ segment: { endIndex: firstEnd }, groundingChunkIndices: [0] }, { segment: { endIndex: Buffer.byteLength(text) }, groundingChunkIndices: [1, 0] }], (i) => `s${i + 1}`);
    expect(out).toBe("Price fell — sharply. [S1] Earnings rose. [S2][S1]");
  });
});

describe("POST /api/market-brief", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let base = "";
  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("../src/addons/market/research.js", () => ({ researchMarket: vi.fn(async () => { throw new Error("offline"); }), annotate }));
    const { addons } = await import("../src/addons/index.js");
    process.env.FEATURE_MARKET = "true";
    const app = express();
    app.use(express.json());
    app.use("/api", addons);
    await new Promise<void>((r) => (server = app.listen(0, r)));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterEach(() => { delete process.env.FEATURE_MARKET; server.close(); vi.doUnmock("../src/addons/market/research.js"); });
  const post = (b: unknown) => fetch(`${base}/market-brief`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

  it("is off by default (404)", async () => {
    delete process.env.FEATURE_MARKET;
    expect((await post({ query: "NVDA" })).status).toBe(404);
  });
  it("validates the query", async () => {
    expect((await post({ query: "" })).status).toBe(400);
    expect((await post({ query: "x".repeat(301) })).status).toBe(400);
  });
  it("streaming endpoint sends progress lines then a clean error when research is unavailable", async () => {
    const res = await fetch(`${base}/market-brief/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "NVDA" }) });
    expect(res.headers.get("content-type")).toMatch(/ndjson/);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ type: "progress", stage: "research", status: "start" });
    expect(lines.at(-1)).toMatchObject({ type: "error" });
    expect(lines.at(-1).message).not.toMatch(/offline/); // internal error text never leaks
  });
  it("fails cleanly (502, no details) when research is unavailable", async () => {
    const res = await post({ query: "NVDA" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/couldn't build a briefing/);
  });
});
