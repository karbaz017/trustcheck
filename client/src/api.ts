import type { CheckResult, Implication, ProgressEvent } from "../../server/src/types";

let tokenGetter: (() => Promise<string | null>) | null = null;
export const setTokenGetter = (fn: (() => Promise<string | null>) | null) => { tokenGetter = fn; };

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const t = tokenGetter ? await tokenGetter() : null;
    return t ? { authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

export type CheckStatus = { status: "running" } | { status: "failed"; error: string } | { status: "done"; result: CheckResult };

export async function startCheck(input: { text?: string; url?: string }): Promise<string> {
  const res = await fetch("/api/check", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Something went wrong. Please try again.");
  return body.id as string;
}

export async function getCheck(id: string): Promise<CheckStatus> {
  const res = await fetch(`/api/check/${id}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error("We couldn't find that check.");
  return res.json();
}

/** Server-Sent Events over fetch so the Authorization header can be sent. */
export async function streamProgress(id: string, onEvent: (e: ProgressEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await fetch(`/api/check/${id}/stream`, { headers: await authHeaders(), signal });
  if (!res.ok || !res.body) throw new Error("Lost connection to the progress stream.");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)));
    }
  }
}

export interface HistoryItem {
  id: string; createdAt: string; status: string; preview: string;
  label: CheckResult["label"] | null; strength: CheckResult["strength"] | null; claimCount: number;
}
export async function getHistory(): Promise<HistoryItem[]> {
  const res = await fetch("/api/history", { headers: await authHeaders() });
  if (!res.ok) throw new Error("Log in to see your history.");
  return res.json();
}
export async function deleteCheck(id: string): Promise<void> {
  const res = await fetch(`/api/check/${id}`, { method: "DELETE", headers: await authHeaders() });
  if (!res.ok) throw new Error("Couldn't delete that check.");
}

export interface Features { calculators: boolean; emailCheck: boolean; scamsos: boolean }
export async function getFeatures(): Promise<Features> {
  try {
    const res = await fetch("/api/features");
    return res.ok ? res.json() : { calculators: false, emailCheck: false, scamsos: false };
  } catch {
    return { calculators: false, emailCheck: false, scamsos: false };
  }
}

/** Recompute a calculator card after the user supplies assumptions. Computed by code on the server. */
export async function calculate(calc: string, params: Record<string, number>, assumed: string[]): Promise<Implication> {
  const res = await fetch("/api/calculate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ calc, params, assumed }) });
  if (!res.ok) throw new Error("Couldn't work that out. Check the numbers and try again.");
  return res.json();
}

export interface EmailSignal { id: string; severity: "info" | "warn" | "high"; title: string; detail: string; evidence: string }
export interface EmailCheckResponse {
  label: "Several warning signs" | "Some warning signs" | "No strong warning signs found in this file";
  signals: EmailSignal[];
  limitations: string[];
  checkId: string | null;
  meta: { from: string; subject: string; linkCount: number; attachments: { filename: string; contentType: string }[] };
}
export async function checkEmail(file: File): Promise<EmailCheckResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/email-check", { method: "POST", headers: await authHeaders(), body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Something went wrong. Please try again.");
  return body;
}

/** Follow a running check: stream progress, then fetch the final result. */
export async function followCheck(id: string, onEvent: (e: ProgressEvent) => void, signal: AbortSignal): Promise<CheckResult> {
  await streamProgress(id, onEvent, signal).catch(() => {});
  for (let i = 0; i < 60; i++) {
    const s = await getCheck(id);
    if (s.status === "done") return s.result;
    if (s.status === "failed") throw new Error(s.error);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("This is taking longer than expected. Please try again.");
}
