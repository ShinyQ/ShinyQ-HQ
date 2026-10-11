import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openPage } from "./hq";
import cvManifest from "../content/generated/cv-pages.json";
import { content, firstEntry, heroPod, hostedPost } from "./routes";

/** Every Page View template, on the static tier so the HTML page is what renders. */
const TEMPLATES = [
  "/en",
  "/en/labs",
  `/en/labs/${heroPod.slug}`,
  "/en/journey",
  `/en/journey/${firstEntry.slug}`,
  "/en/library",
  ...(hostedPost ? [`/en/blog/${hostedPost.slug}`] : []),
  "/en/contact",
  "/en/quick",
  "/en/cv",
  "/id",
  "/id/labs",
];

const staticTier = (path: string) => `${path}${path.includes("?") ? "&" : "?"}tier=static`;

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const path of TEMPLATES) {
  test(`axe: ${path}`, async ({ page }) => {
    await openPage(page, staticTier(path));
    await expect(page.locator("h1").first()).toBeVisible();
    await expectNoSeriousViolations(page);
  });
}

test("the main nav marks the current section on child routes", async ({ page }) => {
  await openPage(page, staticTier(`/en/labs/${heroPod.slug}`));
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link", { name: /Work/ })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: /Journey/ })).not.toHaveAttribute("aria-current", "page");
});

test("phones get the section tabs instead of the desktop nav", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await openPage(page, staticTier("/en/library"));
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Writing" })).toHaveAttribute("aria-current", "page");
  await page.close();
});

test("Work filters by wing and stack, keeps ?tier and survives a reload", async ({ page }) => {
  const pods = content.floors.labs.pods;
  const ai = pods.filter((p) => p.wing === "ai").length;
  await openPage(page, staticTier("/en/labs"));
  const status = page.getByRole("search", { name: "Filter projects" }).getByRole("status");
  await expect(status).toHaveText(`Showing ${pods.length} of ${pods.length}`);
  await page.getByRole("button", { name: /^AI/ }).click();
  await expect(page).toHaveURL(/\?tier=static&wing=ai$/);
  await expect(status).toHaveText(`Showing ${ai} of ${pods.length}`);
  await expect(page.locator("[data-pod][data-wing='software']").first()).toBeHidden();
  await page.getByRole("combobox", { name: "Stack" }).selectOption("FastAPI");
  await expect(page).toHaveURL(/stack=FastAPI/);
  await page.reload();
  await expect(page.getByRole("button", { name: /^AI/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "Stack" })).toHaveValue("FastAPI");
});

test("Journey type filter hides other entries and empty years", async ({ page }) => {
  await openPage(page, staticTier("/en/journey"));
  await page.getByRole("button", { name: /^Awards/ }).click();
  await expect(page).toHaveURL(/type=award/);
  await expect(page.locator("[data-entry][data-type='job']").first()).toBeHidden();
  await expect(page.locator("[data-entry][data-type='award']").first()).toBeVisible();
  await expect(page.locator("#y2026")).toBeHidden();
});

test("case study keeps its anchors and table of contents", async ({ page }) => {
  await openPage(page, staticTier(`/en/labs/${heroPod.slug}`));
  for (const id of ["results", "problem", "approach", "architecture", "stack"]) await expect(page.locator(`#${id}`)).toBeAttached();
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Problem" })).toHaveAttribute("href", "#problem");
});

test("Home keeps the deep-link anchors used by the room catalog", async ({ page }) => {
  await openPage(page, staticTier("/en"));
  for (const id of ["stats", "skills", "certifications"]) await expect(page.locator(`#${id}`)).toBeAttached();
  await openPage(page, staticTier("/en/contact"));
  for (const id of ["cv", "channels"]) await expect(page.locator(`#${id}`)).toBeAttached();
});

const cvPdf = `/cv/${content.floors.roof.cv.fileName}.pdf`;
const cvPages = (cvManifest as { pages: { src: string }[] }).pages;

for (const [locale, label] of [
  ["en", "Download PDF"],
  ["id", "Unduh PDF"],
] as const) {
  test(`/${locale}/cv shows the CV as page images with a PDF download and an open-in-new-tab link`, async ({ page }) => {
    await openPage(page, staticTier(`/${locale}/cv`));
    const viewer = page.getByTestId("cv-viewer-page");
    const download = viewer.getByRole("link", { name: label });
    await expect(download).toHaveAttribute("href", cvPdf);
    await expect(download).toHaveAttribute("download", cvPdf.split("/").pop()!);
    await expect(viewer.getByRole("img")).toHaveCount(cvPages.length);
    const first = viewer.getByRole("img").first();
    await expect(first).toHaveAttribute("src", cvPages[0].src);
    await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator(`main a[href="${cvPdf}"][target="_blank"]`)).toHaveCount(2);
    await expect(page.locator("main iframe")).toHaveCount(0);
  });
}

test("every CV entry point opens the CV viewer modal instead of downloading, in both languages", async ({ page }) => {
  for (const path of ["/en", "/en/contact", "/en/quick", "/id", "/id/contact", "/id/quick"]) {
    await openPage(page, staticTier(path));
    await expect(page.locator('main a[href$=".pdf"]'), path).toHaveCount(0);
    const entries = page.locator("#site-shell [data-testid^='cv-open']");
    expect(await entries.count(), path).toBeGreaterThan(1);
    for (const entry of await entries.all()) {
      if (!(await entry.isVisible())) continue;
      await entry.click();
      const dialog = page.getByRole("dialog", { name: "CV", exact: true });
      await expect(dialog, path).toBeVisible();
      await expect(dialog.getByRole("img")).toHaveCount(cvPages.length);
      await expect(page).toHaveURL(new RegExp(`${path}\\?tier=static`));
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(entry).toBeFocused();
    }
  }
});

test("the CV modal passes axe and zooms with the keyboard", async ({ page }) => {
  await openPage(page, staticTier("/en/contact"));
  await page.locator("main [data-testid='cv-open']").click();
  const dialog = page.getByRole("dialog", { name: "CV", exact: true });
  await expect(dialog.getByRole("button", { name: "Close CV" })).toBeFocused();
  await page.keyboard.press("+");
  await expect(dialog.getByTestId("cv-zoom")).toHaveText(/125%/);
  const results = await new AxeBuilder({ page }).include("[data-testid='cv-dialog']").analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

test("no horizontal overflow on a 390 px phone", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const path of TEMPLATES) {
    await openPage(page, staticTier(path));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.close();
});
