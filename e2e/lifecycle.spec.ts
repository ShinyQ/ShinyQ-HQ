import { expect, test, type Browser, type Page } from "@playwright/test";
import { asReturningVisitor, enterHQ, waitForFrames, waitForHQ, waitForSceneLive } from "./hq";
import { heroPod } from "./routes";

/**
 * Round 5 P3 lifecycle: the paced frame loop, pauses under covering panels, store write rates and
 * crash recovery. Draw calls are counted on the 3D canvas's own WebGL context (not troika's glyph
 * canvas) by wrapping the draw functions, which works on any build, so before and after numbers
 * come from one method.
 */
type LifeWindow = Window & {
  __glDraws: number;
  __hq: { frames: () => number };
};

async function countDraws(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __glDraws: number };
    w.__glDraws = 0;
    const hq = new WeakSet<object>();
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      const ctx = (getContext as (...a: unknown[]) => unknown).apply(this, args);
      if (ctx && this.closest("[data-testid=hq]")) hq.add(ctx as object);
      return ctx;
    } as typeof getContext;
    const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced", "drawRangeElements"]) {
      const original = proto[name];
      proto[name] = function (this: object, ...args: unknown[]) {
        if (hq.has(this)) w.__glDraws += 1;
        return original.apply(this, args);
      };
    }
  });
}

// SwiftShader 3D boots are slow on loaded machines (as in experience.spec.ts).
test.describe.configure({ timeout: 150_000 });

const draws = (page: Page) => page.evaluate(() => (window as unknown as LifeWindow).__glDraws);

/** Waits until the canvas draws again (rendering continues or resumed). */
async function expectDrawing(page: Page) {
  const before = await draws(page);
  await expect.poll(() => draws(page), { timeout: 15_000 }).toBeGreaterThan(before);
}

test.describe("paced frame loop", () => {
  test("the canvas renders through the paced loop", async ({ page }) => {
    await countDraws(page);
    await enterHQ(page);
    const frames = () => page.evaluate(() => (window as unknown as LifeWindow).__hq.frames());
    const before = await frames();
    await waitForFrames(page, 30);
    expect(await frames()).toBeGreaterThan(before + 5);
    await expectDrawing(page);
  });
});

/** Draw calls over `ms` of wall time: only for proving that the canvas stays idle. */
async function drawsOver(page: Page, ms: number) {
  const before = await draws(page);
  await page.waitForTimeout(ms);
  return (await draws(page)) - before;
}

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

async function phonePage(browser: Browser) {
  const context = await browser.newContext(PHONE);
  return { context, page: await context.newPage() };
}

const POD_ROUTE = `/en/labs/${heroPod.slug}`;

/** A pod deep link opens its drawer at once (phase "room"), so wait for the scene, not for "explore". */
async function openPodRoute(page: Page) {
  await asReturningVisitor(page);
  await page.goto(`${POD_ROUTE}?tier=lite`);
  await waitForHQ(page);
  await waitForSceneLive(page);
}
const openHud = (page: Page, type: string) => page.evaluate((t) => window.dispatchEvent(new CustomEvent("hq:hud", { detail: { type: t } })), type);
const sheetPercent = async (page: Page) => Math.round((((await page.getByTestId("room-drawer").boundingBox())?.height ?? 0) / 844) * 100);

test.describe("rendering pauses while an opaque panel covers the canvas", () => {
  test("phone: the full-screen palette pauses the world, closing it resumes", async ({ browser }) => {
    const { context, page } = await phonePage(browser);
    await countDraws(page);
    await enterHQ(page);
    await expectDrawing(page);
    await openHud(page, "palette");
    await expect(page.getByRole("dialog")).toBeVisible();
    await waitForFrames(page, 3);
    expect(await drawsOver(page, 1000)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expectDrawing(page);
    await context.close();
  });

  test("phone: the full-screen CV viewer pauses the world", async ({ browser }) => {
    const { context, page } = await phonePage(browser);
    await countDraws(page);
    await enterHQ(page);
    await openHud(page, "cv");
    await expect(page.getByTestId("cv-dialog")).toBeVisible();
    await waitForFrames(page, 3);
    expect(await drawsOver(page, 1000)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("cv-dialog")).toBeHidden();
    await expectDrawing(page);
    await context.close();
  });

  test("phone: the world animates behind the 55% sheet and pauses at the 92% snap", async ({ browser }) => {
    const { context, page } = await phonePage(browser);
    await countDraws(page);
    await openPodRoute(page);
    await expect(page.getByTestId("room-drawer")).toBeVisible({ timeout: 90_000 });
    await expect.poll(() => sheetPercent(page)).toBe(55);
    await expectDrawing(page);
    await page.getByTestId("sheet-handle").click();
    await expect.poll(() => sheetPercent(page)).toBe(92);
    await waitForFrames(page, 3);
    expect(await drawsOver(page, 1000)).toBe(0);
    await page.getByTestId("sheet-handle").click();
    await expect.poll(() => sheetPercent(page)).toBe(55);
    await expectDrawing(page);
    await context.close();
  });

  test("desktop: the side drawer and the palette keep the world animated", async ({ page }) => {
    await countDraws(page);
    await openPodRoute(page);
    await expect(page.getByTestId("room-drawer")).toBeVisible({ timeout: 90_000 });
    await expectDrawing(page);
    await openHud(page, "palette");
    await expect(page.getByRole("dialog").last()).toBeVisible();
    await expectDrawing(page);
  });
});
