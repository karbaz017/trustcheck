import { z } from "zod";
import { cryptoPriceTool } from "./coingecko.js";
import { finnhubAvailable, stockQuoteTool } from "./finnhub.js";
import { economicSeriesTool, FRED_SERIES, fredAvailable } from "./fred.js";
import { secAvailable, secFilingsTool } from "./sec.js";
import type { ToolHit } from "./types.js";

interface Tool {
  available: () => boolean;
  declaration: Record<string, unknown>;
  args: z.ZodTypeAny;
  run: (args: any) => Promise<ToolHit[]>;
}

/** Allow-list. The model can only ask for these, with validated arguments; code makes every request. */
export const TOOLS: Record<string, Tool> = {
  get_stock_quote: {
    available: finnhubAvailable,
    declaration: { name: "get_stock_quote", description: "Current US stock or ETF quote: price, daily change, day and 52-week range, market cap. Use for claims about a listed company's share price, % move or market value.", parameters: { type: "OBJECT", properties: { symbol: { type: "STRING", description: "US ticker, e.g. NVDA, AAPL, SPY" } }, required: ["symbol"] } },
    args: z.object({ symbol: z.string().min(1).max(10) }),
    run: stockQuoteTool,
  },
  get_crypto_price: {
    available: () => true,
    declaration: { name: "get_crypto_price", description: "Current cryptocurrency price with 24h/7d/30d change, market cap and all-time high. Use for claims about a coin's price or recent moves.", parameters: { type: "OBJECT", properties: { coin: { type: "STRING", description: "Coin name, symbol or CoinGecko id, e.g. bitcoin, ETH, solana" } }, required: ["coin"] } },
    args: z.object({ coin: z.string().min(1).max(60) }),
    run: cryptoPriceTool,
  },
  search_sec_filings: {
    available: secAvailable,
    declaration: { name: "search_sec_filings", description: "Full-text search of official SEC filings (8-K, 10-K, 10-Q...) with an excerpt. Use for claims about US public companies' acquisitions, mergers, earnings, guidance, layoffs or other corporate events.", parameters: { type: "OBJECT", properties: { phrase: { type: "STRING", description: "Exact phrase to find, e.g. a target company name" }, company: { type: "STRING", description: "Optional filer name, e.g. NVIDIA" }, forms: { type: "ARRAY", items: { type: "STRING" }, description: "Optional form types, default 8-K,10-K,10-Q" }, start_date: { type: "STRING", description: "YYYY-MM-DD" }, end_date: { type: "STRING", description: "YYYY-MM-DD" } }, required: ["phrase"] } },
    args: z.object({ phrase: z.string().min(3).max(120), company: z.string().max(80).optional(), forms: z.array(z.string()).max(6).optional(), start_date: z.string().optional(), end_date: z.string().optional() }),
    run: secFilingsTool,
  },
  get_economic_series: {
    available: fredAvailable,
    declaration: { name: "get_economic_series", description: "Official US economic data from FRED: Fed rate target, effective fed funds rate, CPI inflation (year-over-year), unemployment, 10-year Treasury yield, 30-year mortgage rate.", parameters: { type: "OBJECT", properties: { series_id: { type: "STRING", enum: Object.keys(FRED_SERIES) } }, required: ["series_id"] } },
    args: z.object({ series_id: z.enum(Object.keys(FRED_SERIES) as [string, ...string[]]) }),
    run: economicSeriesTool,
  },
};

export const availableTools = () => Object.entries(TOOLS).filter(([, t]) => t.available()).map(([n]) => n);
