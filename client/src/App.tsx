import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProgressEvent } from "../../server/src/types";
import ActivityPanel from "./Activity";
import {
  checkEmail, followCheck, getCheck, getFeatures, getHistory, startCheck, streamMarketBrief,
  type Features, type HistoryItem,
} from "./api";
import { AuthBridge, type AuthState } from "./Auth";
import { MODES, loadChats, newChat, saveChats, titleFrom, uid, type ActivityItem, type Chat, type Mode, type Turn, type TurnResult } from "./chat";
import Composer from "./Composer";
import { fetchNews, loadSeen, loadWatchlist, POLL_MS, saveSeen, saveWatchlist, type NewsItem } from "./newsStore";
import type { ScamPlanResponse } from "./ScamSOS";
import Sidebar, { Logo } from "./Sidebar";
import { IMenu, IPanelRight } from "./icons";
import { LeftRail, ResizeHandle, RightRail } from "./Rails";
import { useTheme } from "./Theme";
import TurnView, { type FollowUp } from "./TurnView";

const URL_RE = /^https?:\/\/\S+$/i;
type Tab = "activity" | "result";

export default function App({ authEnabled }: { authEnabled: boolean }) {
  const [features, setFeatures] = useState<Features>({ calculators: false, emailCheck: false, scamsos: false, market: false, news: false });
  const [theme, setTheme] = useTheme();
  const [auth, setAuth] = useState<AuthState>({ enabled: authEnabled, isAuthenticated: false, login: () => {}, logout: () => {} });
  const [chats, setChats] = useState<Chat[]>(loadChats);
  const [activeId, setActiveId] = useState<string | null>(() => loadChats()[0]?.id ?? null);
  const [mode, setMode] = useState<Mode>("check");
  const [draft, setDraft] = useState("");
  const [sel, setSel] = useState<{ turnId: string | null; tab: Tab }>({ turnId: null, tab: "activity" });
  // Mobile drawers.
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  // Desktop: both side panels can be collapsed; remembered between visits.
  const [sideShown, setSideShown] = useState(() => pref("tc.side", true));
  const [panelShown, setPanelShown] = useState(() => pref("tc.panel", true));
  const [panelW, setPanelW] = useState(() => prefNum("tc.panelW", 440));
  useEffect(() => { savePref("tc.side", sideShown); savePref("tc.panel", panelShown); savePrefNum("tc.panelW", panelW); }, [sideShown, panelShown, panelW]);
  // The report can grow until the conversation would get narrower than ~400px.
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => { const f = () => setVw(window.innerWidth); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const PANEL_MIN = 340;
  const panelMax = Math.max(PANEL_MIN, vw - (sideShown ? 272 : 56) - 400);
  const panelWidth = Math.min(panelMax, Math.max(PANEL_MIN, panelW));
  const isDesktop = () => window.matchMedia("(min-width: 1180px)").matches;
  const showPanel = () => (isDesktop() ? setPanelShown(true) : setRightOpen(true));
  const [saved, setSaved] = useState<HistoryItem[] | null>(null);
  const [watchlist, setWatchlistState] = useState<string[]>(loadWatchlist);
  const [newsUnread, setNewsUnread] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  // Feature flags: retry with backoff so a server restart doesn't hide the add-ons.
  useEffect(() => {
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

  useEffect(() => saveChats(chats), [chats]);
  const active = chats.find((c) => c.id === activeId) ?? null;
  const turns = active?.turns ?? [];
  const selectedTurn = turns.find((t) => t.id === sel.turnId) ?? turns[turns.length - 1] ?? null;
  const busy = turns.some((t) => t.status === "running");
  const modes = useMemo(() => (["check", "market", "scamsos", "email", "news"] as Mode[]).filter((m) =>
    m === "check" || (m === "market" && features.market) || (m === "scamsos" && features.scamsos) || (m === "email" && features.emailCheck) || (m === "news" && features.news)), [features]);

  // New or switched chat: start at the top (welcome) or the latest message.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = turns.length ? el.scrollHeight : 0;
  }, [activeId]);
  // Keep the newest output in view while things stream in.
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // ---- turn helpers ----
  const patchTurn = useCallback((chatId: string, turnId: string, fn: (t: Turn) => Turn) => {
    setChats((cs) => cs.map((c) => (c.id !== chatId ? c : { ...c, updatedAt: Date.now(), turns: c.turns.map((t) => (t.id === turnId ? fn(t) : t)) })));
  }, []);
  const push = useCallback((chatId: string, turnId: string, e: Omit<ActivityItem, "at">) => {
    patchTurn(chatId, turnId, (t) => ({ ...t, activity: [...t.activity, { ...e, at: Date.now() }] }));
  }, [patchTurn]);
  const finish = useCallback((chatId: string, turnId: string, result: TurnResult) => {
    patchTurn(chatId, turnId, (t) => ({ ...t, status: "done", result }));
    setSel((s) => (s.turnId === turnId ? { ...s, tab: "result" } : s));
  }, [patchTurn]);
  const fail = useCallback((chatId: string, turnId: string, error: string) => {
    patchTurn(chatId, turnId, (t) => ({ ...t, status: "error", error }));
  }, [patchTurn]);

  function addTurn(m: Mode, prompt: string, status: Turn["status"] = "running", into?: { chatId: string; context?: Turn["context"] }): { chatId: string; turnId: string } {
    const turnId = uid();
    const turn: Turn = { id: turnId, mode: m, prompt, createdAt: Date.now(), status, activity: [], context: into?.context };
    let chatId = into?.chatId ?? (activeId && chats.some((c) => c.id === activeId) ? activeId : null);
    if (!chatId) {
      const c = newChat();
      chatId = c.id;
      setChats((cs) => [{ ...c, title: titleFrom(prompt), turns: [turn] }, ...cs]);
      setActiveId(chatId);
    } else {
      setChats((cs) => cs.map((c) => (c.id === chatId ? { ...c, title: c.turns.length ? c.title : titleFrom(prompt), updatedAt: Date.now(), turns: [...c.turns, turn] } : c)));
    }
    setSel({ turnId, tab: "activity" });
    return { chatId, turnId };
  }

  const onProgress = (chatId: string, turnId: string) => (e: ProgressEvent) => {
    if (e.stage === "done") return;
    // A link's chat gets the article's real title instead of the web address.
    const title = e.stage === "fetch" && e.status === "done" ? e.lines?.find((l) => l.startsWith("Title: "))?.slice(7).trim() : undefined;
    if (title) {
      const host = (e.message?.match(/from ([\w.-]+)$/) ?? [])[1];
      setChats((cs) => cs.map((c) => (c.id === chatId && c.turns[0]?.id === turnId ? { ...c, title: titleFrom(host ? `${title} · ${host}` : title) } : c)));
    }
    push(chatId, turnId, { stage: e.stage, status: e.status, message: e.message, lines: e.lines, ms: e.ms, tool: e.tool });
  };

  async function follow(chatId: string, turnId: string, checkId: string) {
    const r = await followCheck(checkId, onProgress(chatId, turnId), new AbortController().signal);
    if (auth.isAuthenticated) void getHistory().then(setSaved).catch(() => {});
    return r;
  }

  // ---- actions ----
  async function runCheck(prompt: string) {
    const input = URL_RE.test(prompt) ? { url: prompt } : { text: prompt };
    const { chatId, turnId } = addTurn("check", prompt);
    setDraft("");
    try {
      const id = await startCheck(input);
      patchTurn(chatId, turnId, (t) => ({ ...t, checkId: id }));
      const check = await follow(chatId, turnId, id);
      finish(chatId, turnId, { kind: "check", check });
      // A prediction or "should I buy" about a real asset: add today's market picture to the same chat.
      // A forecast gives the briefing a direction to weigh; an opinion ("I should buy X") only names the asset.
      const pred = check.claims.find((c) => c.asset && c.type === "forecast") ?? check.claims.find((c) => c.asset && c.type === "opinion");
      if (pred?.asset && features.market)
        void runMarket(pred.type === "forecast" ? pred.text : pred.asset, { chatId, context: { claim: pred.text, verdict: pred.verdict, label: check.label, asset: pred.asset } });
    } catch (e) {
      fail(chatId, turnId, (e as Error).message);
    }
  }

  async function runMarket(query: string, into?: { chatId: string; context?: Turn["context"] }) {
    const { chatId, turnId } = addTurn("market", query, "running", into);
    setDraft("");
    try {
      const brief = await streamMarketBrief(query, (e) => push(chatId, turnId, { stage: e.stage ?? "research", status: e.status ?? "info", message: e.message, lines: e.lines, ms: e.ms }));
      finish(chatId, turnId, { kind: "market", brief });
    } catch (e) {
      fail(chatId, turnId, (e as Error).message);
    }
  }

  function startScam() {
    addTurn("scamsos", "ScamSOS", "awaiting");
    setRightOpen(false);
  }
  const onScamPlan = (chatId: string, turnId: string) => (res: ScamPlanResponse, summary: string) => {
    patchTurn(chatId, turnId, (t) => ({
      ...t, prompt: `ScamSOS: ${summary}`,
      activity: [...t.activity, { at: Date.now(), stage: "scamsos", status: "done", message: "Built your plan from the official checklist",
        lines: [`Now: ${res.plan.now.length} steps`, `Today: ${res.plan.today.length}`, `This week: ${res.plan.this_week.length}`, res.rephrased ? "Wording softened by AI; the steps come from a fixed, sourced checklist" : "Wording straight from the checklist"] }],
    }));
    finish(chatId, turnId, { kind: "scamsos", plan: res });
  };

  async function runEmail(file: File) {
    const { chatId, turnId } = addTurn("email", `📎 ${file.name}`);
    push(chatId, turnId, { stage: "email", status: "start", message: "Reading the email in memory (links and attachments are never opened)" });
    try {
      if (!/\.eml$/i.test(file.name)) throw new Error("Please choose a .eml file (download the message from your email app).");
      if (file.size > 2 * 1024 * 1024) throw new Error("That file is over 2 MB. Please choose a smaller .eml file.");
      const email = await checkEmail(file);
      push(chatId, turnId, { stage: "email", status: "done", message: `${email.label}: ${email.signals.length} signal${email.signals.length === 1 ? "" : "s"}`, lines: email.signals.map((s) => `${s.severity.toUpperCase()}: ${s.title}`) });
      finish(chatId, turnId, { kind: "email", email });
      if (email.checkId) {
        patchTurn(chatId, turnId, (t) => ({ ...t, checkId: email.checkId! }));
        const check = await follow(chatId, turnId, email.checkId);
        patchTurn(chatId, turnId, (t) => ({ ...t, result: { kind: "email", email, check } }));
      }
    } catch (e) {
      fail(chatId, turnId, (e as Error).message);
    }
  }

  function setWatchlist(w: string[]) { setWatchlistState(w); saveWatchlist(w); }
  async function runNews(text: string) {
    const topics = [...new Set(text.split(/[,;\n]/).map((t) => t.trim().replace(/\s+/g, " ")).filter((t) => t.length >= 2 && t.length <= 60))].slice(0, 10);
    if (!topics.length) return;
    const merged = [...new Set([...watchlist, ...topics])].slice(0, 10);
    setWatchlist(merged);
    const { chatId, turnId } = addTurn("news", topics.join(", "));
    setDraft("");
    push(chatId, turnId, { stage: "news", status: "start", message: `Checking Google News${features.liveData ? " and SEC filings" : ""} for ${topics.join(", ")}` });
    try {
      const r = await fetchNews(topics);
      push(chatId, turnId, { stage: "news", status: "done", message: `${r.items.length} headline${r.items.length === 1 ? "" : "s"} from reliable outlets in the last 24 hours`, lines: [
        ...r.items.slice(0, 6).map((i) => `${i.source}: ${i.title}`),
        r.filingsEnabled ? "SEC filings included" : "SEC filings not included (the server needs SEC_USER_AGENT)",
        `Following: ${merged.join(", ")} (checked every 3 minutes while TrustCheck is open)`,
      ] });
      const seen = loadSeen();
      r.items.forEach((i) => seen.add(i.id));
      saveSeen(seen);
      setNewsUnread(0);
      finish(chatId, turnId, { kind: "news", items: r.items, topics });
    } catch (e) {
      fail(chatId, turnId, (e as Error).message);
    }
  }

  async function openSaved(id: string, preview: string) {
    setActiveId(null);
    const c = newChat();
    const turnId = uid();
    setChats((cs) => [{ ...c, title: titleFrom(preview || "Saved check"), turns: [{ id: turnId, mode: "check", prompt: preview || "Saved check", createdAt: Date.now(), status: "running", activity: [{ at: Date.now(), stage: "load", status: "start", message: "Loading the saved result" }], checkId: id }] }, ...cs]);
    setActiveId(c.id);
    setSel({ turnId, tab: "result" });
    setLeftOpen(false);
    try {
      const s = await getCheck(id);
      if (s.status === "done") {
        push(c.id, turnId, { stage: "load", status: "done", message: "Loaded the saved result" });
        finish(c.id, turnId, { kind: "check", check: s.result });
      } else if (s.status === "failed") fail(c.id, turnId, s.error);
      else finish(c.id, turnId, { kind: "check", check: await follow(c.id, turnId, id) });
    } catch (e) {
      fail(c.id, turnId, (e as Error).message);
    }
  }

  function send(text: string) {
    if (mode === "market") return void runMarket(text);
    if (mode === "news") return void runNews(text);
    return void runCheck(text);
  }
  function retry(t: Turn) {
    if (t.mode === "email") { setMode("email"); return; }
    if (t.mode === "scamsos") return startScam();
    if (t.mode === "market") return void runMarket(t.prompt);
    if (t.mode === "news") return void runNews(t.prompt);
    void runCheck(t.prompt);
  }
  const checkText = (text: string) => { setMode("check"); setRightOpen(false); void runCheck(text); };
  const marketFor = (text: string) => { setMode("market"); setRightOpen(false); void runMarket(text); };

  // ---- on load: deep link (#/check/<id>) and resume checks that were running when the page closed ----
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const m = window.location.hash.match(/^#\/check\/([0-9a-f-]{36})$/i);
    if (m) { void openSaved(m[1], "Shared check"); history.replaceState(null, "", window.location.pathname); }
    for (const c of chats) for (const t of c.turns) {
      if (t.status === "running" && t.checkId) {
        void follow(c.id, t.id, t.checkId)
          .then((check) => finish(c.id, t.id, t.mode === "email" && t.result?.kind === "email" ? { ...t.result, check } : { kind: "check", check }))
          .catch((e) => fail(c.id, t.id, (e as Error).message));
      }
    }
  }, []);

  // ---- saved checks for logged-in users ----
  useEffect(() => {
    if (auth.isAuthenticated) void getHistory().then(setSaved).catch(() => setSaved([]));
    else setSaved(null);
  }, [auth.isAuthenticated]);

  // ---- news alerts: poll the watchlist while the app is open ----
  const firstPoll = useRef(true);
  useEffect(() => {
    if (!features.news || !watchlist.length) return;
    const poll = async () => {
      try {
        const r = await fetchNews(watchlist);
        const seen = loadSeen();
        const fresh: NewsItem[] = r.items.filter((i) => !seen.has(i.id));
        if (firstPoll.current) { fresh.forEach((i) => seen.add(i.id)); saveSeen(seen); firstPoll.current = false; return; }
        setNewsUnread(fresh.length);
        if (fresh.length && typeof Notification !== "undefined" && Notification.permission === "granted") {
          for (const i of fresh.slice(0, 3)) {
            const note = new Notification(`TrustCheck · ${i.topic}`, { body: `${i.source}: ${i.title}`, tag: i.id });
            note.onclick = () => window.focus();
          }
        }
      } catch { /* try again next round */ }
    };
    void poll();
    const t = setInterval(() => { if (document.visibilityState === "visible") void poll(); }, POLL_MS);
    return () => clearInterval(t);
  }, [features.news, watchlist.join("|")]);

  const openNews = () => {
    setMode("news");
    setLeftOpen(false);
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    if (watchlist.length) void runNews(watchlist.join(", "));
  };

  const focusComposer = () => setTimeout(() => document.getElementById("composer")?.focus(), 0);
  function followUpsFor(t: Turn): FollowUp[] {
    const r = t.result;
    const out: FollowUp[] = [];
    const scam = features.scamsos ? { label: "I already sent money or shared info", run: () => { setMode("scamsos"); startScam(); } } : null;
    if (r?.kind === "check") {
      // Market context is added automatically for predictions about an asset; offer it for other named assets.
      const named = r.check.claims.find((c) => c.asset && c.type !== "forecast" && c.type !== "opinion");
      if (named?.asset && features.market) out.push({ label: `See today's market for ${named.asset}`, run: () => marketFor(named.asset!) });
      if (scam && (r.check.label !== "holds_up" || r.check.hypeFlags.length)) out.push(scam);
      out.push({ label: "Check something else", run: () => { setMode("check"); setDraft(""); focusComposer(); } });
    } else if (r?.kind === "market" && r.brief.supported) {
      const name = r.brief.subject?.ticker ?? r.brief.subject?.name ?? t.prompt;
      if (features.news) out.push({ label: `Follow news about ${name}`, run: () => { setMode("news"); void runNews(name); } });
      out.push({ label: `Check a claim about ${name}`, run: () => { setMode("check"); setDraft(`${name} `); focusComposer(); } });
    } else if (r?.kind === "news" && r.items[0]) {
      out.push({ label: "Check the top headline", run: () => checkText(r.items[0].title) });
    } else if (r?.kind === "email") {
      if (scam && r.email.signals.some((x) => x.severity === "high")) out.push({ ...scam, label: "I clicked a link or replied to it" });
      out.push({ label: "Check another email", run: () => setMode("email") });
    } else if (r?.kind === "scamsos") {
      out.push({ label: "Check the message they sent you", run: () => { setMode("check"); setDraft(""); focusComposer(); } });
    }
    return out.slice(0, 3);
  }

  const selectTurn = (t: Turn, tab: Tab) => { setSel({ turnId: t.id, tab }); showPanel(); };

  const sidebar = (mobile: boolean) => (
    <Sidebar
      chats={[...chats].sort((a, b) => b.updatedAt - a.updatedAt)} activeId={activeId}
      onSelect={(id) => { setActiveId(id); setSel({ turnId: null, tab: "activity" }); setLeftOpen(false); }}
      onNew={() => { setActiveId(null); setSel({ turnId: null, tab: "activity" }); setDraft(""); setMode("check"); setLeftOpen(false); }}
      onDelete={(id) => { setChats((cs) => cs.filter((c) => c.id !== id)); if (id === activeId) setActiveId(null); }}
      onClearAll={() => { setChats([]); setActiveId(null); }}
      saved={saved} onOpenSaved={(id, p) => void openSaved(id, p)}
      newsUnread={newsUnread} onOpenNews={features.news ? openNews : null}
      auth={auth} theme={theme} setTheme={setTheme}
      onClose={mobile ? () => setLeftOpen(false) : undefined} onCollapse={mobile ? undefined : () => setSideShown(false)}
    />
  );
  const panel = (mobile: boolean) => (
    <ActivityPanel turn={selectedTurn} tab={sel.tab} setTab={(tab) => setSel((s) => ({ turnId: s.turnId ?? selectedTurn?.id ?? null, tab }))}
      wide={panelWidth >= panelMax - 8} setWide={mobile ? undefined : (w) => setPanelW(w ? panelMax : 440)} onClose={mobile ? () => setRightOpen(false) : () => setPanelShown(false)}
      onCheck={checkText} onScamSOS={features.scamsos ? () => { setMode("scamsos"); startScam(); } : undefined} onMarketContext={features.market ? marketFor : undefined} />
  );
  const iconBtn = "rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900";

  return (
    <div className="flex h-dvh overflow-hidden bg-white text-slate-900">
      {authEnabled && <AuthBridge onChange={setAuth} />}

      <div className="hidden shrink-0 lg:flex">
        {sideShown ? sidebar(false) : (
          <LeftRail onExpand={() => setSideShown(true)} onNew={() => { setActiveId(null); setSel({ turnId: null, tab: "activity" }); setDraft(""); setMode("check"); }}
            onNews={features.news ? openNews : null} newsUnread={newsUnread} auth={auth} />
        )}
      </div>
      {leftOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setLeftOpen(false)} aria-hidden />
          <div className="tc-fade relative h-full">{sidebar(true)}</div>
        </div>
      )}

      <main id="main" className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-1 px-2 py-2 sm:px-3">
          <button type="button" onClick={() => setLeftOpen(true)} aria-label="Open menu" className={`${iconBtn} lg:hidden`}><IMenu className="h-5 w-5" /></button>
          <h1 className="min-w-0 truncate px-1 text-sm font-semibold text-slate-800">{active?.title ?? "New check"}</h1>
          <div className="ml-auto flex items-center gap-1">
            {busy && <span className="mr-1 flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-700" aria-hidden />Checking</span>}
            <button type="button" onClick={() => setRightOpen(true)} className={`${iconBtn} flex items-center gap-1.5 min-[1180px]:hidden`} aria-label="Show how we checked"><IPanelRight className="h-5 w-5" /><span className="hidden text-sm font-medium sm:inline">How we checked</span></button>
          </div>
        </header>

        <div ref={scroller} className="tc-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-8 px-4 py-6">
            {!turns.length ? (
              <Welcome modes={modes} signedIn={auth.isAuthenticated} onPick={(m, example) => {
                setMode(m);
                if (m === "scamsos") return startScam();
                if (example) setDraft(example);
                setTimeout(() => document.getElementById("composer")?.focus(), 0);
              }} />
            ) : (
              turns.map((t) => (
                <TurnView key={t.id} turn={t} selected={t.id === selectedTurn?.id} isLatest={t.id === turns[turns.length - 1]?.id} followUps={followUpsFor(t)}
                  onSelect={(tab) => selectTurn(t, tab)} onRetry={() => retry(t)} onCheck={checkText} onScamPlan={onScamPlan(active!.id, t.id)} />
              ))
            )}
          </div>
        </div>

        <Composer mode={mode} modes={modes} setMode={setMode} busy={busy} draft={draft} setDraft={setDraft}
          onSend={send} onFile={(f) => void runEmail(f)} onScamStart={startScam}
          watchlist={watchlist} onRemoveTopic={(t) => setWatchlist(watchlist.filter((x) => x !== t))} />
      </main>

      {turns.length > 0 && (
        panelShown ? (
          <div className="relative hidden shrink-0 min-[1180px]:flex" style={{ width: panelWidth }}>
            <ResizeHandle width={panelWidth} setWidth={setPanelW} min={PANEL_MIN} max={panelMax} onReset={() => setPanelW(440)} />
            {panel(false)}
          </div>
        ) : (
          <div className="hidden shrink-0 min-[1180px]:flex">
            <RightRail live={busy} hasResult={!!selectedTurn?.result} onOpen={(tab) => { setSel((s) => ({ turnId: s.turnId ?? selectedTurn?.id ?? null, tab })); setPanelShown(true); }} />
          </div>
        )
      )}
      {rightOpen && (
        <div className="fixed inset-0 z-40 flex justify-end min-[1180px]:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setRightOpen(false)} aria-hidden />
          <div className="tc-fade relative h-full w-full max-w-[560px]">{panel(true)}</div>
        </div>
      )}
    </div>
  );
}

function pref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function prefNum(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}
function savePrefNum(key: string, v: number) {
  try { localStorage.setItem(key, String(Math.round(v))); } catch { /* storage unavailable */ }
}
function savePref(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* storage unavailable */ }
}

function Welcome({ modes, onPick, signedIn }: { modes: Mode[]; onPick: (m: Mode, example?: string) => void; signedIn: boolean }) {
  const steps = ["Paste something you saw online", "We check it against trusted sources", "You see what holds up, and why"];
  return (
    <div className="tc-fade @container space-y-6 pt-2 sm:pt-8">
      <div className="text-center">
        <span className="mx-auto mb-3 flex w-fit"><Logo size="h-10 w-10" /></span>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Saw a money claim online?</h2>
        <p className="mx-auto mt-2 max-w-lg text-[15px] leading-relaxed text-slate-600">Paste it here. We'll check it against trusted sources and live data, and explain what holds up in plain English. We never tell you what to do with your money.</p>
        <ol className="mx-auto mt-4 flex max-w-xl flex-col items-center justify-center gap-2 text-sm @2xl:flex-row @2xl:gap-4">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2 text-slate-700"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-800">{i + 1}</span>{s}</li>
          ))}
        </ol>
      </div>
      <div>
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Or try one of these</p>
        <ul className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
          {modes.map((m) => {
            const MI = MODES[m].icon;
            return (
              <li key={m} className="group rounded-2xl border border-slate-200 p-3.5 transition hover:border-slate-300 hover:shadow-sm">
                <button type="button" onClick={() => onPick(m)} className="flex w-full items-start gap-3 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><MI className="h-[18px] w-[18px]" /></span>
                  <span><span className="block font-semibold">{MODES[m].label}</span><span className="block text-sm leading-snug text-slate-600">{MODES[m].desc}</span></span>
                </button>
                {MODES[m].examples.length > 0 && (
                  <ul className="mt-2.5 space-y-1.5">
                    {MODES[m].examples.slice(0, 1).map((ex) => (
                      <li key={ex}><button type="button" onClick={() => onPick(m, ex)} className="w-full truncate rounded-xl bg-slate-50 px-3 py-2 text-left text-[13px] text-slate-700 transition hover:bg-slate-100" title={ex}>“{ex}”</button></li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {!signedIn && <p className="text-center text-xs text-slate-500">Tip: log in from the bottom-left to keep your checks on any device.</p>}
    </div>
  );
}
