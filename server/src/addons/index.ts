import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { optionalAuth } from "../auth.js";
import { CALC_NAMES, CALC_REQUIRED, evaluateCalc, type CalcName } from "../pipeline/calculators.js";
import { MAX_INPUT_CHARS } from "../pipeline/run.js";
import { startCheck } from "../runner.js";
import { features, isOn, type Feature } from "./flags.js";
import { parseEmail } from "./emailCheck/parse.js";
import { redact } from "./emailCheck/redact.js";
import { buildPlan, caseSummary, DISCLAIMER, GENTLE, signsFor, SUPPORTIVE, type Answers } from "./scamsos/playbook.js";
import { rephrasePlan } from "./scamsos/rephrase.js";
import { idsOf } from "./scamsos/questions.js";
import { researchMarket } from "./market/research.js";
import { emptyBrief, structureBrief } from "./market/structure.js";
import type { MarketBrief } from "./market/types.js";
import { newsFor } from "./news/feeds.js";
import type { NewsResponse } from "./news/types.js";
import { secAvailable } from "../tools/sec.js";
import { computeSignals, EMAIL_LIMITATIONS, summarize } from "./emailCheck/signals.js";

export const addons = Router();

const limiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests. Please wait a minute." } });
/** A disabled add-on behaves as if the route doesn't exist. */
const gate = (f: Feature) => (_req: Request, res: Response, next: NextFunction) => (isOn(f) ? next() : res.status(404).json({ error: "Not found" }));

addons.get("/features", (_req, res) => res.json(features()));

// ---- A. Calculators: deterministic recompute after the user supplies an assumption (no model involved) ----
const calcBody = z.object({
  calc: z.enum(CALC_NAMES as [string, ...string[]]),
  params: z.record(z.string(), z.number().finite()),
  assumed: z.array(z.string()).max(12).default([]),
});

addons.post("/calculate", gate("calculators"), limiter, (req, res) => {
  const parsed = calcBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "That input isn't valid." });
  const calc = parsed.data.calc as CalcName;
  const allowed = new Set(CALC_REQUIRED[calc]);
  const params = Object.fromEntries(Object.entries(parsed.data.params).filter(([k]) => allowed.has(k)));
  res.json(evaluateCalc(calc, params, parsed.data.assumed.filter((k) => allowed.has(k))));
});

// ---- B. Email check: .eml upload, processed in memory only ----
const MAX_EML = 2 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EML, files: 1, fields: 0 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.eml$/i.test(file.originalname) || file.mimetype === "message/rfc822";
    if (ok) cb(null, true);
    else cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
  },
});

addons.post("/email-check", gate("emailCheck"), limiter, optionalAuth, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      const tooBig = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
      return res.status(400).json({ error: tooBig ? "That file is over 2 MB. Please upload a smaller .eml file." : "Please upload a single .eml file (download the message from your email app)." });
    }
    if (!req.file) return res.status(400).json({ error: "Please upload a .eml file." });
    try {
      const mail = await parseEmail(req.file.buffer);
      const signals = computeSignals(mail);
      const body = redact(`${mail.subject}\n\n${mail.text}`).trim();
      const limitations = [...EMAIL_LIMITATIONS];
      let checkId: string | null = null;
      if (body.length >= 40) {
        const text = body.slice(0, MAX_INPUT_CHARS);
        if (body.length > MAX_INPUT_CHARS) limitations.push(`Only the first ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters of the email were claim-checked.`);
        checkId = await startCheck({ text, userId: req.userId ?? null }); // redacted text only
      }
      res.json({
        label: summarize(signals),
        signals,
        limitations,
        checkId,
        meta: { from: mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress, subject: mail.subject, linkCount: mail.links.length, attachments: mail.attachments },
      });
    } catch {
      res.status(400).json({ error: "We couldn't read that file as an email." });
    }
  });
});

// ---- C. ScamSOS: rules decide the steps; the model may only reword them. Nothing is stored or logged. ----
const scamBody = z.object({
  happened: z.array(z.enum(idsOf("happened"))).min(1).max(6),
  method: z.enum(idsOf("method")),
  amount: z.enum(idsOf("amount")),
  when: z.enum(idsOf("when")),
  contact: z.enum(idsOf("contact")),
  distress: z.boolean().optional(),
});

addons.post("/scamsos", gate("scamsos"), limiter, async (req, res) => {
  const parsed = scamBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Please answer all five questions." });
  const answers: Answers = parsed.data;
  const base = buildPlan(answers);
  const { plan, rephrased } = await rephrasePlan(base);
  res.json({
    plan,
    rephrased,
    summary: caseSummary(answers, plan),
    signs: signsFor(answers),
    gentle: GENTLE,
    supportive: answers.distress ? SUPPORTIVE : null,
    disclaimer: DISCLAIMER,
  });
});

// ---- E. Market briefing: sourced market context, never a recommendation ----
const marketCache = new Map<string, { at: number; brief: MarketBrief }>();
const marketLimiter = rateLimit({ windowMs: 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: "Too many briefings. Please wait a minute." } });
const marketBody = z.object({ query: z.string().trim().min(2).max(300) });

addons.post("/market-brief", gate("market"), marketLimiter, async (req, res) => {
  const parsed = marketBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Enter a ticker, company, or market (up to 300 characters)." });
  const query = parsed.data.query;
  const key = query.toLowerCase().replace(/\s+/g, " ");
  const hit = marketCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return res.json(hit.brief);
  try {
    const { annotated, sources } = await researchMarket(query);
    const brief = await structureBrief(query, annotated, sources);
    marketCache.set(key, { at: Date.now(), brief });
    res.json(brief);
  } catch (e) {
    console.error(`[market] failed: ${(e as Error).message}`); // never log the query
    res.status(502).json({ error: "We couldn't build a briefing right now. Please try again in a moment." });
  }
});

// ---- F. News alerts: latest headlines from reliable outlets and SEC filings for a watchlist ----
const newsLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many refreshes. Please wait a minute." } });
const newsBody = z.object({ topics: z.array(z.string().trim().min(2).max(60).regex(/^[\p{L}\p{N} .&'\-]+$/u)).min(1).max(10) });

addons.post("/news", gate("news"), newsLimiter, async (req, res) => {
  const parsed = newsBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Add 1 to 10 topics (letters, numbers, spaces)." });
  const topics = [...new Set(parsed.data.topics)];
  const lists = await Promise.all(topics.map((t) => newsFor(t)));
  const seen = new Set<string>();
  const items = lists.flat().filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true))).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 60);
  const body: NewsResponse = { items, fetchedAt: new Date().toISOString(), filingsEnabled: secAvailable() };
  res.json(body);
});
