import { useEffect, useRef, useState } from "react";
import { MODES, type Mode } from "./chat";
import { IArrowUp, ICheck, IChevronDown, IPaperclip, IX } from "./icons";

const MAX = 8000;

interface Props {
  mode: Mode;
  modes: Mode[];
  setMode: (m: Mode) => void;
  busy: boolean;
  draft: string;
  setDraft: (s: string) => void;
  onSend: (text: string) => void;
  onFile: (f: File) => void;
  onScamStart: () => void;
  watchlist: string[];
  onRemoveTopic: (t: string) => void;
}

/** Floating input with a "what do you want to do" picker, like choosing a model. */
export default function Composer(p: Props) {
  const [menu, setMenu] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const m = MODES[p.mode];
  const Icon = m.icon;

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [p.draft, p.mode]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);
  useEffect(() => setFile(null), [p.mode]);

  const tooLong = p.mode === "check" && p.draft.length > MAX;
  const canSend = !p.busy && (p.mode === "email" ? !!file : p.mode === "scamsos" ? true : p.draft.trim().length >= 2 && !tooLong);

  function send() {
    if (!canSend) return;
    if (p.mode === "email" && file) { p.onFile(file); setFile(null); if (fileInput.current) fileInput.current.value = ""; return; }
    if (p.mode === "scamsos") return p.onScamStart();
    p.onSend(p.draft.trim());
  }

  return (
    <div className="bg-gradient-to-t from-white via-white to-transparent pt-4">
      <div className="mx-auto w-full max-w-3xl px-3 pb-3 sm:px-4 sm:pb-4">
        {p.mode === "news" && p.watchlist.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Following:</span>
            {p.watchlist.map((w) => (
              <span key={w} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-2.5 pr-1 text-xs font-medium shadow-sm">
                {w}<button type="button" onClick={() => p.onRemoveTopic(w)} aria-label={`Stop following ${w}`} className="rounded-full p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><IX className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); send(); }}
          className="rounded-[26px] border border-slate-200 bg-white shadow-[0_8px_30px_-12px_rgba(15,23,42,0.25)] transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100 focus-within:shadow-[0_10px_40px_-12px_rgba(37,99,235,0.35)]">
          {p.mode === "email" ? (
            <div className="flex flex-wrap items-center gap-3 px-4 pb-1 pt-4 text-sm">
              <input ref={fileInput} id="eml" type="file" accept=".eml,message/rfc822" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <label htmlFor="eml" className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 px-3.5 py-1.5 font-medium hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-700">
                <IPaperclip className="h-4 w-4" /> {file ? "Choose a different file" : "Choose the email file"}
              </label>
              <span className="min-w-0 flex-1 text-slate-600">{file ? <strong className="font-semibold text-slate-900">{file.name}</strong> : "In your email app, use “Download” or “Save as” to get a .eml file. We never open its links or attachments."}</span>
            </div>
          ) : p.mode === "scamsos" ? (
            <p className="px-5 pb-1 pt-4 text-[15px] text-slate-700">We'll ask five quick questions, then give you a calm step-by-step plan. Nothing you answer is saved on our server.</p>
          ) : (
            <>
              <label htmlFor="composer" className="sr-only">{m.label}</label>
              <textarea id="composer" ref={ta} rows={1} value={p.draft} onChange={(e) => p.setDraft(e.target.value)} placeholder={m.placeholder}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
                className="tc-scroll block max-h-56 w-full resize-none bg-transparent px-5 pt-4 text-[15px] leading-6 outline-none placeholder:text-slate-500 focus-visible:outline-none" />
            </>
          )}
          <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-2">
            <div ref={menuRef} className="relative">
              <button type="button" onClick={() => setMenu((x) => !x)} aria-haspopup="menu" aria-expanded={menu} title="Choose what you want to do"
                className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50">
                <Icon className="h-4 w-4 text-blue-700" />{m.short}<IChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </button>
              {menu && (
                <div role="menu" aria-label="What would you like to do?" className="tc-fade absolute bottom-full left-0 z-30 mb-2 w-80 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <p className="px-3 pb-1 pt-2 text-xs font-semibold text-slate-500">What would you like to do?</p>
                  {p.modes.map((k) => {
                    const MI = MODES[k].icon;
                    return (
                      <button key={k} type="button" role="menuitemradio" aria-checked={k === p.mode} onClick={() => { p.setMode(k); setMenu(false); setTimeout(() => ta.current?.focus(), 0); }}
                        className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-100 ${k === p.mode ? "bg-slate-100" : ""}`}>
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><MI className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{MODES[k].label}</span><span className="block text-xs leading-snug text-slate-600">{MODES[k].desc}</span></span>
                        {k === p.mode && <ICheck className="mt-1 h-4 w-4 text-blue-700" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {p.mode === "check" && p.draft.length > MAX * 0.75 && <span className={`ml-auto text-xs ${tooLong ? "font-semibold text-rose-800" : "text-slate-500"}`}>{p.draft.length.toLocaleString("en-US")} / {MAX.toLocaleString("en-US")}</span>}
            {p.mode === "scamsos" ? (
              <button type="submit" disabled={!canSend} className="ml-auto rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:bg-slate-200 disabled:text-slate-500">Start</button>
            ) : (
              <button type="submit" disabled={!canSend} aria-label={p.mode === "email" ? "Check this email" : "Send"} title={p.mode === "email" ? "Check this email" : "Send (Enter)"}
                className={`${p.mode === "check" && p.draft.length > MAX * 0.75 ? "" : "ml-auto "}flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400`}>
                {p.busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <IArrowUp className="h-[18px] w-[18px]" />}
              </button>
            )}
          </div>
        </form>
        {tooLong && <p role="alert" className="mt-1.5 text-center text-xs font-medium text-rose-800">That's a bit long. Please trim it to {MAX.toLocaleString("en-US")} characters.</p>}
        <p className="mt-2 text-center text-[11px] text-slate-500">TrustCheck shows evidence, not financial advice. Sources can be wrong, so double-check important decisions.</p>
      </div>
    </div>
  );
}
