import type { ExtractedClaim, MathCheck } from "../types.js";

export function impliedAnnualizedMultiple(multiple: number, days: number): number {
  if (!(multiple > 0) || !Number.isFinite(multiple)) throw new Error("multiple must be a positive number");
  if (!(days > 0) || !Number.isFinite(days)) throw new Error("days must be a positive number");
  return Math.pow(multiple, 365 / days);
}

export function impliedAnnualizedReturnPct(returnPct: number, days: number): number {
  if (!Number.isFinite(returnPct) || returnPct <= -100) throw new Error("returnPct must be greater than -100");
  if (!(days > 0) || !Number.isFinite(days)) throw new Error("days must be a positive number");
  return (Math.pow(1 + returnPct / 100, 365 / days) - 1) * 100;
}

const fmt = (n: number): string => {
  if (!Number.isFinite(n)) return "an astronomically large number of";
  if (n >= 1e15) return `${n.toExponential(1)}`;
  if (n >= 100) return Math.round(n).toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
};

export function mathCheck(claim: Pick<ExtractedClaim, "type" | "numeric">): MathCheck | undefined {
  if ((claim.type !== "numeric" && claim.type !== "forecast") || !claim.numeric) return undefined;
  const { kind, value, periodDays } = claim.numeric;
  try {
    if (claim.type === "forecast") {
      // A predicted one-off move: say what it means, don't compound it into a yearly figure.
      const pct = kind === "multiple" ? (value - 1) * 100 : value;
      if (!Number.isFinite(pct) || pct <= -100 || !(periodDays > 0)) return undefined;
      const after = 1 + pct / 100;
      return {
        calc: "implied_annualized_return_pct",
        inputs: { returnPct: pct, periodDays },
        output: pct,
        text: `A ${fmt(Math.abs(pct))}% ${pct >= 0 ? "rise" : "fall"} in ${periodDays === 1 ? "one day" : `${fmt(periodDays)} days`} means the price ends at ${fmt(after)}x where it started${pct >= 100 ? `, so $1,000 would become $${fmt(1000 * after)}` : ""}.`,
      };
    }
    if (kind === "multiple") {
      const output = impliedAnnualizedMultiple(value, periodDays);
      return {
        calc: "implied_annualized_multiple",
        inputs: { multiple: value, periodDays },
        output,
        text: `Gaining ${fmt(value)}x every ${fmt(periodDays)} days implies about ${fmt(output)}x in one year.`,
      };
    }
    const output = impliedAnnualizedReturnPct(value, periodDays);
    return {
      calc: "implied_annualized_return_pct",
      inputs: { returnPct: value, periodDays },
      output,
      text: `A ${fmt(value)}% return every ${fmt(periodDays)} days, repeated, implies about ${fmt(output)}% in one year.`,
    };
  } catch {
    return undefined; // invalid numbers from the model: skip the card rather than show nonsense
  }
}
