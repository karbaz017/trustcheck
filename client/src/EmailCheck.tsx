import { useRef, useState } from "react";
import type { CheckResult } from "../../server/src/types";
import { checkEmail, followCheck, type EmailCheckResponse, type EmailSignal } from "./api";
import Progress, { applyEvent, type StageState } from "./Progress";
import Results from "./Results";

const SEV: Record<EmailSignal["severity"], { icon: string; text: string; cls: string }> = {
  high: { icon: "▲", text: "High", cls: "bg-rose-100 text-rose-900 border-rose-700" },
  warn: { icon: "●", text: "Warning", cls: "bg-amber-100 text-amber-900 border-amber-700" },
  info: { icon: "○", text: "Note", cls: "bg-slate-100 text-slate-800 border-slate-500" },
};
// Deliberately never green: no warning signs found is not a clean bill of health.
const LABEL_TONE: Record<EmailCheckResponse["label"], { icon: string; cls: string }> = {
  "Several warning signs": { icon: "▲", cls: "bg-rose-50 border-rose-300" },
  "Some warning signs": { icon: "●", cls: "bg-amber-50 border-amber-300" },
  "No strong warning signs found in this file": { icon: "○", cls: "bg-slate-50 border-slate-300" },
};

export default function EmailCheck() {
  const [res, setRes] = useState<EmailCheckResponse | null>(null);
  const [claims, setClaims] = useState<CheckResult | null>(null);
  const [stages, setStages] = useState<StageState>({});
  const [busy, setBusy] = useState(false);
  const [claimsBusy, setClaimsBusy] = useState(false);
  const [err, setErr] = useState("");
  const [claimsErr, setClaimsErr] = useState("");
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setErr(""); setClaimsErr(""); setRes(null); setClaims(null); setStages({}); setBusy(true);
    try {
      if (!/\.eml$/i.test(file.name)) throw new Error("Please choose a .eml file (download the message from your email app).");
      if (file.size > 2 * 1024 * 1024) throw new Error("That file is over 2 MB. Please choose a smaller .eml file.");
      const r = await checkEmail(file);
      setRes(r);
      if (r.checkId) {
        setClaimsBusy(true);
        followCheck(r.checkId, (e) => e.stage !== "error" && e.stage !== "done" && setStages((s) => applyEvent(s, e)), new AbortController().signal)
          .then(setClaims).catch((e) => setClaimsErr((e as Error).message)).finally(() => setClaimsBusy(false));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const tone = res ? LABEL_TONE[res.label] : null;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">Email check</h1>
        <p className="mt-1 text-slate-700">Download a suspicious email as a <strong>.eml</strong> file from your email app and drop it here. We look for warning signs and check any claims in the text.</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files[0]); }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center ${drag ? "border-blue-700 bg-blue-50" : "border-slate-400 bg-white"}`}
      >
        <p className="font-semibold">{busy ? "Reading the email…" : "Drag a .eml file here"}</p>
        <p className="my-1 text-sm text-slate-600">or</p>
        <input ref={input} id="eml" type="file" accept=".eml,message/rfc822" className="sr-only" onChange={(e) => void handle(e.target.files?.[0])} />
        <label htmlFor="eml" className="inline-block cursor-pointer rounded-lg bg-[#1e40af] px-4 py-2 font-semibold text-[#fff] focus-within:outline focus-within:outline-2">Choose a file</label>
        <ul className="mx-auto mt-4 max-w-md space-y-1 text-left text-xs text-slate-600">
          <li>✓ Read in memory only. The file isn't saved.</li>
          <li>✓ Attachments are listed by name, never opened.</li>
          <li>✓ Links are read as text, never visited.</li>
          <li>✓ Emails, phone numbers and long numbers are removed before any claim check.</li>
        </ul>
      </div>
      {err && <p role="alert" className="rounded-lg border border-rose-700 bg-rose-50 p-3 text-rose-900">{err}</p>}

      {res && tone && (
        <>
          <section aria-labelledby="sig-h" className={`rounded-2xl border-2 p-5 ${tone.cls}`}>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">Email signals</p>
            <h2 id="sig-h" className="mt-1 text-2xl font-extrabold"><span aria-hidden>{tone.icon}</span> {res.label}</h2>
            <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="font-semibold">From</dt><dd className="break-all">{res.meta.from || "(none)"}</dd>
              <dt className="font-semibold">Subject</dt><dd className="break-words">{res.meta.subject || "(none)"}</dd>
              <dt className="font-semibold">Links</dt><dd>{res.meta.linkCount} (never visited)</dd>
              <dt className="font-semibold">Attachments</dt>
              <dd>{res.meta.attachments.length ? res.meta.attachments.map((a) => a.filename).join(", ") + " (never opened)" : "none"}</dd>
            </dl>
            <ul className="mt-4 space-y-3">
              {[...res.signals].sort((a, b) => ["high", "warn", "info"].indexOf(a.severity) - ["high", "warn", "info"].indexOf(b.severity)).map((s, i) => (
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

          <section aria-labelledby="claims-h" className="space-y-3">
            <h2 id="claims-h" className="text-xl font-extrabold">Claims check</h2>
            {!res.checkId && <p className="rounded-lg bg-slate-100 p-3 text-sm">There wasn't enough text in this email to check for claims.</p>}
            {claimsBusy && <div className="rounded-2xl border border-slate-300 bg-white p-4"><Progress state={stages} finished={false} /></div>}
            {claimsErr && <p role="alert" className="rounded-lg border border-rose-700 bg-rose-50 p-3 text-rose-900">{claimsErr}</p>}
            {claims && <Results r={claims} />}
          </section>

          <div className="rounded-xl border border-slate-300 bg-white p-5 text-sm">
            <h2 className="text-lg font-extrabold">Limits of this check</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">{res.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        </>
      )}
    </div>
  );
}
