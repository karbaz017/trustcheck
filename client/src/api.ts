import type { CheckResult, ProgressEvent } from "../../server/src/types";

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
