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
  if (claim.type !== "numeric" || !claim.numeric) return undefined;
  const { kind, value, periodDays } = claim.numeric;
  try {
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
