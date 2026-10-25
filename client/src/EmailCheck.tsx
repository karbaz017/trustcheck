import type { EmailCheckResponse, EmailSignal } from "./api";

export const SEV: Record<EmailSignal["severity"], { icon: string; text: string; cls: string }> = {
  high: { icon: "▲", text: "High", cls: "bg-rose-100 text-rose-900 border-rose-700" },
  warn: { icon: "●", text: "Warning", cls: "bg-amber-100 text-amber-900 border-amber-700" },
  info: { icon: "○", text: "Note", cls: "bg-slate-100 text-slate-800 border-slate-500" },
};
// Deliberately never green: no warning signs found is not a clean bill of health.
export const LABEL_TONE: Record<EmailCheckResponse["label"], { icon: string; cls: string }> = {
  "Several warning signs": { icon: "▲", cls: "bg-rose-50 border-rose-300" },
  "Some warning signs": { icon: "●", cls: "bg-amber-50 border-amber-300" },
  "No strong warning signs found in this file": { icon: "○", cls: "bg-slate-50 border-slate-300" },
};
const order = ["high", "warn", "info"];
/** Most serious first, so a short summary never drops a "High" for a "Warning". */
export const bySeverity = (signals: EmailSignal[]) => [...signals].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

/** Full email signals, shown in the artifact panel. */
export function EmailSignalsView({ res }: { res: EmailCheckResponse }) {
  const tone = LABEL_TONE[res.label];
  return (
    <div className="space-y-4">
      <section className={`rounded-2xl border-2 p-4 ${tone.cls}`}>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Email signals</p>
        <h2 className="mt-1 text-xl font-extrabold"><span aria-hidden>{tone.icon}</span> {res.label}</h2>
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm @lg:grid-cols-[auto_1fr]">
          <dt className="font-semibold">From</dt><dd className="break-all">{res.meta.from || "(none)"}</dd>
          <dt className="font-semibold">Subject</dt><dd className="break-words">{res.meta.subject || "(none)"}</dd>
          <dt className="font-semibold">Links</dt><dd>{res.meta.linkCount} (never visited)</dd>
          <dt className="font-semibold">Attachments</dt>
          <dd>{res.meta.attachments.length ? res.meta.attachments.map((a) => a.filename).join(", ") + " (never opened)" : "none"}</dd>
        </dl>
        <ul className="mt-3 space-y-2">
          {bySeverity(res.signals).map((s, i) => (
            <li key={i} className="rounded-lg border border-slate-300 bg-white p-3 text-sm">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${SEV[s.severity].cls}`}><span aria-hidden>{SEV[s.severity].icon}</span> {SEV[s.severity].text}</span>
              <p className="mt-1.5 font-semibold">{s.title}</p>
              <p className="mt-0.5 text-slate-700">{s.detail}</p>
              <p className="mt-1.5 break-all rounded bg-slate-100 px-2 py-1 font-mono text-xs">{s.evidence}</p>
            </li>
          ))}
          {res.signals.length === 0 && <li className="text-sm">No warning signs were detected in the headers, links or attachments.</li>}
        </ul>
      </section>
      <div className="rounded-xl border border-slate-300 bg-white p-4 text-sm">
        <h3 className="font-extrabold">Limits of this check</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">{res.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </div>
    </div>
  );
}
