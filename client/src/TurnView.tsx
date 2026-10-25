import { useState } from "react";
import type { CheckResult, ClaimResult } from "../../server/src/types";
import { STAGE_LABEL, visibleActivity } from "./Activity";
import { MODES, type Turn } from "./chat";
import { bySeverity, LABEL_TONE, SEV } from "./EmailCheck";
import { IActivity, IAlert, ICheck, IChevronDown, IExternal, IFile, ILink, IRefresh } from "./icons";
import { OVERALL, TIER, VERDICT } from "./labels";
import { NewsList } from "./News";
import { ScamForm, type ScamPlanResponse } from "./ScamSOS";
import { Logo } from "./Sidebar";

const Pill = ({ cls, children }: { cls: string; children: React.ReactNode }) => (
  <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>
);
const TOTAL_STEPS: Record<string, number> = { check: 9, market: 3, email: 10 };
/** One plain sentence about the evidence, for people who don't read gauges. */
function evidenceLine(r: CheckResult): string | null {
  const ev = r.evidence;
  if (ev?.leaning !== "contradicts" && r.claims.some((c) => c.verdict === "unbacked" && c.importance === Math.max(...r.claims.map((x) => x.importance))))
    return "No trusted source makes this prediction";
  if (!ev || ev.leaning === "not_scored") return null;
  const strength = ev.band === "strong" ? "Strong" : ev.band === "moderate" ? "Some" : "Weak";
  switch (ev.leaning) {
    case "supports": return `${strength} evidence backs this up`;
    case "contradicts": return `${strength} evidence goes against this`;
    case "mixed": return "Trusted sources disagree";
    default: return "Most of this couldn't be confirmed by trusted sources";
  }
}

/** Long explanations: first two sentences, then "Read more". */
function Expandable({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  const short = sentences.slice(0, 2).join("").trim();
  const long = sentences.length > 2 && text.length > 220;
  return (
    <p className="text-[15px] leading-7 text-slate-800">
      {open || !long ? text : short}{" "}
      {long && <button type="button" onClick={() => setOpen((o) => !o)} className="font-medium text-blue-800 hover:underline">{open ? "Show less" : "Read more"}</button>}
    </p>
  );
}

function ClaimRow({ c }: { c: ClaimResult }) {
  const [open, setOpen] = useState(false);
  const best = c.evidence.filter((e) => e.stance && e.stance !== "irrelevant").sort((a, b) => a.tier - b.tier)[0];
  return (
    <li>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-slate-50">
        <Pill cls={VERDICT[c.verdict].badge}><span aria-hidden>{VERDICT[c.verdict].icon}</span>{VERDICT[c.verdict].text}</Pill>
        <span className="min-w-0 flex-1 leading-snug text-slate-800">{c.text}</span>
        <IChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="tc-fade space-y-2 bg-slate-50 px-4 pb-3 pt-1 text-sm">
          <p className="leading-relaxed text-slate-700">{c.why.replace(/\s*\[e\d+(,\s*e\d+)*\]/g, "")}</p>
          {best ? (
            <a href={best.url} target="_blank" rel="noopener noreferrer nofollow" className="block rounded-xl border border-slate-200 bg-white p-2.5 hover:border-slate-300">
              <span className="flex items-center gap-2 text-xs text-slate-600"><span className={`rounded-full border px-1.5 py-0.5 font-semibold ${TIER[best.tier].cls}`}>{TIER[best.tier].short}</span>{best.domain}<IExternal className="ml-auto h-3.5 w-3.5" /></span>
              {best.quote ? <span className="mt-1 block italic text-slate-800">“{best.quote}”</span> : <span className="mt-1 block text-slate-800">{best.title}</span>}
            </a>
          ) : c.verdict !== "not_checkable" && <p className="text-xs text-slate-500">No trusted source addressed this one.</p>}
        </div>
      )}
    </li>
  );
}

function CheckSummary({ r }: { r: CheckResult }) {
  const o = OVERALL[r.label];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${o.badge}`}><span aria-hidden>{o.icon}</span>{o.text}</span>
        {evidenceLine(r) && <span className="text-sm text-slate-600">{evidenceLine(r)}</span>}
        {r.hypeFlags.length > 0 && <Pill cls="bg-orange-100 text-orange-900 border-orange-700">⚑ Pressure words: {r.hypeFlags.slice(0, 3).join(", ")}</Pill>}
      </div>
      <Expandable text={r.whyOverall} />
      {r.claims.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <p className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">What we checked <span className="font-normal text-slate-500">Tap a claim to see why</span></p>
          <ul className="divide-y divide-slate-100">
            {r.claims.slice(0, 5).map((c) => <ClaimRow key={c.id} c={c} />)}
          </ul>
          {r.claims.length > 5 && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">+{r.claims.length - 5} more in the full report</p>}
        </div>
      )}
    </div>
  );
}

function Thinking({ turn }: { turn: Turn }) {
  const items = visibleActivity(turn.activity);
  const last = items[items.length - 1];
  const doneSteps = new Set(turn.activity.filter((e) => e.status === "done").map((e) => e.stage)).size;
  const total = TOTAL_STEPS[turn.mode];
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="flex items-center gap-2 text-[15px] font-medium">
        <span className="tc-shimmer">{last?.message ?? (turn.mode === "market" ? "Starting the research…" : "Getting started…")}</span>
        <span aria-hidden className="inline-flex gap-0.5 text-slate-400"><span className="tc-dot">•</span><span className="tc-dot [animation-delay:0.15s]">•</span><span className="tc-dot [animation-delay:0.3s]">•</span></span>
      </p>
      {total && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(doneSteps, total)} aria-label="Progress">
            <div className="h-full rounded-full bg-gradient-to-r from-[#2563eb] to-[#7c3aed] transition-all duration-500" style={{ width: `${Math.max(6, Math.min(100, (doneSteps / total) * 100))}%` }} />
          </div>
          <span className="text-xs text-slate-500">Step {Math.min(doneSteps + 1, total)} of {total}</span>
        </div>
      )}
      <ul className="space-y-1">
        {items.filter((e) => e.status === "done").slice(-3).map((e, i) => (
          <li key={i} className="flex items-center gap-2 text-[13px] text-slate-600"><ICheck className="h-3.5 w-3.5 text-emerald-600" /><span className="font-medium text-slate-700">{STAGE_LABEL[e.stage] ?? e.stage}:</span> <span className="truncate">{e.message}</span></li>
        ))}
      </ul>
    </div>
  );
}

const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s);

export type FollowUp = { label: string; run: () => void };

interface Props {
  turn: Turn;
  selected: boolean;
  isLatest: boolean;
  followUps: FollowUp[];
  onSelect: (tab: "activity" | "result") => void;
  onRetry: () => void;
  onCheck: (t: string) => void;
  onScamPlan: (res: ScamPlanResponse, summary: string) => void;
}

function plainText(turn: Turn): string {
  const r = turn.result;
  if (!r) return turn.prompt;
  if (r.kind === "check") return [`${OVERALL[r.check.label].text}: ${r.check.whyOverall}`, ...r.check.claims.map((c) => `- ${VERDICT[c.verdict].text}: ${c.text}`), "", "Checked with TrustCheck. Evidence, not financial advice."].join("\n");
  if (r.kind === "market") return [r.brief.subject?.name ?? turn.prompt, r.brief.outlook?.headline ?? "", ...r.brief.drivers.map((d) => `- ${d.headline}`)].join("\n");
  if (r.kind === "scamsos") return r.plan.summary;
  if (r.kind === "email") return [r.email.label, ...r.email.signals.map((s) => `- ${s.title}`)].join("\n");
  return r.items.map((i) => `- ${i.source}: ${i.title}`).join("\n");
}

function CopyShare({ turn }: { turn: Turn }) {
  const [msg, setMsg] = useState("");
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2000); };
  const copy = async (text: string, ok: string) => { try { await navigator.clipboard.writeText(text); flash(ok); } catch { flash("Couldn't copy"); } };
  const btn = "inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-100";
  return (
    <>
      <button type="button" onClick={() => copy(plainText(turn), "Copied")} className={btn}>Copy</button>
      {turn.mode === "check" && turn.checkId && <button type="button" onClick={() => copy(`${window.location.origin}/#/check/${turn.checkId}`, "Link copied")} className={btn}>Share link</button>}
      <span role="status" className="self-center text-xs text-emerald-700">{msg}</span>
    </>
  );
}

export default function TurnView({ turn, selected, isLatest, followUps, onSelect, onRetry, onCheck, onScamPlan }: Props) {
  const r = turn.result;
  const MI = MODES[turn.mode].icon;
  return (
    <div className="tc-fade space-y-4">
      {turn.mode !== "scamsos" && (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-3xl bg-slate-100 px-4 py-2.5 text-[15px] leading-6">
            {turn.mode !== "check" && <span className="mb-0.5 flex items-center gap-1 text-xs font-medium text-slate-500"><MI className="h-3.5 w-3.5" />{MODES[turn.mode].label}</span>}
            {isUrl(turn.prompt) ? (
              <a href={turn.prompt} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 break-all text-blue-800 underline decoration-blue-300 underline-offset-2">
                <ILink className="h-4 w-4 shrink-0" />{turn.prompt}
              </a>
            ) : <span className="whitespace-pre-wrap break-words">{turn.prompt}</span>}
          </div>
        </div>
      )}
      <div className="flex gap-3">
        <Logo size="h-7 w-7" />
        <div className="@container min-w-0 flex-1 pt-0.5">
          {turn.status === "awaiting" && turn.mode === "scamsos" && (
            <div className="rounded-2xl border border-slate-200 p-4"><p className="mb-3 text-[15px] font-semibold">I'm sorry this happened. Let's work out what to do, step by step.</p><ScamForm onPlan={onScamPlan} /></div>
          )}
          {turn.status === "running" && <Thinking turn={turn} />}
          {turn.status === "error" && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <IAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
              <div className="space-y-2">
                <p className="text-[15px] text-rose-900">{turn.error}</p>
                <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-white px-3 py-1 text-sm font-medium text-rose-900 hover:bg-rose-100"><IRefresh className="h-3.5 w-3.5" /> Try again</button>
              </div>
            </div>
          )}
          {turn.status === "done" && r?.kind === "check" && <CheckSummary r={r.check} />}
          {turn.status === "done" && r?.kind === "market" && (
            r.brief.supported ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-600">{r.brief.subject?.name}{r.brief.subject?.ticker ? ` · ${r.brief.subject.ticker}` : ""}</p>
                {r.brief.outlook && <p className="text-[17px] font-semibold leading-snug">{r.brief.outlook.headline}</p>}
                {r.brief.drivers.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 p-3">
                    <p className="mb-1.5 text-xs font-semibold text-slate-600">What's moving it</p>
                    <ul className="space-y-1 text-sm">{r.brief.drivers.slice(0, 4).map((d) => <li key={d.headline} className="flex gap-2"><span aria-hidden className={d.direction === "up" ? "text-emerald-700" : d.direction === "down" ? "text-rose-700" : "text-amber-700"}>{d.direction === "up" ? "▲" : d.direction === "down" ? "▼" : "◐"}</span>{d.headline}</li>)}</ul>
                  </div>
                )}
                <p className="text-xs text-slate-500">{r.brief.sources.length} sources cited · information, not advice</p>
              </div>
            ) : <p className="text-[15px]">{r.brief.message}</p>
          )}
          {turn.status === "done" && r?.kind === "scamsos" && (
            <div className="space-y-3">
              <p className="text-[15px] leading-7">{r.plan.gentle}</p>
              {r.plan.supportive && <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-950">💜 {r.plan.supportive}</p>}
              <div className="rounded-2xl border border-rose-200 p-3">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-rose-700">Do these now</p>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-snug">{r.plan.plan.now.map((s) => <li key={s.id}>{s.text}</li>)}</ol>
              </div>
              <p className="text-xs text-slate-500">The full plan, official links and a summary you can copy for your bank are in the full report.</p>
            </div>
          )}
          {turn.status === "done" && r?.kind === "email" && (
            <div className="space-y-3">
              <p className="text-[17px] font-bold"><span aria-hidden>{LABEL_TONE[r.email.label].icon}</span> {r.email.label}</p>
              <ul className="space-y-1.5 text-sm">
                {bySeverity(r.email.signals).filter((s) => s.severity !== "info").slice(0, 4).map((s, i) => <li key={i} className="flex items-start gap-2"><Pill cls={SEV[s.severity].cls}>{SEV[s.severity].text}</Pill><span>{s.title}</span></li>)}
              </ul>
              {r.check ? <div className="border-t border-slate-200 pt-3"><p className="mb-2 text-xs font-semibold text-slate-600">Claims in the email</p><CheckSummary r={r.check} /></div>
                : r.email.checkId ? <p className="tc-shimmer text-sm">Now checking the claims in the email…</p> : null}
            </div>
          )}
          {turn.status === "done" && r?.kind === "news" && <NewsList items={r.items} onCheck={onCheck} limit={6} />}
          {turn.status === "done" && !r && <p className="text-sm text-slate-600">This report is no longer stored in this browser.</p>}

          {turn.status !== "awaiting" && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {turn.status === "done" && r && (
                <button type="button" onClick={() => onSelect("result")} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:bg-slate-100 ${selected ? "border-slate-400 bg-slate-100" : "border-slate-200"}`}>
                  <IFile className="h-3.5 w-3.5" /> Full report
                </button>
              )}
              <button type="button" onClick={() => onSelect("activity")} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-100">
                <IActivity className="h-3.5 w-3.5" /> How we checked · {visibleActivity(turn.activity).length} steps
              </button>
              {turn.status === "done" && r && <CopyShare turn={turn} />}
            </div>
          )}
          {isLatest && turn.status === "done" && followUps.length > 0 && (
            <div className="tc-fade mt-4">
              <p className="mb-1.5 text-xs font-medium text-slate-500">What next?</p>
              <div className="flex flex-wrap gap-2">
                {followUps.map((f) => (
                  <button key={f.label} type="button" onClick={f.run} className="rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-left text-sm font-medium text-blue-900 transition hover:border-blue-300 hover:bg-blue-100">{f.label} →</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
