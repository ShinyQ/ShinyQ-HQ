import { expect, test, type Page } from "@playwright/test";
import { waitForFloor, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * GPU and rendering gates (round 5, P2). Counters are deterministic on SwiftShader (draw calls,
 * programs, applied DPR and MSAA); time-based numbers come from scripts/perf-gpu.ts on real GPUs.
 */
type Graphics = { pixelRatio: number; multisampling: number | null; bloomLevels: number | null };
type RenderHandle = { resetPeak(): void; peakCalls: number; peakTriangles: number; programs(): number; programNames(): string[]; graphics?(): Graphics };
type GpuWindow = { __hq: { store: { getState(): { goToFloor(f: string): void } }; render: RenderHandle } };

test.describe.configure({ timeout: 240_000 });
test.use({ viewport: { width: 1440, height: 900 } });

async function firstSession(page: Page, tier = "full") {
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 }) }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("hq:terminal-seen", "1");
    localStorage.setItem("hq:onboarded", "done");
    localStorage.setItem("hq:hints", "off");
    sessionStorage.setItem("hq:ask-teaser", "1");
  });
  await page.goto(`/en?tier=${tier}`);
  await waitForHQ(page);
}

/** Clicks Boot rover with the peak counter reset, so the peak covers the intro and the handover. */
async function bootRover(page: Page) {
  const start = page.getByTestId("boot").getByRole("button", { name: "Boot rover" });
  await expect(start).not.toHaveAttribute("aria-disabled", "true", { timeout: 60_000 });
  await page.evaluate(() => (window as unknown as GpuWindow).__hq.render.resetPeak());
  await start.click();
  await waitForPhase(page, "intro");
}

async function counters(page: Page) {
  return page.evaluate(() => {
    const r = (window as unknown as GpuWindow).__hq.render;
    return { peakCalls: r.peakCalls, peakTriangles: r.peakTriangles, programs: r.programs(), names: r.programNames() };
  });
}

async function ride(page: Page, to: string) {
  await page.evaluate(() => (window as unknown as GpuWindow).__hq.render.resetPeak());
  await page.evaluate((f) => (window as unknown as GpuWindow).__hq.store.getState().goToFloor(f), to);
  await waitForFloor(page, to, 90_000);
  await waitForSceneLive(page);
  return counters(page);
}

function report(name: string, value: unknown) {
  test.info().annotations.push({ type: name, description: JSON.stringify(value) });
  console.log(`[gpu] ${name} ${JSON.stringify(value)}`);
}

test("intro and ride draw-call peaks (full tier)", async ({ page }) => {
  await firstSession(page);
  await bootRover(page);
  await waitForPhase(page, "explore", 60_000);
  await waitForSceneLive(page);
  const intro = await counters(page);
  const rides = {
    "L1-L2": await ride(page, "L2"),
    "L2-L1": await ride(page, "L1"),
    "L1-RF": await ride(page, "RF"),
    "RF-L1": await ride(page, "L1"),
  };
  const peaks = { intro: intro.peakCalls, ...Object.fromEntries(Object.entries(rides).map(([k, v]) => [k, v.peakCalls])) };
  report("peaks", peaks);
  for (const value of Object.values(peaks)) expect(Number.isFinite(value) && value > 10).toBe(true);
});

test("programs added on the first arrival at each floor (full tier)", async ({ page }) => {
  await firstSession(page);
  await bootRover(page);
  await waitForPhase(page, "explore", 60_000);
  await waitForSceneLive(page);
  const seen = new Set((await counters(page)).names);
  const added: Record<string, string[]> = {};
  for (const floor of ["L2", "L3", "L4", "RF"]) {
    const { names } = await ride(page, floor);
    added[floor] = names.filter((n) => !seen.has(n));
    for (const n of names) seen.add(n);
  }
  report("programs-added", Object.fromEntries(Object.entries(added).map(([k, v]) => [k, v.length])));
  report("programs-added-names", added);
  expect(Object.keys(added)).toHaveLength(4);
});
