import type { SearchHit } from "../search/types.js";

/** A tool result becomes a search-style hit (with exact, code-formatted text) so the normal stance + verdict steps judge it. */
export type ToolHit = SearchHit & { live: true };

export class ToolError extends Error {}

export const fmtUsd = (n: number, dp = 2) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
export const fmtBig = (n: number) =>
  n >= 1e12 ? `$${(n / 1e12).toFixed(2)} trillion` : n >= 1e9 ? `$${(n / 1e9).toFixed(2)} billion` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)} million` : fmtUsd(n, 0);

export async function getJson(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new ToolError(`HTTP ${res.status}`);
  return res.json();
}
