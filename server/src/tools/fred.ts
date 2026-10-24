import { getJson, ToolError, type ToolHit } from "./types.js";

export const fredAvailable = () => Boolean(process.env.FRED_API_KEY);
export const FRED_SERIES: Record<string, { title: string; units: string; yoy?: boolean }> = {
  DFEDTARU: { title: "Federal funds target range, upper limit", units: "percent" },
  DFEDTARL: { title: "Federal funds target range, lower limit", units: "percent" },
  FEDFUNDS: { title: "Effective federal funds rate (monthly)", units: "percent" },
  CPIAUCSL: { title: "Consumer Price Index for All Urban Consumers", units: "index", yoy: true },
  UNRATE: { title: "Unemployment rate", units: "percent" },
  DGS10: { title: "10-year Treasury yield", units: "percent" },
  MORTGAGE30US: { title: "30-year fixed mortgage rate average", units: "percent" },
};

/** Official US economic data from the St. Louis Fed (FRED). */
export async function economicSeriesTool(args: { series_id: string }): Promise<ToolHit[]> {
  const meta = FRED_SERIES[args.series_id];
  if (!meta) throw new ToolError("unsupported series");
  const key = process.env.FRED_API_KEY;
  if (!key) throw new ToolError("FRED_API_KEY not set");
  const body = (await getJson(`https://api.stlouisfed.org/fred/series/observations?series_id=${args.series_id}&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=desc&limit=14`)) as { observations?: { date: string; value: string }[] };
  const obs = (body.observations ?? []).filter((o) => o.value !== "." && Number.isFinite(Number(o.value)));
  if (!obs.length) throw new ToolError("no data");
  const latest = obs[0];
  let text = `FRED (Federal Reserve Bank of St. Louis), series ${args.series_id} (${meta.title}): ${latest.value}${meta.units === "percent" ? "%" : ""} for ${latest.date} (latest).`;
  if (meta.yoy) {
    const yearAgo = obs.find((o) => o.date.slice(0, 7) === `${Number(latest.date.slice(0, 4)) - 1}${latest.date.slice(4, 7)}`);
    if (yearAgo) text += ` That is ${(((Number(latest.value) / Number(yearAgo.value)) - 1) * 100).toFixed(1)}% higher than ${yearAgo.date} (year-over-year change, computed from the index).`;
  }
  return [{ live: true, url: `https://fred.stlouisfed.org/series/${args.series_id}`, title: `Official data: ${meta.title} (FRED)`, snippet: text }];
}
