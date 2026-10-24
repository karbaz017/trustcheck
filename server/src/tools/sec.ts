import { htmlToText } from "../pipeline/fetchUrl.js";
import { getJson, ToolError, type ToolHit } from "./types.js";

/** The SEC asks automated clients to identify themselves ("Name contact@example.com"). The tool is off until this is set. */
export const secAvailable = () => Boolean(process.env.SEC_USER_AGENT?.trim());
const ua = () => ({ "User-Agent": process.env.SEC_USER_AGENT!.trim(), Accept: "application/json,text/html" });

interface EftsHit { _id: string; _source: { ciks?: string[]; display_names?: string[]; file_date?: string; form?: string; root_forms?: string[] } }
const FORMS = new Set(["8-K", "10-K", "10-Q", "20-F", "6-K", "S-1", "S-4", "DEFM14A", "SC 13D", "SC TO-T"]);

function filingUrl(h: EftsHit): string | null {
  const [adsh, file] = h._id.split(":");
  const cik = h._source.ciks?.[0];
  if (!adsh || !file || !cik || !/^\d{10}-\d{2}-\d{6}$/.test(adsh) || !/^\d{1,10}$/.test(cik) || !/^[\w.\-]{1,120}$/.test(file)) return null;
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${adsh.replace(/-/g, "")}/${file}`;
}

export function excerpt(text: string, phrase: string, radius = 350): string | null {
  const i = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (i < 0) return null;
  const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, i - radius)));
  const end = Math.min(text.length, text.indexOf(" ", i + phrase.length + radius) === -1 ? text.length : text.indexOf(" ", i + phrase.length + radius));
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

/** Full-text search of SEC filings, then a short excerpt from the matching document around the phrase. */
export async function secFilingsTool(args: { phrase: string; company?: string; forms?: string[]; start_date?: string; end_date?: string }): Promise<ToolHit[]> {
  if (!secAvailable()) throw new ToolError("SEC_USER_AGENT not set");
  const phrase = args.phrase.replace(/["<>]/g, "").trim().slice(0, 80);
  if (phrase.length < 3) throw new ToolError("phrase too short");
  const company = args.company?.replace(/["<>]/g, "").trim().slice(0, 60);
  const forms = (args.forms ?? ["8-K", "10-K", "10-Q"]).filter((f) => FORMS.has(f));
  const date = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
  const start = date(args.start_date) ?? `${new Date().getUTCFullYear() - 1}-01-01`;
  const end = date(args.end_date) ?? new Date().toISOString().slice(0, 10);
  const q = `"${phrase}"${company ? ` "${company}"` : ""}`;
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(q)}&forms=${encodeURIComponent(forms.join(","))}&dateRange=custom&startdt=${start}&enddt=${end}`;
  const body = (await getJson(url, { headers: ua() })) as { hits?: { hits?: EftsHit[] } };
  const hits = (body.hits?.hits ?? []).slice(0, 2);
  const out: ToolHit[] = [];
  for (const h of hits) {
    const doc = filingUrl(h);
    if (!doc) continue;
    const name = h._source.display_names?.[0]?.replace(/\s+/g, " ") ?? "A company";
    const form = h._source.form ?? h._source.root_forms?.[0] ?? "filing";
    let ex: string | null = null;
    try {
      const res = await fetch(doc, { headers: ua(), signal: AbortSignal.timeout(8000) });
      if (res.ok && Number(res.headers.get("content-length") ?? 0) < 5_000_000) ex = excerpt(htmlToText((await res.text()).slice(0, 5_000_000)), phrase);
    } catch { /* keep the filing reference without an excerpt */ }
    out.push({
      live: true, url: doc,
      title: `SEC filing: ${name}, Form ${form}, filed ${h._source.file_date ?? "?"}`,
      snippet: `SEC EDGAR: ${name} filed Form ${form} on ${h._source.file_date ?? "an unknown date"}${ex ? `. Excerpt: ${ex}` : `, and the filing text mentions "${phrase}".`}`,
    });
  }
  return out;
}
