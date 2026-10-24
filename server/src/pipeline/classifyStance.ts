import { z } from "zod";
import { generateJson } from "../llm/gemini.js";
import { stanceSchema, stanceSystem, stanceUser } from "../prompts/classifyStance.js";
import type { Evidence } from "../types.js";
import { isVerbatimQuote } from "./validators.js";

const outSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      stance: z.enum(["supports", "contradicts", "mixed", "irrelevant"]),
      stanceReason: z.string().max(600),
      quote: z.string().max(600),
    }),
  ),
});
export type StanceOutput = z.infer<typeof outSchema>;

/** Citation integrity: every id returned must exist in the retrieved set, and every retrieved id must be covered once. */
export function validateStanceIds(out: StanceOutput, evidence: Evidence[]): string | null {
  const known = new Set(evidence.map((e) => e.id));
  const seen = new Set<string>();
  for (const it of out.items) {
    if (!known.has(it.id)) return `unknown evidence id "${it.id}"`;
    if (seen.has(it.id)) return `duplicate id "${it.id}"`;
    seen.add(it.id);
  }
  const missing = [...known].filter((id) => !seen.has(id));
  return missing.length ? `missing ids: ${missing.join(", ")}` : null;
}

const words = (s: string) => (s.toLowerCase().match(/[a-z0-9$%.]{5,}/g) ?? []) as string[];

/** Apply stance output to evidence, verifying quotes. Pure; unit-tested. */
export function applyStances(evidence: Evidence[], out: StanceOutput): Evidence[] {
  const byId = new Map(out.items.map((i) => [i.id, i]));
  return evidence.map((e) => {
    const it = byId.get(e.id);
    if (!it) return { ...e, stance: "irrelevant" as const };
    if (it.stance === "irrelevant") return { ...e, stance: "irrelevant" as const, stanceReason: it.stanceReason };
    if (it.quote && isVerbatimQuote(it.quote, e.snippet)) {
      return { ...e, stance: it.stance, stanceReason: it.stanceReason, quote: it.quote.trim() };
    }
    // Quote failed verification: drop it. Keep the stance only if the reason still points at the snippet text.
    const snippetWords = new Set(words(e.snippet));
    const overlap = words(it.stanceReason).filter((w) => snippetWords.has(w)).length;
    if (overlap >= 2) return { ...e, stance: it.stance, stanceReason: it.stanceReason };
    return { ...e, stance: "irrelevant" as const, stanceReason: "Could not verify this source addresses the claim." };
  });
}

export async function classifyStance(claimText: string, evidence: Evidence[]): Promise<Evidence[]> {
  if (evidence.length === 0) return evidence;
  const out = await generateJson({
    system: stanceSystem,
    user: stanceUser(claimText, evidence),
    responseSchema: stanceSchema,
    parse: outSchema,
    validate: (o) => validateStanceIds(o, evidence),
    label: "Stance classification",
  });
  return applyStances(evidence, out);
}
