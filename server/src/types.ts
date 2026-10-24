export type ClaimType = "checkable_fact" | "numeric" | "forecast" | "opinion";
export type ClaimVerdict = "supported" | "mixed" | "refuted" | "unverifiable" | "not_checkable";
export type OverallLabel = "holds_up" | "needs_checking" | "doesnt_hold_up";
export type Stance = "supports" | "contradicts" | "mixed" | "irrelevant";

export interface Evidence {
  id: string;
  url: string;
  domain: string;
  title: string;
  tier: 1 | 2 | 3;
  snippet: string;
  retrievedAt: string;
  stance?: Stance;
  stanceReason?: string;
  quote?: string;
  /** True when the evidence came from a live data tool (quote feed, SEC filing, FRED) rather than web search. */
  live?: boolean;
}

export interface MathCheck {
  calc: "implied_annualized_multiple" | "implied_annualized_return_pct";
  inputs: Record<string, number>;
  output: number;
  text: string;
}

/** "What this implies" card from the calculators add-on. Never changes a verdict. */
export interface Implication {
  calc: string;
  status: "ok" | "needs_input" | "invalid";
  stated: Record<string, number>;
  missing: string[];
  assumed?: string[];
  output?: number;
  text?: string;
  error?: string;
}

export interface ClaimResult {
  id: string;
  text: string;
  type: ClaimType;
  importance: 1 | 2 | 3;
  verdict: ClaimVerdict;
  evidence: Evidence[];
  math?: MathCheck;
  implication?: Implication;
  why: string;
}

export interface Reason {
  kind: "contradicted" | "mixed" | "unconfirmed" | "math" | "hype" | "supported" | "not_checkable";
  text: string;
  claimId?: string;
  /** Source cited for this reason, if any. */
  evidenceId?: string;
  quote?: string;
  /** True when this reason is what drove the overall label under the label rules. */
  decisive: boolean;
}

export interface CheckResult {
  id: string;
  createdAt: string;
  claims: ClaimResult[];
  hypeFlags: string[];
  strength: { score: number; band: "strong" | "moderate" | "weak" | "insufficient" };
  label: OverallLabel;
  whyOverall: string;
  /** Deterministic, code-built reasons behind the label. Absent on results saved before this existed. */
  reasons?: Reason[];
  limitations: string[];
  timings: Record<string, number>;
}

/** Claim as extracted by the model, before any checking. */
export interface ExtractedClaim {
  text: string;
  type: ClaimType;
  importance: 1 | 2 | 3;
  numeric?: { kind: "multiple" | "return_pct"; value: number; periodDays: number };
  queries: [string, string];
  /** Calculator parameters, only values the text explicitly states. Present only when the calculators add-on is on. */
  calc?: { kind: string; params: Record<string, number | null> };
}

export type StageName =
  | "fetch"
  | "extract"
  | "math"
  | "search"
  | "tier"
  | "stance"
  | "verdict"
  | "hype"
  | "aggregate"
  | "explain";

export interface ProgressEvent {
  stage: StageName | "done" | "error";
  status: "start" | "done" | "error";
  ms?: number;
  message?: string;
}
