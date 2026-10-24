import "./env.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runPipeline } from "./pipeline/run.js";
import type { ClaimVerdict } from "./types.js";

interface EvalClaim {
  claim: string;
  expected: ClaimVerdict;
  source: string;
  testedOn: string;
}

const file = fileURLToPath(new URL("../../eval/claims.json", import.meta.url));
const claims: EvalClaim[] = JSON.parse(readFileSync(file, "utf8"));
if (claims.length === 0) {
  console.log("eval/claims.json is empty. Add 12-15 REAL public claims (see eval/README.md), then rerun.");
  process.exit(0);
}

const rows: { claim: string; expected: ClaimVerdict; got: ClaimVerdict | "error"; ok: boolean }[] = [];
for (const c of claims) {
  try {
    const r = await runPipeline(c.claim);
    // The eval item is a single claim; judge the most important extracted claim.
    const main = [...r.claims].sort((a, b) => b.importance - a.importance)[0];
    const got = main?.verdict ?? "unverifiable";
    rows.push({ claim: c.claim, expected: c.expected, got, ok: got === c.expected });
  } catch (e) {
    rows.push({ claim: c.claim, expected: c.expected, got: "error", ok: false });
  }
  console.log(`${rows.at(-1)!.ok ? "PASS" : "FAIL"}  expected=${c.expected.padEnd(13)} got=${String(rows.at(-1)!.got).padEnd(13)} ${c.claim.slice(0, 70)}`);
}

const acc = rows.filter((r) => r.ok).length / rows.length;
const shouldBeUnverifiable = rows.filter((r) => r.expected === "unverifiable");
const cantTell = shouldBeUnverifiable.filter((r) => r.got === "unverifiable").length;
const wrongConfident = rows.filter((r) => r.got !== "error" && r.expected !== r.got && (r.got === "supported" || r.got === "refuted"));
console.log("\n=== Summary ===");
console.log(`Accuracy: ${(acc * 100).toFixed(0)}% (${rows.filter((r) => r.ok).length}/${rows.length})`);
console.log(`Says "can't tell" when it should: ${cantTell}/${shouldBeUnverifiable.length}`);
console.log(`Confidently wrong (supported/refuted when expected otherwise): ${wrongConfident.length}`);
