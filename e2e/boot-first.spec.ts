import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { addScriptPolicy, sitePolicy } from "../scripts/csp-policy";
import { asHumanBrowser, asReturningVisitor, collectErrors, waitForHQ } from "./hq";
import data from "../content/site-content.json";
import en from "../messages/en.json";

test.describe.configure({ timeout: 90_000 });

/**
 * Samples every animation frame from document creation (before the inline head script runs) and
 * records frames where the Page View shell is visible while the 3D HQ is not mounted yet.
 */
async function recordShellFlash(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __flash: string[]; __frames: number };
    w.__flash = [];
    w.__frames = 0;
    const tick = () => {
      w.__frames++;
      const shell = document.getElementById("site-shell");
      if (shell && !document.querySelector("[data-testid='hq']") && getComputedStyle(shell).visibility !== "hidden") {
        w.__flash.push(`${Math.round(performance.now())}ms`);
      }
      if (w.__frames < 2000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

test("3D-capable visit never shows the Page View before the HQ", async ({ page }) => {
  const errors = collectErrors(page);
  await recordShellFlash(page);
  await page.goto("/en?tier=lite", { waitUntil: "commit" });
  await page.waitForSelector("#hq-boot-cover", { state: "attached" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBe("1");
  await expect(page.locator("#site-shell")).toBeHidden();
  await expect(page.getByTestId("boot-cover")).toBeVisible();
  await expect(page.getByTestId("hq")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).not.toHaveAttribute("data-hq-boot", "1", { timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("data-hq-boot-released", "ready");
  await expect(page.getByTestId("boot-cover")).toBeHidden();
  // The 3D boot overlay takes over with the same card.
  await expect(page.getByTestId("boot")).toBeVisible();
  const flash = await page.evaluate(() => (window as unknown as { __flash: string[] }).__flash);
  expect(flash).toEqual([]);
  expect(errors).toEqual([]);
});

test("static tier and stored classic site show the page immediately", async ({ page }) => {
  await page.goto("/en?tier=static", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("hq:view", "page"));
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
  await expect(page.getByTestId("boot-cover")).toBeHidden();
});

test("a software renderer falls back to the page once the tier is known", async ({ page }) => {
  // No ?tier= override: SwiftShader maps to the static tier, so the probe releases the cover.
  await asHumanBrowser(page);
  await page.goto("/en", { waitUntil: "commit" });
  await page.waitForSelector("#hq-boot-cover", { state: "attached" });
  await expect(page.locator("#site-shell")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("data-hq-boot-released", "static");
  await expect(page.getByTestId("hq")).toHaveCount(0);
  // The verdict is remembered for the session: the next page shows at once, without the cover.
  await page.goto("/en/labs", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
});

test("crawlers and Lighthouse get the page without the cover", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Chrome-Lighthouse" });
  const page = await context.newPage();
  await page.goto("/en?tier=lite", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
  await context.close();
});

test("a crawler never gets the 3D HQ, even with a tier override", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
  const page = await context.newPage();
  await page.goto("/en?tier=lite", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.getByTestId("hq")).toHaveCount(0);
  expect(await page.evaluate(() => "__hq" in window)).toBe(false);
  await context.close();
});

test("automation without a tier override stays on the page; with one it gets 3D", async ({ page }) => {
  // navigator.webdriver is true under Playwright, as under Lighthouse 12.
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(page.getByTestId("hq")).toHaveCount(0);
  await page.goto("/en?tier=lite", { waitUntil: "commit" });
  await expect(page.getByTestId("hq")).toBeVisible({ timeout: 30_000 });
});

test("non-gated pages are unaffected", async ({ page }) => {
  await page.goto("/en/quick", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
});

test("a software renderer still offers Enter the 3D HQ, which forces the lite tier", async ({ page }) => {
  // No ?tier= override: SwiftShader maps to the static tier, so the page shows; WebGL2 exists, so the offer stays.
  await asHumanBrowser(page);
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("data-hq-boot-released", "static", { timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("data-hq-3d", "1");
  const enter = page.getByRole("link", { name: en.home.hero.enter3d });
  await expect(enter).toBeVisible();
  await enter.click();
  await expect(page).toHaveURL(/\/en\?tier=lite$/);
  await waitForHQ(page);
});

/** Records when the first 3D frame released the cover, in performance.now() time. */
async function recordRelease(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __released?: number };
    // Init scripts run before <html> exists: observe the document (subtree) instead of documentElement.
    new MutationObserver(() => {
      if (w.__released === undefined && document.documentElement?.getAttribute("data-hq-boot-released") === "ready") w.__released = performance.now();
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-hq-boot-released"] });
  });
}

/**
 * Lengthens the head script's 8 s safety timeout for this document: on a loaded machine SwiftShader can
 * take longer than that to draw the first frame, and a timeout release shows the page (whose images then
 * load legitimately), which is not what these tests measure. The edited script gets a new sha256, so the
 * page's script policy is rebuilt the way the build writes it (scripts/csp-hashes.ts); otherwise the
 * browser would block the head script.
 */
async function patientBootCover(page: Page, url: RegExp) {
  const site = sitePolicy(readFileSync(path.join(process.cwd(), "out", "_headers"), "utf8"));
  await page.route(url, async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback();
    const response = await route.fetch();
    const html = await response.text();
    expect(html).toContain('off("timeout")},8000');
    const body = addScriptPolicy(html.replace('off("timeout")},8000', 'off("timeout")},120000'), site);
    await route.fulfill({ response, body });
  });
}

type Timing = { path: string; start: number; end: number };
const timings = (page: Page) =>
  page.evaluate(() =>
    performance.getEntriesByType("resource").map((e) => {
      const r = e as PerformanceResourceTiming;
      return { path: new URL(r.name).pathname, start: r.startTime, end: r.responseEnd };
    }),
  );

for (const visitor of ["first", "returning"] as const) {
  test(`quiet boot (${visitor} visit): no Page View media, link prefetch or room data before the first frame`, async ({ page }) => {
    test.setTimeout(200_000);
    // A returning visitor opens straight in explore, so the HUD (and its room drawer) mounts with the
    // canvas; on a first visit the HUD waits for Boot rover.
    if (visitor === "returning") await asReturningVisitor(page);
    await recordRelease(page);
    await patientBootCover(page, /\/en\?tier=lite$/);
    await page.goto("/en?tier=lite", { waitUntil: "commit" });
    await expect(page.locator("html")).toHaveAttribute("data-hq-boot-released", "ready", { timeout: 120_000 });
    const released = await page.evaluate(() => (window as unknown as { __released?: number }).__released);
    expect(released).toBeGreaterThan(0);
    // Room data loads after the frame (idle, at most 2 s later; a loaded machine can block the main thread far longer).
    if (visitor === "returning") await expect.poll(async () => (await timings(page)).some((t) => t.path.startsWith("/data/rooms/")), { timeout: 60_000 }).toBe(true);
    const all: Timing[] = await timings(page);
    const before = all.filter((t) => t.start < released!).map((t) => t.path);
    // The 3D HUD's own images (the profile card's owner photo, P6) belong to the first frame; only Page View images count.
    const hudImages = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>("[data-testid='hq'] img")].map((img) => new URL(img.currentSrc || img.src).pathname),
    );
    expect(before.filter((p) => !hudImages.includes(p) && (/^\/(media|tech|logos|floors)\//.test(p) || p.startsWith("/brand/kurniadi")))).toEqual([]);
    expect(before.filter((p) => p.endsWith(".txt"))).toEqual([]);
    expect(before.filter((p) => p.startsWith("/data/rooms/"))).toEqual([]);
    // Troika fonts never compete with the 3D JavaScript: they start after the last chunk before the frame finished.
    const lastChunkBeforeFrame = Math.max(...all.filter((t) => t.path.endsWith(".js") && t.end < released!).map((t) => t.end));
    for (const font of all.filter((t) => t.path.startsWith("/fonts/3d/"))) expect(font.start, font.path).toBeGreaterThanOrEqual(lastChunkBeforeFrame - 1);
  });
}

test("quiet boot: the timeout release shows the skipped page without layout shift and loads its images", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await asHumanBrowser(page);
  // No Next.js chunk: nothing releases the cover, so the head script's 8 s timeout does (content-visibility hidden to visible).
  await page.route("**/_next/static/chunks/**/*.js", (route) => route.abort());
  await page.goto("/en?tier=lite", { waitUntil: "commit" });
  await expect(page.locator("html")).toHaveAttribute("data-hq-boot-released", "timeout", { timeout: 15_000 });
  await expect(page.locator("#site-shell")).toBeVisible();
  await page.locator("#work").scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator("#work img").first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
});

test("boot card: who the owner is at first paint, and Classic site works before any JavaScript", async ({ page }) => {
  await asHumanBrowser(page);
  await page.route("**/_next/static/chunks/**/*.js", (route) => route.abort());
  await page.goto("/en?tier=lite", { waitUntil: "domcontentloaded" });
  const cover = page.getByTestId("boot-cover");
  const who = cover.getByTestId("boot-who");
  await expect(who).toBeVisible();
  for (const text of [data.profile.name, data.profile.headline.en, data.profile.subheadline.en, data.profile.currentRole.org]) await expect(who).toContainText(text);
  await cover.getByRole("link", { name: en.hud.pageView }).click();
  await expect(page).toHaveURL(/\/en$/);
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("hq:view"))).toBe("page");
});

test("boot card: the overlay keeps the card in place, Boot rover stays required, Classic site leaves 3D without a reload", async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/en?tier=lite", { waitUntil: "commit" });
  const coverCard = page.getByTestId("boot-cover").locator(".hq-boot-card");
  await expect(coverCard).toBeVisible();
  const coverBox = (await coverCard.boundingBox())!;
  await expect(page.getByTestId("boot")).toBeVisible({ timeout: 60_000 });
  const overlayBox = (await page.getByTestId("boot").locator(".hq-boot-card").boundingBox())!;
  for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(overlayBox[k] - coverBox[k]), k).toBeLessThanOrEqual(1);
  await page.waitForTimeout(1500); // proves the intro never starts without the Boot rover click
  expect(await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { phase: string } } } }).__hq.store.getState().phase)).toBe("boot");
  await page.evaluate(() => ((window as unknown as { __sameDocument: boolean }).__sameDocument = true));
  await page.getByTestId("boot").getByRole("link", { name: en.hud.pageView }).click();
  await expect(page.getByTestId("hq")).toHaveCount(0);
  await expect(page.locator("#site-shell")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
  expect(page.url()).toMatch(/\/en\?tier=lite$/);
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
  expect(errors).toEqual([]);
});
