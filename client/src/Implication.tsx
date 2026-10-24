import { useState } from "react";
import type { Implication } from "../../server/src/types";
import { PARAM_LABELS } from "../../server/src/pipeline/calculators";
import { calculate } from "./api";

const label = (k: string) => PARAM_LABELS[k] ?? k;

/** "What this implies": code-computed card. Never changes a verdict. Missing numbers are asked for, never guessed. */
export default function ImplicationCard({ imp: initial }: { imp: Implication }) {
  const [imp, setImp] = useState(initial);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const entered = Object.fromEntries(Object.entries(vals).filter(([, v]) => v.trim() !== "" && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));
  const ready = imp.missing.every((k) => k in entered);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      setImp(await calculate(imp.calc, { ...imp.stated, ...entered }, Object.keys(entered)));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-teal-300 bg-teal-50 p-4 text-teal-950">
      <p className="text-xs font-bold uppercase tracking-wide">What this implies</p>

      {imp.status === "ok" && (
        <>
          <p className="mt-1 text-lg font-semibold leading-snug">{imp.text}</p>
          {imp.assumed?.length ? (
            <p className="mt-2 inline-block rounded-md border border-amber-700 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900" role="note">
              ⚠ Assumption: you supplied {imp.assumed.map(label).join(", ")}. This is not from the source.
            </p>
          ) : (
            <p className="mt-2 text-xs">Every number here came from the text itself.</p>
          )}
        </>
      )}

      {imp.status === "needs_input" && (
        <form onSubmit={submit} className="mt-1">
          <p className="text-sm">To work this out, we need numbers the text didn't state. We won't guess them.</p>
          {Object.keys(imp.stated).length > 0 && (
            <p className="mt-1 text-xs">From the text: {Object.entries(imp.stated).map(([k, v]) => `${label(k)} = ${v}`).join("; ")}</p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {imp.missing.map((k) => (
              <label key={k} className="block text-sm font-medium">
                {label(k)} <span className="text-xs font-normal text-teal-800">(your assumption)</span>
                <input inputMode="decimal" value={vals[k] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-400 bg-white p-2 text-base" />
              </label>
            ))}
          </div>
          <button type="submit" disabled={!ready || busy} className="mt-3 rounded-lg bg-[#0f766e] px-4 py-2 text-sm font-semibold text-[#fff] disabled:bg-slate-400">
            {busy ? "Working it out…" : "Work it out"}
          </button>
          {err && <p role="alert" className="mt-2 text-sm text-rose-800">{err}</p>}
        </form>
      )}

      {imp.status === "invalid" && (
        <p className="mt-1 text-sm">We couldn't work this out: {imp.error}. {Object.keys(imp.stated).length > 0 && "Check the numbers in the claim."}</p>
      )}
    </div>
  );
}
