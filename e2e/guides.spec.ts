import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import guides from "../content/study-guides.json";
import { guidePdf, routeGuides, serveGuides } from "./fixtures/guide-pdf";
import { openPage } from "./hq";

/**
 * Study guide reader (L4 study guides PR 1): the Classic shelf on /library#guides and the certification preview open
 * the in-site pdf.js reader over `/api/guides/*`, answered here by a generated fixture PDF with byte ranges (the
 * R2 Pages Function is unit tested). Every wait is on a data attribute the reader sets, never on time.
 */
test.describe.configure({ timeout: 90_000 });

/** Pages in the fixture PDF: enough for Next, typed jumps, End and Home to land on different pages. */
const PAGES = 5;
const FIRST = guides.guides[0];
const GH600 = guides.guides.find((g) => g.slug === "gh-600")!;

const readerOf = (page: Page) => page.getByTestId("guide-reader");
const slot = (page: Page, n: number) => page.locator(`[data-testid="guide-page"][data-page="${n}"]`);

/** Waits until the reader opened the PDF and drew page `n` (canvas plus text layer). */
async function expectRendered(page: Page, n: number) {
  await expect(readerOf(page)).toHaveAttribute("data-page-count", String(PAGES), { timeout: 30_000 });
  await expect(slot(page, n)).toHaveAttribute("data-rendered", "true", { timeout: 30_000 });
}

async function openShelf(page: Page) {
  const log = await routeGuides(page, PAGES);
  await openPage(page, "/en/library?tier=static#guides");
  return log;
}

/** Read on the first shelf card: the dialog opens and page 1 renders. */
async function openFirst(page: Page): Promise<Locator> {
  const read = page.locator("#guides").getByTestId("guide-read").first();
  await read.click();
  await expect(page.getByRole("dialog", { name: FIRST.title.en })).toBeVisible();
  await expectRendered(page, 1);
  return read;
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("the shelf opens the reader: page 1 renders with its text layer, Next, page input, End and Home, Esc returns focus", async ({ page }) => {
    const log = await openShelf(page);
    await expect(page.locator("#guides").getByTestId("guide-read")).toHaveCount(guides.guides.length);
    const read = await openFirst(page);
    const reader = readerOf(page);
    await expect(slot(page, 1)).toContainText("Fixture page 1");
    await expect(reader).toHaveAttribute("data-current-page", "1");
    // pdf.js read the fixture by byte ranges after the first request.
    expect(log.requests.map((r) => r.status)).toContain(206);

    await page.getByTestId("guide-next").click();
    await expect(reader).toHaveAttribute("data-current-page", "2");
    await expectRendered(page, 2);

    const input = page.getByTestId("guide-page-input");
    await input.fill("3");
    await input.press("Enter");
    await expect(reader).toHaveAttribute("data-current-page", "3");
    await expectRendered(page, 3);
    await expect(slot(page, 3)).toContainText("Fixture page 3");

    await page.getByTestId("guide-pages").focus();
    await page.keyboard.press("End");
    await expect(reader).toHaveAttribute("data-current-page", String(PAGES));
    await page.keyboard.press("Home");
    await expect(reader).toHaveAttribute("data-current-page", "1");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("guide-dialog")).toHaveCount(0);
    await expect(read).toBeFocused();
  });

  test("open, chapters and download stay in the page: a same-origin PDF attachment, no new tab", async ({ page, context, baseURL }) => {
    // Real HTTP, not page.route: Chromium fetches an `<a download>` outside request interception (see serveGuides).
    const server = await serveGuides(baseURL!, PAGES);
    try {
      let opened = 0;
      context.on("page", () => opened++);
      await openPage(page, `${server.origin}/en/library?tier=static#guides`);
      const card = page.locator("#guides li").filter({ has: page.getByTestId("guide-read") }).first();
      const shelfDownload = card.locator("a[download]");
      await expect(shelfDownload).toHaveAttribute("download", FIRST.file);
      await openFirst(page);

      await page.getByTestId("guide-chapters").click();
      const chapters = page.getByTestId("guide-chapter-list");
      await expect(chapters.getByRole("button")).toHaveCount(PAGES);
      await chapters.getByRole("button", { name: "Chapter 4" }).click();
      await expect(chapters).toHaveCount(0);
      await expect(readerOf(page)).toHaveAttribute("data-current-page", "4");
      await expectRendered(page, 4);

      const download = page.getByTestId("guide-download");
      for (const anchor of [download, shelfDownload]) {
        await expect(anchor).toHaveAttribute("download", FIRST.file);
        expect(await anchor.getAttribute("target")).toBeNull();
        const href = new URL((await anchor.getAttribute("href"))!, page.url());
        expect(href.origin).toBe(new URL(page.url()).origin);
        expect(href.pathname).toBe(`/api/guides/${FIRST.slug}`);
        expect(href.searchParams.get("download")).toBe("1");
      }
      expect(server.requests.some((r) => new URL(r.url).searchParams.has("download"))).toBe(false);

      const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
      expect(await file.failure()).toBeNull();
      const bytes = readFileSync(await file.path());
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(bytes.equals(Buffer.from(guidePdf(PAGES)))).toBe(true);
      expect(file.suggestedFilename()).toBe(FIRST.file);

      const served = server.requests.filter((r) => new URL(r.url).searchParams.get("download") === "1");
      expect(served).toHaveLength(1);
      expect(new URL(served[0].url).pathname).toBe(`/api/guides/${FIRST.slug}`);
      expect(served[0].status).toBe(200);
      expect(served[0].disposition).toBe(`attachment; filename="${FIRST.file}"`);
      expect(served[0].body.equals(bytes)).toBe(true);

      await expect(page.getByTestId("guide-dialog")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/en/library");
      expect(opened).toBe(0);
      expect(context.pages()).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  test("a PDF that fails to load shows the error alert, and Retry renders page 1 once the guide answers", async ({ page }) => {
    await openShelf(page);
    let broken = true;
    // Registered after routeGuides, so it answers first; `fallback` hands the request to the fixture route.
    await page.route("**/api/guides/**", (route) =>
      broken ? route.fulfill({ status: 500, contentType: "text/plain", body: "Upstream error" }) : route.fallback(),
    );
    await page.locator("#guides").getByTestId("guide-read").first().click();
    const dialog = page.getByRole("dialog", { name: FIRST.title.en });
    await expect(dialog.getByRole("alert")).toContainText("could not be opened", { timeout: 30_000 });
    await expect(dialog.getByTestId("guide-download")).toBeVisible();
    broken = false;
    await dialog.getByTestId("guide-retry").click();
    await expectRendered(page, 1);
    await expect(slot(page, 1)).toContainText("Fixture page 1");
    await expect(dialog.getByRole("alert")).toHaveCount(0);
  });

  test("a pdf.js worker that fails to load shows the error alert at once, and Retry starts a new worker", async ({ page }) => {
    await openShelf(page);
    let broken = true;
    let blocked = 0;
    // Turbopack's worker entry script: a 404 fires the Worker's `error`, which pdf.js itself never listens for.
    await page.route("**/_next/static/chunks/turbopack-worker-*.js", (route) => {
      if (!broken) return route.fallback();
      blocked++;
      return route.fulfill({ status: 404, body: "" });
    });
    await page.locator("#guides").getByTestId("guide-read").first().click();
    const dialog = page.getByRole("dialog", { name: FIRST.title.en });
    await expect(dialog.getByRole("alert")).toContainText("could not be opened", { timeout: 20_000 });
    expect(blocked, "the worker entry was never requested: did its chunk name change?").toBeGreaterThan(0);
    broken = false;
    await dialog.getByTestId("guide-retry").click();
    await expectRendered(page, 1);
  });

  test("a certification preview opens its study guide in the reader", async ({ page }) => {
    await routeGuides(page, PAGES);
    await openPage(page, "/en/contact?tier=static");
    const card = page.locator(`#certifications [data-cert-open="${GH600.certId}"]`).first();
    await card.click();
    const cert = page.getByTestId("cert-dialog");
    await expect(cert).toBeVisible();
    await cert.getByTestId("cert-read-guide").click();
    const dialog = page.getByRole("dialog", { name: GH600.title.en });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("cert-dialog")).toHaveCount(0);
    await expectRendered(page, 1);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("guide-dialog")).toHaveCount(0);
    await expect(card).toBeFocused();
  });

  test("reopening a guide resumes at the last page read", async ({ page }) => {
    await openShelf(page);
    const read = await openFirst(page);
    await page.getByTestId("guide-page-input").fill("4");
    await page.getByTestId("guide-page-input").press("Enter");
    await expect(readerOf(page)).toHaveAttribute("data-current-page", "4");
    await page.getByTestId("guide-close").click();
    await expect(page.getByTestId("guide-dialog")).toHaveCount(0);

    await read.click();
    await expect(readerOf(page)).toHaveAttribute("data-current-page", "4", { timeout: 30_000 });
    await expectRendered(page, 4);
  });

  test("the open reader has no accessibility violations", async ({ page }) => {
    await openShelf(page);
    await openFirst(page);
    await expectRendered(page, 2);
    const results = await new AxeBuilder({ page }).include("[data-testid='guide-dialog']").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

test("phone: the reader fills the viewport and hides the thumbnail rail", async ({ browser }) => {
  const viewport = { width: 390, height: 844 };
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await openShelf(page);
  await page.locator("#guides").getByTestId("guide-read").first().tap();
  await expectRendered(page, 1);
  await expect(page.getByTestId("guide-thumbs")).toBeHidden();
  await expect.poll(() => page.getByTestId("guide-dialog").boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
  await expect(page.getByTestId("guide-close")).toBeVisible();
  await page.getByTestId("guide-next").tap();
  await expect(readerOf(page)).toHaveAttribute("data-current-page", "2");
  await context.close();
});
