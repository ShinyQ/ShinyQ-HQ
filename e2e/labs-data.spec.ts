import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import { asReturningVisitor, skipFloorLines, collectErrors, driveTo, enterFloorRoute, expectRenderBudget, hoverTarget, interactablesOf, openPage, snapshot, targetPoint, waitForCameraSettle, waitForFloor, waitForFrames, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";

/**
 * L3 Data and ML spine (owner request 2026-10-14; Round 7 G: three paths): the data pods dock along the
 * centre road from the hub fork to the Tech Reactor plaza, open their drawers with code and research
 * links, the Data ring lights the pods with pandas in their stack, the Data and ML board at the fork opens the project list, Cmd-K
 * rides to that board, and the Classic /labs page filters by the wing.
 */
test.describe.configure({ timeout: 180_000 });

const dataPods = content.floors.labs.pods.filter((p) => p.wing === "data");
const thesis = "university-sentiment-indobert";

type RW = Window & {
  __hq: {
    store: { getState: () => { openRoom: (r: string) => void; activeRoom: string | null } };
    probes: { reactor: { tech: string | null; lit: string[] } };
    layouts: Record<
      string,
      {
        doors?: { room: string; at: { x: number; z: number } }[];
        directoryStops?: Record<string, { x: number; z: number }>;
        stops?: Record<string, { x: number; z: number }>;
        road?: { roads: { id: string; points: { x: number; z: number }[] }[] };
      }
    >;
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

test("every data pod docks along the spine, and a data pod door opens its drawer within the L3 budget", async ({ page }) => {
  await enterFloorRoute(page, "/en/labs");
  const { doors, spine, wingZ, reactor } = await page.evaluate(() => {
    const l = (window as unknown as RW).__hq.layouts.L3;
    const roads = l.road?.roads ?? [];
    return {
      doors: l.doors ?? [],
      spine: roads.find((r) => r.id === "data")?.points ?? [],
      // The wing road's straight run lies at the z of its turn, the second to last point (the last enters the ring).
      wingZ: Math.abs(roads.find((r) => r.id === "software")?.points.at(-2)?.z ?? 0),
      reactor: l.stops!["L3:reactor"],
    };
  });
  // The spine runs straight east along z = 0 from the hub to the reactor plaza (no annex past the reactor).
  expect(spine.length).toBeGreaterThanOrEqual(2);
  expect(spine.every((p) => p.z === 0)).toBe(true);
  expect(spine.at(-1)!.x).toBeLessThan(reactor.x);
  const dataDoors = dataPods.map((pod) => {
    const door = doors.find((d) => d.room === `L3:${pod.slug}`);
    expect(door, pod.slug).toBeDefined();
    return door!;
  });
  for (const door of dataDoors) {
    // East of the directory wall at x = 17, west of the reactor ring, between the two wing roads.
    expect(door.at.x, door.room).toBeGreaterThan(17);
    expect(door.at.x, door.room).toBeLessThan(spine.at(-1)!.x);
    expect(Math.abs(door.at.z), door.room).toBeLessThan(wingZ);
  }
  // Drive along the spine to the farthest data pod; stopping on its door pad opens the room.
  const far = [...dataDoors].sort((a, b) => b.at.x - a.at.x)[0];
  await driveTo(page, far.at, 120_000);
  const { rover } = await snapshot(page);
  expect(Math.hypot(rover.x - far.at.x, rover.z - far.at.z)).toBeLessThan(1.5);
  await waitForRoom(page, far.room);
  await expect(page.getByTestId("room-drawer").getByText(en.common.wing.data).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await waitForPhase(page, "explore");
  await waitForCameraSettle(page);
  await expectRenderBudget(page);
});

// Every data pod whose stack lists pandas (the Fabric forecasting pod lights from its lakehouse pipeline instead).
const pandasPods = dataPods.filter((p) => p.stack.some((s) => s.toLowerCase() === "pandas"));

test("the Data ring lights every data pod with pandas in its stack", async ({ page }) => {
  await enterFloorRoute(page, "/en/labs");
  await page.evaluate(() => (window as unknown as RW).__hq.store.getState().openRoom("L3:reactor"));
  await waitForRoom(page, "L3:reactor");
  await page.locator("button[data-ring=data]").click();
  await page.locator("[data-testid=reactor-techs] [data-tech=pandas]").click();
  expect(pandasPods.length).toBeGreaterThan(0);
  await expect.poll(() => lit(page)).toEqual(expect.arrayContaining(pandasPods.map((p) => p.slug).sort()));
  await waitForFrames(page, 20);
  await expectRenderBudget(page);
});

test("a click on the data directory panel drives to its stop and opens the full project list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await asReturningVisitor(page);
  await skipFloorLines(page);
  await page.goto("/en/labs?tier=lite");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  const id = "L3:board:data";
  const stop = (await interactablesOf(page)).find((i) => i.id === id)!.at;
  expect(stop).toEqual(await page.evaluate(() => (window as unknown as RW).__hq.layouts.L3.directoryStops!.data));
  // The board stands at the fork: its stop lies on the spine, west of the wall at x = 17.
  expect(stop.x).toBeLessThan(17);
  expect(stop.z).toBe(0);
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

test("the Cmd-K Data and ML projects row rides to the data board at the fork", async ({ page }) => {
  await enterFloorRoute(page, "/en");
  await page.keyboard.press("Control+k");
  const title = en.labs.wingProjects.replace("{wing}", en.common.wing.data);
  await page.getByRole("combobox").fill(title);
  await expect(page.getByRole("option").first()).toContainText(title);
  await page.keyboard.press("Enter");
  await waitForFloor(page, "L3", 150_000);
  const stop = await page.evaluate(() => (window as unknown as RW).__hq.layouts.L3.directoryStops!.data);
  expect(stop.x).toBeLessThan(17);
  await page.waitForFunction(
    (s) => {
      const r = (window as unknown as { __hq: { rover: { x: number; z: number; speed: number; autopilot: { state: string } | null } } }).__hq.rover;
      return Math.hypot(r.x - s.x, r.z - s.z) < 1.5 && r.speed < 0.5 && r.autopilot?.state !== "driving" && r.autopilot?.state !== "pending";
    },
    stop,
    { timeout: 90_000 },
  );
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
