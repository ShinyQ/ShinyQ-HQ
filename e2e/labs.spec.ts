import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  chooseMotion,
  asReturningVisitor,
  skipFloorLines,
  collectErrors,
  DESKTOP_SAFE,
  expectRenderBudget,
  enterFloorRoute,
  enterHQ,
  hoveredTarget,
  hoverTarget,
  interactablesOf,
  PHONE_SAFE,
  snapshot,
  targetPoint,
  waitForCameraSettle,
  waitForFloor,
  waitForFrames,
  waitForHQ,
  waitForPhase,
  waitForSceneLive,
} from "./hq";
import { content, heroPod, livePods } from "./routes";
import en from "../messages/en.json";
import data from "../content/site-content.json";
import { directoryBoard, LABS } from "../src/experience/floors/labs/layout";

test.describe.configure({ timeout: 150_000 });

type HQ = { __hq: { store: { getState: () => { phase: string; floor: string; activeRoom: string | null; drawerTab: string } } } };

const heroes = (["software", "ai"] as const).flatMap((wing) =>
  content.floors.labs.pods.filter((p) => p.wing === wing && p.tier === "hero").map((p) => p.slug),
);

async function state(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as HQ).__hq.store.getState();
    return { phase: s.phase, floor: s.floor, activeRoom: s.activeRoom, drawerTab: s.drawerTab };
  });
}

async function waitForRoom(page: Page, room: string, timeout = 90_000) {
  await page.waitForFunction(
    (r) => {
      const s = (window as unknown as HQ).__hq.store.getState();
      return s.activeRoom === r && s.phase === "room";
    },
    room,
    { timeout },
  );
}

/** Opens a pod route in 3D (lite tier) as a returning visitor. */
async function openPod(page: Page, slug = heroPod.slug, query = "") {
  await asReturningVisitor(page);
  await page.goto(`/en/labs/${slug}?tier=lite${query}`);
  await waitForHQ(page);
}

test.describe("L3 Labs in 3D", () => {
  test("the drawer footer offers Visit live site after Read case study and opens it in a new tab without an opener", async ({ page, context }) => {
    const pod = livePods.find((p) => p.slug === "solutions-marketing-site")!;
    await context.route(/^https:\/\/mii-microsoft(?:-ai)?\.azurewebsites\.net\//, (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Live site stub</title>" }),
    );
    await openPod(page, pod.slug);
    await waitForRoom(page, `L3:${pod.slug}`, 30_000);
    expect((await state(page)).floor).toBe("L3");
    const footer = page.getByTestId("drawer-footer");
    const items = footer.locator(":scope > *");
    await expect(items.nth(0)).toHaveText(en.common.caseStudy);
    await expect(items.nth(1)).toHaveAttribute("data-testid", "drawer-live-link");
    const visit = footer.getByTestId("drawer-live-link");
    await expect(visit).toHaveAttribute("href", pod.liveUrl!);
    await expect(visit).toHaveAttribute("target", "_blank");
    await expect(visit).toHaveAttribute("rel", "noopener noreferrer");
    const [popup] = await Promise.all([page.waitForEvent("popup"), visit.click()]);
    await popup.waitForLoadState();
    expect(new URL(popup.url()).origin).toBe(new URL(pod.liveUrl!).origin);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
    expect(await state(page)).toMatchObject({ phase: "room", activeRoom: `L3:${pod.slug}` });
  });

  test("Ctrl+K drives to a pod and opens the drawer; Esc restores the floor URL", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await page.keyboard.type("voice");
    await expect(palette.getByRole("option").first()).toContainText(data.floors.labs.pods.find((pod) => pod.slug === "voice-ai-contact-center")!.title.en);
    await page.keyboard.press("Enter");
    await waitForFloor(page, "L3").catch(() => undefined);
    await waitForRoom(page, "L3:voice-ai-contact-center");
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("heading", { level: 2 })).toHaveText(data.floors.labs.pods.find((pod) => pod.slug === "voice-ai-contact-center")!.title.en);
    await expect(page).toHaveURL(/\/en\/labs\/voice-ai-contact-center\?tier=lite$/);
    // The mission opens the drawer while the rover may still be rolling toward the door pad. Closing it
    // right away must stop the drive, and the pad must not reopen the room when the rover comes to rest.
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/en\/labs\?tier=lite$/);
    await expect.poll(() => snapshot(page).then((s) => s.rover.speed)).toBe(0);
    await waitForFrames(page, 30);
    expect(await state(page)).toMatchObject({ phase: "explore", activeRoom: null });
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/en\/labs\?tier=lite$/);
    expect(errors).toEqual([]);
  });

  test("a deep link in a session that saw the intro opens L3 at the pod with the drawer", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto(`/en/labs/${heroPod.slug}?tier=lite`);
    await waitForHQ(page);
    await waitForRoom(page, `L3:${heroPod.slug}`, 30_000);
    await expect(page.getByTestId("boot")).toHaveCount(0);
    expect((await state(page)).floor).toBe("L3");
    const drawer = page.getByRole("dialog", { name: /.+/ }).and(page.getByTestId("room-drawer"));
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("tab")).toHaveText(Object.values(en.drawer.tabs));
    await drawer.getByRole("tab", { name: "Results" }).click();
    await expect(drawer.getByTestId("metric").first()).toBeVisible();
    // Next pod in the wing replaces the URL.
    await drawer.getByRole("button", { name: /^Next room/ }).click();
    await expect(page).toHaveURL(/\/en\/labs\/(?!voice-ai-contact-center)[a-z0-9-]+\?tier=lite$/);
  });

  test("the /labs route starts on L3 in explore", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en/labs?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    expect((await state(page)).floor).toBe("L3");
    await expect(page.getByTestId("room-drawer")).toHaveCount(0);
  });

  test("hologram view: fly-in, prev/next hero pods, Esc back to the drawer", async ({ page }) => {
    const errors = collectErrors(page);
    await openPod(page);
    await waitForRoom(page, `L3:${heroPod.slug}`, 30_000);
    await page.getByTestId("room-drawer").getByRole("button", { name: "View architecture" }).first().click();
    await waitForPhase(page, "hologram");
    const hologram = page.getByTestId("hologram");
    await expect(hologram).toBeVisible();
    await expect(page).toHaveURL(/view=architecture/);
    await expect(page.getByTestId("hologram-results").getByTestId("metric").first()).toBeVisible();
    const index = heroes.indexOf(heroPod.slug);
    await page.keyboard.press("ArrowRight");
    const next = heroes[(index + 1) % heroes.length];
    await expect(hologram).toHaveAttribute("data-room", `L3:${next}`);
    await expect(page).toHaveURL(new RegExp(`/en/labs/${next}\\?tier=lite&view=architecture$`));
    await page.getByRole("button", { name: en.drawer.hologram.prev }).click();
    await expect(hologram).toHaveAttribute("data-room", `L3:${heroPod.slug}`);
    await page.keyboard.press("Escape");
    await waitForRoom(page, `L3:${heroPod.slug}`);
    await expect(page.getByTestId("room-drawer")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/en/labs/${heroPod.slug}\\?tier=lite$`));
    expect(errors).toEqual([]);
  });

  test("?view=architecture deep links straight into the hologram", async ({ page }) => {
    await openPod(page, heroPod.slug, "&view=architecture");
    await waitForPhase(page, "hologram", 30_000);
    await expect(page.getByTestId("hologram")).toHaveAttribute("data-room", `L3:${heroPod.slug}`);
  });

  test("README easter egg toggles with t and from the overflow menu", async ({ page }) => {
    await openPod(page);
    await waitForRoom(page, `L3:${heroPod.slug}`, 30_000);
    await page.keyboard.press("t");
    const readme = page.getByTestId("readme");
    await expect(readme).toContainText("$ cat README.md");
    await expect(readme).toContainText("\u250C");
    await page.keyboard.press("t");
    await expect(readme).toBeHidden();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("button", { name: /README/ }).click();
    await expect(page.getByTestId("readme")).toBeVisible();
  });

  test("the drawer has no serious accessibility violations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await chooseMotion(page, "system");
    await openPod(page);
    await waitForRoom(page, `L3:${heroPod.slug}`, 30_000);
    const results = await new AxeBuilder({ page }).include("[data-testid='room-drawer']").analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

test("desktop: the drawer body gets most of the height and the bar condenses on scroll", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await chooseMotion(page, "system");
  await openPod(page);
  await waitForRoom(page, `L3:${heroPod.slug}`, 30_000);
  const drawer = page.getByTestId("room-drawer");
  const body = drawer.getByTestId("drawer-body");
  const drawerBox = (await drawer.boundingBox())!;
  const bodyBox = (await body.boundingBox())!;
  expect(drawerBox.width).toBe(600);
  expect(bodyBox.height / drawerBox.height).toBeGreaterThanOrEqual(0.65);
  await expect(drawer).not.toHaveAttribute("data-condensed");
  await body.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(drawer).toHaveAttribute("data-condensed", "true");
  // The tabs stick to the top of the scrolling body.
  const tabs = (await drawer.getByRole("tablist").boundingBox())!;
  expect(Math.abs(tabs.y - bodyBox.y)).toBeLessThanOrEqual(1);
  await context.close();
});

test("mobile: the drawer is a bottom sheet with snap points", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openPod(page);
  await waitForRoom(page, `L3:${heroPod.slug}`, 30_000);
  const drawer = page.getByTestId("room-drawer");
  await expect(drawer).toHaveAttribute("data-layout", "sheet");
  const collapsed = await drawer.boundingBox();
  expect(collapsed?.width).toBe(390);
  expect(Math.round((collapsed?.height ?? 0) / 844 * 100)).toBe(55);
  await page.getByTestId("sheet-handle").click();
  await expect.poll(async () => Math.round(((await drawer.boundingBox())?.height ?? 0) / 844 * 100)).toBe(92);
  await page.getByRole("button", { name: "Close room" }).click();
  await expect(drawer).toBeHidden();
  await context.close();
});

/**
 * L3 arrival draw calls before the round 5 consolidation (P8 Task 1 baseline on SwiftShader, default
 * 1280x720 viewport, deep link to /en/labs: lite 66, full 85): the directory wall in the arrival view must
 * not raise them. Round 7 G three paths: the Data and ML spine pods and its road now sit in the arrival
 * view, +2 calls on both tiers (main measured 65 and 85, the branch 67 and 87; owner note in the PR).
 */
const L3_ARRIVAL_CALLS = { lite: 67, full: 87 } as const;

for (const tier of ["lite", "full"] as const) {
  test(`the Labs arrival view stays at or under its pre-consolidation draw calls (${tier})`, async ({ page }) => {
    await enterFloorRoute(page, "/en/labs", { tier });
    await waitForCameraSettle(page);
    await page.waitForFunction(() => (window as unknown as { __hq: { rover: { drawCalls: number } } }).__hq.rover.drawCalls > 10);
    // Troika texts typeset asynchronously; give them time to land, like the floor budget test above.
    await page.waitForTimeout(1500);
    const { drawCalls } = await snapshot(page);
    console.log(`L3 arrival draw calls (${tier}): ${drawCalls}`);
    expect(drawCalls).toBeLessThanOrEqual(L3_ARRIVAL_CALLS[tier]);
  });
}

type FaceWindow = Window & {
  __hq: { interact: { floorY: number; project: ((p: { x: number; y: number; z: number }) => { x: number; y: number } | null) | null } };
};
type TapWindow = Window & {
  __hq: { interact: { screenAt: (id: string, fx: number, fz: number, lift: number) => { x: number; y: number } | null; hitAt: (x: number, y: number) => string | null } };
};
type PanelWindow = Window & { __hq: { interact: { screenAt: (id: string, fx: number, fz: number, lift: number) => { x: number; y: number } | null } } };

/** The L3 arrival as a returning visitor (no first-visit floor line covers the floor), camera settled. */
async function openLabsArrival(page: Page) {
  await asReturningVisitor(page);
  await skipFloorLines(page);
  await page.goto("/en/labs?tier=lite");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  await waitForCameraSettle(page);
}

/** Screen box (CSS px) of a directory board: the corners of its point-and-go pick volume. */
async function panelBox(page: Page, wing: "software" | "data" | "ai") {
  return page.evaluate((id) => {
    const { interact } = (window as unknown as PanelWindow).__hq;
    const points = [0, 1].flatMap((fx) => [0, 1].flatMap((fz) => [0.02, 0.98].map((lift) => interact.screenAt(id, fx, fz, lift))));
    if (points.some((p) => !p)) return null;
    const xs = points.map((p) => p!.x);
    const ys = points.map((p) => p!.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, `L3:board:${wing}`);
}

/**
 * The on-screen part of a board that may run off the screen edge (phones): its front face (`directoryBoard`)
 * sampled at 101 columns across its width, top and bottom; `shown` is the share of columns whose both ends
 * are on screen (fine enough to measure the design's 35 percent floor) (a point off screen projects to null, so `panelBox` cannot measure it),
 * and `clear` the share of columns that are on screen and bare canvas at their mid-height (no HUD over them).
 */
async function visiblePanel(page: Page, wing: "software" | "ai") {
  const board = directoryBoard(wing);
  // The face spans `base` to `h` (the top edge, not a height).
  const { w, width, base, h } = LABS.board;
  const columns = Array.from({ length: 101 }, (_, i) => {
    const t = (i / 100 - 0.5) * width;
    return { x: board.center.x + board.normal.x * (w / 2) + board.along.x * t, z: board.center.z + board.normal.z * (w / 2) + board.along.z * t };
  });
  return page.evaluate(
    ({ columns, base, top }) => {
      const { interact } = (window as unknown as FaceWindow).__hq;
      const projected = columns.map((c) => [base, top].map((y) => interact.project!({ x: c.x, y: interact.floorY + y, z: c.z })));
      const onScreen = projected.filter((c) => c.every(Boolean)) as { x: number; y: number }[][];
      if (!onScreen.length) return null;
      const clear = onScreen.filter(([a, b]) => document.elementFromPoint((a.x + b.x) / 2, (a.y + b.y) / 2)?.tagName === "CANVAS").length;
      const xs = onScreen.flat().map((p) => p.x);
      const ys = onScreen.flat().map((p) => p.y);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
        shown: onScreen.length / projected.length,
        clear: clear / projected.length,
      };
    },
    { columns, base, top: h },
  );
}

test.describe("L3 directory wall (round 5 consolidation)", () => {
  for (const size of [
    { width: 1440, height: 900, safe: DESKTOP_SAFE, phone: false },
    { width: 390, height: 844, safe: PHONE_SAFE, phone: true },
  ] as const) {
    // Phones (owner review 2026-10-16): the camera stays east of the elevator shaft, so three separate 9 u boards
    // cannot all be whole; the gate board is, and each side board keeps its inner part on screen (the design's
    // 35 percent floor, `tests/unit/labs-arrival.test.ts`).
    test(`${size.phone ? "the gate board is whole and unobstructed, the side boards show their inner part" : "all three directory boards are whole and unobstructed"} on arrival @ ${size.width}x${size.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, isMobile: size.phone, hasTouch: size.phone });
      const page = await context.newPage();
      await openLabsArrival(page);
      for (const wing of ["software", "data", "ai"] as const) {
        const side = size.phone && wing !== "data";
        // `shown` and `clear` only come from `visiblePanel` (phone side boards).
        const box: { minX: number; maxX: number; minY: number; maxY: number; shown?: number; clear?: number } | null = side ? await visiblePanel(page, wing) : await panelBox(page, wing);
        expect(box, wing).not.toBeNull();
        if (side) {
          test.info().annotations.push({ type: "phone board share", description: `${wing}: on screen ${box!.shown!.toFixed(3)}, unobstructed ${box!.clear!.toFixed(3)}` });
          expect(box!.shown, `${wing}: share of the board on screen`).toBeGreaterThanOrEqual(0.35);
          // The Corners HUD (Round 8 I) has no elevator rail on the right edge, so the AI board's inner part is as
          // clear as the Product board's. Measured at mid-height: AI 0.376 (0.069 under the old rail), Product 0.376;
          // both floors keep a 20 percent margin under their measure.
          expect(box!.clear, `${wing}: share of the board on screen and not under the HUD`).toBeGreaterThanOrEqual(0.3);
        } else {
          expect(box!.minX, wing).toBeGreaterThanOrEqual(size.safe.side);
          expect(box!.maxX, wing).toBeLessThanOrEqual(size.width - size.safe.side);
        }
        expect(box!.minY, wing).toBeGreaterThanOrEqual(size.safe.top);
        expect(box!.maxY, wing).toBeLessThanOrEqual(size.height - size.safe.bottom);
        if (!side) {
          const y = (box!.minY + box!.maxY) / 2;
          expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: (box!.minX + box!.maxX) / 2, y }), `${wing}: HUD over the panel`).toBe("CANVAS");
        }
      }
      await context.close();
    });
  }

  test("a click on a wing panel drives to its stop and opens the full project list", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openLabsArrival(page);
    const id = "L3:board:software";
    const stop = (await interactablesOf(page)).find((i) => i.id === id)!.at;
    await hoverTarget(page, id);
    const point = await targetPoint(page, id);
    await page.mouse.click(point.x, point.y);
    const palette = page.getByRole("dialog", { name: en.hud.palette.title });
    await expect(palette).toBeVisible({ timeout: 60_000 });
    await expect(palette.getByRole("option").first()).toBeVisible();
    const { rover } = await snapshot(page);
    expect(Math.hypot(rover.x - stop.x, rover.z - stop.z)).toBeLessThan(1.5);
  });

  test("on a phone a tap selects a wing panel and Go opens the full project list", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await openLabsArrival(page);
    const id = "L3:board:ai";
    // The AI board shows only its inner part on a phone: tap the first point across it that is on the bare
    // canvas inside the safe box and that the click raycast gives to this board.
    const point = await page.evaluate(
      ({ id, safe }) => {
        const { interact } = (window as unknown as TapWindow).__hq;
        for (let i = 0; i <= 20; i++) {
          const p = interact.screenAt(id, 0.5, i / 20, 0.6);
          if (!p || p.x < safe.side || p.x > window.innerWidth - safe.side || p.y < safe.top || p.y > window.innerHeight - safe.bottom) continue;
          if (document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS" && interact.hitAt(p.x, p.y) === id) return p;
        }
        return null;
      },
      { id, safe: PHONE_SAFE },
    );
    expect(point, `${id} on screen`).not.toBeNull();
    await page.touchscreen.tap(point!.x, point!.y);
    await expect.poll(() => hoveredTarget(page)).toEqual({ id, via: "tap" });
    await page.getByTestId("interact-go").tap();
    await expect(page.getByRole("dialog", { name: en.hud.palette.title })).toBeVisible({ timeout: 60_000 });
    await context.close();
  });
});
