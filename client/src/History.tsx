import { useEffect, useState } from "react";
import { deleteCheck, getHistory, type HistoryItem } from "./api";
import { BAND, OVERALL } from "./labels";

export default function History() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { getHistory().then(setItems).catch((e) => setErr(e.message)); }, []);
  if (err) return <p role="alert" className="text-rose-800">{err}</p>;
  if (!items) return <p>Loading…</p>;
  if (items.length === 0) return <p>No saved checks yet. Checks you run while logged in show up here.</p>;
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.id} className="flex flex-col gap-2 rounded-xl border border-slate-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <a href={`#/check/${i.id}`} className="block truncate font-medium text-blue-800 underline">{i.preview || "(no preview)"}</a>
            <p className="text-xs text-slate-600">
              {new Date(i.createdAt).toLocaleString()} · {i.claimCount} claim{i.claimCount === 1 ? "" : "s"}
              {i.label && <> · {OVERALL[i.label].icon} {OVERALL[i.label].text}</>}
              {(i.evidence ?? i.strength) && <> · Evidence {BAND[(i.evidence ?? i.strength)!.band].toLowerCase()}</>}
            </p>
          </div>
          <button
            className="self-start rounded-lg border border-slate-400 px-3 py-1.5 text-sm hover:bg-slate-100"
            onClick={async () => { await deleteCheck(i.id); setItems((cur) => cur?.filter((x) => x.id !== i.id) ?? null); }}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
