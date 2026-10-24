import "./env.js";
import { runPipeline } from "./pipeline/run.js";

const text = process.argv.slice(2).join(" ");
if (!text) {
  console.error('Usage: npm run check:cli -w server -- "claim text"');
  process.exit(1);
}
const result = await runPipeline(text, { onProgress: (e) => e.status !== "start" && console.error(`  [${e.stage}] ${e.status} ${e.ms ?? ""}ms`) });
console.log(JSON.stringify(result, null, 2));
