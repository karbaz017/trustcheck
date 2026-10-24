import { loadPlaybook, type Playbook } from "./playbook.js";

const PROMISES = /\b(refunds?|recover(y|ed)?|guarantee[ds]?|get (your )?money back|you('ll| will) (get|receive)|within \d+ (days?|hours?|business days))\b/i;

/** Returns a list of problems; empty means the playbook is shippable. */
export function validatePlaybook(pb: Playbook): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  if (JSON.stringify(pb).includes("TODO_VERIFY_URL")) errs.push("TODO_VERIFY_URL placeholder is still present");
  for (const r of pb.rules) {
    for (const s of r.steps) {
      const where = `${r.id}/${s.id}`;
      if (!s.id || !s.text || !["now", "today", "this_week"].includes(s.tier)) errs.push(`${where}: missing id, text, or a valid tier`);
      if (ids.has(s.id)) errs.push(`${where}: duplicate step id`);
      ids.add(s.id);
      if (!s.sourceUrl && !s.ownProvider) errs.push(`${where}: needs a sourceUrl or ownProvider=true`);
      if (s.sourceUrl) {
        try {
          const u = new URL(s.sourceUrl);
          if (u.protocol !== "https:" || !pb.officialHosts.includes(u.hostname)) errs.push(`${where}: sourceUrl host ${u.hostname} is not an official verified host`);
        } catch {
          errs.push(`${where}: sourceUrl is not a valid URL`);
        }
      }
      if (PROMISES.test(s.text)) errs.push(`${where}: text makes a promise or states a deadline/refund right (not allowed unless verified and linked)`);
    }
  }
  return errs;
}

// `npm run check:playbook` (also part of `npm run build`) fails if anything is wrong.
if (process.argv[1]?.endsWith("validatePlaybook.ts")) {
  const errs = validatePlaybook(loadPlaybook());
  if (errs.length) {
    console.error("Playbook problems:\n- " + errs.join("\n- "));
    process.exit(1);
  }
  console.log("Playbook OK");
}
