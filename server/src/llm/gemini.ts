import { z } from "zod";
import { callModel } from "./client.js";

export interface GenerateOptions<T> {
  system: string;
  user: string;
  /** Gemini responseSchema (OpenAPI subset). */
  responseSchema: Record<string, unknown>;
  parse: z.ZodType<T>;
  /** Extra semantic validation; return an error message or null. */
  validate?: (value: T) => string | null;
  label: string;
}

const TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;

async function callGemini(system: string, user: string, schema: Record<string, unknown>): Promise<string> {
  const res = await callModel(
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
    },
    TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`Vertex AI HTTP ${res.status}`);
  const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

/** Structured call with schema validation; retries up to 2 times, feeding the validation error back. */
export async function generateJson<T>(opts: GenerateOptions<T>): Promise<T> {
  let feedback = "";
  let lastErr = "unknown";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const user = feedback ? `${opts.user}\n\n[PREVIOUS ATTEMPT WAS INVALID: ${feedback}. Fix this and answer again.]` : opts.user;
      const raw = await callGemini(opts.system, user, opts.responseSchema);
      const parsed = opts.parse.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        feedback = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 400);
      } else {
        const semantic = opts.validate?.(parsed.data) ?? null;
        if (!semantic) return parsed.data;
        feedback = semantic;
      }
      lastErr = feedback;
    } catch (e) {
      lastErr = (e as Error).message;
      feedback = lastErr.slice(0, 200);
    }
  }
  throw new Error(`${opts.label} failed after retries: ${lastErr}`);
}
