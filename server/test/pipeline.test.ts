import { describe, expect, it } from "vitest";
import { applyStances, validateStanceIds } from "../src/pipeline/classifyStance.js";
import { TEMPLATE_WHY, validateExplanations, writeExplanations } from "../src/pipeline/explain.js";
import { runPipeline, type PipelineDeps } from "../src/pipeline/run.js";
import type { ClaimResult, Evidence } from "../src/types.js";

const ev = (id: string, domain: string, snippet = "Revenue was $94.9 billion in the quarter, reported the company."): Evidence => ({
  id, url: `https://${domain}/a`, domain, title: "T", tier: 3, snippet, retrievedAt: "2026-01-01",
});

describe("stance application", () => {
  const e = [ev("e1", "sec.gov")];
  it("keeps verbatim quotes", () => {
    const out = applyStances(e, { items: [{ id: "e1", stance: "supports", stanceReason: "States revenue.", quote: "Revenue was $94.9 billion" }] });
    expect(out[0].stance).toBe("supports");
    expect(out[0].quote).toBe("Revenue was $94.9 billion");
  });
  it("drops a fabricated quote and downgrades to irrelevant when the reason doesn't point at the snippet", () => {
    const out = applyStances(e, { items: [{ id: "e1", stance: "supports", stanceReason: "Confirms it.", quote: "Revenue was $200 billion" }] });
    expect(out[0].quote).toBeUndefined();
    expect(out[0].stance).toBe("irrelevant");
  });
  it("drops the quote but keeps stance if the reason clearly cites snippet text", () => {
    const out = applyStances(e, { items: [{ id: "e1", stance: "supports", stanceReason: "The snippet says revenue was $94.9 billion.", quote: "made up words" }] });
    expect(out[0].quote).toBeUndefined();
    expect(out[0].stance).toBe("supports");
  });
  it("citation integrity: unknown, duplicate and missing ids are rejected", () => {
    const two = [ev("e1", "a.com"), ev("e2", "b.com")];
    const item = (id: string) => ({ id, stance: "irrelevant" as const, stanceReason: "x", quote: "" });
    expect(validateStanceIds({ items: [item("e1"), item("e9")] }, two)).toMatch(/unknown/);
    expect(validateStanceIds({ items: [item("e1"), item("e1")] }, two)).toMatch(/duplicate/);
    expect(validateStanceIds({ items: [item("e1")] }, two)).toMatch(/missing/);
    expect(validateStanceIds({ items: [item("e1"), item("e2")] }, two)).toBeNull();
  });
});

describe("explanation validation", () => {
  const claim: ClaimResult = { id: "c1", text: "t", type: "checkable_fact", importance: 3, verdict: "supported", evidence: [ev("e1", "sec.gov")], why: "" };
  it("rejects unknown evidence ids, advice and missing claims", () => {
    expect(validateExplanations({ claims: [{ id: "c1", why: "See [e2]." }], whyOverall: "ok" }, [claim])).toMatch(/unknown evidence/);
    expect(validateExplanations({ claims: [{ id: "c1", why: "You should buy it." }], whyOverall: "ok" }, [claim])).toMatch(/advice/);
    expect(validateExplanations({ claims: [], whyOverall: "ok" }, [claim])).toMatch(/missing/);
    expect(validateExplanations({ claims: [{ id: "c1", why: "Backed by [e1]." }], whyOverall: "Holds up, see e1" }, [claim])).toMatch(/ids/);
    expect(validateExplanations({ claims: [{ id: "c1", why: "Backed by [e1]." }], whyOverall: "Looks well supported." }, [claim])).toBeNull();
    expect(validateExplanations({ claims: [{ id: "c1", why: "Backed by [e1]." }], whyOverall: "The result is 'needs_checking' because it is an opinion." }, [claim])).toMatch(/internal code name/);
    expect(validateExplanations({ claims: [{ id: "c1", why: "Marked not_checkable [e1]." }], whyOverall: "Fine." }, [claim])).toMatch(/internal code name/);
    expect(validateExplanations({ claims: [{ id: "c1", why: "Only tier 3 sources were found [e1]." }], whyOverall: "Fine." }, [claim])).toMatch(/jargon 'tier'/);
    expect(validateExplanations({ claims: [{ id: "c1", why: "It is below $100,000,,,,,,. [e1]" }], whyOverall: "Fine." }, [claim])).toMatch(/garbled/);
    expect(validateExplanations({ claims: [{ id: "c1", why: "It trades near $80,000, below $100,000 [e1]..." }], whyOverall: "Fine." }, [claim])).toBeNull();
  });
  it("falls back to templates when the model is unavailable", async () => {
    delete process.env.GOOGLE_CLOUD_PROJECT;
    const out = await writeExplanations([claim], "holds_up", 100, []);
    expect(out.usedTemplate).toBe(true);
    expect(out.claims[0].why).toBe(TEMPLATE_WHY.supported);
  });
});

describe("pipeline with stubbed AI and search", () => {
  const deps = (stanceFor: "supports" | "irrelevant", domain: string): PipelineDeps => ({
    extract: async () => [
      { text: "Acme turned $1,000 into $2,000 in 30 days", type: "numeric", importance: 3, numeric: { kind: "multiple", value: 2, periodDays: 30 }, queries: ["q1", "q2"] },
      { text: "Acme will double again", type: "forecast", importance: 2, queries: ["q3", "q4"] },
    ],
    retrieve: async () => [ev("e1", domain)],
    stance: async (_c, evidence) => evidence.map((e) => ({ ...e, stance: stanceFor })),
    explain: async (claims, label) => ({ claims: claims.map((c) => ({ ...c, why: "w" })), whyOverall: label, usedTemplate: false }),
  });

  it("tier 1 support -> supported, forecast not_checkable, math card, hype flags, label", async () => {
    const stages: string[] = [];
    const r = await runPipeline("GUARANTEED returns!", { deps: deps("supports", "sec.gov"), onProgress: (e) => e.status === "done" && stages.push(e.stage) });
    expect(r.claims[0].verdict).toBe("supported");
    expect(r.claims[0].math?.output).toBeGreaterThan(4500);
    expect(r.claims[1].verdict).toBe("not_checkable");
    expect(r.claims[1].evidence).toEqual([]);
    expect(r.hypeFlags).toEqual(["guaranteed"]);
    expect(r.label).toBe("holds_up");
    expect(stages).toEqual(["extract", "math", "search", "tier", "stance", "verdict", "hype", "aggregate", "explain"]);
    expect(Object.keys(r.timings)).toContain("search");
  });
  it("every step reports a readable result, and search reports queries and tool calls as they happen", async () => {
    const d = deps("supports", "sec.gov");
    d.live = async (_c, onCall) => { onCall?.({ name: "get_crypto_price", args: { coin: "bitcoin" }, ok: true, summary: "price $80,000", ms: 5 }); return []; };
    const events: { stage: string; status: string; message?: string; lines?: string[]; tool?: unknown }[] = [];
    await runPipeline("x", { deps: d, onProgress: (e) => events.push(e) });
    for (const e of events.filter((x) => x.status === "start" || x.status === "done")) expect(e.message, `${e.stage} ${e.status}`).toBeTruthy();
    expect(events.find((e) => e.stage === "extract" && e.status === "done")!.lines![0]).toMatch(/^1\. \[Numbers\]/);
    expect(events.find((e) => e.status === "info" && /searching/.test(e.message!))!.lines).toEqual(["“q1”", "“q2”"]);
    expect(events.find((e) => e.status === "info" && e.tool)!.message).toMatch(/called get_crypto_price/);
    expect(events.find((e) => e.stage === "verdict" && e.status === "done")!.lines).toEqual(["Claim 1: Supported", "Claim 2: Can't be verified"]);
  });
  it("tier 3 only -> unverifiable -> needs_checking", async () => {
    const r = await runPipeline("x", { deps: deps("supports", "randomblog.xyz") });
    expect(r.claims[0].verdict).toBe("unverifiable");
    expect(r.label).toBe("needs_checking");
  });
  it("search failure -> unverifiable with a visible limitation", async () => {
    const d = deps("supports", "sec.gov");
    d.retrieve = async () => { throw new Error("down"); };
    const r = await runPipeline("x", { deps: d });
    expect(r.claims[0].verdict).toBe("unverifiable");
    expect(r.limitations.join(" ")).toMatch(/Search was unavailable/);
  });
  it("stance failure never yields a verdict from unvalidated output", async () => {
    const d = deps("supports", "sec.gov");
    d.stance = async () => { throw new Error("invalid"); };
    const r = await runPipeline("x", { deps: d });
    expect(r.claims[0].verdict).toBe("unverifiable");
  });
});

describe("pipeline with live data tools", () => {
  const baseDeps = (): PipelineDeps => ({
    extract: async () => [{ text: "Bitcoin is above $100,000", type: "numeric", importance: 3, queries: ["q1", "q2"] }],
    retrieve: async () => [ev("e1", "blog.example")],
    stance: async (_c, evidence) => evidence.map((e) => ({ ...e, stance: e.live ? "contradicts" : "irrelevant" })),
    explain: async (claims, label) => ({ claims: claims.map((c) => ({ ...c, why: "w" })), whyOverall: label, usedTemplate: false }),
    live: async () => [{ live: true, url: "https://www.coingecko.com/en/coins/bitcoin", title: "Live price", snippet: "price $80,508.00" }],
  });
  it("live evidence is appended with the next id, marked live, tiered by domain, and can decide with other reliable sources", async () => {
    const r = await runPipeline("x", { deps: baseDeps() });
    const live = r.claims[0].evidence.find((e) => e.live)!;
    expect(live.id).toBe("e2");
    expect(live.tier).toBe(2);
    expect(r.claims[0].verdict).toBe("mixed"); // one tier-2 source (weight 2) is below the refute threshold of 3
  });
  it("search failure with live data still yields evidence and no 'search unavailable' note", async () => {
    const d = baseDeps();
    d.retrieve = async () => { throw new Error("down"); };
    const r = await runPipeline("x", { deps: d });
    expect(r.claims[0].evidence).toHaveLength(1);
    expect(r.limitations.join(" ")).not.toMatch(/Search was unavailable/);
  });
});
