import { expect, test, type Browser, type Page } from "@playwright/test";
import { waitForHQ, waitForHydration } from "./hq";
import { heroPod, hostedPost } from "./routes";
import en from "../messages/en.json";

test.describe.configure({ timeout: 90_000 });

const PREFS = { "hq:terminal-seen": "1", "hq:onboarded": "done" };

/** Skips the first-visit terminal and tour; leaves `hq:view` alone so each test controls it. */
async function quietContext(browser: Browser, options: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext(options);
  await context.addInitScript((prefs) => {
    for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v);
  }, PREFS);
  return context;
}

const viewOf = (page: Page) => new URL(page.url()).searchParams.get("view");
const stored = (page: Page, area: "session" | "local") =>
  page.evaluate((a) => (a === "session" ? sessionStorage : localStorage).getItem("hq:view"), area);

test("an explicit ?view=classic opens the Classic site, keeps the parameter and leaves the canonical clean", async ({ browser }) => {
  const context = await quietContext(browser);
  const page = await context.newPage();
  await page.goto("/en/labs?view=classic&tier=lite");
  await waitForHydration(page);
  await expect(page.locator("#site-shell")).toBeVisible();
  await expect(page.getByTestId("hq")).toHaveCount(0);
  await expect(page.getByTestId("back-to-3d")).toBeVisible();
  expect(viewOf(page)).toBe("classic");
  expect(await stored(page, "session")).toBe("page");
  const canonical = await page.locator("link[rel=canonical]").getAttribute("href");
  expect(canonical).toMatch(/\/en\/labs$/);
  expect(canonical).not.toContain("view");
  expect(await page.locator("meta[property='og:url']").getAttribute("content")).not.toContain("view");
  await context.close();
});

test("navigation keeps ?view=classic and every internal page link carries it", async ({ browser }) => {
  const context = await quietContext(browser);
  const page = await context.newPage();
  await page.goto("/en?view=classic&tier=lite");
  await waitForHydration(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: /Journey/ }).click();
  await expect(page).toHaveURL(/\/en\/journey\?.*view=classic/);
  await expect(page.getByTestId("hq")).toHaveCount(0);
  await nav.getByRole("link", { name: /Work/ }).click();
  await expect(page).toHaveURL(/\/en\/labs\?.*view=classic/);
  await page.locator(`#site-shell a[href*="/labs/${heroPod.slug}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/en/labs/${heroPod.slug}\\?.*view=classic`));
  await expect(page.getByTestId("hq")).toHaveCount(0);
  await expect(page.locator("#site-shell")).toBeVisible();

  // Link hrefs are rewritten in place, so copying a link or opening it in a new tab keeps the view.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLAnchorElement>('#site-shell a[href^="/en/"], #site-shell a[href^="/id/"]'))
          .filter((a) => !a.hasAttribute("download") && !a.hasAttribute("data-hq-view") && !a.hasAttribute("data-hq-page-link"))
          .filter((a) => !/\.[a-z0-9]+$/i.test(a.pathname))
          .filter((a) => !a.search.includes("view=classic"))
          .map((a) => a.getAttribute("href")),
      ),
    )
    .toEqual([]);
  const switchLink = page.getByRole("navigation", { name: en.nav.language }).getByRole("link", { name: "ID" });
  await expect(switchLink).toHaveAttribute("href", /^\/id\/labs\/[^?]+\?.*view=classic/);
  await context.close();
});

test("?view=page is an alias that ends on ?view=classic", async ({ browser }) => {
  const context = await quietContext(browser);
  const page = await context.newPage();
  await page.goto("/en?view=page&tier=lite");
  await waitForHydration(page);
  await expect(page).toHaveURL(/\/en\?tier=lite&view=classic$/);
  await expect(page.locator("#site-shell")).toBeVisible();
  await expect(page.getByTestId("hq")).toHaveCount(0);
  await context.close();
});

test("precedence: the remembered choice, an explicit ?view=3d, and Back to 3D", async ({ browser }) => {
  const context = await quietContext(browser);
  // Seeds the remembered preference once; later writes (Back to 3D) are not overwritten.
  await context.addInitScript(() => {
    if (localStorage.getItem("hq:view") === null) localStorage.setItem("hq:view", "page");
  });
  const first = await context.newPage();
  await first.goto("/en?tier=lite");
  await waitForHydration(first);
  await expect(first.locator("#site-shell")).toBeVisible();
  await expect(first.getByTestId("hq")).toHaveCount(0);
  await expect(first).toHaveURL(/\/en\?tier=lite&view=classic$/);

  // A new tab (fresh sessionStorage) with an explicit ?view=3d opens the tower and drops the parameter.
  const second = await context.newPage();
  await second.goto("/en?view=3d&tier=lite");
  await waitForHQ(second);
  expect(viewOf(second)).toBeNull();
  expect(await stored(second, "session")).toBe("3d");
  await second.close();

  // Back to 3D from the first tab's Classic site stores the choice and removes the parameter.
  await first.goto("/en?tier=lite&view=classic");
  await waitForHydration(first);
  await first.getByTestId("back-to-3d").click();
  await waitForHQ(first);
  expect(viewOf(first)).toBeNull();
  expect(await stored(first, "local")).toBe("3d");
  expect(await stored(first, "session")).toBe("3d");
  await context.close();
});

test("copy buttons put the Classic and 3D addresses on the clipboard", async ({ browser }) => {
  const context = await quietContext(browser, { permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const read = () => page.evaluate(() => navigator.clipboard.readText());
  const slug = heroPod.slug;

  await page.goto(`/en/labs/${slug}?view=classic&tier=lite`);
  await waitForHydration(page);
  const share = page.getByRole("group", { name: en.common.share });
  await share.getByRole("button", { name: en.common.copyClassicLink }).click();
  await expect(share.getByRole("button", { name: en.common.linkCopied })).toBeVisible();
  expect(await read()).toMatch(new RegExp(`^https?://[^/]+/en/labs/${slug}\\?view=classic$`));
  await share.getByRole("button", { name: en.common.copy3dLink }).click();
  await expect(share.getByRole("button", { name: en.common.linkCopied })).toBeVisible();
  expect(await read()).toMatch(new RegExp(`^https?://[^/]+/en/labs/${slug}$`));

  if (hostedPost) {
    await page.goto(`/en/blog/${hostedPost.slug}?view=classic&tier=lite`);
    await waitForHydration(page);
    const postShare = page.getByRole("group", { name: en.common.share });
    await postShare.getByRole("button", { name: en.common.copyClassicLink }).click();
    await expect(postShare.getByRole("button", { name: en.common.linkCopied })).toBeVisible();
    expect(await read()).toMatch(new RegExp(`^https?://[^/]+/en/blog/${hostedPost.slug}\\?view=classic$`));
    await postShare.getByRole("button", { name: en.common.copy3dLink }).click();
    await expect(postShare.getByRole("button", { name: en.common.linkCopied })).toBeVisible();
    expect(await read()).toMatch(/^https?:\/\/[^/]+\/en\/library$/);
  }
  await context.close();
});
