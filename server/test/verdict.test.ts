import { describe, expect, it } from "vitest";
import { decideVerdict } from "../src/pipeline/verdict.js";
import type { Evidence, Stance } from "../src/types.js";

let n = 0;
const ev = (tier: 1 | 2 | 3, stance: Stance, domain = `d${n++}.com`): Evidence => ({
  id: `e${n}`, url: `https://${domain}/x`, domain, title: "t", tier, snippet: "s", retrievedAt: "2026-01-01", stance,
});

describe("decideVerdict", () => {
  it("forecast and opinion are not_checkable regardless of evidence", () => {
    expect(decideVerdict("forecast", [ev(1, "supports")]).verdict).toBe("not_checkable");
    expect(decideVerdict("opinion", [ev(1, "contradicts")]).verdict).toBe("not_checkable");
  });
  it("no evidence is unverifiable", () => {
    expect(decideVerdict("checkable_fact", []).verdict).toBe("unverifiable");
  });
  it("tier 3 alone can never be supported or refuted", () => {
    const many = Array.from({ length: 10 }, () => ev(3, "supports"));
    expect(decideVerdict("checkable_fact", many).verdict).toBe("unverifiable");
    const manyC = Array.from({ length: 10 }, () => ev(3, "contradicts"));
    expect(decideVerdict("checkable_fact", manyC).verdict).toBe("unverifiable");
  });
  it("irrelevant tier 1/2 does not unlock a verdict", () => {
    const e = [ev(1, "irrelevant"), ...Array.from({ length: 5 }, () => ev(3, "supports"))];
    expect(decideVerdict("checkable_fact", e).verdict).toBe("unverifiable");
  });
  it("one tier 1 source supports (S=3)", () => {
    expect(decideVerdict("checkable_fact", [ev(1, "supports")]).verdict).toBe("supported");
  });
  it("one tier 1 refutes", () => {
    expect(decideVerdict("numeric", [ev(1, "contradicts")]).verdict).toBe("refuted");
  });
  it("tier 2 + tier 3 reaches supported only by combined weight", () => {
    expect(decideVerdict("checkable_fact", [ev(2, "supports"), ev(3, "supports")]).verdict).toBe("mixed"); // 2.5
    expect(decideVerdict("checkable_fact", [ev(2, "supports"), ev(2, "supports")]).verdict).toBe("supported"); // 4
  });
  it("tier 3 contribution is capped at 1.0", () => {
    const e = [ev(2, "supports"), ...Array.from({ length: 6 }, () => ev(3, "supports"))];
    expect(decideVerdict("checkable_fact", e).S).toBe(3); // 2 + cap 1
  });
  it("each domain counts once", () => {
    const e = [ev(2, "supports", "reuters.com"), ev(2, "supports", "reuters.com")];
    expect(decideVerdict("checkable_fact", e).S).toBe(2);
    expect(decideVerdict("checkable_fact", e).verdict).toBe("mixed");
  });
  it("conflicting strong sources are mixed", () => {
    expect(decideVerdict("checkable_fact", [ev(1, "supports"), ev(1, "contradicts")]).verdict).toBe("mixed");
  });
  it("mixed stance adds half weight to both sides", () => {
    const d = decideVerdict("checkable_fact", [ev(1, "mixed")]);
    expect(d.S).toBe(1.5);
    expect(d.C).toBe(1.5);
    expect(d.verdict).toBe("mixed");
  });
  it("supported blocked when contradiction exceeds 1", () => {
    expect(decideVerdict("checkable_fact", [ev(1, "supports"), ev(2, "contradicts")]).verdict).toBe("mixed");
  });
});
