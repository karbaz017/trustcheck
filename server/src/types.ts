export type ClaimType = "checkable_fact" | "numeric" | "forecast" | "opinion";
/**
 * Facts get supported/mixed/refuted/unverifiable. Forecasts are never true/false: "expected" means reliable sources
 * make the same prediction, "unbacked" means none do. Opinions (and contested forecasts) are not_checkable.
 */
export type ClaimVerdict = "supported" | "mixed" | "refuted" | "unverifiable" | "not_checkable" | "expected" | "unbacked";
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
  /** The stock, crypto, fund or index the claim is about, if any (e.g. "TSLA", "Bitcoin"). */
  asset?: string;
  why: string;
}

export interface Reason {
  kind: "contradicted" | "mixed" | "unconfirmed" | "math" | "hype" | "supported" | "not_checkable" | "unbacked" | "expected";
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
  /** Support score from the spec (supported 100 ... refuted 0). Kept for history and label rules; not shown as the gauge. */
  strength: { score: number; band: "strong" | "moderate" | "weak" | "insufficient" };
  /** How decisive the reliable evidence is, whichever way it points, plus the direction. Drives the gauge. */
  evidence?: { score: number; band: "strong" | "moderate" | "weak" | "insufficient"; leaning: "supports" | "contradicts" | "mixed" | "unconfirmed" | "not_scored" };
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
  asset?: string;
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

/** A live data tool call, as shown in the activity panel. */
export interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
  ms: number;
}

export interface ProgressEvent {
  stage: StageName | "done" | "error";
  /** "info" events carry intermediate output (search queries, tool calls) between start and done. */
  status: "start" | "done" | "error" | "info";
  ms?: number;
  /** One-line, human-readable description of what happened. */
  message?: string;
  /** Optional detail lines (claims found, queries, verdicts...). */
  lines?: string[];
  tool?: ToolCallInfo;
}
