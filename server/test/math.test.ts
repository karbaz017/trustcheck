import { describe, expect, it } from "vitest";
import { impliedAnnualizedMultiple, impliedAnnualizedReturnPct, mathCheck } from "../src/pipeline/mathCheck.js";

describe("math", () => {
  it("doubling every 30 days is about 4,600x per year", () => {
    const out = impliedAnnualizedMultiple(2, 30);
    expect(out).toBeGreaterThan(4500);
    expect(out).toBeLessThan(4700);
  });
  it("10x in 365 days is 10x", () => {
    expect(impliedAnnualizedMultiple(10, 365)).toBeCloseTo(10);
  });
  it("annualized return pct", () => {
    expect(impliedAnnualizedReturnPct(100, 365)).toBeCloseTo(100);
    expect(impliedAnnualizedReturnPct(10, 30)).toBeCloseTo((Math.pow(1.1, 365 / 30) - 1) * 100);
  });
  it("rejects zero and negative inputs", () => {
    expect(() => impliedAnnualizedMultiple(0, 30)).toThrow();
    expect(() => impliedAnnualizedMultiple(-2, 30)).toThrow();
    expect(() => impliedAnnualizedMultiple(2, 0)).toThrow();
    expect(() => impliedAnnualizedMultiple(2, -5)).toThrow();
    expect(() => impliedAnnualizedReturnPct(-100, 30)).toThrow();
    expect(() => impliedAnnualizedReturnPct(10, 0)).toThrow();
  });
  it("mathCheck builds a card for numeric claims only", () => {
    const m = mathCheck({ type: "numeric", numeric: { kind: "multiple", value: 2, periodDays: 30 } });
    expect(m?.calc).toBe("implied_annualized_multiple");
    expect(m?.text).toContain("4,598x");
    expect(mathCheck({ type: "checkable_fact" })).toBeUndefined();
    expect(mathCheck({ type: "numeric", numeric: { kind: "multiple", value: -1, periodDays: 30 } })).toBeUndefined();
  });
});
