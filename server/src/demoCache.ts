import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CheckResult } from "./types.js";

const FILE = fileURLToPath(new URL("../data/demoCache.json", import.meta.url));

export const demoKey = (text: string) => createHash("sha256").update(text.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");

function load(): Record<string, CheckResult> {
  try {
    return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  } catch {
    return {};
  }
}

export function lookupDemo(text: string): CheckResult | null {
  return load()[demoKey(text)] ?? null;
}

export function saveDemo(text: string, result: CheckResult): void {
  const all = load();
  all[demoKey(text)] = result;
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(all, null, 2));
}
