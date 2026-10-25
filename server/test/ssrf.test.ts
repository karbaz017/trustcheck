import { describe, expect, it } from "vitest";
import { assertAllowedUrl, htmlToText, isUnsupportedSite } from "../src/pipeline/fetchUrl.js";
import { isPrivateAddress } from "../src/util/ssrf.js";

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "224.0.0.1", "192.0.0.8", "192.0.2.10", "198.51.100.7", "203.0.113.9", "garbage"])("blocks %s", (a) =>
    expect(isPrivateAddress(a)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.0.66.125", "192.0.78.9", "2606:4700:4700::1111"])("allows %s", (a) => expect(isPrivateAddress(a)).toBe(false));
});

describe("assertAllowedUrl", () => {
  it("rejects non-http schemes, private literals and social sites", () => {
    expect(() => assertAllowedUrl("file:///etc/passwd")).toThrow();
    expect(() => assertAllowedUrl("ftp://example.com")).toThrow();
    expect(() => assertAllowedUrl("http://127.0.0.1:8080")).toThrow();
    expect(() => assertAllowedUrl("http://169.254.169.254/latest/meta-data")).toThrow();
    expect(() => assertAllowedUrl("http://[::1]/")).toThrow();
    expect(() => assertAllowedUrl("https://www.youtube.com/watch?v=x")).toThrow(/Paste the text/);
    expect(() => assertAllowedUrl("https://twitter.com/a/status/1")).toThrow(/Paste the text/);
    expect(() => assertAllowedUrl("not a url")).toThrow();
  });
  it("allows normal article links", () => {
    expect(assertAllowedUrl("https://www.reuters.com/markets/a").hostname).toBe("www.reuters.com");
  });
  it("social match is by domain, not substring", () => {
    expect(isUnsupportedSite("m.facebook.com")).toBe(true);
    expect(isUnsupportedSite("notfacebook.com")).toBe(false);
  });
});

describe("htmlToText", () => {
  it("strips scripts, styles and tags", () => {
    const t = htmlToText("<html><script>alert(1)</script><style>p{}</style><p>Hello &amp; welcome</p><div>World</div></html>");
    expect(t).toContain("Hello & welcome");
    expect(t).toContain("World");
    expect(t).not.toMatch(/alert|<|p\{\}/);
  });
});

describe("fetchArticle", () => {
  it("FetchError keeps its name so the real reason reaches the user", async () => {
    const { FetchError } = await import("../src/pipeline/fetchUrl.js");
    const e = new FetchError("x blocks automated readers (HTTP 403)");
    expect(e.name).toBe("FetchError");
    expect(e).toBeInstanceOf(Error);
  });
});
