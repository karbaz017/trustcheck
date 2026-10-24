import { z } from "zod";
import { generateJson } from "../llm/gemini.js";
import { extractSchema, extractSystem, extractUser } from "../prompts/extractClaims.js";
import type { ExtractedClaim } from "../types.js";

const claimSchema = z.object({
  text: z.string().min(1).max(500),
  type: z.enum(["checkable_fact", "numeric", "forecast", "opinion"]),
  importance: z.number().int().min(1).max(3),
  numeric: z
    .object({ kind: z.enum(["multiple", "return_pct"]), value: z.number(), periodDays: z.number() })
    .nullish(),
  queries: z.array(z.string().min(3).max(300)).length(2),
});
const outSchema = z.object({ claims: z.array(claimSchema).max(8) });

export async function extractClaims(text: string): Promise<ExtractedClaim[]> {
  const out = await generateJson({
    system: extractSystem,
    user: extractUser(text),
    responseSchema: extractSchema,
    parse: outSchema,
    label: "Claim extraction",
  });
  return out.claims.map((c) => ({
    text: c.text,
    type: c.type,
    importance: c.importance as 1 | 2 | 3,
    numeric: c.numeric ?? undefined,
    queries: [c.queries[0], c.queries[1]] as [string, string],
  }));
}
