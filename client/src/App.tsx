import { useEffect, useRef, useState } from "react";
import type { CheckResult } from "../../server/src/types";
import { getCheck, getFeatures, startCheck, streamProgress, type Features } from "./api";
import EmailCheck from "./EmailCheck";
import Market from "./Market";
import News from "./News";
import { fetchNews, loadSeen, loadWatchlist, POLL_MS, saveSeen, saveWatchlist, type NewsItem } from "./newsStore";
import ScamSOS from "./ScamSOS";
import AuthControls from "./Auth";
import History from "./History";
import Progress, { applyEvent, type StageState } from "./Progress";
import Results from "./Results";
import ThemeToggle from "./Theme";

const MAX = 8000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function useHash() {
  const [h, setH] = useState(window.location.hash || "#/");
  useEffect(() => {
    const f = () => setH(window.location.hash || "#/");
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return h;
}

export default function App({ authEnabled }: { authEnabled: boolean }) {
  const hash = useHash();
  const [mode, setMode] = useState<"text" | "url">("text");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<StageState>({});
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const [features, setFeatures] = useState<Features>({ calculators: false, emailCheck: false, scamsos: false, market: false, news: false });
  useEffect(() => {
    // Retry with backoff: if the first request fails (server restarting, flaky network) the add-ons would otherwise stay hidden.
    let cancelled = false;
    let delay = 1000;
    const load = async () => {
      const f = await getFeatures();
      if (cancelled) return;
      if (f) return setFeatures(f);
      if (delay <= 30_000) setTimeout(load, (delay *= 2));
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  // ---- News alerts: poll while the app is open, on any page ----
  const [watchlist, setWatchlistState] = useState<string[]>(loadWatchlist);
  const [news, setNews] = useState<{ items: NewsItem[]; fetchedAt: string | null; filingsEnabled: boolean }>({ items: [], fetchedAt: null, filingsEnabled: false });
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsErr, setNewsErr] = useState("");
  const firstPoll = useRef(true);
  const setWatchlist = (w: string[]) => { setWatchlistState(w); saveWatchlist(w); firstPoll.current = true; };
  async function pollNews() {
    if (!watchlist.length) return setNews((n) => ({ ...n, items: [] }));
    setNewsLoading(true);
    try {
      const r = await fetchNews(watchlist);
      const seen = loadSeen();
      const fresh = r.items.filter((i) => !seen.has(i.id));
      setNews({ items: r.items, fetchedAt: r.fetchedAt, filingsEnabled: r.filingsEnabled });
      setNewIds(new Set(fresh.map((i) => i.id)));
      setNewsErr("");
      // Notify only about items that arrive after the first load, and never for more than 3 at once.
      if (!firstPoll.current && fresh.length && typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const i of fresh.slice(0, 3)) {
          const note = new Notification(`TrustCheck · ${i.topic}`, { body: `${i.source}: ${i.title}`, tag: i.id });
          note.onclick = () => { window.focus(); window.location.hash = "#/news"; };
        }
      }
      if (firstPoll.current) { fresh.forEach((i) => seen.add(i.id)); saveSeen(seen); }
      firstPoll.current = false;
    } catch (e) {
      setNewsErr((e as Error).message);
    } finally {
      setNewsLoading(false);
    }
  }
  useEffect(() => {
    if (!features.news) return;
    void pollNews();
    const t = setInterval(() => { if (document.visibilityState === "visible") void pollNews(); }, POLL_MS);
    return () => clearInterval(t);
  }, [features.news, watchlist.join("|")]);
  // Opening the News page marks everything as seen.
  useEffect(() => {
    if (hash !== "#/news" || !newIds.size) return;
    const seen = loadSeen();
    news.items.forEach((i) => seen.add(i.id));
    saveSeen(seen);
    const t = setTimeout(() => setNewIds(new Set()), 8000);
    return () => clearTimeout(t);
  }, [hash, newIds.size]);
  const unread = hash === "#/news" ? 0 : newIds.size;

  async function waitForResult(id: string) {
    for (let i = 0; i < 60; i++) {
      const s = await getCheck(id);
      if (s.status === "done") return setResult(s.result);
      if (s.status === "failed") throw new Error(s.error);
      await sleep(1000);
    }
    throw new Error("This is taking longer than expected. Please try again.");
  }

  async function run(textOverride?: string) {
    setError(""); setResult(null); setStages({}); setBusy(true);
    abort.current?.abort();
    const ac = (abort.current = new AbortController());
    try {
      const id = await startCheck(textOverride !== undefined ? { text: textOverride } : mode === "url" ? { url: input.trim() } : { text: input.trim() });
      await streamProgress(id, (e) => {
        if (e.stage === "error") setError(e.message ?? "Something went wrong.");
        else setStages((s) => applyEvent(s, e));
      }, ac.signal).catch(() => {});
      await waitForResult(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Deep link to a saved check from history.
  const m = hash.match(/^#\/check\/([0-9a-f-]{36})$/i);
  useEffect(() => {
    if (!m) return;
    setError(""); setResult(null);
    getCheck(m[1]).then((s) => (s.status === "done" ? setResult(s.result) : setError(s.status === "failed" ? s.error : "Still running. Refresh in a moment."))).catch((e) => setError(e.message));
  }, [m?.[1]]);

  const onHistory = hash === "#/history";
  const tooLong = mode === "text" && input.length > MAX;
  const canSubmit = !busy && input.trim().length > 0 && !tooLong;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <a href="#/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" className="text-blue-800" /><path d="M8.5 12l2.5 2.5 4.5-5" className="text-emerald-600" /></svg>
            TrustCheck
          </a>
          <nav aria-label="Main" className="flex items-center gap-3 text-sm font-medium">
            {features.news && (
              <a href="#/news" className={`rounded-md px-2 py-1 hover:bg-slate-100 ${hash === "#/news" ? "underline" : ""}`}>
                News{unread > 0 && <span className="ml-1 rounded-full bg-orange-600 px-1.5 py-0.5 text-xs font-bold text-[#fff]" aria-label={`${unread} new`}>{unread}</span>}
              </a>
            )}
            {features.market && <a href="#/market" className={`rounded-md px-2 py-1 hover:bg-slate-100 ${hash === "#/market" ? "underline" : ""}`}>Markets</a>}
            {features.scamsos && <a href="#/scamsos" className={`rounded-md px-2 py-1 hover:bg-slate-100 ${hash === "#/scamsos" ? "underline" : ""}`}>ScamSOS</a>}
            {features.emailCheck && <a href="#/email" className={`rounded-md px-2 py-1 hover:bg-slate-100 ${hash === "#/email" ? "underline" : ""}`}>Email check</a>}
            {authEnabled && <AuthControls />}
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-6 pb-24">
        {hash === "#/news" && features.news ? (
          <News items={news.items} newIds={newIds} watchlist={watchlist} setWatchlist={setWatchlist} fetchedAt={news.fetchedAt} loading={newsLoading}
            error={newsErr} filingsEnabled={news.filingsEnabled} onRefresh={() => void pollNews()}
            onCheck={(t) => { setMode("text"); setInput(t); window.location.hash = "#/"; void run(t); }} />
        ) : hash === "#/market" && features.market ? (
          <Market />
        ) : hash === "#/scamsos" && features.scamsos ? (
          <ScamSOS />
        ) : hash === "#/email" && features.emailCheck ? (
          <EmailCheck />
        ) : onHistory ? (
          <>
            <h1 className="text-2xl font-bold">Your past checks</h1>
            <History />
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-gradient-to-br from-[#1e3a8a] via-[#1e40af] to-[#5b21b6] p-6 text-[#fff] sm:p-8">
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Does this claim hold up?</h1>
              <p className="mt-2 max-w-xl text-[#dbeafe]">Paste money content you saw online. We split it into claims, check each against sources, run the math, and show the evidence trail.</p>
              <ul className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                {["1 · Split into claims", "2 · Check sources by tier", "3 · Math done by code", "No advice, just evidence"].map((t) => <li key={t} className="rounded-full bg-[#ffffff26] px-3 py-1">{t}</li>)}
              </ul>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) void run(); }} className="space-y-3 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
              <div role="tablist" aria-label="Input type" className="inline-flex rounded-lg border border-slate-400 p-0.5 text-sm">
                {(["text", "url"] as const).map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setInput(""); }}
                    className={`rounded-md px-3 py-1.5 ${mode === k ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}>
                    {k === "text" ? "Paste text" : "Article link"}
                  </button>
                ))}
              </div>
              <label htmlFor="in" className="sr-only">{mode === "text" ? "Text to check" : "Article link to check"}</label>
              {mode === "text" ? (
                <textarea id="in" value={input} onChange={(e) => setInput(e.target.value)} rows={7} aria-describedby="hint"
                  placeholder="Paste a post, a video transcript, or an article excerpt…"
                  className="w-full rounded-lg border border-slate-400 p-3 text-base" />
              ) : (
                <input id="in" type="url" value={input} onChange={(e) => setInput(e.target.value)} aria-describedby="hint"
                  placeholder="https://example.com/article" className="w-full rounded-lg border border-slate-400 p-3 text-base" />
              )}
              <p id="hint" className="text-xs text-slate-600">
                {mode === "text"
                  ? <>What we can read: any text you paste (up to {MAX.toLocaleString("en-US")} characters). <span className={tooLong ? "font-semibold text-rose-800" : ""}>{input.length.toLocaleString("en-US")} / {MAX.toLocaleString("en-US")}</span></>
                  : <>What we can read: public news and article pages. We can't read social media or video sites (X, TikTok, YouTube, Instagram, Reddit…). Paste the text or a transcript for those.</>}
              </p>
              {tooLong && <p role="alert" className="text-sm font-medium text-rose-800">That's too long. Please trim it to {MAX.toLocaleString("en-US")} characters.</p>}
              <button type="submit" disabled={!canSubmit} className="w-full rounded-lg bg-[#1e40af] px-4 py-3 font-semibold text-[#fff] disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto">
                {busy ? "Checking…" : "Check this"}
              </button>
            </form>

            {busy && (
              <div className="rounded-2xl border border-slate-300 bg-white p-4 sm:p-5"><Progress state={stages} finished={false} /></div>
            )}
            {error && <p role="alert" className="rounded-lg border border-rose-700 bg-rose-50 p-3 text-rose-900">{error}</p>}
            {result && !busy && <Results r={result} scamsos={features.scamsos} market={features.market} />}
          </>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-slate-300 bg-white/95 px-4 py-2 text-center text-sm font-medium backdrop-blur">
        Evidence check only. Not financial advice.
      </footer>
    </div>
  );
}
