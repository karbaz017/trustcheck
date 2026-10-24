/** Pure types (no Node imports) so the client can import them. */
export interface MarketSource { id: string; url: string; domain: string; title: string; tier: 1 | 2 | 3 }
export interface Cited { sourceIds: string[] }
export type Direction = "up" | "down" | "mixed" | "unclear";
export interface Outlook {
  /** The prediction found in the user's text, restated, if any. */
  prediction?: string;
  predictionDirection: "up" | "down" | "none";
  /** Code-computed balance of sourced price drivers. */
  balance: "leans_up" | "leans_down" | "mixed" | "insufficient";
  upWeight: number;
  downWeight: number;
  /** Plain-English verdict on the prediction (or on the balance when there is no prediction). */
  verdict: "leans_toward" | "leans_against" | "mixed" | "insufficient" | "no_prediction";
  headline: string;
  why: string[];
  caveat: string;
}
export interface MarketBrief {
  query: string;
  generatedAt: string;
  supported: boolean;
  message?: string;
  subject?: { name: string; ticker?: string; assetType: string };
  snapshot: (Cited & { label: string; value: string; asOf?: string })[];
  drivers: (Cited & { headline: string; explanation: string; direction: Direction; timeframe?: string })[];
  outlook?: Outlook;
  fundamentals: (Cited & { label: string; value: string })[];
  analysts: (Cited & { statement: string })[];
  upcoming: (Cited & { event: string; date?: string })[];
  bullCase: (Cited & { point: string })[];
  bearCase: (Cited & { point: string })[];
  risks: (Cited & { point: string })[];
  notFound: string[];
  sources: MarketSource[];
  dropped: number;
  limitations: string[];
  disclaimer: string;
}
export const MARKET_DISCLAIMER =
  "Market information, not advice. This briefing does not tell you to buy, sell, or hold anything. It doesn't know your goals, timeline, or finances, and we are not a licensed financial advisor.";
