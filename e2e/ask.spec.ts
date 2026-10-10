import { expect, test, type Page, type Request } from "@playwright/test";
import { collectErrors, openPage } from "./hq";

/**
 * Ask the HQ in the browser, against a mocked `/api/ask` (the static server has no Functions).
 * Design: docs/superpowers/specs/2026-10-11-ask-hq-design.md (sections 3, 7.3 T6/T13, 8).
 */

const AS_OF = "2026-10-01";
const AS_OF_LINE = "Answered by AI from this site, as of Oct 1, 2026";
const HOSTILE = "<img src=x onerror=alert(1)>";

interface MockOptions {
  /** Status body, or a number for an error status (404: no Functions, 503: disabled). */
  status: Record<string, unknown> | number;
  deltas?: string[];
  outcome?: string;
}

const sse = (deltas: string[], outcome: string) =>
  [...deltas.map((delta) => ({ delta })), { done: true, outcome, source: "primary", asOf: AS_OF }].map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("");

/** Routes `/api/ask` and records every request to it. */
async function mockAsk(page: Page, { status, deltas = ["Kurniadi is building ", "AI agents."], outcome = "answer" }: MockOptions) {
  const requests: Request[] = [];
  await page.route("**/api/ask", async (route) => {
    const request = route.request();
    requests.push(request);
    if (request.method() === "GET") {
      if (typeof status === "number") return route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: "disabled" }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(status) });
    }
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(deltas, outcome) });
  });
  return {
    all: requests,
    posts: () => requests.filter((r) => r.method() === "POST"),
  };
}

const enabled = (turnstileSiteKey: string | null = null) => ({ enabled: true, turnstileSiteKey, asOf: AS_OF, maxLength: 300 });

// A rendered payload would run `alert`; every test asserts that no dialog opened.
let dialogs: string[] = [];

test.beforeEach(async ({ page }) => {
  dialogs = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await page.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.afterEach(() => {
  expect(dialogs).toEqual([]);
});

test("nothing calls /api/ask on first paint", async ({ page }) => {
  const api = await mockAsk(page, { status: enabled() });
  await openPage(page, "/en?tier=static");
  await page.waitForLoadState("networkidle");
  // Proves that nothing happens: no status fetch until the panel nears the viewport or a HUD opens.
  await page.waitForTimeout(500);
  expect(api.all).toHaveLength(0);
});

test("Page View panel streams an answer as inert text", async ({ page }) => {
  const errors = collectErrors(page);
  const api = await mockAsk(page, { status: enabled(), deltas: ["Here is markup: ", HOSTILE, " and text."] });
  await openPage(page, "/en?tier=static");
  const panel = page.locator("#ask");
  await expect(panel.getByRole("heading", { name: "Ask about Kurniadi" })).toBeVisible();
  const input = panel.getByRole("textbox", { name: "Your question" });
  await input.fill("What is he building now?");
  await input.press("Enter");

  const answer = panel.getByTestId("ask-answer");
  await expect(answer).toContainText(`Here is markup: ${HOSTILE} and text.`);
  await expect(answer).toContainText(AS_OF_LINE);
  await expect(answer.locator("img")).toHaveCount(0);
  await expect(page.locator("main img[src='x']")).toHaveCount(0);
  await expect(panel).toContainText("never used for training");

  const [post] = api.posts();
  expect(post.postDataJSON()).toEqual({ q: "What is he building now?", locale: "en" });
  expect(post.headers()["content-type"]).toBe("application/json");
  expect(errors).toEqual([]);

  await input.press("Escape");
  await expect(input).toHaveValue("");
  await expect(answer).toBeEmpty();
});

test("the panel hides itself and never posts when /api/ask is missing", async ({ page }) => {
  const api = await mockAsk(page, { status: 404 });
  await openPage(page, "/en/contact?tier=static");
  const wrapper = page.locator("[data-ask-panel]");
  await wrapper.scrollIntoViewIfNeeded();
  await expect(wrapper).toBeHidden();
  await expect.poll(() => api.all.length).toBe(1);
  expect(api.posts()).toHaveLength(0);
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
  await openPage(page, "/en?tier=static");
  expect(scripts).toHaveLength(0);

  const panel = page.locator("#ask");
  await panel.getByRole("button", { name: "Show his AI results" }).click();
  await expect(panel.getByTestId("ask-answer")).toContainText("Kurniadi is building AI agents.");
  expect(scripts).toEqual(["https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"]);
  expect(await page.evaluate(() => (window as unknown as { __turnstileOpts: Record<string, unknown> }).__turnstileOpts)).toMatchObject({
    sitekey: "test-site-key",
    execution: "execute",
    appearance: "interaction-only",
  });
  expect(api.posts()[0].postDataJSON()).toEqual({ q: "Show his AI results", locale: "en", turnstileToken: "fake-token" });
  expect(errors).toEqual([]);
});

test("Rover Terminal ask mode answers on a static page", async ({ page }) => {
  const api = await mockAsk(page, { status: enabled(), outcome: "answer" });
  await openPage(page, "/en/labs?tier=static");
  await page.getByRole("button", { name: "Missions" }).click();
  const terminal = page.getByRole("dialog", { name: "Rover Terminal" });
  const ask = terminal.getByRole("option", { name: "ask me anything ^_^" });
  await expect(ask).toBeVisible();
  await page.keyboard.press("a");
  await terminal.getByRole("button", { name: "What are you building now?" }).click();
  await expect(terminal.getByTestId("ask-terminal-answer")).toContainText("Kurniadi is building AI agents.");
  await expect(terminal.getByTestId("ask-face")).toHaveText("[^_^]");
  await expect(terminal).toContainText(AS_OF_LINE);
  expect(api.posts()[0].postDataJSON()).toMatchObject({ q: "What are you building now?", locale: "en" });

  await page.keyboard.press("Escape");
  await expect(terminal.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(terminal).toBeHidden();
});

test("Cmd-K Ask row opens the terminal ask mode with the question", async ({ page }) => {
  const api = await mockAsk(page, { status: enabled() });
  await openPage(page, "/en/journey?tier=static");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await expect.poll(() => api.all.length).toBe(1);
  await palette.getByRole("combobox").fill("How can I contact him?");
  await expect(palette.getByRole("option").first()).toContainText('Ask: "How can I contact him?"');
  await page.keyboard.press("Enter");
  const terminal = page.getByRole("dialog", { name: "Rover Terminal" });
  await expect(terminal.getByTestId("ask-terminal-answer")).toContainText("Kurniadi is building AI agents.");
  expect(api.posts()[0].postDataJSON()).toMatchObject({ q: "How can I contact him?" });
});

test("Cmd-K Ask row on Home uses the Page View panel", async ({ page }) => {
  const api = await mockAsk(page, { status: enabled() });
  await openPage(page, "/en?tier=static");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect.poll(() => api.all.length).toBe(1);
  await palette.getByRole("combobox").fill("What is he building now?");
  await palette.getByRole("option", { name: /Ask: "What is he building now\?"/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const panel = page.locator("#ask");
  await expect(panel.getByRole("textbox", { name: "Your question" })).toHaveValue("What is he building now?");
  await expect(panel.getByTestId("ask-answer")).toContainText("Kurniadi is building AI agents.");
  await expect(panel).toBeInViewport();
  expect(api.posts()).toHaveLength(1);
});
