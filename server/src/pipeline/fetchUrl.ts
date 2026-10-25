import { lookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as ufetch } from "undici";
import { isPrivateAddress } from "../util/ssrf.js";

export class FetchError extends Error {}

const BLOCKED_SOCIAL = [
  "twitter.com", "x.com", "facebook.com", "instagram.com", "tiktok.com", "youtube.com", "youtu.be",
  "reddit.com", "linkedin.com", "threads.net", "snapchat.com", "twitch.tv", "discord.com", "t.me", "telegram.org",
];
export const UNSUPPORTED_SITE_MESSAGE = "We can't read this site automatically. Paste the text or transcript instead.";

export function isUnsupportedSite(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return BLOCKED_SOCIAL.some((d) => h === d || h.endsWith("." + d));
}

const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

// DNS lookup that rejects non-public addresses at connect time, which also defeats DNS rebinding.
const guardedAgent = new Agent({
  connect: {
    lookup: (hostname, options, cb) => {
      lookup(hostname, { ...options, all: true }, (err, addrs) => {
        if (err) return cb(err, "", 4);
        const list = addrs as unknown as { address: string; family: number }[];
        if (!list.length || list.some((a) => isPrivateAddress(a.address))) return cb(new FetchError("blocked address"), "", 4);
        if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: unknown) => void)(null, list);
        cb(null, list[0].address, list[0].family);
      });
    },
  },
});

export function assertAllowedUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchError("That doesn't look like a valid link.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchError("Only http and https links are supported.");
  if (isUnsupportedSite(u.hostname)) throw new FetchError(UNSUPPORTED_SITE_MESSAGE);
  if (isIP(u.hostname.replace(/^\[|\]$/g, "")) && isPrivateAddress(u.hostname.replace(/^\[|\]$/g, "")))
    throw new FetchError("That address isn't allowed.");
  return u;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|br|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export async function fetchUrlText(raw: string): Promise<string> {
  let url = assertAllowedUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await ufetch(url, {
        dispatcher: guardedAgent,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "VerifinBot/0.1 (+evidence check)", accept: "text/html,text/plain" },
      });
    } catch (e) {
      const cause = (e as { cause?: unknown }).cause;
      if (e instanceof FetchError || cause instanceof FetchError) throw new FetchError("That address isn't allowed.");
      throw new FetchError("We couldn't load that link. Paste the text instead.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop === MAX_REDIRECTS) throw new FetchError("That link redirects too many times.");
      url = assertAllowedUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new FetchError(`The site returned an error (${res.status}). Paste the text instead.`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/(html|plain)|application\/xhtml/i.test(type)) throw new FetchError("That link isn't a readable article. Paste the text instead.");
    const body = await readCapped(res.body as ReadableStream<Uint8Array> | null);
    const text = /html/i.test(type) ? htmlToText(body) : body;
    if (text.length < 40) throw new FetchError("We couldn't find readable text on that page. Paste the text instead.");
    return text;
  }
  throw new FetchError("That link redirects too many times.");
}

async function readCapped(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FetchError("That page is too large to read (over 1 MB). Paste the text instead.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
