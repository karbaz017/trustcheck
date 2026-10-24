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
