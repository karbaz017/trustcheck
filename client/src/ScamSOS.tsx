import { useState } from "react";
import { getScamPlan, type ScamPlanResponse, type ScamStep } from "./api";
import { QUESTIONS } from "../../server/src/addons/scamsos/questions";

const TIERS: { key: "now" | "today" | "this_week"; title: string; sub: string; cls: string }[] = [
  { key: "now", title: "Now", sub: "The next 10 minutes", cls: "border-l-rose-500" },
  { key: "today", title: "Today", sub: "When you've done the first steps", cls: "border-l-amber-500" },
  { key: "this_week", title: "This week", sub: "No rush, but don't skip these", cls: "border-l-blue-500" },
];

function Source({ s }: { s: ScamStep }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {s.ownProvider && <span className="rounded-full border border-teal-700 bg-teal-100 px-2.5 py-0.5 font-semibold text-teal-900">☎ Use the number on your card or your official app</span>}
      {s.sourceUrl && (
        <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-800 underline">
          Learn more: {new URL(s.sourceUrl).hostname.replace(/^www\./, "")} <span aria-hidden>↗</span>
        </a>
      )}
    </div>
  );
}

export default function ScamSOS() {
  const [ans, setAns] = useState<Record<string, string>>({});
  const [happened, setHappened] = useState<string[]>([]);
  const [distress, setDistress] = useState(false);
  const [res, setRes] = useState<ScamPlanResponse | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const complete = happened.length > 0 && ["method", "amount", "when", "contact"].every((k) => ans[k]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(""); setDone({});
    try {
      setRes(await getScamPlan({ happened, method: ans.method, amount: ans.amount, when: ans.when, contact: ans.contact, distress }));
      setTimeout(() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!res) return;
    try {
      await navigator.clipboard.writeText(res.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      document.getElementById("summary")?.focus();
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0f766e] to-[#1e40af] p-6 text-[#fff] sm:p-8">
        <h1 className="text-3xl font-extrabold tracking-tight">ScamSOS</h1>
        <p className="mt-2 max-w-xl text-[#e0f2fe]">Think you were scammed? Take a breath. Answer five quick questions and get a calm, ordered plan and a summary you can copy for your bank.</p>
        <p className="mt-3 text-sm text-[#ccfbf1]">Nothing you enter here is saved.</p>
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-6">
        {QUESTIONS.map((q, i) => (
          <fieldset key={q.key}>
            <legend className="text-base font-bold"><span className="mr-2 text-slate-500">{i + 1}.</span>{q.label}{q.multi && <span className="ml-2 text-xs font-normal text-slate-600">(choose all that apply)</span>}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {q.options.map((o) => {
                const checked = q.multi ? happened.includes(o.id) : ans[q.key] === o.id;
                return (
                  <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${checked ? "border-blue-700 bg-blue-50 font-semibold" : "border-slate-300 hover:bg-slate-50"}`}>
                    <input type={q.multi ? "checkbox" : "radio"} name={q.key} value={o.id} checked={checked} className="h-4 w-4 accent-blue-800"
                      onChange={() => q.multi ? setHappened((h) => (h.includes(o.id) ? h.filter((x) => x !== o.id) : [...h, o.id])) : setAns((a) => ({ ...a, [q.key]: o.id }))} />
                    {o.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm">
          <input type="checkbox" checked={distress} onChange={(e) => setDistress(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-800" />
          <span>I'm feeling overwhelmed or unsafe right now <span className="text-slate-600">(optional)</span></span>
        </label>
        <button type="submit" disabled={!complete || busy} className="w-full rounded-lg bg-[#1e40af] px-4 py-3 font-semibold text-[#fff] disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto">
          {busy ? "Putting your plan together…" : "Show my plan"}
        </button>
        {err && <p role="alert" className="rounded-lg border border-rose-700 bg-rose-50 p-3 text-rose-900">{err}</p>}
      </form>

      {res && (
        <section id="plan" aria-labelledby="plan-h" className="space-y-5">
          <h2 id="plan-h" className="sr-only">Your plan</h2>
          {res.supportive && <p role="note" className="rounded-xl border border-violet-300 bg-violet-50 p-4 text-violet-950">💜 {res.supportive}</p>}
          <p className="rounded-xl border border-teal-300 bg-teal-50 p-4 text-lg font-medium text-teal-950">{res.gentle}</p>

          {res.signs.length > 0 && (
            <div className="rounded-xl border border-slate-300 bg-white p-4 text-sm">
              <h3 className="font-bold">What your answers suggest</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">{res.signs.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}

          {TIERS.map((t) => res.plan[t.key].length > 0 && (
            <div key={t.key}>
              <h3 className="text-xl font-extrabold">{t.title} <span className="text-sm font-medium text-slate-600">· {t.sub}</span></h3>
              <ol className="mt-3 space-y-3">
                {res.plan[t.key].map((s, i) => (
                  <li key={s.id} className={`rounded-xl border border-l-8 border-slate-200 bg-white p-4 ${t.cls}`}>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input type="checkbox" checked={!!done[s.id]} onChange={(e) => setDone((d) => ({ ...d, [s.id]: e.target.checked }))} className="mt-1 h-5 w-5 shrink-0 accent-emerald-700" />
                      <span className={`text-[15px] leading-relaxed ${done[s.id] ? "text-slate-500 line-through" : ""}`}><span className="mr-1 font-bold">{i + 1}.</span>{s.text}</span>
                    </label>
                    <div className="pl-8"><Source s={s} /></div>
                  </li>
                ))}
              </ol>
            </div>
          ))}

          <div className="rounded-xl border border-slate-300 bg-white p-4">
            <h3 className="text-lg font-extrabold">Case summary you can copy</h3>
            <p className="text-sm text-slate-700">Paste it into a message to your bank or a report form. Fill in the "(add)" parts yourself.</p>
            <label htmlFor="summary" className="sr-only">Case summary</label>
            <textarea id="summary" readOnly value={res.summary} rows={14} className="mt-2 w-full rounded-lg border border-slate-400 bg-slate-50 p-3 font-mono text-xs" />
            <button type="button" onClick={copy} className="mt-2 rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-semibold hover:bg-slate-100">🔗 Copy summary</button>
            <span role="status" className="ml-3 text-xs text-slate-600">{copied ? "✓ Copied" : ""}</span>
          </div>

          <p className="text-xs text-slate-600">{res.disclaimer}{res.rephrased ? " Step wording was softened by AI; the steps themselves come from a fixed checklist." : ""}</p>
        </section>
      )}
    </div>
  );
}
