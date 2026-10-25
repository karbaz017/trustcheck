import type { ClaimType, ClaimVerdict, OverallLabel } from "../../server/src/types";

interface Tone { text: string; icon: string; badge: string; border: string; tint: string; accent: string }

const green: Omit<Tone, "text" | "icon"> = { badge: "bg-emerald-100 text-emerald-900 border-emerald-700", border: "border-l-emerald-600", tint: "bg-emerald-50 border-emerald-300", accent: "#059669" };
const amber: Omit<Tone, "text" | "icon"> = { badge: "bg-amber-100 text-amber-900 border-amber-700", border: "border-l-amber-500", tint: "bg-amber-50 border-amber-300", accent: "#d97706" };
const red: Omit<Tone, "text" | "icon"> = { badge: "bg-rose-100 text-rose-900 border-rose-700", border: "border-l-rose-600", tint: "bg-rose-50 border-rose-300", accent: "#e11d48" };
const gray: Omit<Tone, "text" | "icon"> = { badge: "bg-slate-100 text-slate-800 border-slate-500", border: "border-l-slate-400", tint: "bg-slate-50 border-slate-300", accent: "#64748b" };

export const OVERALL: Record<OverallLabel, Tone & { sub: string }> = {
  holds_up: { text: "Holds up", icon: "✓", sub: "The main claims are backed by reliable sources", ...green },
  needs_checking: { text: "Needs checking", icon: "!", sub: "Something central is unconfirmed, mixed, or hyped", ...amber },
  doesnt_hold_up: { text: "Doesn't hold up", icon: "✗", sub: "A central claim is contradicted by reliable sources", ...red },
};

export const VERDICT: Record<ClaimVerdict, Tone> = {
  supported: { text: "Supported", icon: "✓", ...green },
  mixed: { text: "Mixed", icon: "◐", ...amber },
  refuted: { text: "Contradicted", icon: "✗", ...red },
  unverifiable: { text: "Can't confirm", icon: "?", ...gray },
  not_checkable: { text: "Can't be verified", icon: "∅", ...gray },
};

export const CLAIM_TYPE: Record<ClaimType, string> = { checkable_fact: "Fact", numeric: "Numbers", forecast: "Forecast", opinion: "Opinion" };
export const BAND: Record<string, string> = { strong: "Strong", moderate: "Moderate", weak: "Weak", insufficient: "Insufficient" };

export const TIER: Record<1 | 2 | 3, { text: string; short: string; cls: string; dots: number }> = {
  1: { text: "Tier 1 · Primary source", short: "Primary", cls: "bg-blue-100 text-blue-900 border-blue-700", dots: 3 },
  2: { text: "Tier 2 · Reputable source", short: "Reputable", cls: "bg-indigo-100 text-indigo-900 border-indigo-600", dots: 2 },
  3: { text: "Tier 3 · Other", short: "Other", cls: "bg-slate-100 text-slate-700 border-slate-400", dots: 1 },
};
