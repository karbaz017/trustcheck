import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addons } from "../src/addons/index.js";
import { buildPlan, caseSummary, loadPlaybook, type Answers } from "../src/addons/scamsos/playbook.js";
import { validateRephrase } from "../src/addons/scamsos/rephrase.js";
import { validatePlaybook } from "../src/addons/scamsos/validatePlaybook.js";

const A = (o: Partial<Answers>): Answers => ({ happened: ["sent_money"], method: "not_applicable", amount: "none", when: "today", contact: "other", ...o });

describe("playbook file", () => {
  it("passes validation: no TODO_VERIFY_URL, official sources or own-provider, no promises", () => {
    expect(validatePlaybook(loadPlaybook())).toEqual([]);
  });
  it("validation catches placeholders, unofficial hosts, missing sources and promises", () => {
    const pb = loadPlaybook();
    const bad = (mut: (s: { sourceUrl?: string; ownProvider?: boolean; text: string }) => void) => {
      const c = JSON.parse(JSON.stringify(pb));
      mut(c.rules[0].steps[0]);
      return validatePlaybook(c);
    };
    expect(bad((s) => (s.sourceUrl = "TODO_VERIFY_URL")).join()).toMatch(/TODO_VERIFY_URL/);
    expect(bad((s) => (s.sourceUrl = "https://scam-help.example.com/x")).join()).toMatch(/not an official/);
    expect(bad((s) => { delete s.sourceUrl; delete s.ownProvider; }).join()).toMatch(/needs a sourceUrl/);
    expect(bad((s) => (s.text += " You will get your money back.")).join()).toMatch(/promise/);
    expect(bad((s) => (s.text += " Disputes must be filed within 60 days.")).join()).toMatch(/promise/);
  });
});

// 10 synthetic scenarios. Fictional, not based on any real case.
const SCENARIOS: [string, Answers, string][] = [
  ["job-offer check (fake deposit, sent a transfer)", A({ method: "bank_transfer", amount: "1000_10000", when: "this_week", contact: "email" }), "contact_bank_transfer_provider"],
  ["romance (paid in crypto)", A({ method: "crypto", amount: "over_10000", when: "longer_ago", contact: "social_media" }), "contact_crypto_platform"],
  ["gift card demand", A({ method: "gift_cards", amount: "100_1000", when: "today", contact: "text" }), "contact_gift_card_issuer"],
  ["bank impersonation call (code shared and money sent)", A({ happened: ["sent_money", "shared_code_or_password"], method: "bank_transfer", amount: "1000_10000", when: "within_hour", contact: "call" }), "contact_bank_transfer_provider"],
  ["'friend' asking for a transfer (paid by card)", A({ method: "card", amount: "under_100", when: "today", contact: "social_media" }), "contact_card_issuer"],
  ["investment pitch (wire)", A({ method: "wire", amount: "over_10000", when: "this_week", contact: "other" }), "contact_wire_provider"],
  ["tech-support remote access", A({ happened: ["gave_remote_access"], amount: "none", when: "within_hour", contact: "call" }), "secure_device"],
  ["fake invoice (clicked, typed a password)", A({ happened: ["clicked_link", "shared_code_or_password"], amount: "none", contact: "email" }), "change_passwords"],
  ["marketplace overpayment (card)", A({ method: "card", amount: "100_1000", when: "within_hour", contact: "other" }), "contact_card_issuer"],
  ["crypto giveaway (clicked a link only)", A({ happened: ["clicked_link"], amount: "none", contact: "social_media" }), "close_link_page"],
];

describe("scenarios: expected first 'now' step", () => {
  it.each(SCENARIOS)("%s", (_n, answers, first) => expect(buildPlan(answers).now[0].id).toBe(first));
});

describe("plan rules", () => {
  it("universal steps always apply and nothing is duplicated", () => {
    for (const [, a] of SCENARIOS) {
      const p = buildPlan(a);
      const ids = [...p.now, ...p.today, ...p.this_week].map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(expect.arrayContaining(["stop_contact", "keep_evidence", "report_ftc"]));
    }
  });
  it("worried-only: no bank-contact steps, pause and evidence first", () => {
    const p = buildPlan(A({ happened: ["nothing_yet"], method: "not_applicable", amount: "none" }));
    expect(p.now.map((s) => s.id)).toEqual(["stop_contact", "keep_evidence"]);
    expect([...p.now, ...p.today, ...p.this_week].some((s) => s.id.startsWith("contact_"))).toBe(false);
  });
  it("shared ID details adds a credit freeze/alert step for today", () => {
    expect(buildPlan(A({ happened: ["shared_id_details"] })).today.map((s) => s.id)).toContain("credit_freeze_alert");
  });
  it("money lost adds an IC3 report step this week", () => {
    expect(buildPlan(A({ method: "card" })).this_week.map((s) => s.id)).toEqual(["report_ic3"]);
  });
  it("every step is sourced (official URL) or points to the user's own provider", () => {
    for (const [, a] of SCENARIOS) for (const s of [...buildPlan(a).now, ...buildPlan(a).today]) expect(Boolean(s.sourceUrl) || s.ownProvider === true).toBe(true);
  });
});

describe("case summary", () => {
  it("is plain text built from answers, with placeholders for the user's own details", () => {
    const a = A({ method: "gift_cards", amount: "100_1000", contact: "text" });
    const t = caseSummary(a, buildPlan(a));
    expect(t).toContain("Gift cards");
    expect(t).toContain("$100 to $1,000");
    expect(t).toContain("(add)");
    expect(t).not.toMatch(/<|>/);
  });
});

describe("rephrase guard", () => {
  const step = { id: "x", tier: "now" as const, text: "Call your card issuer using the number on the back of your card, then ask about disputing the charge." };
  it("accepts a faithful rewording", () => expect(validateRephrase(step, "Please call your card issuer on the number printed on the back of your card, and ask about disputing the charge.")).toBe(true));
  it.each([
    ["adds a link", "Call your card issuer, see https://example.com for help and ask about disputing the charge."],
    ["adds a number", "Call your card issuer at 555 within the hour and ask about disputing the charge."],
    ["promises money back", "Call your card issuer and you will get your money back after disputing the charge."],
    ["is advice-like", "I recommend you call your card issuer using the number on the back of your card."],
    ["is far longer", "Call your card issuer. ".repeat(20)],
  ])("rejects a rewording that %s", (_n, text) => expect(validateRephrase(step, text)).toBe(false));
});

describe("POST /api/scamsos", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let base = "";
  beforeEach(async () => {
    process.env.FEATURE_SCAMSOS = "true";
    delete process.env.GOOGLE_CLOUD_PROJECT; // model unavailable, so the plan falls back to the rule text
    const app = express();
    app.use(express.json());
    app.use("/api", addons);
    await new Promise<void>((r) => (server = app.listen(0, r)));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterEach(() => { delete process.env.FEATURE_SCAMSOS; server.close(); });
  const post = (b: unknown) => fetch(`${base}/scamsos`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  const ok = { happened: ["sent_money"], method: "gift_cards", amount: "100_1000", when: "today", contact: "text" };

  it("is off by default (404)", async () => {
    delete process.env.FEATURE_SCAMSOS;
    expect((await post(ok)).status).toBe(404);
  });
  it("rejects incomplete or invalid answers", async () => {
    expect((await post({ ...ok, method: "paypal-ish" })).status).toBe(400);
    expect((await post({ ...ok, happened: [] })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });
  it("returns a three-tier plan, summary, gentle line and disclaimer, and never calls it definitively a scam", async () => {
    const res = await post(ok);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan.now[0].id).toBe("contact_gift_card_issuer");
    expect(body.rephrased).toBe(false);
    expect(body.summary).toContain("CASE SUMMARY");
    expect(body.gentle).toMatch(/careful/);
    expect(body.disclaimer).toMatch(/not legal or financial advice/);
    expect(body.supportive).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/\b(this was a scam|you were scammed|definitely a scam|safe|legitimate)\b/i);
  });
  it("shows a supportive message when the user says they feel overwhelmed or unsafe", async () => {
    const body = await (await post({ ...ok, distress: true })).json();
    expect(body.supportive).toMatch(/someone you trust/);
    expect(body.supportive).toMatch(/emergency services/);
  });
});
