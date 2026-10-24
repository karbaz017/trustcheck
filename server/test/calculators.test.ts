import { describe, expect, it } from "vitest";
import { impliedAnnualizedMultiple } from "../src/pipeline/mathCheck.js";
import {
  aprToApy, apyToApr, CalcError, compoundGrowth, evaluateCalc, feeDrag, loanPayment, requiredAnnualReturn, totalInterest,
} from "../src/pipeline/calculators.js";

const near = (got: number, want: number, tol = 0.005) => expect(Math.abs(got - want) / Math.abs(want)).toBeLessThan(tol);

// Vectors below were checked against an independent implementation (separate Python script) before committing.
describe("spec vectors", () => {
  it("implied_annualized_multiple(2, 30) ~ 4,598", () => near(impliedAnnualizedMultiple(2, 30), 4598));
  it("loan_payment(10000, 6, 60) ~ 193.33", () => near(loanPayment(10000, 6, 60), 193.33));
  it("apr_to_apy(12, 12) ~ 12.68", () => near(aprToApy(12, 12), 12.68));
  it("compound_growth(0, 100, 7, 30) ~ 122,000", () => near(compoundGrowth(0, 100, 7, 30), 122000));
});

describe("other calculators", () => {
  it("apy_to_apr inverts apr_to_apy", () => near(apyToApr(aprToApy(9, 12), 12), 9, 1e-9));
  it("total_interest = payments - principal", () => near(totalInterest(10000, 6, 60), 193.328 * 60 - 10000, 1e-3));
  it("zero-rate loan and growth are linear", () => {
    expect(loanPayment(1200, 0, 12)).toBe(100);
    expect(compoundGrowth(1000, 100, 0, 1)).toBe(2200);
  });
  it("required_annual_return doubles in 10y ~ 7.18%", () => near(requiredAnnualReturn(1000, 2000, 10), 7.177, 0.001));
  it("fee_drag is positive when fee A is lower, and grows with time", () => {
    const short = feeDrag(500, 7, 0.1, 1, 10);
    const long = feeDrag(500, 7, 0.1, 1, 30);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short * 3);
    expect(feeDrag(500, 7, 1, 1, 30)).toBeCloseTo(0, 6);
  });
});

describe("edge cases are rejected with a clear error", () => {
  it.each([
    ["zero principal loan", () => loanPayment(0, 6, 60)],
    ["negative principal", () => compoundGrowth(-1, 100, 7, 30)],
    ["negative contribution", () => compoundGrowth(0, -100, 7, 30)],
    ["zero years", () => compoundGrowth(0, 100, 7, 0)],
    ["absurd years", () => compoundGrowth(0, 100, 7, 1e6)],
    ["absurd rate", () => compoundGrowth(0, 100, 5e6, 10)],
    ["rate at -100", () => compoundGrowth(0, 100, -100, 10)],
    ["fractional months", () => loanPayment(1000, 5, 12.5)],
    ["zero months", () => loanPayment(1000, 5, 0)],
    ["NaN", () => aprToApy(NaN, 12)],
    ["Infinity principal", () => loanPayment(Infinity, 5, 12)],
    ["zero compounds", () => aprToApy(5, 0)],
    ["non-integer compounds", () => aprToApy(5, 2.5)],
    ["zero start", () => requiredAnnualReturn(0, 100, 5)],
    ["negative target", () => requiredAnnualReturn(100, -5, 5)],
    ["fee over 100", () => feeDrag(100, 7, 101, 0, 10)],
    ["absurdly large result", () => compoundGrowth(1e12, 1e9, 1000, 100)],
  ])("%s", (_n, fn) => expect(fn).toThrow(CalcError));
});

describe("evaluateCalc never fills in missing numbers", () => {
  it("needs_input when a required value is absent or null", () => {
    const r = evaluateCalc("loan_payment", { principal: 10000, aprPct: null });
    expect(r.status).toBe("needs_input");
    expect(r.missing).toEqual(["aprPct", "months"]);
    expect(r.output).toBeUndefined();
    expect(r.stated).toEqual({ principal: 10000 });
  });
  it("ok when everything is stated, with plain-English text and no advice words", () => {
    const r = evaluateCalc("loan_payment", { principal: 10000, aprPct: 6, months: 60 });
    expect(r.status).toBe("ok");
    expect(r.text).toContain("$193.33");
    expect(r.text).not.toMatch(/should|recommend|buy|sell/i);
  });
  it("records assumed keys when the user supplies them", () => {
    const r = evaluateCalc("compound_growth", { principal: 0, monthlyContribution: 100, annualRatePct: 7, years: 30 }, ["annualRatePct"]);
    expect(r.assumed).toEqual(["annualRatePct"]);
    expect(r.text).toContain("$121,997");
  });
  it("invalid stated values yield status invalid with a reason", () => {
    const r = evaluateCalc("loan_payment", { principal: -5, aprPct: 6, months: 60 });
    expect(r.status).toBe("invalid");
    expect(r.error).toMatch(/principal/);
  });
  it("ignores extra, non-required params", () => {
    expect(evaluateCalc("apr_to_apy", { aprPct: 12, compoundsPerYear: 12, years: 5 }).stated).toEqual({ aprPct: 12, compoundsPerYear: 12 });
  });
});
