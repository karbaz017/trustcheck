import type { MarketBrief } from "./api";
import { TIER } from "./labels";

type Brief = MarketBrief;
const DIR = {
  up: { icon: "▲", text: "Upward pressure", cls: "bg-emerald-100 text-emerald-900 border-emerald-700" },
  down: { icon: "▼", text: "Downward pressure", cls: "bg-rose-100 text-rose-900 border-rose-700" },
  mixed: { icon: "◐", text: "Mixed", cls: "bg-amber-100 text-amber-900 border-amber-700" },
  unclear: { icon: "?", text: "Unclear", cls: "bg-slate-100 text-slate-800 border-slate-500" },
} as const;
const VERDICT = {
  leans_toward: { icon: "↗", text: "Factors lean toward the prediction", cls: "bg-emerald-50 border-emerald-300" },
  leans_against: { icon: "↘", text: "Factors lean against the prediction", cls: "bg-rose-50 border-rose-300" },
  mixed: { icon: "◐", text: "Factors are mixed", cls: "bg-amber-50 border-amber-300" },
  insufficient: { icon: "?", text: "Not enough sourced factors", cls: "bg-slate-50 border-slate-300" },
  no_prediction: { icon: "⇅", text: "Balance of factors", cls: "bg-blue-50 border-blue-300" },
} as const;

function Cites({ ids, brief }: { ids: string[]; brief: Brief }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => {
        const s = brief.sources.find((x) => x.id === id);
        if (!s) return null;
        return (
          <a key={id} href={s.url} target="_blank" rel="noopener noreferrer nofollow" title={`${s.domain} (${TIER[s.tier].text})`}
            className="rounded border border-slate-300 px-1 font-mono text-[10px] text-slate-600 hover:bg-slate-100">{id.toUpperCase()}</a>
        );
      })}
    </span>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-300 bg-white p-4 @lg:p-5">
      <h2 className="text-lg font-extrabold">{title}</h2>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Full market briefing, shown in the artifact panel. */
export function MarketBriefView({ brief }: { brief: Brief }) {
  const o = brief.outlook;
  const total = o ? o.upWeight + o.downWeight : 0;
  if (!brief.supported) return <p className="rounded-lg border border-slate-300 bg-slate-50 p-4">{brief.message}</p>;
  return (
        <div className="space-y-5">
          <p role="note" className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-sm font-medium text-amber-950">⚠ {brief.disclaimer}</p>

          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-2xl font-extrabold">{brief.subject?.name}</h2>
            {brief.subject?.ticker && <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-sm font-bold text-white">{brief.subject.ticker}</span>}
            <span className="text-sm capitalize text-slate-600">{brief.subject?.assetType}</span>
            <span className="text-xs text-slate-500">Retrieved {new Date(brief.generatedAt).toLocaleString()}</span>
          </div>

          {o && (
            <section className={`rounded-2xl border-2 p-5 ${VERDICT[o.verdict].cls}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-600"><span aria-hidden>{VERDICT[o.verdict].icon}</span> {VERDICT[o.verdict].text}</p>
              <p className="mt-1 text-xl font-extrabold leading-snug">{o.headline}</p>
              {total > 0 && (
                <div className="mt-3" aria-label={`Upward pressure weight ${o.upWeight}, downward pressure weight ${o.downWeight}`}>
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-200" aria-hidden>
                    <div className="bg-emerald-600" style={{ width: `${(o.upWeight / total) * 100}%` }} />
                    <div className="bg-rose-600" style={{ width: `${(o.downWeight / total) * 100}%` }} />
                  </div>
                  <p className="mt-1 flex justify-between text-xs font-semibold"><span>▲ Upward {o.upWeight}</span><span>▼ Downward {o.downWeight}</span></p>
                </div>
              )}
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{o.why.map((w) => <li key={w}>{w}</li>)}</ul>
              <p className="mt-3 text-xs text-slate-700">{o.caveat}</p>
            </section>
          )}

          {brief.snapshot.length > 0 && (
            <Section title="Snapshot" sub="As reported by the cited sources. Quotes may be delayed.">
              <dl className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
                {brief.snapshot.map((s) => (
                  <div key={s.label} className="rounded-lg border border-slate-200 p-3">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">{s.label}</dt>
                    <dd className="mt-1 text-lg font-bold leading-tight">{s.value}</dd>
                    <dd className="mt-1 text-xs text-slate-600">{s.asOf && <>as of {s.asOf} </>}<Cites ids={s.sourceIds} brief={brief} /></dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {brief.drivers.length > 0 && (
            <Section title="What's moving it" sub="Each driver is tagged with the pressure it puts on the price, according to the sources.">
              <ul className="space-y-3">
                {brief.drivers.map((d) => (
                  <li key={d.headline} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${DIR[d.direction].cls}`}><span aria-hidden>{DIR[d.direction].icon}</span> {DIR[d.direction].text}</span>
                    {d.timeframe && <span className="ml-2 text-xs text-slate-600">{d.timeframe}</span>}
                    <p className="mt-1.5 font-semibold">{d.headline}</p>
                    <p className="mt-0.5 text-slate-700">{d.explanation}<Cites ids={d.sourceIds} brief={brief} /></p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(brief.bullCase.length > 0 || brief.bearCase.length > 0) && (
            <div className="grid gap-4 @2xl:grid-cols-2">
              <Section title="What supporters point to">
                <ul className="list-disc space-y-1.5 pl-5 text-sm">{brief.bullCase.map((b) => <li key={b.point}>{b.point}<Cites ids={b.sourceIds} brief={brief} /></li>)}</ul>
                {!brief.bullCase.length && <p className="text-sm text-slate-600">Nothing sourced.</p>}
              </Section>
              <Section title="What critics point to">
                <ul className="list-disc space-y-1.5 pl-5 text-sm">{brief.bearCase.map((b) => <li key={b.point}>{b.point}<Cites ids={b.sourceIds} brief={brief} /></li>)}</ul>
                {!brief.bearCase.length && <p className="text-sm text-slate-600">Nothing sourced.</p>}
              </Section>
            </div>
          )}

          {brief.fundamentals.length > 0 && (
            <Section title="Fundamentals">
              <table className="w-full text-sm">
                <tbody>{brief.fundamentals.map((f) => (
                  <tr key={f.label} className="border-b border-slate-200 last:border-0">
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-700">{f.label}</th>
                    <td className="py-2 text-right font-semibold">{f.value}<Cites ids={f.sourceIds} brief={brief} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </Section>
          )}

          {brief.analysts.length > 0 && (
            <Section title="What analysts say" sub="Reported as the sources state it. Not our view, and not a recommendation.">
              <ul className="list-disc space-y-1.5 pl-5 text-sm">{brief.analysts.map((a) => <li key={a.statement}>{a.statement}<Cites ids={a.sourceIds} brief={brief} /></li>)}</ul>
            </Section>
          )}

          <div className="grid gap-4 @2xl:grid-cols-2">
            {brief.upcoming.length > 0 && (
              <Section title="Coming up">
                <ul className="space-y-1.5 text-sm">{brief.upcoming.map((u) => <li key={u.event}><span className="font-semibold">{u.date ?? "Date TBA"}</span> · {u.event}<Cites ids={u.sourceIds} brief={brief} /></li>)}</ul>
              </Section>
            )}
            {brief.risks.length > 0 && (
              <Section title="Risks the sources mention">
                <ul className="list-disc space-y-1.5 pl-5 text-sm">{brief.risks.map((r) => <li key={r.point}>{r.point}<Cites ids={r.sourceIds} brief={brief} /></li>)}</ul>
              </Section>
            )}
          </div>

          {brief.notFound.length > 0 && <p className="text-sm text-slate-600">Not found in sources: {brief.notFound.join("; ")}</p>}

          <Section title="Sources">
            <ol className="space-y-1.5 text-sm">
              {brief.sources.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{s.id.toUpperCase()}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${TIER[s.tier].cls}`}>{TIER[s.tier].short}</span>
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-blue-800 underline">{s.domain}</a>
                </li>
              ))}
            </ol>
          </Section>

          <div className="grid gap-4 @2xl:grid-cols-2">
            <Section title="Limits of this briefing">
              <ul className="list-disc space-y-1.5 pl-5 text-sm">{brief.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
            </Section>
            <Section title="Questions to ask before acting">
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                <li>Does this fit my goals, timeline, and how much I could afford to lose?</li>
                <li>Am I reacting to one headline, or to the full picture?</li>
                <li>What would make me change my mind, and how would I know?</li>
                <li>Would I be comfortable explaining this decision to someone I trust?</li>
              </ul>
            </Section>
          </div>
        </div>
  );
}
