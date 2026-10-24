/** Pure, deterministic calculators for the "What this implies" card. Never used to change a verdict. */

export class CalcError extends Error {}

function check(name: string, v: unknown, lo: number, hi: number, opts: { loExclusive?: boolean; integer?: boolean } = {}): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new CalcError(`${name} must be a number`);
  if (opts.integer && !Number.isInteger(v)) throw new CalcError(`${name} must be a whole number`);
  if (opts.loExclusive ? v <= lo : v < lo) throw new CalcError(`${name} must be ${opts.loExclusive ? "greater than" : "at least"} ${lo}`);
  if (v > hi) throw new CalcError(`${name} is unrealistically large (max ${hi.toLocaleString("en-US")})`);
  return v;
}
const MONEY_MAX = 1e12;
const RATE_MIN = -99; // percent per year
const RATE_MAX = 1000;
const YEARS_MAX = 100;

function sane(out: number): number {
  if (!Number.isFinite(out) || Math.abs(out) > 1e18) throw new CalcError("The result is too large to be meaningful");
  return out;
}

/** Future value with monthly compounding; contributions are made at the end of each month. */
export function compoundGrowth(principal: number, monthlyContribution: number, annualRatePct: number, years: number): number {
  check("principal", principal, 0, MONEY_MAX);
  check("monthlyContribution", monthlyContribution, 0, 1e9);
  check("annualRatePct", annualRatePct, RATE_MIN, RATE_MAX);
  check("years", years, 0, YEARS_MAX, { loExclusive: true });
  const n = Math.round(years * 12);
  const r = annualRatePct / 100 / 12;
  if (r === 0) return sane(principal + monthlyContribution * n);
  const g = Math.pow(1 + r, n);
  return sane(principal * g + (monthlyContribution * (g - 1)) / r);
}

export function feeDragDetail(monthlyContribution: number, annualRatePct: number, feePctA: number, feePctB: number, years: number) {
  check("monthlyContribution", monthlyContribution, 0, 1e9, { loExclusive: true });
  check("annualRatePct", annualRatePct, RATE_MIN, RATE_MAX);
  check("feePctA", feePctA, 0, 100);
  check("feePctB", feePctB, 0, 100);
  check("years", years, 0, YEARS_MAX, { loExclusive: true });
  if (annualRatePct - feePctA <= -100 || annualRatePct - feePctB <= -100) throw new CalcError("fees can't exceed the return by 100 points or more");
  const valueA = compoundGrowth(0, monthlyContribution, annualRatePct - feePctA, years);
  const valueB = compoundGrowth(0, monthlyContribution, annualRatePct - feePctB, years);
  return { valueA, valueB, difference: valueA - valueB };
}
/** Final value at fee A minus final value at fee B (starting from zero). */
export const feeDrag = (...a: Parameters<typeof feeDragDetail>) => feeDragDetail(...a).difference;

export function aprToApy(aprPct: number, compoundsPerYear: number): number {
  check("aprPct", aprPct, 0, RATE_MAX);
  check("compoundsPerYear", compoundsPerYear, 1, 365, { integer: true });
  return sane((Math.pow(1 + aprPct / 100 / compoundsPerYear, compoundsPerYear) - 1) * 100);
}

export function apyToApr(apyPct: number, compoundsPerYear: number): number {
  check("apyPct", apyPct, 0, RATE_MAX);
  check("compoundsPerYear", compoundsPerYear, 1, 365, { integer: true });
  return sane(compoundsPerYear * (Math.pow(1 + apyPct / 100, 1 / compoundsPerYear) - 1) * 100);
}

export function loanPayment(principal: number, aprPct: number, months: number): number {
  check("principal", principal, 0, MONEY_MAX, { loExclusive: true });
  check("aprPct", aprPct, 0, 100);
  check("months", months, 1, 1200, { integer: true });
  if (aprPct === 0) return principal / months;
  const r = aprPct / 100 / 12;
  return sane((principal * r) / (1 - Math.pow(1 + r, -months)));
}

export function totalInterest(principal: number, aprPct: number, months: number): number {
  return sane(loanPayment(principal, aprPct, months) * months - principal);
}

/** Annual growth rate (percent) needed to go from start to target. */
export function requiredAnnualReturn(start: number, target: number, years: number): number {
  check("start", start, 0, MONEY_MAX, { loExclusive: true });
  check("target", target, 0, MONEY_MAX, { loExclusive: true });
  check("years", years, 0, YEARS_MAX, { loExclusive: true });
  return sane((Math.pow(target / start, 1 / years) - 1) * 100);
}

// ---- Card layer: which inputs each calculator needs, and the plain-English implication ----

export type CalcName = "compound_growth" | "fee_drag" | "apr_to_apy" | "apy_to_apr" | "loan_payment" | "total_interest" | "required_annual_return";
export const CALC_NAMES: CalcName[] = ["compound_growth", "fee_drag", "apr_to_apy", "apy_to_apr", "loan_payment", "total_interest", "required_annual_return"];

export const CALC_REQUIRED: Record<CalcName, string[]> = {
  compound_growth: ["principal", "monthlyContribution", "annualRatePct", "years"],
  fee_drag: ["monthlyContribution", "annualRatePct", "feePctA", "feePctB", "years"],
  apr_to_apy: ["aprPct", "compoundsPerYear"],
  apy_to_apr: ["apyPct", "compoundsPerYear"],
  loan_payment: ["principal", "aprPct", "months"],
  total_interest: ["principal", "aprPct", "months"],
  required_annual_return: ["start", "target", "years"],
};

export const PARAM_LABELS: Record<string, string> = {
  principal: "Starting amount ($)", monthlyContribution: "Monthly contribution ($)", annualRatePct: "Yearly return (%)",
  years: "Years", feePctA: "Fee A (% per year)", feePctB: "Fee B (% per year)", aprPct: "APR (%)", apyPct: "APY (%)",
  compoundsPerYear: "Compounds per year", months: "Months", start: "Starting amount ($)", target: "Target amount ($)",
};

export interface ImplicationResult {
  calc: CalcName;
  status: "ok" | "needs_input" | "invalid";
  /** Values the text actually stated (or the user supplied), by parameter name. */
  stated: Record<string, number>;
  missing: string[];
  assumed?: string[];
  output?: number;
  text?: string;
  error?: string;
}

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const usd2 = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + "%";
const yrs = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Runs a calculator only when every required number is present. Never fills in a missing value. */
export function evaluateCalc(calc: CalcName, params: Record<string, number | null | undefined>, assumed: string[] = []): ImplicationResult {
  const required = CALC_REQUIRED[calc];
  const stated: Record<string, number> = {};
  for (const k of required) {
    const v = params[k];
    if (typeof v === "number" && Number.isFinite(v)) stated[k] = v;
  }
  const missing = required.filter((k) => !(k in stated));
  const base = { calc, stated, missing, ...(assumed.length ? { assumed } : {}) };
  if (missing.length) return { ...base, status: "needs_input" };
  const p = stated;
  try {
    switch (calc) {
      case "compound_growth": {
        const out = compoundGrowth(p.principal, p.monthlyContribution, p.annualRatePct, p.years);
        const put = p.principal + p.monthlyContribution * Math.round(p.years * 12);
        return { ...base, status: "ok", output: out, text: `Starting with ${usd(p.principal)} and adding ${usd(p.monthlyContribution)} a month at ${pct(p.annualRatePct)} a year for ${yrs(p.years)} years (monthly compounding) grows to about ${usd(out)}. Roughly ${usd(put)} of that is money put in; the rest is growth.` };
      }
      case "fee_drag": {
        const d = feeDragDetail(p.monthlyContribution, p.annualRatePct, p.feePctA, p.feePctB, p.years);
        return { ...base, status: "ok", output: d.difference, text: `Adding ${usd(p.monthlyContribution)} a month for ${yrs(p.years)} years at ${pct(p.annualRatePct)} before fees, a ${pct(p.feePctA)} yearly fee ends near ${usd(d.valueA)} while a ${pct(p.feePctB)} fee ends near ${usd(d.valueB)}: a gap of about ${usd(Math.abs(d.difference))}.` };
      }
      case "apr_to_apy": {
        const out = aprToApy(p.aprPct, p.compoundsPerYear);
        return { ...base, status: "ok", output: out, text: `A ${pct(p.aprPct)} APR compounded ${p.compoundsPerYear} times a year is an effective yearly yield (APY) of about ${pct(out)}.` };
      }
      case "apy_to_apr": {
        const out = apyToApr(p.apyPct, p.compoundsPerYear);
        return { ...base, status: "ok", output: out, text: `A ${pct(p.apyPct)} APY with ${p.compoundsPerYear} compounding periods a year corresponds to a stated rate (APR) of about ${pct(out)}.` };
      }
      case "loan_payment": {
        const out = loanPayment(p.principal, p.aprPct, p.months);
        return { ...base, status: "ok", output: out, text: `Borrowing ${usd(p.principal)} at ${pct(p.aprPct)} APR over ${p.months} months means payments of about ${usd2(out)} a month.` };
      }
      case "total_interest": {
        const out = totalInterest(p.principal, p.aprPct, p.months);
        return { ...base, status: "ok", output: out, text: `Borrowing ${usd(p.principal)} at ${pct(p.aprPct)} APR over ${p.months} months adds up to about ${usd(out)} in interest.` };
      }
      case "required_annual_return": {
        const out = requiredAnnualReturn(p.start, p.target, p.years);
        return { ...base, status: "ok", output: out, text: `Going from ${usd(p.start)} to ${usd(p.target)} in ${yrs(p.years)} years takes about ${pct(out)} growth every year, with no bad years.` };
      }
    }
  } catch (e) {
    if (e instanceof CalcError) return { ...base, status: "invalid", error: e.message };
    throw e;
  }
}
