import { z } from "zod";
import { generateJson } from "../llm/gemini.js";
import { explainSchema, explainSystem, explainUser } from "../prompts/explain.js";
import type { ClaimResult, ClaimVerdict, OverallLabel } from "../types.js";
import { containsAdvice, unknownEvidenceIds, wordCount } from "./validators.js";

const outSchema = z.object({
  claims: z.array(z.object({ id: z.string(), why: z.string() })),
  whyOverall: z.string(),
});
type Out = z.infer<typeof outSchema>;

export const TEMPLATE_WHY: Record<ClaimVerdict, string> = {
  supported: "Reliable sources we found back this claim up.",
  mixed: "The sources we found disagree or only partly back this claim.",
  refuted: "Reliable sources we found contradict this claim.",
  unverifiable: "We couldn't find a reliable source that confirms or contradicts this claim.",
  not_checkable: "This is a forecast or an opinion, so sources can't confirm or refute it.",
};

export const TEMPLATE_OVERALL: Record<OverallLabel, string> = {
  holds_up: "The main claims are backed by reliable sources we found. That says nothing about whether it fits your situation.",
  needs_checking: "At least one central claim is unconfirmed, only partly supported, or surrounded by hype language. Check the evidence below.",
  doesnt_hold_up: "At least one central claim is contradicted by reliable sources we found. See the evidence below.",
};

export function validateExplanations(out: Out, claims: ClaimResult[]): string | null {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const seen = new Set<string>();
  for (const c of out.claims) {
    const claim = byId.get(c.id);
    if (!claim) return `unknown claim id "${c.id}"`;
    seen.add(c.id);
    if (wordCount(c.why) > 70) return `"why" for ${c.id} is too long (max 60 words)`;
    const bad = unknownEvidenceIds(c.why, new Set(claim.evidence.map((e) => e.id)));
    if (bad.length) return `claim ${c.id} cites unknown evidence ids: ${bad.join(", ")}`;
    if (containsAdvice(c.why)) return "contains advice phrasing; describe the evidence only";
  }
  if (claims.some((c) => !seen.has(c.id))) return "missing explanation for some claims";
  if (wordCount(out.whyOverall) > 130) return "whyOverall too long (max 120 words)";
  if (/\be\d+\b/.test(out.whyOverall)) return "whyOverall must not cite evidence ids";
  const internal = [out.whyOverall, ...out.claims.map((c) => c.why)].find((t) => /\b[a-z]+_[a-z_]+\b/.test(t));
  if (internal) return "uses an internal code name (like needs_checking); use plain words such as 'needs checking'";
  if (containsAdvice(out.whyOverall)) return "whyOverall contains advice phrasing";
  return null;
}

/** Writes explanations without altering verdicts. Falls back to deterministic templates if the model output fails validation. */
export async function writeExplanations(
  claims: ClaimResult[], label: OverallLabel, score: number, hypeFlags: string[],
): Promise<{ claims: ClaimResult[]; whyOverall: string; usedTemplate: boolean }> {
  const template = () => ({
    claims: claims.map((c) => ({ ...c, why: TEMPLATE_WHY[c.verdict] })),
    whyOverall: TEMPLATE_OVERALL[label],
    usedTemplate: true,
  });
  if (claims.length === 0) return { claims, whyOverall: "We didn't find any money-related claims in this text to check.", usedTemplate: true };
  try {
    const out = await generateJson({
      system: explainSystem,
      user: explainUser(claims, label, score, hypeFlags),
      responseSchema: explainSchema,
      parse: outSchema,
      validate: (o) => validateExplanations(o, claims),
      label: "Explanation",
    });
    const why = new Map(out.claims.map((c) => [c.id, c.why.trim()]));
    return { claims: claims.map((c) => ({ ...c, why: why.get(c.id) ?? TEMPLATE_WHY[c.verdict] })), whyOverall: out.whyOverall.trim(), usedTemplate: false };
  } catch {
    return template();
  }
}
