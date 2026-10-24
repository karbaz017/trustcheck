import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startCheck = vi.fn(async (_i: { text?: string }) => "11111111-1111-1111-1111-111111111111");
vi.mock("../src/runner.js", () => ({ startCheck: (i: { text?: string }) => startCheck(i), subscribe: () => null }));

const { addons } = await import("../src/addons/index.js");
const { parseEmail } = await import("../src/addons/emailCheck/parse.js");
const { redact } = await import("../src/addons/emailCheck/redact.js");
const { computeSignals, summarize, orgDomain, levenshtein, EMAIL_LIMITATIONS } = await import("../src/addons/emailCheck/signals.js");

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}.eml`, import.meta.url));
const BRANDS = { ExampleBank: ["examplebank.test"] };
const ids = (s: { id: string }[]) => s.map((x) => x.id);

describe("fixtures", () => {
  it("newsletter: no strong warning signs", async () => {
    const sig = computeSignals(await parseEmail(fx("newsletter")), BRANDS);
    expect(ids(sig)).toEqual(["auth-results"]);
    expect(sig[0].severity).toBe("info");
    expect(summarize(sig)).toBe("No strong warning signs found in this file");
  });

  it("phishing-style: mismatched link, lookalike, brand, reply-to, auth, pressure, double extension", async () => {
    const mail = await parseEmail(fx("phishing"));
    const sig = computeSignals(mail, BRANDS);
    expect(ids(sig)).toEqual(expect.arrayContaining([
      "reply-to-mismatch", "return-path-mismatch", "brand-mismatch", "link-text-mismatch", "lookalike-domain", "lookalike-sender",
      "auth-results", "pressure-language", "double-extension",
    ]));
    expect(sig.find((s) => s.id === "auth-results")!.severity).toBe("high"); // spf=fail + dmarc=fail
    expect(sig.find((s) => s.id === "auth-results")!.title).toMatch(/as recorded in this file/);
    expect(sig.find((s) => s.id === "double-extension")!.evidence).toBe("invoice.pdf.exe");
    expect(summarize(sig)).toBe("Several warning signs");
  });

  it("hype-heavy promo: pressure wording plus an info-level auth line", async () => {
    const sig = computeSignals(await parseEmail(fx("promo")), BRANDS);
    expect(ids(sig)).toEqual(["auth-results", "pressure-language"]);
    expect(sig.find((x) => x.id === "pressure-language")!.evidence).toMatch(/guaranteed/);
    expect(sig.find((x) => x.id === "pressure-language")!.severity).toBe("warn"); // 4 pressure phrases
    expect(summarize(sig)).toBe("Some warning signs");
  });

  it("brand signals stay silent when no brands are configured", async () => {
    const sig = computeSignals(await parseEmail(fx("phishing")), {});
    expect(ids(sig)).not.toContain("brand-mismatch");
    expect(ids(sig)).not.toContain("lookalike-domain");
    expect(ids(sig)).toContain("link-text-mismatch");
  });
});

describe("safety properties", () => {
  it("never outputs the words 'safe' or 'legitimate'", async () => {
    const all = [];
    for (const n of ["newsletter", "phishing", "promo"]) {
      const sig = computeSignals(await parseEmail(fx(n)), BRANDS);
      all.push(JSON.stringify(sig), summarize(sig), JSON.stringify(EMAIL_LIMITATIONS));
    }
    expect(all.join(" ")).not.toMatch(/\b(safe|legitimate)\b/i);
  });

  it("attachments are listed by name and type only, never their contents", async () => {
    const mail = await parseEmail(fx("phishing"));
    expect(mail.attachments).toEqual([{ filename: "invoice.pdf.exe", contentType: "application/octet-stream" }]);
    expect(JSON.stringify(mail)).not.toContain("QUFBQQ");
    expect(JSON.stringify(mail)).not.toContain("AAAA");
  });

  it("links are returned as strings and never fetched", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const mail = await parseEmail(fx("phishing"));
    computeSignals(mail, BRANDS);
    expect(mail.links[0].href).toBe("https://login.examplebamk.test/verify");
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("signal helpers on synthetic inputs", () => {
  const base = { fromName: "", fromAddress: "a@example.com", replyTo: [], returnPath: "", subject: "", date: "", authResults: "spf=pass", text: "", links: [], attachments: [] };
  const withLink = (href: string, text = href) => computeSignals({ ...base, links: [{ href, text }] }, BRANDS);

  it("URL shortener, IP literal, deep subdomain, punycode, mixed script", () => {
    expect(ids(withLink("https://bit.ly/abc"))).toContain("url-shortener");
    expect(ids(withLink("http://192.0.2.1/login"))).toContain("ip-url");
    expect(ids(withLink("https://a.b.c.d.e.example.com/x"))).toContain("odd-subdomain");
    expect(ids(withLink("https://xn--examplebnk-1ib.test/"))).toContain("lookalike-script");
    expect(ids(withLink("https://exаmple.test/"))).toContain("lookalike-script"); // Cyrillic 'а'
  });
  it("lookalike of a listed brand domain; the real domain is not flagged", () => {
    expect(ids(withLink("https://examp1ebank.test/"))).toContain("lookalike-domain");
    expect(ids(withLink("https://www.examplebank.test/"))).not.toContain("lookalike-domain");
  });
  it("risky attachment without a double extension is a warn", () => {
    const s = computeSignals({ ...base, attachments: [{ filename: "setup.exe", contentType: "x/y" }] }, BRANDS);
    expect(s.find((x) => x.id === "risky-attachment")!.severity).toBe("warn");
  });
  it("summary thresholds: 3+ warn is 'Several'; 1-2 warn is 'Some'", () => {
    const w = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `w${i}`, severity: "warn" as const, title: "", detail: "", evidence: "" }));
    expect(summarize(w(0))).toBe("No strong warning signs found in this file");
    expect(summarize(w(1))).toBe("Some warning signs");
    expect(summarize(w(2))).toBe("Some warning signs");
    expect(summarize(w(3))).toBe("Several warning signs");
  });
  it("orgDomain and levenshtein", () => {
    expect(orgDomain("login.mail.example.com")).toBe("example.com");
    expect(orgDomain("shop.example.co.uk")).toBe("example.co.uk");
    expect(levenshtein("examplebank.test", "examplebamk.test")).toBe(1);
  });
});

describe("redaction", () => {
  it("removes emails, phones, IPs, long digit runs and SSN-like patterns", () => {
    const out = redact("Mail ceo@example.org, call +1 (555) 010-1234, ssn 123-45-6789, ref 123456789012, host 192.0.2.44, v6 2001:db8::1.");
    expect(out).not.toMatch(/ceo@|555|6789|123456789012|192\.0\.2|2001:db8/);
    expect(out).toContain("[email]");
    expect(out).toContain("[phone]");
    expect(out).toContain("[ssn]");
    expect(out).toContain("[number]");
    expect(out).toContain("[ip]");
  });
  it("leaves clock times and dates alone", () => {
    expect(redact("Call at 10:30:45 about 2026-10-24")).toBe("Call at 10:30:45 about 2026-10-24");
  });
  it("keeps ordinary figures the claim check needs", () => {
    expect(redact("Turn $1,000 into $10,000 in 30 days at 7%")).toBe("Turn $1,000 into $10,000 in 30 days at 7%");
  });
});

describe("POST /api/email-check", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let base = "";
  beforeEach(async () => {
    process.env.FEATURE_EMAIL_CHECK = "true";
    startCheck.mockClear();
    const app = express();
    app.use("/api", addons);
    await new Promise<void>((r) => (server = app.listen(0, r)));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterEach(() => {
    delete process.env.FEATURE_EMAIL_CHECK;
    server.close();
  });
  const post = (name: string, data: Buffer | string, type = "message/rfc822") => {
    const fd = new FormData();
    fd.append("file", new Blob([data as BlobPart], { type }), name);
    return fetch(`${base}/email-check`, { method: "POST", body: fd });
  };

  it("is off by default (404)", async () => {
    delete process.env.FEATURE_EMAIL_CHECK;
    expect((await post("a.eml", fx("promo"))).status).toBe(404);
  });
  it("rejects non-.eml files and files over 2 MB", async () => {
    expect((await post("a.pdf", "hello", "application/pdf")).status).toBe(400);
    expect((await post("big.eml", Buffer.alloc(2 * 1024 * 1024 + 10, "a"))).status).toBe(400);
    expect(startCheck).not.toHaveBeenCalled();
  });
  it("returns signals and sends only redacted text to the claim check", async () => {
    const res = await post("promo.eml", fx("promo"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkId).toBe("11111111-1111-1111-1111-111111111111");
    expect(body.signals.map((s: { id: string }) => s.id)).toContain("pressure-language");
    const sent = startCheck.mock.calls[0][0].text!;
    expect(sent).toContain("$10,000");
    expect(sent).not.toMatch(/ceo@example\.org|555|123456789012|192\.0\.2\.44/);
  });
  it("garbage that is not an email still returns a result or a clean error, never a crash", async () => {
    const res = await post("x.eml", "\u0000\u0001not an email");
    expect([200, 400]).toContain(res.status);
  });
});
