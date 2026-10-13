import { expect, test, type Page } from "@playwright/test";
import { enterHQ, waitForFrames } from "./hq";

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
