import { expect, test, type Page } from "@playwright/test";
import { openPage } from "./hq";
import { heroPod } from "./routes";
import data from "../content/site-content.json";
import en from "../messages/en.json";

/**
 * The closing section (owner decision 2026-11-01): the landing, every case study and the CV page end with the
 * availability line, the email, About and contact and View CV; a case study adds "Ask Rover about this project".
 * Static tier, so the HTML page is what renders; `/api/ask` is mocked (the static server has no Functions).
 */
const AS_OF = "2026-11-01";
const availability = data.floors.roof.availability.en;
const email = data.floors.roof.contact.email;
const heroTitle = data.floors.labs.pods.find((p) => p.slug === heroPod.slug)!.title.en;

async function mockAsk(page: Page, enabled: boolean) {
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/ask", async (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled, turnstileSiteKey: null, asOf: AS_OF, maxLength: 300 }) });
    posts.push(request.postDataJSON() as Record<string, unknown>);
    const frames = [{ delta: "He built it." }, { done: true, outcome: "answer", source: "primary", asOf: AS_OF, tags: ["work"] }];
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join("") });
  });
  return posts;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hq:terminal-seen", "1");
    localStorage.setItem("hq:onboarded", "done");
    sessionStorage.setItem("hq:ask-teaser", "1");
  });
});

test("a case study ends with the closing section, and its Ask button asks about the project", async ({ page }) => {
  const posts = await mockAsk(page, true);
  await openPage(page, `/en/labs/${heroPod.slug}?tier=static`);
  const closing = page.getByTestId("closing-cta");
  await expect(closing).toHaveCount(1);
  await expect(closing.getByRole("heading", { level: 2 })).toHaveText(availability);
  await expect(closing.getByRole("link", { name: email })).toHaveAttribute("href", `mailto:${email}`);
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
  await mockAsk(page, false);
  const status = page.waitForResponse((r) => r.url().endsWith("/api/ask") && r.request().method() === "GET");
  await openPage(page, `/en/labs/${heroPod.slug}?tier=static`);
  await status;
  const closing = page.getByTestId("closing-cta");
  await expect(closing.getByTestId("case-ask")).toHaveCount(0);
  await expect(closing.getByRole("link", { name: email })).toBeVisible();
});

test("the CV page ends with the closing section without a second View CV", async ({ page }) => {
  await openPage(page, "/en/cv?tier=static");
  const closing = page.getByTestId("closing-cta");
  await expect(closing.getByRole("heading", { level: 2 })).toHaveText(availability);
  await expect(closing.getByRole("link", { name: email })).toBeVisible();
  await expect(closing.getByRole("link", { name: en.common.viewCv })).toHaveCount(0);
  await expect(closing.getByTestId("case-ask")).toHaveCount(0);
});

test("the landing keeps one closing section at #contact", async ({ page }) => {
  await openPage(page, "/en?tier=static");
  await expect(page.locator("#contact")).toHaveCount(1);
  await expect(page.getByTestId("closing-cta").getByRole("link", { name: en.common.viewCv })).toBeVisible();
  await expect(page.getByTestId("case-ask")).toHaveCount(0);
});
