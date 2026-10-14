import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import { asReturningVisitor, collectErrors, driveTo, enterFloorRoute, expectRenderBudget, hoverTarget, interactablesOf, openPage, snapshot, targetPoint, waitForCameraSettle, waitForFrames, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";

/**
 * L3 Data and ML annex (owner request 2026-10-14): the data pods are reachable along the data road east
 * of the Tech Reactor, open their drawers with code and research links, the Data ring lights them all,
 * the data directory panel opens the project list, and the Classic /labs page filters by the wing.
 */
test.describe.configure({ timeout: 180_000 });

const dataPods = content.floors.labs.pods.filter((p) => p.wing === "data");
const thesis = "university-sentiment-indobert";

type RW = Window & {
  __hq: {
    store: { getState: () => { openRoom: (r: string) => void; activeRoom: string | null } };
    probes: { reactor: { tech: string | null; lit: string[] } };
    layouts: Record<string, { doors?: { room: string; at: { x: number; z: number } }[]; directoryStops?: Record<string, { x: number; z: number }> }>;
  };
};

const lit = (page: Page) => page.evaluate(() => [...(window as unknown as RW).__hq.probes.reactor.lit].sort());

test("a data pod deep link opens its drawer with the code and research links", async ({ page }) => {
  const errors = collectErrors(page);
  await asReturningVisitor(page);
  await page.goto(`/en/labs/${thesis}?tier=lite`);
  await waitForHQ(page);
  await waitForRoom(page, `L3:${thesis}`);
  const drawer = page.getByTestId("room-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(en.common.wing.data).first()).toBeVisible();
  const code = drawer.getByRole("link", { name: /ShinyQ\/Indobert_University-Feedback-Sentiment-Analysis_Model/ });
  await expect(code).toHaveAttribute("href", "https://github.com/ShinyQ/Indobert_University-Feedback-Sentiment-Analysis_Model");
  await expect(code).toHaveAttribute("target", "_blank");
  await expect(drawer.getByRole("link", { name: /IndoBERT Sentiment Model for Indonesian University Reviews/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("every data pod is reachable along the road, and the annex stays within the L3 budget", async ({ page }) => {
  await enterFloorRoute(page, "/en/labs");
  const doors = await page.evaluate(() => (window as unknown as RW).__hq.layouts.L3.doors ?? []);
  for (const pod of dataPods) {
    const door = doors.find((d) => d.room === `L3:${pod.slug}`);
    expect(door, pod.slug).toBeDefined();
  }
  // Drive out to the farthest data pod: every leg follows the road through the reactor plaza.
  const far = doors.filter((d) => dataPods.some((p) => d.room === `L3:${p.slug}`)).sort((a, b) => b.at.x - a.at.x)[0];
  await driveTo(page, far.at, 120_000);
  const { rover } = await snapshot(page);
  expect(Math.hypot(rover.x - far.at.x, rover.z - far.at.z)).toBeLessThan(1.5);
  await waitForCameraSettle(page);
  await expectRenderBudget(page);
});

test("the Data ring lights every data pod through pandas", async ({ page }) => {
  await enterFloorRoute(page, "/en/labs");
  await page.evaluate(() => (window as unknown as RW).__hq.store.getState().openRoom("L3:reactor"));
  await waitForRoom(page, "L3:reactor");
  await page.locator("button[data-ring=data]").click();
  await page.locator("[data-testid=reactor-techs] [data-tech=pandas]").click();
  await expect.poll(() => lit(page)).toEqual(expect.arrayContaining(dataPods.map((p) => p.slug).sort()));
  await waitForFrames(page, 20);
  await expectRenderBudget(page);
});

test("a click on the data directory panel drives to its stop and opens the full project list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await asReturningVisitor(page);
  await page.goto("/en/labs?tier=lite&walk=off");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  const id = "L3:board:data";
  const stop = (await interactablesOf(page)).find((i) => i.id === id)!.at;
  expect(stop).toEqual(await page.evaluate(() => (window as unknown as RW).__hq.layouts.L3.directoryStops!.data));
  // Drive out to the panel's stop (its view zone turns the camera to the panel), then point at it like a visitor.
  await driveTo(page, stop, 120_000);
  await waitForCameraSettle(page);
  await hoverTarget(page, id);
  const point = await targetPoint(page, id);
  await page.mouse.click(point.x, point.y);
  const palette = page.getByRole("dialog", { name: en.hud.palette.title });
  await expect(palette).toBeVisible({ timeout: 60_000 });
  const { rover } = await snapshot(page);
  expect(Math.hypot(rover.x - stop.x, rover.z - stop.z)).toBeLessThan(1.5);
});

test("Classic /labs filters to Data and ML and the case study links code and research", async ({ page }) => {
  const pods = content.floors.labs.pods;
  await openPage(page, "/en/labs?tier=static");
  const status = page.getByRole("search", { name: "Filter projects" }).getByRole("status");
  await page.getByRole("button", { name: /^Data and ML/ }).click();
  await expect(page).toHaveURL(/\?tier=static&wing=data$/);
  await expect(status).toHaveText(`Showing ${dataPods.length} of ${pods.length}`);
  await expect(page.locator("[data-pod][data-wing='ai']").first()).toBeHidden();
  for (const pod of dataPods) await expect(page.locator(`[data-pod][data-wing='data'] a[href$='/labs/${pod.slug}']`).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Data and ML/ })).toHaveAttribute("aria-pressed", "true");

  await openPage(page, `/en/labs/covid-herd-immunity-forecast?tier=static`);
  const code = page.getByTestId("pod-code-research");
  await expect(code.getByRole("link", { name: /Indonesia_COVID-19_N-BEATS_Time-Series-Forecast/ })).toHaveAttribute("rel", "noopener noreferrer");
  await code.getByRole("button", { name: /Study on the Dynamics of COVID-19 Cases/ }).click();
  await expect(page.getByRole("dialog").getByText("10.1109/icicyta53712.2021.9689122").first()).toBeVisible();
});
