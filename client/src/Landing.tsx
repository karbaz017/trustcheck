import { useEffect, useState } from "react";
import type { AuthState } from "./Auth";
import { MODES, type Mode } from "./chat";
import { IActivity, IArrowUp, ICheck, IExternal, ILogIn, IShield, IWrench } from "./icons";
import { Logo } from "./Sidebar";

const REPO = "https://github.com/karbaz017/trustcheck";

/** The live-looking demo in the hero: steps tick by, then the verdict lands. Loops. */
const STEPS = ["Reading the post", "Found 4 claims", "Checking the math", "Searching the web + live data", "Checked the live Bitcoin price", "Rating 55 sources", "Comparing sources with claims", "Deciding verdicts by fixed rules"];

function HeroDemo() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % (STEPS.length + 6)), 900);
    return () => clearInterval(t);
  }, []);
  const done = i >= STEPS.length;
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-indigo-500/30 via-violet-500/20 to-fuchsia-500/20 blur-2xl" />
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl shadow-indigo-900/10">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-slate-100 px-3.5 py-2.5 text-sm text-slate-800">
          I turned $1,000 into $10,000 in 30 days with this AI bot. Bitcoin is above $100,000. Returns are <b>guaranteed</b>, get in now!
        </div>
        <div className="mt-3 flex gap-2.5">
          <Logo size="h-7 w-7" />
          <div className="min-w-0 flex-1">
            {!done ? (
              <div className="space-y-1.5" aria-live="polite">
                <p className="tc-shimmer text-sm font-medium">{STEPS[i]}…</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-700" style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
                </div>
                <ul className="space-y-1 pt-1 text-xs text-slate-500">
                  {STEPS.slice(Math.max(0, i - 2), i).map((s) => <li key={s} className="flex items-center gap-1.5"><ICheck className="h-3.5 w-3.5 text-emerald-700" />{s}</li>)}
                </ul>
              </div>
            ) : (
              <div className="tc-fade space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-rose-700 bg-rose-100 px-2.5 py-0.5 text-sm font-bold text-rose-900">✗ Doesn't hold up</span>
                  <span className="rounded-full border border-orange-700 bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900">⚑ guaranteed · get in now</span>
                </div>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                  <li className="flex items-center gap-2 px-3 py-2"><span className="rounded-full border border-rose-700 bg-rose-100 px-2 text-xs font-semibold text-rose-900">✗ Contradicted</span><span className="truncate">Bitcoin is above $100,000</span></li>
                  <li className="flex items-center gap-2 px-3 py-2"><span className="rounded-full border border-amber-700 bg-amber-100 px-2 text-xs font-semibold text-amber-900">⚠ No reliable backing</span><span className="truncate">Returns are guaranteed</span></li>
                  <li className="flex items-center gap-2 px-3 py-2"><span className="rounded-full border border-slate-500 bg-slate-100 px-2 text-xs font-semibold text-slate-800">? Can't confirm</span><span className="truncate">$1,000 → $10,000 in 30 days</span></li>
                </ul>
                <p className="rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-900"><b>∑ Math check:</b> 10x every 30 days ≈ 1.47 trillion x in a year.</p>
                <p className="flex items-center gap-1.5 text-xs text-slate-500"><IWrench className="h-3.5 w-3.5" />Live CoinGecko price: $80,574</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const EXAMPLES: { quote: string; verdict: "bad" | "good" | "warn"; label: string; why: string }[] = [
  { quote: "Your savings are only protected up to $10,000 if your bank fails.", verdict: "bad", label: "Doesn't hold up", why: "fdic.gov states $250,000 per depositor, and TrustCheck quotes it word for word." },
  { quote: "Deposits at FNB are FDIC insured up to $250,000 per depositor.", verdict: "good", label: "Holds up", why: "Confirmed by fdic.gov, an official source." },
  { quote: "Should I buy Tesla now? A friend says it will rise 100% tomorrow.", verdict: "bad", label: "Doesn't hold up", why: "Nobody reliable predicts +100% in a day, and \"buy now\" is pressure. You also get today's market picture, never a buy/sell call." },
  { quote: "Urgent: your account will be closed within 24 hours. Verify now.", verdict: "warn", label: "Several warning signs", why: "Look-alike link, failed email authentication, invoice.pdf.exe attachment. Nothing was opened." },
];
const TONE = {
  bad: "border-rose-700 bg-rose-100 text-rose-900",
  good: "border-emerald-700 bg-emerald-100 text-emerald-900",
  warn: "border-amber-700 bg-amber-100 text-amber-900",
};
const ICON = { bad: "✗", good: "✓", warn: "▲" };

const SOURCES = ["FDIC", "SEC EDGAR", "Federal Reserve", "FRED", "BLS", "Treasury", "Reuters", "AP", "Bloomberg", "WSJ", "CNBC", "CoinGecko"];

const PIPE: { t: string; ai: boolean }[] = [
  { t: "Split into claims", ai: true }, { t: "Do the math", ai: false }, { t: "Search + live data", ai: true }, { t: "Rank every source", ai: false },
  { t: "Read what each source says", ai: true }, { t: "Decide the verdict", ai: false }, { t: "Flag pressure words", ai: false }, { t: "Explain in plain English", ai: true },
];

export default function Landing({ auth, onStart }: { auth: AuthState; onStart: (mode?: Mode, prompt?: string) => void }) {
  const [q, setQ] = useState("");
  const modes: Mode[] = ["check", "market", "scamsos", "email", "news"];
  const go = (e?: React.FormEvent) => { e?.preventDefault(); onStart("check", q.trim() || undefined); };
  return (
    <div className="h-dvh overflow-y-auto bg-white text-slate-900 tc-scroll">
      {/* nav */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <a href="#/welcome" className="flex items-center gap-2 text-lg font-extrabold"><Logo />TrustCheck</a>
          <nav className="ml-6 hidden gap-5 text-sm font-medium text-slate-600 md:flex">
            <a href="#how" onClick={(e) => { e.preventDefault(); document.getElementById("how")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-slate-900">How it works</a>
            <a href="#features" onClick={(e) => { e.preventDefault(); document.getElementById("features")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-slate-900">Features</a>
            <a href="#examples" onClick={(e) => { e.preventDefault(); document.getElementById("examples")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-slate-900">Examples</a>
            <a href={REPO} target="_blank" rel="noopener noreferrer" className="hover:text-slate-900">GitHub</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {auth.enabled && !auth.isAuthenticated && (
              <button type="button" onClick={auth.login} className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:flex"><ILogIn className="h-4 w-4" />Log in</button>
            )}
            <button type="button" onClick={() => onStart()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90">Open TrustCheck</button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_20%_-10%,rgba(99,102,241,0.18),transparent),radial-gradient(40rem_25rem_at_90%_10%,rgba(168,85,247,0.15),transparent)]" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-900">🏆 HackPSU Fall 2026 · FNB Challenge</span>
            <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
              Saw a money claim online?<br />
              <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 bg-clip-text text-transparent">Check it before you act.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Paste a post, message, article link or question. TrustCheck checks every claim against official sources, trusted news and live market data, does the math itself, and shows you exactly <i>why</i> it holds up, or doesn't.
            </p>
            <form onSubmit={go} className="mt-7 flex max-w-xl items-center gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-lg shadow-slate-900/5 focus-within:ring-4 focus-within:ring-indigo-100">
              <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Paste a claim to check" placeholder="e.g. “This coin will 10x by Friday, guaranteed”"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-slate-400" />
              <button type="submit" className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-[#fff] shadow hover:opacity-95">Check it <IArrowUp className="h-4 w-4 rotate-90" /></button>
            </form>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
              <span className="flex items-center gap-1.5"><ICheck className="h-4 w-4 text-emerald-700" />No account needed</span>
              <span className="flex items-center gap-1.5"><ICheck className="h-4 w-4 text-emerald-700" />Every verdict shows its sources</span>
              <span className="flex items-center gap-1.5"><ICheck className="h-4 w-4 text-emerald-700" />Evidence, never advice</span>
              {auth.enabled && !auth.isAuthenticated && auth.signup && (
                <button type="button" onClick={auth.signup} className="font-semibold text-indigo-700 underline-offset-4 hover:underline">Sign up to save your checks →</button>
              )}
            </div>
          </div>
          <HeroDemo />
        </div>
        {/* sources strip */}
        <div className="border-y border-slate-200 bg-slate-50/70">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-4 text-sm sm:px-6">
            <span className="font-semibold uppercase tracking-widest text-slate-500">Checks against</span>
            {SOURCES.map((s) => <span key={s} className="font-semibold text-slate-700">{s}</span>)}
          </div>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">From hype to evidence in about a minute</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { n: "1", t: "Paste what you saw", d: "A TikTok caption, a group-chat message, an article link, a scary email, or just a question like “Should I buy Tesla?”" },
            { n: "2", t: "Watch it get checked", d: "Every step streams live: claims found, math done, sources searched, live prices pulled, every source rated. Nothing hides behind a spinner." },
            { n: "3", t: "See why, with receipts", d: "A clear verdict for each claim, quotes from the sources that decided it, and plain-English reasons. No buy or sell calls, ever." },
          ].map((s) => (
            <div key={s.n} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-lg font-black text-[#fff]">{s.n}</span>
              <h3 className="mt-4 text-lg font-bold">{s.t}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* features */}
      <section id="features" className="scroll-mt-20 bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">One place for every money moment</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">Before you send money, while you're deciding, and right after something feels wrong.</p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {modes.map((m) => {
              const M = MODES[m];
              const extra: Record<Mode, string> = {
                check: "Facts, numbers, predictions and pressure words, each judged against ranked sources.",
                market: "What's moving a stock or coin, cited, with a factor balance computed by code.",
                scamsos: "Already sent money? A calm Now / Today / This week plan from official FTC guidance.",
                email: "Look-alike links, failed authentication, disguised attachments. Nothing is ever opened.",
                news: "Headlines only from trusted outlets for your watchlist, each one checkable in a click.",
              };
              return (
                <button key={m} type="button" onClick={() => onStart(m)} className="group rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-900"><M.icon className="h-5 w-5" /></span>
                  <h3 className="mt-4 text-lg font-bold">{M.label}</h3>
                  <p className="mt-1.5 leading-relaxed text-slate-600">{extra[m]}</p>
                  <span className="mt-4 inline-block text-sm font-semibold text-indigo-700 group-hover:underline">Try it →</span>
                </button>
              );
            })}
            <div className="rounded-3xl border border-dashed border-indigo-300 bg-indigo-50/60 p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-indigo-900"><IActivity className="h-5 w-5" /></span>
              <h3 className="mt-4 text-lg font-bold">Live data, built in</h3>
              <p className="mt-1.5 leading-relaxed text-slate-600">Crypto prices from CoinGecko and official Federal Reserve data from FRED, pulled the moment a claim needs them.</p>
            </div>
          </div>
        </div>
      </section>

      {/* AI reads, code decides */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <span className="text-sm font-bold uppercase tracking-widest text-violet-700">Why you can trust the verdict</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">AI reads. Code decides.</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Gemini is great at reading and terrible at judging. So it only reads: pulling out claims, checking what each source says, explaining the result. Every verdict comes from small, tested rules that weigh sources by reliability.
          </p>
          <ul className="mt-6 space-y-3 text-slate-700">
            {[
              "Official sources count most. Random websites can never decide a verdict alone.",
              "Quotes must appear word for word in the source, or they're thrown out.",
              "Predictions are never called true or false, only backed or unbacked.",
              "Explanations are checked for advice wording before you see them.",
            ].map((t) => <li key={t} className="flex gap-2.5"><IShield className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" />{t}</li>)}
          </ul>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-indigo-900/5">
          <ol className="space-y-2.5">
            {PIPE.map((p, i) => (
              <li key={p.t} className="flex items-center gap-3">
                <span className="w-5 text-right text-xs font-bold text-slate-400">{i + 1}</span>
                <span className={`flex-1 rounded-xl border px-3.5 py-2 text-sm font-semibold ${p.ai ? "border-violet-300 bg-violet-50 text-violet-900" : "border-blue-300 bg-blue-50 text-blue-900"}`}>{p.t}</span>
                <span className={`w-14 text-xs font-bold ${p.ai ? "text-violet-700" : "text-blue-700"}`}>{p.ai ? "AI" : "CODE"}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* examples */}
      <section id="examples" className="scroll-mt-20 bg-slate-950 py-20 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-[#fff] sm:text-4xl">Real checks, real verdicts</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-[#cbd5e1]">From live runs during the hackathon. Click one to try it yourself.</p>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {EXAMPLES.map((e) => (
              <button key={e.quote} type="button" onClick={() => onStart(e.verdict === "warn" ? "email" : "check", e.verdict === "warn" ? undefined : e.quote)}
                className="rounded-3xl border border-[#334155] bg-[#0f172a] p-6 text-left transition hover:border-[#818cf8]">
                <p className="text-lg font-semibold leading-snug text-[#f1f5f9]">“{e.quote}”</p>
                <span className={`mt-4 inline-block rounded-full border px-3 py-1 text-sm font-bold ${TONE[e.verdict]}`}>{ICON[e.verdict]} {e.label}</span>
                <p className="mt-3 text-sm leading-relaxed text-[#94a3b8]">{e.why}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* screenshots */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight sm:text-4xl">See every step, then the receipts</h2>
        <div className="mt-10 overflow-hidden rounded-3xl border border-slate-200 shadow-2xl shadow-slate-900/10">
          <img src="/landing/09-prediction.png" alt="TrustCheck result: the Tesla prediction doesn't hold up, with the full report on the right" className="block w-full" loading="lazy" />
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {[
            { src: "/landing/06-market.png", t: "Market briefing", d: "Cited drivers and a code-computed factor balance." },
            { src: "/landing/07-scamsos.png", t: "ScamSOS", d: "A calm plan where every step links to the FTC." },
            { src: "/landing/08-email.png", t: "Email check", d: "Phishing signs found without opening anything." },
          ].map((s) => (
            <figure key={s.t} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <img src={s.src} alt={s.t} className="block w-full" loading="lazy" />
              <figcaption className="p-4"><b>{s.t}.</b> <span className="text-slate-600">{s.d}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-14 text-center text-[#fff] shadow-2xl">
          <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Don't get played by a hype post.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-[#ede9fe]">Free, no account needed. Check the next “guaranteed” return before it costs you.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => onStart()} className="rounded-2xl bg-[#fff] px-6 py-3 text-base font-bold text-[#4338ca] shadow hover:opacity-95">Start checking</button>
            {auth.enabled && !auth.isAuthenticated && auth.signup && (
              <button type="button" onClick={auth.signup} className="rounded-2xl border border-[#fff]/60 px-6 py-3 text-base font-bold text-[#fff] hover:bg-[#fff]/10">Create a free account</button>
            )}
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:px-6">
          <span className="flex items-center gap-2 font-bold text-slate-800"><Logo size="h-6 w-6" />TrustCheck</span>
          <span>Evidence check only. Not financial advice. Sources can be wrong, so double-check important decisions.</span>
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900 sm:ml-auto">GitHub <IExternal className="h-3.5 w-3.5" /></a>
        </div>
      </footer>
    </div>
  );
}
