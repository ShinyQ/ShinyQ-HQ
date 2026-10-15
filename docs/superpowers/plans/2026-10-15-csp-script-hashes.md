# CSP Script Hashes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No page of the static export runs under a script policy with `'unsafe-inline'` (Round 7 sub-project D, security assessment F1.9).

**Architecture:** A post-build step (`scripts/csp-hashes.ts`, last step of `bun run build`) walks `out/**/*.html`, hashes every executable inline `<script>` body (sha256, base64) and inserts right after `<meta charSet="utf-8"/>` (before any script) a `<meta http-equiv="Content-Security-Policy" content="script-src ...; worker-src ..." data-hq-csp=""/>`. Its `script-src` is the site policy's `script-src` (read from `out/_headers`) minus `'unsafe-inline'`, plus the page's hashes; `worker-src` repeats the site value because a meta policy without it falls back to its own `script-src` and would block troika's `blob:` workers. The `_headers` CSP stays unchanged (frame-ancestors and every directive a meta tag cannot set); browsers enforce both policies, so inline scripts follow the strict meta policy. The step verifies every page afterwards and exits 1 on any problem; `scan-export.ts`, `e2e/deploy.spec.ts` and `deploy-smoke.ts` re-check the shipped artifact and production.

**Tech Stack:** Bun scripts (node:crypto, node:fs), Vitest, Playwright.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, docs, commits, PR text.
- Rejected approaches (do not implement): per-route hashes in `_headers` (Cloudflare limits: 100 rules, header length, 168+ routes), a nonce middleware (a Function on every page view).
- `public/_headers` stays byte for byte; `tests/unit/csp.test.ts` literal `SITE_CSP` stays.
- No new runtime dependency. No change to the aesthetic.
- Budgets stay green: Classic JS gate 240 KB, Lighthouse document size 80 KB (`lighthouserc.json`), share tags within the first 8 KB (`UNFURL_HEAD_BYTES`, `og:check`).
- The hash step runs after every step that edits HTML (`defer-scripts.ts`, `root-redirect.ts`); nothing after it may edit HTML.
- Every PR updates `docs/deploy.md` (section 9 security) and AGENTS.md where conventions change.
- CI capacity is shared: before every push run `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`; push only when no other PR CI run is active. One CI run of ours at a time. Do not merge.

---

### Task 1: Post-build hash step and its unit tests

**Files:**
- Create: `scripts/csp-hashes.ts`
- Create: `tests/unit/csp-hashes.test.ts`
- Modify: `package.json` (`build` and `build:web`: append `&& bun scripts/csp-hashes.ts` after `bun scripts/check-client-chunks.ts`)

**Interfaces:**
- Produces (all exported from `scripts/csp-hashes.ts`):
  - `CSP_MARKER = "data-hq-csp"`
  - `htmlFiles(dir: string): string[]`
  - `inlineScripts(html: string): string[]` bodies of executable inline scripts in document order
  - `scriptHash(body: string): string` returns `'sha256-<base64>'` (with the single quotes)
  - `sitePolicy(headers: string): string` the CSP value of the `/*` block of a `_headers` file
  - `pagePolicy(site: string, hashes: readonly string[]): string`
  - `addScriptPolicy(html: string, site: string): string` idempotent
  - `scriptPolicyProblems(html: string, site?: string): string[]` empty when the page is fine
  - `exportPolicyProblems(dir: string): string[]` problems of every HTML file under `dir`, prefixed with the relative path; reads `dir/_headers`

- [ ] **Step 1: Write the failing tests** in `tests/unit/csp-hashes.test.ts`:

```ts
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
```

Also export `cfBeaconScript` from `src/components/Analytics.tsx` if it is not exported already (check first; keep its behavior).

- [ ] **Step 2: Run to verify it fails**

Run: `bunx vitest run tests/unit/csp-hashes.test.ts`
Expected: FAIL (module `scripts/csp-hashes` not found).

- [ ] **Step 3: Implement `scripts/csp-hashes.ts`**

```ts
/**
 * Post-build (last step of `bun run build`): a script policy without 'unsafe-inline' for every page of
 * the static export (security assessment F1.9, Round 7 D).
 *
 * For each out/**\/*.html it hashes every executable inline <script> (sha256 of the body as the HTML
 * parser sees it) and inserts right after <meta charSet="utf-8"/>, before any script:
 *   <meta http-equiv="Content-Security-Policy" content="script-src ...; worker-src ..." data-hq-csp=""/>
 * script-src is the site policy's script-src from out/_headers minus 'unsafe-inline', plus the page's
 * hashes. worker-src repeats the site value: a meta policy without it falls back to its own script-src,
 * which would block troika's blob: workers. The _headers policy keeps applying (frame-ancestors and every
 * directive a meta tag cannot set); browsers enforce both, so an inline script runs only when its hash is
 * listed. Then it checks every page and exits 1 on any problem, so the build fails when an inline script
 * lacks its hash. It must run after every step that edits HTML (defer-scripts, root-redirect).
 *
 * Usage: bun scripts/csp-hashes.ts [--dir out]
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CSP_MARKER = "data-hq-csp";
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const OUR_META_RE = /<meta http-equiv="Content-Security-Policy" content="[^"]*" data-hq-csp=""\/>/g;
const ANY_META_RE = /<meta\b[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi;
const CHARSET_RE = /<meta charset="utf-8"\s*\/?>/i;
const HEAD_RE = /<head\b[^>]*>/i;
/** Types the browser executes (and CSP checks): classic and module scripts, import maps, speculation rules. */
const EXECUTABLE_TYPE = /^(|module|importmap|speculationrules|(text|application)\/(x-)?(java|ecma)script)$/i;

const attr = (attrs: string, name: string) => new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);

export function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return htmlFiles(file);
    return name.endsWith(".html") ? [file] : [];
  });
}

export function inlineScripts(html: string): string[] {
  const bodies: string[] = [];
  for (const [, attrs, body] of html.matchAll(SCRIPT_RE)) {
    if (attr(attrs, "src")) continue;
    const type = attr(attrs, "type");
    const value = (type?.[1] ?? type?.[2] ?? type?.[3] ?? "").trim();
    if (EXECUTABLE_TYPE.test(value)) bodies.push(body);
  }
  return bodies;
}

export function scriptHash(body: string): string {
  return `'sha256-${createHash("sha256").update(body.replace(/\r\n?/g, "\n"), "utf8").digest("base64")}'`;
}

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [name.toLowerCase(), values]),
  );
}

export function sitePolicy(headers: string): string {
  const lines = headers.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "/*");
  if (start < 0) throw new Error("csp-hashes: no /* block in _headers");
  for (const line of lines.slice(start + 1)) {
    if (!/^\s/.test(line) && line.trim()) break;
    const m = /^\s*Content-Security-Policy:\s*(.+)$/.exec(line);
    if (m) return m[1].trim();
  }
  throw new Error("csp-hashes: the /* block of _headers has no Content-Security-Policy");
}

export function pagePolicy(site: string, hashes: readonly string[]): string {
  const d = directives(site);
  const script = d.get("script-src");
  if (!script) throw new Error("csp-hashes: the site policy has no script-src");
  const worker = d.get("worker-src");
  if (!worker) throw new Error("csp-hashes: the site policy has no worker-src");
  const sources = script.filter((s) => s !== "'unsafe-inline'" && s !== "'unsafe-hashes'" && !s.startsWith("'sha256-"));
  return `script-src ${[...sources, ...hashes].join(" ")}; worker-src ${worker.join(" ")}`;
}

export function addScriptPolicy(html: string, site: string): string {
  const clean = html.replace(OUR_META_RE, "");
  const head = HEAD_RE.exec(clean);
  if (!head) throw new Error("csp-hashes: no <head>");
  const charset = CHARSET_RE.exec(clean);
  const at = charset && charset.index > head.index ? charset.index + charset[0].length : head.index + head[0].length;
  const first = clean.search(/<script\b/i);
  if (first >= 0 && first < at) throw new Error("csp-hashes: a script comes before the policy insertion point");
  const hashes = [...new Set(inlineScripts(clean).map(scriptHash))];
  const meta = `<meta http-equiv="Content-Security-Policy" content="${pagePolicy(site, hashes)}" ${CSP_MARKER}=""/>`;
  return clean.slice(0, at) + meta + clean.slice(at);
}

const snippet = (body: string) => JSON.stringify(body.trim().slice(0, 40));

export function scriptPolicyProblems(html: string, site?: string): string[] {
  const problems: string[] = [];
  const metas = [...html.matchAll(ANY_META_RE)];
  const ours = metas.filter((m) => m[0].includes(CSP_MARKER));
  if (ours.length === 0) return ["no data-hq-csp script policy"];
  if (metas.length !== 1) problems.push(`expected one policy meta tag, found ${metas.length}`);
  const tag = ours[0];
  const policy = /content="([^"]*)"/.exec(tag[0])?.[1] ?? "";
  const script = directives(policy).get("script-src") ?? [];
  if (script.includes("'unsafe-inline'")) problems.push("script-src allows 'unsafe-inline'");
  const first = html.search(/<script\b/i);
  if (first >= 0 && first < tag.index) problems.push("a script comes before the policy");
  const end = html.search(/<\/head>/i);
  if (end >= 0 && tag.index > end) problems.push("the policy is outside <head>");
  const listed = new Set(script);
  inlineScripts(html).forEach((body, i) => {
    if (!listed.has(scriptHash(body))) problems.push(`missing hash for inline script #${i + 1} ${snippet(body)}`);
  });
  if (site) {
    const expected = pagePolicy(site, [...new Set(inlineScripts(html).map(scriptHash))]);
    if (policy !== expected) problems.push("the script policy differs from the one derived from _headers");
  }
  const markup = html.replace(SCRIPT_RE, "<script></script>");
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(markup)) problems.push("inline event handler attribute (blocked without 'unsafe-hashes')");
  if (/\s(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i.test(markup)) problems.push("javascript: URL (blocked by the script policy)");
  return problems;
}

export function exportPolicyProblems(dir: string): string[] {
  const site = sitePolicy(readFileSync(path.join(dir, "_headers"), "utf8"));
  return htmlFiles(dir).flatMap((file) => scriptPolicyProblems(readFileSync(file, "utf8"), site).map((p) => `${path.relative(dir, file)}: ${p}`));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dirIndex = args.indexOf("--dir");
  const dir = path.resolve(dirIndex >= 0 ? args[dirIndex + 1] : "out");
  const site = sitePolicy(readFileSync(path.join(dir, "_headers"), "utf8"));
  const files = htmlFiles(dir);
  let added = 0;
  let maxHashes = 0;
  for (const file of files) {
    const before = readFileSync(file, "utf8");
    const after = addScriptPolicy(before, site);
    maxHashes = Math.max(maxHashes, new Set(inlineScripts(after).map(scriptHash)).size);
    added += Buffer.byteLength(after) - Buffer.byteLength(before.replace(OUR_META_RE, ""));
    if (after !== before) writeFileSync(file, after);
  }
  const problems = exportPolicyProblems(dir);
  if (problems.length) {
    for (const p of problems) console.error(`csp-hashes: ${p}`);
    process.exit(1);
  }
  console.log(`csp-hashes: ${files.length} HTML files carry a script policy without 'unsafe-inline' (at most ${maxHashes} hashes per page, ${Math.round(added / files.length)} bytes per page on average)`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run tests/unit/csp-hashes.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into the build and run it**

Append ` && bun scripts/csp-hashes.ts` to both `build` and `build:web` in `package.json` (after `bun scripts/check-client-chunks.ts`). Run `bun run build`; expect the `csp-hashes:` line with 171 files and exit 0. Then run `bun run og:check` (share tags still in the first 8 KB) and `bunx vitest run tests/unit` (root-redirect, defer-scripts, csp tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add scripts/csp-hashes.ts tests/unit/csp-hashes.test.ts package.json src/components/Analytics.tsx
git commit -m "feat(security): per-page script policy with sha256 hashes, no unsafe-inline (F1.9)"
```

### Task 2: Guards on the shipped artifact and in the browser

**Files:**
- Modify: `scripts/scan-export.ts` (after the blocklist scan: `exportPolicyProblems(dir)`; each problem as `::error::csp: <problem>`, a job summary line, `failed = true`; on success log `Script policy: every page lists its inline script hashes.`)
- Modify: `tests/unit/scan-export.test.ts` only if it snapshots output (check)
- Modify: `e2e/deploy.spec.ts` (new test: `expect(exportPolicyProblems(outDir)).toEqual([])`)
- Modify: `scripts/deploy-smoke.ts` (`smokeProblems`: when `/en` returned 200, push `/en: <problem>` for each `scriptPolicyProblems(p.html)`; no site argument, production HTML may carry Cloudflare-injected external scripts) and `tests/unit/deploy-smoke.test.ts` (fixtures: give the passing `/en` HTML a valid policy via `addScriptPolicy`, add a case where a missing policy is reported)
- Modify: `e2e/hq.ts` (`collectErrors` also records console messages that report a CSP violation; new `collectCspViolations`)
- Create: `e2e/csp.spec.ts`
- Modify: `e2e/ask.spec.ts` (Turnstile test asserts no CSP violation)
- Modify: `scripts/e2e-plan.ts` (`ALL_SPECS` gets `"csp"`; rule `^scripts\/csp-hashes\.ts$` to `["csp", "deploy", "static-routes", "boot-first"]`; add `"csp"` to the `_headers` rule and to the `src/lib/boot-first.ts`/`Analytics.tsx` paths via a rule `^src\/(lib\/boot-first|components\/Analytics|app\/\(root\)\/page)\.tsx?$` to `["csp", "boot-first", "static-routes"]` placed before the generic `src/(app|components)` and `src/lib` rules)

**Interfaces:**
- Consumes: `exportPolicyProblems`, `scriptPolicyProblems`, `addScriptPolicy`, `sitePolicy` from `scripts/csp-hashes.ts` (Task 1).
- Produces: `collectCspViolations(page: Page): Promise<string[]>` in `e2e/hq.ts`.

- [ ] **Step 1: e2e helper** in `e2e/hq.ts`:

```ts
/** Console text of a Content-Security-Policy violation (Chromium logs "Refused to ... Content Security Policy"). */
const CSP_CONSOLE = /Content Security Policy|Refused to (execute|load|create|evaluate)/i;

/**
 * Every CSP violation of the page and its frames, across navigations: a `securitypolicyviolation`
 * listener installed before any page script reports through an exposed binding.
 */
export async function collectCspViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  await page.exposeBinding("__hqCspViolation", (_source, text: string) => void violations.push(text));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const report = (window as unknown as { __hqCspViolation?: (t: string) => void }).__hqCspViolation;
      report?.(`${e.violatedDirective} blocked ${e.blockedURI || "inline"} at ${e.sourceFile || location.pathname}:${e.lineNumber} (${e.sample || ""})`);
    });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error" && CSP_CONSOLE.test(msg.text())) violations.push(msg.text());
  });
  return violations;
}
```

In `collectErrors` add (sync, so every spec that already collects errors also fails on a CSP violation):

```ts
  page.on("console", (msg) => {
    if (msg.type() === "error" && CSP_CONSOLE.test(msg.text())) errors.push(`CSP: ${msg.text()}`);
  });
```

- [ ] **Step 2: Write `e2e/csp.spec.ts`**

```ts
import { expect, test, type Page } from "@playwright/test";
import { asReturningVisitor, collectCspViolations, enterHQ, openPage, waitForFloor, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";
import { LOCALES, staticRoutes } from "./routes";

/** The page's effective script policy: exactly one data-hq-csp meta, no 'unsafe-inline'. */
async function expectStrictPolicy(page: Page) {
  const policies = await page.locator('meta[http-equiv="Content-Security-Policy"]').evaluateAll((els) => els.map((el) => el.getAttribute("content") ?? ""));
  expect(policies).toHaveLength(1);
  expect(policies[0]).toMatch(/^script-src 'self' /);
  expect(policies[0]).not.toContain("'unsafe-inline'");
}

for (const locale of LOCALES) {
  for (const route of staticRoutes(locale)) {
    test(`Classic ${route} runs with no CSP violation`, async ({ page }) => {
      const violations = await collectCspViolations(page);
      await openPage(page, `${route}?tier=static`);
      await expectStrictPolicy(page);
      expect(violations).toEqual([]);
    });
  }
}

test("the 404 page runs with no CSP violation", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await page.goto("/en/no-such-page");
  await expectStrictPolicy(page);
  await page.waitForLoadState("load");
  expect(violations).toEqual([]);
});

test("client-side navigation injects no blocked script", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await openPage(page, "/en?tier=static");
  await page.getByRole("banner").getByRole("link", { name: "Work", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/labs/);
  await page.getByRole("banner").getByRole("link", { name: "Journey", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/journey/);
  expect(violations).toEqual([]);
});

test("the / language redirect still runs under the strict policy", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await page.addInitScript(() => localStorage.setItem("hq:locale", "id"));
  await page.goto("/");
  await expect(page).toHaveURL(/\/id$/);
  expect(violations).toEqual([]);
});

test("the CV viewer opens with no CSP violation", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await openPage(page, "/en/contact?tier=static");
  await page.locator("main").getByRole("link", { name: /CV/ }).first().click();
  await expect(page.getByRole("dialog").getByRole("img").first()).toBeVisible();
  expect(violations).toEqual([]);
});

test("the 3D boot, intro and an elevator ride run with no CSP violation", async ({ page }) => {
  test.slow();
  const violations = await collectCspViolations(page);
  await page.goto("/en?tier=lite");
  await waitForHQ(page);
  const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
  await expect(start).not.toHaveAttribute("aria-disabled", "true");
  await start.click();
  await waitForPhase(page, "explore", 60_000);
  await waitForSceneLive(page);
  await page.getByRole("navigation", { name: "Elevator" }).locator('[data-floor="L3"]').click();
  await waitForFloor(page, "L3", 180_000);
  expect(violations).toEqual([]);
});

test("a returning 3D visit with a floor deep link has no CSP violation", async ({ page }) => {
  const violations = await collectCspViolations(page);
  await asReturningVisitor(page);
  await enterHQ(page, { path: "/en/library" });
  expect(violations).toEqual([]);
});
```

Adjust selectors to the real UI when a step fails for a selector reason (CV entry label: check `CvButton` and `messages/en.json`; the onboarding dialog may need `hq:onboarded=done` via an init script so it does not cover the elevator panel; nav link names from `messages/en.json` `nav`). Never weaken the `violations` assertions.

- [ ] **Step 3: Ask with Turnstile.** In `e2e/ask.spec.ts` test "Turnstile: lazy script, invisible widget, token in the POST": add `const csp = await collectCspViolations(page);` as the first line and `expect(csp).toEqual([]);` at the end.

- [ ] **Step 4: Artifact guards.** `scan-export.ts`, `e2e/deploy.spec.ts`, `deploy-smoke.ts` (+ its unit test) as listed under Files. Add a unit test to `tests/unit/csp-hashes.test.ts` for `exportPolicyProblems` using a temp dir (`mkdtempSync`) with `_headers` copied from `public/_headers`, one good page and one page with an unhashed script; expect exactly one problem prefixed with the bad file's relative path.

- [ ] **Step 5: e2e plan.** Update `scripts/e2e-plan.ts` as listed; run `bunx vitest run tests/unit/e2e-plan.test.ts`.

- [ ] **Step 6: Verify.** `bun run verify:quick`, then `E2E_PORT=<free port> bunx playwright test e2e/csp.spec.ts e2e/deploy.spec.ts e2e/ask.spec.ts e2e/boot-first.spec.ts e2e/static-routes.spec.ts e2e/seo.spec.ts`. All green.

- [ ] **Step 7: Commit**

```bash
git add e2e scripts tests
git commit -m "test(security): CSP violation e2e and script policy guards on the export and production"
```

### Task 3: Documentation

**Files:**
- Modify: `docs/deploy.md` section 9 (the `/*` bullet: replace the sentence that says `script-src` needs `'unsafe-inline'` with how the two policies combine; add a bullet for the per-page meta policy: generated by `scripts/csp-hashes.ts` as the last build step, what it contains, why `worker-src` is repeated, the guards (`csp-hashes` exit 1, `scan-export.ts`, `e2e/deploy.spec.ts`, `deploy-smoke.ts`, `e2e/csp.spec.ts`), and the rules: never add an inline event handler or `javascript:` URL, never inject an inline script at runtime, and keep Cloudflare zone features that rewrite HTML (Rocket Loader, HTML minification with script changes) off)
- Modify: `AGENTS.md` (folder layout `scripts/` list: a `csp-hashes.ts` line next to `root-redirect.ts`; the game-first paragraph sentence "The script runs under the existing `script-src 'unsafe-inline'` CSP; if that is ever removed, add its sha256 to `public/_headers`." becomes "Its sha256 lands in the page's script policy through `scripts/csp-hashes.ts` (see Ask the HQ, CSP)."; the Ask the HQ "CSP:" bullet: add the per-page meta policy and that `script-src` effectively has no `'unsafe-inline'`)
- Modify: `src/components/Analytics.tsx` doc comment (it cites `script-src 'unsafe-inline'`; say the loader's hash is added by `scripts/csp-hashes.ts`)
- Modify: `docs/features.md` CI/security list if it lists post-build steps (check with grep for `root-redirect`)

- [ ] **Step 1:** Make the edits. No em dashes.
- [ ] **Step 2:** `bunx vitest run tests/unit` (the em dash scan) passes.
- [ ] **Step 3: Commit** `docs: per-page script policy without unsafe-inline (F1.9)`.

## Done when

- `bun run build` prints `csp-hashes:` for every HTML file and fails when an inline script lacks its hash.
- `e2e/csp.spec.ts`, `e2e/ask.spec.ts` Turnstile test and `e2e/deploy.spec.ts` are green; CI is green.
- The effective script policy of `/`, `/en` and a case-study page has no `'unsafe-inline'`.
