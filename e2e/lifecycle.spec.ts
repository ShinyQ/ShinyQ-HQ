import { expect, test, type Browser, type Page } from "@playwright/test";
import { asReturningVisitor, enterHQ, waitForCameraSettle, waitForFrames, waitForHQ, waitForSceneLive } from "./hq";
import { heroPod } from "./routes";
import en from "../messages/en.json";

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

/** Counts writes of the persisted store key (works on any build). */
async function countPersistWrites(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __persistWrites: number };
    w.__persistWrites = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key === "hq:v1") w.__persistWrites += 1;
      return setItem.call(this, key, value);
    };
  });
}

type StoreWindow = Window & {
  __persistWrites: number;
  __hq: {
    store: {
      subscribe: (listener: (s: { ride: { stage: string } | null }) => void) => () => void;
      getState: () => { goToFloor: (floor: string) => void };
    };
  };
};

test.describe("store writes", () => {
  test("a parked rover writes neither the store nor localStorage", async ({ page }) => {
    await countPersistWrites(page);
    await enterHQ(page);
    await waitForCameraSettle(page);
    const result = await page.evaluate(
      () =>
        new Promise<{ sets: number; writes: number }>((resolve) => {
          const w = window as unknown as StoreWindow;
          let sets = 0;
          const off = w.__hq.store.subscribe(() => {
            sets += 1;
          });
          const writes = w.__persistWrites;
          setTimeout(() => {
            off();
            resolve({ sets, writes: w.__persistWrites - writes });
          }, 3000);
        }),
    );
    test.info().annotations.push({ type: "measure", description: `parked 3 s: ${result.sets} store sets, ${result.writes} hq:v1 writes` });
    expect(result.writes).toBe(0);
    expect(result.sets).toBeLessThanOrEqual(2);
  });

  test("an elevator ride writes the store per stage, not per frame", async ({ page }) => {
    // The rover first drives to the shaft on SwiftShader.
    test.setTimeout(120_000);
    await countPersistWrites(page);
    await enterHQ(page);
    const result = await page.evaluate(
      () =>
        new Promise<{ sets: number; writes: number }>((resolve) => {
          const w = window as unknown as StoreWindow;
          let sets = 0;
          let riding = false;
          let writes = 0;
          const off = w.__hq.store.subscribe((s) => {
            if (s.ride && s.ride.stage !== "toDoor" && !riding) {
              riding = true;
              writes = w.__persistWrites;
            }
            if (riding) sets += 1;
            if (riding && !s.ride) {
              off();
              resolve({ sets, writes: w.__persistWrites - writes });
            }
          });
          w.__hq.store.getState().goToFloor("L2");
        }),
    );
    test.info().annotations.push({ type: "measure", description: `one L1 to L2 ride from boarding to arrival: ${result.sets} store sets, ${result.writes} hq:v1 writes` });
    expect(result.sets).toBeLessThanOrEqual(30);
    expect(result.writes).toBe(0);
  });
});

test.describe("no backdrop blur under near-opaque panels", () => {
  test("desktop: the drawer does not blur the canvas", async ({ page }) => {
    await openPodRoute(page);
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer).toBeVisible({ timeout: 90_000 });
    expect(await drawer.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe("none");
  });

  test("desktop: the Rover Terminal does not blur the canvas", async ({ page }) => {
    await enterHQ(page);
    await openHud(page, "terminal");
    const terminal = page.getByRole("dialog").last();
    await expect(terminal).toBeVisible();
    expect(await terminal.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe("none");
  });

  test("phone: the full-screen palette's scrim does not blur", async ({ browser }) => {
    const { context, page } = await phonePage(browser);
    await enterHQ(page);
    await openHud(page, "palette");
    await expect(page.getByRole("dialog")).toBeVisible();
    const scrim = page.locator("[aria-hidden='true'].bg-void\\/70");
    expect(await scrim.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe("none");
    await context.close();
  });
});

async function countHqMounts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __hqMounts: number };
    w.__hqMounts = 0;
    // Init scripts run before the parser creates <html>, so observe the document itself.
    new MutationObserver((records) => {
      // The 3D host can arrive inside a wrapper, so count it in every added subtree.
      for (const record of records)
        for (const node of record.addedNodes)
          if (node instanceof HTMLElement) w.__hqMounts += (node.matches("[data-testid=hq]") ? 1 : 0) + node.querySelectorAll("[data-testid=hq]").length;
    }).observe(document, { childList: true, subtree: true });
  });
}

const hqMounts = (page: Page) => page.evaluate(() => (window as unknown as { __hqMounts: number }).__hqMounts);

test.describe("WebGL crash recovery", () => {
  test("a context that cannot be created retries once, then offers Retry 3D without looping", async ({ page }) => {
    await countHqMounts(page);
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith("webgl") && this.closest("[data-testid=hq]")) return null;
        return (getContext as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof getContext;
    });
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite");
    const notice = page.getByRole("status").filter({ hasText: en.hud.staticNotice });
    await expect(notice).toBeVisible({ timeout: 30_000 });
    expect(await hqMounts(page)).toBe(2);
    await test.info().attach("static notice with Retry 3D (desktop)", { body: await page.screenshot(), contentType: "image/png" });
    await page.getByTestId("retry-3d").click();
    await expect.poll(() => hqMounts(page)).toBe(3);
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    expect(await hqMounts(page)).toBe(3);
  });

  test("a 3D chunk that fails to load retries once, then Retry 3D loads it again", async ({ page }) => {
    // The chunk that holds Experience (the only script with its 3D host's test id) fails until it is let through.
    let blocked = true;
    const attempts: string[] = [];
    await page.route("**/_next/static/chunks/*.js", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (!body.includes('"data-testid":"hq"')) return route.fulfill({ response, body });
      attempts.push(route.request().url());
      return blocked ? route.abort("failed") : route.fulfill({ response, body });
    });
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite");
    const notice = page.getByRole("status").filter({ hasText: en.hud.staticNotice });
    await expect(notice).toBeVisible({ timeout: 30_000 });
    // Turbopack retries a network error once by itself, so one gate attempt makes 2 requests: a third proves the
    // automatic remount asked for the chunk again (2 attempts make 4).
    expect(attempts.length).toBeGreaterThanOrEqual(3);
    blocked = false;
    await page.getByTestId("retry-3d").click();
    await waitForHQ(page);
    await expect(notice).toBeHidden();
  });
});
