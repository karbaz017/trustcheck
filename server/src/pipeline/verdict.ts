import { thresholds as defaults, type Thresholds } from "../config/loadConfig.js";
import type { ClaimType, ClaimVerdict, Evidence } from "../types.js";

export interface VerdictDetail {
  verdict: ClaimVerdict;
  S: number;
  C: number;
}

/** Sum of tier weights per side. Each domain counts once per side; Tier 3 is capped in total per side. */
export function weigh(evidence: Evidence[], t: Thresholds = defaults): { S: number; C: number } {
  const seen = { S: new Set<string>(), C: new Set<string>() };
  const sums = { S: { main: 0, t3: 0 }, C: { main: 0, t3: 0 } };
  const add = (side: "S" | "C", e: Evidence, factor: number) => {
    if (seen[side].has(e.domain)) return;
    seen[side].add(e.domain);
    const w = t.tierWeights[String(e.tier) as "1" | "2" | "3"] * factor;
    if (e.tier === 3) sums[side].t3 += w;
    else sums[side].main += w;
  };
  for (const e of evidence) {
    if (e.stance === "supports") add("S", e, 1);
    else if (e.stance === "contradicts") add("C", e, 1);
    else if (e.stance === "mixed") {
      add("S", e, 0.5);
      add("C", e, 0.5);
    }
  }
  const total = (s: { main: number; t3: number }) => s.main + Math.min(s.t3, t.tier3Cap);
  return { S: total(sums.S), C: total(sums.C) };
}

export function decideVerdict(type: ClaimType, evidence: Evidence[], t: Thresholds = defaults): VerdictDetail {
  if (type === "forecast" || type === "opinion") return { verdict: "not_checkable", S: 0, C: 0 };
  const { S, C } = weigh(evidence, t);
  const hasReliableRelevant = evidence.some((e) => e.tier <= 2 && e.stance && e.stance !== "irrelevant");
  if (!hasReliableRelevant) return { verdict: "unverifiable", S, C };
  if (S >= t.supportedMinS && C <= t.supportedMaxC) return { verdict: "supported", S, C };
  if (C >= t.refutedMinC && S <= t.refutedMaxS) return { verdict: "refuted", S, C };
  return { verdict: "mixed", S, C };
}
