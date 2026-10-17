import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { chooseMotion, asReturningVisitor, waitForCameraSettle, waitForFrames, waitForHQ, waitForPhase } from "./hq";
import { content, heroPod } from "./routes";
import { captureShot, diffShotDirs, type Box } from "./region-diff";
import { LOBBY } from "../src/experience/config";

/** Opt-in (SCREENSHOTS=1): full-page Page View captures for PR review, static tier. */
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 1366 },
  { width: 390, height: 844 },
];

const PAGES = [
  { name: "home", path: "/en" },
  { name: "work", path: "/en/labs" },
  { name: "case", path: `/en/labs/${heroPod.slug}` },
  { name: "journey", path: "/en/journey" },
  { name: "writing", path: "/en/library" },
  { name: "about", path: "/en/contact" },
];

test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to capture screenshots");
test.describe.configure({ timeout: 120_000 });

for (const v of VIEWPORTS) {
  test(`Page View at ${v.width}x${v.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: v, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await chooseMotion(context, "system");
    await context.addInitScript(() => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:onboarded", "done");
    });
    const page = await context.newPage();
    for (const p of PAGES) {
      await page.goto(`${p.path}?tier=static`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      // SwiftShader cannot capture very tall pages (the Journey), so full captures stop at 8000 px.
      const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 8_000);
      const file = `screenshots/pageview/${p.name}-${v.width}x${v.height}`;
      await page.screenshot({ path: `${file}.png`, fullPage: true, clip: { x: 0, y: 0, width: v.width, height } });
      await page.screenshot({ path: `${file}-fold.png` });
    }
    await context.close();
  });
}

/**
 * The landing as a 3D-capable visitor's Page View sees it (Enter the 3D HQ and Back to 3D shown), with
 * Ask on. Motion stays on (the default ticker row) and Playwright stills the animations at their first frame.
 */
const LANDING_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
];

for (const v of LANDING_VIEWPORTS) {
  test(`Landing at ${v.width}x${v.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: v, deviceScaleFactor: 1, reducedMotion: "no-preference" });
    // Classic site stored for the session: the gate stays on the page (no 3D chunk) but the tier is lite.
    await context.addInitScript(() => sessionStorage.setItem("hq:view", "page"));
    const page = await context.newPage();
    await page.route("**/api/ask", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-01", maxLength: 300 }) }),
    );
    await page.goto("/en?tier=lite", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId("enter-hq")).toBeVisible();
    await expect(page.getByTestId("back-to-3d")).toBeVisible({ timeout: 20_000 });
    // Load the lazy featured images before the full capture, then return to the top.
    await page.locator("#work").scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator("#work img").evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).complete))).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    const file = `screenshots/landing/home-${v.width}x${v.height}`;
    await page.screenshot({ path: `${file}-fold.png`, animations: "disabled" });
    const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 8_000);
    await page.screenshot({ path: `${file}.png`, fullPage: true, animations: "disabled", clip: { x: 0, y: 0, width: v.width, height } });
    await context.close();
  });
}

/**
 * R5 P10 accent stripes (opt-in, SCREENSHOTS=1): `P10_SHOTS=before` on main and `P10_SHOTS=after` on the
 * branch capture the same scenes into screenshots/p10/<label>/; `P10_SHOTS=diff` compares them. Each
 * capture lists the elements P10 edits; pixels may only change inside those (padded 24 px for glows).
 */
const P10 = process.env.P10_SHOTS;
const P10_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 2560, height: 1440 },
  { width: 390, height: 844 },
];
const QUOTE_POST = "/id/blog/the-sun-the-moon-and-the-dark-sea";
const CERT_CARDS = "#certifications .card[data-cert-open]";
const ASK_ON = JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-01", maxLength: 300 });
type HQ = { __hq: { store: { getState: () => { openRoom: (room: string) => void } } } };

async function openStatic(page: Page, path: string) {
  // The Ask entry points (the launcher) appear once `GET /api/ask` answers on idle: wait for it, so
  // before and after hold the same state.
  const status = page.waitForResponse((r) => r.url().endsWith("/api/ask") && r.request().method() === "GET", { timeout: 60_000 });
  await page.goto(`${path}?tier=static`, { waitUntil: "networkidle" });
  await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout: 60_000 });
  await status;
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  // Lazy images load before the capture, so before and after hold the same pixels.
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll("img")) img.loading = "eager";
    const settled = (img: HTMLImageElement) =>
      new Promise((done) => {
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        setTimeout(done, 15_000);
      });
    await Promise.all([...document.images].map((img) => (img.complete ? null : settled(img))));
    await document.fonts.ready;
  });
}

type Projector = { __hq: { interact: { project: ((p: { x: number; y: number; z: number }) => { x: number; y: number } | null) | null } } };

/** Screen boxes of the L1 stats tiles (billboards on a ring around the hologram; reduced motion keeps the ring still). */
async function statsTileBoxes(page: Page): Promise<Box[]> {
  const { w, h, y, stagger } = LOBBY.statsTile;
  const count = (content as unknown as { stats: unknown[] }).stats.length;
  const tiles = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + Math.PI / 4;
    return { x: LOBBY.hologram.x + Math.sin(a) * LOBBY.statsRadius, y: y + (i % 2) * stagger, z: LOBBY.hologram.z + Math.cos(a) * LOBBY.statsRadius };
  });
  return page.evaluate(
    ({ tiles, w, h }) => {
      const project = (window as unknown as Projector).__hq.interact.project;
      if (!project) return [];
      return tiles.flatMap((c) => {
        const mid = project(c);
        const up = project({ ...c, y: c.y + 1 });
        if (!mid || !up) return [];
        const s = Math.hypot(up.x - mid.x, up.y - mid.y);
        const hw = (w / 2 + 0.3) * s;
        const hh = (h / 2 + 0.3) * s;
        return [{ x: mid.x - hw, y: mid.y - hh, w: hw * 2, h: hh * 2 }];
      });
    },
    { tiles, w, h },
  );
}

async function scrollToSection(page: Page, id: string) {
  await page.evaluate((target) => {
    const el = document.getElementById(target)!;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200);
  }, id);
}

test.describe("P10 accent stripes", () => {
  test.skip(!P10, "Set P10_SHOTS=before|after|diff");

  for (const v of P10_VIEWPORTS) {
    const tag = `${v.width}x${v.height}`;
    const dir = `screenshots/p10/${P10}`;
    const phone = v.width < 500;

    test(`P10 capture pages ${tag}`, async ({ browser }) => {
      test.skip(P10 === "diff", "diff run");
      test.setTimeout(900_000);
      const context = await browser.newContext({ viewport: v, deviceScaleFactor: 1, reducedMotion: "reduce" });
      await chooseMotion(context, "system");
      await context.addInitScript(() => {
        localStorage.setItem("hq:terminal-seen", "1");
        localStorage.setItem("hq:onboarded", "done");
        localStorage.setItem("hq:hints", "off");
        sessionStorage.setItem("hq:ask-teaser", "1");
        // Bank order: before and after show the same Ask pills.
        sessionStorage.setItem("hq:ask-seed", "order");
      });
      await context.route("**/api/ask", (route) => route.fulfill({ status: 200, contentType: "application/json", body: ASK_ON }));
      const page = await context.newPage();

      await openStatic(page, "/en");
      await captureShot(page, dir, `home-${tag}`, { kind: "page", changes: [CERT_CARDS] });
      await scrollToSection(page, "work");
      await captureShot(page, dir, `home-work-${tag}`, { kind: "viewport" });
      await scrollToSection(page, "certifications");
      await captureShot(page, dir, `home-certs-${tag}`, { kind: "viewport", changes: [CERT_CARDS] });

      await openStatic(page, "/en/labs");
      await captureShot(page, dir, `labs-${tag}`, { kind: "page" });

      await openStatic(page, `/en/labs/${heroPod.slug}`);
      await captureShot(page, dir, `case-${tag}`, { kind: "page", changes: [".pv-toc"] });
      if (v.width >= 1024) {
        await scrollToSection(page, "approach");
        await expect(page.locator(".pv-toc a[aria-current='true']")).toHaveCount(1);
        await captureShot(page, dir, `case-toc-${tag}`, { kind: "viewport", changes: [".pv-toc"] });
      }

      await openStatic(page, "/en/journey");
      await captureShot(page, dir, `journey-${tag}`, { kind: "page" });

      await openStatic(page, "/en/library");
      await captureShot(page, dir, `library-${tag}`, { kind: "page" });

      await openStatic(page, "/en/contact");
      await captureShot(page, dir, `about-${tag}`, { kind: "page", changes: [CERT_CARDS] });

      await openStatic(page, QUOTE_POST);
      await captureShot(page, dir, `quote-${tag}`, { kind: "page", changes: [".prose-hq blockquote"] });

      await openStatic(page, "/en");
      await page.locator(CERT_CARDS).first().click();
      await expect(page.getByTestId("cert-dialog")).toBeVisible();
      await captureShot(page, dir, `cert-dialog-${tag}`, { kind: "viewport", changes: ["[data-testid='cert-dialog']"] });

      await openStatic(page, "/en/journey");
      await page.keyboard.press("Control+k");
      await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await captureShot(page, dir, `palette-${tag}`, { kind: "viewport", changes: ["[role='dialog']:has([role='listbox'])"] });

      await openStatic(page, "/en/labs");
      await page.getByTestId("ask-launcher").click();
      await expect(page.getByTestId("ask-dock")).toBeVisible();
      await captureShot(page, dir, `ask-${tag}`, { kind: "viewport" });
      await context.close();
    });

    // Glass Drawer over the 3D tower (lite tier; phones get touch, as in drawer-solid.spec.ts).
    test(`P10 capture drawer ${tag}`, async ({ browser }) => {
      test.skip(P10 === "diff", "diff run");
      test.setTimeout(600_000);
      const world = await browser.newContext({ viewport: v, deviceScaleFactor: 1, reducedMotion: "reduce", isMobile: phone, hasTouch: phone });
      await chooseMotion(world, "system");
      const p3 = await world.newPage();
      await asReturningVisitor(p3);
      await p3.goto("/en/labs?tier=lite");
      await waitForHQ(p3);
      await waitForPhase(p3, "explore");
      await p3.evaluate((room) => (window as unknown as HQ).__hq.store.getState().openRoom(room), `L3:${heroPod.slug}`);
      const drawer = p3.getByTestId("room-drawer");
      await expect(drawer).toBeVisible();
      await drawer.evaluate((el) => el.querySelectorAll("img").forEach((img) => (img.loading = "eager")));
      await expect.poll(() => drawer.evaluate((el) => [...el.querySelectorAll("img")].every((img) => img.complete)), { timeout: 30_000 }).toBe(true);
      // Let the slide-in settle (same wait as drawer-solid.spec.ts).
      await p3.waitForTimeout(600);
      await captureShot(p3, dir, `drawer-${tag}`, { kind: "element", element: drawer });
      await world.close();
    });

    // L1 stats tiles in 3D (lite and full): only the tiles may change (their top line became a dot).
    for (const tier of ["lite", "full"]) {
      test(`P10 capture stats ${tier} ${tag}`, async ({ browser }) => {
        test.skip(P10 === "diff", "diff run");
        test.setTimeout(1_200_000);
        const lobby = await browser.newContext({ viewport: v, deviceScaleFactor: 1, reducedMotion: "reduce", isMobile: phone, hasTouch: phone });
        await chooseMotion(lobby, "system");
        const p4 = await lobby.newPage();
        await asReturningVisitor(p4);
        await p4.goto(`/en?tier=${tier}`);
        await waitForHQ(p4);
        await waitForPhase(p4, "explore");
        await waitForCameraSettle(p4, { timeout: 900_000 });
        await waitForFrames(p4, 30);
        await captureShot(p4, dir, `stats-${tier}-${tag}`, { kind: "viewport", regions: await statsTileBoxes(p4) });
        await lobby.close();
      });
    }
  }

  test("P10 diff", async ({ page }) => {
    test.skip(P10 !== "diff", "capture run");
    test.setTimeout(900_000);
    // P10_PAIR=a:b diffs two other capture sets (for example after:after2 to measure run-to-run noise).
    const [from, to] = (process.env.P10_PAIR ?? "before:after").split(":");
    const out = from === "before" && to === "after" ? "screenshots/p10/diff" : `screenshots/p10/diff-${from}-${to}`;
    const rows = await diffShotDirs(page, `screenshots/p10/${from}`, `screenshots/p10/${to}`, out, { tolerance: 24, pad: 24 });
    const table = [
      "| Shot | Size | Changed px | Outside edited elements | Ratio |",
      "|---|---|---|---|---|",
      ...rows.map((r) => `| ${r.name} | ${r.sizeMismatch ?? `${r.width}x${r.height}`} | ${r.changed} | ${r.outside} | ${(r.ratio * 100).toFixed(3)}% |`),
    ];
    writeFileSync(`${out}/report.md`, `${table.join("\n")}\n`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.sizeMismatch, `${r.name} changed size (layout shift)`).toBeUndefined();
      expect(r.ratio, `${r.name}: pixels changed outside the edited elements`).toBeLessThanOrEqual(0.0005);
      if (r.expected) expect(r.changed, `${r.name}: the edited elements should look different`).toBeGreaterThan(0);
    }
  });
});
