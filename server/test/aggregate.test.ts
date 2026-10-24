import { describe, expect, it } from "vitest";
import { aggregate, bandOf, buildLimitations, buildReasons } from "../src/pipeline/aggregate.js";
import type { ClaimResult, ClaimVerdict } from "../src/types.js";

const c = (verdict: ClaimVerdict, importance: 1 | 2 | 3 = 3): ClaimResult => ({
  id: "c", text: "t", type: "checkable_fact", importance, verdict, evidence: [], why: "",
});

describe("aggregate", () => {
  it("no checkable claims -> insufficient / needs_checking", () => {
    const r = aggregate([c("not_checkable")], 0);
    expect(r.strength).toEqual({ score: 0, band: "insufficient" });
    expect(r.label).toBe("needs_checking");
    expect(aggregate([], 0).label).toBe("needs_checking");
  });
  it("rule 1: importance-3 refuted -> doesnt_hold_up, even with many hype flags", () => {
    expect(aggregate([c("refuted"), c("supported")], 5).label).toBe("doesnt_hold_up");
  });
  it("rule 2: importance-3 unverifiable or mixed -> needs_checking", () => {
    expect(aggregate([c("unverifiable")], 0).label).toBe("needs_checking");
    expect(aggregate([c("mixed")], 0).label).toBe("needs_checking");
  });
  it("rule 2: 3+ hype flags -> needs_checking even if supported", () => {
    expect(aggregate([c("supported")], 3).label).toBe("needs_checking");
  });
  it("rule 3: all central supported, <2 hype flags -> holds_up", () => {
    expect(aggregate([c("supported")], 0).label).toBe("holds_up");
    expect(aggregate([c("supported")], 1).label).toBe("holds_up");
    expect(aggregate([c("supported")], 2).label).toBe("needs_checking");
  });
  it("lower-importance refuted claim does not trigger rule 1", () => {
    expect(aggregate([c("supported", 3), c("refuted", 1)], 0).label).toBe("holds_up");
  });
  it("score is importance-weighted over checkable claims, not_checkable excluded", () => {
    const r = aggregate([c("supported", 3), c("refuted", 1), c("not_checkable", 3)], 0);
    expect(r.strength.score).toBe(75); // (300 + 0) / 4
    expect(r.strength.band).toBe("strong");
  });
  it("bands", () => {
    expect(bandOf(75)).toBe("strong");
    expect(bandOf(74)).toBe("moderate");
    expect(bandOf(50)).toBe("moderate");
    expect(bandOf(49)).toBe("weak");
    expect(bandOf(25)).toBe("weak");
    expect(bandOf(24)).toBe("insufficient");
  });
  it("limitations always mention sources, date and the decision caveat", () => {
    const l = buildLimitations([{ ...c("not_checkable"), type: "forecast" }], "2026-10-24T00:00:00Z");
    expect(l[0]).toContain("0 sources");
    expect(l[0]).toContain("2026-10-24");
    expect(l.join(" ")).toContain("does not make something a good decision");
    expect(l.join(" ")).toContain("Forecasts");
  });
});

describe("buildReasons", () => {
  const evd = (id: string, domain: string, tier: 1 | 2 | 3, stance: "supports" | "contradicts", quote?: string) => ({
    id, url: `https://${domain}/a`, domain, title: "t", tier, snippet: "s", retrievedAt: "x", stance, quote,
  });
  it("explains a refuted central claim with sources and quote, marked decisive", () => {
    const claim = { ...c("refuted"), text: "X doubles monthly", evidence: [evd("e1", "sec.gov", 1, "contradicts", "no such returns"), evd("e2", "reuters.com", 2, "contradicts")] };
    const r = buildReasons([claim], [], "doesnt_hold_up");
    expect(r[0]).toMatchObject({ kind: "contradicted", decisive: true, evidenceId: "e1", quote: "no such returns" });
    expect(r[0].text).toContain("sec.gov (primary source)");
    expect(r[0].text).toContain("reuters.com (reputable news)");
  });
  it("explains unverifiable: tier-3-only vs nothing found", () => {
    const none = buildReasons([c("unverifiable")], [], "needs_checking");
    expect(none[0].text).toMatch(/no primary source/i);
    const low = buildReasons([{ ...c("unverifiable"), evidence: [evd("e1", "blog.xyz", 3, "supports")] }], [], "needs_checking");
    expect(low[0].text).toMatch(/low-reliability/);
    expect(low[0].decisive).toBe(true);
  });
  it("adds math, hype (2+) and not_checkable reasons; non-central refuted is not decisive", () => {
    const num = { ...c("supported"), math: { calc: "implied_annualized_multiple" as const, inputs: {}, output: 4598, text: "Gaining 2x every 30 days implies about 4,598x in one year." } };
    const r = buildReasons([num, { ...c("refuted", 1) }, { ...c("not_checkable", 2), type: "forecast" }], ["guaranteed", "10x"], "holds_up");
    expect(r.map((x) => x.kind)).toEqual(expect.arrayContaining(["math", "hype", "not_checkable", "contradicted"]));
    expect(r.find((x) => x.kind === "contradicted")!.decisive).toBe(false);
    expect(r.find((x) => x.kind === "hype")!.decisive).toBe(false);
  });
  it("all forecasts/opinions: one plain, decisive reason (no duplicate, no 'no checkable claims' wording)", () => {
    const r = buildReasons([{ ...c("not_checkable", 3), type: "opinion" }], [], "needs_checking");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: "not_checkable", decisive: true });
    expect(r[0].text).toMatch(/opinion/);
    expect(buildReasons([], [], "needs_checking")[0].text).toMatch(/didn't find any claims/);
  });
  it("never emits advice phrasing", async () => {
    const { containsAdvice } = await import("../src/pipeline/validators.js");
    const all = buildReasons([{ ...c("refuted"), evidence: [evd("e1", "sec.gov", 1, "contradicts")] }, c("mixed", 2), c("unverifiable", 1)], ["guaranteed", "secret"], "doesnt_hold_up");
    all.forEach((x) => expect(containsAdvice(x.text)).toBe(false));
  });
});
