import "./env.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { saveDemo } from "./demoCache.js";
import { runPipeline } from "./pipeline/run.js";

const file = fileURLToPath(new URL("../../eval/demo.json", import.meta.url));
const demos: { text: string; note?: string }[] = JSON.parse(readFileSync(file, "utf8"));
if (demos.length === 0) {
  console.log("eval/demo.json is empty. Add your rehearsed demo inputs as [{ \"text\": \"...\" }], then rerun.");
  process.exit(0);
}
for (const d of demos) {
  const r = await runPipeline(d.text);
  saveDemo(d.text, r);
  console.log(`cached: ${r.label} (${r.strength.band}) ${d.text.slice(0, 70)}`);
}
