import { expect, test, type Page } from "@playwright/test";
import { PERF_MARKS } from "../../src/lib/perf-marks";
import { asHumanBrowser, waitForHQ, waitForPhase } from "../hq";
import { writePerfEntry } from "./helpers";

/**
 * Nightly game-first timeline (SP2; `bun run e2e:timeline`, workflow perf-nightly.yml). Trend only:
 * SwiftShader and shared runners make every number here noisy, so nothing is asserted except that the
 * 3D view rendered at all. Each run is a cold context (empty cache and storage), with
 * `navigator.webdriver` hidden so the page treats it like a person, and `?tier=lite` so the boot cover
 * path runs on a software renderer. `rum=0` keeps the run out of the RUM dataset.
 */
const PROFILES = {
  /** No throttling. */
  none: { latency: 0, down: -1, up: -1, cpu: 1 },
  /** A fast 4G phone. */
  "4g": { latency: 40, down: (9 * 1000 * 1000) / 8, up: (1.5 * 1000 * 1000) / 8, cpu: 2 },
  /** The report's P1 profile: slow 4G (1.6 Mbps, 150 ms RTT), 4x CPU. */
  p1: { latency: 150, down: (1.6 * 1000 * 1000) / 8, up: (750 * 1000) / 8, cpu: 4 },
} as const;

/** Home (ends at explore) and a pod deep link (the intro, then the continuation mission opens the drawer). */
const SCENARIOS = { home: "/en", deeplink: "/en/labs/voice-ai-contact-center" } as const;
const RUNS = 2;

test.describe.configure({ timeout: 300_000 });

async function throttle(page: Page, profile: (typeof PROFILES)[keyof typeof PROFILES]) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: profile.latency, downloadThroughput: profile.down, uploadThroughput: profile.up });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
}

/** Element Timing for the boot card headline (P1 sets `elementtiming="hq-headline"`); null until then. */
async function observeHeadline(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __headline?: number };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { identifier?: string; renderTime?: number; loadTime?: number })[]) {
          if (entry.identifier === "hq-headline" && w.__headline === undefined) w.__headline = entry.renderTime || entry.loadTime || entry.startTime;
        }
      }).observe({ type: "element", buffered: true });
    } catch {
      // Element Timing is Chromium only.
    }
  });
}

async function collect(page: Page) {
  return page.evaluate((names) => {
    const at = (name: string) => performance.getEntriesByName(name, "mark")[0]?.startTime ?? null;
    const marks: Record<string, number | null> = {
      coverFcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
      headline: (window as unknown as { __headline?: number }).__headline ?? null,
    };
    for (const [key, name] of Object.entries(names)) marks[key] = at(name);
    return { marks, release: document.documentElement.getAttribute("data-hq-boot-released") };
  }, PERF_MARKS);
}

for (const profile of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
  for (const [scenario, path] of Object.entries(SCENARIOS)) {
    for (let run = 1; run <= RUNS; run++) {
      test(`${scenario} on ${profile}, run ${run} @nightly`, async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await asHumanBrowser(page);
        await observeHeadline(page);
        await throttle(page, PROFILES[profile]);
        await page.goto(`${path}?tier=lite&rum=0`, { waitUntil: "commit" });
        await waitForHQ(page);
        const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
        await expect(start).not.toHaveAttribute("aria-disabled", "true", { timeout: 180_000 });
        await start.click();
        await waitForPhase(page, "explore", 180_000);
        if (scenario === "deeplink") {
          await page.waitForFunction((name) => performance.getEntriesByName(name, "mark").length > 0, PERF_MARKS.firstDrawer, { timeout: 120_000 }).catch(() => undefined);
        }
        const { marks, release } = await collect(page);
        writePerfEntry({ kind: "timeline", profile, scenario, run, release, marks });
        console.log(`${scenario} ${profile} #${run}: ${JSON.stringify(marks)} (release ${release})`);
        await context.close();
        expect(marks.firstFrame, "the 3D view never rendered").not.toBeNull();
      });
    }
  }
}
