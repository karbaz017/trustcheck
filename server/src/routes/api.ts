import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { optionalAuth, requireAuth } from "../auth.js";
import { store, type CheckRow } from "../db/index.js";
import { assertAllowedUrl, FetchError } from "../pipeline/fetchUrl.js";
import { MAX_INPUT_CHARS } from "../pipeline/run.js";
import { addons } from "../addons/index.js";
import { startCheck, subscribe } from "../runner.js";

export const api = Router();
api.use(addons);

const body = z
  .object({ text: z.string().trim().optional(), url: z.string().trim().optional() })
  .refine((b) => Boolean(b.text) !== Boolean(b.url), { message: "Send either text or a url." });

const postLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many checks. Please wait a minute and try again." },
});

api.post("/check", postLimiter, optionalAuth, async (req, res) => {
  const parsed = body.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Paste some text or a link to check." });
  const { text, url } = parsed.data;
  if (text && text.length > MAX_INPUT_CHARS)
    return res.status(400).json({ error: `That's too long (${text.length.toLocaleString("en-US")} characters). The limit is ${MAX_INPUT_CHARS.toLocaleString("en-US")}.` });
  if (url) {
    try {
      assertAllowedUrl(url);
    } catch (e) {
      return res.status(400).json({ error: e instanceof FetchError ? e.message : "That link isn't supported." });
    }
  }
  const id = await startCheck({ text, url, userId: req.userId ?? null });
  res.status(202).json({ id });
});

const visible = (row: CheckRow | null, userId?: string | null) => (row && (!row.userId || row.userId === userId) ? row : null);
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

api.get("/check/:id/stream", optionalAuth, async (req, res) => {
  const id = req.params.id;
  if (!isUuid(id)) return res.status(404).end();
  const row = visible(await store.getCheck(id), req.userId);
  if (!row) return res.status(404).end();

  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
  const send = (e: unknown) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const unsub = subscribe(id, (e) => {
    send(e);
    if (e.stage === "done" || e.stage === "error") res.end();
  });
  if (!unsub) {
    // No live run (finished earlier, or server restarted): report final state.
    send(row.status === "failed" ? { stage: "error", status: "error", message: row.error } : { stage: "done", status: row.status === "done" ? "done" : "start" });
    return res.end();
  }
  req.on("close", unsub);
});

api.get("/check/:id", optionalAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Not found" });
  const row = visible(await store.getCheck(req.params.id), req.userId);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (row.status === "done" && row.result) return res.json({ status: "done", result: row.result });
  if (row.status === "failed") return res.json({ status: "failed", error: row.error });
  res.json({ status: "running" });
});

api.get("/history", requireAuth, async (req, res) => {
  const rows = await store.listByUser(req.userId!);
  res.json(
    rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      status: r.status,
      preview: (r.inputText || r.inputUrl || "").slice(0, 140),
      label: r.result?.label ?? null,
      strength: r.result?.strength ?? null,
      evidence: r.result?.evidence ?? null,
      claimCount: r.result?.claims.length ?? 0,
    })),
  );
});

api.delete("/check/:id", requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Not found" });
  const ok = await store.deleteCheck(req.params.id, req.userId!);
  res.status(ok ? 204 : 404).end();
});
