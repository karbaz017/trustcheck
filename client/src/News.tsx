import { useState } from "react";
import type { NewsItem } from "./newsStore";
import { TIER } from "./labels";

const SUGGESTIONS = ["NVDA", "AAPL", "Bitcoin", "Federal Reserve", "S&P 500"];
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export interface NewsProps {
  items: NewsItem[];
  newIds: Set<string>;
  watchlist: string[];
  setWatchlist: (w: string[]) => void;
  fetchedAt: string | null;
  loading: boolean;
  error: string;
  filingsEnabled: boolean;
  onRefresh: () => void;
  onCheck: (text: string) => void;
}

export default function News(p: NewsProps) {
  const [draft, setDraft] = useState("");
  const [perm, setPerm] = useState<string>(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const add = (t: string) => {
    const v = t.trim().replace(/\s+/g, " ").slice(0, 60);
    if (v.length < 2 || p.watchlist.some((w) => w.toLowerCase() === v.toLowerCase()) || p.watchlist.length >= 10) return;
    p.setWatchlist([...p.watchlist, v]);
    setDraft("");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#7c2d12] to-[#9a3412] p-6 text-[#fff] sm:p-8">
        <h1 className="text-3xl font-extrabold tracking-tight">News alerts</h1>
        <p className="mt-2 max-w-2xl text-[#ffedd5]">Follow tickers and topics. We check every few minutes while Verifin is open and show only headlines from reliable outlets and official SEC filings. Any headline can be checked with one click.</p>
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-extrabold">Your watchlist</h2>
        <form onSubmit={(e) => { e.preventDefault(); add(draft); }} className="flex gap-2">
          <label htmlFor="wl" className="sr-only">Add a ticker or topic</label>
          <input id="wl" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} placeholder="Add a ticker or topic, e.g. NVDA or Federal Reserve"
            className="flex-1 rounded-lg border border-slate-400 p-2.5 text-base" />
          <button type="submit" disabled={draft.trim().length < 2 || p.watchlist.length >= 10} className="rounded-lg bg-[#1e40af] px-4 font-semibold text-[#fff] disabled:bg-slate-400">Add</button>
        </form>
        {p.watchlist.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Watchlist">
            {p.watchlist.map((w) => (
              <li key={w} className="inline-flex items-center gap-1 rounded-full border border-slate-400 bg-slate-50 py-1 pl-3 pr-1 text-sm font-semibold">
                {w}
                <button type="button" onClick={() => p.setWatchlist(p.watchlist.filter((x) => x !== w))} aria-label={`Remove ${w}`} className="rounded-full px-2 hover:bg-slate-200">✕</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">Try: {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => add(s)} className="mr-2 rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-semibold hover:bg-slate-100">+ {s}</button>)}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>Checks every 3 minutes while Verifin is open{p.fetchedAt && <> · last checked {new Date(p.fetchedAt).toLocaleTimeString()}</>}</span>
          <button type="button" onClick={p.onRefresh} disabled={p.loading || !p.watchlist.length} className="rounded border border-slate-400 px-2 py-0.5 font-semibold hover:bg-slate-100 disabled:opacity-50">{p.loading ? "Checking…" : "Check now"}</button>
          {perm === "default" && (
            <button type="button" onClick={async () => setPerm(await Notification.requestPermission())} className="rounded border border-slate-400 px-2 py-0.5 font-semibold hover:bg-slate-100">🔔 Turn on browser alerts</button>
          )}
          {perm === "granted" && <span>🔔 Browser alerts on</span>}
          {perm === "denied" && <span>Browser alerts are blocked in your browser settings.</span>}
        </div>
        {!p.filingsEnabled && <p className="text-xs text-slate-500">Official SEC filings aren't included yet (the server needs SEC_USER_AGENT set).</p>}
      </section>

      {p.error && <p role="alert" className="rounded-lg border border-rose-700 bg-rose-50 p-3 text-rose-900">{p.error}</p>}

      {p.watchlist.length > 0 && (
        <section aria-labelledby="feed-h" className="space-y-3">
          <h2 id="feed-h" className="text-xl font-extrabold">Latest from reliable sources</h2>
          <p className="text-xs text-slate-600">Headlines aren't verified until you check them. Only Tier 1 (official) and Tier 2 (established outlets) sources are shown.</p>
          {!p.items.length && !p.loading && <p className="rounded-lg bg-slate-100 p-3 text-sm">No headlines from reliable sources in the last 24 hours.</p>}
          <ul className="space-y-2">
            {p.items.map((n) => (
              <li key={n.id} className={`rounded-xl border bg-white p-4 ${p.newIds.has(n.id) ? "border-orange-500 ring-1 ring-orange-500" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {p.newIds.has(n.id) && <span className="rounded-full bg-orange-100 px-2 py-0.5 font-bold text-orange-900">NEW</span>}
                  <span className={`rounded-full border px-2 py-0.5 font-semibold ${TIER[n.tier].cls}`}>{n.kind === "filing" ? "Official filing" : TIER[n.tier].short}</span>
                  <span className="font-semibold">{n.source}</span>
                  <span className="text-slate-500">· {ago(n.publishedAt)}</span>
                  <span className="ml-auto rounded-full border border-slate-300 px-2 py-0.5 text-slate-600">{n.topic}</span>
                </div>
                <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1.5 block font-semibold leading-snug text-blue-800 underline decoration-blue-300 underline-offset-2">{n.title} <span aria-hidden>↗</span></a>
                <button type="button" onClick={() => p.onCheck(n.title)} className="mt-2 rounded-lg border border-slate-400 px-3 py-1 text-sm font-semibold hover:bg-slate-100">Check this headline</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
