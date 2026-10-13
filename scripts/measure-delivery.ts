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

/**
 * Records when the boot cover is released by the first 3D frame (html[data-hq-boot-released="ready"]),
 * how it was released, and the first frame that drew (window.__hq.rover.drawCalls), which is the
 * fallback when the 8 s safety timeout released the cover first (slow or loaded machines).
 */
const RELEASE_PROBE = () => {
  const w = window as unknown as { __released?: number; __reason?: string; __drawn?: number; __hq?: { rover?: { drawCalls?: number } } };
  // Init scripts run before <html> exists, so observe the document (subtree) instead of documentElement.
  new MutationObserver(() => {
    const reason = document.documentElement?.getAttribute("data-hq-boot-released");
    if (w.__reason === undefined && reason) w.__reason = reason;
    if (w.__released === undefined && reason === "ready") w.__released = performance.now();
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-hq-boot-released"] });
  const poll = () => {
    if ((w.__hq?.rover?.drawCalls ?? 0) > 0) w.__drawn = performance.now();
    else requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
};

type Probe = { __released?: number; __reason?: string; __drawn?: number };

async function measure(base: string, throttle: boolean) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    const plain = await browser.newContext();
    const page = await plain.newPage();
    await page.goto(`${base}/en?tier=static`);
    await page.waitForSelector("html[data-hydrated]", { state: "attached", timeout: 120_000 });
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
    await boot.waitForFunction(
      () => {
        const w = window as unknown as Probe;
        return w.__released !== undefined || w.__drawn !== undefined;
      },
      null,
      { timeout: throttle ? 300_000 : 180_000 },
    );
    await boot.waitForTimeout(5000);
    const rows = await boot.evaluate(READ_RESOURCES);
    const probe = await boot.evaluate(() => {
      const w = window as unknown as Probe;
      return { released: w.__released, reason: w.__reason, drawn: w.__drawn };
    });
    await human.close();
    const firstFrame = probe.released ?? probe.drawn ?? 0;
    return { initialJs, firstFrameMs: Math.round(firstFrame), coverRelease: probe.reason ?? "none", beforeFirstFrame: sumByBucket(rows, firstFrame), firstFivePlus: sumByBucket(rows) };
  } finally {
    await browser.close();
  }
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

function markdown(label: string, data: Awaited<ReturnType<typeof measure>> & { lhci: LhciRow[] }): string {
  const lines = [`### ${label}`, "", `- Initial JS on /en (served gzip): ${kb(data.initialJs)}`, `- First 3D frame: ${data.firstFrameMs} ms (boot cover released by: ${data.coverRelease ?? "ready"})`, `- Bytes before the first 3D frame: ${kb(data.beforeFirstFrame.total)} (${Object.entries(data.beforeFirstFrame).filter(([k]) => k !== "total").map(([k, v]) => `${k} ${kb(v)}`).join(", ")})`, ""];
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
