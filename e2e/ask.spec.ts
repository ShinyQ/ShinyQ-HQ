import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";
import { asReturningVisitor, collectErrors, openPage, snapshot, waitForHQ, waitForPhase } from "./hq";

/**
 * Ask the HQ in the browser, against a mocked `/api/ask` (the static server has no Functions):
 * the shared chat dock (launcher, teaser, side panel or bottom sheet), the home hero bar, topic
 * and follow-up pills, and every entry point that opens the dock.
 * Design: docs/superpowers/specs/2026-10-11-ask-hq-design.md (sections 3, 7.3 T6/T13, 8).
 */

const AS_OF = "2026-10-01";
const AS_OF_LINE = "Answered by AI from this site, as of Oct 1, 2026";
const HOSTILE = "<img src=x onerror=alert(1)>";
const TEASER_SEEN = "hq:ask-teaser";

interface MockOptions {
  /** Status body, or a number for an error status (404: no Functions, 503: disabled). */
  status: Record<string, unknown> | number;
  deltas?: string[];
  outcome?: string;
  tags?: string[];
  /** HTTP status for POSTs (429: rate limited). */
  post?: number;
}

const sse = (deltas: string[], outcome: string, tags: string[]) =>
  [...deltas.map((delta) => ({ delta })), { done: true, outcome, source: "primary", asOf: AS_OF, tags }].map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("");

/** Routes `/api/ask` and records every request to it. */
async function mockAsk(page: Page, { status, deltas = ["Kurniadi is building ", "AI agents."], outcome = "answer", tags = ["ai", "voice"], post = 200 }: MockOptions) {
  const requests: Request[] = [];
  await page.route("**/api/ask", async (route) => {
    const request = route.request();
    requests.push(request);
    if (request.method() === "GET") {
      if (typeof status === "number") return route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: "disabled" }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(status) });
    }
    if (post !== 200) return route.fulfill({ status: post, contentType: "application/json", headers: { "retry-after": "90" }, body: JSON.stringify({ error: "rate_limited", retryAfter: 90 }) });
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(deltas, outcome, tags) });
  });
  return {
    all: requests,
    posts: () => requests.filter((r) => r.method() === "POST"),
    bodies: () => requests.filter((r) => r.method() === "POST").map((r) => r.postDataJSON() as Record<string, unknown>),
  };
}

const enabled = (turnstileSiteKey: string | null = null) => ({ enabled: true, turnstileSiteKey, asOf: AS_OF, maxLength: 300 });

const dock = (page: Page) => page.getByRole("dialog", { name: "Ask the HQ" });
const thread = (page: Page) => dock(page).getByTestId("ask-thread");

// A rendered payload would run `alert`; every test asserts that no dialog opened.
let dialogs: string[] = [];

test.beforeEach(async ({ page }, testInfo) => {
  dialogs = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  // The teaser has its own test; elsewhere it would sit next to the launcher.
  const teaser = testInfo.title.startsWith("teaser");
  await page.addInitScript(
    ({ key, teaser }) => {
      localStorage.setItem("hq:terminal-seen", "1");
      if (!teaser) sessionStorage.setItem(key, "1");
    },
    { key: TEASER_SEEN, teaser },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterEach(() => {
  expect(dialogs).toEqual([]);
});

test("no POST and no Turnstile before interaction; the status loads once on idle", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (r) => r.url().includes("challenges.cloudflare.com") && scripts.push(r.url()));
  const api = await mockAsk(page, { status: enabled("site-key") });
  await openPage(page, "/en/labs?tier=static");
  await expect(page.getByTestId("ask-launcher")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(api.all.map((r) => r.method())).toEqual(["GET"]);
  expect(scripts).toEqual([]);
});

test("Page View launcher: topic, pill, inert answer, follow-ups, Esc", async ({ page }) => {
  const errors = collectErrors(page);
  const api = await mockAsk(page, { status: enabled(), deltas: ["Here is markup: ", HOSTILE, " and text."] });
  await openPage(page, "/en/labs?tier=static");
  const launcher = page.getByTestId("ask-launcher");
  await launcher.click();
  await expect(dock(page)).toHaveAttribute("data-layout", "side");
  await expect(dock(page)).toHaveAttribute("aria-modal", "false");
  await expect(dock(page).getByRole("textbox", { name: "Your question" })).toBeFocused();

  await dock(page).getByTestId("ask-topics").getByRole("button", { name: "AI" }).click();
  await dock(page).getByRole("button", { name: "How does the voice AI contact center work?", exact: true }).click();
  await expect(thread(page)).toContainText(`Here is markup: ${HOSTILE} and text.`);
  await expect(thread(page)).toContainText(AS_OF_LINE);
  await expect(thread(page).locator("img")).toHaveCount(0);
  expect(api.bodies()[0]).toEqual({ q: "How does the voice AI contact center work?", locale: "en", source: "pill" });

  const followUps = dock(page).getByTestId("ask-followups");
  await expect(followUps.getByRole("button", { name: "What latency did the voice agent reach?", exact: true })).toBeVisible();
  await followUps.getByRole("button", { name: "What latency did the voice agent reach?", exact: true }).click();
  await expect.poll(() => api.posts().length).toBe(2);
  expect(api.bodies()[1]).toMatchObject({ q: "What latency did the voice agent reach?", source: "followup" });
  await expect(thread(page).locator("[data-role='user']")).toHaveCount(2);

  await page.keyboard.press("Escape");
  await expect(dock(page)).toBeHidden();
  await expect(launcher).toBeFocused();
  expect(errors).toEqual([]);
});

test("hero bar: typing a question or a topic opens the dock", async ({ page }) => {
  const api = await mockAsk(page, { status: enabled() });
  await openPage(page, "/en?tier=static");
  const hero = page.getByTestId("ask-hero");
  await expect(hero).toBeVisible();
  await expect(page.locator("#ask")).toHaveCount(0);
  const input = hero.getByRole("textbox", { name: "Ask AI about my work" });
  await input.fill("What is he building now?");
  await input.press("Enter");
  await expect(thread(page)).toContainText("Kurniadi is building AI agents.");
  expect(api.bodies()[0]).toEqual({ q: "What is he building now?", locale: "en", source: "hero" });
  await dock(page).getByRole("button", { name: "Close chat" }).click();

  await hero.getByRole("button", { name: "Career" }).click();
  await expect(dock(page).getByTestId("ask-topic-questions")).toHaveAttribute("data-topic", "career");
  // The thread survives closing the dock.
  await expect(thread(page)).toContainText("Kurniadi is building AI agents.");
});

test("everything hides and nothing posts when /api/ask is missing", async ({ page }) => {
  const api = await mockAsk(page, { status: 404 });
  await openPage(page, "/en?tier=static");
  await expect.poll(() => api.all.length).toBe(1);
  await expect(page.getByTestId("ask-hero")).toHaveAttribute("data-off", "");
  await expect(page.getByTestId("ask-hero")).toBeHidden();
  await expect(page.getByTestId("ask-launcher")).toHaveCount(0);
  await openPage(page, "/en/contact?tier=static");
  await expect(page.getByTestId("ask-cta")).toHaveCount(0);
  expect(api.posts()).toHaveLength(0);
});

test("About CTA opens the dock", async ({ page }) => {
  await mockAsk(page, { status: enabled() });
  await openPage(page, "/en/contact?tier=static");
  await page.getByTestId("ask-cta").click();
  await expect(dock(page)).toBeVisible();
  await expect(dock(page).getByTestId("ask-topics")).toBeVisible();
});

test("rate limit shows an inline system message", async ({ page }) => {
  await mockAsk(page, { status: enabled(), post: 429 });
  await openPage(page, "/en/labs?tier=static");
  await page.getByTestId("ask-launcher").click();
  await dock(page).getByRole("textbox", { name: "Your question" }).fill("hi there");
  await page.keyboard.press("Enter");
  await expect(thread(page).locator("[data-role='system']")).toContainText("Try again in 2 minutes.");
});

test("teaser shows once per session next to the launcher", async ({ page }) => {
  await mockAsk(page, { status: enabled() });
  await openPage(page, "/en/labs?tier=static");
  const teaser = page.getByTestId("ask-teaser");
  await expect(teaser).toBeVisible({ timeout: 15_000 });
  await teaser.getByRole("button", { name: /Ask me anything/ }).click();
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("ask-launcher")).toBeVisible();
  // Proves the teaser does not come back in the same session.
  await page.waitForTimeout(7000);
  await expect(teaser).toHaveCount(0);
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("bottom sheet: modal, closes with the button and the handle", async ({ page }) => {
    await mockAsk(page, { status: enabled() });
    await openPage(page, "/en/labs?tier=static");
    await page.getByTestId("ask-launcher").click();
    await expect(dock(page)).toHaveAttribute("data-layout", "sheet");
    await expect(dock(page)).toHaveAttribute("aria-modal", "true");
    const axe = await new AxeBuilder({ page }).include("[data-testid='ask-dock']").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(axe.violations).toEqual([]);
    await dock(page).getByRole("button", { name: "Close chat" }).click();
    await expect(dock(page)).toBeHidden();

    await page.getByTestId("ask-launcher").click();
    const handle = dock(page).getByTestId("ask-handle");
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 300, { steps: 6 });
    await page.mouse.up();
    await expect(dock(page)).toBeHidden();
  });

  test("the launcher steps aside while the hero bar is at the bottom of the screen", async ({ page }) => {
    await mockAsk(page, { status: enabled() });
    await openPage(page, "/en?tier=static");
    await expect(page.getByTestId("ask-hero")).toBeVisible();
    await expect(page.getByTestId("ask-launcher")).toHaveCount(0);
    await page.mouse.wheel(0, 1200);
    await expect(page.getByTestId("ask-launcher")).toBeVisible();
  });
});

test("axe: open side panel with an answer", async ({ page }) => {
  await mockAsk(page, { status: enabled() });
  await openPage(page, "/en/labs?tier=static");
  await page.getByTestId("ask-launcher").click();
  await dock(page).getByTestId("ask-topics").getByRole("button", { name: "Work" }).click();
  await dock(page).getByTestId("ask-topic-questions").locator("li").first().getByRole("button").first().click();
  await expect(dock(page).getByTestId("ask-followups")).toBeVisible();
  const axe = await new AxeBuilder({ page }).include("[data-testid='ask-dock']").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
});

test("Turnstile: lazy script, invisible widget, token in the POST", async ({ page }) => {
  const errors = collectErrors(page);
  const scripts: string[] = [];
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", async (route) => {
    scripts.push(route.request().url());
    await route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile = {
        render(el, opts) { window.__turnstileOpts = opts; return "w1"; },
        execute() { setTimeout(() => window.__turnstileOpts.callback("fake-token"), 10); },
        reset() {},
      };`,
    });
  });
  const api = await mockAsk(page, { status: enabled("test-site-key") });
  await openPage(page, "/en/labs?tier=static");
  await expect(page.getByTestId("ask-launcher")).toBeVisible();
  expect(scripts).toHaveLength(0);

  await page.getByTestId("ask-launcher").click();
  await dock(page).getByTestId("ask-topics").getByRole("button", { name: "Contact" }).click();
  await dock(page).getByRole("button", { name: "How can I contact him?", exact: true }).click();
  await expect(thread(page)).toContainText("Kurniadi is building AI agents.");
  expect(scripts).toEqual(["https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]);
  expect(await page.evaluate(() => (window as unknown as { __turnstileOpts: Record<string, unknown> }).__turnstileOpts)).toMatchObject({
    sitekey: "test-site-key",
    execution: "execute",
    appearance: "interaction-only",
  });
  expect(api.bodies()[0]).toEqual({ q: "How can I contact him?", locale: "en", turnstileToken: "fake-token", source: "pill" });
  expect(errors).toEqual([]);
});

test("Ask Rover's ask option opens the dock", async ({ page }) => {
  const api = await mockAsk(page, { status: enabled() });
  await openPage(page, "/en/labs?tier=static");
  await page.getByRole("button", { name: "Ask Rover", exact: true }).click();
  const terminal = page.getByRole("dialog", { name: "Ask Rover" });
  await expect(terminal.getByRole("option", { name: "ask me anything ^_^" })).toBeVisible();
  await page.keyboard.press("a");
  await expect(terminal).toBeHidden();
  const input = dock(page).getByRole("textbox", { name: "Your question" });
  await expect(input).toBeFocused();
  await input.fill("What now?");
  await input.press("Enter");
  await expect(thread(page)).toContainText("Kurniadi is building AI agents.");
  expect(api.bodies()[0]).toMatchObject({ q: "What now?", source: "terminal" });
});

test("Cmd-K Ask row sends the question to the dock", async ({ page }) => {
  const api = await mockAsk(page, { status: enabled() });
  await openPage(page, "/en/journey?tier=static");
  await expect(page.getByTestId("ask-launcher")).toBeVisible();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("How can I contact him?");
  await expect(palette.getByRole("option").first()).toContainText('Ask: "How can I contact him?"');
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(thread(page)).toContainText("Kurniadi is building AI agents.");
  expect(api.bodies()[0]).toEqual({ q: "How can I contact him?", locale: "en", source: "palette" });
});

test("3D: the top-right pill opens the dock over the tower, and typing does not drive the rover", async ({ page }) => {
  const api = await mockAsk(page, { status: enabled() });
  await asReturningVisitor(page);
  await page.goto("/en?tier=lite");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  const pill = page.locator("[data-testid='ask-pill']:visible");
  // The status loads on idle; a software renderer keeps the main thread busy, so idle comes late.
  await expect(pill).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("ask-launcher")).toHaveCount(0);
  await pill.click();
  await expect(dock(page)).toHaveAttribute("aria-modal", "false");
  const before = (await snapshot(page)).rover;
  const input = dock(page).getByRole("textbox", { name: "Your question" });
  await input.pressSequentially("wwwddd");
  await input.fill("Where is he based?");
  await input.press("Enter");
  await expect(thread(page)).toContainText("Kurniadi is building AI agents.");
  const after = (await snapshot(page)).rover;
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.05);
  expect(api.bodies()[0]).toMatchObject({ q: "Where is he based?", source: "dock" });
  await page.keyboard.press("Escape");
  await expect(dock(page)).toBeHidden();
});
