import { expect, test, type Page } from "@playwright/test";
import { parseVisitPayload } from "../src/lib/stats/visit";
import { CLASSIC_DWELL_MS } from "../src/lib/stats/visitClient";
import { asReturningVisitor, openPage, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * Public visit stats: the first-party visit beacon sends one point per page lifetime (3D, Classic or
 * both) and nothing under the opt-out, Do Not Track or automation. Playwright is automation, so the
 * tests force it with `?visit=1`. The local static server has no Functions: beacons are captured.
 */

async function stubBeacon(page: Page) {
  await page.addInitScript(() => {
    const sent: { url: string; body: string }[] = [];
    (window as unknown as { __beacons: typeof sent }).__beacons = sent;
    Object.defineProperty(Navigator.prototype, "sendBeacon", {
      configurable: true,
      value: (url: string, body: string) => {
        sent.push({ url: String(url), body: String(body) });
        return true;
      },
    });
  });
}

const beacons = (page: Page) => page.evaluate(() => (window as unknown as { __beacons: { url: string; body: string }[] }).__beacons.filter((b) => b.url === "/api/visit"));
const leave = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("pagehide")));

/** Leaves until the beacon (mounted after hydration) has sent once, then returns its payload. */
async function sentMode(page: Page) {
  await expect
    .poll(
      async () => {
        await leave(page);
        return (await beacons(page)).length;
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  await leave(page);
  const sent = await beacons(page);
  expect(sent).toHaveLength(1);
  return parseVisitPayload(JSON.parse(sent[0].body))?.mode;
}

test("the Classic site sends one classic visit when the page is left", async ({ page }) => {
  await stubBeacon(page);
  await openPage(page, "/en/quick?tier=static&visit=1");
  expect(await sentMode(page)).toBe("classic");
});

async function openTower(page: Page) {
  await asReturningVisitor(page);
  await stubBeacon(page);
  await page.goto("/en?tier=lite&visit=1");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

test("the 3D tower sends a 3d visit", async ({ page }) => {
  test.setTimeout(90_000);
  await openTower(page);
  expect(await sentMode(page)).toBe("3d");
});

test("switching from the 3D tower to the Classic site sends both", async ({ page }) => {
  test.setTimeout(90_000);
  await openTower(page);
  await page.getByRole("button", { name: "Classic site" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-hq", /.*/);
  // The Classic site counts only after it stayed on screen for CLASSIC_DWELL_MS (by design, not a race).
  await page.waitForTimeout(CLASSIC_DWELL_MS + 500);
  expect(await sentMode(page)).toBe("both");
});

test("nothing is sent after \"Don't count my visits\"", async ({ page }) => {
  await stubBeacon(page);
  await page.addInitScript(() => localStorage.setItem("hq:stats-optout", "1"));
  await openPage(page, "/en/quick?tier=static&visit=1");
  await leave(page);
  await page.waitForTimeout(300);
  expect(await beacons(page)).toEqual([]);
});

test("Do Not Track and plain automation send nothing", async ({ page }) => {
  await stubBeacon(page);
  await openPage(page, "/en/quick?tier=static");
  await leave(page);
  await page.waitForTimeout(300);
  expect(await beacons(page)).toEqual([]);

  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "doNotTrack", { configurable: true, get: () => "1" }));
  await openPage(page, "/en/quick?tier=static&visit=1");
  await leave(page);
  await page.waitForTimeout(300);
  expect(await beacons(page)).toEqual([]);
});
