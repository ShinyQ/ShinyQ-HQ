import { expect, test } from "@playwright/test";
import { collectErrors, enterHQ, fastAnimations, interactablesOf, skipFloorLines, waitForFrames } from "./hq";

/**
 * Owner report 2026-10-24: on a tablet the L1 Lobby stayed empty. Some GPUs fail webgl-sdf-generator's
 * 4x4 trial run, so troika generates glyph SDFs with its JS fallback. That fallback used blob: workers,
 * which WebKit accepts and then refuses under the site CSP: no 3D text ever finished and every L1 piece
 * waiting on its text stayed hidden. `src/experience/text-config.ts` refuses blob: workers at
 * construction, so troika runs the fallback on the main thread. This spec forces the trial run to fail.
 */
test.describe.configure({ timeout: 150_000 });

test.beforeEach(({ context }) => fastAnimations(context));

test("the L1 Lobby renders on a GPU that fails the SDF trial run (tablet, lite)", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await fastAnimations(context);
  const page = await context.newPage();
  const logs: string[] = [];
  page.on("console", (msg) => logs.push(msg.text()));
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    // webgl-sdf-generator checks a 4x4 trial render on a WebGL1 context; one changed value fails it.
    const read = WebGLRenderingContext.prototype.readPixels;
    WebGLRenderingContext.prototype.readPixels = function (this: WebGLRenderingContext, ...args: Parameters<WebGLRenderingContext["readPixels"]>) {
      read.apply(this, args);
      const [, , w, h, , , pixels] = args;
      if (w === 4 && h === 4 && pixels && "length" in pixels && pixels.length === 64) (pixels as Uint8Array)[0] = ((pixels as Uint8Array)[0] + 1) & 255;
    } as WebGLRenderingContext["readPixels"];
  });
  await skipFloorLines(page);
  await enterHQ(page);

  await expect.poll(() => logs.some((line) => /bad trial run results/.test(line)), { timeout: 30_000 }).toBe(true);
  // The Lobby's data-driven pieces mount once their texts are typeset: the room targets register.
  await expect
    .poll(async () => new Set((await interactablesOf(page)).map((item) => item.action.room).filter((room) => room?.startsWith("L1:"))).size, { timeout: 60_000 })
    .toBeGreaterThanOrEqual(3);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __hq: { ridePrep: { texts: Map<string, number> } } }).__hq.ridePrep.texts.get("L1") ?? 0), { timeout: 60_000 }).toBe(0);
  await waitForFrames(page, 10);
  expect(logs.filter((line) => /blob:|init function failed to rehydrate|did not return a callable/.test(line))).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});
