import { describe, expect, it } from "vitest";
import { containsAdvice, isVerbatimQuote, unknownEvidenceIds } from "../src/pipeline/validators.js";
import { hypeFlags } from "../src/pipeline/hypeFlags.js";

describe("quote validator", () => {
  const snippet = "The company reported revenue of $94.9 billion for the quarter, up 6% year over year.";
  it("accepts verbatim substrings (case/whitespace insensitive)", () => {
    expect(isVerbatimQuote("reported revenue of $94.9 billion", snippet)).toBe(true);
    expect(isVerbatimQuote("Reported  revenue of $94.9\nbillion", snippet)).toBe(true);
  });
  it("rejects paraphrases and fabrications", () => {
    expect(isVerbatimQuote("revenue was $95 billion", snippet)).toBe(false);
    expect(isVerbatimQuote("", snippet)).toBe(false);
  });
  it("rejects quotes longer than 25 words", () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    expect(isVerbatimQuote(long, long)).toBe(false);
  });
});

describe("citation validator", () => {
  it("flags unknown evidence ids", () => {
    expect(unknownEvidenceIds("See e1 and e3.", new Set(["e1", "e2"]))).toEqual(["e3"]);
    expect(unknownEvidenceIds("See [e1].", new Set(["e1"]))).toEqual([]);
    expect(unknownEvidenceIds("no refs", new Set())).toEqual([]);
  });
});

describe("advice lint", () => {
  it.each(["You should buy this stock.", "I recommend waiting.", "Buy now before it rises", "invest in this fund", "avoid investing here", "Don't invest in it", "You should sell"])(
    "flags: %s",
    (t) => expect(containsAdvice(t)).toBe(true),
  );
  it.each(["Source e1 reports revenue of $5B.", "The claim is not supported by e2.", "The investor relations page (e1) confirms it."])(
    "passes: %s",
    (t) => expect(containsAdvice(t)).toBe(false),
  );
});

describe("hype flags", () => {
  it("matches case-insensitively with word boundaries", () => {
    expect(hypeFlags("GUARANTEED returns! Don't miss out, it's risk-free")).toEqual(["guaranteed", "risk-free", "don't miss out"]);
    expect(hypeFlags("a 10x return")).toEqual(["10x"]);
    expect(hypeFlags("a 110x return and secretary")).toEqual([]);
  });
});

describe("prompts carry today's date", async () => {
  const { extractUser } = await import("../src/prompts/extractClaims.js");
  const { stanceUser } = await import("../src/prompts/classifyStance.js");
  const { explainUser } = await import("../src/prompts/explain.js");
  const today = new Date().toISOString().slice(0, 10);
  it("extraction, stance and explanation prompts include the real date", () => {
    expect(extractUser("x", new Date("2026-10-24T12:00:00Z"))).toContain("Today's date is 2026-10-24");
    expect(stanceUser("c", [])).toContain(`Today's date is ${today}`);
    expect(explainUser([], "needs_checking", 0, [])).toContain(`Today's date is ${today}`);
  });
});
