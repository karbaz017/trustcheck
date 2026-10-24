import { ToolError, type ToolHit } from "./types.js";

/** No key needed: uses FRED's public CSV download (the "Download CSV" link on every series page). */
export const fredAvailable = () => true;
export const FRED_SERIES: Record<string, { title: string; units: string; yoy?: boolean }> = {
  DFEDTARU: { title: "Federal funds target range, upper limit", units: "percent" },
  DFEDTARL: { title: "Federal funds target range, lower limit", units: "percent" },
  FEDFUNDS: { title: "Effective federal funds rate (monthly)", units: "percent" },
  CPIAUCSL: { title: "Consumer Price Index for All Urban Consumers", units: "index", yoy: true },
  UNRATE: { title: "Unemployment rate", units: "percent" },
  DGS10: { title: "10-year Treasury yield", units: "percent" },
  MORTGAGE30US: { title: "30-year fixed mortgage rate average", units: "percent" },
};

/** Parses FRED's CSV ("observation_date,SERIES" then "YYYY-MM-DD,value"), newest first, skipping missing values. */
export function parseFredCsv(csv: string): { date: string; value: string }[] {
  return csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(","))
    .filter((r) => r.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && r[1] !== "." && r[1] !== "" && Number.isFinite(Number(r[1])))
    .map(([date, value]) => ({ date, value }))
    .reverse();
}

/** Official US economic data from the St. Louis Fed (FRED). */
export async function economicSeriesTool(args: { series_id: string }): Promise<ToolHit[]> {
  const meta = FRED_SERIES[args.series_id];
  if (!meta) throw new ToolError("unsupported series");
  const since = `${new Date().getUTCFullYear() - 2}-01-01`;
  const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${args.series_id}&cosd=${since}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new ToolError(`HTTP ${res.status}`);
  const obs = parseFredCsv((await res.text()).slice(0, 2_000_000));
  if (!obs.length) throw new ToolError("no data");
  const latest = obs[0];
  let text = `FRED (Federal Reserve Bank of St. Louis), series ${args.series_id} (${meta.title}): ${latest.value}${meta.units === "percent" ? "%" : ""} for ${latest.date} (latest).`;
  if (meta.yoy) {
    const yearAgo = obs.find((o) => o.date.slice(0, 7) === `${Number(latest.date.slice(0, 4)) - 1}${latest.date.slice(4, 7)}`);
    if (yearAgo) text += ` That is ${(((Number(latest.value) / Number(yearAgo.value)) - 1) * 100).toFixed(1)}% higher than ${yearAgo.date} (year-over-year change, computed from the index).`;
  }
  return [{ live: true, url: `https://fred.stlouisfed.org/series/${args.series_id}`, title: `Official data: ${meta.title} (FRED)`, snippet: text }];
}
