import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addScriptPolicy, CSP_MARKER, inlineScripts, pagePolicy, scriptHash, scriptPolicyProblems, sitePolicy } from "../../scripts/csp-hashes";
import { cfBeaconScript } from "../../src/components/Analytics";

const SITE = sitePolicy(readFileSync(path.join(process.cwd(), "public", "_headers"), "utf8"));
const page = (head: string, body = "") => `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/>${head}</head><body>${body}</body></html>`;
const meta = (html: string) => /<meta http-equiv="Content-Security-Policy" content="([^"]*)" data-hq-csp=""\/>/.exec(html)?.[1];

describe("scriptHash", () => {
  it("is the CSP sha256 source of the exact body", () => {
    expect(scriptHash("alert(1)")).toBe("'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='");
  });
  it("normalizes CR LF like the HTML parser", () => {
    expect(scriptHash("a\r\nb")).toBe(scriptHash("a\nb"));
    expect(scriptHash("a\nb")).toBe("'sha256-fhj3NzEbLcOy8mndeDlrA1HxT7Zu+oefdoyyMYGIPHg='");
  });
});

describe("inlineScripts", () => {
  it("returns executable inline bodies only", () => {
    const html = page(
      `<script>a()</script><script src="/x.js" async=""></script><script type="application/ld+json">{"@type":"Person"}</script><script type="module">b()</script><script id="_R_">c()</script><script type="text/javascript">d()</script><script type="application/json">{}</script>`,
    );
    expect(inlineScripts(html)).toEqual(["a()", "b()", "c()", "d()"]);
  });
});

describe("sitePolicy and pagePolicy", () => {
  it("reads the /* block CSP from _headers", () => {
    expect(SITE).toContain("frame-ancestors 'none'");
    expect(SITE).toContain("'unsafe-inline'");
  });
  it("drops 'unsafe-inline', keeps the script hosts, adds hashes and repeats worker-src", () => {
    expect(pagePolicy(SITE, ["'sha256-AAA='"])).toBe(
      "script-src 'self' https://static.cloudflareinsights.com https://challenges.cloudflare.com 'sha256-AAA='; worker-src 'self' blob:",
    );
  });
  it("fails without script-src or worker-src", () => {
    expect(() => pagePolicy("default-src 'self'; worker-src 'self'", [])).toThrow(/script-src/);
    expect(() => pagePolicy("script-src 'self'", [])).toThrow(/worker-src/);
  });
});

describe("addScriptPolicy", () => {
  const html = page(`<script data-hq-hoisted="">r()</script><link rel="stylesheet" href="/a.css"/>`, `<script>self.__next_f.push([1,"x"])</script><script>r()</script>`);

  it("inserts the policy right after the charset, before every script, with one hash per distinct body", () => {
    const out = addScriptPolicy(html, SITE);
    expect(out.indexOf(CSP_MARKER)).toBeLessThan(out.indexOf("<script"));
    expect(out.indexOf('<meta charSet="utf-8"/><meta http-equiv="Content-Security-Policy"')).toBeGreaterThan(0);
    const policy = meta(out)!;
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy.match(/'sha256-/g)).toHaveLength(2);
    expect(policy).toContain(scriptHash("r()"));
    expect(policy).toContain(scriptHash('self.__next_f.push([1,"x"])'));
    expect(scriptPolicyProblems(out, SITE)).toEqual([]);
  });

  it("is idempotent and recomputes after a body changes", () => {
    const once = addScriptPolicy(html, SITE);
    expect(addScriptPolicy(once, SITE)).toBe(once);
    const edited = addScriptPolicy(once.replace("r()</script></body>", "q()</script></body>"), SITE);
    expect(edited.match(/data-hq-csp/g)).toHaveLength(1);
    expect(meta(edited)).toContain(scriptHash("q()"));
    expect(scriptPolicyProblems(edited, SITE)).toEqual([]);
  });

  it("hashes the production analytics loader", () => {
    const body = cfBeaconScript("token123");
    const out = addScriptPolicy(page("", `<script id="hq-cf-beacon">${body}</script>`), SITE);
    expect(meta(out)).toContain(scriptHash(body));
  });

  it("falls back to the top of <head> without a charset and fails without <head>", () => {
    const out = addScriptPolicy("<html><head><script>a()</script></head></html>", SITE);
    expect(out.startsWith('<html><head><meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(() => addScriptPolicy("<html><body></body></html>", SITE)).toThrow(/<head>/);
  });
});

describe("scriptPolicyProblems", () => {
  const ok = addScriptPolicy(page("<script>a()</script>"), SITE);

  it("flags a page without the policy", () => {
    expect(scriptPolicyProblems(page("<script>a()</script>"))).toEqual([expect.stringMatching(/no data-hq-csp/)]);
  });
  it("flags an inline script whose hash is missing", () => {
    const added = ok.replace("</body>", "<script>evil()</script></body>");
    expect(scriptPolicyProblems(added)).toEqual([expect.stringMatching(/missing hash .*evil\(\)/)]);
  });
  it("flags 'unsafe-inline', a script before the policy and a second policy", () => {
    expect(scriptPolicyProblems(ok.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"))).toContainEqual(expect.stringMatching(/unsafe-inline/));
    expect(scriptPolicyProblems(ok.replace("<head>", "<head><script>a()</script>"))).toContainEqual(expect.stringMatching(/before the policy/));
    expect(scriptPolicyProblems(ok.replace("</head>", '<meta http-equiv="Content-Security-Policy" content="script-src *"/></head>'))).toContainEqual(expect.stringMatching(/one policy/));
  });
  it("flags inline event handlers and javascript: URLs, but not text inside scripts", () => {
    expect(scriptPolicyProblems(ok.replace("<body>", '<body><img src="x" onerror="a()"/>'))).toContainEqual(expect.stringMatching(/event handler/));
    expect(scriptPolicyProblems(ok.replace("<body>", '<body><a href="javascript:a()">x</a>'))).toContainEqual(expect.stringMatching(/javascript:/));
    const inScript = addScriptPolicy(page("", `<script>var s='<img onerror="x">'</script>`), SITE);
    expect(scriptPolicyProblems(inScript, SITE)).toEqual([]);
  });
  it("with the site policy, flags script sources that drifted from _headers", () => {
    expect(scriptPolicyProblems(ok.replace(" https://challenges.cloudflare.com", ""), SITE)).toContainEqual(expect.stringMatching(/differs from/));
  });
});
