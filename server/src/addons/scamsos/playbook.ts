import { readFileSync } from "node:fs";
import { labelOf, QUESTIONS } from "./questions.js";

export type Tier = "now" | "today" | "this_week";
export interface Step { id: string; tier: Tier; text: string; sourceUrl?: string; ownProvider?: boolean }
interface Cond { happened_any?: string[]; method_any?: string[]; amount_any?: string[]; when_any?: string[]; contact_any?: string[] }
export interface Rule { id: string; priority: number; when: Cond; not?: Cond; steps: Step[] }
export interface Playbook { verifiedOn: string; officialHosts: string[]; rules: Rule[] }

export interface Answers { happened: string[]; method: string; amount: string; when: string; contact: string; distress?: boolean }
export interface Plan { now: Step[]; today: Step[]; this_week: Step[] }

export const loadPlaybook = (): Playbook => JSON.parse(readFileSync(new URL("../../config/playbook.json", import.meta.url), "utf8"));

const any = (have: string[], want?: string[]) => !want || want.some((w) => have.includes(w));
function matches(c: Cond | undefined, a: Answers): boolean {
  if (!c) return false;
  return any(a.happened, c.happened_any) && any([a.method], c.method_any) && any([a.amount], c.amount_any) && any([a.when], c.when_any) && any([a.contact], c.contact_any);
}

/** Rules (not the model) decide the steps. Ordered by rule priority within each tier; de-duplicated by step id. */
export function buildPlan(a: Answers, pb: Playbook = loadPlaybook()): Plan {
  const plan: Plan = { now: [], today: [], this_week: [] };
  const seen = new Set<string>();
  for (const r of [...pb.rules].sort((x, y) => x.priority - y.priority)) {
    if (!matches(r.when, a) || (r.not && Object.keys(r.not).length && matches(r.not, a))) continue;
    for (const s of r.steps) if (!seen.has(s.id)) (seen.add(s.id), plan[s.tier].push(s));
  }
  // Someone who only has a worry has nothing to contact a bank about, so drop the bank-contact steps for them.
  if (a.happened.length === 1 && a.happened[0] === "nothing_yet") for (const t of ["now", "today", "this_week"] as Tier[]) plan[t] = plan[t].filter((s) => s.id !== "contact_bank");
  return plan;
}

const SIGNS: Record<string, string> = {
  gift_cards: "You mentioned gift cards. The FTC lists gift cards among the payment types scammers insist on.",
  wire: "You mentioned a wire transfer. The FTC lists wire transfer services among the payment types scammers insist on.",
  bank_transfer: "You mentioned a bank transfer or payment app. The FTC lists payment apps among the payment types scammers insist on.",
  crypto: "You mentioned cryptocurrency. The FTC lists cryptocurrency among the payment types scammers insist on.",
};
/** Soft pattern notes. Never says whether it was or wasn't a scam. */
export const signsFor = (a: Answers): string[] => (SIGNS[a.method] ? [SIGNS[a.method]] : []);

export const GENTLE = "This happens to careful, smart people. It isn't a sign that you did something wrong, and acting on it now is a good step.";
export const SUPPORTIVE = "That sounds really stressful. You don't have to handle this alone. Consider reaching out to someone you trust, like a friend, family member, or a counselor, and talk it through. If you ever feel unsafe or in immediate danger, contact your local emergency services.";
export const DISCLAIMER = "This is general guidance, not legal or financial advice. We can't tell for certain whether a scam took place, and we can't promise any outcome.";

/** Plain-text case summary the user can paste into a bank or report form. Built from the answers only (no free text). */
export function caseSummary(a: Answers, plan: Plan): string {
  const happened = a.happened.map((h) => labelOf("happened", h)).join("; ");
  const lines = [
    "CASE SUMMARY (written by me with the help of Verifin ScamSOS)",
    "",
    "Timeline",
    `- When it happened: ${labelOf("when", a.when)}`,
    "- Date and time of first contact: (add)",
    `- How I was contacted: ${labelOf("contact", a.contact)}`,
    "- Name, number, or username the sender used: (add)",
    "",
    "What happened",
    `- ${happened}`,
    `- Payment method: ${labelOf("method", a.method)}`,
    `- Approximate amount: ${labelOf("amount", a.amount)}`,
    "- Account or card used: (add the last 4 digits only)",
    "",
    "Steps I plan to take",
    ...(["now", "today", "this_week"] as Tier[]).flatMap((t) => plan[t].map((s) => `- [${t === "this_week" ? "this week" : t}] ${s.text}`)),
    "",
    "Steps I've already taken: (add)",
    "Evidence I have saved: (add)",
  ];
  return lines.join("\n");
}

export const QUESTION_KEYS = QUESTIONS.map((q) => q.key);
