import { readFileSync } from "node:fs";

function load<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8")) as T;
}

export interface SourceTiers {
  tier1Suffixes: string[];
  tier1SubdomainPrefixes: string[];
  tier1Domains: string[];
  tier2Domains: string[];
}

export interface Thresholds {
  tierWeights: Record<"1" | "2" | "3", number>;
  tier3Cap: number;
  supportedMinS: number;
  supportedMaxC: number;
  refutedMinC: number;
  refutedMaxS: number;
  claimScores: Record<"supported" | "mixed" | "unverifiable" | "refuted", number>;
  /** How decisive the evidence is per verdict, regardless of direction (drives the "Evidence strength" gauge). */
  decisiveScores: Record<"supported" | "mixed" | "unverifiable" | "refuted", number>;
  bands: { strong: number; moderate: number; weak: number };
  needsCheckingHypeFlags: number;
  holdsUpMaxHypeFlags: number;
  outlook: { minTotalWeight: number; leanRatio: number };
}

export const sourceTiers = load<SourceTiers>("sourceTiers.json");
export const thresholds = load<Thresholds>("thresholds.json");
export const hypeTerms = load<{ terms: string[] }>("hypeTerms.json").terms;
