import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { chooseMotion, openPage } from "./hq";
import { findEdgeAccents } from "./edge-audit";
import cvManifest from "../content/generated/cv-pages.json";
import { content, firstEntry, heroPod, hostedPost, livePods } from "./routes";
import data from "../content/site-content.json";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { perspectiveFingerprints } from "../src/content/perspectives";
import { PerspectivesFileSchema, STORY_SLUGS } from "../src/content/schema";
import { scanBuildOutput } from "../src/content/safety";
import { headlineResults } from "../src/content/selectors";

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
  "/en/build",
  "/en/security",
  "/id",
  "/id/labs",
];

const staticTier = (path: string) => `${path}${path.includes("?") ? "&" : "?"}tier=static`;

test("Editorial naming keeps the original migration fragment", async ({ page }) => {
  const oldId = "batas-dukungan-untuk-skenario-panggilan-aria";
  const label = "Batas Dukungan untuk Panggilan Voice Agent AI";
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await openPage(page, staticTier("/id/blog/aria-acs-to-livekit"));
    await expect(page.locator(`[id="${oldId}"]`)).toHaveCount(1);
    const heading = page.locator("h2").filter({ has: page.locator(`[id="${oldId}"]`) });
    await expect(heading).toHaveText(label);
    await expect(heading).toHaveAttribute("id", "batas-dukungan-untuk-panggilan-voice-agent-ai");
    await page.evaluate((id) => { window.location.hash = id; }, oldId);
    await expect(page).toHaveURL(new RegExp(`#${oldId}$`));
    await expect(heading).toBeInViewport();
    const disclosure = page.locator(".pv-toc-disclosure");
    if (await disclosure.isVisible()) await disclosure.evaluate((node) => { (node as HTMLDetailsElement).open = true; });
    const tocLink = page.locator(".pv-toc a:visible").filter({ hasText: label });
    await expect(tocLink).toHaveCount(1);
    await expect(tocLink).toHaveAttribute("href", "#batas-dukungan-untuk-panggilan-voice-agent-ai");
    await tocLink.click();
    await expect(page).toHaveURL(/#batas-dukungan-untuk-panggilan-voice-agent-ai$/);
    await expect(heading).toBeInViewport();
  }
});

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
  await chooseMotion(page, "system");
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

const storyPod = content.floors.labs.pods.find((p) => p.slug === "voice-ai-contact-center")!;
const plainPod = content.floors.labs.pods.find((p) => p.tier === "hero" && !STORY_SLUGS.includes(p.slug as (typeof STORY_SLUGS)[number]))!;

test("case study keeps its anchors and table of contents", async ({ page }) => {
  await openPage(page, staticTier(`/en/labs/${plainPod.slug}`));
  for (const id of ["results", "problem", "approach", "stack"]) await expect(page.locator(`#${id}`)).toBeAttached();
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Problem" })).toHaveAttribute("href", "#problem");
});

test("a featured case study reads as a story: situation, key decisions, results, then lesson, with the old anchors kept", async ({ page }) => {
  await openPage(page, staticTier(`/en/labs/${storyPod.slug}`));
  const chapters = await page.locator("article section[id] > h2").evaluateAll((els) => els.map((h) => h.parentElement!.id));
  const story = ["problem", "approach", "results", "lesson"];
  expect(chapters.filter((id) => story.includes(id))).toEqual(story);
  expect(chapters[chapters.indexOf("results") + 1]).toBe("lesson");
  for (const id of ["architecture", "stack", "lesson"]) await expect(page.locator(`#${id}`)).toBeAttached();
  await expect(page.locator("#problem h2")).toHaveText(en.labs.situation);
  await expect(page.locator("#approach h2")).toHaveText(en.labs.decisions);
  await expect(page.locator("#approach li")).toHaveCount(data.floors.labs.pods.find((p) => p.slug === storyPod.slug)!.story!.decisions.length);
  await expect(page.locator("#approach li").first()).toContainText(en.labs.why);
  const toc = page.getByRole("navigation", { name: "On this page" });
  await expect(toc.getByRole("link", { name: en.labs.situation })).toHaveAttribute("href", "#problem");
  await expectNoSeriousViolations(page);
});

test("the voice AI case study adds an Engineering detail chapter after the architecture, with known limits and a post link", async ({ page }) => {
  await openPage(page, staticTier(`/en/labs/${storyPod.slug}`));
  const chapters = await page.locator("article section[id] > h2").evaluateAll((els) => els.map((h) => h.parentElement!.id));
  expect(chapters[chapters.indexOf("architecture") + 1]).toBe("engineering");
  const topics = data.floors.labs.pods.find((p) => p.slug === storyPod.slug)!.engineering! as { title: { en: string }; post?: string }[];
  await expect(page.locator("#engineering h2")).toHaveText(en.labs.engineering.title);
  await expect(page.locator("#engineering h3")).toHaveText(topics.map((t) => t.title.en));
  await expect(page.locator("#engineering")).toContainText(`${en.labs.engineering.limits}:`);
  const post = page.locator("#engineering").getByRole("link", { name: data.floors.library.posts.find((p) => p.slug === topics[0].post)!.title.en });
  await expect(post).toHaveAttribute("href", `/en/blog/${topics[0].post}`);
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: en.labs.engineering.title })).toHaveAttribute("href", "#engineering");
  await expectNoSeriousViolations(page);
});

test("Home keeps the deep-link anchors used by the room catalog", async ({ page }) => {
  await openPage(page, staticTier("/en"));
  // `office`: the Agent Office room's Classic page (`/#office`, src/experience/missions/rooms.ts).
  for (const id of ["stats", "office", "skills", "certifications"]) await expect(page.locator(`#${id}`)).toBeAttached();
  await openPage(page, staticTier("/en/contact"));
  for (const id of ["cv", "channels"]) await expect(page.locator(`#${id}`)).toBeAttached();
});

test("the security page: impact first, sections by id, a working table of contents, the diagram and case study links", async ({ page }) => {
  for (const locale of ["en", "id"] as const) {
    await openPage(page, staticTier(`/${locale}/security`));
    await expect(page.locator("h1")).toHaveCount(1);
    // The hero's proof results come before the contents and lead with a before and after.
    const proof = page.getByTestId("security-proof");
    await expect(proof.locator("li")).toHaveCount(3);
    await expect(proof.locator("[data-delta]").first()).toBeVisible();
    const toc = page.getByRole("navigation", { name: locale === "en" ? "On this page" : "Isi halaman" });
    const sections = ["principles", "keyless", "ai", "products", "incidents", "supply-chain", "site", "background"];
    for (const id of sections) {
      await expect(page.locator(`section#${id}`), `${locale} #${id}`).toBeAttached();
      await expect(toc.locator(`a[href="#${id}"]`), `${locale} ToC #${id}`).toHaveCount(1);
    }
    await expect(toc.locator("a")).toHaveCount(sections.length);
    await expect(page.locator("#keyless [role=img]")).toHaveCount(1);
    await expect(page.locator("#ai a[href*='/labs/']").first()).toBeVisible();
    await expect(page.locator("#products a[href*='/labs/ai-code-security-platform']")).toHaveCount(1);
    await expect(page.locator("#background li")).toHaveCount(2);
    await expect(page.locator(`footer a[href^="/${locale}/security"]`)).toHaveCount(1);
  }
});

test("the build story page: stations by id, a working table of contents, the diagram and lazy before and after captures", async ({ page }) => {
  for (const locale of ["en", "id"] as const) {
    await openPage(page, staticTier(`/${locale}/build`));
    await expect(page.locator("h1")).toHaveCount(1);
    const toc = page.getByRole("navigation", { name: locale === "en" ? "On this page" : "Isi halaman" });
    const stations = ["blueprint", "timeline", "agents", "gates", "dashboard", "brain", "rejected"];
    for (const id of stations) {
      await expect(page.locator(`section#${id}`), `${locale} #${id}`).toBeAttached();
      await expect(toc.locator(`a[href="#${id}"]`), `${locale} ToC #${id}`).toHaveCount(1);
    }
    await expect(toc.locator("a")).toHaveCount(stations.length);
    await expect(page.locator("#coming-soon")).toHaveCount(0);
    for (const id of ["blueprint", "brain"]) {
      await expect(page.locator(`#${id} [role=img]`)).toHaveCount(1);
      await expect(page.locator(`#${id} [role=img]`)).toHaveAttribute("aria-label", /\d/);
    }
    expect(await page.locator("#rejected ol > li").count()).toBeGreaterThanOrEqual(8);
    const shots = page.locator("#timeline figure img");
    expect(await shots.count()).toBeGreaterThan(0);
    for (const img of await shots.all()) {
      await expect(img).toHaveAttribute("loading", "lazy");
      await expect(img).toHaveAttribute("alt", /\S/);
    }
    // Lazy images only load once near the viewport: scroll each into view, then wait for it to decode.
    for (const img of await shots.all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: `${locale} ${await img.getAttribute("src")}` }).toBe(true);
    }
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("${{");
    const commit = /commit ([0-9a-f]{7,40})/.exec(text)?.[1];
    if (commit) await expect(page.locator("main a").filter({ hasText: commit }), `${locale} snapshot commit is not a link`).toHaveCount(0);
    const prs = page.locator('#timeline a[href^="https://github.com/ShinyQ/ShinyQ-HQ/pull/"]');
    expect(await prs.count()).toBeGreaterThan(0);
    await expect(prs.first()).toHaveAttribute("target", "_blank");
    // PR 26 is counted but its diff shows text the site hides: plain text, never a link.
    await expect(page.locator("#timeline li").filter({ hasText: /^#26$/ }), `${locale} #26 is listed`).toHaveCount(1);
    await expect(page.locator('#timeline a[href$="/pull/26"]'), `${locale} #26 is not a link`).toHaveCount(0);
    await expect(page.locator("#gates th[scope=row]").first()).toBeVisible();
    await expect(page.locator("#dashboard [data-tile]").first()).toBeVisible();
    expect(await page.locator("main").innerText()).not.toContain("\u2014");
    await toc.locator('a[href="#gates"]').click();
    await expect(page).toHaveURL(/#gates$/);
  }
});

const cvPdf = `/cv/${content.floors.roof.cv.fileName}.pdf`;
const cvPages = (cvManifest as { pages: { src: string }[] }).pages;

/** Waits until the CV dialog's shared reader has opened the PDF and drawn page 1 (canvas plus text layer). */
async function expectCvReader(page: Page) {
  const dialog = page.getByRole("dialog", { name: "CV", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("cv-reader")).toHaveAttribute("data-page-count", String(cvPages.length), { timeout: 30_000 });
  await expect(dialog.locator('[data-testid="cv-page"][data-page="1"]')).toHaveAttribute("data-rendered", "true", { timeout: 30_000 });
  return dialog;
}

for (const [locale, label, view] of [
  ["en", "Download PDF", "View CV"],
  ["id", "Unduh PDF", "Lihat CV"],
] as const) {
  test(`/${locale}/cv shows page 1 with View CV (the shared PDF reader) and a PDF download`, async ({ page }) => {
    await openPage(page, staticTier(`/${locale}/cv`));
    const card = page.getByTestId("cv-card");
    const download = card.getByRole("link", { name: label });
    await expect(download).toHaveAttribute("href", cvPdf);
    await expect(download).toHaveAttribute("download", cvPdf.split("/").pop()!);
    const cover = card.getByTestId("cv-cover-image");
    await expect(cover).toHaveAttribute("src", cvPages[0].src);
    await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(card.locator("img")).toHaveCount(1);
    await expect(page.locator("main iframe")).toHaveCount(0);
    const read = card.getByRole("link", { name: view });
    await expect(read).toHaveAttribute("href", cvPdf);
    await read.click();
    const dialog = await expectCvReader(page);
    await expect(page).toHaveURL(new RegExp(`/${locale}/cv\\?tier=static$`));
    await expect(dialog.getByTestId("cv-download")).toHaveAttribute("href", cvPdf);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(read).toBeFocused();
  });
}

for (const locale of ["en", "id"] as const) {
  test(`every CV entry point opens the CV in the shared PDF reader instead of downloading (${locale})`, async ({ page }) => {
    // Three pages with several entry points each, every one opening a modal: more than the default 30 s on a CI runner.
    test.setTimeout(90_000);
    const close = locale === "en" ? "Close CV" : "Tutup CV";
    for (const path of [`/${locale}`, `/${locale}/contact`, `/${locale}/quick`]) {
      await openPage(page, staticTier(path));
      await expect(page.locator('main a[href^="/cv/"][href$=".pdf"]'), path).toHaveCount(0);
      const entries = page.locator("#site-shell [data-testid^='cv-open']");
      expect(await entries.count(), path).toBeGreaterThan(1);
      let opened = 0;
      for (const entry of await entries.all()) {
        if (!(await entry.isVisible())) continue;
        await entry.click();
        const dialog = page.getByRole("dialog", { name: "CV", exact: true });
        await expect(dialog, path).toBeVisible();
        const reader = dialog.getByTestId("cv-reader");
        // pdf.js opens the PDF once per page (the reader and its worker are cached after that); every entry mounts the reader.
        if (opened++ === 0) await expect(reader).toHaveAttribute("data-page-count", String(cvPages.length), { timeout: 30_000 });
        else await expect(reader).toBeAttached();
        await expect(dialog.getByRole("button", { name: close })).toBeFocused();
        await expect(page).toHaveURL(new RegExp(`${path}\\?tier=static`));
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(entry).toBeFocused();
      }
      expect(opened, path).toBeGreaterThan(0);
    }
  });
}

test("the CV reader passes axe, draws selectable text and zooms with the keyboard", async ({ page }) => {
  await openPage(page, staticTier("/en/contact"));
  await page.locator("main [data-testid='cv-open']").click();
  const dialog = await expectCvReader(page);
  await expect(dialog.getByRole("button", { name: "Close CV" })).toBeFocused();
  await expect(dialog.getByRole("img", { name: `CV page 1 of ${cvPages.length}` })).toBeVisible();
  await expect(dialog.locator('[data-testid="cv-page"][data-page="1"] span').first()).toBeAttached();
  const fit = dialog.getByTestId("cv-fit");
  await expect(fit).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("+");
  await expect(fit).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("0");
  await expect(fit).toHaveAttribute("aria-pressed", "true");
  const results = await new AxeBuilder({ page }).include("[data-testid='cv-dialog']").analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

const firstCert = [...data.certifications].filter((c) => c.status === "earned" && c.code).sort((a, b) => b.issued.localeCompare(a.issued))[0];

test("certifications open the in-site preview card (no frame), keyboard first", async ({ page }) => {
  await openPage(page, staticTier("/en"));
  const section = page.locator("#certifications");
  // Home lists 3 featured cards and 6 rows (`limit={6}`), then links to the full list on Contact.
  const total = data.certifications.length;
  await expect(section.locator("[data-cert-open]")).toHaveCount(Math.min(total, 9));
  if (total > 9) await expect(section.getByRole("link", { name: `All ${total} certifications` })).toHaveAttribute("href", /\/contact#certifications$/);
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

test("landing: the first paint waits for the whole hero (a render-blocking expect link on its last node)", async ({ page }) => {
  // A busy device can paint a half-parsed hero; the rest arriving then shifts the backdrop and the centered column (#156).
  await openPage(page, staticTier("/en"));
  const block = await page.evaluate(() => {
    const link = document.head.querySelector<HTMLLinkElement>("link[rel='expect'][blocking='render']");
    const target = link ? document.getElementById(link.getAttribute("href")!.slice(1)) : null;
    const hero = document.querySelector(".hx");
    return { link: Boolean(link), last: Boolean(target && hero && hero.lastElementChild === target) };
  });
  expect(block).toEqual({ link: true, last: true });
});

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

test("landing: three featured projects with their screenshots, the stats ledger, and no 3D offer on the static tier", async ({ page }) => {
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
  const proofIds = data.profile.heroProof;
  const strip = page.getByTestId("hero-proof");
  await expect(strip.getByRole("listitem")).toHaveCount(3);
  for (const id of proofIds) {
    const stat = data.stats.find((s) => s.id === id)!;
    // A before and after shows compact: the after, then "from {before}" (owner decision 2026-11-13).
    const delta = (stat as { delta?: { before: string; after: string } }).delta;
    await expect(strip.locator(`[data-stat="${id}"]`)).toContainText(delta ? delta.after : stat.value);
    await expect(ticker.getByRole("listitem").filter({ hasText: stat.label.en })).toHaveCount(0);
  }
  const lead = data.stats.filter((s) => (s as { kind?: string }).kind !== "scale");
  for (const stat of lead.filter((s) => !proofIds.includes(s.id))) await expect(ticker.getByRole("listitem").filter({ hasText: stat.label.en })).toHaveCount(1);
  // Scale stats sit in the footnote by their short label (a live stat's value is overlaid from the weekly facts).
  for (const stat of data.stats.filter((s) => (s as { kind?: string }).kind === "scale")) await expect(page.getByTestId("scale-note")).toContainText(stat.short!.en);
  await expect(page.getByTestId("enter-hq")).toBeHidden();
});

test("landing: View CV is the primary hero action and the sections follow the recruiter path", async ({ page }) => {
  await openPage(page, staticTier("/en"));
  const hero = page.locator("section[aria-labelledby='hero-title']");
  const cv = hero.getByTestId("cv-open-hero");
  await expect(cv).toHaveClass(/pv-btn-primary/);
  await expect(cv).toHaveText(en.common.viewCv);
  await expect(hero.locator(".pv-btn-primary")).toHaveCount(1);
  const order = await page.locator("section[id]").evaluateAll((els) => els.map((el) => el.id));
  const expected = ["work", "intro", "journey", "certifications", "skills", "office", "writing", "contact"];
  expect(order.filter((id) => expected.includes(id))).toEqual(expected);
});


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
    // Selected work is a Feature Stack (Hallmark redesign 2026-10-27): one project a row, every row the same width.
    await expectAlignedGrid(page, "#work [data-feature-pod]", 1);
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
    // Owner 2026-10-16: the landing lists only key projects with screenshots; image-less pods live on /labs.
    await expect(page.locator("#work .pv-rows [data-row-placeholder]")).toHaveCount(0);
    expect(await page.locator("#work .pv-rows [data-row-thumb] img").count()).toBe(await page.locator("#work .pv-rows > li").count());
    await page.goto(staticTier("/en/labs"));
    // Rows without screenshots show the designed placeholder, never an empty frame.
    const placeholders = page.locator("#all-projects [data-row-placeholder] [data-project-placeholder]");
    expect(await placeholders.count()).toBeGreaterThan(0);
    await expect(placeholders.first()).toHaveAttribute("aria-hidden", "true");
    // Key projects are a Feature Stack too (Hallmark redesign 2026-10-27): one project a row.
    await expectAlignedGrid(page, "#key-projects li[data-pod]", 1);
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
  // Key project cards and index rows both carry the live link.
  const rowLinks = page.locator("#key-projects [data-live-link], #all-projects [data-live-link]");
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
  // Fingerprints come from the public perspectives file, so hits stay readable.
  expect(scanBuildOutput(path.join(process.cwd(), "out"), perspectiveFingerprints(perspectivesFile.entries), (found) => found)).toEqual([]);
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
        await expect(page.locator(".pv-toc a[aria-current='true']:visible")).toHaveCount(1);
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
      return {
        sides: new Set([cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor]).size,
        left: cs.borderLeftWidth,
        fill: cs.backgroundColor,
      };
    });
    expect(look.sides).toBe(1);
    expect(look.left).toBe("1px");
    expect(look.fill).not.toBe("rgba(0, 0, 0, 0)");
    await expect(selected.locator("[data-accent-dot]")).toHaveCSS("visibility", "visible");
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

test("a post's Markdown table renders as a table that scrolls in its own region on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, staticTier("/en/blog/aria-acs-to-livekit"));
  const region = page.getByRole("region", { name: en.blog.tableLabel });
  await expect(region).toHaveCount(1);
  const table = region.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByRole("columnheader")).toHaveText(["Exercise", "Recorded Result", "Limit"]);
  await expect(page.locator("article")).not.toContainText("|---|");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const box = await region.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  await expectNoSeriousViolations(page);
});

/** A post's AI Summary paragraphs in one language (the dataset type narrows per post, so read them as optional text). */
function summaryIn(slug: string, locale: "en" | "id"): string[] {
  const post = data.floors.library.posts.find((item) => item.slug === slug);
  const summary = (post?.summary ?? []) as { en?: string; id?: string }[];
  return summary.map((paragraph) => paragraph[locale] ?? "");
}

test("a post opens with its AI Summary before the first body paragraph", async ({ page }) => {
  const slug = "45-percent-of-our-llm-calls-failed";
  await openPage(page, staticTier(`/en/blog/${slug}`));
  const summary = page.getByRole("complementary", { name: en.blog.summary });
  await expect(summary).toHaveCount(1);
  await expect(summary.locator("[data-summary-paragraphs] > p")).toHaveText(summaryIn(slug, "en"));
  const box = await summary.boundingBox();
  const first = await page.locator(".prose-hq > p").first().boundingBox();
  expect(box && first && box.y + box.height < first.y).toBe(true);
  await expectNoSeriousViolations(page);
});

test("the AI Summary label follows the page language and the paragraphs follow the post's", async ({ page }) => {
  const slug = "making-a-voice-agent-interruptible";
  await openPage(page, staticTier(`/id/blog/${slug}`));
  const summary = page.getByRole("complementary", { name: id.blog.summary });
  await expect(summary).toHaveCount(1);
  await expect(summary.locator("[data-summary-paragraphs]")).toHaveAttribute("lang", "id");
  await expect(summary.locator("[data-summary-paragraphs] > p")).toHaveText(summaryIn(slug, "id"));
});

test("a post with no translation keeps the page's label over its own language's summary", async ({ page }) => {
  const slug = "the-sun-the-moon-and-the-dark-sea";
  await openPage(page, staticTier(`/en/blog/${slug}`));
  const summary = page.getByRole("complementary", { name: en.blog.summary });
  await expect(summary).toHaveCount(1);
  await expect(summary.locator("[data-summary-paragraphs]")).toHaveAttribute("lang", "id");
  await expect(summary.locator("[data-summary-paragraphs] > p")).toHaveText(summaryIn(slug, "id"));
});

test.describe("architecture diagrams", () => {
  const FIGURE_POSTS: { slug: string; figures: number }[] = [
    { slug: "making-a-voice-agent-interruptible", figures: 1 },
    { slug: "45-percent-of-our-llm-calls-failed", figures: 1 },
    { slug: "why-the-better-fraud-engine-shipped-in-shadow-mode", figures: 1 },
    { slug: "spec-driven-development-with-ai-coding-agents", figures: 2 },
    { slug: "clearbox-inbox-cleanup-with-microsoft-decision-1", figures: 2 },
  ];

  /** The visible SVG of each diagram: smallest rendered font size (px) and whether it fits its box. */
  async function drawnDiagrams(scope: Locator) {
    return scope.locator("[role=img]").evaluateAll((diagrams) =>
      diagrams.map((diagram) => {
        const svgs = [...diagram.querySelectorAll("svg")];
        const visible = svgs.filter((svg) => getComputedStyle(svg).display !== "none");
        const svg = visible[0];
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const sizes = [...svg.querySelectorAll("text")].map((t) => Number(t.getAttribute("font-size")));
        return {
          label: diagram.getAttribute("aria-label") ?? "",
          visible: visible.length,
          minPx: Math.min(...sizes) * scale,
          fits: svg.getBoundingClientRect().right <= diagram.getBoundingClientRect().right + 0.5,
        };
      }),
    );
  }

  for (const { slug, figures } of FIGURE_POSTS) {
    test(`/en/blog/${slug} draws ${figures} captioned diagram(s) that read on a phone`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openPage(page, staticTier(`/en/blog/${slug}`));
      const figure = page.locator("figure[data-post-architecture]");
      await expect(figure).toHaveCount(figures);
      for (let i = 0; i < figures; i++) await expect(figure.nth(i).locator("figcaption")).toHaveText(/\S/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      for (const d of await drawnDiagrams(page.locator("article"))) {
        expect(d.label).toMatch(/^Architecture diagram with \d+ components\./);
        expect(d.visible).toBe(1);
        expect(d.fits).toBe(true);
        expect(d.minPx).toBeGreaterThanOrEqual(11.9);
      }
      await expectNoSeriousViolations(page);
    });
  }

  test("desktop draws the wide diagram at full size, in posts and case studies", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ["/id/blog/why-the-better-fraud-engine-shipped-in-shadow-mode", `/en/labs/${heroPod.slug}`]) {
      await openPage(page, staticTier(path));
      const diagrams = await drawnDiagrams(page.locator("main"));
      expect(diagrams.length, path).toBeGreaterThan(0);
      for (const d of diagrams) {
        expect(d.visible, path).toBe(1);
        expect(d.fits, path).toBe(true);
        expect(d.minPx, path).toBeGreaterThanOrEqual(10.4);
      }
    }
  });

  test("a case study diagram reads on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPage(page, staticTier(`/en/labs/${heroPod.slug}`));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    for (const d of await drawnDiagrams(page.locator("main"))) {
      expect(d.visible).toBe(1);
      expect(d.minPx).toBeGreaterThanOrEqual(11.9);
    }
  });
});

const heroResults = data.floors.labs.pods.find((p) => p.slug === heroPod.slug)!.results as unknown as { value: string; headline?: boolean; kind?: "impact" | "scale"; delta?: { before: string; after: string } }[];

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`case study opens with the metric strip at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await openPage(page, staticTier(`/en/labs/${heroPod.slug}`));
    const strip = page.getByRole("list", { name: en.labs.keyResults });
    const items = strip.getByTestId("metric-strip-item");
    const expected = headlineResults(heroResults);
    await expect(items).toHaveCount(expected.length);
    await expect(items.first()).toContainText(expected[0].delta ? expected[0].delta.after : expected[0].value);
    await expect(strip).toBeInViewport();
    const tops = await items.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    // Desktop (md and up): one row, 3 across. Phone: stacked rows.
    if (viewport.width >= 768) expect(new Set(tops.map(Math.round)).size).toBe(1);
    else expect(new Set(tops.map(Math.round)).size).toBe(expected.length);
    // No confidence marker (decision #44); scoped because body copy may say "verified" in its own words.
    for (const block of [strip, page.locator("#results")]) await expect(block).not.toContainText(/self-reported|strongly-inferred|verified/i);
    await context.close();
  });
}

/**
 * The closing section (owner decision 2026-11-01): the landing, every case study and the CV page end with the
 * availability line, the email, About and contact and View CV; a case study adds "Ask Rover about this project".
 * `/api/ask` is mocked (the static server has no Functions).
 */
const CLOSING_AS_OF = "2026-11-01";
const closingAvailability = data.floors.roof.availability.en;
const closingEmail = data.floors.roof.contact.email;
const heroTitle = data.floors.labs.pods.find((p) => p.slug === heroPod.slug)!.title.en;

async function mockAskClosing(page: Page, enabled: boolean) {
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/ask", async (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled, turnstileSiteKey: null, asOf: CLOSING_AS_OF, maxLength: 300 }) });
    posts.push(request.postDataJSON() as Record<string, unknown>);
    const frames = [{ delta: "He built it." }, { done: true, outcome: "answer", source: "primary", asOf: CLOSING_AS_OF, tags: ["work"] }];
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("") });
  });
  return posts;
}

test.describe("closing section", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("hq:ask-teaser", "1"));
  });

  test("a case study ends with the closing section, and its Ask button asks about the project", async ({ page }) => {
    const posts = await mockAskClosing(page, true);
    await openPage(page, `/en/labs/${heroPod.slug}?tier=static`);
    const closing = page.getByTestId("closing-cta");
    await expect(closing).toHaveCount(1);
    await expect(closing.getByRole("heading", { level: 2 })).toHaveText(closingAvailability);
    await expect(closing.getByRole("link", { name: closingEmail })).toHaveAttribute("href", `mailto:${closingEmail}`);
    await expect(closing.getByRole("link", { name: en.home.aboutContact })).toHaveAttribute("href", /\/en\/contact/);
    await expect(closing.getByRole("link", { name: en.common.viewCv })).toBeVisible();
    // The section closes the page: nothing but the footer follows it.
    expect(await closing.evaluate((el) => el.nextElementSibling === null || el.nextElementSibling.tagName === "FOOTER")).toBe(true);

    const ask = closing.getByTestId("case-ask");
    await expect(ask).toHaveText(en.case.askAboutLabel);
    await ask.click();
    await expect(page.getByRole("dialog", { name: en.ask.dock.title, exact: true })).toBeVisible();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({ q: en.case.askAbout.replace("{title}", heroTitle), source: "case", locale: "en" });
  });

  test("the Ask button stays out while Ask the HQ is off; the other actions stay", async ({ page }) => {
    await mockAskClosing(page, false);
    const status = page.waitForResponse((r) => r.url().endsWith("/api/ask") && r.request().method() === "GET");
    await openPage(page, `/en/labs/${heroPod.slug}?tier=static`);
    await status;
    const closing = page.getByTestId("closing-cta");
    await expect(closing.getByTestId("case-ask")).toHaveCount(0);
    await expect(closing.getByRole("link", { name: closingEmail })).toBeVisible();
  });

  test("the CV page ends with the closing section without a second View CV", async ({ page }) => {
    await openPage(page, "/en/cv?tier=static");
    const closing = page.getByTestId("closing-cta");
    await expect(closing.getByRole("heading", { level: 2 })).toHaveText(closingAvailability);
    await expect(closing.getByRole("link", { name: closingEmail })).toBeVisible();
    await expect(closing.getByRole("link", { name: en.common.viewCv })).toHaveCount(0);
    await expect(closing.getByTestId("case-ask")).toHaveCount(0);
  });

  test("the landing keeps one closing section at #contact", async ({ page }) => {
    await openPage(page, "/en?tier=static");
    await expect(page.locator("#contact")).toHaveCount(1);
    await expect(page.getByTestId("closing-cta").getByRole("link", { name: en.common.viewCv })).toBeVisible();
    await expect(page.getByTestId("case-ask")).toHaveCount(0);
  });
});

test.describe("landing hero contact line (owner decision 2026-11-01)", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`shows the availability line and the email in the first screen (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openPage(page, "/en?tier=static");
      const line = page.getByTestId("hero-contact");
      await expect(line).toContainText(data.floors.roof.availability.en);
      const mail = line.getByRole("link", { name: data.floors.roof.contact.email });
      await expect(mail).toHaveAttribute("href", `mailto:${data.floors.roof.contact.email}`);
      const b = (await mail.boundingBox())!;
      expect(b.y + b.height, "the email is in the first screen").toBeLessThanOrEqual(viewport.height);
    });
  }
});

test.describe("Quick view brief (owner decision 2026-11-01)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the contact line and View CV are in the first screen, and every list is short with a link to the full page", async ({ page }) => {
    await openPage(page, staticTier("/en/quick"));
    const email = data.floors.roof.contact.email;
    const contact = page.getByTestId("quick-contact");
    await expect(contact).toContainText(data.floors.roof.availability.en);
    for (const action of [contact.getByRole("link", { name: email }), page.getByTestId("cv-open-quick")]) {
      const box = (await action.boundingBox())!;
      expect(box.y + box.height, "in the first screen").toBeLessThanOrEqual(844);
    }
    for (const wing of ["software", "ai", "data"]) {
      const section = page.locator(`#${wing}`);
      expect(await section.locator("ul.pv-rows > li").count(), wing).toBeLessThanOrEqual(3);
      await expect(section.locator(`a[href*="/labs?wing=${wing}"]`)).toHaveCount(1);
    }
    expect(await page.locator("#timeline ul.pv-rows > li").count()).toBeLessThanOrEqual(6);
    await expect(page.locator('#timeline a[href$="/journey"]')).toHaveCount(1);
    await expect(page.locator('#library a[href$="/library"]')).toHaveCount(1);
    await expect(page.locator('#projects a[href*="/journey#workshop"]')).toHaveCount(1);
    await expect(page.locator('#certifications a[href*="/contact#certifications"]')).toHaveCount(1);
    for (const id of ["profile", "stats", "software", "ai", "data", "timeline", "skills", "projects", "certifications", "awards", "library", "contact"]) await expect(page.locator(`#${id}`), id).toHaveCount(1);
    const screens = await page.evaluate(() => document.documentElement.scrollHeight / innerHeight);
    expect(screens, "a short brief, not the whole site").toBeLessThan(24);
  });
});

test.describe("reading a post", () => {
  const POST = "/en/blog/ten-very-hard-benchmark-tasks-in-ten-days";
  const WIDE_FIGURE_POST = "/en/blog/why-the-better-fraud-engine-shipped-in-shadow-mode";
  const contents = (page: Page) => page.getByRole("navigation", { name: en.case.onThisPage, includeHidden: true });
  /** Scrolls in steps, one frame apart, so the page sees a run of scroll events like a reader's swipe (instant: the
   *  site's smooth scroll-behavior would let each step cancel the last). */
  const scrollSteps = async (page: Page, dy: number, steps = 8) => {
    for (let i = 0; i < steps; i++) {
      await page.evaluate((d) => new Promise((done) => {
        window.scrollBy({ top: d, behavior: "instant" });
        requestAnimationFrame(() => requestAnimationFrame(done));
      }), dy / steps);
    }
  };

  test("one centred column for the head, the body and the end, with its contents beside it from 1280 px", async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPage(page, staticTier(POST));
    // The head, the AI Summary (owner decision 2026-11-14), the body and the end all share the one reading measure.
    const columns = await page.locator("article .pv-read").evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; }));
    expect(columns).toHaveLength(4);
    for (const box of columns) expect(box).toEqual(columns[0]);
    expect(Math.abs(columns[0][0] * 2 + columns[0][1] - 1440)).toBeLessThanOrEqual(2);
    await expect(page.locator(".prose-hq > p").first()).toHaveCSS("font-size", "16px");
    await expect(page.locator(".prose-hq > p").first()).toHaveCSS("color", "rgb(244, 244, 245)");
    await expect(page.locator("article header .pv-meta")).toContainText(/\d+ min read/);

    const ids = await page.locator(".prose-hq > h2").evaluateAll((hs) => hs.map((h) => h.id));
    expect(ids).toHaveLength(11);
    expect(ids).toContain("after-the-first-ten-days");
    expect(ids).toContain("how-it-ended");
    await expect(contents(page).locator(".pv-toc-count:visible")).toHaveText("11 chapters");
    const box = await contents(page).boundingBox();
    if (!box) throw new Error("Missing desktop contents box");
    expect(box.x).toBeGreaterThanOrEqual(columns[0][0] + columns[0][1]);
    expect(box.x + box.width).toBeLessThanOrEqual(1440);
    const links = contents(page).getByRole("link");
    expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")))).toEqual(ids.map((id) => `#${id}`));
    await links.nth(2).click();
    await expect(page).toHaveURL(new RegExp(`#${ids[2]}$`));
    await expect(links.nth(2)).toHaveAttribute("aria-current", "true");
    // Desktop keeps its one-row header in place while reading.
    expect((await page.locator("header.pv-header").boundingBox())!.y).toBe(0);
    await expect(page.getByRole("group", { name: en.common.share }).getByRole("button")).toHaveCount(2);
    await expectNoSeriousViolations(page);

    const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    const plain = await noScript.newPage();
    await plain.goto(staticTier(POST));
    expect(await contents(plain).getByRole("link").evaluateAll((as) => as.map((a) => a.getAttribute("href")))).toEqual(ids.map((id) => `#${id}`));
    await noScript.close();
  });

  test("the contents step aside while a wide diagram passes under them", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPage(page, staticTier(WIDE_FIGURE_POST));
    const nav = contents(page);
    await expect(nav).toBeVisible();
    const top = await page.locator(".arch-break").first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y - 200), top);
    await expect(nav).toHaveAttribute("data-covered", "");
    await expect(nav).toBeHidden();
    await page.evaluate((y) => window.scrollTo(0, y + 1400), top);
    await expect(nav).not.toHaveAttribute("data-covered");
    await expect(nav).toBeVisible();
    const focusedLink = nav.locator(".pv-toc-wide a").first();
    await expect(focusedLink).toBeVisible();
    await focusedLink.focus();
    await expect(focusedLink).toBeFocused();
    await page.evaluate((y) => window.scrollTo({ top: y - 200, behavior: "instant" }), top);
    await expect(nav).toHaveAttribute("data-covered", "");
    await expect(nav).toBeVisible();
    await focusedLink.evaluate((el: HTMLAnchorElement) => el.blur());
    await expect(nav).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(nav).not.toHaveAttribute("data-covered");
    await expect(nav.locator(".pv-toc-disclosure > summary")).toBeVisible();
  });

  const BENCHMARK_SLUG = "ten-very-hard-benchmark-tasks-in-ten-days";

  for (const locale of ["en", "id"] as const) {
    const messages = locale === "en" ? en : id;
    for (const segment of [`blog/${BENCHMARK_SLUG}`, "labs/voice-ai-contact-center"]) {
      const route = `/${locale}/${segment}`;
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
        { width: 1279, height: 900 },
      ]) {
        test(`Reading contents: native disclosure ${route} at ${viewport.width}`, async ({ browser }) => {
          const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
          await chooseMotion(context, "system");
          await context.addInitScript(() => {
            localStorage.setItem("hq:terminal-seen", "1");
            localStorage.setItem("hq:onboarded", "done");
          });
          const page = await context.newPage();
          await openPage(page, staticTier(route));
          const nav = page.getByRole("navigation", { name: messages.case.onThisPage });
          const details = nav.locator("details");
          const summary = details.locator("summary");
          await expect(nav).toHaveCount(1);
          await expect(nav.locator(".pv-toc-wide")).toBeHidden();
          await expect(details).not.toHaveAttribute("open");
          await expect(summary).toBeVisible();
          const box = await summary.boundingBox();
          if (!box) throw new Error("Missing contents summary box");
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(await nav.evaluate((el) => {
            const body = document.querySelector(".prose-hq, .pv-case-body");
            if (!body) throw new Error("Missing reading body");
            return Boolean(el.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING);
          })).toBe(true);
          await summary.focus();
          await page.keyboard.press("Enter");
          await expect(details).toHaveAttribute("open", "");
          const links = nav.getByRole("link");
          const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
          const targets = await page.locator(
            segment.startsWith("blog/") ? ".prose-hq > h2" : ".pv-case-body > section[id]",
          ).evaluateAll((els) => els.map((el) => {
            const heading = el.matches("h2") ? el : el.querySelector("h2");
            if (!heading?.textContent) throw new Error("Missing chapter label");
            return { href: `#${el.id}`, label: heading.textContent };
          }));
          expect(hrefs).toEqual(targets.map((target) => target.href));
          expect(new Set(hrefs).size).toBe(hrefs.length);
          expect(hrefs).not.toContain("#contact");
          for (const [index, target] of targets.entries()) {
            await expect(links.nth(index)).toHaveAccessibleName(target.label);
          }
          for (const height of await links.evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height))) {
            expect(height).toBeGreaterThanOrEqual(44);
          }
          await expect(details.locator(".pv-toc-list")).toHaveCSS("overflow-y", "visible");
          const target = await links.nth(1).getAttribute("href");
          if (!target) throw new Error("Missing chapter fragment");
          await links.nth(1).click();
          await expect(page).toHaveURL(new RegExp(`${target}$`));
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
          await expectNoSeriousViolations(page);
          for (const colorScheme of ["light", "dark"] as const) {
            await page.emulateMedia({ colorScheme });
            await expectNoSeriousViolations(page);
          }
          await context.close();
        });
      }

      test(`Reading contents: no JavaScript ${locale}/${segment}`, async ({ browser }) => {
        const context = await browser.newContext({
          javaScriptEnabled: false,
          viewport: { width: 390, height: 844 },
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        await page.goto(staticTier(route));
        const nav = page.getByRole("navigation", { name: messages.case.onThisPage });
        const details = nav.locator("details");
        await expect(details).not.toHaveAttribute("open");
        await details.locator("summary").focus();
        await page.keyboard.press("Enter");
        await expect(details).toHaveAttribute("open", "");
        const links = nav.getByRole("link");
        const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
        const targets = await page.locator(
          segment.startsWith("blog/") ? ".prose-hq > h2" : ".pv-case-body > section[id]",
        ).evaluateAll((els) => els.map((el) => {
          const heading = el.matches("h2") ? el : el.querySelector("h2");
          if (!heading?.textContent) throw new Error("Missing no-script chapter label");
          return { href: `#${el.id}`, label: heading.textContent };
        }));
        expect(hrefs).toEqual(targets.map((target) => target.href));
        expect(new Set(hrefs).size).toBe(hrefs.length);
        expect(hrefs).not.toContain("#contact");
        for (const [index, target] of targets.entries()) {
          await expect(links.nth(index)).toHaveAccessibleName(target.label);
        }
        const target = await links.nth(1).getAttribute("href");
        if (!target) throw new Error("Missing no-script chapter fragment");
        await links.nth(1).click();
        await expect(page).toHaveURL(new RegExp(`${target}$`));
        await context.close();
      });
    }

    test(`Reading contents: publication and revision metadata ${locale}`, async ({ page }) => {
      const source = readFileSync(`content/blog/${BENCHMARK_SLUG}.${locale}.mdx`, "utf8");
      const updated = /^updated:\s*"(\d{4}-\d{2}-\d{2})"\s*$/m.exec(source)?.[1];
      if (!updated) throw new Error("Benchmark revision date missing");
      await openPage(page, staticTier(`/${locale}/blog/${BENCHMARK_SLUG}`));
      await expect(page.locator("article > header time")).toHaveCount(2);
      await expect(page.locator("article > header time").first()).toHaveAttribute("datetime", "2026-11-02");
      await expect(page.locator("article > header time").last()).toHaveAttribute("datetime", updated);
      await expect(page.locator('meta[property="article:modified_time"]')).toHaveAttribute("content", updated);
      const response = await page.request.get(`/${locale}/feed.xml`);
      expect(response.ok()).toBe(true);
      const dates = await page.evaluate(({ xml, slug }) => {
        const ns = "http://www.w3.org/2005/Atom";
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        if (doc.querySelector("parsererror")) throw new Error("Invalid Atom XML");
        const entry = [...doc.getElementsByTagNameNS(ns, "entry")].find((el) =>
          el.getElementsByTagNameNS(ns, "id")[0]?.textContent?.endsWith(`/blog/${slug}`),
        );
        if (!entry) throw new Error("Missing benchmark Atom entry");
        return [
          entry.getElementsByTagNameNS(ns, "published")[0]?.textContent,
          entry.getElementsByTagNameNS(ns, "updated")[0]?.textContent,
        ];
      }, { xml: await response.text(), slug: BENCHMARK_SLUG });
      expect(dates).toEqual(["2026-11-02T00:00:00Z", `${updated}T00:00:00Z`]);
    });
  }

  test("Reading contents: long list stays reachable on a short desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await openPage(page, staticTier(`/en/blog/${BENCHMARK_SLUG}`));
    const nav = page.getByRole("navigation", { name: en.case.onThisPage, includeHidden: true });
    const stickyTop = await page.locator(".pv-post-toc").evaluate((el) => parseFloat(getComputedStyle(el).top));
    await page.locator(".prose-hq > h2").nth(2).evaluate((el) => {
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 120, behavior: "instant" });
    });
    await expect.poll(() => nav.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(Math.round(stickyTop));
    const list = nav.locator(".pv-toc-wide > .pv-toc-list");
    await expect(list).toHaveCSS("overflow-y", "auto");
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const box = await nav.boundingBox();
    if (!box) throw new Error("Missing sticky panel box");
    expect(box.y + box.height).toBeLessThanOrEqual(500);
    await list.getByRole("link").last().focus();
    await expect(list.getByRole("link").last()).toBeFocused();
  });

  test("on a phone the header hides while reading down, the Ask pill turns into its icon, and nothing shifts", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/ask", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ASK_ON) }));
    await page.addInitScript(() => {
      const w = window as unknown as { __shift: number };
      w.__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!entry.hadRecentInput) w.__shift += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await openPage(page, staticTier(POST));
    const html = page.locator("html");
    const header = page.locator("header.pv-header");
    const launcher = page.getByTestId("ask-launcher");
    await expect(launcher).toBeVisible();
    const before = (await page.evaluate(() => (window as unknown as { __shift: number }).__shift)) ?? 0;

    await scrollSteps(page, 1200);
    await expect(html).toHaveAttribute("data-scroll", "down");
    await expect.poll(async () => (await header.boundingBox())!.y + (await header.boundingBox())!.height).toBeLessThanOrEqual(0);
    await expect.poll(async () => { const b = (await launcher.boundingBox())!; return Math.round(b.width) === Math.round(b.height); }).toBe(true);
    await expect(launcher).toHaveAccessibleName(en.ask.dock.launcherLabel);

    await scrollSteps(page, -200, 4);
    await expect(html).not.toHaveAttribute("data-scroll");
    await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
    await expect(launcher).toContainText(en.ask.dock.launcher);

    // Scrolling itself shifts nothing (the header slides with transform, the pill keeps its height and icon).
    expect(await page.evaluate(() => (window as unknown as { __shift: number }).__shift)).toBe(before);

    // Tabbing into the hidden header (its skip link comes first) brings it back.
    await scrollSteps(page, 600);
    await expect(html).toHaveAttribute("data-scroll", "down");
    await page.keyboard.press("Tab");
    await expect(header.getByRole("link").first()).toBeFocused();
    await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
  });

  test("under reduced motion the phone header shows and hides at once", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPage(page, staticTier(POST));
    const header = page.locator("header.pv-header");
    expect(await header.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThan(0.001);
    await scrollSteps(page, 1200);
    await expect(page.locator("html")).toHaveAttribute("data-scroll", "down");
    await expect.poll(async () => (await header.boundingBox())!.y + (await header.boundingBox())!.height).toBeLessThanOrEqual(0);
    await expect(page.locator(".pv-progress")).toBeHidden();
  });
});

test.describe("impact first and pagination (owner decision 2026-11-13)", () => {
  const rest = data.floors.labs.pods.filter((p) => !(p.tier === "hero" && p.assets.length > 0)).length;
  const rows = (page: Page) => page.locator("#all-projects [data-page-item]:visible");

  test("/labs pages More projects 10 at a time, with deep links, filters and clamping", async ({ page }) => {
    await openPage(page, staticTier("/en/labs"));
    await expect(rows(page)).toHaveCount(10);
    await expect(page.locator("#key-projects [data-pod]:visible")).toHaveCount(5);
    const pager = page.getByRole("navigation", { name: en.common.pager.projects });
    await expect(pager.getByRole("link", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    await expect(pager).toContainText(`Showing 1 to 10 of ${rest}`);
    await pager.getByRole("link", { name: "Page 2" }).click();
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(pager).toContainText(`Showing 11 to 20 of ${rest}`);
    await expect(page.locator("#all-projects-title")).toBeFocused();
    // A filter returns to page 1 and pages only what it leaves visible.
    await page.getByRole("button", { name: /^AI Engineering/ }).click();
    await expect(page).not.toHaveURL(/[?&]page=/);
    const ai = data.floors.labs.pods.filter((p) => p.wing === "ai" && !(p.tier === "hero" && p.assets.length > 0)).length;
    await expect(rows(page)).toHaveCount(Math.min(10, ai));
    await openPage(page, staticTier("/en/labs?page=99"));
    await expect(page).toHaveURL(new RegExp(`[?&]page=${Math.ceil(rest / 10)}`));
    await expect(rows(page)).toHaveCount(rest - (Math.ceil(rest / 10) - 1) * 10);
  });

  test("/library pages the Blog 6 at a time, the lead post on page 1", async ({ page }) => {
    const posts = content.floors.library.posts.length;
    await openPage(page, staticTier("/en/library"));
    const items = page.locator("#posts [data-page-item]:visible");
    await expect(items).toHaveCount(Math.min(6, posts));
    await expect(page.locator("#posts article[data-page-item]")).toBeVisible();
    await openPage(page, staticTier("/en/library?posts=2"));
    await expect(items).toHaveCount(Math.min(6, posts - 6));
    await expect(page.locator("#posts article[data-page-item]")).toBeHidden();
    await expect(page.locator("#research [data-topic-row]:visible").first()).toBeVisible();
  });

  test("without JavaScript every project and post shows and no pager renders", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(staticTier("/en/labs"));
    await expect(rows(page)).toHaveCount(rest);
    await expect(page.locator("[data-pager]")).toBeHidden();
    await page.goto(staticTier("/en/library"));
    await expect(page.locator("#posts [data-page-item]:visible")).toHaveCount(content.floors.library.posts.length);
    await context.close();
  });

  test("case studies lead with impact: the strip never shows scale, scale is one muted line, key projects have 8 chapters", async ({ page }) => {
    await openPage(page, staticTier("/en/labs/vendor-management-portal"));
    const strip = page.getByTestId("metric-strip");
    await expect(strip).not.toContainText("6 weeks");
    await expect(strip.locator("[data-delta='full']").first()).toContainText("to");
    await expect(page.getByTestId("scale-line")).toContainText("6 weeks");
    for (const slug of ["voice-ai-contact-center", "ai-app-accelerator", "ai-solutions-assistant"]) {
      await openPage(page, staticTier(`/en/labs/${slug}`));
      await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link")).toHaveCount(8);
    }
  });

  test("the landing shows impact and credentials, PR counts only in the footnote", async ({ page }) => {
    await openPage(page, staticTier("/en"));
    await expect(page.getByTestId("hero-proof")).not.toContainText("1,190+");
    // The hero proof is general, not one project's number (owner request 2026-11-13).
    await expect(page.getByTestId("hero-proof").locator("[data-stat='production-ai-industries']")).toContainText("5+");
    await expect(page.getByTestId("scale-note")).toContainText("1,190+");
    await expect(page.locator("#stats [data-stat='prs-merged-2026']")).toHaveCount(0);
  });
});
