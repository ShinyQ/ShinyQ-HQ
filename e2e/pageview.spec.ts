import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openPage } from "./hq";
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

for (const [locale, label] of [
  ["en", "Download CV (PDF)"],
  ["id", "Unduh CV (PDF)"],
] as const) {
  test(`/${locale}/cv offers the one CV PDF as a download and an inline preview`, async ({ page }) => {
    await openPage(page, staticTier(`/${locale}/cv`));
    const download = page.getByRole("link", { name: label });
    await expect(download).toHaveAttribute("href", cvPdf);
    await expect(download).toHaveAttribute("download", cvPdf.split("/").pop()!);
    await expect(page.getByTestId("cv-preview")).toHaveAttribute("src", cvPdf);
    await expect(page.locator(`main a[href="${cvPdf}"][target="_blank"]`)).toHaveCount(1);
  });
}

test("every CV link points to the one PDF, in both languages", async ({ page }) => {
  for (const path of ["/en", "/en/contact", "/en/quick", "/id", "/id/contact", "/id/quick"]) {
    await openPage(page, staticTier(path));
    const links = page.locator('main a[href$=".pdf"]');
    expect(await links.count(), path).toBeGreaterThan(0);
    for (const href of await links.evaluateAll((as) => as.map((a) => [a.getAttribute("href"), a.getAttribute("download")]))) {
      expect(href, path).toEqual([cvPdf, cvPdf.split("/").pop()]);
    }
  }
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
