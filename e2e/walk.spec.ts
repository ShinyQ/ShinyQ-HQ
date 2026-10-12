import { expect, test, type Page } from "@playwright/test";
import data from "../content/site-content.json";
import en from "../messages/en.json";
import { orderPods } from "../src/content/selectors";
import type { Pod } from "../src/content/schema";
import { asReturningVisitor, collectErrors, enterHQ, waitForFloor, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";

/**
 * Guided walks (missions/walk.ts + hud/walk). Floors offer their walk once their road ships
 * (`WALK_FLOORS`); most tests turn every walk on with `?walk=on`, so they do not depend on that list.
 */
test.describe.configure({ timeout: 180_000 });

async function openWithWalks(page: Page, path: string) {
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=lite&walk=on`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
}

const stopOf = (page: Page) => page.getByTestId("walk-bar").getAttribute("data-stop");

/** The tour's first stop: the first docked Product Engineering pod in site order (gallery first). */
const firstSoftwareStop = `L3:${orderPods((data.floors.labs.pods as unknown as Pod[]).filter((p) => p.wing === "software" && p.tier !== "listed"))[0].slug}`;

async function waitForArrival(page: Page) {
  await expect(page.getByTestId("walk-bar")).toHaveAttribute("data-status", "arrived", { timeout: 90_000 });
  const stop = await stopOf(page);
  // Board stops (L3 wing directories, the L4 archive) open a palette, not a room.
  if (stop?.includes(":directory:") || stop === "L4:archive") return stop;
  await waitForRoom(page, stop!);
  return stop!;
}

test.describe("Guided walks", () => {
  test("L2: first-visit prompt, walk in date order, keys, manual pause and resume", async ({ page }) => {
    const errors = collectErrors(page);
    await openWithWalks(page, "/en/journey");

    const prompt = page.getByTestId("walk-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt.getByRole("heading")).toHaveText("Walk my journey?");
    await prompt.getByRole("button", { name: "Walk my journey" }).click();

    const bar = page.getByTestId("walk-bar");
    await expect(bar).toBeVisible();
    await expect(page.getByTestId("walk-counter")).toContainText(/Stop 1 of \d+/);
    const first = await waitForArrival(page);
    expect(first.startsWith("L2:")).toBe(true);

    // `]` steps forward, through the open drawer.
    await page.keyboard.press("]");
    await expect(page.getByTestId("walk-counter")).toContainText("Stop 2 of");
    const second = await waitForArrival(page);
    expect(second).not.toBe(first);

    // Driving by hand pauses the walk to the "Resume walk" pill.
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    await page.keyboard.down("d");
    await expect(page.getByTestId("walk-pill")).toBeVisible();
    await page.keyboard.up("d");
    await page.getByTestId("walk-pill").getByRole("button", { name: /Resume walk/ }).click();
    expect(await waitForArrival(page)).toBe(second);

    // Progress is saved; ending the walk leaves a launcher and the prompt does not come back.
    await bar.getByRole("button", { name: "End walk" }).first().click();
    await expect(page.getByTestId("walk-launcher")).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hq:walk:journey") ?? "null"));
    expect(saved).toMatchObject({ stop: second, done: false });
    expect(saved.visited).toEqual(expect.arrayContaining([first, second]));

    // The room is still open, so the reload deep-links into it (phase "room").
    await page.reload();
    await waitForHQ(page);
    await waitForSceneLive(page);
    await expect(page.getByTestId("walk-launcher")).toBeVisible();
    await expect(page.getByTestId("walk-prompt")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("L3: the tour starts at the first software pod in site order, filters by wing and Prev steps back", async ({ page }) => {
    const errors = collectErrors(page);
    await openWithWalks(page, "/en/labs");
    await page.getByTestId("walk-prompt").getByRole("button", { name: "Tour my projects" }).click();
    expect(await waitForArrival(page)).toBe(firstSoftwareStop);
    await page.getByTestId("walk-filter").selectOption("ai");
    await expect(page.getByTestId("walk-counter")).toContainText(en.common.wing.ai);
    await page.getByTestId("walk-bar").getByRole("button", { name: /Next/ }).click();
    const ai2 = await waitForArrival(page);
    await page.getByTestId("walk-bar").getByRole("button", { name: /Previous/ }).click();
    const ai1 = await waitForArrival(page);
    expect(ai1).not.toBe(ai2);
    expect(errors).toEqual([]);
  });

  test("L3 offers its tour without the flag", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en/labs?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    const prompt = page.getByTestId("walk-prompt");
    await expect(prompt.getByRole("heading")).toHaveText("Tour my projects?");
    await prompt.getByRole("button", { name: "Explore freely" }).click();
    await expect(page.getByTestId("walk-launcher")).toBeVisible();
  });

  test("L4: Read my writing starts at a post, opens its drawer and filters by zone", async ({ page }) => {
    const errors = collectErrors(page);
    await openWithWalks(page, "/en/library");
    const prompt = page.getByTestId("walk-prompt");
    await expect(prompt.getByRole("heading")).toHaveText(en.walk.writing.title);
    await prompt.getByRole("button", { name: en.walk.writing.start }).click();
    const first = await waitForArrival(page);
    expect(first.startsWith("L4:")).toBe(true);
    await expect(page.getByTestId("room-drawer")).toHaveAttribute("data-room", first);
    await page.getByTestId("walk-filter").selectOption("research");
    await expect(page.getByTestId("walk-counter")).toContainText(en.library.research);
    // A filter picks its stop without driving; Open drives there and opens the Research drawer.
    await page.getByTestId("walk-bar").getByRole("button", { name: en.walk.open, exact: true }).click();
    await waitForRoom(page, "L4:research");
    await expect(page.getByTestId("room-drawer").getByTestId("research-item").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("L4 offers its walk without the flag", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en/library?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    const prompt = page.getByTestId("walk-prompt");
    await expect(prompt.getByRole("heading")).toHaveText(en.walk.writing.title);
    await prompt.getByRole("button", { name: en.walk.explore }).click();
    await expect(page.getByTestId("walk-launcher")).toBeVisible();
  });

  test("the Missions tour rides to L3 and starts the walk", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);
    await page.getByTestId("hud").getByRole("button", { name: "Missions" }).click();
    await page.getByRole("option", { name: data.missions.find((m) => m.id === "projects")!.label.en }).click();
    await waitForFloor(page, "L3", 60_000).catch(() => undefined);
    await expect(page.getByTestId("walk-bar")).toBeVisible({ timeout: 60_000 });
    expect(await waitForArrival(page)).toBe(firstSoftwareStop);
    await expect(page.getByTestId("walk-prompt")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("?walk=off offers no walk, even on a floor in WALK_FLOORS", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en/journey?tier=lite&walk=off");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    // Proving that nothing shows: the prompt would appear 700 ms after explore.
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("walk-prompt")).toHaveCount(0);
    await expect(page.getByTestId("walk-launcher")).toHaveCount(0);
  });
});

test.describe("Guided walks on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the Walk HUD sits under the top bar and a swipe steps forward", async ({ page }) => {
    await openWithWalks(page, "/en/journey");
    await page.getByTestId("walk-prompt").getByRole("button", { name: "Walk my journey" }).click();
    await waitForArrival(page);
    const bar = page.getByTestId("walk-bar");
    const box = (await bar.boundingBox())!;
    expect(box.y).toBeLessThan(200);

    const cdp = await page.context().newCDPSession(page);
    // Middle of the card (title and subtitle), away from the filter and the buttons.
    const y = box.y + box.height * 0.45;
    let timestamp = Date.now() / 1000;
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }], timestamp: (timestamp += 0.04) });
    await touch("touchStart", box.x + box.width * 0.7);
    for (const f of [0.6, 0.5, 0.4, 0.3]) await touch("touchMove", box.x + box.width * f);
    await touch("touchEnd", 0);
    await cdp.detach();
    await expect(page.getByTestId("walk-counter")).toContainText("Stop 2 of");
  });
});

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The Ask dock pill sits in the top-right controls; its side panel opens on the right. The Walk HUD must stay clear of both. */
async function openWalkWithAsk(page: Page) {
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 }) }),
  );
  await page.addInitScript(() => sessionStorage.setItem("hq:ask-teaser", "1"));
  await openWithWalks(page, "/en/journey");
  await page.getByTestId("walk-prompt").getByRole("button", { name: "Walk my journey" }).click();
  await waitForArrival(page);
}

test.describe("Guided walks next to the Ask dock", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("desktop: the Walk HUD stays clear of the Ask pill and moves beside the Ask side panel", async ({ page }) => {
    await openWalkWithAsk(page);
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    const pill = page.locator("[data-testid='ask-pill']:visible").first();
    const bar = page.getByTestId("walk-bar");
    expect(overlaps((await bar.boundingBox())!, (await pill.boundingBox())!)).toBe(false);
    await pill.click();
    const panel = page.getByTestId("ask-dock");
    await expect(panel).toBeVisible();
    await expect.poll(async () => overlaps((await bar.boundingBox())!, (await panel.boundingBox())!)).toBe(false);
  });
});

test.describe("Guided walks next to the Ask dock on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("phone: the Walk HUD sits under the controls row with the Ask pill", async ({ page }) => {
    await openWalkWithAsk(page);
    const pill = page.locator("[data-testid='ask-pill']:visible").first();
    expect(overlaps((await page.getByTestId("walk-bar").boundingBox())!, (await pill.boundingBox())!)).toBe(false);
  });
});
