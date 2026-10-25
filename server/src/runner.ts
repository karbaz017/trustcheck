import { randomUUID } from "node:crypto";
import { lookupDemo } from "./demoCache.js";
import { store } from "./db/index.js";
import { fetchArticle, FetchError } from "./pipeline/fetchUrl.js";
import { MAX_INPUT_CHARS, runPipeline } from "./pipeline/run.js";
import type { ProgressEvent } from "./types.js";

interface Run {
  events: ProgressEvent[];
  listeners: Set<(e: ProgressEvent) => void>;
  finished: boolean;
}
const runs = new Map<string, Run>();

function publish(id: string, e: ProgressEvent) {
  const run = runs.get(id);
  if (!run) return;
  run.events.push(e);
  run.listeners.forEach((l) => l(e));
  if (e.stage === "done" || e.stage === "error") {
    run.finished = true;
    setTimeout(() => runs.delete(id), 10 * 60_000).unref();
  }
}

/** Subscribe to progress; replays buffered events. Returns an unsubscribe fn, or null if the run is unknown. */
export function subscribe(id: string, listener: (e: ProgressEvent) => void): (() => void) | null {
  const run = runs.get(id);
  if (!run) return null;
  run.events.forEach(listener);
  if (run.finished) return () => {};
  run.listeners.add(listener);
  return () => run.listeners.delete(listener);
}

export async function startCheck(input: { text?: string; url?: string; userId: string | null }): Promise<string> {
  const id = randomUUID();
  await store.createCheck({ id, userId: input.userId, inputText: input.text ?? "", inputUrl: input.url ?? null });
  runs.set(id, { events: [], listeners: new Set(), finished: false });
  void execute(id, input);
  return id;
}

async function execute(id: string, input: { text?: string; url?: string }) {
  const timings: Record<string, number> = {};
  const extraLimitations: string[] = [];
  try {
    let text = input.text ?? "";
    if (input.url) {
      let host = input.url;
      try { host = new URL(input.url).hostname.replace(/^www\./, ""); } catch { /* validated already */ }
      publish(id, { stage: "fetch", status: "start", message: `Opening ${host}` });
      const t0 = Date.now();
      let article;
      try {
        article = await fetchArticle(input.url);
      } catch (e) {
        timings.fetch = Date.now() - t0;
        publish(id, { stage: "fetch", status: "error", ms: timings.fetch, message: (e as Error).message });
        throw e;
      }
      text = article.text;
      timings.fetch = Date.now() - t0;
      const lines = [
        article.title ? `Title: ${article.title}` : "",
        `Downloaded ${(article.bytes / 1024).toFixed(0)} KB${article.truncated ? " (page was very large; read the first 3 MB)" : ""}`,
      ];
      if (text.length > MAX_INPUT_CHARS) {
        text = text.slice(0, MAX_INPUT_CHARS);
        extraLimitations.push(`Only the first ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters of the article were checked.`);
        lines.push(`Checking the first ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters of the article text`);
      }
      publish(id, { stage: "fetch", status: "done", ms: timings.fetch, message: `Read ${article.text.length.toLocaleString("en-US")} characters of text from ${article.host}`, lines: lines.filter(Boolean) });
    }

    const demo = lookupDemo(text);
    if (demo) {
      // Pre-warmed result for a rehearsed demo claim: replay the stages quickly so the UI looks the same.
      for (const s of ["extract", "search", "stance", "math", "explain"] as const) {
        publish(id, { stage: s, status: "start" });
        await new Promise((r) => setTimeout(r, 250));
        publish(id, { stage: s, status: "done", ms: demo.timings[s] });
      }
      const result = { ...demo, id, limitations: [...demo.limitations, "Served from the pre-warmed demo cache."] };
      await store.finishCheck(id, { status: "done", result, timings: demo.timings });
      publish(id, { stage: "done", status: "done" });
      return;
    }

    const result = await runPipeline(text, {
      id, timings, extraLimitations,
      onProgress: (e) => publish(id, e),
    });
    await store.finishCheck(id, { status: "done", result, timings });
    publish(id, { stage: "done", status: "done" });
  } catch (e) {
    const message = userFacingError(e);
    console.error(`[check ${id}] failed: ${(e as Error).message}`); // no user text in logs
    await store.finishCheck(id, { status: "failed", error: message, timings });
    publish(id, { stage: "error", status: "error", message });
  }
}

function userFacingError(e: unknown): string {
  if (e instanceof FetchError) return e.message;
  const msg = (e as Error)?.message ?? "";
  if (/Claim extraction failed/.test(msg)) return "The AI model couldn't read this text right now. Please try again in a moment.";
  if (/credentials|invalid_grant|reauth/i.test(msg)) return "The server can't reach the AI model (Google Cloud login expired). Ask the team to sign in again.";
  return "Something went wrong while checking. Please try again.";
}
