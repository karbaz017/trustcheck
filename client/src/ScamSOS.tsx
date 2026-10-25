import { useState } from "react";
import { getScamPlan, type ScamPlanResponse, type ScamStep } from "./api";
import { QUESTIONS } from "../../server/src/addons/scamsos/questions";

export type { ScamPlanResponse };
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

/** The five questions, shown inline in the chat. */
export function ScamForm({ onPlan }: { onPlan: (res: ScamPlanResponse, summary: string) => void }) {
  const [ans, setAns] = useState<Record<string, string>>({});
  const [happened, setHappened] = useState<string[]>([]);
  const [distress, setDistress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const complete = happened.length > 0 && ["method", "amount", "when", "contact"].every((k) => ans[k]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await getScamPlan({ happened, method: ans.method, amount: ans.amount, when: ans.when, contact: ans.contact, distress });
      const label = (k: string, id: string) => QUESTIONS.find((q) => q.key === k)?.options.find((o) => o.id === id)?.label ?? id;
      onPlan(res, [happened.map((h) => label("happened", h)).join(", "), label("method", ans.method), label("amount", ans.amount), label("when", ans.when), label("contact", ans.contact)].join(" · "));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-700">Take a breath. Answer five quick questions and you'll get a calm, ordered plan. Nothing you enter here is saved on our server.</p>
      {QUESTIONS.map((q, i) => (
        <fieldset key={q.key}>
          <legend className="text-sm font-bold"><span className="mr-1 text-slate-500">{i + 1}.</span>{q.label}{q.multi && <span className="ml-2 text-xs font-normal text-slate-600">(choose all that apply)</span>}</legend>
          <div className="mt-1.5 grid gap-1.5 @lg:grid-cols-2">
            {q.options.map((o) => {
              const checked = q.multi ? happened.includes(o.id) : ans[q.key] === o.id;
              return (
                <label key={o.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${checked ? "border-blue-700 bg-blue-50 font-semibold" : "border-slate-300 hover:bg-slate-50"}`}>
                  <input type={q.multi ? "checkbox" : "radio"} name={q.key} value={o.id} checked={checked} className="h-4 w-4 accent-blue-800"
                    onChange={() => (q.multi ? setHappened((h) => (h.includes(o.id) ? h.filter((x) => x !== o.id) : [...h, o.id])) : setAns((a) => ({ ...a, [q.key]: o.id })))} />
                  {o.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-sm">
        <input type="checkbox" checked={distress} onChange={(e) => setDistress(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-800" />
        <span>I'm feeling overwhelmed or unsafe right now <span className="text-slate-600">(optional)</span></span>
      </label>
      <button type="submit" disabled={!complete || busy} className="rounded-lg bg-[#1e40af] px-4 py-2 font-semibold text-[#fff] disabled:cursor-not-allowed disabled:bg-slate-400">
        {busy ? "Putting your plan together…" : "Show my plan"}
      </button>
      {err && <p role="alert" className="text-sm text-rose-800">{err}</p>}
    </form>
  );
}

/** The full plan, shown in the artifact panel. */
export function ScamPlanView({ res }: { res: ScamPlanResponse }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(res.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      document.getElementById("scam-summary")?.focus();
    }
  }
  return (
    <section className="space-y-5">
      {res.supportive && <p role="note" className="rounded-xl border border-violet-300 bg-violet-50 p-4 text-violet-950">💜 {res.supportive}</p>}
      <p className="rounded-xl border border-teal-300 bg-teal-50 p-4 font-medium text-teal-950">{res.gentle}</p>
      {res.signs.length > 0 && (
        <div className="rounded-xl border border-slate-300 bg-white p-4 text-sm">
          <h3 className="font-bold">What your answers suggest</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">{res.signs.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
      {TIERS.map((t) => res.plan[t.key].length > 0 && (
        <div key={t.key}>
          <h3 className="text-lg font-extrabold">{t.title} <span className="text-sm font-medium text-slate-600">· {t.sub}</span></h3>
          <ol className="mt-2 space-y-2">
            {res.plan[t.key].map((s, i) => (
              <li key={s.id} className={`rounded-xl border border-l-8 border-slate-200 bg-white p-3 ${t.cls}`}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={!!done[s.id]} onChange={(e) => setDone((d) => ({ ...d, [s.id]: e.target.checked }))} className="mt-1 h-5 w-5 shrink-0 accent-emerald-700" />
                  <span className={`text-sm leading-relaxed ${done[s.id] ? "text-slate-500 line-through" : ""}`}><span className="mr-1 font-bold">{i + 1}.</span>{s.text}</span>
                </label>
                <div className="pl-8"><Source s={s} /></div>
              </li>
            ))}
          </ol>
        </div>
      ))}
      <div className="rounded-xl border border-slate-300 bg-white p-4">
        <h3 className="font-extrabold">Case summary you can copy</h3>
        <p className="text-sm text-slate-700">Paste it into a message to your bank or a report form. Fill in the "(add)" parts yourself.</p>
        <label htmlFor="scam-summary" className="sr-only">Case summary</label>
        <textarea id="scam-summary" readOnly value={res.summary} rows={12} className="mt-2 w-full rounded-lg border border-slate-400 bg-slate-50 p-3 font-mono text-xs" />
        <button type="button" onClick={copy} className="mt-2 rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-semibold hover:bg-slate-100">Copy summary</button>
        <span role="status" className="ml-3 text-xs text-slate-600">{copied ? "✓ Copied" : ""}</span>
      </div>
      <p className="text-xs text-slate-600">{res.disclaimer}{res.rephrased ? " Step wording was softened by AI; the steps themselves come from a fixed checklist." : ""}</p>
    </section>
  );
}
