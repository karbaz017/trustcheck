import type { ProgressEvent, StageName } from "../../server/src/types";

const STEPS: { label: string; stages: StageName[] }[] = [
  { label: "Extracting claims", stages: ["fetch", "extract"] },
  { label: "Checking the math", stages: ["math"] },
  { label: "Searching sources", stages: ["search", "tier"] },
  { label: "Weighing evidence", stages: ["stance", "verdict"] },
  { label: "Writing it up", stages: ["hype", "aggregate", "explain"] },
];

export type StageState = Partial<Record<StageName, "start" | "done" | "error">>;

export function applyEvent(s: StageState, e: ProgressEvent): StageState {
  if (e.stage === "done" || e.stage === "error") return s;
  return { ...s, [e.stage]: e.status };
}

type Status = "done" | "active" | "error" | "pending";

export default function Progress({ state, finished }: { state: StageState; finished: boolean }) {
  const statuses: Status[] = STEPS.map((step) => {
    if (finished) return "done";
    const st = step.stages.map((s) => state[s]);
    if (st.includes("error")) return "error";
    if (st.some((s) => s === "start") || (st.some((s) => s === "done") && !st.every((s) => s === "done" || s === undefined))) return "active";
    if (st.some((s) => s === "done")) return "done";
    return "pending";
  });
  const doneCount = statuses.filter((s) => s === "done").length;
  const current = statuses.find((s) => s === "active") ? STEPS[statuses.indexOf("active")].label : "Starting…";

  return (
    <div aria-live="polite">
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={doneCount} aria-label="Check progress">
        <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-600 transition-all duration-500" style={{ width: `${Math.max(6, (doneCount / STEPS.length) * 100)}%` }} />
      </div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {STEPS.map((step, i) => {
          const s = statuses[i];
          const icon = s === "done" ? "✓" : s === "error" ? "✗" : s === "active" ? "" : String(i + 1);
          return (
            <li key={step.label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-col sm:text-center ${s === "active" ? "border-blue-600 bg-blue-50" : s === "done" ? "border-emerald-600 bg-emerald-50" : s === "error" ? "border-rose-600 bg-rose-50" : "border-slate-200 bg-white text-slate-500"}`}>
              <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${s === "done" ? "border-emerald-600 bg-emerald-600 text-[#fff]" : s === "active" ? "border-blue-700" : s === "error" ? "border-rose-600 bg-rose-600 text-[#fff]" : "border-slate-300"}`}>
                {s === "active" ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" /> : icon}
              </span>
              <span className="font-medium">{step.label}</span>
              <span className="sr-only">{s === "done" ? "done" : s === "active" ? "in progress" : s === "error" ? "failed" : "waiting"}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-center text-xs text-slate-600">{current}</p>
    </div>
  );
}
