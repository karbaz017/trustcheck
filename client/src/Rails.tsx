import { useRef } from "react";
import type { AuthState } from "./Auth";
import { IActivity, IChat, IFile, ILogIn, INews, IPanelLeft, IPanelRight, IPlus } from "./icons";
import { Logo } from "./Sidebar";

function RailButton({ label, onClick, children, badge, active, disabled }: { label: string; onClick: () => void; children: React.ReactNode; badge?: number | boolean; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent ${active ? "bg-slate-200 text-slate-900" : ""}`}>
      {children}
      {badge ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#ea580c] ring-2 ring-slate-50" aria-hidden /> : null}
    </button>
  );
}

/** Collapsed sidebar: a slim strip of icons so everything stays one click away. */
export function LeftRail(p: { onExpand: () => void; onNew: () => void; onNews: (() => void) | null; newsUnread: number; auth: AuthState }) {
  const initial = (p.auth.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <nav aria-label="Collapsed sidebar" className="flex h-full w-14 flex-col items-center gap-1 border-r border-slate-200 bg-slate-50 py-3">
      <button type="button" onClick={p.onExpand} aria-label="Show sidebar" title="Show sidebar" className="mb-2"><Logo /></button>
      <RailButton label="Show sidebar" onClick={p.onExpand}><IPanelLeft className="h-5 w-5" /></RailButton>
      <RailButton label="New check" onClick={p.onNew}><IPlus className="h-5 w-5" /></RailButton>
      {p.onNews && <RailButton label={p.newsUnread ? `News alerts (${p.newsUnread} new)` : "News alerts"} onClick={p.onNews} badge={p.newsUnread > 0}><INews className="h-5 w-5" /></RailButton>}
      <RailButton label="Your checks" onClick={p.onExpand}><IChat className="h-5 w-5" /></RailButton>
      <div className="mt-auto">
        {p.auth.isAuthenticated ? (
          <button type="button" onClick={p.onExpand} aria-label={`Account: ${p.auth.email ?? ""}`} title={p.auth.email} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white">{initial}</button>
        ) : p.auth.enabled ? (
          <RailButton label="Log in to save your checks" onClick={p.auth.login}><ILogIn className="h-5 w-5" /></RailButton>
        ) : null}
      </div>
    </nav>
  );
}

/** Collapsed report panel. */
export function RightRail(p: { onOpen: (tab: "activity" | "result") => void; live: boolean; hasResult: boolean }) {
  return (
    <aside aria-label="Collapsed report panel" className="flex h-full w-14 flex-col items-center gap-1 border-l border-slate-200 bg-white py-3">
      <RailButton label="Show panel" onClick={() => p.onOpen(p.hasResult ? "result" : "activity")}><IPanelRight className="h-5 w-5" /></RailButton>
      <RailButton label="How we checked" onClick={() => p.onOpen("activity")} badge={p.live}><IActivity className="h-5 w-5" /></RailButton>
      <RailButton label={p.hasResult ? "Full report" : "Full report (not ready yet)"} onClick={() => p.onOpen("result")} disabled={!p.hasResult}><IFile className="h-5 w-5" /></RailButton>
    </aside>
  );
}

/** Drag handle between the conversation and the report. Keyboard: arrows resize, Home/End = widest/narrowest; double-click resets. */
export function ResizeHandle({ width, setWidth, min, max, onReset }: { width: number; setWidth: (w: number) => void; min: number; max: number; onReset: () => void }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  const clamp = (w: number) => Math.round(Math.min(max, Math.max(min, w)));
  const end = () => {
    start.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  };
  return (
    <div
      role="separator" aria-orientation="vertical" aria-label="Resize the report panel" tabIndex={0}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={width}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
      }}
      onPointerMove={(e) => { if (start.current) setWidth(clamp(start.current.w + (start.current.x - e.clientX))); }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 80 : 24;
        if (e.key === "ArrowLeft") setWidth(clamp(width + step));
        else if (e.key === "ArrowRight") setWidth(clamp(width - step));
        else if (e.key === "Home") setWidth(max);
        else if (e.key === "End") setWidth(min);
        else return;
        e.preventDefault();
      }}
      className="group absolute -left-2 top-0 z-20 h-full w-4 cursor-col-resize outline-none"
    >
      <span aria-hidden className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-transparent transition group-hover:bg-blue-500 group-focus-visible:bg-blue-600" />
      <span aria-hidden className="absolute left-1/2 top-1/2 h-12 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300 opacity-60 transition group-hover:bg-blue-500 group-hover:opacity-100 group-focus-visible:bg-blue-600 group-focus-visible:opacity-100" />
    </div>
  );
}
