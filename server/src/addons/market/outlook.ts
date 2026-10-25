import { thresholds as defaults, type Thresholds } from "../../config/loadConfig.js";
import type { MarketBrief, MarketSource, Outlook } from "./types.js";

export const OUTLOOK_CAVEAT =
  "This weighs the price drivers that sources report today. It is not a forecast, a probability, or advice: markets often move against the balance of news, and nobody can verify a prediction in advance.";

/**
 * Code decides: each sourced driver counts with the weight of its best cited source (same tier weights as claim verdicts),
 * each source counts once per side, and low-reliability (tier 3) weight is capped per side.
 */
export function computeOutlook(
  drivers: MarketBrief["drivers"],
  sources: MarketSource[],
  prediction: { text?: string; direction: "up" | "down" | "none" },
  t: Thresholds = defaults,
): Outlook {
  const tierById = new Map(sources.map((s) => [s.id, s.tier]));
  const domainById = new Map(sources.map((s) => [s.id, s.domain]));
  const side = { up: { main: 0, t3: 0, seen: new Set<string>() }, down: { main: 0, t3: 0, seen: new Set<string>() } };
  const add = (k: "up" | "down", ids: string[], factor: number) => {
    const best = ids.filter((i) => tierById.has(i)).sort((a, b) => tierById.get(a)! - tierById.get(b)!)[0];
    if (!best) return;
    const dom = domainById.get(best)!;
    const key = `${dom}`;
    if (side[k].seen.has(key)) return; // one source domain counts once per side
    side[k].seen.add(key);
    const tier = tierById.get(best)!;
    const w = t.tierWeights[String(tier) as "1" | "2" | "3"] * factor;
    if (tier === 3) side[k].t3 += w;
    else side[k].main += w;
  };
  for (const d of drivers) {
    if (d.direction === "up") add("up", d.sourceIds, 1);
    else if (d.direction === "down") add("down", d.sourceIds, 1);
    else if (d.direction === "mixed") (add("up", d.sourceIds, 0.5), add("down", d.sourceIds, 0.5));
  }
  const total = (s: typeof side.up) => s.main + Math.min(s.t3, t.tier3Cap);
  const up = Math.round(total(side.up) * 10) / 10;
  const down = Math.round(total(side.down) * 10) / 10;
  const { minTotalWeight, leanRatio } = t.outlook;

  let balance: Outlook["balance"];
  if (up + down < minTotalWeight) balance = "insufficient";
  else if (up >= leanRatio * down && up > down) balance = "leans_up";
  else if (down >= leanRatio * up && down > up) balance = "leans_down";
  else balance = "mixed";

  const dir = prediction.direction;
  let verdict: Outlook["verdict"];
  if (balance === "insufficient") verdict = "insufficient";
  else if (dir === "none") verdict = "no_prediction";
  else if (balance === "mixed") verdict = "mixed";
  else verdict = (balance === "leans_up") === (dir === "up") ? "leans_toward" : "leans_against";

  const quote = prediction.text ? `“${prediction.text.slice(0, 140)}”` : "the prediction";
  const way = dir === "up" ? "upward" : "downward";
  const opposite = dir === "up" ? "downward" : "upward";
  const headline = {
    leans_toward: `Today's sourced factors point ${way}, the same direction as ${quote}. They say nothing about how far or how fast.`,
    leans_against: `Today's sourced factors point ${opposite}, the opposite direction to ${quote}.`,
    mixed: `Today's sourced factors are mixed on ${quote}: neither direction clearly outweighs the other.`,
    insufficient: "There aren't enough well-sourced factors to say which way they lean.",
    no_prediction:
      balance === "leans_up" ? "Sourced factors currently point more toward upward pressure."
      : balance === "leans_down" ? "Sourced factors currently point more toward downward pressure."
      : "Sourced factors currently point both ways.",
  }[verdict];

  // Mixed drivers add half weight to both sides, so they are named on both sides too.
  const named = (k: "up" | "down") => drivers.filter((d) => d.direction === k || d.direction === "mixed").map((d) => (d.direction === "mixed" ? `${d.headline} (mixed)` : d.headline));
  const ups = named("up");
  const downs = named("down");
  const why = [
    `Upward pressure (weight ${up}): ${ups.length ? ups.slice(0, 4).join("; ") : "none found"}.`,
    `Downward pressure (weight ${down}): ${downs.length ? downs.slice(0, 4).join("; ") : "none found"}.`,
    `Weights come from source quality: primary sources count most, reputable news next, and other sites count very little. A side "leans" only when it outweighs the other ${leanRatio} to 1.`,
  ];
  return { prediction: prediction.text, predictionDirection: dir, balance, upWeight: up, downWeight: down, verdict, headline, why, caveat: OUTLOOK_CAVEAT };
}
