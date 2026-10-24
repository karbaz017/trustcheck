import { fmtBig, fmtPct, fmtUsd, getJson, ToolError, type ToolHit } from "./types.js";

export const finnhubAvailable = () => Boolean(process.env.FINNHUB_API_KEY);
export const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

interface Quote { c: number; d: number | null; dp: number | null; h: number; l: number; o: number; pc: number; t: number }
interface Metric { metric?: Record<string, number | null> }

export interface LiveQuote { provider: string; symbol: string; price: number; change?: number; changePct?: number; high?: number; low?: number; open?: number; prevClose?: number; week52High?: number; week52Low?: number; marketCap?: number; asOf: string; url: string }

/** US stock/ETF quote from Finnhub (real-time on the free tier for US exchanges). */
export async function finnhubQuote(rawSymbol: string): Promise<LiveQuote> {
  const symbol = rawSymbol.trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) throw new ToolError("invalid symbol");
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new ToolError("FINNHUB_API_KEY not set");
  const base = "https://finnhub.io/api/v1";
  const [q, m] = await Promise.all([
    getJson(`${base}/quote?symbol=${encodeURIComponent(symbol)}`, { headers: { "X-Finnhub-Token": key } }) as Promise<Quote>,
    (getJson(`${base}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`, { headers: { "X-Finnhub-Token": key } }) as Promise<Metric>).catch(() => ({}) as Metric),
  ]);
  if (!q || !q.t || !q.c) throw new ToolError("unknown symbol or no data");
  const mm = m.metric ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    provider: "Finnhub", symbol, price: q.c, change: num(q.d), changePct: num(q.dp), high: num(q.h), low: num(q.l), open: num(q.o), prevClose: num(q.pc),
    week52High: num(mm["52WeekHigh"]), week52Low: num(mm["52WeekLow"]),
    marketCap: num(mm["marketCapitalization"]) !== undefined ? (mm["marketCapitalization"] as number) * 1e6 : undefined,
    asOf: new Date(q.t * 1000).toISOString(), url: "https://finnhub.io",
  };
}

export function quoteText(q: LiveQuote): string {
  const parts = [`${q.provider} market data for ${q.symbol} at ${q.asOf.replace("T", " ").slice(0, 16)} UTC: price ${fmtUsd(q.price)}`];
  if (q.change !== undefined && q.changePct !== undefined && q.prevClose !== undefined) parts.push(`change ${q.change >= 0 ? "+" : "-"}${fmtUsd(Math.abs(q.change))} (${fmtPct(q.changePct)}) from previous close ${fmtUsd(q.prevClose)}`);
  if (q.low !== undefined && q.high !== undefined) parts.push(`day range ${fmtUsd(q.low)} to ${fmtUsd(q.high)}`);
  if (q.week52Low !== undefined && q.week52High !== undefined) parts.push(`52-week range ${fmtUsd(q.week52Low)} to ${fmtUsd(q.week52High)}`);
  if (q.marketCap !== undefined) parts.push(`market cap about ${fmtBig(q.marketCap)}`);
  return parts.join("; ") + ".";
}

export async function stockQuoteTool(args: { symbol: string }): Promise<ToolHit[]> {
  const q = await finnhubQuote(args.symbol);
  return [{ live: true, url: q.url, title: `Live quote: ${q.symbol} (Finnhub)`, snippet: quoteText(q) }];
}
