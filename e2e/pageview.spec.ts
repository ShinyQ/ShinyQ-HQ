import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { openPage } from "./hq";
import { findEdgeAccents } from "./edge-audit";
import cvManifest from "../content/generated/cv-pages.json";
import { content, firstEntry, heroPod, hostedPost, livePods } from "./routes";
import data from "../content/site-content.json";
import en from "../messages/en.json";
import { perspectiveFingerprints } from "../src/content/perspectives";
import { PerspectivesFileSchema } from "../src/content/schema";
import { scanBuildOutput } from "../src/content/safety";

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
  await page.addInitScript(() => {
    localStorage.setItem("hq:terminal-seen", "1");
    localStorage.setItem("hq:onboarded", "done");
  });
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
    await expect(page.locator('main a[href^="/cv/"][href$=".pdf"]'), path).toHaveCount(0);
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

const firstCert = [...data.certifications].filter((c) => c.status === "earned" && c.code).sort((a, b) => b.issued.localeCompare(a.issued))[0];

test("certifications open the in-site preview card (no frame), keyboard first", async ({ page }) => {
  await openPage(page, staticTier("/en"));
  const section = page.locator("#certifications");
  await expect(section.locator("[data-cert-open]")).toHaveCount(data.certifications.length);
  await expect(section).not.toContainText(/verified/i);
  const card = section.locator(`[data-cert-open="${firstCert.id}"]`);
  await card.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: firstCert.name });
  await expect(dialog).toBeVisible();
  const open = dialog.getByRole("link", { name: /Open credential/ });
  await expect(open).toHaveAttribute("href", firstCert.credentialUrl!);
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expectNoSeriousViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card).toBeFocused();
});

test("the Indonesian preview card is localized", async ({ page }) => {
  await openPage(page, staticTier("/id/contact"));
  await page.locator(`#certifications [data-cert-open="${firstCert.id}"]`).first().click();
  const dialog = page.getByRole("dialog", { name: firstCert.name });
  await expect(dialog.getByRole("link", { name: /Buka kredensial/ })).toBeVisible();
  await expect(dialog).toContainText("Diraih");
  await dialog.getByRole("button", { name: "Tutup" }).click();
  await expect(dialog).toBeHidden();
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

/** Sum of layout shifts since navigation (buffered), observed for `ms`. */
async function layoutShiftOver(page: Page, ms: number) {
  return page.evaluate(
    (wait) =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
            if (!entry.hadRecentInput) total += entry.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve(total), wait);
      }),
    ms,
  );
}

const ASK_ON = { enabled: true, turnstileSiteKey: null, asOf: "2026-10-01", maxLength: 300 };

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
]) {
  test(`landing: the hero owns the first screen on a first visit at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    // Fresh context: a first visit (no hq:terminal-seen) with motion on.
    const context = await browser.newContext({ viewport, reducedMotion: "no-preference" });
    const page = await context.newPage();
    await page.route("**/api/ask", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ASK_ON) }));
    await openPage(page, "/en?tier=static");
    const name = page.getByRole("heading", { level: 1, name: data.profile.name });
    await expect(name).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("textbox", { name: en.ask.hero.label })).toBeInViewport();
    expect(await layoutShiftOver(page, 2500)).toBeLessThan(0.01);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const covered = await name.evaluate((h1) => {
      const r = h1.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !h1.contains(hit);
    });
    expect(covered).toBe(false);
    await context.close();
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1999, height: 1129 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
]) {
  test(`landing hero at ${viewport.width}x${viewport.height}: no eyebrow, a one-step smaller name, the motto`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await openPage(page, staticTier("/en"));
    const hero = page.locator("section[aria-labelledby='hero-title']");
    await expect(hero).not.toContainText(/Welcome to/i);
    await expect(hero.getByText(data.profile.subheadline.en)).toBeVisible();
    // clamp(44px, 8vw, 112px): vw is the layout viewport width (window.innerWidth).
    const { size, expected } = await page.locator("#hero-title").evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), expected: Math.min(112, Math.max(44, window.innerWidth * 0.08)) }));
    expect(Math.abs(size - expected)).toBeLessThanOrEqual(0.5);
    await context.close();
  });
}

test("landing: the hero name is still the LCP element on a phone", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: string };
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1) as unknown as { element?: Element };
      w.__lcp = last?.element?.id || last?.element?.tagName || "";
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await openPage(page, staticTier("/en"));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __lcp: string }).__lcp)).toBe("hero-title");
  await context.close();
});

/**
 * The chosen image source is at least as wide as its rendered width times the device pixel ratio.
 * `naturalWidth` of a `srcset` image is density-corrected (CSS pixels), so the source's own pixel width is
 * read from a plain image of `currentSrc` (cached, no second request).
 */
async function expectSharp(img: Locator) {
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const r = await img.evaluate(async (el: HTMLImageElement) => {
    const source = new Image();
    source.src = el.currentSrc;
    await source.decode();
    return { natural: source.naturalWidth, rendered: el.getBoundingClientRect().width, dpr: devicePixelRatio, src: el.currentSrc };
  });
  expect(r.natural, r.src).toBeGreaterThanOrEqual(Math.floor(r.rendered * r.dpr));
}

for (const v of [
  { viewport: { width: 1440, height: 900 }, dpr: 2 },
  { viewport: { width: 390, height: 844 }, dpr: 3 },
]) {
  test(`portrait beside the name and on About at ${v.viewport.width}x${v.viewport.height}@${v.dpr}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.dpr });
    const page = await context.newPage();
    for (const url of ["/en", "/en/contact"]) {
      await openPage(page, staticTier(url));
      const img = page.locator("main").getByTestId("portrait");
      await expect(img).toHaveAttribute("alt", data.profile.name);
      await expect(img).toBeVisible();
      const round = await img.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) >= el.getBoundingClientRect().width / 2 - 1);
      expect(round, url).toBe(true);
      await expectSharp(img);
    }
    await context.close();
  });
}

test("landing: three featured projects with their screenshots, the stats ticker, and no 3D offer on the static tier", async ({ page }) => {
  await openPage(page, staticTier("/en"));
  const cards = page.locator("#work [data-feature-pod]");
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    const slug = (await card.getAttribute("data-feature-pod"))!;
    const pod = data.floors.labs.pods.find((p) => p.slug === slug)!;
    expect(pod.assets.length).toBeGreaterThan(0);
    await expect(card.getByRole("link", { name: pod.title.en })).toHaveAttribute("href", `/en/labs/${slug}`);
    await expect(card.locator("img").first()).toHaveAttribute("src", pod.assets[0].src);
  }
  const ticker = page.getByRole("region", { name: en.home.statsTitle });
  await expect(ticker).toHaveAttribute("id", "stats");
  for (const stat of data.stats) await expect(ticker.getByRole("listitem").filter({ hasText: stat.label.en })).toHaveCount(1);
  await expect(page.getByTestId("enter-hq")).toBeHidden();
});

const columnsFor = (width: number) => (width >= 1024 ? 3 : width >= 768 ? 2 : 1);

/**
 * Cards in a grid: same top and bottom within each row, same width, and with two or more columns the same
 * height everywhere. A single phone column keeps each card's own height (equal rows there only add blank space).
 */
async function expectAlignedGrid(page: Page, selector: string, columns: number) {
  const boxes = await page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top + scrollY, bottom: r.bottom + scrollY, width: r.width };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (let i = 0; i < boxes.length; i += columns) {
    const row = boxes.slice(i, i + columns);
    for (const b of row) {
      expect(Math.abs(b.top - row[0].top), `${selector} row ${i / columns} top`).toBeLessThanOrEqual(1);
      expect(Math.abs(b.bottom - row[0].bottom), `${selector} row ${i / columns} bottom`).toBeLessThanOrEqual(1);
    }
  }
  for (const b of boxes) {
    expect(Math.abs(b.width - boxes[0].width), `${selector} width`).toBeLessThanOrEqual(1);
    if (columns > 1) expect(Math.abs(b.bottom - b.top - (boxes[0].bottom - boxes[0].top)), `${selector} height`).toBeLessThanOrEqual(1);
  }
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1999, height: 1129 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
]) {
  test(`landing: featured cards line up with their screenshots at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await openPage(page, staticTier("/en"));
    // Below the first screen, so lazy images never compete with the hero for LCP.
    expect(await page.locator("#work").evaluate((el) => el.getBoundingClientRect().top >= window.innerHeight - 1)).toBe(true);
    await expectAlignedGrid(page, "#work [data-feature-pod]", columnsFor(viewport.width));
    for (const card of await page.locator("#work [data-feature-pod]").all()) {
      const cover = card.locator(".pv-shot img");
      await cover.scrollIntoViewIfNeeded();
      await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    }
    // "More key projects" rows span the full list width (no side gap).
    const rows = await page
      .locator("#work .pv-rows > li")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width));
    for (const ratio of rows) expect(ratio).toBeGreaterThan(0.99);
    await page.goto(staticTier("/en/labs"));
    await expectAlignedGrid(page, "#key-projects li[data-pod]", columnsFor(viewport.width));
    await context.close();
  });
}

for (const v of [
  { viewport: { width: 1440, height: 900 }, dpr: 2 },
  { viewport: { width: 390, height: 844 }, dpr: 3 },
]) {
  test(`project images are sharp at ${v.viewport.width}x${v.viewport.height}@${v.dpr}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: v.dpr });
    const page = await context.newPage();
    await openPage(page, staticTier("/en"));
    for (const img of await page.locator("#work [data-feature-pod] .pv-shot img").all()) await expectSharp(img);
    await openPage(page, staticTier("/en/labs"));
    for (const img of await page.locator("#key-projects .pv-shot img").all()) await expectSharp(img);
    await context.close();
  });
}

/** Stand-in for the public sites so the suite never depends on the network. */
const LIVE_SITE = /^https:\/\/mii-microsoft(?:-ai)?\.azurewebsites\.net\//;

test("Visit live site opens the public site in a new tab without an opener, on the case study and in the Work index", async ({ page, context }) => {
  expect(livePods.map((p) => p.slug).sort()).toEqual(["ai-solutions-assistant", "solutions-marketing-site"]);
  await context.route(LIVE_SITE, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Live site stub</title>" }));

  for (const pod of livePods) {
    await openPage(page, staticTier(`/en/labs/${pod.slug}`));
    const cta = page.locator("main").getByRole("link", { name: /^Visit live site/ });
    await expect(cta).toHaveCount(1);
    await expect(cta).toHaveAttribute("href", pod.liveUrl!);
    await expect(cta).toHaveAttribute("target", "_blank");
    await expect(cta).toHaveAttribute("rel", "noopener noreferrer");
    const [popup] = await Promise.all([page.waitForEvent("popup"), cta.click()]);
    await popup.waitForLoadState();
    expect(new URL(popup.url()).origin).toBe(new URL(pod.liveUrl!).origin);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
  }
  await expectNoSeriousViolations(page);

  await openPage(page, staticTier("/en/labs/vendor-management-portal"));
  await expect(page.locator("[data-live-link]")).toHaveCount(0);

  await openPage(page, staticTier("/en/labs"));
  const rowLinks = page.locator("#all-projects [data-live-link]");
  await expect(rowLinks).toHaveCount(livePods.length);
  expect((await rowLinks.evaluateAll((els) => els.map((el) => el.getAttribute("href")))).sort()).toEqual(livePods.map((p) => p.liveUrl).sort());
  // The link sits above the row's stretched title link: clicking it opens the site, not the case study.
  const [popup] = await Promise.all([page.waitForEvent("popup"), rowLinks.first().click()]);
  await popup.close();
  await expect(page).toHaveURL(/\/en\/labs\?tier=static$/);
});

const perspectivesFile = PerspectivesFileSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "content", "perspectives.json"), "utf8")));

/** Owner decision 2026-10-14: perspectives are Ask the HQ knowledge only, never a page section. */
test("Perspectives: no entry reaches the static export", () => {
  expect(scanBuildOutput(path.join(process.cwd(), "out"), perspectiveFingerprints(perspectivesFile.entries))).toEqual([]);
});

test("Perspectives: About and Quick view have no perspectives section or ToC chip", async ({ page }) => {
  for (const locale of ["en", "id"] as const) {
    for (const route of ["contact", "quick"]) {
      await openPage(page, staticTier(`/${locale}/${route}`));
      await expect(page.locator("#perspectives, [data-perspective], [id^='perspectives-']"), `${locale}/${route}`).toHaveCount(0);
      await expect(page.locator('a[href="#perspectives"]'), `${locale}/${route}`).toHaveCount(0);
    }
  }
});

/** R5 P10 (owner, 2026-10-13): no colored left or top edge stripe; a dot or icon chip plus an outline glow instead. */
const QUOTE_POST = "/id/blog/the-sun-the-moon-and-the-dark-sea";


test.describe("no colored edge stripes", () => {
  test("Page View templates, the case study table of contents and a post with quotes", async ({ page }) => {
    test.setTimeout(120_000);
    expect(content.floors.library.posts.some((p) => QUOTE_POST.endsWith(`/${p.slug}`))).toBe(true);
    for (const path of [...TEMPLATES, QUOTE_POST]) {
      await openPage(page, staticTier(path));
      if (path === `/en/labs/${heroPod.slug}`) {
        await page.evaluate(() => {
          const el = document.getElementById("approach")!;
          window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200);
        });
        await expect(page.locator(".pv-toc a[aria-current='true']")).toHaveCount(1);
      }
      expect(await page.evaluate(findEdgeAccents, "body"), path).toEqual([]);
    }
  });

  test("the Ask dock", async ({ page }) => {
    await page.route("**/api/ask", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ASK_ON) }));
    await openPage(page, staticTier("/en/labs"));
    await page.getByTestId("ask-launcher").click();
    await expect(page.getByTestId("ask-dock")).toBeVisible();
    expect(await page.evaluate(findEdgeAccents, "[data-testid='ask-dock']")).toEqual([]);
  });

  test("Cmd-K marks the selected row with a dot and a full outline", async ({ page }) => {
    await openPage(page, staticTier("/en/journey"));
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    const combo = palette.getByRole("combobox");
    const first = await combo.getAttribute("aria-activedescendant");
    await page.keyboard.press("ArrowDown");
    await expect(combo).not.toHaveAttribute("aria-activedescendant", first ?? "");
    const selected = palette.locator(`[role='option'][aria-selected='true']`);
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveAttribute("id", (await combo.getAttribute("aria-activedescendant"))!);
    const look = await selected.evaluate((el) => {
      const cs = getComputedStyle(el);
      const dot = el.querySelector("[data-accent-dot]");
      return {
        sides: new Set([cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor]).size,
        left: cs.borderLeftWidth,
        fill: cs.backgroundColor,
        dot: dot ? getComputedStyle(dot).visibility : "missing",
      };
    });
    expect(look.sides).toBe(1);
    expect(look.left).toBe("1px");
    expect(look.fill).not.toBe("rgba(0, 0, 0, 0)");
    expect(look.dot).toBe("visible");
    expect(await page.evaluate(findEdgeAccents, "[role='dialog']:has([role='listbox'])")).toEqual([]);
  });

  test("certification cards glow on hover and the preview card has no top rule", async ({ page }) => {
    await openPage(page, staticTier("/en"));
    const card = page.locator("#certifications .card[data-cert-open]").first();
    await card.hover();
    await expect
      .poll(() =>
        card.evaluate((el) => {
          const cs = getComputedStyle(el);
          return cs.boxShadow !== "none" && cs.borderTopColor === cs.borderLeftColor && cs.borderLeftColor === cs.borderRightColor;
        }),
      )
      .toBe(true);
    await card.click();
    await expect(page.getByTestId("cert-dialog")).toBeVisible();
    expect(await page.evaluate(findEdgeAccents, "[data-testid='cert-dialog']")).toEqual([]);
  });
});

test("the Page View stays silent: clicks and the CV dialog create no AudioContext", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __audioContexts: number; AudioContext: typeof AudioContext };
    w.__audioContexts = 0;
    const Original = w.AudioContext;
    w.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.__audioContexts++;
      }
    };
  });
  await openPage(page, staticTier("/en/quick"));
  await page.locator("main h1").first().click();
  await page.locator('main a[href="/en/cv"]').first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts)).toBe(0);
});
