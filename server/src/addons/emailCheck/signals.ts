import { readFileSync } from "node:fs";
import { hypeFlags } from "../../pipeline/hypeFlags.js";
import type { ParsedEmail } from "./parse.js";

export interface EmailSignal {
  id: string;
  severity: "info" | "warn" | "high";
  title: string;
  detail: string;
  evidence: string;
}

export type Brands = Record<string, string[]>;
const load = <T>(f: string): T => JSON.parse(readFileSync(new URL(`../../config/${f}`, import.meta.url), "utf8"));
export const defaultBrands = (): Brands => load<{ brands: Brands }>("brandDomains.json").brands;
const pressureTerms = (): string[] => load<{ terms: string[] }>("pressureTerms.json").terms;

const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at", "tiny.cc", "rb.gy"]);
const RISKY_EXT = new Set(["exe", "scr", "js", "vbs", "bat", "cmd", "com", "jar", "msi", "ps1", "lnk", "iso", "img", "docm", "xlsm", "pptm", "hta", "pif", "reg", "wsf"]);
const DOC_EXT = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png", "gif", "txt", "rtf", "csv"]);
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

export const hostOf = (u: string): string => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
};
const domainOfAddress = (a: string) => a.split("@")[1]?.toLowerCase() ?? "";

/** "Organizational" domain: last two labels, or three for patterns like example.co.uk. */
export function orgDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const take = parts[parts.length - 1].length === 2 && SECOND_LEVEL.has(parts[parts.length - 2]) ? 3 : 2;
  return parts.slice(-take).join(".");
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const mixedScript = (h: string) => /[a-z]/.test(h) && /[Ͱ-ϿЀ-ӿ԰-֏֐-׿؀-ۿ]/.test(h);
const isIpLiteral = (h: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith("[");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function computeSignals(m: ParsedEmail, brands: Brands = defaultBrands()): EmailSignal[] {
  const out: EmailSignal[] = [];
  const fromDomain = domainOfAddress(m.fromAddress);
  const fromOrg = orgDomain(fromDomain);
  const brandDomains = new Set(Object.values(brands).flat().map((d) => d.toLowerCase()));

  // 1. Sender vs Reply-To / Return-Path
  for (const [label, addrs] of [["Reply-To", m.replyTo], ["Return-Path", m.returnPath ? [m.returnPath] : []]] as const) {
    for (const a of addrs) {
      const d = domainOfAddress(a);
      if (d && fromOrg && orgDomain(d) !== fromOrg)
        out.push({ id: `${label.toLowerCase()}-mismatch`, severity: "warn", title: `${label} goes to a different domain than the sender`, detail: `Replies would go to ${orgDomain(d)}, not ${fromOrg}. Some bulk senders do this on purpose, and so do scams.`, evidence: `From: ${m.fromAddress} / ${label}: ${a}` });
    }
  }

  // 2. Display name claims a brand, domain doesn't match
  for (const [brand, domains] of Object.entries(brands)) {
    if (m.fromName && norm(m.fromName).includes(norm(brand)) && !domains.map((d) => d.toLowerCase()).includes(fromOrg))
      out.push({ id: "brand-mismatch", severity: "high", title: `Sender name mentions ${brand}, but the address isn't one of its listed domains`, detail: `The display name suggests ${brand}; the sending domain is ${fromOrg || "unknown"}.`, evidence: `${m.fromName} <${m.fromAddress}>` });
  }

  // 3-5. Links
  const seenLink = new Set<string>();
  for (const l of m.links) {
    const host = hostOf(l.href);
    if (!host) continue;
    const key = `${l.text}|${host}`;
    if (seenLink.has(key)) continue;
    seenLink.add(key);

    const shown = l.text.match(/(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/\s:?#]|$)/i)?.[1]?.toLowerCase();
    if (shown && orgDomain(shown) !== orgDomain(host))
      out.push({ id: "link-text-mismatch", severity: "high", title: "A link's text shows one site but goes to another", detail: `The text reads ${shown}, but the real destination is ${host}.`, evidence: `${l.text.slice(0, 80)} -> ${l.href.slice(0, 120)}` });

    const org = orgDomain(host);
    if (host.startsWith("xn--") || host.includes(".xn--") || mixedScript(host))
      out.push({ id: "lookalike-script", severity: "high", title: "A link uses look-alike characters in its domain", detail: "Punycode or mixed alphabets can make a fake domain resemble a real one.", evidence: host });
    else if (!brandDomains.has(org)) {
      for (const [brand, domains] of Object.entries(brands))
        for (const d of domains) {
          const dist = levenshtein(org, d.toLowerCase());
          if (dist > 0 && dist <= 2) out.push({ id: "lookalike-domain", severity: "high", title: `A link's domain looks like ${brand}'s but isn't`, detail: `${org} is ${dist} character${dist === 1 ? "" : "s"} away from ${d}.`, evidence: l.href.slice(0, 120) });
        }
    }

    if (SHORTENERS.has(host) || SHORTENERS.has(org)) out.push({ id: "url-shortener", severity: "warn", title: "A link uses a URL shortener", detail: "Shorteners hide where a link really goes.", evidence: host });
    if (isIpLiteral(host)) out.push({ id: "ip-url", severity: "high", title: "A link goes to a raw IP address", detail: "Real organizations almost always use a domain name.", evidence: host });
    else if (host.split(".").length >= 5 || host.length > 60) out.push({ id: "odd-subdomain", severity: "warn", title: "A link has a very long or deeply nested address", detail: "Long chains of subdomains can bury the real domain at the end.", evidence: host });
  }
  if (fromOrg && !brandDomains.has(fromOrg)) {
    for (const [brand, domains] of Object.entries(brands))
      for (const d of domains) {
        const dist = levenshtein(fromOrg, d.toLowerCase());
        if (dist > 0 && dist <= 2) out.push({ id: "lookalike-sender", severity: "high", title: `The sender's domain looks like ${brand}'s but isn't`, detail: `${fromOrg} is ${dist} character${dist === 1 ? "" : "s"} away from ${d}.`, evidence: m.fromAddress });
      }
  }

  // 6. Authentication results, as recorded in the file
  const auth = m.authResults.toLowerCase();
  if (!auth) {
    out.push({ id: "auth-missing", severity: "info", title: "No authentication results are recorded in this file", detail: "SPF, DKIM and DMARC results weren't included, so they can't be reviewed here.", evidence: "(no Authentication-Results header)" });
  } else {
    const get = (k: string) => auth.match(new RegExp(`\\b${k}=(\\w+)`))?.[1];
    const res = { spf: get("spf"), dkim: get("dkim"), dmarc: get("dmarc") };
    const fails = Object.entries(res).filter(([, v]) => v && ["fail", "softfail", "permerror", "temperror"].includes(v));
    const summary = Object.entries(res).map(([k, v]) => `${k.toUpperCase()}=${v ?? "not recorded"}`).join(", ");
    out.push({
      id: "auth-results",
      severity: fails.length >= 2 ? "high" : fails.length === 1 ? "warn" : "info",
      title: fails.length ? "Email authentication checks failed (as recorded in this file)" : "Email authentication results (as recorded in this file)",
      detail: "These come from headers inside the file, and headers in a file can be edited, so treat them as a clue, not proof.",
      evidence: summary,
    });
  }

  // 7. Urgency / pressure
  const body = `${m.subject}\n${m.text}`;
  const pressure = [...new Set([...hypeFlags(body), ...hypeFlags(body, pressureTerms())])];
  if (pressure.length)
    out.push({ id: "pressure-language", severity: pressure.length >= 2 ? "warn" : "info", title: "Urgency or pressure wording", detail: "Pressure to act quickly is a common tactic. It's a warning sign, not proof of anything.", evidence: pressure.map((p) => `“${p}”`).join(", ") });

  // 8. Attachments
  for (const a of m.attachments) {
    const parts = a.filename.toLowerCase().split(".");
    const ext = parts.length > 1 ? parts[parts.length - 1] : "";
    const prev = parts.length > 2 ? parts[parts.length - 2] : "";
    if (RISKY_EXT.has(ext) && DOC_EXT.has(prev))
      out.push({ id: "double-extension", severity: "high", title: "An attachment has a double file extension", detail: "A name like invoice.pdf.exe tries to look like a document while being a program.", evidence: a.filename });
    else if (RISKY_EXT.has(ext))
      out.push({ id: "risky-attachment", severity: "warn", title: "An attachment is a file type that can run code", detail: "We only list attachment names and types. We never open them.", evidence: `${a.filename} (${a.contentType})` });
    else if (["html", "htm", "zip", "rar", "7z"].includes(ext))
      out.push({ id: "container-attachment", severity: "info", title: "An attachment is a web page or archive", detail: "These can hide other files or links. We never open attachments.", evidence: `${a.filename} (${a.contentType})` });
  }
  return out;
}

export type EmailLabel = "Several warning signs" | "Some warning signs" | "No strong warning signs found in this file";

export function summarize(signals: EmailSignal[]): EmailLabel {
  const warn = signals.filter((s) => s.severity === "warn").length;
  if (signals.some((s) => s.severity === "high") || warn >= 3) return "Several warning signs";
  if (warn >= 1) return "Some warning signs";
  return "No strong warning signs found in this file";
}

export const EMAIL_LIMITATIONS = [
  "Finding no warning signs is not proof an email is trustworthy. Some scams look completely ordinary.",
  "Headers inside a file can be edited, so authentication results are only a clue.",
  "We never open attachments or visit links. We only read the names and addresses as text.",
  "Brand and look-alike checks only cover brands on the team's list.",
];
