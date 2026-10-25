import { useEffect, useRef, useState } from "react";
import type { ActivityItem, Turn } from "./chat";
import { EmailSignalsView } from "./EmailCheck";
import { IActivity, IAlert, ICheck, IExternal, IFile, ISearch, IWrench, IX } from "./icons";
import { MarketBriefView } from "./Market";
import { NewsList } from "./News";
import Results from "./Results";
import { ScamPlanView } from "./ScamSOS";

/** Plain-English names for each step. */
export const STAGE_LABEL: Record<string, string> = {
  fetch: "Reading the page", extract: "Finding the claims", math: "Doing the math", search: "Looking it up", tier: "Rating the sources",
  stance: "Comparing", verdict: "Verdict", hype: "Pressure words", aggregate: "Overall result", explain: "Summary",
  done: "Done", error: "Problem", research: "Researching", structure: "Building the briefing", outlook: "Which way it leans",
  email: "Reading the email", scamsos: "Your plan", news: "News", load: "Opening saved check",
};

const TOOL_FRIENDLY: Record<string, (a: Record<string, unknown>) => string> = {
  get_crypto_price: (a) => `Checked the live price of ${a.coin}`,
  get_stock_quote: (a) => `Checked the live stock price of ${a.symbol}`,
  search_sec_filings: (a) => `Searched official company filings (SEC) for “${a.phrase}”`,
  get_economic_series: () => "Checked official Federal Reserve data",
};

/** Hide a "start" once the same step has finished; keep everything else, in order. */
export function visibleActivity(items: ActivityItem[]): ActivityItem[] {
  return items.filter((e, i) => e.status !== "start" || !items.slice(i + 1).some((x) => x.stage === e.stage && (x.status === "done" || x.status === "error")));
}

function Dot({ e, live }: { e: ActivityItem; live: boolean }) {
  const cls = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full";
  if (e.status === "start") return live
    ? <span className={`${cls} bg-blue-50`}><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" /></span>
    : <span className={`${cls} bg-slate-100`} />;
  if (e.status === "error") return <span className={`${cls} bg-rose-100 text-rose-700`}><IAlert className="h-3.5 w-3.5" /></span>;
  if (e.status === "info") return <span className={`${cls} ${e.tool ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>{e.tool ? <IWrench className="h-3.5 w-3.5" /> : <ISearch className="h-3.5 w-3.5" />}</span>;
  return <span className={`${cls} bg-emerald-100 text-emerald-700`}><ICheck className="h-3.5 w-3.5" /></span>;
}

function Lines({ lines }: { lines: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? lines : lines.slice(0, 4);
  return (
    <div className="mt-1.5">
      <ul className="space-y-1 text-[13px] leading-snug text-slate-700">
        {shown.map((l, j) => <li key={j} className="break-words rounded-md bg-slate-100/70 px-2 py-1">{l}</li>)}
      </ul>
      {lines.length > 4 && <button type="button" onClick={() => setAll((x) => !x)} className="mt-1 text-xs font-medium text-blue-800 hover:underline">{all ? "Show less" : `Show ${lines.length - 4} more`}</button>}
    </div>
  );
}

function ToolCard({ e }: { e: ActivityItem }) {
  const t = e.tool!;
  const friendly = TOOL_FRIENDLY[t.name]?.(t.args) ?? `Used ${t.name}`;
  return (
    <div className={`mt-1.5 rounded-xl border p-2.5 text-[13px] ${t.ok ? "border-violet-200 bg-violet-50" : "border-rose-200 bg-rose-50"}`}>
      <p className="font-medium text-slate-900">{friendly}</p>
      <p className="mt-0.5 break-words text-slate-700">{t.ok ? t.summary : "Couldn't get this data right now."}</p>
      <details className="mt-1 text-xs text-slate-600">
        <summary className="cursor-pointer select-none">Details</summary>
        <p className="mt-1 break-all font-mono">{t.name}({JSON.stringify(t.args)}) · {(t.ms / 1000).toFixed(1)}s{t.ok ? "" : ` · ${t.summary}`}</p>
      </details>
    </div>
  );
}

function ActivityList({ turn }: { turn: Turn }) {
  const items = visibleActivity(turn.activity);
  if (!items.length) return <p className="text-sm text-slate-600">{turn.status === "awaiting" ? "Waiting for your answers in the chat." : "Starting…"}</p>;
  const t0 = turn.createdAt;
  return (
    <ol className="space-y-4" aria-live="polite">
      {items.map((e, i) => (
        <li key={i} className="tc-fade relative flex gap-3">
          {i < items.length - 1 && <span aria-hidden className="absolute left-3 top-7 h-[calc(100%-4px)] w-px bg-slate-200" />}
          <Dot e={e} live={turn.status === "running"} />
          <div className="min-w-0 flex-1 pb-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13px] font-semibold text-slate-900">{STAGE_LABEL[e.stage] ?? e.stage}</p>
              <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{((e.at - t0) / 1000).toFixed(1)}s</span>
            </div>
            <p className={`text-[13px] leading-snug ${e.status === "error" ? "font-medium text-rose-800" : "text-slate-700"}`}>{e.tool ? "" : e.message ?? (e.status === "start" ? "Working on it…" : "Done")}</p>
            {e.tool && <ToolCard e={e} />}
            {e.lines && e.lines.length > 0 && <Lines lines={e.lines} />}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Artifact({ turn, onCheck, onScamSOS, onMarketContext }: { turn: Turn; onCheck: (t: string) => void; onScamSOS?: () => void; onMarketContext?: (t: string) => void }) {
  const r = turn.result;
  if (turn.status === "error") return <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{turn.error}</p>;
  if (!r) return <p className="text-sm text-slate-600">{turn.status === "running" ? "The full report will appear here when it's ready. Meanwhile you can follow each step in “How we checked”." : turn.status === "awaiting" ? "Answer the questions in the chat to get your plan." : "This report is no longer stored in this browser."}</p>;
  switch (r.kind) {
    case "check": return <Results r={r.check} onScamSOS={onScamSOS} onMarketContext={onMarketContext} />;
    case "market": return <MarketBriefView brief={r.brief} />;
    case "scamsos": return <ScamPlanView res={r.plan} />;
    case "email": return (
      <div className="space-y-6">
        <EmailSignalsView res={r.email} />
        {r.check ? <div><h3 className="mb-2 text-lg font-bold">Claims in the email</h3><Results r={r.check} /></div> : r.email.checkId ? <p className="text-sm text-slate-600">Checking the claims in the email…</p> : <p className="text-sm text-slate-600">There wasn't enough text in this email to check for claims.</p>}
      </div>
    );
    case "news": return <NewsList items={r.items} onCheck={onCheck} />;
  }
}

export type PanelTab = "activity" | "result";
interface PanelProps {
  turn: Turn | null;
  tab: PanelTab;
  setTab: (t: PanelTab) => void;
  wide: boolean;
  setWide?: (w: boolean) => void;
  onClose: () => void;
  onCheck: (t: string) => void;
  onScamSOS?: () => void;
  onMarketContext?: (t: string) => void;
}

/** Right-hand panel: each step and tool call, and the full report for the selected message. */
export default function ActivityPanel(p: PanelProps) {
  const box = useRef<HTMLDivElement>(null);
  const follow = useRef(true); // stick to the newest step until the reader scrolls up
  const [behind, setBehind] = useState(false);
  const count = p.turn?.activity.length ?? 0;
  const live = p.tab === "activity" && p.turn?.status === "running";

  const content = useRef<HTMLDivElement>(null);

  const toBottom = () => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight; // instant: a smooth scroll fires scroll events that look like the reader scrolling up
    follow.current = true;
    setBehind(false);
  };
  // New message or tab: start following again (activity), or start at the top (report).
  useEffect(() => {
    follow.current = true;
    setBehind(false);
    if (p.tab === "activity") toBottom();
    else if (box.current) box.current.scrollTop = 0;
  }, [p.turn?.id, p.tab]);
  // Follow any growth of the content (new steps, steps fading in, "show more"), as long as the reader is at the bottom.
  useEffect(() => {
    const el = box.current;
    const inner = content.current;
    if (!el || !inner || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (p.tab === "activity" && follow.current) el.scrollTop = el.scrollHeight; });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [p.tab, p.turn?.id]);
  // If the reader has scrolled up, don't yank them down; offer a button instead.
  useEffect(() => {
    if (p.tab === "activity" && !follow.current && count > 0) setBehind(true);
  }, [count]);
  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    follow.current = atBottom;
    if (atBottom) setBehind(false);
  };

  return (
    <aside aria-label="How we checked and full report" className="flex h-full w-full flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <div role="tablist" aria-label="Panel" className="inline-flex rounded-xl bg-slate-100 p-1">
          {(["activity", "result"] as const).map((t) => (
            <button key={t} role="tab" type="button" aria-selected={p.tab === t} onClick={() => p.setTab(t)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${p.tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              {t === "activity" ? <IActivity className="h-4 w-4" /> : <IFile className="h-4 w-4" />}
              {t === "activity" ? "How we checked" : "Full report"}
            </button>
          ))}
        </div>
        {p.turn?.status === "running" && <span className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-700" aria-hidden />Live</span>}
        <div className="ml-auto flex items-center">
          {p.setWide && (
            <button type="button" onClick={() => p.setWide!(!p.wide)} aria-label={p.wide ? "Make panel narrower" : "Make panel wider"} title={p.wide ? "Narrower" : "Wider"} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
              <IExternal className={`h-4 w-4 transition ${p.wide ? "rotate-180" : ""}`} />
            </button>
          )}
          <button type="button" onClick={p.onClose} aria-label="Hide panel" title="Hide panel" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><IX className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
      <div ref={box} onScroll={onScroll} className="tc-scroll @container h-full overflow-y-auto p-4">
        <div ref={content}>
        {!p.turn ? (
          <div className="mx-auto mt-10 max-w-xs text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><IActivity className="h-6 w-6" /></span>
            <p className="mt-3 font-semibold text-slate-900">See how we check things</p>
            <p className="mt-1 text-sm text-slate-600">When you send something, each step appears here as it happens: reading the page, finding claims, looking things up, checking live prices, rating sources and the final verdict. The full report opens in the next tab.</p>
          </div>
        ) : (
          <>
            <p className="mb-4 truncate rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600" title={p.turn.prompt}>{p.turn.prompt}</p>
            {p.tab === "activity" ? <ActivityList turn={p.turn} /> : <Artifact turn={p.turn} onCheck={p.onCheck} onScamSOS={p.onScamSOS} onMarketContext={p.onMarketContext} />}
          </>
        )}
        </div>
      </div>
      {behind && p.tab === "activity" && (
        <button type="button" onClick={() => toBottom()} className="tc-fade absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-lg hover:bg-slate-50">
          {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-700" aria-hidden />}
          Jump to latest step ↓
        </button>
      )}
      </div>
    </aside>
  );
}
