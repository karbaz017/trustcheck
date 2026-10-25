import type { CheckResult, ToolCallInfo } from "../../server/src/types";
import type { EmailCheckResponse, MarketBrief, ScamPlanResponse } from "./api";
import type { NewsItem } from "./newsStore";
import { IChart, ILifebuoy, IMail, INews, IShield } from "./icons";

export type Mode = "check" | "market" | "scamsos" | "email" | "news";

export const MODES: Record<Mode, { label: string; short: string; icon: (p: { className?: string }) => JSX.Element; desc: string; placeholder: string; examples: string[] }> = {
  check: {
    label: "Check a claim", short: "Check a claim", icon: IShield,
    desc: "Paste a post, message, video transcript or article link",
    placeholder: "Paste a post, message or link you want checked…",
    examples: [
      "I turned $1,000 into $10,000 in 30 days with this one trick. It's guaranteed!",
      "The FDIC insures deposits up to $250,000 per person, per bank.",
      "https://www.fdic.gov/resources/deposit-insurance",
    ],
  },
  market: {
    label: "Look up a stock or crypto", short: "Stock or crypto", icon: IChart,
    desc: "What's happening and what's moving the price, with sources",
    placeholder: "Type a company, a crypto, or something like “NVDA will fall this month”…",
    examples: ["NVDA will fall in the next 30 days", "Bitcoin"],
  },
  scamsos: { label: "I think I was scammed", short: "Scam help", icon: ILifebuoy, desc: "Get a calm, step-by-step plan for what to do now", placeholder: "", examples: [] },
  email: { label: "Check a suspicious email", short: "Email check", icon: IMail, desc: "Upload an email file and we'll look for warning signs", placeholder: "", examples: [] },
  news: {
    label: "Follow the news", short: "News", icon: INews,
    desc: "Latest headlines from trusted outlets about things you care about",
    placeholder: "Type topics to follow, like NVDA, Bitcoin, Federal Reserve…",
    examples: ["NVDA, Federal Reserve", "Bitcoin"],
  },
};

export interface ActivityItem {
  at: number;
  stage: string;
  status: "start" | "done" | "error" | "info";
  message?: string;
  lines?: string[];
  ms?: number;
  tool?: ToolCallInfo;
}

export type TurnResult =
  | { kind: "check"; check: CheckResult }
  | { kind: "market"; brief: MarketBrief }
  | { kind: "scamsos"; plan: ScamPlanResponse }
  | { kind: "email"; email: EmailCheckResponse; check?: CheckResult }
  | { kind: "news"; items: NewsItem[]; topics: string[] };

export interface Turn {
  id: string;
  mode: Mode;
  prompt: string;
  createdAt: number;
  status: "running" | "done" | "error" | "awaiting";
  activity: ActivityItem[];
  checkId?: string;
  result?: TurnResult;
  error?: string;
}

export interface Chat { id: string; title: string; createdAt: number; updatedAt: number; turns: Turn[] }

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const titleFrom = (s: string) => (s.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat");
export const newChat = (): Chat => ({ id: uid(), title: "New chat", createdAt: Date.now(), updatedAt: Date.now(), turns: [] });

// Per-viewer convenience: chats live only in this browser. Older chats keep their text but drop bulky results
// (checks can be re-fetched from the server by id).
const KEY = "tc.chats";
export function loadChats(): Chat[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Chat[];
    return Array.isArray(v) ? v.map((c) => ({ ...c, turns: c.turns.map((t) => (t.status === "running" ? { ...t, status: t.checkId ? "running" : "error", error: t.checkId ? undefined : "This was interrupted. Please try again." } : t)) })) : [];
  } catch {
    return [];
  }
}
export function saveChats(chats: Chat[]) {
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30);
  const slim = sorted.map((c, i) => (i < 6 ? c : { ...c, turns: c.turns.map((t) => ({ ...t, activity: t.activity.slice(-30), result: t.result?.kind === "check" ? undefined : t.result })) }));
  try {
    localStorage.setItem(KEY, JSON.stringify(slim));
  } catch {
    try { localStorage.setItem(KEY, JSON.stringify(slim.slice(0, 5))); } catch { /* storage full or unavailable */ }
  }
}
