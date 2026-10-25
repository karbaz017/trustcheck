import { randomUUID } from "node:crypto";
import type { CheckResult, ClaimResult, ClaimVerdict, Evidence, ExtractedClaim, ProgressEvent, StageName, ToolCallInfo } from "../types.js";
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

/** What each step is doing, shown live in the activity panel. */
const STARTS: Record<StageName, string> = {
  fetch: "Opening the link",
  extract: "Reading the text and splitting it into claims",
  math: "Checking any numbers in the claims",
  search: "Looking it up on the web and in live data",
  tier: "Rating how trustworthy each source is",
  stance: "Comparing what each source says with each claim",
  verdict: "Deciding a verdict for each claim",
  hype: "Looking for pressure language",
  aggregate: "Working out the overall result",
  explain: "Writing the explanation",
};
const TYPE_LABEL: Record<string, string> = { checkable_fact: "Fact", numeric: "Numbers", forecast: "Forecast", opinion: "Opinion" };
const VERDICT_LABEL: Record<ClaimVerdict, string> = { supported: "Supported", mixed: "Mixed", refuted: "Contradicted", unverifiable: "Can't confirm", not_checkable: "Can't be verified", expected: "Others predict this too", unbacked: "No reliable backing" };
const LABEL_TEXT = { holds_up: "Holds up", needs_checking: "Needs checking", doesnt_hold_up: "Doesn't hold up" } as const;
const short = (t: string, n = 90) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
type Summary = { message: string; lines?: string[] };

export interface PipelineDeps {
  extract: (text: string) => Promise<ExtractedClaim[]>;
  retrieve: (queries: string[]) => Promise<Evidence[]>;
  stance: (claim: string, evidence: Evidence[], type?: ExtractedClaim["type"]) => Promise<Evidence[]>;
  explain: typeof writeExplanations;
  /** Live data tools chosen by the model and run by code (quote feeds, SEC filings, FRED). Optional. */
  live?: (claim: string, onCall?: (c: ToolCallInfo) => void) => Promise<(SearchHit & { live?: boolean })[]>;
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

  async function stage<T>(name: StageName, fn: () => Promise<T> | T, describe?: (out: T) => Summary): Promise<T> {
    emit({ stage: name, status: "start", message: STARTS[name] });
    const t0 = Date.now();
    try {
      const out = await fn();
      timings[name] = Date.now() - t0;
      emit({ stage: name, status: "done", ms: timings[name], ...(describe ? describe(out) : {}) });
      return out;
    } catch (e) {
      timings[name] = Date.now() - t0;
      emit({ stage: name, status: "error", ms: timings[name], message: `${STARTS[name]} failed` });
      throw e;
    }
  }

  const extracted = await stage("extract", () => deps.extract(text), (cs) => ({
    message: cs.length ? `Found ${cs.length} claim${cs.length === 1 ? "" : "s"}` : "No specific claims found",
    lines: cs.map((c, i) => `${i + 1}. [${TYPE_LABEL[c.type]}] ${short(c.text, 140)}`),
  }));
  const maths = await stage("math", () => extracted.map((c) => mathCheck(c)), (ms) => {
    const cards = ms.map((m, i) => (m ? `Claim ${i + 1}: ${m.text}` : "")).filter(Boolean);
    return { message: cards.length ? `${cards.length} math card${cards.length === 1 ? "" : "s"}` : "No growth-rate numbers to calculate", lines: cards };
  });
  // Calculators add-on: runs only when the text stated every needed number; otherwise the card asks for the user's assumption.
  const implications = extracted.map((c) =>
    isOn("calculators") && c.calc && c.calc.kind in CALC_REQUIRED ? evaluateCalc(c.calc.kind as CalcName, c.calc.params) : undefined,
  );

  const searched = await stage("search", () =>
    Promise.all(
      extracted.map(async (c, i): Promise<{ evidence: Evidence[]; failed: boolean; skipped?: boolean; web: number; live: number }> => {
        if (c.type === "opinion") return { evidence: [], failed: false, skipped: true, web: 0, live: 0 };
        emit({ stage: "search", status: "info", message: `Claim ${i + 1}: searching the web`, lines: c.queries.map((q) => `“${q}”`) });
        const onCall = (call: ToolCallInfo) => emit({ stage: "search", status: "info", message: `Claim ${i + 1}: called ${call.name}`, tool: call });
        const [web, live] = await Promise.all([
          deps.retrieve(c.queries).then((e) => ({ e, ok: true })).catch(() => ({ e: [] as Evidence[], ok: false })),
          deps.live ? deps.live(c.text, onCall).catch(() => []) : Promise.resolve([]),
        ]);
        // Live tool data goes first so it is never crowded out; ids continue after web results.
        const liveEv = hitsToEvidence(live, web.e.length).map((e) => ({ ...e, live: true }));
        return { evidence: [...web.e, ...liveEv], failed: !web.ok && liveEv.length === 0, web: web.e.length, live: liveEv.length };
      }),
    ),
  (rs) => ({
    message: `Found ${rs.reduce((a, r) => a + r.evidence.length, 0)} sources`,
    lines: rs.map((r, i) => `Claim ${i + 1}: ${r.skipped ? "skipped (opinions aren't searched)" : r.failed ? "search unavailable" : `${r.web} web result${r.web === 1 ? "" : "s"}${r.live ? ` + ${r.live} live data` : ""}`}`),
  }));
  const searchFailures = searched.filter((s) => s.failed).length;
  if (searchFailures) limitationsExtra.push(`Search was unavailable for ${searchFailures} claim${searchFailures === 1 ? "" : "s"}, so ${searchFailures === 1 ? "it is" : "they are"} marked unverifiable.`);

  const tiered = await stage("tier", () => searched.map((s) => applyTiers(s.evidence)), (ts) => {
    const all = ts.flat();
    const n = (t: number) => all.filter((e) => e.tier === t).length;
    return { message: `Rated how trustworthy each of the ${all.length} sources is`, lines: [`Official sources (government, regulators, company filings): ${n(1)}`, `Trusted news and data outlets: ${n(2)}`, `Other websites (can't decide a verdict on their own): ${n(3)}`] };
  });

  const staged = await stage("stance", () =>
    Promise.all(
      extracted.map(async (c, i) => {
        try {
          return await deps.stance(c.text, tiered[i], c.type);
        } catch {
          // Output failed validation after retries: no evidence is trusted, so the claim ends up unverifiable.
          limitationsExtra.push("For some claims the evidence could not be reliably classified, so they are marked unverifiable.");
          return tiered[i].map((e) => ({ ...e, stance: "irrelevant" as const }));
        }
      }),
    ),
  (st) => ({
    message: "Compared what each source says with each claim",
    lines: st.map((es, i) => {
      if (!es.length) return `Claim ${i + 1}: no sources`;
      const c = (k: string) => es.filter((e) => e.stance === k).length;
      return `Claim ${i + 1}: ${c("supports")} support, ${c("contradicts")} contradict, ${c("mixed")} partly, ${c("irrelevant")} not relevant`;
    }),
  }));

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
  (cs) => ({ message: "Decided each verdict with our fixed rules (not by the AI)", lines: cs.map((c, i) => `Claim ${i + 1}: ${VERDICT_LABEL[c.verdict]}`) }));

  const flags = await stage("hype", () => hypeFlags(text), (f) => ({ message: f.length ? `Pressure language: ${f.join(", ")}` : "No pressure language found" }));
  const { strength, label } = await stage("aggregate", () => aggregate(claims, flags.length), (a) => {
    const ev = evidenceOf(claims);
    return { message: `Overall: ${LABEL_TEXT[a.label]}`, lines: [ev.leaning === "not_scored" ? "Evidence strength: not scored (nothing checkable)" : `Evidence strength: ${ev.band} (${ev.score}/100), ${ev.leaning}`] };
  });

  const reasons = buildReasons(claims, flags, label);
  const explained = await stage("explain", () => deps.explain(claims, label, strength.score, flags), (x) => ({
    message: x.usedTemplate ? "Wrote the explanation (fixed template: the AI's text didn't pass our checks)" : "Wrote the explanation and checked it for advice wording",
  }));
  claims = explained.claims;

  const createdAt = new Date().toISOString();
  const limitations = buildLimitations(claims, createdAt, [...new Set(limitationsExtra)]);
  if (claims.length === 0) limitations.push("No specific claims to check were found in this text.");

  return { id: opts.id ?? randomUUID(), createdAt, claims, hypeFlags: flags, strength, evidence: evidenceOf(claims), label, whyOverall: explained.whyOverall, reasons, limitations, timings };
}
