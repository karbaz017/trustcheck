import type { NewsItem } from "./newsStore";
import { TIER } from "./labels";

export const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** Headline list with a one-click check. */
export function NewsList({ items, newIds, onCheck, limit }: { items: NewsItem[]; newIds?: Set<string>; onCheck: (title: string) => void; limit?: number }) {
  if (!items.length) return <p className="rounded-lg bg-slate-100 p-3 text-sm">No headlines from reliable sources in the last 24 hours.</p>;
  return (
    <ul className="space-y-2">
      {items.slice(0, limit ?? items.length).map((n) => (
        <li key={n.id} className={`rounded-xl border bg-white p-3 ${newIds?.has(n.id) ? "border-orange-500 ring-1 ring-orange-500" : "border-slate-200"}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {newIds?.has(n.id) && <span className="rounded-full bg-orange-100 px-2 py-0.5 font-bold text-orange-900">NEW</span>}
            <span className={`rounded-full border px-2 py-0.5 font-semibold ${TIER[n.tier].cls}`}>{n.kind === "filing" ? "Official filing" : TIER[n.tier].short}</span>
            <span className="font-semibold">{n.source}</span>
            <span className="text-slate-500">· {ago(n.publishedAt)}</span>
            <span className="ml-auto rounded-full border border-slate-300 px-2 py-0.5 text-slate-600">{n.topic}</span>
          </div>
          <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 block text-sm font-semibold leading-snug text-blue-800 underline decoration-blue-300 underline-offset-2">{n.title} <span aria-hidden>↗</span></a>
          <button type="button" onClick={() => onCheck(n.title)} className="mt-2 rounded-lg border border-slate-400 px-2.5 py-1 text-xs font-semibold hover:bg-slate-100">Check this headline</button>
        </li>
      ))}
    </ul>
  );
}
