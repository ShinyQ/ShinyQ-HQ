import { expect, test, type Browser, type Page } from "@playwright/test";
import { asReturningVisitor, enterFloorRoute, waitForHQ, waitForHydration, waitForRoom } from "./hq";
import { heroPod, hostedPost } from "./routes";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { SITE_URL } from "../src/lib/site";

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
  const nav = page.getByRole("navigation", { name: en.nav.label });
  await nav.getByRole("link", { name: en.nav.journey, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/journey\?.*view=classic/);
  await expect(page.getByTestId("hq")).toHaveCount(0);
  await nav.getByRole("link", { name: en.nav.work, exact: true }).click();
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

  expect(hostedPost, "a hosted post exists in the dataset").toBeDefined();
  const post = hostedPost!;
  await page.goto(`/en/blog/${post.slug}?view=classic&tier=lite`);
  await waitForHydration(page);
  const postShare = page.getByRole("group", { name: en.common.share });
  await postShare.getByRole("button", { name: en.common.copyClassicLink }).click();
  await expect(postShare.getByRole("button", { name: en.common.linkCopied })).toBeVisible();
  expect(await read()).toMatch(new RegExp(`^https?://[^/]+/en/blog/${post.slug}\\?view=classic$`));
  await postShare.getByRole("button", { name: en.common.copy3dLink }).click();
  await expect(postShare.getByRole("button", { name: en.common.linkCopied })).toBeVisible();
  expect(await read()).toMatch(/^https?:\/\/[^/]+\/en\/library$/);
  await context.close();
});

for (const [locale, messages] of [["en", en], ["id", id]] as const) {
  for (const failure of ["rejected", "missing"] as const) {
    test(`${locale}: failed ${failure} clipboard exposes usable links and raw email on a phone`, async ({ browser }) => {
      const context = await quietContext(browser, { viewport: { width: 390, height: 844 } });
      await context.addInitScript((kind) => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: kind === "missing" ? undefined : { writeText: async () => { throw new Error("Clipboard blocked"); } },
        });
      }, failure);
      const page = await context.newPage();
      await page.goto(`/${locale}/labs/${heroPod.slug}?view=classic&tier=static#architecture`);
      await waitForHydration(page);
      const share = page.getByRole("group", { name: messages.common.share });
      const classic = share.getByRole("button", { name: messages.common.copyClassicLink });
      await classic.click();
      const link = share.getByRole("textbox", { name: messages.common.linkCopyFailed });
      await expect(link).toHaveValue(`${SITE_URL}/${locale}/labs/${heroPod.slug}?view=classic#architecture`);
      await expect(share.getByRole("status")).toHaveText(messages.common.linkCopyFailed);
      await expect(link).toHaveAttribute("readonly", "");
      await expect(classic).toBeFocused();
      await share.getByRole("button", { name: messages.common.copy3dLink }).click();
      await expect(link).toHaveValue(`${SITE_URL}/${locale}/labs/${heroPod.slug}#architecture`);
      await page.keyboard.press("Tab");
      await expect(link).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

      await page.goto(`/${locale}/contact?view=classic&tier=static`);
      await waitForHydration(page);
      const mail = page.locator("main a[href^='mailto:']").first();
      const email = decodeURIComponent((await mail.getAttribute("href"))!.slice("mailto:".length));
      const copy = page.getByRole("button", { name: /copy.*email|salin.*email/i });
      await copy.click();
      const address = page.getByRole("textbox", { name: messages.common.emailCopyFailed });
      await expect(address).toHaveValue(email);
      await expect(copy).toBeFocused();
      await expect(mail).toHaveAttribute("href", `mailto:${email}`);
      await page.keyboard.press("Tab");
      await expect(address).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await context.close();
    });
  }

  test(`${locale}: rejected drawer copy stays in its action and keyboard trap`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("Clipboard blocked"); } },
    }));
    await asReturningVisitor(page);
    await page.goto(`/${locale}/labs/${heroPod.slug}?tier=lite`);
    await waitForHQ(page);
    await waitForRoom(page, `L3:${heroPod.slug}`);
    const drawer = page.getByTestId("room-drawer");
    await drawer.getByRole("button", { name: messages.drawer.more }).click();
    const action = drawer.getByRole("button", { name: messages.common.copyClassicLink });
    await action.click();
    const field = drawer.getByRole("textbox", { name: messages.common.linkCopyFailed });
    await expect(field).toHaveValue(`${SITE_URL}/${locale}/labs/${heroPod.slug}?view=classic`);
    await expect(action.locator("..").getByRole("textbox")).toHaveCount(1);
    await expect(action).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(field).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(action).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
}

/** Opens a pod route in 3D as a returning visitor: the deep link opens the room drawer for that pod. */
async function openPodDrawer(page: Page, slug = heroPod.slug) {
  await asReturningVisitor(page);
  await page.goto(`/en/labs/${slug}?tier=lite`);
  await waitForHQ(page);
  await waitForRoom(page, `L3:${slug}`);
  return page.getByTestId("room-drawer");
}

/** Drops the query (keeps the path) the way Next's own history sync would, so the drawer link lands on the same URL. */
const dropQuery = (page: Page) => page.evaluate(() => window.history.replaceState(window.history.state, "", window.location.pathname));

async function expectClassicHere(page: Page, path: RegExp) {
  await expect(page.getByTestId("hq")).toHaveCount(0);
  await expect(page.locator("#site-shell")).toBeVisible();
  await expect(page).toHaveURL(path);
  await expect(page.getByRole("navigation", { name: en.nav.label }).getByRole("link", { name: en.nav.work, exact: true })).toHaveAttribute(
    "href",
    /^\/en\/labs\?view=classic$/,
  );
}

test("Read case study from the drawer lands on the Classic site with ?view=classic, even on the same URL", async ({ page }) => {
  const slug = heroPod.slug;
  const drawer = await openPodDrawer(page, slug);
  await dropQuery(page);
  await expect(page).toHaveURL(new RegExp(`/en/labs/${slug}$`));
  await drawer.getByTestId("drawer-footer").getByRole("link", { name: en.common.caseStudy }).click();
  await expectClassicHere(page, new RegExp(`/en/labs/${slug}\\?view=classic$`));
  expect(await stored(page, "session")).toBe("page");
});

test("Read post from the Writing floor lands on the Classic site with ?view=classic", async ({ page }) => {
  expect(hostedPost, "a hosted post exists in the dataset").toBeDefined();
  const slug = hostedPost!.slug;
  await enterFloorRoute(page, "/en/library");
  await page.evaluate((room) => (window as unknown as { __hq: { store: { getState: () => { openRoom: (r: string) => void } } } }).__hq.store.getState().openRoom(room), `L4:${slug}`);
  await waitForRoom(page, `L4:${slug}`);
  await expect(page).toHaveURL(new RegExp(`/en/blog/${slug}(\\?|$)`));
  await dropQuery(page);
  await page.getByTestId("drawer-footer").getByRole("link", { name: en.drawer.rooms.readPost }).click();
  await expectClassicHere(page, new RegExp(`/en/blog/${slug}\\?view=classic$`));
});

test("the drawer menu copies the Classic and 3D addresses of the open room", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const read = () => page.evaluate(() => navigator.clipboard.readText());
  const slug = heroPod.slug;
  const drawer = await openPodDrawer(page, slug);
  await drawer.getByRole("button", { name: en.drawer.more }).click();
  await drawer.getByRole("button", { name: en.common.copyClassicLink }).click();
  await expect(drawer.getByRole("button", { name: en.common.linkCopied })).toBeVisible();
  expect(await read()).toMatch(new RegExp(`^https?://[^/]+/en/labs/${slug}\\?view=classic$`));
  await drawer.getByRole("button", { name: en.common.copy3dLink }).click();
  await expect(drawer.getByRole("button", { name: en.common.linkCopied })).toHaveCount(1);
  await expect.poll(read).toMatch(new RegExp(`^https?://[^/]+/en/labs/${slug}$`));
  await context.close();
});
