import { useState } from "react";
import type { AuthState } from "./Auth";
import type { HistoryItem } from "./api";
import type { Chat } from "./chat";
import { IChat, ILogIn, ILogOut, IMoon, INews, IPanelLeft, IPlus, ISettings, IShield, ISun, ITrash, IX } from "./icons";
import { OVERALL } from "./labels";
import type { Theme } from "./Theme";

interface Props {
  chats: Chat[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  saved: HistoryItem[] | null;
  onOpenSaved: (id: string, preview: string) => void;
  newsUnread: number;
  onOpenNews: (() => void) | null;
  auth: AuthState;
  theme: Theme;
  setTheme: (t: Theme) => void;
  onClose?: () => void;
  onCollapse?: () => void;
}

const DAY = 86_400_000;
/** "https://www.cnbc.com/2026/10/24/nvidia-shares.html" -> "cnbc.com · nvidia shares" */
export function prettyTitle(t: string): string {
  const m = t.match(/^https?:\/\/(?:www\.)?([^/\s]+)(\/\S*)?$/i);
  if (!m) return t;
  const slug = (m[2] ?? "").split("/").filter(Boolean).pop()?.replace(/\.(html?|aspx?|php)$/i, "").replace(/[-_]+/g, " ").trim();
  return slug && !/^\d+$/.test(slug) ? `${m[1]} · ${slug.slice(0, 50)}` : m[1];
}
const DOT: Record<string, string> = { holds_up: "bg-emerald-600", needs_checking: "bg-amber-500", doesnt_hold_up: "bg-rose-600" };
function groups(chats: Chat[]) {
  const start = new Date().setHours(0, 0, 0, 0);
  const g: { label: string; items: Chat[] }[] = [
    { label: "Today", items: [] }, { label: "Previous 7 days", items: [] }, { label: "Older", items: [] },
  ];
  for (const c of chats) g[c.updatedAt >= start ? 0 : c.updatedAt >= start - 7 * DAY ? 1 : 2].items.push(c);
  return g.filter((x) => x.items.length);
}

export function Logo({ size = "h-8 w-8" }: { size?: string }) {
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#7c3aed] text-[#fff] shadow-sm`}>
      <IShield className="h-[60%] w-[60%]" />
    </span>
  );
}

export default function Sidebar(p: Props) {
  const [settings, setSettings] = useState(false);
  const initial = (p.auth.email ?? "?").slice(0, 1).toUpperCase();
  return (
    <nav aria-label="Your checks and settings" className="flex h-full w-[272px] flex-col border-r border-slate-200 bg-slate-50">
      <div className="flex items-center gap-2 px-3 pb-3 pt-3.5">
        <Logo />
        <span className="text-[17px] font-bold tracking-tight">TrustCheck</span>
        {p.onClose && <button type="button" onClick={p.onClose} aria-label="Close menu" className="ml-auto rounded-lg p-2 text-slate-600 hover:bg-slate-200"><IX className="h-5 w-5" /></button>}
        {p.onCollapse && <button type="button" onClick={p.onCollapse} aria-label="Hide sidebar" title="Hide sidebar" className="ml-auto rounded-lg p-2 text-slate-600 hover:bg-slate-200"><IPanelLeft className="h-5 w-5" /></button>}
      </div>

      <div className="space-y-1 px-3">
        <button type="button" onClick={p.onNew} className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold shadow-sm transition hover:border-slate-300 hover:shadow">
          <IPlus className="h-4 w-4" /> New check
        </button>
        {p.onOpenNews && (
          <button type="button" onClick={p.onOpenNews} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-200/70">
            <INews className="h-4 w-4" /> News alerts
            {p.newsUnread > 0 && <span className="ml-auto rounded-full bg-[#ea580c] px-2 py-0.5 text-[11px] font-bold text-[#fff]" aria-label={`${p.newsUnread} new`}>{p.newsUnread} new</span>}
          </button>
        )}
      </div>

      <div className="tc-scroll mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {p.chats.length === 0 && (
          <p className="mx-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600">Your checks will appear here so you can come back to them.</p>
        )}
        {groups(p.chats).map((g) => (
          <div key={g.label} className="mb-3">
            <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</h2>
            <ul className="space-y-0.5">
              {g.items.map((c) => (
                <li key={c.id} className="group relative">
                  <button type="button" onClick={() => p.onSelect(c.id)} aria-current={c.id === p.activeId ? "page" : undefined}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 pr-9 text-left text-sm transition ${c.id === p.activeId ? "bg-slate-200 font-medium text-slate-900" : "text-slate-700 hover:bg-slate-200/70"}`}>
                    <IChat className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="truncate">{prettyTitle(c.title)}</span>
                  </button>
                  <button type="button" onClick={() => p.onDelete(c.id)} aria-label={`Delete “${c.title}”`} title="Delete"
                    className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-300 hover:text-slate-900 group-hover:block group-focus-within:block">
                    <ITrash className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {p.auth.isAuthenticated && (
          <div className="mb-3">
            <h2 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Saved to your account</h2>
            {!p.saved && <p className="px-3 text-sm text-slate-500">Loading…</p>}
            {p.saved?.length === 0 && <p className="px-3 text-sm text-slate-500">Checks you run while logged in are saved here.</p>}
            <ul className="space-y-0.5">
              {p.saved?.slice(0, 25).map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => p.onOpenSaved(h.id, h.preview)} className="block w-full rounded-lg px-3 py-1.5 text-left hover:bg-slate-200/70">
                    <span className="block truncate text-sm text-slate-700">{prettyTitle(h.preview) || "(no preview)"}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${h.label ? DOT[h.label] : h.status === "failed" ? "bg-slate-400" : "bg-blue-600"}`} />
                      {h.label ? OVERALL[h.label].text : h.status === "failed" ? "Couldn't finish" : "Checking…"} · {new Date(h.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 p-2">
        {settings && (
          <div className="tc-fade mb-2 space-y-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm" role="group" aria-label="Settings">
            <div className="flex items-center justify-between">
              <span className="font-medium">Appearance</span>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                {(["light", "dark"] as const).map((t) => (
                  <button key={t} type="button" aria-pressed={p.theme === t} onClick={() => p.setTheme(t)}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition ${p.theme === t ? "bg-white shadow-sm" : "text-slate-600"}`}>
                    {t === "light" ? <ISun className="h-3.5 w-3.5" /> : <IMoon className="h-3.5 w-3.5" />}{t}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={p.onClearAll} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"><ITrash className="h-3.5 w-3.5" /> Clear the checks saved in this browser</button>
            <p className="text-[11px] leading-snug text-slate-500">Your checks are saved in this browser only. If you log in, they're also saved to your account.</p>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-xl px-2 py-1.5">
          {p.auth.isAuthenticated ? (
            <>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-white" aria-hidden>{initial}</span>
              <span className="min-w-0 flex-1 truncate text-sm" title={p.auth.email}>{p.auth.email ?? "Logged in"}</span>
              <button type="button" onClick={p.auth.logout} aria-label="Log out" title="Log out" className="rounded-lg p-2 text-slate-600 hover:bg-slate-200"><ILogOut className="h-4 w-4" /></button>
            </>
          ) : p.auth.enabled ? (
            <div className="flex-1">
              <p className="mb-1.5 text-xs text-slate-500">Save your checks on any device</p>
              <div className="flex gap-2">
                <button type="button" onClick={p.auth.signup ?? p.auth.login} className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:opacity-90">Sign up</button>
                <button type="button" onClick={p.auth.login} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                  <ILogIn className="h-4 w-4" /> Log in
                </button>
              </div>
            </div>
          ) : (
            <span className="flex-1 text-xs text-slate-500">Saving to an account isn't set up</span>
          )}
          <button type="button" onClick={() => setSettings((s) => !s)} aria-expanded={settings} aria-label="Settings" title="Settings" className={`rounded-lg p-2 text-slate-600 hover:bg-slate-200 ${settings ? "bg-slate-200" : ""}`}><ISettings className="h-4 w-4" /></button>
        </div>
      </div>
    </nav>
  );
}
