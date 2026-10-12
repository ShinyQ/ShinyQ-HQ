import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectRenderBudget, enterFloorRoute, enterHQ, openPage, snapshot, waitForFloor, waitForRoom } from "./hq";
import enMessages from "../messages/en.json";
import content from "../content/site-content.json";
import { ROOF_STOPS } from "../src/experience/floors/roof/layout";

test.describe.configure({ timeout: 150_000 });

const BLOG_POST = "the-sun-the-moon-and-the-dark-sea";

/** The autopilot target the Director is driving to (a door pad), read from the shared rover runtime. */
async function autopilotPoint(page: Page) {
  return page.evaluate(() => {
    const r = (window as unknown as { __hq: { rover: { autopilot: { point: { x: number; z: number } } | null } } }).__hq.rover.autopilot;
    return r?.point ?? null;
  });
}

async function runMission(page: Page, missionId: string) {
  const label = content.missions.find((mission) => mission.id === missionId)!.label.en;
  await page.getByTestId("hud").getByRole("button", { name: "Ask Rover", exact: true }).click();
  await page.getByRole("dialog", { name: "Ask Rover" }).getByRole("option", { name: label }).click();
}

/** Rover parked near `point` (floor-local), within `tolerance`. */
async function expectRoverNear(page: Page, point: { x: number; z: number }, tolerance = 1.5) {
  const { rover } = await snapshot(page);
  expect(Math.hypot(rover.x - point.x, rover.z - point.z)).toBeLessThan(tolerance);
}

test.describe("deep links", () => {
  test("/en/library opens the Library in 3D once the intro played this session", async ({ page }) => {
    const errors = collectErrors(page);
    await enterFloorRoute(page, "/en/library");
    const s = await snapshot(page);
    expect(s).toMatchObject({ floor: "L4", phase: "explore", ride: null });
    await expect(page.getByTestId("boot")).toHaveCount(0);
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
    await expectRenderBudget(page);
    await page.getByRole("navigation", { name: "Elevator" }).locator('[data-floor="RF"]').click();
    await waitForFloor(page, "RF");
    await page.waitForTimeout(1500);
    await expectRenderBudget(page);
  });
});

test.describe("missions to the Library and the Roof", () => {
  test("Read my writing rides to L4 and walks to the newest post, whose drawer mirrors its /blog page", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);
    await runMission(page, "blog");
    const bar = page.getByTestId("walk-bar");
    await expect(bar).toBeVisible({ timeout: 60_000 });
    await expect(bar).toHaveAttribute("data-status", "arrived", { timeout: 90_000 });
    const room = (await bar.getAttribute("data-stop"))!;
    expect(room.startsWith("L4:")).toBe(true);
    await waitForRoom(page, room);
    expect((await snapshot(page)).floor).toBe("L4");
    const stop = await autopilotPoint(page);
    expect(stop).not.toBeNull();
    await expectRoverNear(page, stop!);
    const post = content.floors.library.posts.find((p) => `L4:${p.slug}` === room)!;
    const panel = page.getByTestId("room-drawer");
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText(post.title.en);
    // A hosted post mirrors its page URL; the walk prompt never shows over a mission's walk.
    await expect(page).toHaveURL(new RegExp(`/en/blog/${post.slug}\\?tier=lite$`));
    await expect(page.getByTestId("walk-prompt")).toHaveCount(0);
    const read = panel.getByRole("link", { name: "Read post" });
    await expect(read).toHaveAttribute("href", `/en/blog/${post.slug}`);
    await read.click();
    await expect(page.getByTestId("hq")).toHaveCount(0);
    await expect(page.locator("h1").first()).toHaveText(post.title.en);
    expect(errors).toEqual([]);
  });

  test("a post opened in 3D goes back to /library, and its /blog link reloads as the article page", async ({ page }) => {
    await enterFloorRoute(page, "/en/library");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox")).toBeFocused();
    await page.keyboard.type("The Sun, The Moon");
    await page.keyboard.press("Enter");
    await waitForRoom(page, `L4:${BLOG_POST}`);
    await expect(page).toHaveURL(new RegExp(`/en/blog/${BLOG_POST}\\?tier=lite$`));
    await page.goBack();
    await expect(page).toHaveURL(/\/en\/library\?tier=lite$/);
    await expect.poll(async () => (await snapshot(page)).phase).toBe("explore");
    // The post route is the article page itself (no 3D gate), so a shared /blog link lands on the post.
    await page.goto(`/en/blog/${BLOG_POST}?tier=lite`);
    await expect(page.getByTestId("hq")).toHaveCount(0);
    const post = content.floors.library.posts.find((p) => p.slug === BLOG_POST)!;
    await expect(page.locator("h1").first()).toHaveText(post.title.en);
  });

  test("hire rides to the Roof, parks at the comms terminals and copies the email", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await enterHQ(page);
    await runMission(page, "hire");
    await waitForRoom(page, "RF:contact");
    await expectRoverNear(page, ROOF_STOPS.contact);
    await expect(page).toHaveURL(/\/en\/contact\?tier=lite$/);
    const panel = page.getByTestId("room-drawer");
    await expect(panel).toContainText(content.floors.roof.availability.en);
    await expect(panel.getByRole("link", { name: "Email me" })).toHaveAttribute("href", /^mailto:/);
    await expect(panel.getByRole("link", { name: /LinkedIn/ })).toHaveAttribute("target", "_blank");
    await panel.getByRole("button", { name: "Copy email" }).click();
    await expect(panel.getByRole("status")).toHaveText(enMessages.drawer.rooms.copied);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/^[^@\s]+@[^@\s]+$/);
    const results = await new AxeBuilder({ page }).include("[data-testid='room-drawer']").analyze();
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    // Esc closes the drawer and hands control back.
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    expect((await snapshot(page)).phase).toBe("explore");
  });

  test("cv drives to the kiosk, opens the CV viewer over the tower and links the one CV PDF", async ({ page }) => {
    await enterFloorRoute(page, "/en/library");
    await runMission(page, "cv");
    await waitForRoom(page, "RF:cv");
    await expectRoverNear(page, ROOF_STOPS.cv);
    await expect(page).toHaveURL(/\/en\/contact\?tier=lite$/);
    const panel = page.getByTestId("room-drawer");
    const pdf = panel.getByTestId("cv-pdf");
    await expect(pdf).toHaveCount(1);
    await expect(pdf).toHaveAttribute("href", "/cv/kurniadi-ahmad-wijaya-cv.pdf");
    const response = await page.request.get("/cv/kurniadi-ahmad-wijaya-cv.pdf");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("pdf");
    const download = page.waitForEvent("download");
    await pdf.click();
    expect((await download).suggestedFilename()).toBe("kurniadi-ahmad-wijaya-cv.pdf");
    await expect(panel.getByRole("link", { name: "Open the CV page" })).toHaveAttribute("href", "/en/cv");
    await panel.getByRole("button", { name: "View CV" }).click();
    const viewer = page.getByRole("dialog", { name: "CV", exact: true });
    await expect(viewer.getByRole("button", { name: "Close CV" })).toBeFocused();
    // Esc closes the viewer only; the room stays open.
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "View CV" })).toBeFocused();
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
    const link = page.getByTestId("room-drawer").getByRole("link", { name: enMessages.drawer.external });
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
    await expectRoverNear(page, (await autopilotPoint(page))!);
    await drawer.getByRole("button", { name: /Indonesian Digital Wallet/ }).click();
    const paper = page.getByRole("dialog", { name: /Indonesian Digital Wallet/ });
    await expect(paper.getByTestId("paper-abstract")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(paper).toBeHidden();
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Read the paper" }).first().click();
    const reader = page.getByTestId("paper-viewer-modal");
    await expect(reader.getByRole("img", { name: /, page 1 of \d+$/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(reader).toBeHidden();
    await expect(drawer).toBeVisible();
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

test("a paper opens its preview modal with the abstract, citations and new-tab links, no iframes", async ({ page }) => {
  await openPage(page, "/en/library?tier=static");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const research = page.locator("#research");
  await research.getByRole("button", { name: /Study on the Dynamics of COVID-19/ }).click();
  const dialog = page.getByRole("dialog", { name: /Study on the Dynamics of COVID-19/ });
  await expect(dialog.getByRole("button", { name: "Close paper preview" })).toBeFocused();
  await expect(dialog.getByTestId("paper-abstract")).toContainText("N-BEATS");
  await dialog.getByRole("button", { name: "BibTeX" }).click();
  await expect(dialog.getByTestId("paper-citation")).toContainText("@inproceedings{atmajaya2021study,");
  await dialog.getByRole("button", { name: "Copy citation" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Citation copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^@inproceedings\{atmajaya2021study,/);
  await expect(dialog.getByRole("link", { name: /DOI 10\.1109\/icicyta53712/ })).toHaveAttribute("rel", "noopener noreferrer");
  await expect(dialog.getByRole("link", { name: /Google Scholar/ })).toHaveAttribute("target", "_blank");
  await expect(page.locator("iframe")).toHaveCount(0);
  const results = await new AxeBuilder({ page }).include("[data-testid='paper-dialog']").analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(research.getByRole("button", { name: /Study on the Dynamics of COVID-19/ })).toBeFocused();
});

test("a self-hosted paper opens in the paper reader: page images, zoom, download, IEEE notice, back to the abstract", async ({ page }) => {
  await openPage(page, "/en/library?tier=static");
  const research = page.locator("#research");
  const row = research.getByTestId("research-row").filter({ hasText: "Indonesian Digital Wallet" });
  const read = row.getByRole("link", { name: "Read the paper" });
  await expect(read).toHaveAttribute("href", "/papers/ewallet-sentiment-cnn-lstm.pdf");
  // Papers without a hosted PDF (the IEEE final version is not allowed) have no reader.
  await expect(research.getByTestId("research-row").filter({ hasText: "Study on the Dynamics of COVID-19" }).getByRole("link", { name: "Read the paper" })).toHaveCount(0);

  await read.click();
  const dialog = page.getByRole("dialog", { name: "Indonesian Digital Wallet Sentiment Analysis Using CNN and LSTM Method" });
  const reader = dialog.getByTestId("paper-viewer-modal");
  await expect(dialog.getByRole("button", { name: "Close paper preview" })).toBeFocused();
  await expect(reader.getByTestId("paper-reader-meta")).toHaveText("7 pages · Authors' manuscript");
  const first = reader.getByRole("img", { name: "Indonesian Digital Wallet Sentiment Analysis Using CNN and LSTM Method, page 1 of 7" });
  await expect(first).toBeVisible();
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1400);
  await expect(reader.getByRole("img")).toHaveCount(7);
  await expect(reader.getByTestId("paper-notice")).toContainText("Personal use of this material is permitted. Permission from IEEE must be obtained for all other uses");
  await expect(reader.getByTestId("paper-notice").getByRole("link")).toHaveAttribute("href", "https://doi.org/10.1109/icaibda53487.2021.9689712");
  await expect(reader.getByTestId("paper-download")).toHaveAttribute("href", "/papers/ewallet-sentiment-cnn-lstm.pdf");
  await expect(reader.getByTestId("paper-open-tab")).toHaveAttribute("rel", "noopener noreferrer");
  await reader.getByRole("button", { name: "Zoom in" }).click();
  await expect(reader.getByTestId("paper-zoom")).toHaveText(/125%/);
  const pdf = await page.request.get("/papers/ewallet-sentiment-cnn-lstm.pdf");
  expect(pdf.headers()["content-type"]).toContain("pdf");
  await expect(page.locator("iframe")).toHaveCount(0);
  const results = await new AxeBuilder({ page }).include("[data-testid='paper-dialog']").analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  await reader.getByRole("button", { name: "Abstract and citation" }).click();
  await expect(dialog.getByTestId("paper-abstract")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Read the paper" })).toBeFocused();
  await expect(dialog.getByTestId("paper-document")).toContainText("7 pages, PDF on this site");
  await dialog.getByRole("button", { name: "Read the paper" }).click();
  await expect(dialog.getByRole("button", { name: "Abstract and citation" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(read).toBeFocused();
});

test("the thesis reader shows the redacted PDF as a full-screen sheet on phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPage(page, "/id/library?tier=static");
  const row = page.locator("#research").getByTestId("research-row").filter({ hasText: "Sentiboard" });
  await row.getByRole("link", { name: "Baca makalah" }).click();
  const dialog = page.getByTestId("paper-dialog");
  await expect(dialog.getByTestId("paper-reader-meta")).toHaveText("18 halaman · Data pribadi disamarkan");
  await expect(dialog.getByRole("img", { name: "Sentiboard: University Sentiment Dashboard Using IndoBERT, halaman 1 dari 18" })).toBeVisible();
  await expect(dialog.getByTestId("paper-notice")).toHaveCount(0);
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBe(390);
  expect(box.height).toBe(844);
});
