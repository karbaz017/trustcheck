import { fmtBig, fmtPct, fmtUsd, getJson, ToolError, type ToolHit } from "./types.js";
import type { LiveQuote } from "./finnhub.js";

const BASE = "https://api.coingecko.com/api/v3";
const ID_RE = /^[a-z0-9-]{2,60}$/;

interface Market {
  id: string; symbol: string; name: string; current_price: number; market_cap: number; high_24h: number; low_24h: number; ath: number; ath_date: string; last_updated: string;
  price_change_percentage_24h_in_currency?: number; price_change_percentage_7d_in_currency?: number; price_change_percentage_30d_in_currency?: number;
}

/** Accepts a CoinGecko id ("bitcoin") or a symbol/name ("BTC", "Bitcoin") and resolves it. */
async function resolveId(q: string): Promise<string> {
  const s = q.trim().toLowerCase();
  if (ID_RE.test(s)) {
    const direct = (await getJson(`${BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(s)}`)) as Market[];
    if (direct.length) return s;
  }
  const found = (await getJson(`${BASE}/search?query=${encodeURIComponent(q.trim().slice(0, 40))}`)) as { coins?: { id: string; symbol: string; market_cap_rank: number | null }[] };
  const coins = (found.coins ?? []).filter((c) => ID_RE.test(c.id));
  const exact = coins.filter((c) => c.symbol.toLowerCase() === s).sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9))[0];
  const pick = exact ?? coins[0];
  if (!pick) throw new ToolError("unknown coin");
  return pick.id;
}

export async function coingeckoQuote(coin: string): Promise<LiveQuote & { name: string; change7dPct?: number; change30dPct?: number; ath?: number; athDate?: string }> {
  if (!coin || coin.length > 60) throw new ToolError("invalid coin");
  const id = await resolveId(coin);
  const rows = (await getJson(`${BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(id)}&price_change_percentage=24h,7d,30d`)) as Market[];
  const m = rows[0];
  if (!m) throw new ToolError("no data");
  return {
    provider: "CoinGecko", symbol: m.symbol.toUpperCase(), name: m.name, price: m.current_price,
    changePct: m.price_change_percentage_24h_in_currency, change7dPct: m.price_change_percentage_7d_in_currency, change30dPct: m.price_change_percentage_30d_in_currency,
    high: m.high_24h, low: m.low_24h, marketCap: m.market_cap, ath: m.ath, athDate: m.ath_date, asOf: m.last_updated, url: `https://www.coingecko.com/en/coins/${id}`,
  };
}

export async function cryptoPriceTool(args: { coin: string }): Promise<ToolHit[]> {
  const q = await coingeckoQuote(args.coin);
  const ch = [q.changePct, q.change7dPct, q.change30dPct];
  const text = [
    `CoinGecko market data for ${q.name} (${q.symbol}) at ${q.asOf.replace("T", " ").slice(0, 16)} UTC: price ${fmtUsd(q.price)}`,
    ch[0] !== undefined ? `24-hour change ${fmtPct(ch[0])}` : "",
    ch[1] !== undefined ? `7-day change ${fmtPct(ch[1])}` : "",
    ch[2] !== undefined ? `30-day change ${fmtPct(ch[2])}` : "",
    q.low !== undefined && q.high !== undefined ? `24-hour range ${fmtUsd(q.low)} to ${fmtUsd(q.high)}` : "",
    q.marketCap ? `market cap about ${fmtBig(q.marketCap)}` : "",
    q.ath && q.athDate ? `all-time high ${fmtUsd(q.ath)} on ${q.athDate.slice(0, 10)}` : "",
  ].filter(Boolean).join("; ") + ".";
  return [{ live: true, url: q.url, title: `Live price: ${q.name} (CoinGecko)`, snippet: text }];
}
