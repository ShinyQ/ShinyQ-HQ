# Round 5 P1: Page View and Delivery Implementation Plan

Status: shipped in #83 (b5e27da), 2026-10-13

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Page View and the game-first boot lighter and clearer without changing the 3D look: zod off the client, a stable Lighthouse gate, cached and subset delivery assets, a quiet boot that only downloads what the first 3D frame needs, a boot card that says who the owner is, a silent Page View, a cleaner landing (motto, portrait, equal-height featured cards, sharp images).

**Architecture:** Small, independent changes on the static export: a zod-free locale module plus a post-build chunk gate; LHCI warm-up URL; `_headers` cache rules over content-hashed troika fonts; CSS `content-visibility` and idle-gated fetches during the boot; SSR boot card content with a zero-JS `?view=page` link handled by the inline head script; responsive `srcset` images from a committed 1200 px rendition. Every task measures before/after with the same scripts and gates pixels with a screenshot diff.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript, Tailwind 4, three.js + R3F + troika-three-text 0.52, Bun, Vitest, Playwright (SwiftShader), Lighthouse CI 0.15.1, fonttools (pyftsubset), libwebp (cwebp), Cloudflare Pages `_headers`.

## Global Constraints

- Source of truth: `/Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/plan.md` (round 5, workstream P1) and `files/perf-report/REPORT.md` (ids SP1, SP3, SP10, A1.1, A1.3, A2.1, A2.3, A2.8, A4.4, A4.7, spec gaps 2, 11, 14, 18, 23).
- The aesthetic must not change: rover, neon look, bloom, holograms, missions and the intro stay. Every task that can change pixels has a before/after screenshot-diff step (desktop full 1440x900 and 2560x1440, phone lite 390x844, same camera poses) with an explicit threshold and a rollback note. Intended pixel changes (boot card, landing hero, featured cards, sharper images, motto text) are listed in the task and attached to the PR, never hidden behind a threshold.
- Boot screen (owner decision): headline and role on the server-rendered boot card plus a small "Page view" link; Boot rover click and the full, unskippable 2.5 s intro stay.
- Lighthouse CI budgets stay green: LCP 2000 ms, CLS 0.01, TBT 200 ms, JS 240 KB (245,760 B), CSS 20 KB, fonts 60 KB, HTML 80 KB. CI budgets are authoritative (coordinator default).
- Render budgets stay green: < 150 draw calls and < 30k triangles per floor; L1 cap 140, RF cap 80.
- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text. EN and ID for every user-facing string; ID uses "saya" only in body text, never in mottos or taglines (owner rule: no first-person in mottos or taglines, EN and ID).
- No new runtime dependency. Dev tools used: fonttools 4.x (`pyftsubset`), libwebp (`cwebp`), Chrome for LHCI.
- Public repo: the owner portrait is the only photo allowed (C5 revised by the owner on 2026-10-13); no EXIF/XMP metadata in committed images.
- Local e2e port for this workstream: 4430 (`E2E_PORT=4430`). Fast verification: `bun run verify:quick` then `E2E_PORT=4430 bun run e2e:changed`. Never run two e2e suites at once.
- Measure before and after with the same method and record the numbers in the PR body: initial JS gz (LHCI `/en` script bytes), bytes before the first 3D frame, Lighthouse LCP/TBT/CLS for the 4 LHCI URLs.
- Update README, AGENTS.md and the relevant spec appendices in the task that changes the behavior.

## Parallel workstreams and rebase notes

P1 shares files with other round 5 workstreams (from plan.md). Rebase on `origin/main` before every push; resolve as below.

| File | Also touched by | P1 change | Rebase note |
|---|---|---|---|
| `src/experience/Experience.tsx` | P2 (precompile), P3 (pause when covered, error boundary), P4 (perf marks), P6 (precompile during boot/intro) | `FirstFrame` always calls `markFirstFrame()`; `resetFirstFrame()` in the audio effect cleanup | Keep both sides; P1 lines are 4 lines inside `FirstFrame` and 1 line in the cleanup at the `audio.setPaused(true)` call |
| `src/experience/tower/primitives.tsx` | P2 (batched labels), P3 (geometry disposal) | `FONTS` reads `troika-fonts.json` | Only the `FONTS` object changes; keep their geometry edits |
| `src/experience/text-config.ts` | P2 (troika worker or typesetting) | `defaultFontURL` from the manifest | One line |
| `src/app/globals.css` | P3 (backdrop-filter policy), P6 (Page view icon) | boot section: `content-visibility`, `.hq-boot-who`, `.hq-boot-page` | P1 edits stay inside the "Game-first load" block |
| `src/hud/Hud.tsx`, `src/hud/Controls.tsx` | P6 (Page view icon in the top bar), P7 (reset view, hints) | Hud: `BootOverlay` props; Controls: one import line (`LOCALES`) | Trivial |
| `src/hud/BootOverlay.tsx`, `src/components/BootCard.tsx` | P6 if it reuses the icon on the boot card | who block and Page view link | If P6 lands first, put its icon inside `.hq-boot-page` |
| `messages/en.json`, `messages/id.json` | P5, P6, P7 | remove `home.hero.welcome` | Re-run `bun run test` (identical keys test) |
| `content/site-content.json` | P5 (CV refresh) | `profile.subheadline` (owner motto) and two ID pod taglines | P1 owns `profile.subheadline`; P5 must not overwrite it. If P5 adds characters outside Latin-1, rerun `bun scripts/troika-fonts.ts` (coverage test fails until then) |
| `lighthouserc.json`, `package.json` (`build`), `scripts/deploy-smoke.ts`, `docs/superpowers/specs/agent-hq/08-quality-acceptance.md`, `docs/deploy.md` | P4 (3D bytes gate SP6, per-chunk diff, deploy reuse, spec 08 budgets) | warm-up URL + `assertMatrix`; build chain appends `root-redirect.ts` and `check-client-chunks.ts`; `cacheProblems`; doc sections | Keep both post-build steps in the chain; merge `assertMatrix` keys if P4 adds assertions |
| `src/lib/boot-first.ts`, `e2e/boot-first.spec.ts` | P4 (game-first timeline marks, SP2) | `takePageViewParam` in the head script; quiet boot and boot card tests | Keep both; marks and the new param code do not overlap |
| `playwright.config.ts`, `scripts/e2e-plan.ts`, `tests/unit/e2e-plan.test.ts` | P2, P4 (new specs) | `delivery-visual.spec.ts` in `SCREENSHOT_SPECS`; new rules | Union of the lists. If P2 already ships a screenshot-diff tool, reuse it and drop `scripts/shot-diff.ts` from Task 0 |
| `src/lib/jsonld.ts`, `src/lib/og-cards.ts` | P9 (share images) | Person `image` | og cards read `profile.subheadline`, so the new motto reaches the share images on the next build; P9 owns their layout |
| `AGENTS.md`, `README.md`, spec appendices | all | per task | Rebase text; keep both bullets |

## File Structure

Create:
- `src/content/locales.ts`: `LOCALES`, `DEFAULT_LOCALE`, `Locale` with no imports (client-safe).
- `scripts/check-client-chunks.ts`: post-build gate, fails when zod or the content loader reaches `out/_next/static/chunks`.
- `scripts/measure-delivery.ts`: local before/after numbers (initial JS, bytes before the first 3D frame, LHCI medians).
- `scripts/shot-diff.ts`: dependency-free PNG diff in Chromium.
- `e2e/delivery-visual.spec.ts`: opt-in captures (3D poses, Page View, boot card) for the diff.
- `scripts/troika-glyphs.ts`: pure in-world character scan and the troika unicode sets.
- `scripts/troika-fonts.ts`: subsets the troika fonts into `public/fonts/3d/<name>.<hash8>.woff` and writes `src/experience/troika-fonts.json`.
- `src/assets/fonts/troika/`: the five original troika WOFFs (moved from `public/fonts/`, subset inputs, not served).
- `tests/helpers/woff.ts`: WOFF 1.0 table reader and cmap parser.
- `src/experience/boot-signals.ts`: pure first-frame signal and `afterFirstFrameIdle`.
- `src/components/QuietLink.tsx`: next-intl `Link` that does not prefetch while the boot cover or the tower hides the page.
- `scripts/root-redirect.ts`: post-build hoist of the `/` redirect script above the stylesheet.
- `scripts/media-sizes.ts`: writes `<name>.w1200.webp` for every pod gallery image wider than 1200 px.
- `scripts/portrait.ts`, `src/lib/portrait.ts`, `src/components/page/Portrait.tsx`, `public/brand/kurniadi-ahmad-wijaya-{160,320,640}.webp`.
- Tests: `tests/unit/client-chunks.test.ts`, `tests/unit/locales.test.ts`, `tests/unit/lighthouserc.test.ts`, `tests/unit/measure-delivery.test.ts`, `tests/content/troika-fonts.test.ts`, `tests/unit/cache-headers.test.ts`, `tests/unit/boot-signals.test.ts`, `tests/unit/root-redirect.test.ts`, `tests/content/taglines.test.ts`, `tests/unit/portrait.test.ts`, `tests/unit/media-sizes.test.ts`.

Modify (main ones): `src/content/schema.ts`, `src/hud/Controls.tsx`, `src/components/LocaleSwitch.tsx`, `src/lib/url-sync.ts`, `src/i18n/routing.ts`, `src/lib/site.ts`, `package.json`, `lighthouserc.json`, `src/lib/audio/{engine,types}.ts`, `tests/unit/audio.test.ts`, `src/experience/{text-config.ts,tower/primitives.tsx,Experience.tsx,ExperienceGate.tsx,types.ts}`, `public/_headers`, `scripts/deploy-smoke.ts`, `src/app/globals.css`, `src/hud/drawer/DrawerHost.tsx`, `src/components/{NavLink,SiteHeader,BootCard,BootCover}.tsx`, `src/components/page/{Hero,Layout,Featured,Work}.tsx`, `src/components/Gallery.tsx`, `src/hud/{Hud,BootOverlay}.tsx`, `src/lib/boot-first.ts`, `src/app/(root)/page.tsx`, `src/app/[locale]/{layout,page}.tsx`, `src/app/[locale]/contact/page.tsx`, `src/content/{media,selectors,experience}.ts`, `src/lib/jsonld.ts`, `src/app/{landing,pageview}.css`, `content/site-content.json`, `messages/{en,id}.json`, e2e specs `boot-first`, `pageview`, `static-routes`, `playwright.config.ts`, `scripts/e2e-plan.ts`, docs.

Task order: 0 (baseline) first. 1, 2, 3, 5, 8 are independent. 4 must land before 9 (the 3D font diff must run before the motto changes in-world text). 6 before 7 (7 reuses the quiet-boot e2e). 11 before 12 (both edit `Featured.tsx`). 13 last.

---

### Task 0: Baseline numbers and the screenshot-diff harness

Measures main before any change and adds the tools every later task uses. No product behavior changes.

**Files:**
- Create: `scripts/measure-delivery.ts`, `scripts/shot-diff.ts`, `e2e/delivery-visual.spec.ts`, `tests/unit/measure-delivery.test.ts`
- Modify: `playwright.config.ts:10` (`SCREENSHOT_SPECS`), `scripts/e2e-plan.ts:51`, `tests/unit/e2e-plan.test.ts:78`

**Interfaces:**
- Produces: `bucketOf(url: string): string`, `sumByBucket(rows: readonly ResourceRow[], until?: number): Record<string, number>`, `lhciSummary(dir: string): LhciRow[]` (`scripts/measure-delivery.ts`); CLI `bun scripts/measure-delivery.ts --base <url> --label <name> [--lhci .lighthouseci] [--throttle]` and `--compare <a.json> <b.json>`; CLI `bun scripts/shot-diff.ts <dirA> <dirB> [--delta 24] [--max 0.005] [--only <prefix>]` (exit 1 when any pair is over `--max`); captures `screenshots/delivery/<SHOT_LABEL>/{3d-<floor>-<view>,page-<w>x<h>,boot-<w>x<h>}.png`.

- [x] **Step 1: Write the failing unit test**

`tests/unit/measure-delivery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bucketOf, sumByBucket } from "../../scripts/measure-delivery";

const at = (path: string, transferSize: number, responseEnd: number) => ({ url: `http://127.0.0.1:4430${path}`, transferSize, startTime: 0, responseEnd });

describe("measure-delivery", () => {
  it("buckets requests by what they are", () => {
    expect(bucketOf("http://x/_next/static/chunks/a1.js")).toBe("js");
    expect(bucketOf("http://x/_next/static/chunks/a1.css")).toBe("css");
    expect(bucketOf("http://x/_next/static/media/inter.woff2")).toBe("page-fonts");
    expect(bucketOf("http://x/fonts/3d/inter-latin-400-normal.0a1b2c3d.woff")).toBe("troika-fonts");
    expect(bucketOf("http://x/data/rooms/en.json")).toBe("rooms");
    expect(bucketOf("http://x/data/hud/index.json?v=1")).toBe("data");
    expect(bucketOf("http://x/en/labs.txt?_rsc=1")).toBe("rsc-prefetch");
    expect(bucketOf("http://x/media/voice-ai-contact-center/01-landing.thumb.webp")).toBe("images");
    expect(bucketOf("http://x/en")).toBe("other");
  });

  it("sums transfer bytes per bucket up to a time", () => {
    const rows = [at("/a.js", 100, 10), at("/b.js", 50, 30), at("/fonts/3d/x.woff", 20, 20)];
    expect(sumByBucket(rows, 25)).toEqual({ js: 100, "troika-fonts": 20, total: 120 });
    expect(sumByBucket(rows)).toEqual({ js: 150, "troika-fonts": 20, total: 170 });
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/measure-delivery.test.ts`
Expected: FAIL, "Failed to load url ../../scripts/measure-delivery".

- [x] **Step 3: Write `scripts/measure-delivery.ts`**

```ts
/**
 * Round 5 P1 delivery numbers, local only (never in CI). Serve a build first:
 *   bun scripts/serve-static.ts --port 4430 --dir out
 *   bunx @lhci/cli@0.15.1 autorun            (optional, writes .lighthouseci/)
 *   bun scripts/measure-delivery.ts --base http://127.0.0.1:4430 --label before --lhci .lighthouseci [--throttle]
 *   bun scripts/measure-delivery.ts --compare screenshots/delivery/before.json screenshots/delivery/after.json
 * Writes screenshots/delivery/<label>.json (gitignored) and prints Markdown for the PR body.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface ResourceRow {
  url: string;
  transferSize: number;
  startTime: number;
  responseEnd: number;
}

export interface LhciRow {
  url: string;
  lcp: number;
  tbt: number;
  cls: number;
  scriptBytes: number;
  lcpElement: string;
}

export function bucketOf(url: string): string {
  const { pathname } = new URL(url);
  if (pathname.endsWith(".js")) return "js";
  if (pathname.endsWith(".css")) return "css";
  if (pathname.endsWith(".woff2")) return "page-fonts";
  if (pathname.startsWith("/fonts/")) return "troika-fonts";
  if (pathname.startsWith("/data/rooms/")) return "rooms";
  if (pathname.startsWith("/data/")) return "data";
  if (pathname.endsWith(".txt")) return "rsc-prefetch";
  if (/^\/(media|tech|logos|floors|brand)\//.test(pathname)) return "images";
  return "other";
}

export function sumByBucket(rows: readonly ResourceRow[], until = Infinity): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.responseEnd > until) continue;
    const key = bucketOf(row.url);
    out[key] = (out[key] ?? 0) + row.transferSize;
  }
  out.total = Object.values(out).reduce((a, b) => a + b, 0);
  return out;
}

export function lhciSummary(dir: string): LhciRow[] {
  type Entry = { url: string; isRepresentativeRun: boolean; jsonPath: string };
  type Audit = { numericValue?: number; details?: { items?: Array<Record<string, unknown>> } };
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as Entry[];
  return manifest
    .filter((e) => e.isRepresentativeRun && !e.url.includes("?"))
    .map((e) => {
      const audits = (JSON.parse(readFileSync(e.jsonPath, "utf8")) as { audits: Record<string, Audit> }).audits;
      const script = audits["resource-summary"].details?.items?.find((i) => i.resourceType === "script") as { transferSize?: number } | undefined;
      const element = audits["largest-contentful-paint-element"]?.details?.items?.[0] as { items?: Array<{ node?: { selector?: string } }>; node?: { selector?: string } } | undefined;
      return {
        url: new URL(e.url).pathname,
        lcp: Math.round(audits["largest-contentful-paint"].numericValue ?? 0),
        tbt: Math.round(audits["total-blocking-time"].numericValue ?? 0),
        cls: Number((audits["cumulative-layout-shift"].numericValue ?? 0).toFixed(4)),
        scriptBytes: script?.transferSize ?? 0,
        lcpElement: element?.items?.[0]?.node?.selector ?? element?.node?.selector ?? "",
      };
    });
}

const READ_RESOURCES = () =>
  performance.getEntriesByType("resource").map((e) => {
    const r = e as PerformanceResourceTiming;
    return { url: r.name, transferSize: r.transferSize, startTime: r.startTime, responseEnd: r.responseEnd };
  });

/** Records when the boot cover is released by the first 3D frame (html[data-hq-boot-released="ready"]). */
const RELEASE_PROBE = () => {
  const w = window as unknown as { __released?: number };
  new MutationObserver(() => {
    if (w.__released === undefined && document.documentElement.getAttribute("data-hq-boot-released") === "ready") w.__released = performance.now();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-hq-boot-released"] });
};

async function measure(base: string, throttle: boolean) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    const plain = await browser.newContext();
    const page = await plain.newPage();
    await page.goto(`${base}/en?tier=static`);
    await page.waitForSelector("html[data-hydrated]", { timeout: 30_000 });
    const initialJs = sumByBucket(await page.evaluate(READ_RESOURCES)).js ?? 0;
    await plain.close();

    const human = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await human.addInitScript(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true }));
    await human.addInitScript(RELEASE_PROBE);
    const boot = await human.newPage();
    if (throttle) {
      const cdp = await human.newCDPSession(boot);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 94_000 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    await boot.goto(`${base}/en?tier=lite`, { waitUntil: "commit" });
    await boot.waitForFunction(() => (window as unknown as { __released?: number }).__released !== undefined, null, { timeout: throttle ? 240_000 : 90_000 });
    await boot.waitForTimeout(5000);
    const rows = await boot.evaluate(READ_RESOURCES);
    const released = await boot.evaluate(() => (window as unknown as { __released: number }).__released);
    await human.close();
    return { initialJs, firstFrameMs: Math.round(released), beforeFirstFrame: sumByBucket(rows, released), firstFivePlus: sumByBucket(rows) };
  } finally {
    await browser.close();
  }
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

function markdown(label: string, data: Awaited<ReturnType<typeof measure>> & { lhci: LhciRow[] }): string {
  const lines = [`### ${label}`, "", `- Initial JS on /en (served gzip): ${kb(data.initialJs)}`, `- First 3D frame: ${data.firstFrameMs} ms`, `- Bytes before the first 3D frame: ${kb(data.beforeFirstFrame.total)} (${Object.entries(data.beforeFirstFrame).filter(([k]) => k !== "total").map(([k, v]) => `${k} ${kb(v)}`).join(", ")})`, ""];
  if (data.lhci.length) {
    lines.push("| URL | LCP ms | TBT ms | CLS | Script | LCP element |", "|---|---|---|---|---|---|");
    for (const r of data.lhci) lines.push(`| ${r.url} | ${r.lcp} | ${r.tbt} | ${r.cls} | ${kb(r.scriptBytes)} | \`${r.lcpElement}\` |`);
  }
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const compare = flag("--compare");
  if (compare) {
    const [a, b] = [compare, args[args.indexOf("--compare") + 2]].map((f) => JSON.parse(readFileSync(f, "utf8")));
    console.log(markdown(`before (${compare})`, a));
    console.log();
    console.log(markdown("after", b));
    return;
  }
  const base = flag("--base") ?? "http://127.0.0.1:4430";
  const label = flag("--label") ?? "run";
  const lhciDir = flag("--lhci");
  const data = { ...(await measure(base, args.includes("--throttle"))), lhci: lhciDir && existsSync(lhciDir) ? lhciSummary(lhciDir) : [] };
  mkdirSync(path.join("screenshots", "delivery"), { recursive: true });
  writeFileSync(path.join("screenshots", "delivery", `${label}.json`), `${JSON.stringify(data, null, 2)}\n`);
  console.log(markdown(label, data));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
```

- [x] **Step 4: Run the unit test**

Run: `bunx vitest run tests/unit/measure-delivery.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Write `scripts/shot-diff.ts`**

```ts
/**
 * Compares two folders of PNG captures pixel by pixel inside Chromium (no image dependency).
 *   bun scripts/shot-diff.ts screenshots/delivery/before screenshots/delivery/after [--delta 24] [--max 0.005] [--only 3d-]
 * A pixel counts as changed when any RGB channel differs by more than --delta. Exits 1 when a pair
 * exceeds --max (ratio of changed pixels) or the sizes differ. Missing files on either side are listed.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const [dirA, dirB] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  const delta = Number(flag("--delta", "24"));
  const max = Number(flag("--max", "0.005"));
  const only = flag("--only", "");
  const names = readdirSync(dirA).filter((n) => n.endsWith(".png") && n.startsWith(only)).sort();
  const missing = names.filter((n) => !readdirSync(dirB).includes(n));
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let failed = missing.length > 0;
  for (const name of names.filter((n) => !missing.includes(n))) {
    const a = `data:image/png;base64,${readFileSync(path.join(dirA, name)).toString("base64")}`;
    const b = `data:image/png;base64,${readFileSync(path.join(dirB, name)).toString("base64")}`;
    const r = await page.evaluate(
      async ({ a, b, delta }) => {
        const load = async (src: string) => {
          const img = new Image();
          img.src = src;
          await img.decode();
          return img;
        };
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        if (ia.width !== ib.width || ia.height !== ib.height) return { changed: -1, total: ia.width * ia.height };
        const read = (img: HTMLImageElement) => {
          const c = new OffscreenCanvas(img.width, img.height);
          const g = c.getContext("2d")!;
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, img.width, img.height).data;
        };
        const da = read(ia);
        const db = read(ib);
        let changed = 0;
        for (let i = 0; i < da.length; i += 4) {
          if (Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])) > delta) changed++;
        }
        return { changed, total: ia.width * ia.height };
      },
      { a, b, delta },
    );
    const ratio = r.changed < 0 ? 1 : r.changed / r.total;
    const over = ratio > max;
    failed ||= over;
    console.log(`${over ? "FAIL" : "ok  "} ${name.padEnd(40)} ${r.changed < 0 ? "size differs" : `${(ratio * 100).toFixed(3)}% (${r.changed} px)`}`);
  }
  for (const name of missing) console.log(`MISS ${name}`);
  await browser.close();
  process.exit(failed ? 1 : 0);
}

if (import.meta.main) void main();
```

- [x] **Step 6: Write the opt-in capture spec `e2e/delivery-visual.spec.ts`**

```ts
import { mkdirSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { asHumanBrowser, asReturningVisitor, waitForCameraSettle, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/** Opt-in (SCREENSHOTS=1): captures for the round 5 P1 before/after diff (scripts/shot-diff.ts). */
test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to capture screenshots");
test.describe.configure({ timeout: 180_000 });

const DIR = path.join("screenshots", "delivery", process.env.SHOT_LABEL ?? "after");
const FLOORS = [
  ["L1", "/en"],
  ["L2", "/en/journey"],
  ["L3", "/en/labs"],
  ["L4", "/en/library"],
  ["RF", "/en/contact"],
] as const;
const WORLD = [
  { name: "desktop-1440", viewport: { width: 1440, height: 900 }, tier: "full", mobile: false },
  { name: "desktop-2560", viewport: { width: 2560, height: 1440 }, tier: "full", mobile: false },
  { name: "phone-390", viewport: { width: 390, height: 844 }, tier: "lite", mobile: true },
] as const;
const PAGES = [
  { width: 1440, height: 900 },
  { width: 1999, height: 1129 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
] as const;

const shot = (name: string) => {
  mkdirSync(DIR, { recursive: true });
  return path.join(DIR, `${name}.png`);
};

for (const v of WORLD) {
  for (const [floor, route] of FLOORS) {
    test(`3D ${floor} ${v.name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: 1, reducedMotion: "reduce", isMobile: v.mobile, hasTouch: v.mobile });
      const page = await context.newPage();
      await asReturningVisitor(page);
      await page.goto(`${route}?tier=${v.tier}&walk=off`);
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await waitForSceneLive(page);
      await waitForCameraSettle(page);
      await page.screenshot({ path: shot(`3d-${floor}-${v.name}`) });
      await context.close();
    });
  }
}

for (const v of PAGES) {
  test(`Page View /en ${v.width}x${v.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: v, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/en?tier=static");
    await page.waitForSelector("html[data-hydrated]");
    await page.evaluate(async () => {
      for (const img of Array.from(document.images)) img.loading = "eager";
      await Promise.all(Array.from(document.images).map((img) => (img.complete ? null : img.decode().catch(() => null))));
    });
    await page.screenshot({ path: shot(`page-${v.width}x${v.height}`), fullPage: true });
    await context.close();
  });

  test(`boot card ${v.width}x${v.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: v, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await context.newPage();
    await asHumanBrowser(page);
    // Keeps the cover up: no Next.js chunk, so nothing releases it before the capture.
    await page.route("**/_next/static/chunks/**/*.js", (route) => route.abort());
    await page.goto("/en?tier=lite", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600); // the CSS log stagger ends at about 1.47 s
    await page.screenshot({ path: shot(`boot-${v.width}x${v.height}`) });
    await context.close();
  });
}
```

- [x] **Step 7: Register the spec as a screenshot spec**

`playwright.config.ts:10`:

```ts
const SCREENSHOT_SPECS = ["**/screenshots.spec.ts", "**/pageview-visual.spec.ts", "**/delivery-visual.spec.ts"];
```

`scripts/e2e-plan.ts:51`:

```ts
  { test: /^e2e\/(screenshots|pageview-visual|delivery-visual)\.spec\.ts$/, specs: [] },
```

`tests/unit/e2e-plan.test.ts:78`:

```ts
      .filter((f) => f.endsWith(".spec.ts") && !["screenshots.spec.ts", "pageview-visual.spec.ts", "delivery-visual.spec.ts"].includes(f))
```

Run: `bunx vitest run tests/unit/e2e-plan.test.ts tests/unit/measure-delivery.test.ts`
Expected: PASS.

- [x] **Step 8: Build main as the baseline worktree**

```bash
git fetch origin
git worktree add ../hq-p1-base origin/main
(cd ../hq-p1-base && bun install --frozen-lockfile && bun run build)
```
Expected: `../hq-p1-base/out/en.html` exists.

- [x] **Step 9: Capture and measure the baseline**

```bash
bun scripts/serve-static.ts --port 4430 --dir ../hq-p1-base/out &   # note the PID
SERVER=$!
SCREENSHOTS=1 SHOT_LABEL=before E2E_PORT=4430 bunx playwright test e2e/delivery-visual.spec.ts --workers=1
SCREENSHOTS=1 SHOT_LABEL=before-2 E2E_PORT=4430 bunx playwright test e2e/delivery-visual.spec.ts --workers=1 -g "3D"
bun scripts/shot-diff.ts screenshots/delivery/before screenshots/delivery/before-2 --only 3d- --max 1
kill $SERVER
(cd ../hq-p1-base && bunx @lhci/cli@0.15.1 autorun) ; cp -r ../hq-p1-base/.lighthouseci .lighthouseci-before
bun scripts/serve-static.ts --port 4430 --dir ../hq-p1-base/out & SERVER=$!
bun scripts/measure-delivery.ts --base http://127.0.0.1:4430 --label before --lhci .lighthouseci-before
kill $SERVER
```
Expected: 45 PNGs in `screenshots/delivery/before`; the main-versus-main 3D diff prints the SwiftShader noise floor (expected 0.000% to 0.05%). If any noise ratio exceeds 0.25%, note it: the 3D threshold for later tasks is `--max 0.005` (0.5%) and must stay at least twice the noise floor. The measure script prints initial JS about 230 to 241 KB, bytes before the first frame (report: about 726 KB br equivalent; locally gzip) and the 4 LHCI rows (report: `/en` LCP 1.73 to 1.81 s, script 240.9 KB). Paste the Markdown into a scratch note for the PR body.

- [x] **Step 10: Commit**

```bash
rtk git add scripts/measure-delivery.ts scripts/shot-diff.ts e2e/delivery-visual.spec.ts tests/unit/measure-delivery.test.ts playwright.config.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
rtk git commit -m "test: delivery measurement script and opt-in before/after captures for round 5 P1"
```

### Task 1: zod off the client and a chunk leak gate (SP1, spec gap 11)

zod plus 46 schemas (33.7 KB gz, chunk `2j24jjyl372c-`) ship to every page because client modules import the value `LOCALES` from `@/content/schema`, which builds every schema at module scope. Value importers that reach the client: `src/hud/Controls.tsx:5`, `src/components/LocaleSwitch.tsx:4`, `src/lib/url-sync.ts:1`, `src/i18n/routing.ts:2` (used by `createNavigation`). Type-only imports are erased and stay.

**Files:**
- Create: `src/content/locales.ts`, `scripts/check-client-chunks.ts`, `tests/unit/client-chunks.test.ts`, `tests/unit/locales.test.ts`
- Modify: `src/content/schema.ts:13-15`, `src/hud/Controls.tsx:5`, `src/components/LocaleSwitch.tsx:4`, `src/lib/url-sync.ts:1`, `src/i18n/routing.ts:2`, `src/lib/site.ts:2`, `package.json` (`build`, `build:web`), `AGENTS.md`, `docs/superpowers/specs/2026-10-09-agent-hq-design.md` (sections 3.3, 4.1)

**Interfaces:**
- Produces: `LOCALES: readonly ["en", "id"]`, `DEFAULT_LOCALE: "en"`, `type Locale` from `@/content/locales` (schema re-exports both values; `Locale` from schema stays identical). `chunkLeaks(files: readonly { name: string; text: string }[]): string[]` and `LEAK_PATTERNS` from `scripts/check-client-chunks.ts`; the script exits 1 on any leak and runs at the end of `bun run build`.

- [x] **Step 1: Write the failing tests**

`tests/unit/client-chunks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chunkLeaks } from "../../scripts/check-client-chunks";

describe("client chunk gate", () => {
  it("flags zod, the content loader and the dataset", () => {
    const leaks = chunkLeaks([
      { name: "a.js", text: "var t={_zod:{def:1}}" },
      { name: "b.js", text: "require('fs').readFileSync(p)" },
      { name: "c.js", text: 'fetch("content/site-content.json")' },
      { name: "d.js", text: "console.log('fine')" },
    ]);
    expect(leaks).toEqual(["a.js: zod (_zod)", "b.js: content loader (readFileSync)", "c.js: dataset (site-content)"]);
  });

  it("passes clean chunks", () => {
    expect(chunkLeaks([{ name: "a.js", text: "export const LOCALES=['en','id']" }])).toEqual([]);
  });
});
```

`tests/unit/locales.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES } from "@/content/locales";
import { LocaleSchema } from "@/content/schema";

describe("locales", () => {
  it("match the schema enum", () => {
    expect(LocaleSchema.options).toEqual([...LOCALES]);
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });

  it("stay import-free so client modules never pull zod", () => {
    const source = readFileSync(path.join(process.cwd(), "src/content/locales.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it("is what client modules import", () => {
    for (const file of ["src/hud/Controls.tsx", "src/components/LocaleSwitch.tsx", "src/lib/url-sync.ts", "src/i18n/routing.ts"]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/import \{[^}]*\b(LOCALES|DEFAULT_LOCALE)\b[^}]*\} from "@\/content\/schema"/);
    }
  });
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/client-chunks.test.ts tests/unit/locales.test.ts`
Expected: FAIL ("Failed to load url ../../scripts/check-client-chunks" and "@/content/locales").

- [x] **Step 3: Write `src/content/locales.ts`**

```ts
/**
 * Site locales. Import-free on purpose: client modules read these values, and importing them from
 * `schema.ts` would bundle zod and every content schema into every page (REPORT SP1).
 */
export const LOCALES = ["en", "id"] as const;
export const DEFAULT_LOCALE = "en";
export type Locale = (typeof LOCALES)[number];
```

`src/content/schema.ts:13-15` becomes:

```ts
import { LOCALES } from "./locales";

export { DEFAULT_LOCALE, LOCALES } from "./locales";
export const LocaleSchema = z.enum(LOCALES);
```

(Move the new `import` line up to the import block at the top of the file, after `import { liveUrlProblem } from "./live-links";`.)

- [x] **Step 4: Point the client importers at the new module**

- `src/hud/Controls.tsx:5`: `import { LOCALES } from "@/content/locales";` plus `import type { Locale } from "@/content/schema";`
- `src/components/LocaleSwitch.tsx:4`: `import { LOCALES } from "@/content/locales";`
- `src/lib/url-sync.ts:1`: `import { LOCALES } from "@/content/locales";` plus `import type { FloorId, Locale, RoomId } from "@/content/schema";`
- `src/i18n/routing.ts:2`: `import { DEFAULT_LOCALE, LOCALES } from "@/content/locales";`
- `src/lib/site.ts:2`: `import { LOCALES } from "@/content/locales";` plus `import type { Locale } from "@/content/schema";`

Server-only importers (`sitemap.ts`, `og-cards.ts`, `blog.ts`, route pages, `data/[...path]/route.ts`) may stay on the schema re-export.

- [x] **Step 5: Write `scripts/check-client-chunks.ts`**

```ts
/**
 * Post-build gate (part of `bun run build`): build-time code must never reach the browser.
 * Scans out/_next/static/chunks for zod, the content loader and the dataset (AGENTS.md, REPORT SP1).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const LEAK_PATTERNS: readonly { label: string; token: string; re: RegExp }[] = [
  { label: "zod", token: "_zod", re: /_zod\b/ },
  { label: "content loader", token: "readFileSync", re: /\breadFileSync\b/ },
  { label: "dataset", token: "site-content", re: /site-content/ },
];

export function chunkLeaks(files: readonly { name: string; text: string }[]): string[] {
  const leaks: string[] = [];
  for (const file of files) for (const p of LEAK_PATTERNS) if (p.re.test(file.text)) leaks.push(`${file.name}: ${p.label} (${p.token})`);
  return leaks;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

if (import.meta.main) {
  const dir = path.join(process.cwd(), "out", "_next", "static", "chunks");
  const files = walk(dir).map((full) => ({ name: path.relative(dir, full), text: readFileSync(full, "utf8") }));
  const leaks = chunkLeaks(files);
  if (leaks.length) {
    console.error(`Build-time code in client chunks:\n- ${leaks.join("\n- ")}\nImport LOCALES from @/content/locales and keep @/content/load and zod out of client modules.`);
    process.exit(1);
  }
  console.log(`check-client-chunks: ${files.length} chunks clean`);
}
```

`package.json` (both `build` and `build:web`):

```json
"build": "bun scripts/build-knowledge.ts && next build && bun scripts/defer-scripts.ts && bun scripts/check-client-chunks.ts",
"build:web": "bun scripts/build-knowledge.ts && next build && bun scripts/defer-scripts.ts && bun scripts/check-client-chunks.ts",
```

- [x] **Step 6: Prove the gate catches main's leak**

Run (on the base worktree build from Task 0): `(cd ../hq-p1-base && bun "$OLDPWD/scripts/check-client-chunks.ts")`
Expected: exit 1 listing one chunk with `zod (_zod)`.

- [x] **Step 7: Run unit tests and the full quick verification**

Run: `bunx vitest run tests/unit/client-chunks.test.ts tests/unit/locales.test.ts && bun run verify:quick`
Expected: PASS; the build ends with `check-client-chunks: N chunks clean`.

- [x] **Step 8: Measure**

```bash
bun scripts/serve-static.ts --port 4430 --dir out & SERVER=$!
bun scripts/measure-delivery.ts --base http://127.0.0.1:4430 --label t1
kill $SERVER
```
Expected: initial JS about 30 to 34 KB below the Task 0 baseline (SP1 pass mark: `/en` initial JS <= 195 KB gz on the production measure; locally at most baseline minus 28 KB).

- [x] **Step 9: e2e**

Run: `E2E_PORT=4430 bun run e2e:changed`
Expected: PASS (maps to static-routes, pageview, seo, experience and others for `src/lib`, `src/hud`, `src/i18n`).

- [x] **Step 10: Docs**

`AGENTS.md`:
- Folder layout, after the `content/schema.ts` line: `  content/locales.ts            LOCALES, DEFAULT_LOCALE, Locale with no imports: the only place client code reads locale values from`
- Folder layout `scripts/`: `  check-client-chunks.ts        post-build (part of \`build\`): fails when zod (\`_zod\`), \`readFileSync\` or \`site-content\` appears in out/_next/static/chunks`
- "Content access", after "Types come from `@/content/schema`": add the sentence "Client code imports the locale values from `@/content/locales`, never values from `@/content/schema` (type-only imports are fine); `bun run build` fails otherwise."

Main spec sections 3.3 and 4.1: after "zod validation at build time" add "(enforced: `scripts/check-client-chunks.ts` fails the build when zod reaches a client chunk)".

- [x] **Step 11: Commit**

```bash
rtk git add src/content/locales.ts src/content/schema.ts src/hud/Controls.tsx src/components/LocaleSwitch.tsx src/lib/url-sync.ts src/i18n/routing.ts src/lib/site.ts scripts/check-client-chunks.ts tests/unit/client-chunks.test.ts tests/unit/locales.test.ts package.json AGENTS.md docs/superpowers/specs/2026-10-09-agent-hq-design.md
rtk git commit -m "perf: keep zod off the client (locales module) and gate client chunks after build"
```

### Task 2: LHCI warm-up URL (A4.4)

`/en` TBT on the first Lighthouse run of every CI job is 555 to 4,311 ms (cold Chrome and server) in 8 of 8 jobs. A throwaway warm-up URL runs first and is excluded from the assertions with `assertMatrix`.

**Files:**
- Create: `tests/unit/lighthouserc.test.ts`
- Modify: `lighthouserc.json`, `docs/deploy.md` section 8, `AGENTS.md` (Workflow, CI bullet), `docs/superpowers/specs/agent-hq/08-quality-acceptance.md` section 3

**Interfaces:**
- Produces: first collect URL `http://127.0.0.1:4320/en?lhci-warmup=1`; one `assertMatrix` entry with `matchingUrlPattern` `^[^?]+$` (URLs without a query), same budgets.

- [x] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Assertion = [string, { maxNumericValue?: number; minScore?: number }];
const rc = JSON.parse(readFileSync("lighthouserc.json", "utf8")) as {
  ci: { collect: { url: string[] }; assert: { assertions?: unknown; assertMatrix: { matchingUrlPattern: string; assertions: Record<string, Assertion> }[] } };
};

describe("lighthouserc", () => {
  const urls = rc.ci.collect.url;
  const matrix = rc.ci.assert.assertMatrix;

  it("warms up first and never asserts on the warm-up URL", () => {
    expect(urls[0]).toBe("http://127.0.0.1:4320/en?lhci-warmup=1");
    expect(rc.ci.assert.assertions).toBeUndefined();
    expect(matrix).toHaveLength(1);
    const re = new RegExp(matrix[0].matchingUrlPattern);
    expect(re.test(urls[0])).toBe(false);
    expect(urls.slice(1)).toEqual([
      "http://127.0.0.1:4320/en",
      "http://127.0.0.1:4320/en/quick",
      "http://127.0.0.1:4320/en/journey",
      "http://127.0.0.1:4320/en/labs/voice-ai-contact-center",
    ]);
    for (const url of urls.slice(1)) expect(re.test(url), url).toBe(true);
  });

  it("keeps the CI budgets", () => {
    const a = matrix[0].assertions;
    expect(a["largest-contentful-paint"][1].maxNumericValue).toBe(2000);
    expect(a["cumulative-layout-shift"][1].maxNumericValue).toBe(0.01);
    expect(a["total-blocking-time"][1].maxNumericValue).toBe(200);
    expect(a["resource-summary:font:size"][1].maxNumericValue).toBe(61440);
    expect(a["resource-summary:document:size"][1].maxNumericValue).toBe(81920);
    expect(a["resource-summary:stylesheet:size"][1].maxNumericValue).toBe(20480);
    expect(a["resource-summary:script:size"][1].maxNumericValue).toBe(245760);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/lighthouserc.test.ts`
Expected: FAIL, `expected 'http://127.0.0.1:4320/en' to be 'http://127.0.0.1:4320/en?lhci-warmup=1'`.

- [x] **Step 3: Edit `lighthouserc.json`**

```json
{
  "ci": {
    "collect": {
      "startServerCommand": "bun scripts/serve-static.ts --port 4320 --dir out",
      "startServerReadyPattern": "Serving",
      "startServerReadyTimeout": 30000,
      "url": [
        "http://127.0.0.1:4320/en?lhci-warmup=1",
        "http://127.0.0.1:4320/en",
        "http://127.0.0.1:4320/en/quick",
        "http://127.0.0.1:4320/en/journey",
        "http://127.0.0.1:4320/en/labs/voice-ai-contact-center"
      ],
      "numberOfRuns": 3,
      "settings": {
        "chromeFlags": "--no-sandbox"
      }
    },
    "assert": {
      "assertMatrix": [
        {
          "matchingUrlPattern": "^[^?]+$",
          "assertions": {
            "largest-contentful-paint": ["error", { "maxNumericValue": 2000, "aggregationMethod": "median-run" }],
            "cumulative-layout-shift": ["error", { "maxNumericValue": 0.01, "aggregationMethod": "median-run" }],
            "total-blocking-time": ["error", { "maxNumericValue": 200, "aggregationMethod": "median-run" }],
            "resource-summary:font:size": ["error", { "maxNumericValue": 61440 }],
            "resource-summary:document:size": ["error", { "maxNumericValue": 81920 }],
            "resource-summary:stylesheet:size": ["error", { "maxNumericValue": 20480 }],
            "resource-summary:script:size": ["error", { "maxNumericValue": 245760 }],
            "categories:performance": ["warn", { "minScore": 0.9 }],
            "categories:accessibility": ["warn", { "minScore": 0.9 }],
            "categories:seo": ["warn", { "minScore": 0.9 }]
          }
        }
      ]
    },
    "upload": {
      "target": "filesystem",
      "outputDir": ".lighthouseci"
    }
  }
}
```

- [x] **Step 4: Run the test and a local LHCI**

Run: `bunx vitest run tests/unit/lighthouserc.test.ts && bun run build && bunx @lhci/cli@0.15.1 autorun`
Expected: PASS; LHCI collects 15 runs, prints assertion results only for the 4 real URLs, "All results processed!" with no error-level failure. The warm-up adds about 30 to 45 s to the job (3 runs); accepted.

- [x] **Step 5: Docs**

`docs/deploy.md` section 8, "Pages:" bullet becomes: "Pages: a warm-up run of `/en?lhci-warmup=1` (never asserted; it absorbs the cold first Chrome and server run that used to spike `/en` TBT), then `/en`, `/en/quick`, `/en/journey`, `/en/labs/voice-ai-contact-center`, 3 runs each, Lighthouse default mobile profile (simulated 4G, mid-range device). Assertions live in one `assertMatrix` entry for URLs without a query string."
`AGENTS.md` Workflow CI bullet: after "`lighthouserc.json`: LCP 2 s, ..." add "; the first URL is a warm-up that is never asserted".
Spec 08 section 3: replace the LHCI URL list with the same five URLs and the sentence "The warm-up URL is excluded from assertions. CI budgets in `lighthouserc.json` are authoritative."

- [x] **Step 6: Commit**

```bash
rtk git add lighthouserc.json tests/unit/lighthouserc.test.ts docs/deploy.md AGENTS.md docs/superpowers/specs/agent-hq/08-quality-acceptance.md
rtk git commit -m "ci: warm up Lighthouse CI before the asserted URLs"
```

- [x] **Step 7: Verify on CI after push**

Open the PR's `lighthouse-reports` artifact; for `/en`, list the 3 runs' TBT. Expected: all three <= 200 ms (before: the first run 555 to 4,311 ms). Record the three values in the PR body. If one run is still over 200 ms, record it; the median gate still holds and REPORT A4.4 option 2 (idle-gated islands) goes to a follow-up issue.

### Task 3: Audio stays silent on the Page View and the static tier (spec gap 2)

`engine.ts:56` starts with `paused = false`, so on the Page View the first click anywhere (gesture listener, `engine.ts:141-170`) or `play("click")` from `DialogHost.tsx:33` and `useAskThread.ts:78` creates the AudioContext and the ambient hum. Spec 05 section 5 says the Page View and static tier are silent. Fix: paused by default; `Experience` already calls `audio.setPaused(false)` on mount (`Experience.tsx:209`).

**Files:**
- Modify: `src/lib/audio/types.ts:21-27`, `src/lib/audio/engine.ts:47-56`, `tests/unit/audio.test.ts` (setup at 175-193, new describe), `e2e/pageview.spec.ts`, `src/lib/audio/README.md` ("Paused outside 3D"), `AGENTS.md` (Workflow, Audio bullet), `scripts/e2e-plan.ts` (audio rule)

**Interfaces:**
- Produces: `AudioEngineDeps.paused?: boolean` (default `true`); `createAudioEngine()` starts paused; `isPaused()` is `true` until `setPaused(false)`.

- [x] **Step 1: Write the failing unit test**

Add to `tests/unit/audio.test.ts`, after the "paused outside the 3D view" describe:

```ts
describe("audio engine: paused until the 3D view opens", () => {
  it("starts paused: no context from gestures or one-shots on the Page View", () => {
    const storage = new FakeStorage();
    const doc = new FakeDoc();
    const createContext = vi.fn(() => new FakeAudioContext() as unknown as AudioContext);
    const engine = createAudioEngine({ createContext, storage, doc: doc as unknown as AudioEngineDeps["doc"], now: () => 0 });
    expect(engine.isPaused()).toBe(true);
    expect(engine.isMuted()).toBe(false);
    doc.fire("pointerdown");
    engine.play("click");
    engine.setRumble(5);
    expect(createContext).not.toHaveBeenCalled();
    engine.setPaused(false);
    doc.fire("pointerdown");
    expect(createContext).toHaveBeenCalledTimes(1);
  });
});
```

In `setup()` (the shared helper at line 175), pass `paused: false` so every existing test keeps exercising the 3D state:

```ts
  const engine = createAudioEngine({
    createContext,
    storage,
    doc: doc as unknown as AudioEngineDeps["doc"],
    now: () => clock.t,
    paused: false,
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/audio.test.ts`
Expected: FAIL on "starts paused" (`expected false to be true`), and a TypeScript error in the editor for the unknown `paused` dep (vitest still runs).

- [x] **Step 3: Implement**

`src/lib/audio/types.ts`, inside `AudioEngineDeps`:

```ts
  /** Start state of the Page View pause; true unless a test drives the 3D state directly. `Experience` unpauses on mount. */
  paused: boolean;
```

`src/lib/audio/engine.ts:56`:

```ts
  /** Paused while the 3D view is closed (Page View, static tier): silent without touching the stored preference. */
  let paused = deps.paused ?? true;
```

- [x] **Step 4: Run the unit tests**

Run: `bunx vitest run tests/unit/audio.test.ts`
Expected: PASS (all describes).

- [x] **Step 5: Write the e2e (Page View creates no AudioContext)**

Add to `e2e/pageview.spec.ts`:

```ts
test("the Page View stays silent: clicks and the CV dialog create no AudioContext", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __audioContexts: number; AudioContext: typeof AudioContext };
    w.__audioContexts = 0;
    const Original = w.AudioContext;
    w.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__audioContexts++;
      }
    };
  });
  await openPage(page, staticTier("/en/quick"));
  await page.locator("main h1").first().click();
  await page.locator('main a[href="/en/cv"]').first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts)).toBe(0);
});
```

`scripts/e2e-plan.ts`: insert before the rule at line 119 (`src/lib/(audio/|url-sync|...)`):

```ts
  { test: /^src\/lib\/audio\//, specs: ["experience", "pageview"] },
```

and change line 119 to `{ test: /^src\/lib\/(url-sync|viewport|reduced-motion)/, specs: ["experience"] },`.

- [x] **Step 6: Run the e2e and the 3D sound path**

Run: `bun run verify:quick && E2E_PORT=4430 bun run e2e:changed`
Expected: PASS for `pageview` (new test) and `experience` (the HUD sound toggle and Director sounds still work because `Experience` unpauses on mount). Run the same e2e on the base build first (`bun scripts/serve-static.ts --port 4430 --dir ../hq-p1-base/out` then `E2E_PORT=4430 bunx playwright test e2e/pageview.spec.ts -g "stays silent"`) to see it fail: `Expected: 0, Received: 1`.

- [x] **Step 7: Docs**

`src/lib/audio/README.md`, "Paused outside 3D" bullet: "**Paused outside 3D.** The engine starts paused, so the Page View and the static tier never create a context, even after a click or a dialog sound. `Experience` unpauses on mount and pauses again on unmount; `setPaused(true)` fades out and suspends like a mute but keeps the setting." Also fix line 41 ("The static tier never creates the engine") to "The static tier and the Page View never create a context (the engine starts paused)."
`AGENTS.md` Workflow, Audio bullet: replace "`Experience` calls `audio.setPaused(false/true)` on mount/unmount, so the Page View and static tier stay silent without changing the stored choice." with "The engine starts paused; `Experience` calls `audio.setPaused(false/true)` on mount/unmount, so the Page View and static tier stay silent (no AudioContext at all) without changing the stored choice."

- [x] **Step 8: Commit**

```bash
rtk git add src/lib/audio/types.ts src/lib/audio/engine.ts src/lib/audio/README.md tests/unit/audio.test.ts e2e/pageview.spec.ts scripts/e2e-plan.ts AGENTS.md
rtk git commit -m "fix(audio): start paused so the Page View never creates an AudioContext"
```

### Task 4: Troika fonts subset to in-world glyphs, content-hashed (SP10, A4.7, spec gap 14)

Troika loads five WOFFs (139,216 B, `max-age=0`). It cannot read WOFF2 (troika 0.52 throws), so keep WOFF. Measured locally with fonttools 4.66 (in memory, same Latin set, troika's shaping features kept, hinting dropped): Inter 400 16,920 B, Inter 800 17,224 B, JetBrains Mono 400 11,196 B, 700 11,456 B, symbols 1,316 B, total about 58 KB (-58%). Glyph outlines are untouched and troika only applies `rlig, liga, mset, isol, init, fina, medi, half, pres, blws, ccmp` (GSUB) plus `kern`, so in-world text renders the same. Hashed names make `/fonts/*` cacheable for a year (Task 5).

**Files:**
- Create: `scripts/troika-glyphs.ts`, `scripts/troika-fonts.ts`, `tests/helpers/woff.ts`, `tests/content/troika-fonts.test.ts`, `src/experience/troika-fonts.json` (generated), `public/fonts/3d/*.woff` (generated)
- Move: `public/fonts/{inter-latin-400-normal,inter-latin-800-normal,jetbrains-mono-latin-400-normal,jetbrains-mono-latin-700-normal,jetbrains-mono-symbols-700}.woff` to `src/assets/fonts/troika/` (`git mv`; `LICENSE-*.txt` stay in `public/fonts/`)
- Modify: `src/experience/tower/primitives.tsx:9-14`, `src/experience/text-config.ts:12`, `scripts/e2e-plan.ts`, `src/assets/fonts/README.md`, `AGENTS.md` (folder layout `public/fonts/`), `docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md` line 57

**Interfaces:**
- Produces: `src/experience/troika-fonts.json` `{ "sans", "sansBold", "mono", "monoBold", "symbols" }` with `/fonts/3d/<name>.<sha256 first 8 hex>.woff` URLs; `FONTS` in `primitives.tsx` keeps its keys (`sans`, `sansBold`, `mono`, `monoBold`); `inWorldCodePoints(root?)`, `latinCodePoints()`, `symbolCodePoints(used)`, `inLatin(cp)`, `toUnicodes(cps)`, `LAYOUT_FEATURES` from `scripts/troika-glyphs.ts`; `woffCodePoints(buf)`, `woffTables(buf)` from `tests/helpers/woff.ts`.

- [x] **Step 1: Write the WOFF helper and the failing test**

`tests/helpers/woff.ts`:

```ts
import { inflateSync } from "node:zlib";

/** Tables of a WOFF 1.0 font (zlib per table), keyed by tag. */
export function woffTables(file: Buffer): Map<string, Buffer> {
  if (file.toString("latin1", 0, 4) !== "wOFF") throw new Error("not a WOFF 1.0 file");
  const tables = new Map<string, Buffer>();
  for (let i = 0; i < file.readUInt16BE(12); i++) {
    const at = 44 + i * 20;
    const tag = file.toString("latin1", at, at + 4);
    const offset = file.readUInt32BE(at + 4);
    const compLength = file.readUInt32BE(at + 8);
    const origLength = file.readUInt32BE(at + 12);
    const raw = file.subarray(offset, offset + compLength);
    tables.set(tag, compLength < origLength ? inflateSync(raw) : raw);
  }
  return tables;
}

/** Code points mapped by a cmap table (format 4 and 12 subtables). */
export function cmapCodePoints(table: Buffer): Set<number> {
  const points = new Set<number>();
  for (let r = 0; r < table.readUInt16BE(2); r++) {
    const sub = table.subarray(table.readUInt32BE(4 + r * 8 + 4));
    const format = sub.readUInt16BE(0);
    if (format === 4) {
      const segs = sub.readUInt16BE(6) / 2;
      for (let s = 0; s < segs; s++) {
        const end = sub.readUInt16BE(14 + s * 2);
        const start = sub.readUInt16BE(16 + segs * 2 + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) points.add(c);
      }
    } else if (format === 12) {
      for (let g = 0; g < sub.readUInt32BE(12); g++) {
        for (let c = sub.readUInt32BE(16 + g * 12); c <= sub.readUInt32BE(20 + g * 12); c++) points.add(c);
      }
    }
  }
  return points;
}

export const woffCodePoints = (file: Buffer) => cmapCodePoints(woffTables(file).get("cmap")!);
```

`tests/content/troika-fonts.test.ts`:

```ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../src/experience/troika-fonts.json";
import { inWorldCodePoints, latinCodePoints } from "../../scripts/troika-glyphs";
import { woffCodePoints } from "../helpers/woff";

/*
 * In-world (troika) fonts: subset to the characters 3D text can render (scripts/troika-fonts.ts),
 * served under content-hashed names so /fonts/* is cached for a year (public/_headers).
 */
const root = process.cwd();
const BUDGET = 64 * 1024;
const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
const fonts = Object.entries(manifest).map(([key, url]) => ({ key, url, bytes: readFileSync(path.join(root, "public", url)) }));

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else out.push(full);
  }
  return out;
}

describe("troika fonts", () => {
  it("are content-hashed WOFF files under /fonts/3d", () => {
    for (const font of fonts) {
      const match = /^\/fonts\/3d\/[a-z0-9-]+\.([0-9a-f]{8})\.woff$/.exec(font.url);
      expect(match, font.url).not.toBeNull();
      expect(createHash("sha256").update(font.bytes).digest("hex").slice(0, 8), font.url).toBe(match![1]);
    }
  });

  it("are the only font files served from public/fonts (immutable cache rule)", () => {
    const served = files(path.join(root, "public", "fonts")).filter((f) => /\.(woff2?|ttf|otf)$/.test(f)).map((f) => `/${path.relative(path.join(root, "public"), f).split(path.sep).join("/")}`);
    expect(served.sort()).toEqual(Object.values(manifest).sort());
  });

  it("stay within the 3D font budget", () => {
    expect(fonts.reduce((sum, f) => sum + f.bytes.length, 0)).toBeLessThanOrEqual(BUDGET);
  });

  it("keep the whole Latin set in every text cut", () => {
    for (const font of fonts.filter((f) => f.key !== "symbols")) {
      const points = woffCodePoints(font.bytes);
      expect(latinCodePoints().filter((cp) => !points.has(cp)).map(hex), font.key).toEqual([]);
    }
  });

  it("cover every in-world character with the text cut or the symbols fallback", () => {
    const symbols = woffCodePoints(fonts.find((f) => f.key === "symbols")!.bytes);
    const used = inWorldCodePoints(root);
    for (const font of fonts.filter((f) => f.key !== "symbols")) {
      const points = woffCodePoints(font.bytes);
      const missing = [...used].filter(([cp]) => !points.has(cp) && !symbols.has(cp)).map(([cp, file]) => `${hex(cp)} ${JSON.stringify(String.fromCodePoint(cp))} (${file})`);
      expect(missing, font.key).toEqual([]);
    }
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/content/troika-fonts.test.ts`
Expected: FAIL ("Failed to load url ../../src/experience/troika-fonts.json").

- [x] **Step 3: Write `scripts/troika-glyphs.ts`**

```ts
/**
 * Pure helpers for the in-world (troika) font cuts: which characters 3D text can render and which
 * unicode sets each cut keeps. Shared by scripts/troika-fonts.ts and tests/content/troika-fonts.test.ts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Every text cut keeps these: ASCII, Latin-1, a few Latin Extended letters, typographic punctuation, up and down arrows. */
export const LATIN_RANGES: readonly (readonly [number, number])[] = [
  [0x20, 0x7e], [0xa0, 0xff], [0x131, 0x131], [0x152, 0x153], [0x2013, 0x2013], [0x2018, 0x201a], [0x201c, 0x201e],
  [0x2022, 0x2022], [0x2026, 0x2026], [0x2032, 0x2033], [0x2039, 0x203a], [0x20ac, 0x20ac], [0x2122, 0x2122],
  [0x2191, 0x2191], [0x2193, 0x2193], [0x2212, 0x2212],
];

/** The symbols fallback always keeps these (arrows and the tier mark shapes), used or not. */
export const SYMBOL_BASE: readonly number[] = [0x20, 0xa0, 0x2190, 0x2192, 0x25b2, 0x25b6, 0x25b8, 0x25bc, 0x25c6, 0x25c7];

/** GSUB features troika 0.52 applies (troika-three-text.esm.js `supportedFeatures`) plus GPOS kerning. */
export const LAYOUT_FEATURES = ["kern", "liga", "rlig", "ccmp", "mset", "isol", "init", "fina", "medi", "half", "pres", "blws"] as const;

export const inLatin = (cp: number) => LATIN_RANGES.some(([a, b]) => cp >= a && cp <= b);

export function latinCodePoints(): number[] {
  return LATIN_RANGES.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
}

export function symbolCodePoints(used: Iterable<number>): number[] {
  return [...new Set([...SYMBOL_BASE, ...[...used].filter((cp) => !inLatin(cp))])].sort((a, b) => a - b);
}

export function toUnicodes(cps: readonly number[]): string {
  return cps.map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`).join(",");
}

function walk(dir: string, exts: readonly string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((ext) => name.endsWith(ext))) out.push(full);
  }
  return out;
}

/**
 * Every printable code point in-world text can show, with the first file that uses it: content and
 * messages in both locales and the 3D source (dev prototypes excluded), `\uXXXX` and `\u{...}` escapes decoded.
 */
export function inWorldCodePoints(root = process.cwd()): Map<number, string> {
  const sources = [
    ...walk(path.join(root, "content"), [".json"]),
    ...walk(path.join(root, "messages"), [".json"]),
    ...walk(path.join(root, "src", "experience"), [".ts", ".tsx"]).filter((f) => !f.includes(`${path.sep}prototype${path.sep}`)),
  ];
  const found = new Map<number, string>();
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    const add = (cp: number) => {
      if (cp >= 0x20 && cp !== 0x7f && !found.has(cp)) found.set(cp, path.relative(root, file));
    };
    for (const char of text) add(char.codePointAt(0)!);
    for (const m of text.matchAll(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})/g)) add(parseInt(m[1] ?? m[2], 16));
  }
  return found;
}
```

- [x] **Step 4: Write `scripts/troika-fonts.ts`**

```ts
/**
 * Subsets the in-world (troika) fonts to the characters 3D text can render and writes them under
 * content-hashed names, so /fonts/* is cached for a year (round 5 P1, REPORT SP10). Troika 0.52 cannot
 * read WOFF2, so the cuts stay WOFF. Inputs: src/assets/fonts/troika/ (the @fontsource latin cuts and the
 * JetBrains Mono symbols cut). Needs fonttools 4.x (pyftsubset). Usage: bun scripts/troika-fonts.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { run } from "./pdf-pages";
import { LAYOUT_FEATURES, inWorldCodePoints, latinCodePoints, symbolCodePoints, toUnicodes } from "./troika-glyphs";

const root = process.cwd();
const SRC = path.join(root, "src", "assets", "fonts", "troika");
const OUT = path.join(root, "public", "fonts", "3d");
const MANIFEST = path.join(root, "src", "experience", "troika-fonts.json");
const FONTS = [
  { key: "sans", file: "inter-latin-400-normal.woff", set: "latin" },
  { key: "sansBold", file: "inter-latin-800-normal.woff", set: "latin" },
  { key: "mono", file: "jetbrains-mono-latin-400-normal.woff", set: "latin" },
  { key: "monoBold", file: "jetbrains-mono-latin-700-normal.woff", set: "latin" },
  { key: "symbols", file: "jetbrains-mono-symbols-700.woff", set: "symbols" },
] as const;

const unicodes = { latin: toUnicodes(latinCodePoints()), symbols: toUnicodes(symbolCodePoints(inWorldCodePoints(root).keys())) };
mkdirSync(OUT, { recursive: true });
const manifest: Record<string, string> = {};
const keep = new Set<string>();
let total = 0;
for (const font of FONTS) {
  const tmp = path.join(OUT, `.tmp-${font.file}`);
  run("pyftsubset", [
    path.join(SRC, font.file),
    `--unicodes=${unicodes[font.set]}`,
    `--layout-features=${LAYOUT_FEATURES.join(",")}`,
    "--no-hinting",
    "--name-IDs=*",
    "--notdef-outline",
    "--flavor=woff",
    `--output-file=${tmp}`,
  ]);
  const bytes = readFileSync(tmp);
  const name = font.file.replace(/\.woff$/, `.${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}.woff`);
  renameSync(tmp, path.join(OUT, name));
  keep.add(name);
  manifest[font.key] = `/fonts/3d/${name}`;
  total += bytes.length;
  console.log(`${name.padEnd(52)} ${String(bytes.length).padStart(6)} bytes`);
}
for (const name of readdirSync(OUT)) if (!keep.has(name)) rmSync(path.join(OUT, name));
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`total ${total} bytes (was 139,216 for the five unsubset WOFFs)`);
```

(`run` from `scripts/pdf-pages.ts` mentions poppler and webp in its error text; fine for a missing `pyftsubset` too.)

- [x] **Step 5: Move the sources and generate**

```bash
mkdir -p src/assets/fonts/troika
git mv public/fonts/inter-latin-400-normal.woff public/fonts/inter-latin-800-normal.woff public/fonts/jetbrains-mono-latin-400-normal.woff public/fonts/jetbrains-mono-latin-700-normal.woff public/fonts/jetbrains-mono-symbols-700.woff src/assets/fonts/troika/
bun scripts/troika-fonts.ts
```
Expected: five lines, total about 58,000 bytes, `src/experience/troika-fonts.json` with five `/fonts/3d/...` URLs.

- [x] **Step 6: Use the manifest**

`src/experience/tower/primitives.tsx:9-14`:

```ts
import troikaFonts from "../troika-fonts.json";

/** In-world fonts: subset, content-hashed WOFFs written by scripts/troika-fonts.ts (cached for a year). */
export const FONTS = {
  sans: troikaFonts.sans,
  sansBold: troikaFonts.sansBold,
  mono: troikaFonts.mono,
  monoBold: troikaFonts.monoBold,
} as const;
```

(Place the import with the other imports at the top.)

`src/experience/text-config.ts`: add `import troikaFonts from "./troika-fonts.json";` after the troika import and change line 12 to:

```ts
configureTextBuilder({ useWorker: false, defaultFontURL: troikaFonts.symbols });
```

`scripts/e2e-plan.ts`, before the generic `src/experience` rules:

```ts
  { test: /^public\/fonts\/|^src\/experience\/(troika-fonts\.json|text-config\.ts)$|^scripts\/troika-/, specs: ["experience", "highlights", "boot-first"] },
```

- [x] **Step 7: Run tests**

Run: `bunx vitest run tests/content/troika-fonts.test.ts tests/content/fonts.test.ts tests/unit/label-props.test.ts && bun run verify:quick`
Expected: PASS (5 troika tests).

- [x] **Step 8: e2e and render budgets**

Run: `E2E_PORT=4430 bun run e2e:changed`
Expected: PASS for experience (render budgets), highlights (L1 cap 140), boot-first. No console error about fonts; `collectErrors` stays empty (no CDN request: the symbols fallback covers every in-world symbol).

- [x] **Step 9: Screenshot diff (pixels must not change)**

```bash
bun scripts/serve-static.ts --port 4430 --dir out & SERVER=$!
SCREENSHOTS=1 SHOT_LABEL=t4 E2E_PORT=4430 bunx playwright test e2e/delivery-visual.spec.ts --workers=1 -g "3D"
kill $SERVER
bun scripts/shot-diff.ts screenshots/delivery/before screenshots/delivery/t4 --only 3d- --delta 24 --max 0.005
```
Expected: every `3d-*` pair `ok`, at most 0.5% changed pixels (target: within the Task 0 noise floor). Rollback: if any floor exceeds the threshold, rerun `troika-fonts.ts` with `LAYOUT_FEATURES` replaced by `["*"]` (keeps every OpenType feature, about +4 KB per Inter cut) and diff again; if still over, revert this task's commit (fonts move back to `public/fonts/`) and keep only the cache rule for the old names at `max-age=604800` in Task 5.

- [x] **Step 10: Docs**

`src/assets/fonts/README.md`, new section at the end:

```markdown
## In-world (troika) fonts

Troika (3D text) cannot read WOFF2, so the 3D chunk loads its own WOFF cuts. Sources live in `troika/` (the `@fontsource` latin cuts of Inter 400 and 800 and JetBrains Mono 400 and 700, plus a JetBrains Mono 700 symbols cut for arrows and shapes). `bun scripts/troika-fonts.ts` (fonttools 4.x) subsets them to the Latin set in `scripts/troika-glyphs.ts` (the symbols cut to the symbols the 3D text uses), keeps only the OpenType features troika applies (kern, liga, rlig, ccmp and the Arabic and Indic forms), drops hinting (SDF text ignores it) and writes `public/fonts/3d/<name>.<hash>.woff` plus `src/experience/troika-fonts.json`. About 58 KB for all five (139 KB before). `tests/content/troika-fonts.test.ts` fails when content, messages or 3D source use a character no cut covers (rerun the script) or when the cuts exceed 64 KB.
```

`AGENTS.md` folder layout: replace the `public/fonts/` line with:
`public/fonts/3d/                in-world troika fonts: subset WOFF cuts under content-hashed names (bun scripts/troika-fonts.ts from src/assets/fonts/troika/, manifest src/experience/troika-fonts.json); the symbols cut is the troika fallback (arrows, shapes) so nothing loads from a CDN. LICENSE files stay in public/fonts/`
and add under `scripts/`: `  troika-fonts.ts, troika-glyphs.ts  subset the in-world fonts (fonttools) to the characters 3D text uses; tests/content/troika-fonts.test.ts checks coverage`.
Spec 05 line 57: replace "In-world 3D text uses drei `Text` (troika) with the same font files." with "In-world 3D text uses drei `Text` (troika), which cannot read WOFF2: it loads separate WOFF cuts of Inter and JetBrains Mono, subset to the in-world characters and served under content-hashed names (about 58 KB, `src/assets/fonts/README.md`)."

- [x] **Step 11: Commit**

```bash
rtk git add scripts/troika-glyphs.ts scripts/troika-fonts.ts tests/helpers/woff.ts tests/content/troika-fonts.test.ts src/experience/troika-fonts.json public/fonts src/assets/fonts src/experience/tower/primitives.tsx src/experience/text-config.ts scripts/e2e-plan.ts AGENTS.md docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md
rtk git commit -m "perf(3d): subset troika fonts to in-world glyphs under content-hashed names"
```

### Task 5: `_headers` cache rules for unhashed assets (A2.3)

Today `/fonts`, `/tech`, `/media`, `/floors`, `/logos` are `max-age=0, must-revalidate` (about 50 revalidations per 3D revisit). Policy, safe per asset type:

| Path | Cache-Control | Why |
|---|---|---|
| `/fonts/*` | `public, max-age=31536000, immutable` | troika cuts are content-hashed (Task 4); `tests/content/troika-fonts.test.ts` keeps every served font hashed |
| `/tech/*` | `public, max-age=604800, stale-while-revalidate=86400` | logos rarely change; a replaced logo shows within a week |
| `/media/*`, `/floors/*`, `/logos/*` | `public, max-age=86400, stale-while-revalidate=604800` | may be replaced under the same name; one day, then served stale while revalidating |
| `/cv/*` (PDF and `/cv/pages/*`) | `public, max-age=3600, must-revalidate` | CV changes must show quickly (P5 replaces it this round); never served stale |
| `/papers/*` | `public, max-age=86400, must-revalidate` | PDFs and page images change rarely; never stale |
| `/` | `Link` hreflang alternates (Task 8) | |

Cloudflare joins header values when two rules match one path, so no two blocks may both set `Cache-Control` for the same file (the test checks the prefixes do not nest).

**Files:**
- Create: `tests/unit/cache-headers.test.ts`
- Modify: `public/_headers`, `scripts/deploy-smoke.ts`, `docs/deploy.md` section 9

**Interfaces:**
- Produces: `CACHE_RULES: readonly { prefix: string; value: string }[]`, `cacheProblems(observed: Record<string, string | null>): string[]`, `cacheSamples(root?: string): string[]` from `scripts/deploy-smoke.ts`; `Observed.cache?: Record<string, string | null>`.

- [x] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CACHE_RULES, cacheProblems } from "../../scripts/deploy-smoke";

const headers = readFileSync(path.join(process.cwd(), "public", "_headers"), "utf8");

/** Header lines (trimmed) of one path block of a Cloudflare Pages `_headers` file. */
function block(pattern: string): string[] {
  const lines = headers.split(/\r?\n/);
  const start = lines.indexOf(pattern);
  expect(start, pattern).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((line, i) => i > start && !/^\s/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).map((l) => l.trim()).filter(Boolean);
}

const cacheOf = (pattern: string) => block(pattern).filter((l) => l.startsWith("Cache-Control:"));

describe("cache rules for unhashed public assets", () => {
  it("cache each prefix as planned", () => {
    expect(cacheOf("/fonts/*")).toEqual(["Cache-Control: public, max-age=31536000, immutable"]);
    expect(cacheOf("/tech/*")).toEqual(["Cache-Control: public, max-age=604800, stale-while-revalidate=86400"]);
    for (const p of ["/media/*", "/floors/*", "/logos/*"]) expect(cacheOf(p), p).toEqual(["Cache-Control: public, max-age=86400, stale-while-revalidate=604800"]);
    expect(cacheOf("/cv/*")).toEqual(["Cache-Control: public, max-age=3600, must-revalidate"]);
    expect(cacheOf("/papers/*")).toEqual(["Cache-Control: public, max-age=86400, must-revalidate"]);
  });

  it("never sets Cache-Control from two nested rules (Cloudflare would join the values)", () => {
    const patterns = headers.split(/\r?\n/).filter((l) => /^\/\S*$/.test(l));
    const caching = patterns.filter((p) => cacheOf(p).length > 0).map((p) => p.replace(/\*$/, ""));
    for (const a of caching) for (const b of caching) if (a !== b) expect(b.startsWith(a), `${a} contains ${b}`).toBe(false);
  });

  it("smoke-checks production against the same values", () => {
    for (const rule of CACHE_RULES) {
      const pattern = rule.prefix.replace(/^(\/[^/]+\/).*$/, "$1*");
      expect(cacheOf(pattern), pattern).toEqual([`Cache-Control: ${rule.value}`]);
    }
    expect(cacheProblems({ "/tech/docker.svg": "public, max-age=604800, stale-while-revalidate=86400" })).toEqual([]);
    expect(cacheProblems({ "/tech/docker.svg": "max-age=0, must-revalidate" })).toEqual([
      "/tech/docker.svg Cache-Control is max-age=0, must-revalidate, expected public, max-age=604800, stale-while-revalidate=86400",
    ]);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/cache-headers.test.ts`
Expected: FAIL (`CACHE_RULES` is not exported; `/fonts/*` block missing).

- [x] **Step 3: Edit `public/_headers`**

Replace the `/brand/*` block's neighbourhood so the file has these blocks (keep `/*`, `/_next/static/*`, `/brand/*`, `/og/*`, `/data/*` as they are; `/cv/*` and `/papers/*` only change their `Cache-Control` line):

```
# In-world (troika) fonts: content-hashed names (scripts/troika-fonts.ts), so they never change.
/fonts/*
  Cache-Control: public, max-age=31536000, immutable

# Unhashed images. Tech logos rarely change; gallery images, floor thumbnails and company logos can be
# replaced under the same name, so they revalidate after a day and are served stale while revalidating.
/tech/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400

/media/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/floors/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/logos/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800
```

In the `/cv/*` block: `  Cache-Control: public, max-age=3600, must-revalidate`. In the `/papers/*` block: `  Cache-Control: public, max-age=86400, must-revalidate`.

- [x] **Step 4: Extend `scripts/deploy-smoke.ts`**

Add after the imports:

```ts
import troikaFonts from "../src/experience/troika-fonts.json";
import cvPages from "../content/generated/cv-pages.json";

/** Cache rules from public/_headers that production must serve (round 5 P1). */
export const CACHE_RULES: readonly { prefix: string; value: string }[] = [
  { prefix: "/fonts/3d/", value: "public, max-age=31536000, immutable" },
  { prefix: "/tech/", value: "public, max-age=604800, stale-while-revalidate=86400" },
  { prefix: "/media/", value: "public, max-age=86400, stale-while-revalidate=604800" },
  { prefix: "/floors/", value: "public, max-age=86400, stale-while-revalidate=604800" },
  { prefix: "/cv/pages/", value: "public, max-age=3600, must-revalidate" },
];

export function cacheProblems(observed: Record<string, string | null>): string[] {
  const problems: string[] = [];
  for (const [url, value] of Object.entries(observed)) {
    const rule = CACHE_RULES.find((r) => url.startsWith(r.prefix));
    if (rule && value !== rule.value) problems.push(`${url} Cache-Control is ${value ?? "missing"}, expected ${rule.value}`);
  }
  return problems;
}

/** One file per cached prefix, read from the checkout that was deployed. */
export function cacheSamples(root = process.cwd()): string[] {
  const content = JSON.parse(readFileSync(path.join(root, "content", "site-content.json"), "utf8")) as { floors: { labs: { pods: { assets: { src: string }[] }[] } } };
  const cover = content.floors.labs.pods.find((p) => p.assets.length > 0)!.assets[0].src;
  return [troikaFonts.sans, "/tech/docker.svg", cover, "/floors/L1.webp", cvPages.pages[0].src];
}
```

Add `cache?: Record<string, string | null>;` to `Observed`. In `smokeProblems`, before `return problems;`: `if (observed.cache) problems.push(...cacheProblems(observed.cache));`. In `observe(site)`, before `return observed;`:

```ts
  observed.cache = {};
  for (const sample of cacheSamples()) {
    try {
      const r = await fetch(`${site}${sample}`, { method: "HEAD", cache: "no-store" });
      observed.cache[sample] = r.ok ? r.headers.get("cache-control") : `HTTP ${r.status}`;
    } catch {
      observed.cache[sample] = null;
    }
  }
```

- [x] **Step 5: Run tests**

Run: `bunx vitest run tests/unit/cache-headers.test.ts tests/unit/csp.test.ts && bun run verify:quick`
Expected: PASS (the CSP test is unchanged; `/cv/*` still detaches the CSP).

- [x] **Step 6: e2e (export carries the rules)**

Run: `E2E_PORT=4430 bunx playwright test e2e/deploy.spec.ts`
Expected: PASS (it checks `out/_headers` is exported).

- [x] **Step 7: Docs**

`docs/deploy.md` section 9, replace the `/brand/*` bullet with:
"- Caching of unhashed files: `/brand/*` one week; `/fonts/*` one year `immutable` (troika cuts are content-hashed, Task 4 of round 5 P1); `/tech/*` one week plus `stale-while-revalidate` one day; `/media/*`, `/floors/*`, `/logos/*` one day plus `stale-while-revalidate` one week; `/cv/*` one hour and `/papers/*` one day, both `must-revalidate` so a replaced CV or paper never shows stale; `/og/*` one day. Two rules must never both set `Cache-Control` for one file (Cloudflare joins the values; `tests/unit/cache-headers.test.ts`). `scripts/deploy-smoke.ts` checks one file per prefix after each deploy."

- [x] **Step 8: Commit**

```bash
rtk git add public/_headers scripts/deploy-smoke.ts tests/unit/cache-headers.test.ts docs/deploy.md
rtk git commit -m "perf: cache rules for fonts, logos, media, floors, CV and papers"
```

- [x] **Step 9: Verify after deploy**

Run: `bun scripts/deploy-smoke.ts --site https://kurniadi.pages.dev`
Expected after the round 5 deploy: "Smoke check passed." (before deploy it lists the five cache problems).

### Task 6: Quiet boot (SP3, A2.8)

While the boot cover is up, the hidden Page View still downloads about 580 KB the first frame does not need: lazy images inside `#site-shell` (`visibility: hidden` keeps layout, so lazy loading fires; about 320 KB of `/media` on `/en`), about 100 KB of RSC link prefetch (`__next.*.txt`, header links in the viewport), and `/data/rooms/{locale}.json` (51 KB gz) fetched when `DrawerHost` mounts. Fixes:
1. `content-visibility: hidden` on `#site-shell` under `html[data-hq-boot]` and `html[data-hq]`: the hidden page is not laid out or painted, so its lazy images and viewport prefetches never start. The shell is already invisible there, so nothing visible changes; on release the shell lays out fresh (new content is not a layout shift; CLS stays 0, verified).
2. `QuietLink`: header, nav, crumb and hero links pass `prefetch={false}` while the cover or the tower hides the page (belt and braces for 1, which depends on IntersectionObserver ignoring skipped content).
3. Room data after the first frame on idle (`afterFirstFrameIdle`, 2 s timeout), or at once when a room opens.
4. Troika fonts: requested when the 3D text mounts, which is after the 3D JS has downloaded and evaluated, so they never compete with the bytes the first frame needs. They are not deferred further: that would move label typesetting into the boot overlay and the intro. The e2e asserts they start after the 3D chunk finished; Task 4 cut them to about 58 KB and Task 5 caches them for a year.

**Files:**
- Create: `src/experience/boot-signals.ts`, `src/components/QuietLink.tsx`, `tests/unit/boot-signals.test.ts`
- Modify: `src/app/globals.css` (boot block, lines 316-321), `src/experience/Experience.tsx:111-119` and `:205-215`, `src/hud/drawer/DrawerHost.tsx:33-45` and `:76-84`, `src/components/NavLink.tsx`, `src/components/SiteHeader.tsx:5,31`, `src/components/page/Hero.tsx` (`See work` link), `src/components/page/Layout.tsx:29-35` (`CrumbLink`), `e2e/boot-first.spec.ts`, `scripts/e2e-plan.ts`, `AGENTS.md`, spec 08

**Interfaces:**
- Produces: `markFirstFrame(): void`, `resetFirstFrame(): void`, `hasFirstFrame(): boolean`, `afterFirstFrameIdle(cb: () => void, options?: { timeoutMs?: number; idle?: IdleScheduler }): () => void`, `type IdleScheduler = (cb: () => void, timeoutMs: number) => () => void` (`src/experience/boot-signals.ts`, pure, no React or three); `useRoomViews(locale: Locale, wanted?: boolean)` (default `true`, so `HologramOverlay` is unchanged); `QuietLink` (same props as `Link` from `@/i18n/navigation`), `useQuietNav(): boolean`, `isQuiet(root?: Element | null): boolean`.

- [x] **Step 1: Write the failing unit test**

`tests/unit/boot-signals.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { afterFirstFrameIdle, hasFirstFrame, markFirstFrame, resetFirstFrame, type IdleScheduler } from "@/experience/boot-signals";

const manualIdle = () => {
  const queue: (() => void)[] = [];
  const idle: IdleScheduler = (cb) => {
    queue.push(cb);
    return () => queue.splice(queue.indexOf(cb), 1);
  };
  return { idle, flush: () => queue.splice(0).forEach((cb) => cb()), size: () => queue.length };
};

afterEach(() => resetFirstFrame());

describe("boot signals", () => {
  it("waits for the first frame, then for idle", () => {
    const { idle, flush, size } = manualIdle();
    const cb = vi.fn();
    afterFirstFrameIdle(cb, { idle });
    expect(size()).toBe(0);
    markFirstFrame();
    expect(hasFirstFrame()).toBe(true);
    expect(cb).not.toHaveBeenCalled();
    flush();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("schedules at once when the frame already happened", () => {
    const { idle, flush } = manualIdle();
    markFirstFrame();
    const cb = vi.fn();
    afterFirstFrameIdle(cb, { idle });
    flush();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("cancels before and after the frame", () => {
    const { idle, flush } = manualIdle();
    const early = vi.fn();
    afterFirstFrameIdle(early, { idle })();
    markFirstFrame();
    const late = vi.fn();
    const cancel = afterFirstFrameIdle(late, { idle });
    cancel();
    flush();
    expect(early).not.toHaveBeenCalled();
    expect(late).not.toHaveBeenCalled();
  });

  it("marks once and resets for the next Experience mount", () => {
    markFirstFrame();
    markFirstFrame();
    resetFirstFrame();
    expect(hasFirstFrame()).toBe(false);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/boot-signals.test.ts`
Expected: FAIL ("Failed to load url @/experience/boot-signals").

- [x] **Step 3: Write `src/experience/boot-signals.ts`**

```ts
/**
 * First 3D frame signal (pure: no React, no three). `Experience` marks the second rendered frame;
 * work that must not compete with the boot (room data) waits for it and then for an idle period.
 */
export type IdleScheduler = (cb: () => void, timeoutMs: number) => () => void;

const browserIdle: IdleScheduler = (cb, timeoutMs) => {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(() => cb(), { timeout: timeoutMs });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(cb, 200);
  return () => clearTimeout(id);
};

let framed = false;
const waiting = new Set<() => void>();

export function markFirstFrame(): void {
  if (framed) return;
  framed = true;
  for (const start of [...waiting]) start();
  waiting.clear();
}

export function resetFirstFrame(): void {
  framed = false;
  waiting.clear();
}

export function hasFirstFrame(): boolean {
  return framed;
}

/** Runs `cb` once, after the first frame and the next idle period (at most `timeoutMs` later). Returns a cancel function. */
export function afterFirstFrameIdle(cb: () => void, { timeoutMs = 2000, idle = browserIdle }: { timeoutMs?: number; idle?: IdleScheduler } = {}): () => void {
  let done = false;
  let cancelIdle: (() => void) | null = null;
  const start = () => {
    waiting.delete(start);
    cancelIdle = idle(() => {
      if (done) return;
      done = true;
      cb();
    }, timeoutMs);
  };
  if (framed) start();
  else waiting.add(start);
  return () => {
    done = true;
    waiting.delete(start);
    cancelIdle?.();
  };
}
```

- [x] **Step 4: Run the unit test**

Run: `bunx vitest run tests/unit/boot-signals.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Mark the first frame in `Experience.tsx`**

`src/experience/Experience.tsx:111-119`:

```tsx
function FirstFrame({ onFrame }: { onFrame?: () => void }) {
  const ticks = useRef(0);
  useFrame(() => {
    if (ticks.current > 1) return;
    ticks.current += 1;
    if (ticks.current === 2) {
      markFirstFrame();
      onFrame?.();
    }
  });
  return null;
}
```

In the audio effect (`Experience.tsx:205-215`) cleanup, add `resetFirstFrame();` after `audio.setPaused(true);`. Import: `import { markFirstFrame, resetFirstFrame } from "./boot-signals";`.

- [x] **Step 6: Room data on idle or on open (`DrawerHost.tsx`)**

```tsx
/** Room views for the locale, loaded once when `wanted` (null until ready, "error" when the fetch failed). */
export function useRoomViews(locale: Locale, wanted = true): RoomViews | null | "error" {
  const [views, setViews] = useState<RoomViews | null | "error">(null);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    loadRoomViews(locale).then(
      (v) => live && setViews(v),
      () => live && setViews("error"),
    );
    return () => {
      live = false;
    };
  }, [locale, wanted]);
  return views;
}

/** True once the first 3D frame rendered and the main thread went idle (quiet boot, REPORT SP3). */
function useAfterFirstFrameIdle(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => afterFirstFrameIdle(() => setReady(true)), []);
  return ready;
}
```

In `DrawerHost`, move `const open = Boolean(activeRoom) && phase === "room";` above the views line and replace `const views = useRoomViews(locale);` with:

```tsx
  const idle = useAfterFirstFrameIdle();
  // Room data waits for the first frame and an idle moment, unless a room opens first (deep links).
  const views = useRoomViews(locale, open || idle);
```

Import `afterFirstFrameIdle` from `@/experience/boot-signals`.

- [x] **Step 7: Skip the hidden page (`globals.css`)**

Replace the rule at `globals.css:316-321`:

```css
  /* Also while the HQ is open (Experience sets html[data-hq]): the page never paints under the
     opaque tower, so it is not a late LCP candidate. It stays in the DOM for SEO. content-visibility
     skips its layout too, so lazy images and link prefetches of the hidden page never start (quiet boot). */
  html[data-hq-boot] #site-shell,
  html[data-hq] #site-shell {
    visibility: hidden;
    content-visibility: hidden;
  }
```

- [x] **Step 8: `QuietLink`**

`src/components/QuietLink.tsx`:

```tsx
"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { Link } from "@/i18n/navigation";

const QUIET_ATTRS = ["data-hq-boot", "data-hq"];

/** True while the boot cover (html[data-hq-boot]) or the 3D tower (html[data-hq]) hides the page. */
export function isQuiet(root: Element | null = typeof document === "undefined" ? null : document.documentElement): boolean {
  return root !== null && QUIET_ATTRS.some((attr) => root.hasAttribute(attr));
}

export function useQuietNav(): boolean {
  // The initializer runs on the client during hydration too; prefetch is not rendered, so no mismatch.
  const [quiet, setQuiet] = useState(() => isQuiet());
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setQuiet(isQuiet(root));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: QUIET_ATTRS });
    return () => observer.disconnect();
  }, []);
  return quiet;
}

/** Locale link that does not prefetch while the page is hidden behind the boot cover or the tower (REPORT SP3). */
export function QuietLink(props: ComponentProps<typeof Link>) {
  const quiet = useQuietNav();
  return <Link {...props} prefetch={quiet ? false : props.prefetch} />;
}
```

Use it:
- `src/components/NavLink.tsx`: replace `import { Link, usePathname } from "@/i18n/navigation";` with `import { usePathname } from "@/i18n/navigation";` plus `import { QuietLink } from "./QuietLink";`, and `<Link ...>` / `</Link>` with `<QuietLink ...>` / `</QuietLink>`.
- `src/components/SiteHeader.tsx:31`: the home logo `<Link href="/" ...>` becomes `<QuietLink href="/" ...>` (import from `./QuietLink`; drop the `Link` import if unused).
- `src/components/page/Hero.tsx`: the "See work" `<Link href="/labs" className="pv-btn pv-btn-ghost">` becomes `<QuietLink ...>` (import from `../QuietLink`).
- `src/components/page/Layout.tsx:31`: `CrumbLink` renders `<QuietLink ...>` (import from `../QuietLink`).

`scripts/e2e-plan.ts`: add `|^src\/experience\/boot-signals\.ts$|^src\/components\/(QuietLink|NavLink|SiteHeader)\.tsx$` to the boot-first rule at line 101 (`specs: ["boot-first", "experience", "onboarding"]`), and put a `{ test: /^src\/components\/(QuietLink|NavLink|SiteHeader)\.tsx$/, specs: ["boot-first", "pageview", "static-routes"] }` rule above it so pageview still runs for the header.

- [x] **Step 9: Write the e2e**

Add to `e2e/boot-first.spec.ts` (imports: `asHumanBrowser` is already imported):

```ts
/** Records when the first 3D frame released the cover, in performance.now() time. */
async function recordRelease(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __released?: number };
    new MutationObserver(() => {
      if (w.__released === undefined && document.documentElement.getAttribute("data-hq-boot-released") === "ready") w.__released = performance.now();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-hq-boot-released"] });
  });
}

type Timing = { path: string; start: number; end: number };
const timings = (page: Page) =>
  page.evaluate(() =>
    performance.getEntriesByType("resource").map((e) => {
      const r = e as PerformanceResourceTiming;
      return { path: new URL(r.name).pathname, start: r.startTime, end: r.responseEnd };
    }),
  );

test("quiet boot: no Page View media, link prefetch or room data before the first frame", async ({ page }) => {
  await recordRelease(page);
  await page.goto("/en?tier=lite", { waitUntil: "commit" });
  await expect(page.locator("html")).toHaveAttribute("data-hq-boot-released", "ready", { timeout: 60_000 });
  const released = await page.evaluate(() => (window as unknown as { __released: number }).__released);
  // Room data and fonts load after the frame (idle, at most 2 s later).
  await expect.poll(async () => (await timings(page)).some((t) => t.path.startsWith("/data/rooms/")), { timeout: 15_000 }).toBe(true);
  const all: Timing[] = await timings(page);
  const before = all.filter((t) => t.start < released).map((t) => t.path);
  expect(before.filter((p) => /^\/(media|tech|logos|floors)\//.test(p) || p.startsWith("/brand/kurniadi"))).toEqual([]);
  expect(before.filter((p) => p.endsWith(".txt"))).toEqual([]);
  expect(before.filter((p) => p.startsWith("/data/rooms/"))).toEqual([]);
  // Troika fonts never compete with the 3D JavaScript: they start after the last chunk before the frame finished.
  const lastChunkBeforeFrame = Math.max(...all.filter((t) => t.path.endsWith(".js") && t.end < released).map((t) => t.end));
  for (const font of all.filter((t) => t.path.startsWith("/fonts/3d/"))) expect(font.start, font.path).toBeGreaterThanOrEqual(lastChunkBeforeFrame - 1);
});

test("quiet boot: the timeout release shows the skipped page without layout shift and loads its images", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await asHumanBrowser(page);
  // No Next.js chunk: nothing releases the cover, so the head script's 8 s timeout does (content-visibility hidden to visible).
  await page.route("**/_next/static/chunks/**/*.js", (route) => route.abort());
  await page.goto("/en?tier=lite", { waitUntil: "commit" });
  await expect(page.locator("html")).toHaveAttribute("data-hq-boot-released", "timeout", { timeout: 15_000 });
  await expect(page.locator("#site-shell")).toBeVisible();
  await page.locator("#work").scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator("#work img").first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
});
```

(Task 7 adds the release-by-link variant of the CLS check.)

- [x] **Step 10: Run the e2e on the base build to see it fail, then on the branch**

```bash
bun scripts/serve-static.ts --port 4430 --dir ../hq-p1-base/out & SERVER=$!
E2E_PORT=4430 bunx playwright test e2e/boot-first.spec.ts -g "quiet boot: no Page View"
kill $SERVER
bun run verify:quick && E2E_PORT=4430 bun run e2e:changed
```
Expected: base FAIL (lists `/media/...` and `.txt` requests before the frame, and `/data/rooms/en.json`); branch PASS for boot-first, experience, onboarding, labs (deep-link drawers still open: `open` triggers the fetch at once), drawer specs, pageview.

- [x] **Step 11: Measure and diff**

```bash
bun scripts/serve-static.ts --port 4430 --dir out & SERVER=$!
bun scripts/measure-delivery.ts --base http://127.0.0.1:4430 --label t6
bun scripts/measure-delivery.ts --base http://127.0.0.1:4430 --label t6-p1 --throttle
SCREENSHOTS=1 SHOT_LABEL=t6 E2E_PORT=4430 bunx playwright test e2e/delivery-visual.spec.ts --workers=1
kill $SERVER
bun scripts/shot-diff.ts screenshots/delivery/before screenshots/delivery/t6 --only 3d- --max 0.005
bun scripts/shot-diff.ts screenshots/delivery/before screenshots/delivery/t6 --only page- --delta 16 --max 0.001
bun scripts/shot-diff.ts screenshots/delivery/before screenshots/delivery/t6 --only boot- --delta 16 --max 0.001
```
Expected: bytes before the first frame at least 300 KB lower than `before.json` (SP3 pass mark), `images` and `rsc-prefetch` buckets 0 before the frame; with `--throttle` the first frame at least 0.8 s earlier than a `before` throttled run (`bun scripts/measure-delivery.ts --label before-p1 --throttle` against the base build); all diffs `ok`. Rollback: if a Page View diff fails, the `content-visibility` line is the suspect (remove it and rely on `QuietLink` plus a `loading` swap); if a 3D diff fails, nothing in this task draws 3D, so rerun to rule out noise.

- [x] **Step 12: Docs**

`AGENTS.md` "3D experience", game-first bullet: after "`#site-shell` also stays `visibility: hidden` while `html[data-hq]` is set (tower open), so the page never paints under it and never becomes a late LCP." add: "Both states also set `content-visibility: hidden`, so the hidden page's lazy images and link prefetches never start (quiet boot); header, nav, crumb and hero links use `QuietLink` (`prefetch={false}` while hidden). The Glass Drawer data loads after the first frame on idle (`afterFirstFrameIdle` in `src/experience/boot-signals.ts`) or at once when a room opens."
`AGENTS.md` "Glass Drawer", "The drawer fetches it once (`loadRoomViews`)" becomes "The drawer fetches it once (`loadRoomViews`), after the first 3D frame on idle or when a room opens first".
Spec 08 section 2: add a row "Bytes before the first 3D frame (game-first `/en`, lite): only the HTML, CSS, page fonts, initial JS and the 3D chunks; no Page View images, link prefetch or room data (`e2e/boot-first.spec.ts` quiet boot)".

- [x] **Step 13: Commit**

```bash
rtk git add src/experience/boot-signals.ts src/experience/Experience.tsx src/hud/drawer/DrawerHost.tsx src/app/globals.css src/components/QuietLink.tsx src/components/NavLink.tsx src/components/SiteHeader.tsx src/components/page/Hero.tsx src/components/page/Layout.tsx tests/unit/boot-signals.test.ts e2e/boot-first.spec.ts scripts/e2e-plan.ts AGENTS.md docs/superpowers/specs/agent-hq/08-quality-acceptance.md
rtk git commit -m "perf: quiet boot (skip the hidden page, no prefetch under the cover, room data after the first frame)"
```

### Task 7: Boot card says who the owner is, with a small "Page view" link (A1.1, A1.3, spec gap 17)

Owner decision: the server-rendered boot card shows the headline and role (plus the motto) and a small "Page view" link; Boot rover and the full intro stay. Today the card shows `rover@hq:~$ ./boot`, the monogram and a 12 px log line with the name only (REPORT: headline reaches game-first visitors after 6.5 to 11 s). The SSR cover paints at FCP (about 1 s) with zero JS; the overlay renders the same `BootCard`, so the handoff does not move.

The link must work before hydration: it is a real link to `?view=page`. The inline head script (`bootFirstScript`) treats `?view=page` as the stored Page View choice (`sessionStorage["hq:view"] = "page"`, no boot) and removes the parameter with `history.replaceState`. After hydration `ExperienceGate` intercepts clicks on `[data-hq-page-link]` and switches to the Page View without a reload (same path as the HUD "Page view").

**Files:**
- Modify: `src/components/BootCard.tsx`, `src/components/BootCover.tsx`, `src/hud/BootOverlay.tsx`, `src/hud/Hud.tsx:125`, `src/app/[locale]/layout.tsx:60`, `src/lib/boot-first.ts`, `src/experience/ExperienceGate.tsx`, `src/experience/types.ts:138`, `src/content/experience.ts:93`, `src/content/selectors.ts`, `src/app/globals.css` (boot block), `tests/unit/boot-first.test.ts`, `tests/unit/selectors.test.ts`, `e2e/boot-first.spec.ts`, `scripts/e2e-plan.ts:101`, `AGENTS.md`, `docs/superpowers/specs/agent-hq/02-interaction-and-states.md` section 2

**Interfaces:**
- Consumes: Task 6 quiet-boot CSS (the shell is skipped under the cover).
- Produces: `takePageViewParam(search: string): string | null` (`src/lib/boot-first.ts`, self-contained for `toString()`); `roleLine(role: { title: LocalizedText; org: string }, locale: Locale): string` (`src/content/selectors.ts`); `BootWho { name; headline; motto?; role }`, `BootPageLink { href; label; hint }` and props `who?`, `pageView?` on `BootCard`; `BootCover({ locale, monogram, who })`; `BootOverlay({ monogram, who })`; `ExperienceData.profile.motto?: string`; link marker attribute `data-hq-page-link`.

- [x] **Step 1: Write the failing unit tests**

`tests/unit/boot-first.test.ts`: import `takePageViewParam`, extend the `runScript` harness with a `history` fake, and add tests.

In `runScript`: add `const replaced: string[] = [];` and `const history = { state: null, replaceState: (_state: unknown, _title: string, url: string) => replaced.push(url) };`; add `"history"` as the last parameter name of `new Function(...)` (before the script argument) and pass `history` as the last argument of `run(...)`; change the location object to `{ pathname: input.path, search: input.search ?? "", hash: "" }`; return `{ attrs, timers, session, win, paint, replaced }`.

```ts
describe("takePageViewParam", () => {
  it("removes only view=page and keeps other parameters", () => {
    expect(takePageViewParam("?view=page")).toBe("");
    expect(takePageViewParam("?tier=lite&view=page")).toBe("?tier=lite");
    expect(takePageViewParam("?view=page&walk=off")).toBe("?walk=off");
  });

  it("ignores other views and empty queries", () => {
    expect(takePageViewParam("?view=architecture")).toBeNull();
    expect(takePageViewParam("")).toBeNull();
  });
});

describe("bootFirstScript ?view=page", () => {
  it("stores the Page View, skips the boot and cleans the URL", () => {
    const r = runScript({ path: "/en", search: "?view=page" });
    expect(r.attrs.has("data-hq-boot")).toBe(false);
    expect(r.attrs.get("data-hq-3d")).toBe("1");
    expect(r.session.get("hq:view")).toBe("page");
    expect(r.replaced).toEqual(["/en"]);
  });
});
```

`tests/unit/selectors.test.ts`:

```ts
describe("roleLine", () => {
  it("joins the role title and the organization", () => {
    expect(roleLine({ title: { en: "Technical Consultant", id: "Konsultan Teknis" }, org: "Metrodata" }, "id")).toBe("Konsultan Teknis · Metrodata");
  });
});
```

(add `roleLine` to the existing `@/content/selectors` import).

- [x] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/boot-first.test.ts tests/unit/selectors.test.ts`
Expected: FAIL (`takePageViewParam` and `roleLine` are not exported).

- [x] **Step 3: Implement `takePageViewParam` and the head script line**

`src/lib/boot-first.ts`, before `bootFirstScript`:

```ts
/**
 * `?view=page` is the boot card's "Page view" link (a real link, so it works before hydration): the
 * head script stores the Page View choice and drops the parameter. Returns the search without it, or
 * null when it is absent. Self-contained (no imports, no closures) for toString().
 */
export function takePageViewParam(search: string): string | null {
  if (!/[?&]view=page(&|$)/.test(search)) return null;
  const rest = search
    .replace(/^\?/, "")
    .split("&")
    .filter((part) => part !== "view=page")
    .join("&");
  return rest ? "?" + rest : "";
}
```

In `bootFirstScript()`, the first template line becomes:

```ts
  return `(function(){try{var s=null,p=null;try{s=sessionStorage.getItem("hq:view");p=sessionStorage.getItem("${PROBE_KEY}")}catch(e){}
var q=(${takePageViewParam.toString()})(location.search);if(q!==null){s="page";try{sessionStorage.setItem("hq:view","page")}catch(e){}try{history.replaceState(history.state,"",location.pathname+q+location.hash)}catch(e){}}
var c=navigator.connection,d=document.documentElement,...
```

(only the `var q=...` line is new; the rest of the template is unchanged).

`src/content/selectors.ts`:

```ts
/** "Technical Consultant, Software & AI · Metrodata (...)": the current role line on the boot card and in the 3D profile card. */
export function roleLine(role: { title: LocalizedText; org: string }, locale: Locale): string {
  return `${role.title[locale]} · ${role.org}`;
}
```

(`LocalizedText` and `Locale` as type imports from `./schema`.) `src/content/experience.ts:93`: `role: roleLine(profile.currentRole, locale),` and add `motto: profile.subheadline[locale],` next to it. `src/experience/types.ts:138`: `profile: { name: string; monogram: string; headline: string; role: string; location: string; motto?: string };`.

- [x] **Step 4: Run the unit tests**

Run: `bunx vitest run tests/unit/boot-first.test.ts tests/unit/selectors.test.ts`
Expected: PASS.

- [x] **Step 5: Boot card markup**

`src/components/BootCard.tsx` (whole file):

```tsx
import type { Ref } from "react";
import { splitBootLine } from "@/lib/boot-first";

/** Who the owner is, shown on the boot card at first paint (owner decision, round 5). */
export interface BootWho {
  name: string;
  headline: string;
  motto?: string;
  role: string;
}

/** The small "Page view" link: a real `?view=page` link (works before hydration, see takePageViewParam). */
export interface BootPageLink {
  href: string;
  label: string;
  hint: string;
}

export interface BootCardProps {
  eyebrow: string;
  monogram: string;
  title: string;
  titleId?: string;
  lines: string[];
  /** Number of lines shown; the rest keep their space so the card never changes height. */
  shown: number;
  /** CSS-staggered line reveal (the SSR cover, which has no JS yet). */
  stagger?: boolean;
  startLabel: string;
  onStart?: () => void;
  /** The log is still typing: Boot rover stays focusable but does nothing yet (the boot is never skipped). */
  startDisabled?: boolean;
  startRef?: Ref<HTMLButtonElement>;
  /** Render the button invisible (cover): same layout as the overlay, nothing to click or focus. */
  placeholder?: boolean;
  who?: BootWho;
  pageView?: BootPageLink;
}

/**
 * The boot card shared by the SSR boot cover and the 3D boot overlay, so the handoff from one to
 * the other does not move a pixel. Plain markup (no hooks), usable from server and client components.
 * There is no skip: the boot and the intro always play in full (owner decision). "Page view" leaves
 * the 3D view (it is not a skip); ExperienceGate handles it without a reload once hydrated.
 */
export function BootCard({ startRef, ...p }: BootCardProps) {
  // On the cover only the owner block and the Page view link are for assistive tech; the log is decoration.
  const deco = p.placeholder ? true : undefined;
  return (
    <div className="hq-boot-card">
      <p className="eyebrow" aria-hidden={deco}>
        {p.eyebrow}
      </p>
      <p className="mt-3 font-mono text-sm text-cyan" aria-hidden={deco}>
        {p.monogram}
      </p>
      <p id={p.titleId} className="mt-2 text-2xl font-extrabold text-ink" aria-hidden={deco}>
        {p.title}
      </p>
      {p.who && (
        <div className="hq-boot-who" data-testid="boot-who">
          <p className="text-lg leading-6 font-bold text-ink">{p.who.name}</p>
          <p className="text-sm font-semibold text-cyan">{p.who.headline}</p>
          {p.who.motto && <p className="mt-1 text-sm leading-5 text-ink-2">{p.who.motto}</p>}
          <p className="mt-1 font-mono text-xs leading-5 text-ink-3">{p.who.role}</p>
        </div>
      )}
      <ol className="hq-boot-log mt-5" aria-hidden={deco}>
        {p.lines.map((line, i) => {
          const { ok, text } = splitBootLine(line);
          return (
            <li
              key={line}
              data-shown={i < p.shown ? "" : undefined}
              style={p.stagger ? { animationDelay: `${120 + i * 220}ms` } : undefined}
              className={p.stagger ? "hq-boot-line-in" : undefined}
            >
              {ok ? <span className="text-green">[ok]</span> : null} {text}
            </li>
          );
        })}
      </ol>
      <div className="hq-boot-bar" aria-hidden="true" />
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          ref={startRef}
          type="button"
          onClick={p.onStart}
          aria-disabled={p.startDisabled || undefined}
          tabIndex={p.placeholder ? -1 : undefined}
          className={`inline-flex min-h-11 items-center rounded-xl bg-[#6366f1] px-6 py-3 font-semibold text-white shadow-[0_0_30px_rgba(99,102,241,.55)] transition hover:bg-[#6366f1]/85 ${
            p.startDisabled ? "cursor-wait opacity-70" : ""
          } ${p.placeholder ? "invisible" : ""}`}
        >
          {p.startLabel}
        </button>
        {p.pageView && (
          <a href={p.pageView.href} title={p.pageView.hint} data-hq-page-link="" className="hq-boot-page">
            {p.pageView.label}
          </a>
        )}
      </div>
    </div>
  );
}
```

`src/app/globals.css`, inside the boot block after `.hq-boot-card { ... }`:

```css
  .hq-boot-who {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgb(99 102 241 / 0.22);
  }
  .hq-boot-page {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    font-size: 0.875rem;
    color: var(--color-ink-2);
    text-decoration: underline;
    text-decoration-color: rgb(34 211 238 / 0.5);
    text-underline-offset: 4px;
  }
  .hq-boot-page:hover,
  .hq-boot-page:focus-visible {
    color: var(--color-ink);
  }
```

`src/components/BootCover.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/content/schema";
import { BootCard, type BootWho } from "./BootCard";

/**
 * SSR boot cover. Hidden unless the inline head script set `html[data-hq-boot]` (src/lib/boot-first.ts);
 * then it hides the Page View until the 3D HQ draws its first frame, and the boot overlay takes over.
 * It names the owner at first paint and offers the Page View (a real link, works before any JS).
 */
export async function BootCover({ locale, monogram, who }: { locale: Locale; monogram: string; who: BootWho }) {
  const t = await getTranslations({ locale, namespace: "hud" });
  const lines = [t("bootLine1"), t("bootLine2"), t("bootLine3"), t("bootLine4", { name: who.name }), t("bootLine5"), t("bootLine6")];
  return (
    <div id="hq-boot-cover" data-testid="boot-cover" className="hq-boot-cover">
      <BootCard
        eyebrow={t("bootEyebrow")}
        monogram={monogram}
        title={t("bootTitle")}
        lines={lines}
        shown={lines.length}
        stagger
        startLabel={t("bootStart")}
        placeholder
        who={who}
        pageView={{ href: "?view=page", label: t("pageView"), hint: t("pageViewHint") }}
      />
    </div>
  );
}
```

`src/app/[locale]/layout.tsx:60`:

```tsx
        <BootCover
          locale={locale}
          monogram={profile.monogram}
          who={{ name: profile.name, headline: profile.headline[locale], motto: profile.subheadline[locale], role: roleLine(profile.currentRole, locale) }}
        />
```

(import `roleLine` from `@/content/selectors`).

`src/hud/BootOverlay.tsx`: signature `export function BootOverlay({ monogram, who }: { monogram: string; who: BootWho })`, `name` becomes `who.name` in `bootLine4`, and the `BootCard` gets `who={who}` and `pageView={{ href: "?view=page", label: t("pageView"), hint: t("pageViewHint") }}`. `src/hud/Hud.tsx:125`:

```tsx
        <BootOverlay
          monogram={data.profile.monogram}
          who={{ name: data.profile.name, headline: data.profile.headline, motto: data.profile.motto, role: data.profile.role }}
        />
```

- [x] **Step 6: `ExperienceGate` handles the link without a reload**

Replace the inline `onExit` with a shared callback and add the click listener:

```tsx
  // Page View from the HUD, or from the boot card's "Page view" link (cover or overlay).
  const toPage = useCallback(() => {
    try {
      sessionStorage.setItem(VIEW_KEY, "page");
    } catch {
      // Ignore storage errors; the view still switches.
    }
    setView("page");
    // Hand focus to the page content; the Back to 3D button is the first stop on Tab.
    window.requestAnimationFrame(() => document.getElementById("main")?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!(e.target instanceof Element) || !e.target.closest("[data-hq-page-link]")) return;
      e.preventDefault();
      toPage();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [toPage]);
```

and `onExit={toPage}` on `<Experience>`. The existing effect releases the cover with `"page"` when `view === "page"`.

`scripts/e2e-plan.ts:101`: append `|^src\/hud\/BootOverlay\.tsx$` to the regex.

- [x] **Step 7: Write the e2e**

`e2e/boot-first.spec.ts` (add `import data from "../content/site-content.json";`):

```ts
test("boot card: who the owner is at first paint, and Page view works before any JavaScript", async ({ page }) => {
  await asHumanBrowser(page);
  await page.route("**/_next/static/chunks/**/*.js", (route) => route.abort());
  await page.goto("/en?tier=lite", { waitUntil: "domcontentloaded" });
  const cover = page.getByTestId("boot-cover");
  const who = cover.getByTestId("boot-who");
  await expect(who).toBeVisible();
  for (const text of [data.profile.name, data.profile.headline.en, data.profile.subheadline.en, data.profile.currentRole.org]) await expect(who).toContainText(text);
  await cover.getByRole("link", { name: en.hud.pageView }).click();
  await expect(page).toHaveURL(/\/en$/);
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("hq:view"))).toBe("page");
});

test("boot card: the overlay keeps the card in place, Boot rover stays required, Page view leaves 3D without a reload", async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/en?tier=lite", { waitUntil: "commit" });
  const coverCard = page.getByTestId("boot-cover").locator(".hq-boot-card");
  await expect(coverCard).toBeVisible();
  const coverBox = (await coverCard.boundingBox())!;
  await expect(page.getByTestId("boot")).toBeVisible({ timeout: 60_000 });
  const overlayBox = (await page.getByTestId("boot").locator(".hq-boot-card").boundingBox())!;
  for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(overlayBox[k] - coverBox[k]), k).toBeLessThanOrEqual(1);
  await page.waitForTimeout(1500); // proves the intro never starts without the Boot rover click
  expect(await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { phase: string } } } }).__hq.store.getState().phase)).toBe("boot");
  await page.evaluate(() => ((window as unknown as { __sameDocument: boolean }).__sameDocument = true));
  await page.getByTestId("boot").getByRole("link", { name: en.hud.pageView }).click();
  await expect(page.getByTestId("hq")).toHaveCount(0);
  await expect(page.locator("#site-shell")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
  expect(page.url()).toMatch(/\/en\?tier=lite$/);
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
  expect(errors).toEqual([]);
});
```

- [x] **Step 8: Run**

Run: `bun run verify:quick && E2E_PORT=4430 bun run e2e:changed`
Expected: PASS for boot-first (old and new tests: the first test still sees the overlay after `ready`), experience, onboarding (Boot rover still starts the intro), hud.

- [x] **Step 9: Screenshot diff (intended change on the boot card only)**

```bash
bun scripts/serve-static.ts --port 4430 --dir out & SERVER=$!
SCREENSHOTS=1 SHOT_LABEL=t7 E2E_PORT=4430 bunx playwright test e2e/delivery-visual.spec.ts --workers=1
kill $SERVER
bun scripts/shot-diff.ts screenshots/delivery/t6 screenshots/delivery/t7 --only 3d- --max 0.005
bun scripts/shot-diff.ts screenshots/delivery/t6 screenshots/delivery/t7 --only page- --delta 16 --max 0.001
```
Expected: `3d-*` and `page-*` `ok`; `boot-*` differ on purpose: attach `screenshots/delivery/t6/boot-*.png` and `t7/boot-*.png` (1440x900, 1999x1129, 834x1112, 390x844) to the PR. Check by eye: the card fits the 390x844 screen without scrolling, the owner block reads Name / headline / motto / role, the "Page view" link sits right of the (invisible on the cover) Boot rover button. Rollback: revert this task's commit; the cover returns to the name-only log.

- [x] **Step 10: Docs**

`AGENTS.md` game-first bullet: after "CSS then hides `#site-shell` behind the SSR `BootCover` (`src/components/BootCover.tsx`)." add: "The boot card names the owner at first paint (name, headline, motto and current role from content; `BootWho`) and carries a small \"Page view\" link: a real `?view=page` link that the head script turns into the stored Page View choice (`takePageViewParam`, the parameter is removed from the URL), and that `ExperienceGate` handles without a reload once hydrated (`data-hq-page-link`). It leaves the 3D view; it does not skip the boot or the intro."
Spec 02 section 2, Boot row: add "The boot card shows the owner's name, headline, motto and current role (server-rendered, visible at first paint) and a small \"Page view\" link that leaves the 3D view; Boot rover is still required and the intro still plays in full (owner decision, round 5)."

- [x] **Step 11: Commit**

```bash
rtk git add src/components/BootCard.tsx src/components/BootCover.tsx src/hud/BootOverlay.tsx src/hud/Hud.tsx "src/app/[locale]/layout.tsx" src/lib/boot-first.ts src/experience/ExperienceGate.tsx src/experience/types.ts src/content/experience.ts src/content/selectors.ts src/app/globals.css tests/unit/boot-first.test.ts tests/unit/selectors.test.ts e2e/boot-first.spec.ts scripts/e2e-plan.ts AGENTS.md docs/superpowers/specs/agent-hq/02-interaction-and-states.md
rtk git commit -m "feat(boot): name the owner on the boot card and offer a Page view link that works before JS"
```

### Task 8: `/` redirect: run before the stylesheet, hreflang Link header (A2.1, spec gaps 18, 23)

`/` stays a static redirect page (owner decision); only cheap improvements. Its inline redirect sits in `<main>` after the render-blocking stylesheet, so it waits for the CSS (est. 0.2 to 0.5 s real, 0.5 to 0.8 s at P1). A post-build step copies it to the top of `<head>`; a guard makes the second copy a no-op, so hydration still matches. `_headers` adds HTTP hreflang alternates for `/`.

**Files:**
- Create: `scripts/root-redirect.ts`, `tests/unit/root-redirect.test.ts`
- Modify: `src/app/(root)/page.tsx:11,17`, `package.json` (`build`, `build:web`), `public/_headers`, `tests/unit/cache-headers.test.ts`, `e2e/static-routes.spec.ts`, `AGENTS.md` (i18n `/` bullet, folder layout scripts), `docs/superpowers/specs/agent-hq/04-hud-responsive-i18n.md` line 48, `docs/deploy.md` section 9

**Interfaces:**
- Produces: `hoistRootRedirect(html: string): string` (idempotent; throws when the script is missing); the page script carries `id="hq-root-redirect"`, the hoisted copy `data-hq-hoisted=""`; `window.__hqRedirect` guard.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { hoistRootRedirect } from "../../scripts/root-redirect";

const PAGE = '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><link rel="stylesheet" href="/a.css"/></head><body><main><script id="hq-root-redirect">go()</script></main></body></html>';

describe("hoistRootRedirect", () => {
  it("copies the redirect above the stylesheet and keeps the original for hydration", () => {
    const out = hoistRootRedirect(PAGE);
    expect(out.indexOf("<script data-hq-hoisted=\"\">go()</script>")).toBeGreaterThan(out.indexOf('<meta charSet="utf-8"/>'));
    expect(out.indexOf("data-hq-hoisted")).toBeLessThan(out.indexOf('rel="stylesheet"'));
    expect(out).toContain('<script id="hq-root-redirect">go()</script>');
  });

  it("is idempotent and fails loudly without the script", () => {
    const once = hoistRootRedirect(PAGE);
    expect(hoistRootRedirect(once)).toBe(once);
    expect(() => hoistRootRedirect("<html><head></head><body></body></html>")).toThrow(/hq-root-redirect/);
  });
});
```

Add to `tests/unit/cache-headers.test.ts`:

```ts
  it("announces the language alternates of / over HTTP", () => {
    expect(block("/")).toEqual(['Link: </en>; rel="alternate"; hreflang="en", </id>; rel="alternate"; hreflang="id", </en>; rel="alternate"; hreflang="x-default"']);
  });
```

- [x] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/root-redirect.test.ts tests/unit/cache-headers.test.ts`
Expected: FAIL (module missing; `/` block missing).

- [x] **Step 3: Implement**

`scripts/root-redirect.ts`:

```ts
/**
 * Post-build (part of `bun run build`): copies the "/" language redirect to the top of <head> in
 * out/index.html, so it runs before the render-blocking stylesheet arrives (REPORT A2.1). React keeps
 * the original inside <main> (hydration still matches); its `window.__hqRedirect` guard makes it a no-op.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SCRIPT = /<script id="hq-root-redirect">([\s\S]*?)<\/script>/;

export function hoistRootRedirect(html: string): string {
  if (html.includes("data-hq-hoisted")) return html;
  const match = SCRIPT.exec(html);
  if (!match) throw new Error('root-redirect: <script id="hq-root-redirect"> not found');
  const charset = /<meta charSet="utf-8"\/?>/i.exec(html);
  const head = html.indexOf("<head>");
  const at = charset ? charset.index + charset[0].length : head + "<head>".length;
  if (!charset && head < 0) throw new Error("root-redirect: no <head>");
  return `${html.slice(0, at)}<script data-hq-hoisted="">${match[1]}</script>${html.slice(at)}`;
}

if (import.meta.main) {
  const file = path.join(process.cwd(), "out", "index.html");
  writeFileSync(file, hoistRootRedirect(readFileSync(file, "utf8")));
  console.log("root-redirect: / redirect runs before the stylesheet");
}
```

`src/app/(root)/page.tsx:11`: the script string starts with the guard:

```ts
const REDIRECT_SCRIPT = `(function(){if(window.__hqRedirect)return;window.__hqRedirect=1;try{var s=localStorage.getItem("hq:locale");var l=s==="en"||s==="id"?s:((navigator.languages&&navigator.languages[0])||navigator.language||"en").toLowerCase().indexOf("id")===0?"id":"en";location.replace("/"+l+location.search+location.hash);}catch(e){location.replace("/en");}})();`;
```

and line 17: `<script id="hq-root-redirect" dangerouslySetInnerHTML={{ __html: REDIRECT_SCRIPT }} />`.

`package.json` `build` and `build:web`: `... && bun scripts/defer-scripts.ts && bun scripts/root-redirect.ts && bun scripts/check-client-chunks.ts`.

`public/_headers`, after the `/*` block:

```
# "/" is a static language redirect: announce the alternates to crawlers over HTTP too.
/
  Link: </en>; rel="alternate"; hreflang="en", </id>; rel="alternate"; hreflang="id", </en>; rel="alternate"; hreflang="x-default"
```

- [x] **Step 4: e2e**

`e2e/static-routes.spec.ts`:

```ts
test("root: the language redirect runs before the stylesheet; hreflang alternates stay", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const hoisted = html.indexOf("data-hq-hoisted");
  expect(hoisted).toBeGreaterThan(-1);
  expect(hoisted).toBeLessThan(html.indexOf('rel="stylesheet"'));
  for (const lang of ["en", "id", "x-default"]) expect(html).toMatch(new RegExp(`hreflang="${lang}"`, "i"));
});
```

- [x] **Step 5: Run**

Run: `bunx vitest run tests/unit/root-redirect.test.ts tests/unit/cache-headers.test.ts && bun run verify:quick && E2E_PORT=4430 bunx playwright test e2e/static-routes.spec.ts e2e/seo.spec.ts`
Expected: PASS, including the existing "root redirects by browser language".

- [x] **Step 6: Measure the hop (manual, for the PR body)**

```bash
bun scripts/serve-static.ts --port 4430 --dir out & SERVER=$!
bun -e 'import { chromium } from "@playwright/test"; const b = await chromium.launch(); const p = await b.newPage(); const c = await p.context().newCDPSession(p); await c.send("Network.enable"); await c.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 94000 }); const t = Date.now(); await p.goto("http://127.0.0.1:4430/"); await p.waitForURL(/\/en$/); console.log("/ to /en navigation:", Date.now() - t, "ms"); await b.close();'
kill $SERVER
```
Run the same against the base build (`--dir ../hq-p1-base/out`). Expected: at least 150 ms faster on the branch (REPORT spike S2 variant b).

- [x] **Step 7: Docs**

`AGENTS.md` i18n bullet: "`/` is a static page that redirects using `localStorage[\"hq:locale\"]`, then `navigator.language`; `scripts/root-redirect.ts` (part of `build`) copies the redirect above the stylesheet in `out/index.html`, and `public/_headers` sends hreflang `Link` alternates for `/`." Add `root-redirect.ts` to the `scripts/` folder list. Spec 04 line 48: append "The redirect runs before the stylesheet loads (post-build hoist) and `/` sends hreflang alternates as an HTTP `Link` header." `docs/deploy.md` section 9: add a bullet "`/`: `Link` hreflang alternates (en, id, x-default)."

- [x] **Step 8: Commit**

```bash
rtk git add scripts/root-redirect.ts tests/unit/root-redirect.test.ts "src/app/(root)/page.tsx" package.json public/_headers tests/unit/cache-headers.test.ts e2e/static-routes.spec.ts AGENTS.md docs/superpowers/specs/agent-hq/04-hud-responsive-i18n.md docs/deploy.md
rtk git commit -m "perf: run the / language redirect before the stylesheet and send hreflang Link headers"
```

### Task 9: Landing hero copy: no eyebrow, a smaller name, the new motto (owner requests)

Owner: "Remove WELCOME TO SHINYQ HQ in the Page view and my name on the landing was too big, smaller it a little"; new motto replacing "I build and operate software and AI applications in production." everywhere (EN "Production-grade AI and software for banking, fintech and enterprise.", ID "AI dan software kelas production untuk perbankan, fintech, dan enterprise."); owner rule: no first-person in mottos or taglines. The motto is `profile.subheadline` (one content field), which feeds the landing hero (`Hero.tsx:40`), the boot card (Task 7), the L1 Highlights Hall about station (`hallContent.ts:110`, 3D), the RF about card (`roof/kit.tsx:194`, 3D), the Highlights drawer (`room-views/highlights.ts:43`), the Ask pack (`src/ask/pack.ts:114`) and the OG cards (`og-cards.ts:46`, owned by P9). Two ID pod taglines use "saya" (`vendor-management-portal`, `digital-products-ecommerce`). `docs/design/**` mockups keep the old copy (historical design captures, not served).

Name size one step down: `.hx-name` `clamp(48px, 9.6vw, 132px)` to `clamp(44px, 8vw, 112px)` (1440: 132 to 112 px; 1999: 132 to 112 px; 834: 80 to 67 px; 390: 48 to 44 px); `pv-d-l` and the section titles stay smaller, so the hierarchy holds.

**Files:**
- Create: `tests/content/taglines.test.ts`
- Modify: `src/components/page/Hero.tsx:14-41`, `src/app/landing.css:99-109` (remove `.hx-eyebrow`; keep `.hx-dot`, used by `StatTicker.tsx:40`) and `:121-125`, `messages/en.json` and `messages/id.json` (remove `home.hero.welcome`), `content/site-content.json` (`profile.subheadline`, two ID taglines), `e2e/pageview.spec.ts`, `AGENTS.md` ("Content style", "Page View" landing bullet)

**Interfaces:**
- Consumes: Task 4 (3D font cut covers the motto: ASCII only), Task 7 (boot card shows `profile.subheadline`).
- Produces: `FIRST_PERSON: Record<"en" | "id", RegExp>` in `tests/content/taglines.test.ts`.

- [x] **Step 1: Write the failing content test**

```ts
import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";

/** Owner rule (round 5): mottos and taglines never speak in the first person, in either locale. */
const FIRST_PERSON = { en: /\b(I|I'm|I've|I'd|me|my|mine)\b/, id: /\b(saya|aku|ku)\b/i } as const;

describe("mottos and taglines", () => {
  const content = getContent();
  const entries = [
    { where: "profile.subheadline", text: content.profile.subheadline },
    ...content.floors.labs.pods.map((pod) => ({ where: `pods.${pod.slug}.tagline`, text: pod.tagline })),
  ];

  it("never use the first person", () => {
    const issues = entries.flatMap(({ where, text }) => (["en", "id"] as const).filter((l) => FIRST_PERSON[l].test(text[l])).map((l) => `${where}.${l}: ${text[l]}`));
    expect(issues).toEqual([]);
  });

  it("carry the owner's motto", () => {
    expect(content.profile.subheadline).toEqual({
      en: "Production-grade AI and software for banking, fintech and enterprise.",
      id: "AI dan software kelas production untuk perbankan, fintech, dan enterprise.",
    });
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/content/taglines.test.ts`
Expected: FAIL listing `profile.subheadline.en`, `profile.subheadline.id`, `pods.vendor-management-portal.tagline.id`, `pods.digital-products-ecommerce.tagline.id`.

- [x] **Step 3: Update content**

`content/site-content.json`:
- `profile.subheadline.en`: `"Production-grade AI and software for banking, fintech and enterprise."`
- `profile.subheadline.id`: `"AI dan software kelas production untuk perbankan, fintech, dan enterprise."`
- `vendor-management-portal` `tagline.id`: `"eVendor, portal vendor internal MII untuk purchase order, invoice, verifikasi pajak, dan approval, dikerjakan oleh satu engineer dalam sekitar enam minggu."`
- `digital-products-ecommerce` `tagline.id`: `"Modul backend untuk katalog, keranjang, pesanan, dan CRM, dikembangkan bersama tim agensi dalam monorepo TypeScript."`

Run: `bunx vitest run tests/content/taglines.test.ts && bun run validate:content`
Expected: PASS; validation clean (safety lint, Title Case not affected: these are not titles).

- [x] **Step 4: Hero markup and CSS**

`src/components/page/Hero.tsx`: delete the `tm` translations line and the eyebrow paragraph, so the left column starts with the name:

```tsx
export async function HomeHero({ locale, ticker }: { locale: Locale; ticker: ReactNode }) {
  const t = await getTranslations({ locale, namespace: "home" });
  const profile = getProfile();

  return (
    <div className="hx">
      <div className="hx-bg" aria-hidden="true">
        <div className="hx-glow" />
        <div className="hx-ground">
          <div className="hx-ground-grid" />
        </div>
        <i className="hx-packet" />
        <i className="hx-packet" />
        <i className="hx-packet" />
      </div>
      <section aria-labelledby="hero-title" className="pv-wrap hx-main grid flex-1 content-start py-10 sm:py-14 md:pt-16 lg:content-center lg:pt-14">
        <div className="min-w-0">
          <h1 id="hero-title" className="pv-d-xl hx-name">
            {profile.name}
          </h1>
          <p className="pv-lead mt-7 font-semibold">{profile.headline[locale]}</p>
          <p className="pv-lead mt-1 text-ink-2">{profile.subheadline[locale]}</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <EnterHqButton label={t("hero.enter3d")} hint={t("hero.enter3dHint")} />
            <QuietLink href="/labs" className="pv-btn pv-btn-ghost">
              {t("seeWork")}
            </QuietLink>
          </div>
          <AskHeroBar />
        </div>
      </section>
      {ticker}
    </div>
  );
}
```

(`QuietLink` comes from Task 6; the `Link` import is gone.) `src/app/landing.css`: delete the `.hx-eyebrow { ... }` rule (lines 99-109) and change `.hx-name`:

```css
  .hx-name {
    font-size: clamp(44px, 8vw, 112px);
    line-height: 0.9;
    text-shadow: 0 0 48px rgb(34 211 238 / 0.22);
  }
```

`messages/en.json` and `messages/id.json`: delete the `"welcome"` entry under `home.hero` (keys stay identical in both files).

- [x] **Step 5: e2e**

Add to `e2e/pageview.spec.ts`:

```ts
for (const viewport of [{ width: 1440, height: 900 }, { width: 1999, height: 1129 }, { width: 834, height: 1112 }, { width: 390, height: 844 }]) {
  test(`landing hero at ${viewport.width}x${viewport.height}: no eyebrow, a one-step smaller name, the motto`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await openPage(page, staticTier("/en"));
    const hero = page.locator("section[aria-labelledby='hero-title']");
    await expect(hero).not.toContainText(/Welcome to/i);
    await expect(hero.getByText(data.profile.subheadline.en)).toBeVisible();
    // clamp(44px, 8vw, 112px): vw is the layout viewport width (window.innerWidth).
    const { size, expected } = await page.locator("#hero-title").evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), expected: Math.min(112, Math.max(44, window.innerWidth * 0.08)) }));
    expect(Math.abs(size - expected)).toBeLessThanOrEqual(0.5);
    await context.close();
  });
}

test("landing: the hero name is still the LCP element on a phone", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: string };
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1) as unknown as { element?: Element };
      w.__lcp = last?.element?.id || last?.element?.tagName || "";
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await openPage(page, staticTier("/en"));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __lcp: string }).__lcp)).toBe("hero-title");
  await context.close();
});
```

- [x] **Step 6: Run**

Run: `bun run verify:quick && E2E_PORT=4430 bun run e2e:changed`
Expected: PASS (pageview, static-routes, seo, gallery, highlights for content; the Ask tests still pass: no golden answer quotes the old motto).

- [x] **Step 7: Screenshot diff and Lighthouse**

```bash
bun scripts/serve-static.ts --port 4430 --dir out & SERVER=$!
SCREENSHOTS=1 SHOT_LABEL=t9 E2E_PORT=4430 bunx playwright test e2e/delivery-visual.spec.ts --workers=1
kill $SERVER
bun scripts/shot-diff.ts screenshots/delivery/t7 screenshots/delivery/t9 --only 3d- --max 0.005
bunx @lhci/cli@0.15.1 autorun
```
Expected: `page-*` and `boot-*` differ on purpose (hero and motto), attach the four `page-*` pairs (1440x900, 1999x1129, 834x1112, 390x844) and the boot cards; `3d-*` `ok` except where the RF about card or the L1 hall about station is in view (the motto is in-world text there): list those files in the PR as intended. LHCI: `/en` LCP element `h1#hero-title`, LCP <= 2000 ms and not above the Task 0 baseline by more than 50 ms, CLS 0. Rollback: revert the commit (content, hero and CSS move together).

- [x] **Step 8: Docs**

`AGENTS.md` "Content style": add a bullet "**No first person in mottos and taglines** (owner rule, round 5): `profile.subheadline` (the motto) and every pod `tagline` avoid I, me, my (EN) and saya, aku (ID); body text and stories keep the first person. `tests/content/taglines.test.ts` checks it." In "Page View", landing bullet: replace "`HomeHero` (`src/components/page/Hero.tsx`) composes ..." opening with "`HomeHero` (`src/components/page/Hero.tsx`) starts with the name (no eyebrow, `.hx-name` up to 112 px), the headline and the motto (`profile.subheadline`), then composes ...".

- [x] **Step 9: Commit**

```bash
rtk git add content/site-content.json tests/content/taglines.test.ts src/components/page/Hero.tsx src/app/landing.css messages/en.json messages/id.json e2e/pageview.spec.ts AGENTS.md
rtk git commit -m "feat(landing): new motto, no welcome eyebrow, one step smaller name; no first person in taglines"
```

### Task 10: Owner portrait on the landing hero and About (owner request; C5 revised)

Owner photo: 800x800 RGBA PNG at `/Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/owner-photo/kurniadi-photo.png` (not committed). Committed outputs: `public/brand/kurniadi-ahmad-wijaya-{160,320,640}.webp` (square, no metadata), generated once by `scripts/portrait.ts`. Shown round with a subtle cyan ring and violet glow next to the name in the hero (72 px phone, 96 px from 640 px, 128 px from 1024 px) and next to the About title (80 px, 112 px from 640 px). Alt: the name from content. JSON-LD Person gets `image`. C5 ("No photo", appendix 07 section 7) and the AGENTS hard rule ("any photo") are revised by the owner for this one portrait.

LCP: the h1 (`clamp` up to 112 px, two lines) has a far larger area than a 128 px image, so the portrait cannot become the LCP element; it loads `eager` with `fetchpriority="low"` so it never competes with the CSS and fonts. Step 7 measures; the fallback is `loading="lazy"`.

**Files:**
- Create: `scripts/portrait.ts`, `src/lib/portrait.ts`, `src/components/page/Portrait.tsx`, `public/brand/kurniadi-ahmad-wijaya-160.webp`, `-320.webp`, `-640.webp`, `tests/helpers/webp.ts`, `tests/unit/portrait.test.ts`
- Modify: `src/components/page/Hero.tsx`, `src/app/[locale]/contact/page.tsx:50-55`, `src/app/pageview.css` (Work features area), `src/lib/jsonld.ts:21-34`, `tests/unit/seo.test.ts:90`, `tests/content/safety.test.ts:51`, `e2e/pageview.spec.ts`, `scripts/e2e-plan.ts`, `AGENTS.md` (Hard rules, folder layout `public/brand/`), `docs/superpowers/specs/agent-hq/07-content-map.md` (C5 row)

**Interfaces:**
- Produces: `PORTRAIT_SIZES = [160, 320, 640] as const`, `portraitSrc(size: number): string`, `PORTRAIT_SRCSET: string` (`src/lib/portrait.ts`, client-safe); `<Portrait name size sizes eager? className? />` (server component, plain `img`); `webpSize(buf): { width; height }`, `webpChunks(buf): string[]` (`tests/helpers/webp.ts`, also used by Task 12).

- [x] **Step 1: Write the WebP helper and the failing test**

`tests/helpers/webp.ts`:

```ts
/** RIFF chunk tags of a WebP file, in order (VP8X, ALPH, VP8, EXIF, XMP, ...). */
export function webpChunks(file: Buffer): string[] {
  if (file.toString("latin1", 0, 4) !== "RIFF" || file.toString("latin1", 8, 12) !== "WEBP") throw new Error("not a WebP file");
  const tags: string[] = [];
  for (let at = 12; at + 8 <= file.length; ) {
    const size = file.readUInt32LE(at + 4);
    tags.push(file.toString("latin1", at, at + 4));
    at += 8 + size + (size % 2);
  }
  return tags;
}

/** Pixel size from the first chunk (VP8X canvas, lossy VP8 frame or lossless VP8L header). */
export function webpSize(file: Buffer): { width: number; height: number } {
  const tag = file.toString("latin1", 12, 16);
  if (tag === "VP8X") return { width: 1 + file.readUIntLE(24, 3), height: 1 + file.readUIntLE(27, 3) };
  if (tag === "VP8 ") return { width: file.readUInt16LE(26) & 0x3fff, height: file.readUInt16LE(28) & 0x3fff };
  if (tag === "VP8L") {
    const bits = file.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  throw new Error(`unknown WebP chunk ${tag}`);
}
```

`tests/unit/portrait.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { personJsonLd } from "@/lib/jsonld";
import { PORTRAIT_SIZES, PORTRAIT_SRCSET, portraitSrc } from "@/lib/portrait";
import { webpChunks, webpSize } from "../helpers/webp";

const pub = (src: string) => path.join(process.cwd(), "public", src);

describe("owner portrait (C5 revised 2026-10-13)", () => {
  it("ships square WebPs without metadata at every size", () => {
    for (const size of PORTRAIT_SIZES) {
      const file = readFileSync(pub(portraitSrc(size)));
      expect(webpSize(file), String(size)).toEqual({ width: size, height: size });
      expect(webpChunks(file).filter((t) => t === "EXIF" || t === "XMP "), String(size)).toEqual([]);
    }
    expect(PORTRAIT_SRCSET).toBe("/brand/kurniadi-ahmad-wijaya-160.webp 160w, /brand/kurniadi-ahmad-wijaya-320.webp 320w, /brand/kurniadi-ahmad-wijaya-640.webp 640w");
  });

  it("is the only photo in public/brand", () => {
    expect(readdirSync(pub("brand")).sort()).toEqual(["kaw-monogram.svg", ...PORTRAIT_SIZES.map((s) => path.basename(portraitSrc(s)))].sort());
  });

  it("is the Person image in JSON-LD", () => {
    expect(personJsonLd("en").image).toMatch(/\/brand\/kurniadi-ahmad-wijaya-640\.webp$/);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/portrait.test.ts`
Expected: FAIL ("Failed to load url @/lib/portrait").

- [x] **Step 3: Implement the module, the script and generate**

`src/lib/portrait.ts`:

```ts
/** The owner's portrait (owner request, round 5; C5 revised): square WebPs in public/brand, rendered by scripts/portrait.ts. */
export const PORTRAIT_SIZES = [160, 320, 640] as const;

export function portraitSrc(size: number): string {
  return `/brand/kurniadi-ahmad-wijaya-${size}.webp`;
}

export const PORTRAIT_SRCSET = PORTRAIT_SIZES.map((size) => `${portraitSrc(size)} ${size}w`).join(", ");
```

`scripts/portrait.ts`:

```ts
/**
 * Renders the owner portrait into public/brand at every PORTRAIT_SIZES width (square, no metadata).
 * Usage: bun scripts/portrait.ts <photo.png>   (needs cwebp; the source photo is never committed)
 */
import path from "node:path";
import { PORTRAIT_SIZES, portraitSrc } from "@/lib/portrait";
import { run } from "./pdf-pages";

const input = process.argv[2];
if (!input) throw new Error("usage: bun scripts/portrait.ts <photo.png>");
for (const size of PORTRAIT_SIZES) {
  const out = path.join(process.cwd(), "public", portraitSrc(size));
  run("cwebp", ["-quiet", "-q", "86", "-m", "6", "-sharp_yuv", "-alpha_q", "100", "-resize", String(size), String(size), "-metadata", "none", input, "-o", out]);
  console.log(out);
}
```

Run: `bun scripts/portrait.ts /Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/owner-photo/kurniadi-photo.png`
Expected: three files, roughly 6 KB, 18 KB and 50 KB.

`src/components/page/Portrait.tsx`:

```tsx
import { PORTRAIT_SRCSET, portraitSrc } from "@/lib/portrait";

/** The owner's round portrait with a subtle neon ring. `eager` only above the fold; it never outranks the hero text for LCP. */
export function Portrait({ name, size, sizes, eager = false, className = "" }: { name: string; size: number; sizes: string; eager?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={portraitSrc(320)}
      srcSet={PORTRAIT_SRCSET}
      sizes={sizes}
      alt={name}
      width={size}
      height={size}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "low" : undefined}
      decoding="async"
      className={`pv-portrait ${className}`}
      data-testid="portrait"
    />
  );
}
```

`src/app/pageview.css`, after the `.pv-feature:hover .pv-feature-title` rule:

```css
  /* Owner portrait: round, near-black behind transparent edges, cyan ring with a soft violet glow. */
  .pv-portrait {
    flex: none;
    border-radius: 9999px;
    object-fit: cover;
    background: #0b0b14;
    border: 2px solid rgb(34 211 238 / 0.7);
    box-shadow:
      0 0 0 4px rgb(5 5 12 / 0.9),
      0 0 28px -4px rgb(34 211 238 / 0.55),
      0 0 48px -12px var(--color-violet);
  }
```

`src/components/page/Hero.tsx`: the `h1` becomes

```tsx
          <div className="flex items-center gap-4 sm:gap-6">
            <Portrait name={profile.name} size={128} sizes="(min-width: 1024px) 128px, (min-width: 640px) 96px, 72px" eager className="size-[72px] sm:size-24 lg:size-32" />
            <h1 id="hero-title" className="pv-d-xl hx-name min-w-0">
              {profile.name}
            </h1>
          </div>
```

`src/app/[locale]/contact/page.tsx:54`: `<h1 className="pv-d-l">{ta("title")}</h1>` becomes

```tsx
          <div className="flex items-center gap-4 sm:gap-5">
            <Portrait name={profile.name} size={112} sizes="(min-width: 640px) 112px, 80px" eager className="size-20 sm:size-28" />
            <h1 className="pv-d-l">{ta("title")}</h1>
          </div>
```

`src/lib/jsonld.ts` `personJsonLd`: add `image: absoluteUrl(portraitSrc(640)),` after `alternateName` (import `portraitSrc` from `./portrait`). `tests/unit/seo.test.ts:90` block: add `expect(person.image).toMatch(/\/brand\/kurniadi-ahmad-wijaya-640\.webp$/);`. `tests/content/safety.test.ts:51`: rename the test to `"publishes no photo in content (C5 revised: only the owner portrait in public/brand)"` (assertions unchanged: `profile.photo` stays undefined; the portrait path lives in `src/lib/portrait.ts`).

`scripts/e2e-plan.ts`: `{ test: /^public\/brand\/|^src\/lib\/portrait\.ts$|^src\/components\/page\/Portrait\.tsx$/, specs: ["pageview", "seo", "static-routes"] },` above the generic `src/(app|components)` rule.

- [x] **Step 4: Run the unit tests**

Run: `bunx vitest run tests/unit/portrait.test.ts tests/unit/seo.test.ts tests/content/safety.test.ts tests/content/assets.test.ts`
Expected: PASS.

- [x] **Step 5: e2e**

`e2e/pageview.spec.ts`:

```ts
/** The chosen image source is at least as wide as its rendered width times the device pixel ratio. */
async function expectSharp(img: Locator) {
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const r = await img.evaluate((el: HTMLImageElement) => ({ natural: el.naturalWidth, rendered: el.getBoundingClientRect().width, dpr: devicePixelRatio, src: el.currentSrc }));
  expect(r.natural, r.src).toBeGreaterThanOrEqual(Math.floor(r.rendered * r.dpr));
}

for (const v of [{ viewport: { width: 1440, height: 900 }, dpr: 2 }, { viewport: { width: 390, height: 844 }, dpr: 3 }]) {
  test(`portrait beside the name and on About at ${v.viewport.width}x${v.viewport.height}@${v.dpr}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.dpr });
    const page = await context.newPage();
    for (const url of ["/en", "/en/contact"]) {
      await openPage(page, staticTier(url));
      const img = page.locator("main").getByTestId("portrait");
      await expect(img).toHaveAttribute("alt", data.profile.name);
      await expect(img).toBeVisible();
      const round = await img.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) >= el.getBoundingClientRect().width / 2 - 1);
      expect(round, url).toBe(true);
      await expectSharp(img);
    }
    await context.close();
  });
}
```

(add `type Locator` to the `@playwright/test` import). The LCP test from Task 9 must still pass with the portrait.

- [x] **Step 6: Run**

Run: `bun run verify:quick && E2E_PORT=4430 bun run e2e:changed`
Expected: PASS (pageview, seo, static-routes; the quiet-boot test still sees no `/brand/kurniadi` request before the first frame).

- [x] **Step 7: Lighthouse decision (eager or lazy)**

Run: `bunx @lhci/cli@0.15.1 autorun && bun scripts/measure-delivery.ts --base http://127.0.0.1:4430 --label t10 --lhci .lighthouseci` (serve `out` on 4430 first).
Expected: `/en` LCP element `h1#hero-title`, median LCP <= 2000 ms and at most 50 ms above the Task 9 run, CLS 0. If either fails, change the hero `Portrait` to `eager={false}` (lazy, no fetch priority), rebuild and rerun; record both runs in the PR.

- [x] **Step 8: Screenshot diff (intended)**

Capture `SHOT_LABEL=t10` as in Task 9. Expected: `3d-*` `ok` against `t9`; `page-*` differ in the hero only: attach the four sizes. Check by eye: the ring reads as the site's cyan, the photo does not crowd the name on 390x844 (the name wraps beside a 72 px photo). Rollback: revert the commit (images, component, CSS and JSON-LD together).

- [x] **Step 9: Docs**

`AGENTS.md` Hard rules, Public repo bullet: replace "or any photo." with "or any photo other than the owner's portrait (`public/brand/kurniadi-ahmad-wijaya-*.webp`, C5 revised by the owner on 2026-10-13; regenerate with `bun scripts/portrait.ts <png>`, never commit the source photo)." Folder layout: `public/brand/                   committed brand assets (KAW monogram) and the owner portrait (160, 320, 640 px WebP, src/lib/portrait.ts)`. Appendix 07 section 7, C5 row: "**Owner portrait (revised 2026-10-13).** A round portrait beside the name on the landing hero and on About, and as the JSON-LD Person image. The 3D world keeps the KAW monogram hologram; no other photo is published."

- [x] **Step 10: Commit**

```bash
rtk git add scripts/portrait.ts src/lib/portrait.ts src/components/page/Portrait.tsx public/brand tests/helpers/webp.ts tests/unit/portrait.test.ts src/components/page/Hero.tsx "src/app/[locale]/contact/page.tsx" src/app/pageview.css src/lib/jsonld.ts tests/unit/seo.test.ts tests/content/safety.test.ts e2e/pageview.spec.ts scripts/e2e-plan.ts AGENTS.md docs/superpowers/specs/agent-hq/07-content-map.md
rtk git commit -m "feat(pageview): owner portrait beside the name on the landing and About, JSON-LD image"
```

### Task 11: "Selected work" as equal-height cards, no staggering (owner request)

Owner (screenshot of `/en`, "Selected work"): "there is blank space". The landing grid (`src/app/[locale]/page.tsx:73-86`, PR #54) puts the lead pod in `lg:col-span-7 lg:row-span-2` and the other two in `lg:col-span-5`, so the columns end at different heights and leave an empty block. Owner decision: equal-height rows, every card shows its screenshot on top (all three featured pods have galleries, `pickFeaturedPods` uses `podHasGallery`), then the meta line, title, tagline and key result, in a clean grid: 3 columns from 1024 px, 2 from 768 px, 1 on phones; cards stretch to equal height and the live-site link and key result sit at the bottom (`mt-auto`). Keep the look: colors, type, the "N screenshots" badge, the filmstrip (always three slots, so cards with fewer images keep the same rhythm). The same staggered gap exists on `/labs` "Key projects" (`SPANS` 7/5/5/7 in `labs/page.tsx:22`: three hero pods leave an empty 7-column slot in row 2); it gets the same grid. The home "More key projects" list is full-width rows (`WorkRow`), no gap; the e2e asserts that too.

**Files:**
- Modify: `src/app/[locale]/page.tsx:38-41,73-86`, `src/components/page/Featured.tsx`, `src/app/[locale]/labs/page.tsx:22,58-64`, `src/components/page/Work.tsx` (`WorkFeature`), `src/app/landing.css` (after `.hx-film img`), `e2e/pageview.spec.ts`, `AGENTS.md` (Page View landing bullet)

**Interfaces:**
- Produces: `FeaturedProject({ pod, locale })` (the `lead` prop is removed); `data-testid="featured-grid"` on the landing list; `expectAlignedGrid(page, selector, columns)` and `columnsFor(width)` helpers in `e2e/pageview.spec.ts` (Task 12 reuses them).

- [x] **Step 1: Write the failing e2e**

`e2e/pageview.spec.ts` (`Page` and `Locator` types from `@playwright/test`):

```ts
const columnsFor = (width: number) => (width >= 1024 ? 3 : width >= 768 ? 2 : 1);

/** Cards in a grid: same top and bottom within each row, same width and the same height everywhere. */
async function expectAlignedGrid(page: Page, selector: string, columns: number) {
  const boxes = await page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top + scrollY, bottom: r.bottom + scrollY, width: r.width };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (let i = 0; i < boxes.length; i += columns) {
    const row = boxes.slice(i, i + columns);
    for (const b of row) {
      expect(Math.abs(b.top - row[0].top), `${selector} row ${i / columns} top`).toBeLessThanOrEqual(1);
      expect(Math.abs(b.bottom - row[0].bottom), `${selector} row ${i / columns} bottom`).toBeLessThanOrEqual(1);
    }
  }
  for (const b of boxes) {
    expect(Math.abs(b.width - boxes[0].width), `${selector} width`).toBeLessThanOrEqual(1);
    expect(Math.abs(b.bottom - b.top - (boxes[0].bottom - boxes[0].top)), `${selector} height`).toBeLessThanOrEqual(1);
  }
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1999, height: 1129 }, { width: 834, height: 1112 }, { width: 390, height: 844 }]) {
  test(`landing: featured cards line up with their screenshots at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await openPage(page, staticTier("/en"));
    // Below the first screen, so lazy images never compete with the hero for LCP.
    expect(await page.locator("#work").evaluate((el) => el.getBoundingClientRect().top >= window.innerHeight - 1)).toBe(true);
    await expectAlignedGrid(page, "#work [data-feature-pod]", columnsFor(viewport.width));
    for (const card of await page.locator("#work [data-feature-pod]").all()) {
      const cover = card.locator(".pv-shot img");
      await cover.scrollIntoViewIfNeeded();
      await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    }
    // "More key projects" rows span the full list width (no side gap).
    const rows = await page.locator("#work .pv-rows > li").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width));
    for (const ratio of rows) expect(ratio).toBeGreaterThan(0.99);
    await page.goto(staticTier("/en/labs"));
    await expectAlignedGrid(page, "#key-projects li[data-pod]", columnsFor(viewport.width));
    await context.close();
  });
}
```

- [x] **Step 2: Run it to verify it fails**

Run: `bun run build && E2E_PORT=4430 bunx playwright test e2e/pageview.spec.ts -g "featured cards line up"`
Expected: FAIL at 1440x900 and 1999x1129 ("row 0 bottom" or "height" differs by more than 100 px); 390x844 fails on height.

- [x] **Step 3: Landing grid**

`src/app/[locale]/page.tsx`: delete `const [lead, ...side] = featured;` and replace the featured block with:

```tsx
        <ul className="grid auto-rows-fr gap-x-6 gap-y-10 md:grid-cols-2 lg:grid-cols-3" data-testid="featured-grid">
          {featured.map((pod) => (
            <li key={pod.id} className="min-w-0">
              <FeaturedProject pod={pod} locale={locale} />
            </li>
          ))}
        </ul>
```

`src/components/page/Featured.tsx` (whole component; the image `srcSet`/`sizes` change in Task 12):

```tsx
/** Thumbnails in the filmstrip under a featured project's cover (always this many slots, so cards line up). */
const FILM = 3;

/**
 * A landing feature card: the pod's cover with its screenshot count, a filmstrip of the next gallery images,
 * then wing, period, client, the title (the card's link), tagline, and at the bottom the live-site link and
 * the headline result. Cards share one grid with equal heights (owner request, round 5). Only pods with a
 * gallery are featured (`pickFeaturedPods`). Images load lazily: the section starts below the first screen,
 * so they never compete with the hero for LCP.
 */
export async function FeaturedProject({ pod, locale }: { pod: Pod; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "work" });
  const th = await getTranslations({ locale, namespace: "home" });
  const [cover, ...rest] = toGalleryImages(pod.assets, locale);
  if (!cover) return null;
  const result = pod.results[0];
  const film = Array.from({ length: FILM }, (_, i) => rest[i]);
  return (
    <article className="pv-feature hx-card relative flex h-full flex-col gap-4" data-feature-pod={pod.slug}>
      <div className="pv-shot hx-shot">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover.src}
          srcSet={`${cover.thumb} 480w, ${cover.src} ${cover.width}w`}
          sizes="(min-width: 1024px) 480px, (min-width: 768px) 50vw, 100vw"
          alt={cover.alt}
          width={cover.width}
          height={cover.height}
          loading="lazy"
          decoding="async"
          className="aspect-[16/10]"
        />
        <span className="pv-data hx-shots">{th("featuredShots", { count: pod.assets.length })}</span>
      </div>
      <ul className="hx-film" aria-hidden="true">
        {film.map((image, i) => (
          <li key={image?.src ?? `empty-${i}`}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.thumb} alt="" width={480} height={300} loading="lazy" decoding="async" />
            ) : (
              <span className="hx-film-empty" />
            )}
          </li>
        ))}
      </ul>
      <p className="pv-data flex flex-wrap items-center gap-x-4 gap-y-1">
        <Marker accent={WING_ACCENT[pod.wing]}>{t(`wingShort.${pod.wing}`)}</Marker>
        <span>{formatPeriod(pod.period.start, pod.period.end, locale)}</span>
        {pod.client && <span>{clientLabel(pod.client, locale)}</span>}
      </p>
      <h3 className="pv-h3 pv-feature-title">
        <Link href={`/labs/${pod.slug}`} className="pv-stretch">
          {pod.title[locale]}
        </Link>
      </h3>
      <p className="pv-body">{pod.tagline[locale]}</p>
      <div className="mt-auto flex flex-col gap-4">
        <PodLiveCta pod={pod} locale={locale} />
        {result && (
          <p className="pv-small">
            <span className="pv-num text-[22px]">{result.value}</span> {result.label[locale]}
          </p>
        )}
      </div>
    </article>
  );
}
```

`src/app/landing.css`, after the `.hx-film img` rule:

```css
  .hx-film-empty {
    display: block;
    aspect-ratio: 16 / 10;
    border-radius: 8px;
    border: 1px dashed var(--color-line);
  }
```

- [x] **Step 4: `/labs` Key projects grid**

`src/app/[locale]/labs/page.tsx`: delete `const SPANS = [...]` (line 22) and render:

```tsx
            <ul className="grid auto-rows-fr gap-x-6 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
              {heroes.map((pod) => (
                <li key={pod.id} {...podAttrs(pod)} className="min-w-0">
                  <WorkFeature pod={pod} locale={locale} size="grid" />
                </li>
              ))}
            </ul>
```

`src/components/page/Work.tsx` `WorkFeature`: wrap everything after the tagline paragraph (`<PodLiveCta ... />`, the `size === "lead"` `<dl>`, and `{size === "grid" && cover && <TechLogoRow items={pod.stack} max={9} />}`) in `<div className="mt-auto flex flex-col gap-4">...</div>`, so the stack logos and links sit at the card bottom.

- [x] **Step 5: Run**

Run: `bun run verify:quick && E2E_PORT=4430 bun run e2e:changed`
Expected: PASS: the new alignment tests at all four sizes, the existing "landing: three featured projects with their screenshots" (cover `src` unchanged), the WorkIndex filter tests on `/labs` (rows keep `data-pod`), axe per template.

- [x] **Step 6: Screenshot diff and Lighthouse**

```bash
bun scripts/serve-static.ts --port 4430 --dir out & SERVER=$!
SCREENSHOTS=1 SHOT_LABEL=t11 E2E_PORT=4430 bunx playwright test e2e/delivery-visual.spec.ts --workers=1 -g "Page View|3D L1"
kill $SERVER
bun scripts/shot-diff.ts screenshots/delivery/t10 screenshots/delivery/t11 --only 3d- --max 0.005
bunx @lhci/cli@0.15.1 autorun
```
Expected: `page-*` differ only in "Selected work" (intended; attach the four sizes, owner view 1999x1129 included; crop `#work` if the PR viewer is too small); 3D `ok`. LHCI `/en`: LCP element `h1#hero-title`, CLS 0, LCP not above the Task 10 run by more than 50 ms (the section is below the first screen and its images stay lazy). Rollback: revert the commit (grid, card and CSS together).

- [x] **Step 7: Docs**

`AGENTS.md` "Page View", landing bullet: replace "Featured projects: `pickFeaturedPods(getPods())` (the first three pods with a gallery, in `orderPods` order) rendered by `FeaturedProject` (`src/components/page/Featured.tsx`); other key projects follow as `WorkRow`s." with "Featured projects: `pickFeaturedPods(getPods())` (the first three pods with a gallery, in `orderPods` order) rendered by `FeaturedProject` (`src/components/page/Featured.tsx`) as equal-height cards in one grid (3 columns from 1024 px, 2 from 768 px, 1 on phones; screenshot, three filmstrip slots, text, then the live link and key result pinned to the bottom); never stagger or span cards (owner request, round 5). `/labs` Key projects use the same grid. Other key projects follow as full-width `WorkRow`s."

- [x] **Step 8: Commit**

```bash
rtk git add "src/app/[locale]/page.tsx" "src/app/[locale]/labs/page.tsx" src/components/page/Featured.tsx src/components/page/Work.tsx src/app/landing.css e2e/pageview.spec.ts AGENTS.md
rtk git commit -m "fix(pageview): featured and key project cards in an equal-height grid without blank space"
```

### Task 12: Sharp project images: responsive `srcset` with a 1200 px rendition (owner request)

Owner: "cant you make the selected project image not low quality". Cause: cards pick the 480 px thumb where the slot is wider (the landing side cards used `sizes="... 480px"` for a slot of about 500 to 710 px, so DPR 1 picks the thumb; `WorkFeature` grid always uses `cover.thumb`; gallery tiles always use the thumb, so DPR 2 and 3 screens upscale it). Fix: every project image gets `srcset` = thumb 480w, a new 1200w rendition, full (1600w), and a `sizes` that matches its slot. The 1200 px files are committed, made once with `cwebp` from the full WebP (same pattern as `cv:pages` and `floor:thumbs`; no runtime dependency): 116 full images, about 42 KB each at q85, about +5 MB (media stays under the 25 MB budget, about 14 MB). `width`/`height` stay the intrinsic size (CSS `aspect-*` boxes keep CLS 0); everything stays `loading="lazy"` + `decoding="async"` except the existing eager lead (`WorkFeature size="lead"`); no image is above the fold on the LHCI URLs, so the hero text stays the LCP element.

**Files:**
- Create: `scripts/media-sizes.ts`, `tests/unit/media-sizes.test.ts`, `public/media/<pod>/*.w1200.webp` (generated)
- Modify: `src/content/media.ts`, `src/components/page/Featured.tsx` (cover `srcSet`/`sizes`), `src/components/page/Work.tsx` (`WorkFeature` image), `src/components/Gallery.tsx:58-70`, `e2e/pageview.spec.ts`, `scripts/e2e-plan.ts:116`, `AGENTS.md` (Content access, pod galleries; folder layout `public/media/`)

**Interfaces:**
- Consumes: `webpSize`, `webpChunks` (Task 10), `expectSharp` (Task 10), `columnsFor` (Task 11).
- Produces: `THUMB_WIDTH = 480`, `MID_WIDTH = 1200`, `midSrc(src: string): string`, `GalleryImage.mid?: string`, `imageSrcSet(image: Pick<GalleryImage, "src" | "thumb" | "mid" | "width">): string`, `CARD_SIZES` (`src/content/media.ts`, client-safe).

- [x] **Step 1: Write the failing unit test**

```ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import { MID_WIDTH, imageSrcSet, midSrc, toGalleryImages } from "@/content/media";
import { webpChunks, webpSize } from "../helpers/webp";

describe("responsive project images", () => {
  it("list thumb, 1200 px and full widths in order", () => {
    expect(imageSrcSet({ src: "/media/a/01-x.webp", thumb: "/media/a/01-x.thumb.webp", mid: "/media/a/01-x.w1200.webp", width: 1600 })).toBe(
      "/media/a/01-x.thumb.webp 480w, /media/a/01-x.w1200.webp 1200w, /media/a/01-x.webp 1600w",
    );
    expect(imageSrcSet({ src: "/media/b/01-y.webp", thumb: "/media/b/01-y.thumb.webp", width: 1100 })).toBe("/media/b/01-y.thumb.webp 480w, /media/b/01-y.webp 1100w");
  });

  it("add the 1200 px rendition only to images wider than it", () => {
    const [wide, narrow] = toGalleryImages(
      [
        { src: "/media/a/01-x.webp", alt: { en: "a", id: "a" }, width: 1600, height: 1000 },
        { src: "/media/a/02-y.webp", alt: { en: "b", id: "b" }, width: 1100, height: 700 },
      ] as Parameters<typeof toGalleryImages>[0],
      "en",
    );
    expect(wide.mid).toBe("/media/a/01-x.w1200.webp");
    expect(narrow.mid).toBeUndefined();
    expect(midSrc("/media/a/01-x.webp")).toBe("/media/a/01-x.w1200.webp");
  });

  it("ship a 1200 px WebP without metadata for every pod image wider than 1200 px", () => {
    const issues: string[] = [];
    for (const pod of getContent().floors.labs.pods) {
      for (const asset of pod.assets.filter((a) => a.width > MID_WIDTH)) {
        const file = path.join(process.cwd(), "public", midSrc(asset.src));
        if (!existsSync(file)) {
          issues.push(`${midSrc(asset.src)} missing (bun scripts/media-sizes.ts)`);
          continue;
        }
        const bytes = readFileSync(file);
        const size = webpSize(bytes);
        if (size.width !== MID_WIDTH || Math.abs(size.height - Math.round((MID_WIDTH * asset.height) / asset.width)) > 1) issues.push(`${midSrc(asset.src)} is ${size.width}x${size.height}`);
        if (webpChunks(bytes).some((t) => t === "EXIF" || t === "XMP ")) issues.push(`${midSrc(asset.src)} carries metadata`);
      }
    }
    expect(issues).toEqual([]);
  });
});
```

(If `Asset` in `schema.ts` has more required fields, add them to the two literal assets; the cast keeps the test focused on `src`, `alt`, `width`, `height`.)

- [x] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/media-sizes.test.ts`
Expected: FAIL (`MID_WIDTH`, `imageSrcSet`, `midSrc` not exported).

- [x] **Step 3: Implement the helpers**

`src/content/media.ts`:

```ts
import type { Asset, Locale } from "./schema";

/** Width of the "<name>.thumb.webp" sibling every gallery image ships with. */
export const THUMB_WIDTH = 480;
/** Width of the "<name>.w1200.webp" rendition of images wider than this (scripts/media-sizes.ts). */
export const MID_WIDTH = 1200;

/** Serializable, localized image for Gallery and Lightbox (safe to pass to client components). */
export interface GalleryImage {
  src: string;
  thumb: string;
  /** 1200 px rendition, only for images wider than MID_WIDTH. */
  mid?: string;
  alt: string;
  width: number;
  height: number;
}

/** Every gallery image under public/media ships with a 480 px "<name>.thumb.webp" sibling. */
export function thumbSrc(src: string): string {
  return src.replace(/\.(webp|png|jpe?g)$/i, ".thumb.webp");
}

export function midSrc(src: string): string {
  return src.replace(/\.(webp|png|jpe?g)$/i, ".w1200.webp");
}

/** `srcset` for a project image: thumb, 1200 px (when it exists) and the full file, by width. */
export function imageSrcSet(image: Pick<GalleryImage, "src" | "thumb" | "mid" | "width">): string {
  const parts = [`${image.thumb} ${THUMB_WIDTH}w`];
  if (image.mid) parts.push(`${image.mid} ${MID_WIDTH}w`);
  parts.push(`${image.src} ${image.width}w`);
  return parts.join(", ");
}

/** `sizes` of the project cards: one third of the 1240 px container from 1024 px, half from 768 px, else the full width. */
export const CARD_SIZES = "(min-width: 1024px) 400px, (min-width: 768px) 50vw, 100vw";

export function toGalleryImages(assets: readonly Asset[], locale: Locale): GalleryImage[] {
  return assets.map((a) => ({
    src: a.src,
    thumb: thumbSrc(a.src),
    ...(a.width > MID_WIDTH ? { mid: midSrc(a.src) } : {}),
    alt: a.alt[locale],
    width: a.width,
    height: a.height,
  }));
}

/** The first asset of a pod is its cover (pod cards, quick view, drawer header). */
export function coverImage(assets: readonly Asset[], locale: Locale): GalleryImage | undefined {
  return assets[0] ? toGalleryImages([assets[0]], locale)[0] : undefined;
}
```

- [x] **Step 4: Write `scripts/media-sizes.ts` and generate**

```ts
/**
 * Writes the 1200 px "<name>.w1200.webp" rendition of every pod gallery image wider than 1200 px, so
 * cards and gallery tiles pick a sharp source on DPR 2 and 3 screens without loading the full file.
 * Idempotent (skips existing files unless --force). Needs cwebp. Usage: bun scripts/media-sizes.ts [--force]
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { getContent } from "@/content/load";
import { MID_WIDTH, midSrc } from "@/content/media";
import { run } from "./pdf-pages";

const force = process.argv.includes("--force");
let written = 0;
for (const pod of getContent().floors.labs.pods) {
  for (const asset of pod.assets.filter((a) => a.width > MID_WIDTH)) {
    const out = path.join(process.cwd(), "public", midSrc(asset.src));
    if (existsSync(out) && !force) continue;
    run("cwebp", ["-quiet", "-q", "85", "-m", "6", "-sharp_yuv", "-resize", String(MID_WIDTH), "0", "-metadata", "none", path.join(process.cwd(), "public", asset.src), "-o", out]);
    written++;
  }
}
console.log(`media-sizes: ${written} renditions written`);
```

Run: `bun scripts/media-sizes.ts && du -sh public/media && bunx vitest run tests/unit/media-sizes.test.ts tests/content/assets.test.ts`
Expected: about 116 renditions; `public/media` about 13 to 15 MB; PASS (if `assets.test.ts` lists files under `public/media` that no asset references, allow the `.w1200.webp` suffix next to `.thumb.webp` in that check).

- [x] **Step 5: Use `srcset` in cards and gallery**

`Featured.tsx` cover image:

```tsx
        <img
          src={cover.src}
          srcSet={imageSrcSet(cover)}
          sizes={CARD_SIZES}
          alt={cover.alt}
          width={cover.width}
          height={cover.height}
          loading="lazy"
          decoding="async"
          className="aspect-[16/10]"
        />
```

`Work.tsx` `WorkFeature` image:

```tsx
          <img
            src={cover.src}
            srcSet={imageSrcSet(cover)}
            sizes={size === "lead" ? "(min-width: 1024px) 760px, 100vw" : size === "pair" ? "(min-width: 768px) 50vw, 100vw" : CARD_SIZES}
            alt={cover.alt}
            width={cover.width}
            height={cover.height}
            loading={size === "lead" ? "eager" : "lazy"}
            decoding="async"
            className={size === "pair" ? "aspect-[16/8]" : "aspect-[16/10]"}
          />
```

`Gallery.tsx:60-62`: keep `src` as is and add

```tsx
                srcSet={imageSrcSet(image)}
                sizes={mosaic && i === 0 ? "(min-width: 640px) 66vw, 100vw" : "(min-width: 640px) 33vw, 50vw"}
```

(imports: `imageSrcSet` and `CARD_SIZES` from `@/content/media` in `Featured.tsx` and `Work.tsx`; `imageSrcSet` only in `Gallery.tsx`). Filmstrip thumbs stay 480 px (about a third of a card: 125 to 180 px, so 480 px covers DPR 3).

`scripts/e2e-plan.ts:116`: the gallery rule regex already covers `src/content/media.ts` and `public/media/`.

- [x] **Step 6: e2e sharpness**

`e2e/pageview.spec.ts` (reuses `expectSharp` from Task 10):

```ts
for (const v of [{ viewport: { width: 1440, height: 900 }, dpr: 2 }, { viewport: { width: 390, height: 844 }, dpr: 3 }]) {
  test(`project images are sharp at ${v.viewport.width}x${v.viewport.height}@${v.dpr}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.dpr });
    const page = await context.newPage();
    await openPage(page, staticTier("/en"));
    for (const img of await page.locator("#work [data-feature-pod] .pv-shot img").all()) await expectSharp(img);
    await openPage(page, staticTier("/en/labs"));
    for (const img of await page.locator("#key-projects .pv-shot img").all()) await expectSharp(img);
    await context.close();
  });
}
```

- [x] **Step 7: Run on the base build to see it fail, then on the branch**

Run: `bun scripts/serve-static.ts --port 4430 --dir ../hq-p1-base/out & SERVER=$!; E2E_PORT=4430 bunx playwright test e2e/pageview.spec.ts -g "sharp"; kill $SERVER` then `bun run verify:quick && E2E_PORT=4430 bun run e2e:changed`
Expected: base FAIL at 1440@2 on `/en/labs` (480 px thumb in a slot of about 700 px times 2); branch PASS for pageview and gallery (Lightbox still opens full images).

- [x] **Step 8: Lighthouse and bytes**

```bash
bun scripts/serve-static.ts --port 4430 --dir out & SERVER=$!
SCREENSHOTS=1 SHOT_LABEL=t12 E2E_PORT=4430 bunx playwright test e2e/delivery-visual.spec.ts --workers=1 -g "Page View"
kill $SERVER
bunx @lhci/cli@0.15.1 autorun
```
Expected: LHCI all four URLs within budgets, LCP elements unchanged (`h1#hero-title`, `section#profile p.pv-body`, `header p.pv-lead`, `header p.pv-lead`), LCP median not above the Task 11 run by more than 50 ms, CLS 0. `page-*` captures differ only by sharper images (intended; attach crops of `#work` at 1440x900 before and after). Note the LHCI "image" bytes for `/en/labs/voice-ai-contact-center` (the mosaic cover now picks 1200 px instead of 1600 px on the Lighthouse phone, so it should not grow). Rollback: revert the commit; renditions can stay on disk unused.

- [x] **Step 9: Docs**

`AGENTS.md` Content access, pod galleries: "Images live in `public/media/<pod-slug>/` with a `.thumb.webp` sibling (480 px) and, when wider than 1200 px, a `.w1200.webp` rendition (`bun scripts/media-sizes.ts` after adding images; `tests/unit/media-sizes.test.ts` fails until it exists). Render project images with `srcSet={imageSrcSet(image)}` and a `sizes` that matches the slot (`CARD_SIZES` for cards), so DPR 2 and 3 screens get a sharp file." Folder layout `public/media/<pod-slug>/`: append "+ NN-name.w1200.webp (1200 wide, scripts/media-sizes.ts)".

- [x] **Step 10: Commit**

```bash
rtk git add src/content/media.ts scripts/media-sizes.ts tests/unit/media-sizes.test.ts public/media src/components/page/Featured.tsx src/components/page/Work.tsx src/components/Gallery.tsx e2e/pageview.spec.ts AGENTS.md
rtk git commit -m "feat(pageview): responsive project images with a 1200 px rendition so cards stay sharp on HiDPI"
```

### Task 13: Docs, final numbers and the PR

**Files:**
- Modify: `README.md` ("Performance"), `docs/superpowers/specs/agent-hq/08-quality-acceptance.md` section 2, `docs/superpowers/specs/agent-hq/05-visual-audio-tokens.md` section 5, `docs/deploy.md` section 8 (medians), `docs/superpowers/specs/2026-10-09-agent-hq-design.md` lines 14 and 176

- [x] **Step 1: Full verification**

Run: `bun run verify:quick && E2E_PORT=4430 bun run e2e:full`
Expected: PASS (the full suite runs because `package.json` and `playwright.config.ts` changed).

- [x] **Step 2: Final measurement**

```bash
bun scripts/serve-static.ts --port 4430 --dir out & SERVER=$!
bunx @lhci/cli@0.15.1 autorun && cp -r .lighthouseci .lighthouseci-after
bun scripts/measure-delivery.ts --base http://127.0.0.1:4430 --label after --lhci .lighthouseci-after
bun scripts/measure-delivery.ts --base http://127.0.0.1:4430 --label after-p1 --throttle
SCREENSHOTS=1 SHOT_LABEL=after E2E_PORT=4430 bunx playwright test e2e/delivery-visual.spec.ts --workers=1
kill $SERVER
bun scripts/measure-delivery.ts --compare screenshots/delivery/before.json screenshots/delivery/after.json
bun scripts/shot-diff.ts screenshots/delivery/before screenshots/delivery/after --only 3d- --max 0.005
```
Expected targets (fail the PR self-check if missed): LHCI `/en` script bytes at least 28 KB below `before` (SP1); bytes before the first 3D frame at least 300 KB below `before` (SP3); troika fonts 139 KB to about 58 KB (SP10); LCP/TBT/CLS for the 4 URLs within budgets and LCP elements unchanged; 3D diffs within 0.5% except the captures that show the motto in-world (listed in Task 9).

- [x] **Step 3: Docs**

`README.md` "Performance", add a paragraph: "Delivery (round 5): zod stays on the server (`src/content/locales.ts`; the build fails when `_zod`, `readFileSync` or `site-content` reaches a client chunk); Lighthouse CI warms up on a throwaway URL first; unhashed files have explicit cache rules (`public/_headers`, troika fonts are content-hashed and immutable); the game-first boot downloads only what the first 3D frame needs (the hidden page is skipped with `content-visibility`, header links do not prefetch, room data waits for the first frame and idle); the boot card names the owner and offers the Page View; the Page View never starts audio. Numbers: initial JS <before> to <after> KB, bytes before the first 3D frame <before> to <after> KB, troika fonts 139 to <after> KB."
Spec 08 section 2: add rows "Client chunks contain no zod or content loader (post-build gate)", "Troika font cuts at most 64 KB, every in-world character covered (`tests/content/troika-fonts.test.ts`)", "Bytes before the first 3D frame: no Page View images, link prefetch or room data". Spec 05 section 5: replace the Opus/AAC and `public/audio/CREDITS.md` clauses with "All sounds are synthesized (Web Audio, `src/lib/audio`), no audio files; the engine starts paused, so the Page View and the static tier never create an AudioContext." (spec gap 1 and 2). `docs/deploy.md` section 8: replace the "Medians at the time of writing" line with the LHCI medians from Step 2. Main spec line 14 (goal 1): append "On the game-first path the boot card shows the owner's name, headline, motto and role at first paint." Line 176: "`/` is a static language redirect page (hreflang alternates); the tower and the server-rendered summary live at `/{locale}`."

- [x] **Step 4: Commit and push**

```bash
rtk git add README.md docs
rtk git commit -m "docs: round 5 P1 delivery numbers, specs 02/04/05/07/08 and deploy notes"
git fetch origin && git rebase origin/main
bun run verify:quick
rtk git push -u origin HEAD
```

- [x] **Step 5: PR body**

Title: `Round 5 P1: Page View and delivery (zod off the client, quiet boot, boot card, cached fonts, landing cards and sharp images)`. Body sections: Summary (one line per task with REPORT ids); Numbers (the `--compare` Markdown: initial JS, first frame, bytes before the first frame per bucket, P1-throttled first frame, LHCI LCP/TBT/CLS/script per URL, troika font bytes, `/` to `/en` hop); Screenshots (3D diff table, intended diffs: boot card, hero, featured cards, sharp images, motto in-world on L1 hall and RF); Owner decisions applied (boot card content and link, motto, no first person in taglines, portrait and C5 revision, equal-height cards); Rebase notes (the table at the top of this plan); Follow-ups (Early Hints `Link` per route, ExperienceData and message trimming A2.4, 3D chunk preload after FCP A1.4).

- [x] **Step 6: Clean up**

```bash
git worktree remove ../hq-p1-base
rm -rf .lighthouseci-before .lighthouseci-after screenshots/delivery
```

---

## Self-review

**Spec coverage (task and owner list):**
- SP1 zod off the client, client importers of `LOCALES`, CI grep gate for `_zod`/loader code in `out/_next/static/chunks`: Task 1 (gate runs in `bun run build`, so CI's build fails too).
- LHCI warm-up URL: Task 2.
- `_headers` cache rules for `/fonts`, troika fonts, `/tech`, `/media`, `/floors`, `/cv/pages`, `/papers` (plus `/logos`): Task 5; immutable fonts depend on Task 4's hashed names.
- SP10 troika subset to in-world glyphs, WOFF kept (no WOFF2), existing subset approach (fonttools as in `scripts/subset-fonts.sh`), glyph coverage test against all in-world strings, caching: Task 4 plus Task 5.
- SP3 quiet boot (rooms on idle or intent, troika fonts after first frame, `prefetch={false}` under the cover, Page View media deferred, CLS unchanged): Task 6. Deviation, stated in Task 6: troika fonts are not deferred past text mount, because they already start after the 3D JS (asserted in the e2e); deferring further would move typesetting into the boot overlay and intro. "On intent" for rooms is covered by "a room opens" (deep links, missions, doors, palette all open a room).
- Boot card headline and role, server-rendered, zero JS, small "Page view" link, Boot rover click and full intro kept: Task 7 (motto added because the boot card headline is P1's per the owner).
- Audio silent on the Page View and static tier (spec gap 2): Task 3.
- `/` redirect kept, cheap improvements (hreflang Link, run before CSS): Task 8.
- Before/after numbers (initial JS gz, bytes before first 3D frame, Lighthouse LCP/TBT/CLS for the 4 URLs): Task 0 baseline, per-task checks, Task 13 final.
- Owner addition, featured blank space (equal heights, grid 3/2/1, screenshots on top, badge, thumbnails, other list checked, e2e bounding boxes, screenshots at 1440x900, 1999x1129, 834x1112, 390x844, Lighthouse unchanged): Task 11.
- Owner addition, image quality (`srcset`/`sizes`, 1200 w rendition with existing tooling, width/height, lazy plus async, e2e intrinsic width >= rendered x DPR at 1440x900@2 and 390x844@3, LCP stays hero text): Task 12 (and Task 10's `expectSharp`).
- Owner addition, landing eyebrow removed and name one step smaller (four sizes, LCP still hero text): Task 9.
- Owner addition, motto everywhere (EN and ID) and no first person in mottos or taglines: Task 9 (one content field feeds hero, boot card, 3D hall and roof, drawer, Ask pack; OG cards belong to P9).
- Owner addition, portrait (responsive WebP 160/320/640 in `public/brand/`, width/height, eager only if LCP-safe with a measured fallback, round crop with neon ring, alt, JSON-LD image): Task 10, including the C5 and AGENTS hard-rule revision.
- Aesthetic gate: 3D captures at desktop full 1440x900 and 2560x1440 and phone lite 390x844, same poses (`?walk=off`, reduced motion, settled camera), threshold 0.5% at delta 24 (noise floor measured in Task 0), rollback notes per pixel-changing task.

**Placeholder scan:** no "TBD"/"TODO"/"similar to Task N". README numbers in Task 13 Step 3 are filled from Step 2's measured output (angle-bracket slots are replaced by the measured values in that step).

**Type and name consistency:** `afterFirstFrameIdle`/`markFirstFrame`/`resetFirstFrame` (Task 6) used in `DrawerHost` and `Experience`; `QuietLink` (Task 6) reused in `Hero.tsx` (Task 9); `BootWho`/`BootPageLink` and `roleLine` (Task 7) used in layout, `BootCover`, `BootOverlay`, `Hud`; `takePageViewParam` inlined into `bootFirstScript`; `troika-fonts.json` keys `sans`, `sansBold`, `mono`, `monoBold`, `symbols` (Task 4) read in `primitives.tsx`, `text-config.ts` and `deploy-smoke.ts` (Task 5); `webpSize`/`webpChunks` (Task 10) reused by Task 12; `expectSharp` (Task 10) and `expectAlignedGrid`/`columnsFor` (Task 11) reused by Task 12; `imageSrcSet`, `CARD_SIZES`, `MID_WIDTH`, `midSrc` (Task 12) only in Task 12; `PORTRAIT_SIZES`, `portraitSrc`, `PORTRAIT_SRCSET` (Task 10) consistent across script, component, JSON-LD and tests.

**Open risks:**
- `content-visibility: hidden` keeping lazy images and IntersectionObserver prefetch from starting is browser behavior; `QuietLink` is the backstop for links and the quiet-boot e2e is the gate. Safari support for `content-visibility` is recent (17.4+); older Safari falls back to today's behavior.
- `prefetch={false}` on next-intl `Link` (Next 16) also drops hover prefetch while hidden; it flips back when the page is shown.
- The warm-up adds about 30 to 45 s to the Lighthouse job and may not remove every cold-run TBT spike (recorded in the PR).
- Troika shaping: the subset keeps exactly troika's GSUB list plus kern; the 3D diff is the proof. Fallback: keep all features (`["*"]`).
- Old `/fonts/*.woff` URLs disappear: a tab opened before the deploy that mounts new 3D text loads the old chunk's font URL and gets a 404 (troika falls back to the symbols font URL of that chunk, also gone). Reload fixes it; acceptable for a static site.
- The `/` hoist edits generated HTML by regex; the unit test and the static-routes e2e catch a changed Next.js output.
- Portrait: C5 and the AGENTS "no photo" rule change on the owner's explicit request; reviewers must not revert it. If LHCI shows any LCP cost, the portrait goes lazy (Task 10 Step 7).
- The 1200 px renditions add about 5 MB to the repo (still under the 25 MB media budget).
- P5 content edits may add characters outside the troika set; the coverage test then fails until `bun scripts/troika-fonts.ts` is rerun (rebase note).
