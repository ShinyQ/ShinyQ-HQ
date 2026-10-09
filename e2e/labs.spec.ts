import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { asReturningVisitor, collectErrors, enterHQ, waitForFloor, waitForHQ, waitForPhase } from "./hq";
import { content, heroPod } from "./routes";
import en from "../messages/en.json";
import data from "../content/site-content.json";

test.describe.configure({ timeout: 150_000 });

type HQ = { __hq: { store: { getState: () => { phase: string; floor: string; activeRoom: string | null; drawerTab: string } } } };

const heroes = (["software", "ai"] as const).flatMap((wing) =>
  content.floors.labs.pods.filter((p) => p.wing === wing && p.tier === "hero").map((p) => p.slug),
);

async function state(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as HQ).__hq.store.getState();
    return { phase: s.phase, floor: s.floor, activeRoom: s.activeRoom, drawerTab: s.drawerTab };
  });
}

async function waitForRoom(page: Page, room: string, timeout = 90_000) {
  await page.waitForFunction(
    (r) => {
      const s = (window as unknown as HQ).__hq.store.getState();
      return s.activeRoom === r && s.phase === "room";
    },
    room,
    { timeout },
  );
}

/** Opens a pod route in 3D (lite tier) as a returning visitor. */
async function openPod(page: Page, slug = heroPod.slug, query = "") {
  await asReturningVisitor(page);
  await page.goto(`/en/labs/${slug}?tier=lite${query}`);
  await waitForHQ(page);
}

test.describe("L3 Labs in 3D", () => {
  test("Ctrl+K drives to a pod and opens the drawer; Esc restores the floor URL", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await page.keyboard.type("voice");
    await expect(palette.getByRole("option").first()).toContainText(data.floors.labs.pods.find((pod) => pod.slug === "voice-ai-contact-center")!.title.en);
    await page.keyboard.press("Enter");
    await waitForFloor(page, "L3").catch(() => undefined);
    await waitForRoom(page, "L3:voice-ai-contact-center");
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("heading", { level: 2 })).toHaveText(data.floors.labs.pods.find((pod) => pod.slug === "voice-ai-contact-center")!.title.en);
    await expect(page).toHaveURL(/\/en\/labs\/voice-ai-contact-center\?tier=lite$/);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/en\/labs\?tier=lite$/);
    expect((await state(page)).phase).toBe("explore");
    expect(errors).toEqual([]);
  });

  test("a deep link opens L3 at the pod with the drawer, skipping boot and intro", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
    await page.goto(`/en/labs/${heroPod.slug}?tier=lite`);
    await waitForHQ(page);
    await waitForRoom(page, `L3:${heroPod.slug}`, 30_000);
    await expect(page.getByTestId("boot")).toHaveCount(0);
    expect((await state(page)).floor).toBe("L3");
    const drawer = page.getByRole("dialog", { name: /.+/ }).and(page.getByTestId("room-drawer"));
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("tab")).toHaveText(Object.values(en.drawer.tabs));
    await drawer.getByRole("tab", { name: "Results" }).click();
    await expect(drawer.getByTestId("metric").first()).toBeVisible();
    // Next pod in the wing replaces the URL.
    await drawer.getByRole("button", { name: /^Next room/ }).click();
    await expect(page).toHaveURL(/\/en\/labs\/(?!voice-ai-contact-center)[a-z0-9-]+\?tier=lite$/);
  });

  test("the /labs route starts on L3 in explore", async ({ page }) => {
    await asReturningVisitor(page);
    await page.goto("/en/labs?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    expect((await state(page)).floor).toBe("L3");
    await expect(page.getByTestId("room-drawer")).toHaveCount(0);
  });

  test("hologram view: fly-in, prev/next hero pods, Esc back to the drawer", async ({ page }) => {
    const errors = collectErrors(page);
    await openPod(page);
    await waitForRoom(page, `L3:${heroPod.slug}`, 30_000);
    await page.getByTestId("room-drawer").getByRole("button", { name: "View architecture" }).first().click();
    await waitForPhase(page, "hologram");
    const hologram = page.getByTestId("hologram");
    await expect(hologram).toBeVisible();
    await expect(page).toHaveURL(/view=architecture/);
    await expect(page.getByTestId("hologram-results").getByTestId("metric").first()).toBeVisible();
    const index = heroes.indexOf(heroPod.slug);
    await page.keyboard.press("ArrowRight");
    const next = heroes[(index + 1) % heroes.length];
    await expect(hologram).toHaveAttribute("data-room", `L3:${next}`);
    await expect(page).toHaveURL(new RegExp(`/en/labs/${next}\\?tier=lite&view=architecture$`));
    await page.getByRole("button", { name: en.drawer.hologram.prev }).click();
    await expect(hologram).toHaveAttribute("data-room", `L3:${heroPod.slug}`);
    await page.keyboard.press("Escape");
    await waitForRoom(page, `L3:${heroPod.slug}`);
    await expect(page.getByTestId("room-drawer")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/en/labs/${heroPod.slug}\\?tier=lite$`));
    expect(errors).toEqual([]);
  });

  test("?view=architecture deep links straight into the hologram", async ({ page }) => {
    await openPod(page, heroPod.slug, "&view=architecture");
    await waitForPhase(page, "hologram", 30_000);
    await expect(page.getByTestId("hologram")).toHaveAttribute("data-room", `L3:${heroPod.slug}`);
  });

  test("README easter egg toggles with t and from the overflow menu", async ({ page }) => {
    await openPod(page);
    await waitForRoom(page, `L3:${heroPod.slug}`, 30_000);
    await page.keyboard.press("t");
    const readme = page.getByTestId("readme");
    await expect(readme).toContainText("$ cat README.md");
    await expect(readme).toContainText("\u250C");
    await page.keyboard.press("t");
    await expect(readme).toBeHidden();
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("button", { name: /README/ }).click();
    await expect(page.getByTestId("readme")).toBeVisible();
  });

  test("the drawer has no serious accessibility violations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openPod(page);
    await waitForRoom(page, `L3:${heroPod.slug}`, 30_000);
    const results = await new AxeBuilder({ page }).include("[data-testid='room-drawer']").analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

test("mobile: the drawer is a bottom sheet with snap points", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await openPod(page);
  await waitForRoom(page, `L3:${heroPod.slug}`, 30_000);
  const drawer = page.getByTestId("room-drawer");
  await expect(drawer).toHaveAttribute("data-layout", "sheet");
  const collapsed = await drawer.boundingBox();
  expect(collapsed?.width).toBe(390);
  expect(Math.round((collapsed?.height ?? 0) / 844 * 100)).toBe(45);
  await page.getByTestId("sheet-handle").click();
  await expect.poll(async () => Math.round(((await drawer.boundingBox())?.height ?? 0) / 844 * 100)).toBe(92);
  await page.getByRole("button", { name: "Close room" }).click();
  await expect(drawer).toBeHidden();
  await context.close();
});
