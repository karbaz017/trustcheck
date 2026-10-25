import { z } from "zod";
import { generateJson } from "../llm/gemini.js";
import { isOn } from "../addons/flags.js";
import { CALC_NAMES, CALC_REQUIRED } from "./calculators.js";
import { calcPromptAddendum, calcSchemaProps, extractSchema, extractSystem, extractUser } from "../prompts/extractClaims.js";
import type { ExtractedClaim } from "../types.js";

const claimSchema = z.object({
  text: z.string().min(1).max(500),
  type: z.enum(["checkable_fact", "numeric", "forecast", "opinion"]),
  importance: z.number().int().min(1).max(3),
  numeric: z
    .object({ kind: z.enum(["multiple", "return_pct"]), value: z.number(), periodDays: z.number() })
    .nullish(),
  queries: z.array(z.string().min(3).max(300)).length(2),
  calculation: z
    .object({ kind: z.enum(CALC_NAMES as [string, ...string[]]) })
    .catchall(z.number().nullish())
    .nullish(),
});
const outSchema = z.object({ claims: z.array(claimSchema).max(8) });

/** Adds the optional calculator fields to the model schema only when the add-on is on. */
function schemaFor(withCalc: boolean) {
  if (!withCalc) return extractSchema;
  const items = (extractSchema.properties.claims as { items: { properties: Record<string, unknown> } }).items;
  return {
    ...extractSchema,
    properties: { claims: { ...extractSchema.properties.claims, items: { ...items, properties: { ...items.properties, ...calcSchemaProps } } } },
  };
}

export async function extractClaims(text: string): Promise<ExtractedClaim[]> {
  const withCalc = isOn("calculators");
  const out = await generateJson({
    system: withCalc ? extractSystem + calcPromptAddendum : extractSystem,
    user: extractUser(text),
    responseSchema: schemaFor(withCalc),
    parse: outSchema,
    label: "Claim extraction",
    // Long articles (up to MAX_INPUT_CHARS) with unbounded thinking ran past 20s on every retry.
    timeoutMs: 45_000,
    thinkingBudget: 2048,
  });
  return out.claims.map((c) => ({
    text: c.text,
    type: c.type,
    importance: c.importance as 1 | 2 | 3,
    numeric: c.numeric ?? undefined,
    queries: [c.queries[0], c.queries[1]] as [string, string],
    calc: withCalc && c.calculation ? toCalc(c.calculation as Record<string, unknown>) : undefined,
  }));
}

/** Keep only the parameters that calculator uses; anything else from the model is dropped. */
function toCalc(raw: Record<string, unknown>): { kind: string; params: Record<string, number | null> } {
  const kind = String(raw.kind);
  const params: Record<string, number | null> = {};
  for (const k of CALC_REQUIRED[kind as keyof typeof CALC_REQUIRED] ?? []) {
    const v = raw[k];
    params[k] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return { kind, params };
}
