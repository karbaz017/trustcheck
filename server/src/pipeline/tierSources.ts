import { sourceTiers, type SourceTiers } from "../config/loadConfig.js";

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

/** Pure lookup; no AI involved. */
export function tierOf(urlOrHost: string, cfg: SourceTiers = sourceTiers): 1 | 2 | 3 {
  const host = urlOrHost.includes("/") ? domainOf(urlOrHost) : urlOrHost.toLowerCase().replace(/^www\./, "");
  if (!host) return 3;
  if (cfg.tier1Suffixes.some((s) => host.endsWith(s))) return 1;
  if (cfg.tier1Domains.some((d) => matchesDomain(host, d))) return 1;
  // investor.* / ir.* subdomains (e.g. investor.apple.com)
  if (cfg.tier1SubdomainPrefixes.some((p) => host.startsWith(p) && host.split(".").length >= 3)) return 1;
  if (cfg.tier2Domains.some((d) => matchesDomain(host, d))) return 2;
  return 3;
}

/** Tier stage: assign tiers to retrieved evidence by lookup. */
export function applyTiers<T extends { domain: string; tier: 1 | 2 | 3 }>(evidence: T[]): T[] {
  return evidence.map((e) => ({ ...e, tier: tierOf(e.domain) }));
}
