import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { enterFloorRoute, enterHQ, snapshot, waitForFloor, waitForRoom } from "./hq";

test.describe.configure({ timeout: 150_000 });

const BLOG_POST = "the-sun-the-moon-and-the-dark-sea";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function runMission(page: Page, label: RegExp) {
  await page.getByTestId("hud").getByRole("button", { name: "Missions" }).click();
  await page.getByRole("dialog", { name: "Rover Terminal" }).getByRole("option", { name: label }).click();
}

/** Rover parked near `point` (floor-local), within `tolerance`. */
async function expectRoverNear(page: Page, point: { x: number; z: number }, tolerance = 1.5) {
  const { rover } = await snapshot(page);
  expect(Math.hypot(rover.x - point.x, rover.z - point.z)).toBeLessThan(tolerance);
}

test.describe("deep links", () => {
  test("/en/library opens the Library in 3D without boot or intro", async ({ page }) => {
    const errors = collectErrors(page);
    await enterFloorRoute(page, "/en/library");
    const s = await snapshot(page);
    expect(s).toMatchObject({ floor: "L4", phase: "explore", ride: null });
    await expect(page.getByTestId("boot")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Skip intro" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/en\/library\?tier=lite$/);
    await expect(page.getByTestId("floor-announcer")).toContainText("L4");
    // The HTML page stays underneath for SEO.
    await expect(page.locator("#site-shell")).toHaveAttribute("inert", "");
    await expect(page.locator("#posts")).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("/id/contact opens the Roof in Indonesian", async ({ page }) => {
    await enterFloorRoute(page, "/id/contact");
    expect((await snapshot(page)).floor).toBe("RF");
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    await expect(page).toHaveURL(/\/id\/contact\?tier=lite$/);
  });

  test("riding to L4 and RF writes their routes", async ({ page }) => {
    await enterHQ(page);
    const panel = page.getByRole("navigation", { name: "Elevator" });
    await panel.locator('[data-floor="L4"]').click();
    await waitForFloor(page, "L4");
    await expect(page).toHaveURL(/\/en\/library\?tier=lite$/);
    await panel.locator('[data-floor="RF"]').click();
    await waitForFloor(page, "RF");
    await expect(page).toHaveURL(/\/en\/contact\?tier=lite$/);
    // Built floors do not show the "under construction" notice.
    await expect(page.getByText(/under construction in 3D/)).toHaveCount(0);
  });

  test("the language toggle resumes on the Roof", async ({ page }) => {
    await enterFloorRoute(page, "/en/contact");
    await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "ID" }).click();
    await expect(page).toHaveURL(/\/id\/contact\?tier=lite$/);
    await page.waitForFunction(() => Boolean((window as unknown as { __hq?: unknown }).__hq));
    expect((await snapshot(page)).floor).toBe("RF");
  });

  test("L4 and RF stay under the draw call budget", async ({ page }) => {
    await enterFloorRoute(page, "/en/library");
    await page.waitForTimeout(1500);
    expect((await snapshot(page)).drawCalls).toBeLessThan(150);
    await page.getByRole("navigation", { name: "Elevator" }).locator('[data-floor="RF"]').click();
    await waitForFloor(page, "RF");
    await page.waitForTimeout(1500);
    expect((await snapshot(page)).drawCalls).toBeLessThan(150);
  });
});

test.describe("missions to the Library and the Roof", () => {
  test("blog rides to L4, drives to the spine and opens the post", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);
    await runMission(page, /Read the blog/);
    await waitForRoom(page, `L4:${BLOG_POST}`);
    const s = await snapshot(page);
    expect(s.floor).toBe("L4");
    const stop = await page.evaluate(() => {
      const r = (window as unknown as { __hq: { rover: { autopilot: { point: { x: number; z: number } } | null } } }).__hq.rover.autopilot;
      return r?.point ?? null;
    });
    expect(stop).not.toBeNull();
    await expectRoverNear(page, stop!);
    const panel = page.getByTestId("room-drawer");
    await expect(panel).toHaveAttribute("data-room", `L4:${BLOG_POST}`);
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText("The Sun, The Moon, and The Dark Sea");
    await expect(panel).toContainText("ID");
    // Opening a hosted post mirrors its page URL.
    await expect(page).toHaveURL(new RegExp(`/en/blog/${BLOG_POST}\\?tier=lite$`));
    const read = panel.getByRole("link", { name: "Read post" });
    await expect(read).toHaveAttribute("href", `/en/blog/${BLOG_POST}`);
    await read.click();
    await expect(page.getByTestId("hq")).toHaveCount(0);
    await expect(page.locator("h1").first()).toContainText("The Sun");
    expect(errors).toEqual([]);
  });

  test("hire rides to the Roof, parks at the comms terminals and copies the email", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await enterHQ(page);
    await runMission(page, /Hire \/ contact/);
    await waitForRoom(page, "RF:contact");
    await expectRoverNear(page, { x: 0, z: 6.8 });
    await expect(page).toHaveURL(/\/en\/contact\?tier=lite$/);
    const panel = page.getByTestId("room-drawer");
    await expect(panel).toContainText("Open to interesting software and AI engineering conversations");
    await expect(panel.getByRole("link", { name: "Email me" })).toHaveAttribute("href", /^mailto:/);
    await expect(panel.getByRole("link", { name: /LinkedIn/ })).toHaveAttribute("target", "_blank");
    await panel.getByRole("button", { name: "Copy email" }).click();
    await expect(panel.getByRole("status")).toHaveText("Copied ^_^");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/^[^@\s]+@[^@\s]+$/);
    const results = await new AxeBuilder({ page }).include("[data-testid='room-drawer']").analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    // Esc closes the drawer and hands control back.
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    expect((await snapshot(page)).phase).toBe("explore");
  });

  test("cv drives to the kiosk and links the per-locale PDFs", async ({ page }) => {
    await enterFloorRoute(page, "/en/library");
    await runMission(page, /Download CV/);
    await waitForRoom(page, "RF:cv");
    await expectRoverNear(page, { x: 10, z: 9.4 });
    await expect(page).toHaveURL(/\/en\/contact\?tier=lite$/);
    const panel = page.getByTestId("room-drawer");
    const en = panel.getByTestId("cv-pdf-en");
    await expect(en).toHaveAttribute("href", "/cv/kurniadi-ahmad-wijaya-cv-en.pdf");
    await expect(panel.getByTestId("cv-pdf-id")).toHaveAttribute("href", "/cv/kurniadi-ahmad-wijaya-cv-id.pdf");
    const response = await page.request.get("/cv/kurniadi-ahmad-wijaya-cv-en.pdf");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("pdf");
    const download = page.waitForEvent("download");
    await en.click();
    expect((await download).suggestedFilename()).toBe("kurniadi-ahmad-wijaya-cv-en.pdf");
    await expect(panel.getByRole("link", { name: "Open the CV page" })).toHaveAttribute("href", "/en/cv");
  });

  test("a Medium post from the palette opens in a new tab", async ({ page }) => {
    await enterFloorRoute(page, "/en/library");
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette.getByRole("combobox")).toBeFocused();
    await page.keyboard.type("CRUD");
    await expect(palette.getByRole("option").first()).toContainText("CRUD");
    await page.keyboard.press("Enter");
    await waitForRoom(page, "L4:crud-nodejs-express-mysql");
    const link = page.getByTestId("room-drawer").getByRole("link", { name: /Read the post/ });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("href", /^https:\/\/kurniadiahmadwijaya\.medium\.com\//);
    // Medium posts have no /blog page: the URL stays on the floor route.
    await expect(page).toHaveURL(/\/en\/library\?tier=lite$/);
  });

  test("shelves keep the floor URL and Esc closes the drawer", async ({ page }) => {
    await enterFloorRoute(page, "/en/library");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox")).toBeFocused();
    await page.keyboard.type("Talks stage");
    await page.keyboard.press("Enter");
    await waitForRoom(page, "L4:talks");
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer.getByRole("heading", { level: 2 })).toHaveText("Talks stage");
    await expect(drawer).toContainText("Microsoft Agent Framework");
    await expect(page).toHaveURL(/\/en\/library\?tier=lite$/);
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    expect((await snapshot(page)).phase).toBe("explore");
  });

  test("the Research shelf opens from Cmd-K with highlighted authors and DOIs", async ({ page }) => {
    await enterFloorRoute(page, "/en/library");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox")).toBeFocused();
    await page.keyboard.type("Research shelf");
    await page.keyboard.press("Enter");
    await waitForRoom(page, "L4:research");
    const drawer = page.getByTestId("room-drawer");
    await expect(drawer.getByTestId("research-item")).toHaveCount(4);
    await expect(drawer.locator("strong", { hasText: "Kurniadi Ahmad Wijaya" }).first()).toBeVisible();
    await expect(drawer.getByRole("link", { name: /DOI 10\.1109\/icaibda53487/ })).toHaveAttribute("href", "https://doi.org/10.1109/icaibda53487.2021.9689712");
    await expect(page).toHaveURL(/\/en\/library\?tier=lite$/);
    await expectRoverNear(page, { x: 22.2, z: -7 });
  });
});

test("the static Library page has a Research section", async ({ page }) => {
  await page.goto("/en/library?tier=static");
  const research = page.locator("#research");
  await expect(research.getByRole("heading", { name: "Research", exact: true })).toBeVisible();
  await expect(research.getByRole("link", { name: /DOI 10\.1109\/icicyta53712/ })).toHaveAttribute("href", "https://doi.org/10.1109/icicyta53712.2021.9689122");
  await expect(research.getByRole("link", { name: /Google Scholar/ })).toHaveAttribute("href", "https://scholar.google.com/citations?user=u8OY1foAAAAJ");
  await expect(research).toContainText("as of Oct 2026");
});
