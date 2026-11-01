import { expect, test, type Page } from "@playwright/test";
import { cfBeaconScript } from "../src/components/Analytics";
import { parseVisitPayload } from "../src/lib/stats/visit";
import { CLASSIC_DWELL_MS } from "../src/lib/stats/visitClient";
import { asHumanBrowser, asReturningVisitor, openPage, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * Public visit stats: the first-party visit beacon sends a visit ping once per tab session as soon as the
 * page is shown (the public visit count) and a mode ping once per page lifetime (3D, Classic or both), and
 * nothing under automation; Do Not Track visitors are counted (owner decision 2026-10-24). Playwright is
 * automation, so the tests force it with `?visit=1`. The local static server has no Functions: beacons are
 * captured.
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

const allVisitBeacons = (page: Page) => page.evaluate(() => (window as unknown as { __beacons: { url: string; body: string }[] }).__beacons.filter((b) => b.url === "/api/visit"));
/** Mode pings only. */
const beacons = async (page: Page) => (await allVisitBeacons(page)).filter((b) => b.body.includes('"mode"'));
/** Intent pings only (private, owner decision 2026-11-01). */
const intentPings = async (page: Page) => (await allVisitBeacons(page)).filter((b) => b.body.includes('"intent"')).map((b) => JSON.parse(b.body).intent as string);
/** Visit pings only. */
const visitPings = async (page: Page) => (await allVisitBeacons(page)).filter((b) => b.body.includes('"kind"'));
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
  const payload = parseVisitPayload(JSON.parse(sent[0].body));
  return payload && "mode" in payload ? payload.mode : undefined;
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

test("a stale \"Don't count my visits\" key is cleared and the visit counts (owner decision 2026-10-23)", async ({ page }) => {
  await stubBeacon(page);
  await page.addInitScript(() => localStorage.setItem("hq:stats-optout", "1"));
  await openPage(page, "/en/quick?tier=static&visit=1");
  expect(await sentMode(page)).toBe("classic");
  expect(await page.evaluate(() => localStorage.getItem("hq:stats-optout"))).toBeNull();
});

test("plain automation sends nothing; Do Not Track is counted (owner decision 2026-10-24)", async ({ page }) => {
  await stubBeacon(page);
  await openPage(page, "/en/quick?tier=static");
  await leave(page);
  await page.waitForTimeout(300);
  expect(await allVisitBeacons(page)).toEqual([]);

  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "doNotTrack", { configurable: true, get: () => "1" }));
  await openPage(page, "/en/quick?tier=static&visit=1");
  await expect.poll(async () => (await visitPings(page)).length, { timeout: 30_000 }).toBe(1);
});

test("the visit ping goes out as soon as the page is shown, once per tab session", async ({ page, context }) => {
  await stubBeacon(page);
  await openPage(page, "/en/quick?tier=static&visit=1");
  // No hide or pagehide: the ping does not wait for the visitor to leave.
  await expect.poll(async () => (await visitPings(page)).map((b) => b.body), { timeout: 30_000 }).toEqual(['{"v":1,"kind":"visit"}']);
  expect(await page.evaluate(() => sessionStorage.getItem("hq:visit"))).toBe("1");

  // A reload in the same tab keeps the session flag: no second visit (the mode ping proves the beacon ran).
  await page.reload();
  expect(await sentMode(page)).toBe("classic");
  expect(await visitPings(page)).toEqual([]);

  // A new tab is a new session.
  const other = await context.newPage();
  await stubBeacon(other);
  await openPage(other, "/en/quick?tier=static&visit=1");
  await expect.poll(async () => (await visitPings(other)).length, { timeout: 30_000 }).toBe(1);
  await other.close();
});

/** Runs the production Web Analytics guard (test builds carry no token) and waits until its idle step has run. */
async function runAnalyticsGuard(page: Page) {
  // Hydrated, so the app chunk scripts are in the page: the guard queues its idle step at once, and idle
  // callbacks run in order, so the one queued next runs after it.
  await page.evaluate(cfBeaconScript("0123456789abcdef0123456789abcdef"));
  await page.evaluate(() => new Promise<void>((resolve) => requestIdleCallback(() => resolve())));
}

const CF_BEACON = 'script[src="https://static.cloudflareinsights.com/beacon.min.js"]';

test("an automated browser sends no visit or RUM beacon and never loads the Cloudflare beacon", async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.route("https://static.cloudflareinsights.com/**", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }));

  // Control: the same guard in a browser that does not report automation injects the beacon.
  const human = await context.newPage();
  await asHumanBrowser(human);
  await openPage(human, "/en/quick?tier=static");
  await runAnalyticsGuard(human);
  await expect(human.locator(CF_BEACON)).toHaveCount(1);
  await human.close();

  const counted: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.hostname === "static.cloudflareinsights.com" || url.pathname === "/api/visit" || url.pathname === "/api/rum") counted.push(r.url());
  });
  await stubBeacon(page);
  await asReturningVisitor(page);

  await openPage(page, "/en/quick?tier=static");
  await runAnalyticsGuard(page);
  await expect(page.locator(CF_BEACON)).toHaveCount(0);
  await leave(page);

  // The 3D tower (forced, since automation gets the Classic site) without ?visit=1 or ?rum=1.
  await page.goto("/en?tier=lite");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  await waitForFrames(page, 30);
  await leave(page);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await waitForFrames(page, 10);

  expect(await page.evaluate(() => sessionStorage.getItem("hq:rum"))).toBe("off");
  expect(await page.evaluate(() => (window as unknown as { __beacons: { url: string }[] }).__beacons)).toEqual([]);
  expect(counted).toEqual([]);
});

test("a tagged landing carries its channel, and CV, email and LinkedIn intents count once per tab session", async ({ page }) => {
  await stubBeacon(page);
  await openPage(page, "/en/contact?tier=static&visit=1&src=li");
  await expect.poll(async () => (await visitPings(page)).map((b) => b.body)).toEqual(['{"v":1,"kind":"visit","src":"li"}']);
  // Links that would leave the page are kept on it: only the intent matters here.
  await page.evaluate(() => document.addEventListener("click", (e) => (e.target as Element).closest("a[href^='mailto:'], a[href*='linkedin.com']") && e.preventDefault()));
  const email = page.locator("main a[href^='mailto:']").first();
  await email.click();
  await email.click();
  await page.locator("main a[href*='linkedin.com']").first().click();
  await page.getByTestId("cv-open-footer").click();
  await expect(page.getByRole("dialog", { name: "CV", exact: true })).toBeVisible();
  await expect.poll(() => intentPings(page)).toEqual(["email", "linkedin", "cv"]);
});
