import { simpleParser, type AddressObject } from "mailparser";
import { htmlToText } from "../../pipeline/fetchUrl.js";

export interface ParsedEmail {
  fromName: string;
  fromAddress: string;
  replyTo: string[];
  returnPath: string;
  subject: string;
  date: string;
  authResults: string;
  text: string;
  links: { text: string; href: string }[];
  attachments: { filename: string; contentType: string }[];
}

const addr = (a: AddressObject | AddressObject[] | undefined): { name: string; address: string }[] => {
  const list = Array.isArray(a) ? a : a ? [a] : [];
  return list.flatMap((o) => o.value.map((v) => ({ name: v.name ?? "", address: (v.address ?? "").toLowerCase() })));
};

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export function extractLinks(html: string, text: string): { text: string; href: string }[] {
  const out: { text: string; href: string }[] = [];
  const re = /<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let m; (m = re.exec(html)); ) out.push({ href: m[1].trim(), text: stripTags(m[2]) });
  const seen = new Set(out.map((l) => l.href));
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) if (!seen.has(m[0])) (seen.add(m[0]), out.push({ href: m[0], text: m[0] }));
  return out.slice(0, 100);
}

/**
 * Parses in memory. Attachments are listed by name and type only; their bytes are never inspected, saved, or opened.
 * Links are returned as strings and never fetched. HTML is converted to text and never rendered.
 */
export async function parseEmail(raw: Buffer): Promise<ParsedEmail> {
  const mail = await simpleParser(raw, { skipImageLinks: true, skipTextToHtml: true });
  const from = addr(mail.from)[0] ?? { name: "", address: "" };
  const rp = mail.headers.get("return-path") as { value?: { address?: string }[]; text?: string } | undefined;
  const html = typeof mail.html === "string" ? mail.html : "";
  const text = (mail.text?.trim() || (html ? htmlToText(html) : "")).slice(0, 200_000);
  const auth = mail.headers.get("authentication-results");
  return {
    fromName: from.name,
    fromAddress: from.address,
    replyTo: addr(mail.replyTo).map((a) => a.address).filter(Boolean),
    returnPath: (rp?.value?.[0]?.address ?? rp?.text?.replace(/[<>]/g, "") ?? "").toLowerCase(),
    subject: mail.subject ?? "",
    date: mail.date ? mail.date.toISOString() : "",
    authResults: typeof auth === "string" ? auth : "",
    text,
    links: extractLinks(html, text),
    attachments: mail.attachments.map((a) => ({ filename: a.filename ?? "(unnamed)", contentType: a.contentType })),
  };
}
