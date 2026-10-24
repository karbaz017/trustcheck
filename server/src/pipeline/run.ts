import { randomUUID } from "node:crypto";
import type { CheckResult, ClaimResult, Evidence, ExtractedClaim, ProgressEvent, StageName } from "../types.js";
import { hitsToEvidence, retrieveEvidence } from "../search/retrieve.js";
import { liveEvidenceFor } from "../tools/planner.js";
import type { SearchHit } from "../search/types.js";
import { aggregate, buildLimitations, buildReasons, evidenceOf } from "./aggregate.js";
import { classifyStance } from "./classifyStance.js";
import { writeExplanations } from "./explain.js";
import { extractClaims } from "./extractClaims.js";
import { hypeFlags } from "./hypeFlags.js";
import { isOn } from "../addons/flags.js";
import { CALC_REQUIRED, evaluateCalc, type CalcName } from "./calculators.js";
import { mathCheck } from "./mathCheck.js";
import { applyTiers } from "./tierSources.js";
import { decideVerdict } from "./verdict.js";

export const MAX_INPUT_CHARS = 8000;
type Progress = (e: ProgressEvent) => void;

export interface PipelineDeps {
  extract: (text: string) => Promise<ExtractedClaim[]>;
  retrieve: (queries: string[]) => Promise<Evidence[]>;
  stance: (claim: string, evidence: Evidence[]) => Promise<Evidence[]>;
  explain: typeof writeExplanations;
  /** Live data tools chosen by the model and run by code (quote feeds, SEC filings, FRED). Optional. */
  live?: (claim: string) => Promise<(SearchHit & { live?: boolean })[]>;
}
const realDeps: PipelineDeps = { extract: extractClaims, retrieve: retrieveEvidence, stance: classifyStance, explain: writeExplanations, live: liveEvidenceFor };

export async function runPipeline(
  text: string,
  opts: { id?: string; onProgress?: Progress; timings?: Record<string, number>; deps?: PipelineDeps; extraLimitations?: string[] } = {},
): Promise<CheckResult> {
  const deps = opts.deps ?? realDeps;
  const timings = opts.timings ?? {};
  const emit = opts.onProgress ?? (() => {});
  const limitationsExtra: string[] = [...(opts.extraLimitations ?? [])];

  async function stage<T>(name: StageName, fn: () => Promise<T> | T): Promise<T> {
    emit({ stage: name, status: "start" });
    const t0 = Date.now();
    try {
      const out = await fn();
      timings[name] = Date.now() - t0;
      emit({ stage: name, status: "done", ms: timings[name] });
      return out;
    } catch (e) {
      timings[name] = Date.now() - t0;
      emit({ stage: name, status: "error", ms: timings[name] });
      throw e;
    }
  }

  const extracted = await stage("extract", () => deps.extract(text));
  const maths = await stage("math", () => extracted.map((c) => mathCheck(c)));
  // Calculators add-on: runs only when the text stated every needed number; otherwise the card asks for the user's assumption.
  const implications = extracted.map((c) =>
    isOn("calculators") && c.calc && c.calc.kind in CALC_REQUIRED ? evaluateCalc(c.calc.kind as CalcName, c.calc.params) : undefined,
  );

  const searched = await stage("search", () =>
    Promise.all(
      extracted.map(async (c): Promise<{ evidence: Evidence[]; failed: boolean }> => {
        if (c.type === "forecast" || c.type === "opinion") return { evidence: [], failed: false };
        const [web, live] = await Promise.all([
          deps.retrieve(c.queries).then((e) => ({ e, ok: true })).catch(() => ({ e: [] as Evidence[], ok: false })),
          deps.live ? deps.live(c.text).catch(() => []) : Promise.resolve([]),
        ]);
        // Live tool data goes first so it is never crowded out; ids continue after web results.
        const liveEv = hitsToEvidence(live, web.e.length).map((e) => ({ ...e, live: true }));
        return { evidence: [...web.e, ...liveEv], failed: !web.ok && liveEv.length === 0 };
      }),
    ),
  );
  const searchFailures = searched.filter((s) => s.failed).length;
  if (searchFailures) limitationsExtra.push(`Search was unavailable for ${searchFailures} claim${searchFailures === 1 ? "" : "s"}, so ${searchFailures === 1 ? "it is" : "they are"} marked unverifiable.`);

  const tiered = await stage("tier", () => searched.map((s) => applyTiers(s.evidence)));

  const staged = await stage("stance", () =>
    Promise.all(
      extracted.map(async (c, i) => {
        try {
          return await deps.stance(c.text, tiered[i]);
        } catch {
          // Output failed validation after retries: no evidence is trusted, so the claim ends up unverifiable.
          limitationsExtra.push("For some claims the evidence could not be reliably classified, so they are marked unverifiable.");
          return tiered[i].map((e) => ({ ...e, stance: "irrelevant" as const }));
        }
      }),
    ),
  );

  let claims: ClaimResult[] = await stage("verdict", () =>
    extracted.map((c, i) => ({
      id: `c${i + 1}`,
      text: c.text,
      type: c.type,
      importance: c.importance,
      verdict: decideVerdict(c.type, staged[i]).verdict,
      evidence: staged[i],
      math: maths[i],
      implication: implications[i],
      why: "",
    })),
  );

  const flags = await stage("hype", () => hypeFlags(text));
  const { strength, label } = await stage("aggregate", () => aggregate(claims, flags.length));

  const reasons = buildReasons(claims, flags, label);
  const explained = await stage("explain", () => deps.explain(claims, label, strength.score, flags));
  claims = explained.claims;

  const createdAt = new Date().toISOString();
  const limitations = buildLimitations(claims, createdAt, [...new Set(limitationsExtra)]);
  if (claims.length === 0) limitations.push("No specific claims to check were found in this text.");

  return { id: opts.id ?? randomUUID(), createdAt, claims, hypeFlags: flags, strength, evidence: evidenceOf(claims), label, whyOverall: explained.whyOverall, reasons, limitations, timings };
}
