import { useState } from "react";
import type { CheckResult, ClaimResult, ClaimVerdict, Evidence, MathCheck, Reason } from "../../server/src/types";
import ImplicationCard from "./Implication";
import { BAND, CLAIM_TYPE, OVERALL, TIER, VERDICT } from "./labels";

const fmt = (n: number) => {
  if (!Number.isFinite(n)) return "∞";
  if (n >= 1e15) return n.toExponential(1).replace("e+", "×10^");
  if (n >= 100) return Math.round(n).toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
};

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

const LEANING: Record<string, string> = {
  supports: "the evidence mostly supports the claims",
  contradicts: "the evidence mostly contradicts the claims",
  mixed: "the evidence points both ways",
  unconfirmed: "reliable sources mostly didn't address the claims",
};

function Gauge({ score, band, color, notScored = false, leaning }: { score: number; band: string; color: string; notScored?: boolean; leaning?: string }) {
  const L = Math.PI * 80;
  return (
    <div className="mx-auto w-56">
      <svg viewBox="0 0 180 104" role="meter" aria-label="Evidence strength" aria-valuemin={0} aria-valuemax={100} aria-valuenow={notScored ? undefined : score} aria-valuetext={notScored ? "Not scored: nothing here can be checked against sources" : `${BAND[band]}, score ${score} out of 100${leaning ? `; ${LEANING[leaning]}` : ""}`} className="w-full">
        <path d="M10 90 A80 80 0 0 1 170 90" fill="none" stroke="var(--color-slate-200)" strokeWidth="14" strokeLinecap="round" />
        <path d="M10 90 A80 80 0 0 1 170 90" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - (notScored ? 0 : score) / 100)} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
        <text x="90" y="74" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--color-slate-900)">{notScored ? "Not scored" : BAND[band]}</text>
        <text x="90" y="94" textAnchor="middle" fontSize="11" fill="var(--color-slate-600)">{notScored ? "nothing checkable" : `score ${score}/100`}</text>
      </svg>
      <p className="-mt-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">Evidence strength</p>
      {!notScored && leaning && LEANING[leaning] && <p className="mt-1 text-center text-xs text-slate-700">{LEANING[leaning][0].toUpperCase() + LEANING[leaning].slice(1)}</p>}
    </div>
  );
}

function SourceBalance({ evidence }: { evidence: Evidence[] }) {
  const c = { supports: 0, mixed: 0, contradicts: 0 };
  evidence.forEach((e) => { if (e.stance && e.stance !== "irrelevant") c[e.stance]++; });
  const total = c.supports + c.mixed + c.contradicts;
  if (!total) return null;
  const seg = (n: number, cls: string) => n > 0 && <div className={cls} style={{ width: `${(n / total) * 100}%` }} />;
  return (
    <div className="mt-3" aria-label={`${c.supports} sources support, ${c.mixed} partly, ${c.contradicts} contradict`}>
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        {seg(c.supports, "bg-emerald-600")}{seg(c.mixed, "bg-amber-500")}{seg(c.contradicts, "bg-rose-600")}
      </div>
      <p className="mt-1 text-xs text-slate-700">
        {c.supports > 0 && <span className="mr-3">✓ {c.supports} support</span>}
        {c.mixed > 0 && <span className="mr-3">◐ {c.mixed} partly</span>}
        {c.contradicts > 0 && <span>✗ {c.contradicts} contradict</span>}
      </p>
    </div>
  );
}

function TierDots({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= TIER[tier].dots ? "bg-current" : "bg-current opacity-20"}`} />)}
    </span>
  );
}

function EvidenceItem({ e }: { e: Evidence }) {
  const relevant = e.stance && e.stance !== "irrelevant";
  const st = ({ supports: ["✓", "Supports", "text-emerald-800"], contradicts: ["✗", "Contradicts", "text-rose-800"], mixed: ["◐", "Partly", "text-amber-800"], irrelevant: ["–", "Not relevant", "text-slate-500"] } as const)[e.stance ?? "irrelevant"];
  return (
    <li className={`rounded-lg border p-3 text-sm ${relevant ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${TIER[e.tier].cls}`} title={TIER[e.tier].text}>
          <TierDots tier={e.tier} /> {TIER[e.tier].short}
        </span>
        {e.live && <span className="inline-flex items-center gap-1 rounded-full border border-violet-700 bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900" title="Fetched directly from a data source (price feed, SEC filing or Federal Reserve data), not a web search result">⚡ Live data</span>}
        <span className={`text-xs font-bold ${st[2]}`}>{st[0]} {st[1]}</span>
        <span className="truncate text-xs text-slate-600">{e.domain}</span>
        <span className="ml-auto font-mono text-[10px] text-slate-400">{e.id}</span>
      </div>
      <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1.5 block break-words font-medium text-blue-800 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-800">
        {e.title || e.url} <span aria-hidden>↗</span>
      </a>
      {relevant && e.quote && <blockquote className="mt-2 border-l-4 border-slate-300 bg-slate-50 py-1 pl-3 italic text-slate-800">“{e.quote}”</blockquote>}
      {e.stanceReason && <p className="mt-1.5 text-xs text-slate-600">{e.stanceReason}</p>}
    </li>
  );
}

function MathCard({ m }: { m: MathCheck }) {
  const pct = m.calc === "implied_annualized_return_pct";
  return (
    <div className="mt-4 flex items-center gap-4 rounded-xl border border-violet-300 bg-gradient-to-br from-violet-50 to-white p-4 text-violet-950">
      <div className="shrink-0 text-center">
        <p className="text-3xl font-extrabold leading-none tracking-tight @lg:text-4xl">≈ {fmt(m.output)}{pct ? "%" : "×"}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide">in one year</p>
      </div>
      <div className="min-w-0 border-l border-violet-200 pl-4 text-sm">
        <p className="text-xs font-bold uppercase tracking-wide">Math check</p>
        <p className="mt-0.5">{m.text}</p>
        <p className="mt-1 text-xs text-violet-800">Calculated by code from the claim's numbers. It makes extreme claims visible and doesn't change the verdict.</p>
      </div>
    </div>
  );
}

function ClaimCard({ c, index }: { c: ClaimResult; index: number }) {
  const v = VERDICT[c.verdict];
  const relevant = c.evidence.filter((e) => e.stance && e.stance !== "irrelevant");
  const rest = c.evidence.filter((e) => !relevant.includes(e));
  return (
    <article className={`rounded-xl border border-l-8 border-slate-200 bg-white p-4 shadow-sm @lg:p-5 ${v.border}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500">CLAIM {index}</span>
        <Badge cls={v.badge}><span aria-hidden>{v.icon}</span> {v.text}</Badge>
        <Badge cls="bg-white text-slate-700 border-slate-300">{CLAIM_TYPE[c.type]}</Badge>
        {c.importance === 3 && <Badge cls="bg-slate-900 text-white border-slate-900">Central</Badge>}
      </div>
      <h3 className="mt-2 text-lg font-bold leading-snug">{c.text}</h3>
      {c.math && <MathCard m={c.math} />}
      {c.implication && <ImplicationCard imp={c.implication} />}
      <p className="mt-3 text-[15px] leading-relaxed text-slate-800">{c.why}</p>
      <SourceBalance evidence={c.evidence} />
      {relevant.length > 0 && (
        <details className="group mt-3" open={relevant.length <= 2}>
          <summary className="cursor-pointer select-none text-sm font-semibold text-blue-900">
            <span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span> evidence ({relevant.length})
          </summary>
          <ul className="mt-2 space-y-2" aria-label="Evidence">{relevant.map((e) => <EvidenceItem key={e.id} e={e} />)}</ul>
        </details>
      )}
      {relevant.length === 0 && <p className="mt-3 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">No reliable source addressed this claim, so we can't say either way.</p>}
      {rest.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer select-none text-xs font-medium text-slate-600">{rest.length} other source{rest.length === 1 ? "" : "s"} looked at (not relevant)</summary>
          <ul className="mt-2 space-y-2">{rest.map((e) => <EvidenceItem key={e.id} e={e} />)}</ul>
        </details>
      )}
    </article>
  );
}

const REASON_STYLE: Record<Reason["kind"], { icon: string; label: string; cls: string }> = {
  contradicted: { icon: "✗", label: "Contradicted", cls: "bg-rose-100 text-rose-900 border-rose-700" },
  mixed: { icon: "◐", label: "Sources disagree", cls: "bg-amber-100 text-amber-900 border-amber-700" },
  unconfirmed: { icon: "?", label: "Not confirmed", cls: "bg-slate-100 text-slate-800 border-slate-500" },
  math: { icon: "∑", label: "Math", cls: "bg-violet-100 text-violet-900 border-violet-700" },
  hype: { icon: "⚑", label: "Pressure language", cls: "bg-orange-100 text-orange-900 border-orange-700" },
  supported: { icon: "✓", label: "Backed by sources", cls: "bg-emerald-100 text-emerald-900 border-emerald-700" },
  not_checkable: { icon: "∅", label: "Can't be verified", cls: "bg-slate-100 text-slate-800 border-slate-500" },
};

function Reasons({ reasons, title }: { reasons: Reason[]; title: string }) {
  if (!reasons.length) return null;
  return (
    <div className="border-t border-black/10 bg-white/80 px-5 py-4 @lg:px-7">
      <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-800">{title}</h3>
      <ol className="mt-3 space-y-3">
        {reasons.map((r, i) => {
          const st = REASON_STYLE[r.kind];
          return (
            <li key={i} className={`rounded-lg border bg-white p-3 text-sm ${r.decisive ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge cls={st.cls}><span aria-hidden>{st.icon}</span> {st.label}</Badge>
                {r.decisive && <Badge cls="bg-slate-900 text-white border-slate-900">Decided the result</Badge>}
                {r.claimId && <span className="text-xs text-slate-500">claim {r.claimId.replace("c", "")}</span>}
              </div>
              <p className="mt-1.5 text-[15px] leading-snug">{r.text}</p>
              {r.quote && <blockquote className="mt-2 border-l-4 border-slate-300 pl-3 text-sm italic text-slate-700">“{r.quote}”</blockquote>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SummaryStrip({ claims }: { claims: ClaimResult[] }) {
  const order: ClaimVerdict[] = ["supported", "mixed", "refuted", "unverifiable", "not_checkable"];
  const counts = order.map((k) => [k, claims.filter((c) => c.verdict === k).length] as const).filter(([, n]) => n > 0);
  if (!counts.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Claims by result">
      {counts.map(([k, n]) => (
        <li key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${VERDICT[k].badge}`}>
          <span className="text-lg font-extrabold leading-none">{n}</span> <span aria-hidden>{VERDICT[k].icon}</span> {VERDICT[k].text}
        </li>
      ))}
    </ul>
  );
}

function CopyLink({ id }: { id: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    const url = `${window.location.origin}/#/check/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      window.prompt("Copy this link:", url);
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={copy} className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-sm font-semibold hover:bg-slate-100">
        <span aria-hidden>🔗</span> Copy link to this result
      </button>
      <span role="status" className="text-xs text-slate-600">
        {state === "copied" ? "✓ Link copied" : "Anyone with the link can view it. Anonymous checks are deleted after 7 days; checks saved to an account stay private."}
      </span>
    </div>
  );
}

export default function Results({ r, onScamSOS, onMarketContext }: { r: CheckResult; onScamSOS?: () => void; onMarketContext?: (claim: string) => void }) {
  const o = OVERALL[r.label];
  const checkable = r.claims.filter((c) => c.verdict !== "not_checkable");
  const uncheckable = r.claims.filter((c) => c.verdict === "not_checkable");
  const notScored = checkable.length === 0;
  return (
    <section aria-labelledby="results-h" className="space-y-6">
      <h2 id="results-h" className="sr-only">Results</h2>

      <div className={`overflow-hidden rounded-2xl border-2 shadow-sm ${o.tint}`}>
        <div className="grid gap-6 p-5 @lg:grid-cols-[1fr_15rem] @lg:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Overall result</p>
            <div className="mt-2 flex items-center gap-3">
              <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-3xl font-black text-[#fff]" style={{ background: o.accent }}>{o.icon}</span>
              <div>
                <p className="text-3xl font-extrabold leading-tight @lg:text-4xl">{o.text}</p>
                <p className="text-sm text-slate-700">{notScored ? "Nothing here can be checked against sources" : o.sub}</p>
              </div>
            </div>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-900">{r.whyOverall}</p>
          </div>
          <div className="self-center rounded-xl bg-white/70 p-3"><Gauge score={(r.evidence ?? r.strength).score} band={(r.evidence ?? r.strength).band} color={o.accent} notScored={notScored} leaning={r.evidence?.leaning} /></div>
        </div>
        <div className="border-t border-black/10 bg-white/60 px-5 py-3 @lg:px-7"><CopyLink id={r.id} /></div>
        {r.reasons && <Reasons reasons={r.reasons} title={r.label === "doesnt_hold_up" ? "Why it doesn't hold up" : r.label === "holds_up" ? "Why it holds up" : "Why it needs checking"} />}
        <div className="space-y-3 border-t border-black/10 bg-white/60 px-5 py-4 @lg:px-7">
          <SummaryStrip claims={r.claims} />
          {r.hypeFlags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Pressure language:</span>
              {r.hypeFlags.map((h) => <Badge key={h} cls="bg-orange-100 text-orange-900 border-orange-700">⚑ “{h}”</Badge>)}
              <span className="text-xs text-slate-600">A warning sign; never changes a verdict.</span>
            </div>
          )}
        </div>
      </div>

      {onScamSOS && (
        <button type="button" onClick={onScamSOS} className="flex w-full items-center justify-between gap-3 rounded-xl border border-teal-300 bg-teal-50 p-4 text-left text-teal-950 hover:bg-teal-100">
          <span><strong className="block">Already sent money or shared info?</strong><span className="text-sm">Get a calm, step-by-step plan and a summary you can copy for your bank.</span></span>
          <span aria-hidden className="text-xl">→</span>
        </button>
      )}

      {checkable.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-extrabold">Claims we checked</h2>
          {checkable.map((c, i) => <ClaimCard key={c.id} c={c} index={i + 1} />)}
        </div>
      )}

      {uncheckable.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-extrabold">Can't be verified</h2>
          <p className="text-sm text-slate-700">Forecasts and opinions aren't facts, so no source can confirm or refute them. They're listed so you can tell them apart from the checkable claims.</p>
          <ul className="grid gap-3 @lg:grid-cols-2">
            {uncheckable.map((c) => (
              <li key={c.id} className="rounded-xl border-2 border-dashed border-slate-400 bg-slate-50 p-4 text-sm">
                <Badge cls={VERDICT.not_checkable.badge}>∅ {CLAIM_TYPE[c.type]}</Badge>
                <p className="mt-2 font-semibold">{c.text}</p>
                <p className="mt-1 text-slate-700">{c.why}</p>
                {c.implication && <ImplicationCard imp={c.implication} />}
                {onMarketContext && (
                  <button type="button" onClick={() => onMarketContext(c.text)} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-800 underline">
                    See market context and which way the factors lean <span aria-hidden>→</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 @2xl:grid-cols-2">
        <div className="rounded-xl border border-slate-300 bg-white p-5 text-sm">
          <h2 className="text-lg font-extrabold">Limits of this check</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-3 text-xs text-slate-500">Took {(Object.values(r.timings).reduce((a, b) => a + b, 0) / 1000).toFixed(1)}s</p>
        </div>
        <div className="rounded-xl border border-slate-300 bg-white p-5 text-sm">
          <h2 className="text-lg font-extrabold">Questions to ask before acting</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>Who benefits if I believe this? Are they paid or selling something?</li>
            <li>What's the worst case, and could I afford it?</li>
            <li>What does a primary source (the filing, the regulator) say?</li>
            <li>Am I being pushed to decide fast?</li>
            <li>Could I explain this decision to someone I trust?</li>
          </ul>
          <p className="mt-3 text-slate-700">Penn State students can learn more through FNB's financial education program.</p>
        </div>
      </div>
    </section>
  );
}
