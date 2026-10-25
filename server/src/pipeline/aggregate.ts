import { thresholds as defaults, type Thresholds } from "../config/loadConfig.js";
import type { ClaimResult, Evidence, OverallLabel, Reason } from "../types.js";

type Band = "strong" | "moderate" | "weak" | "insufficient";

export function bandOf(score: number, t: Thresholds = defaults): Band {
  if (score >= t.bands.strong) return "strong";
  if (score >= t.bands.moderate) return "moderate";
  if (score >= t.bands.weak) return "weak";
  return "insufficient";
}

/** Only fact verdicts are scored; forecast and opinion verdicts never count as true or false. */
const checkable = (c: ClaimResult) => ["supported", "mixed", "refuted", "unverifiable"].includes(c.verdict);

/** A forecast of a big move in a short time (from the math card), e.g. "+100% tomorrow". */
export function isExtraordinary(c: ClaimResult, t: Thresholds = defaults): boolean {
  const i = c.math?.inputs;
  if (c.type !== "forecast" || !i || !(i.periodDays > 0) || i.periodDays > t.extraordinary.maxDays) return false;
  const pct = i.returnPct ?? (i.multiple !== undefined ? (i.multiple - 1) * 100 : NaN);
  return Math.abs(pct) >= t.extraordinary.minReturnPct;
}

/** Central forecasts nobody reliable predicts that are also extraordinary or pushed with pressure words. */
function unbackedRedFlags(claims: ClaimResult[], hypeCount: number, t: Thresholds): ClaimResult[] {
  const maxImp = claims.length ? Math.max(...claims.map((c) => c.importance)) : 0;
  return claims.filter((c) => c.verdict === "unbacked" && c.importance === maxImp && (isExtraordinary(c, t) || hypeCount >= 1));
}

export function aggregate(
  claims: ClaimResult[],
  hypeCount: number,
  t: Thresholds = defaults,
): { strength: { score: number; band: Band }; label: OverallLabel } {
  const scored = claims.filter(checkable);
  const redFlag = unbackedRedFlags(claims, hypeCount, t).length > 0;
  if (scored.length === 0) return { strength: { score: 0, band: "insufficient" }, label: redFlag ? "doesnt_hold_up" : "needs_checking" };

  const totalW = scored.reduce((a, c) => a + c.importance, 0);
  const raw = scored.reduce((a, c) => a + c.importance * t.claimScores[c.verdict as keyof Thresholds["claimScores"]], 0) / totalW;
  const score = Math.round(raw);
  const strength = { score, band: bandOf(score, t) };

  // "Central" claims are importance 3. If none of those are checkable, fall back to the highest checkable importance.
  const maxImp = Math.max(...scored.map((c) => c.importance));
  const central = scored.filter((c) => c.importance === (maxImp === 3 ? 3 : maxImp));

  let label: OverallLabel;
  if (central.some((c) => c.verdict === "refuted") || redFlag) label = "doesnt_hold_up";
  else if (central.some((c) => c.verdict === "unverifiable" || c.verdict === "mixed") || hypeCount >= t.needsCheckingHypeFlags)
    label = "needs_checking";
  else if (central.every((c) => c.verdict === "supported") && hypeCount <= t.holdsUpMaxHypeFlags) label = "holds_up";
  else label = "needs_checking";
  return { strength, label };
}

type Leaning = "supports" | "contradicts" | "mixed" | "unconfirmed" | "not_scored";

/**
 * Evidence strength = how decisive the reliable evidence is, independent of direction:
 * a clearly supported claim and a clearly contradicted claim are both strong. Leaning says which way it points.
 */
export function evidenceOf(claims: ClaimResult[], t: Thresholds = defaults): { score: number; band: Band; leaning: Leaning } {
  const scored = claims.filter(checkable);
  if (!scored.length) return { score: 0, band: "insufficient", leaning: "not_scored" };
  const w = scored.reduce((a, c) => a + c.importance, 0);
  const avg = (k: "decisiveScores" | "claimScores") => scored.reduce((a, c) => a + c.importance * t[k][c.verdict as keyof Thresholds["claimScores"]], 0) / w;
  const score = Math.round(avg("decisiveScores"));
  const sup = scored.filter((c) => c.verdict === "supported").reduce((a, c) => a + c.importance, 0) / w;
  const con = scored.filter((c) => c.verdict === "refuted").reduce((a, c) => a + c.importance, 0) / w;
  const unc = scored.filter((c) => c.verdict === "unverifiable").reduce((a, c) => a + c.importance, 0) / w;
  const leaning: Leaning = sup >= 0.6 ? "supports" : con >= 0.6 ? "contradicts" : unc >= 0.6 ? "unconfirmed" : "mixed";
  return { score, band: bandOf(score, t), leaning };
}

export function buildLimitations(claims: ClaimResult[], retrievedAt: string, extra: string[] = []): string[] {
  const urls = new Set(claims.flatMap((c) => c.evidence.filter((e) => e.stance && e.stance !== "irrelevant").map((e) => e.url)));
  const out = [
    `Based on ${urls.size} source${urls.size === 1 ? "" : "s"} retrieved on ${retrievedAt.slice(0, 10)}. Search can miss things and sources can be wrong.`,
    "A claim being well supported does not make something a good decision for you.",
  ];
  if (claims.some((c) => c.verdict === "not_checkable")) out.push("Forecasts and opinions can't be verified.");
  if (claims.some((c) => c.verdict === "expected" || c.verdict === "unbacked"))
    out.push("For predictions we only check whether reliable sources make the same prediction. Nobody can verify the future, and expected moves often don't happen.");
  return [...out, ...extra];
}

const quoteShort = (q?: string) => (q && q.length > 200 ? q.slice(0, 197) + "…" : q);
const tierName = (t: 1 | 2 | 3) => (t === 1 ? "primary source" : t === 2 ? "reputable source" : "low-reliability source");
/** Each site once, strongest tier first (input is already sorted by tier). */
const list = (es: Evidence[]) => [...new Map(es.map((e) => [e.domain, e])).values()].map((e) => `${e.domain} (${tierName(e.tier)})`).join(", ");
const byStrength = (a: Evidence, b: Evidence) => a.tier - b.tier;
const clip = (s: string) => (s.length > 120 ? s.slice(0, 117) + "…" : s);

/** Builds the "why" behind the label from verdicts and cited sources only. No model text, no advice. */
export function buildReasons(claims: ClaimResult[], hypeFlags: string[], label: OverallLabel, t: Thresholds = defaults): Reason[] {
  const scored = claims.filter(checkable);
  const maxImp = scored.length ? Math.max(...scored.map((c) => c.importance)) : 0;
  const isCentral = (c: ClaimResult) => c.importance === maxImp;
  const out: Reason[] = [];
  const withStance = (c: ClaimResult, s: Evidence["stance"]) => c.evidence.filter((e) => e.stance === s).sort(byStrength);

  const order: Record<string, number> = { refuted: 0, mixed: 1, unverifiable: 2, supported: 3 };
  for (const c of [...scored].sort((a, b) => order[a.verdict] - order[b.verdict] || b.importance - a.importance)) {
    const q = `“${clip(c.text)}”`;
    if (c.verdict === "refuted") {
      const against = withStance(c, "contradicts");
      out.push({
        kind: "contradicted", claimId: c.id, evidenceId: against[0]?.id, quote: quoteShort(against[0]?.quote),
        text: `${q} is contradicted by ${list(against)}.`,
        decisive: label === "doesnt_hold_up" && isCentral(c),
      });
    } else if (c.verdict === "mixed") {
      const s = withStance(c, "supports").length, k = withStance(c, "contradicts").length;
      out.push({
        kind: "mixed", claimId: c.id,
        text: `Sources disagree on ${q}: ${s} support it, ${k} contradict it, and none outweighs the other enough to settle it.`,
        decisive: label === "needs_checking" && isCentral(c),
      });
    } else if (c.verdict === "unverifiable") {
      const lowOnly = c.evidence.some((e) => e.tier === 3 && e.stance && e.stance !== "irrelevant");
      out.push({
        kind: "unconfirmed", claimId: c.id,
        text: lowOnly
          ? `${q} is only mentioned by low-reliability sources (blogs, social posts, unknown sites). Those can't decide a verdict on their own.`
          : `We found no primary source or reputable news outlet that confirms or contradicts ${q}.`,
        decisive: label === "needs_checking" && isCentral(c),
      });
    } else if (c.verdict === "supported" && (label === "holds_up" || out.length < 2)) {
      const pro = withStance(c, "supports");
      out.push({
        kind: "supported", claimId: c.id, evidenceId: pro[0]?.id, quote: quoteShort(pro[0]?.quote),
        text: `${q} is backed by ${list(pro)}.`,
        decisive: label === "holds_up" && isCentral(c),
      });
    }
  }

  const flagged = new Set(unbackedRedFlags(claims, hypeFlags.length, t).map((c) => c.id));
  for (const c of claims) {
    const q = `“${clip(c.text)}”`;
    if (c.verdict === "unbacked") {
      const i = c.math?.inputs;
      const pct = i ? Math.round(i.returnPct ?? ((i.multiple ?? 1) - 1) * 100) : 0;
      const days = i?.periodDays === 1 ? "one day" : `${i?.periodDays} days`;
      out.push({
        kind: "unbacked", claimId: c.id,
        text: `No official source or trusted news outlet makes the prediction ${q}.` +
          (isExtraordinary(c, t) ? ` A ${pct}% move in ${days} would be extraordinary, and extraordinary predictions need strong evidence.` : "") +
          (flagged.has(c.id) && !isExtraordinary(c, t) ? " It comes with pressure to act fast." : ""),
        decisive: label === "doesnt_hold_up" && flagged.has(c.id),
      });
    } else if (c.verdict === "expected") {
      const pro = withStance(c, "supports");
      out.push({
        kind: "expected", claimId: c.id, evidenceId: pro[0]?.id, quote: quoteShort(pro[0]?.quote),
        text: `${list(pro.filter((e) => e.tier <= 2))} make a similar prediction to ${q}. Predictions like this can still turn out wrong.`,
        decisive: false,
      });
    }
  }

  for (const c of claims) {
    if (c.math) {
      out.push({
        kind: "math", claimId: c.id,
        text: `Math check: ${c.math.text}${c.type === "forecast" ? "" : " This only shows how extreme the claim is; it doesn't change the verdict."}`,
        decisive: false,
      });
    }
  }

  if (hypeFlags.length >= 2) {
    out.push({
      kind: "hype",
      text: `Uses pressure language (${hypeFlags.map((h) => `“${h}”`).join(", ")}). That's a warning sign, not proof the claim is false.`,
      decisive: label === "needs_checking" && hypeFlags.length >= t.needsCheckingHypeFlags,
    });
  }

  const unc = claims.filter((c) => c.verdict === "not_checkable");
  const forecastReasons = out.some((r) => r.kind === "unbacked" || r.kind === "expected");
  if (!scored.length && !forecastReasons) {
    // Nothing to score: say so once, in plain words.
    out.unshift(
      unc.length
        ? { kind: "not_checkable", text: `${unc.length === 1 ? "This is a forecast or an opinion" : "These are forecasts or opinions"}, not ${unc.length === 1 ? "a statement" : "statements"} of fact, so no source can confirm or contradict ${unc.length === 1 ? "it" : "them"}. There's nothing here to score.`, decisive: true }
        : { kind: "unconfirmed", text: "We didn't find any claims in this text to check.", decisive: true },
    );
  } else if (unc.length) {
    out.push({ kind: "not_checkable", text: `${unc.length} forecast or opinion claim${unc.length === 1 ? "" : "s"} can't be verified by any source, so ${unc.length === 1 ? "it was" : "they were"} left out of the score.`, decisive: false });
  }
  return out;
}
