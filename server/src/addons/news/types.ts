/** Pure types (no Node imports) so the client can import them. */
export interface NewsItem {
  id: string;
  topic: string;
  title: string;
  source: string;
  domain: string;
  tier: 1 | 2 | 3;
  url: string;
  publishedAt: string;
  kind: "news" | "filing";
}
export interface NewsResponse { items: NewsItem[]; fetchedAt: string; filingsEnabled: boolean }
