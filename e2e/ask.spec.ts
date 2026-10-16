import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";
import { chooseMotion, asReturningVisitor, collectCspViolations, collectErrors, openPage, snapshot, waitForHQ, waitForPhase } from "./hq";
import en from "../messages/en.json";

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
  cite?: string;
  /** Contact card of a lead-intent answer (the `done` frame). */
  contact?: { email: string; linkedin: string };
  /** HTTP status for POSTs (429: rate limited). */
  post?: number;
}

const sse = (deltas: string[], outcome: string, tags: string[], cite?: string, contact?: MockOptions["contact"]) =>
  [...deltas.map((delta) => ({ delta })), { done: true, outcome, source: "primary", asOf: AS_OF, tags, ...(cite ? { cite } : {}), ...(contact ? { contact } : {}) }].map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("");

/** Routes `/api/ask` and records every request to it. */
async function mockAsk(page: Page, { status, deltas = ["Kurniadi is building ", "AI agents."], outcome = "answer", tags = ["ai", "voice"], cite, contact, post = 200 }: MockOptions) {
  const requests: Request[] = [];
  await page.route("**/api/ask", async (route) => {
    const request = route.request();
    requests.push(request);
    if (request.method() === "GET") {
      if (typeof status === "number") return route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: "disabled" }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(status) });
    }
    if (post !== 200) return route.fulfill({ status: post, contentType: "application/json", headers: { "retry-after": "90" }, body: JSON.stringify({ error: "rate_limited", retryAfter: 90 }) });
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(deltas, outcome, tags, cite, contact) });
  });
  return {
    all: requests,
    posts: () => requests.filter((r) => r.method() === "POST"),
    bodies: () => requests.filter((r) => r.method() === "POST").map((r) => r.postDataJSON() as Record<string, unknown>),
  };
}

/**
 * A real stream for `/api/ask` POSTs (route.fulfill sends the body at once): the page's fetch returns
 * a ReadableStream that emits one SSE frame every `everyMs`, after `firstMs`. GETs still go to the route mock.
 * An array `firstMs` sets the wait per POST in order (the last value repeats).
 */
async function slowAsk(page: Page, { deltas, firstMs = 300, everyMs = 120, tags = ["ai", "voice"] }: { deltas: string[]; firstMs?: number | number[]; everyMs?: number; tags?: string[] }) {
  await page.addInitScript(
    ({ deltas, waits, everyMs, tags, asOf }) => {
      const real = window.fetch.bind(window);
      let posts = 0;
      window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!url.endsWith("/api/ask") || (init?.method ?? "GET") !== "POST") return real(input, init);
        const firstMs = waits[Math.min(posts++, waits.length - 1)];
        const frames = [...deltas.map((delta) => ({ delta })), { done: true, outcome: "answer", source: "primary", asOf, tags }];
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            await new Promise((r) => setTimeout(r, firstMs));
            for (const frame of frames) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
              await new Promise((r) => setTimeout(r, everyMs));
            }
            controller.close();
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
      }) as typeof window.fetch;
    },
    { deltas, waits: Array.isArray(firstMs) ? firstMs : [firstMs], everyMs, tags, asOf: AS_OF },
  );
}

// Long enough to overflow the side panel well before the stream ends, at the 14 px chat text.
const LONG_ANSWER = Array.from({ length: 20 }, (_, i) => `Sentence ${i + 1} explains how the voice agent handles calls in production. `);

/** The first line of the last answer sits inside the thread's visible area. */
async function expectAnswerStartInView(page: Page) {
  const scroller = dock(page).getByTestId("ask-scroll");
  const answer = thread(page).locator("[data-role='assistant']").last();
  await expect(dock(page).getByTestId("ask-followups")).toBeVisible();
  await expect
    .poll(async () => {
      const s = (await scroller.boundingBox())!;
      const a = (await answer.boundingBox())!;
      return a.y >= s.y - 1 && a.y + 24 <= s.y + s.height;
    })
    .toBe(true);
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
      localStorage.setItem("hq:onboarded", "done");
      if (!teaser) sessionStorage.setItem(key, "1");
    },
    { key: TEASER_SEEN, teaser },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await chooseMotion(page, "system");
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
  expect(api.bodies()[0]).toEqual({ q: "How does the voice AI contact center work?", locale: "en", source: "pill", chip: "ai-voice" });

  const followUps = dock(page).getByTestId("ask-followups");
  await expect(followUps.getByRole("button", { name: "What latency did the voice agent reach?", exact: true })).toBeVisible();
  // Owner request 2026-10-16: smaller text, one compact row of follow-ups, 44 px targets.
  expect(await thread(page).locator("[data-role='assistant'] p").first().evaluate((n) => getComputedStyle(n).fontSize)).toBe("14px");
  const pill = followUps.getByRole("button", { name: "What latency did the voice agent reach?", exact: true });
  expect(await pill.evaluate((n) => getComputedStyle(n).fontSize)).toBe("13px");
  expect((await pill.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await followUps.boundingBox())!.height).toBeLessThan(80);
  await expect(dock(page).getByTestId("ask-mark").locator("svg[data-brand-mark]")).toBeVisible();
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
  expect(api.posts()).toHaveLength(0);
});

test("About has no Ask the HQ section; the floating launcher stays (owner request 2026-10-15)", async ({ page }) => {
  await mockAsk(page, { status: enabled() });
  await openPage(page, "/en/contact?tier=static");
  await page.getByTestId("ask-launcher").click();
  await expect(dock(page)).toBeVisible();
  await expect(page.locator("#ask")).toHaveCount(0);
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
  await teaser.getByRole("button", { name: en.ask.dock.teaser, exact: true }).click();
  await expect(dock(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("ask-launcher")).toBeVisible();
  // Proves the teaser does not come back in the same session.
  await page.waitForTimeout(7000);
  await expect(teaser).toHaveCount(0);
});

test("a long answer keeps its first line in view after the follow-ups appear", async ({ page }) => {
  await mockAsk(page, { status: enabled(), deltas: LONG_ANSWER });
  await openPage(page, "/en/labs?tier=static");
  await page.getByTestId("ask-launcher").click();
  await dock(page).getByTestId("ask-topics").getByRole("button", { name: "AI" }).click();
  await dock(page).getByRole("button", { name: "How does the voice AI contact center work?", exact: true }).click();
  await expectAnswerStartInView(page);
});

test("scrolling up while an answer streams is never overridden", async ({ page }) => {
  await mockAsk(page, { status: enabled() });
  await slowAsk(page, { deltas: LONG_ANSWER, everyMs: 150 });
  await openPage(page, "/en/labs?tier=static");
  await page.getByTestId("ask-launcher").click();
  const scroller = dock(page).getByTestId("ask-scroll");
  await dock(page).getByRole("textbox", { name: "Your question" }).fill("How does the voice agent work?");
  await dock(page).getByRole("textbox", { name: "Your question" }).press("Enter");
  await expect(dock(page).getByTestId("ask-thinking")).toContainText(en.ask.thinking);
  // Wait until the thread overflows and the panel has followed the stream down, then scroll up.
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(20);
  await expect(dock(page).getByTestId("ask-followups")).toHaveCount(0);
  await scroller.evaluate((node) => node.scrollTo({ top: 0 }));
  await expect(dock(page).getByTestId("ask-followups")).toBeVisible();
  expect(await scroller.evaluate((node) => node.scrollTop)).toBeLessThan(5);
});

test("scrolling up while Rover thinks survives the answer; the next question follows again", async ({ page }) => {
  await mockAsk(page, { status: enabled() });
  await slowAsk(page, { deltas: LONG_ANSWER, firstMs: [300, 1500], everyMs: 40 });
  await openPage(page, "/en/labs?tier=static");
  await page.getByTestId("ask-launcher").click();
  const scroller = dock(page).getByTestId("ask-scroll");
  const input = dock(page).getByRole("textbox", { name: "Your question" });
  const askNow = async (q: string) => {
    await input.fill(q);
    await input.press("Enter");
    await expect(dock(page).getByTestId("ask-thinking")).toContainText(en.ask.thinking);
  };
  await askNow("How does the voice agent work?");
  await expect(dock(page).getByTestId("ask-followups")).toBeVisible();
  // The thread already overflows; the second question follows it down, then the visitor scrolls up
  // while Rover still thinks (the answer, appended on its first chunk, must not pull the thread back).
  await askNow("Which stack does it use?");
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(20);
  await scroller.evaluate((node) => node.scrollTo({ top: 0 }));
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeLessThan(5);
  await expect(dock(page).getByTestId("ask-thinking")).toBeVisible();
  await expect(dock(page).getByTestId("ask-followups")).toBeVisible();
  expect(await scroller.evaluate((node) => node.scrollTop)).toBeLessThan(5);
  // A new question follows again.
  await askNow("Where does it run?");
  await expectAnswerStartInView(page);
  expect(await scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(20);
});

test.describe("phones", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("bottom sheet: a long answer keeps its first line in view", async ({ page }) => {
    await mockAsk(page, { status: enabled(), deltas: LONG_ANSWER });
    await openPage(page, "/en/labs?tier=static");
    await page.getByTestId("ask-launcher").click();
    await dock(page).getByTestId("ask-topics").getByRole("button", { name: "AI" }).click();
    await dock(page).getByRole("button", { name: "How does the voice AI contact center work?", exact: true }).click();
    await expectAnswerStartInView(page);
  });

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

test("markdown answer: a bullet list with site links, blocked links as text, axe passes", async ({ page }) => {
  await mockAsk(page, {
    status: enabled(),
    deltas: ["Two projects fit:\n", "- **Voice AI Contact Center** ([case study](/labs/voice-ai-contact-center))\n", "- Fraud review [x](javascript:alert(1))\n"],
  });
  await openPage(page, "/en/labs?tier=static");
  await page.getByTestId("ask-launcher").click();
  await dock(page).getByRole("textbox", { name: "Your question" }).fill("Which AI projects?");
  await dock(page).getByRole("textbox", { name: "Your question" }).press("Enter");
  const answer = thread(page).locator("[data-role='assistant']").last();
  await expect(answer.locator("ul > li")).toHaveCount(2);
  await expect(answer.getByRole("link", { name: "case study" })).toHaveAttribute("href", "/en/labs/voice-ai-contact-center");
  await expect(answer.locator("a[href^='javascript' i]")).toHaveCount(0);
  await expect(answer).toContainText("Fraud review x");
  const axe = await new AxeBuilder({ page }).include("[data-testid='ask-dock']").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
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
  const csp = await collectCspViolations(page);
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
  expect(api.bodies()[0]).toEqual({ q: "How can I contact him?", locale: "en", turnstileToken: "fake-token", source: "pill", chip: "contact-reach" });
  expect(errors).toEqual([]);
  expect(csp).toEqual([]);
});

test("Ask Rover's ask option opens the dock", async ({ page }) => {
  const api = await mockAsk(page, { status: enabled() });
  await openPage(page, "/en/labs?tier=static");
  await page.getByRole("button", { name: "Ask Rover", exact: true }).click();
  const terminal = page.getByRole("dialog", { name: "Ask Rover" });
  await expect(terminal.getByRole("option", { name: en.ask.terminal.option, exact: true })).toBeVisible();
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
  expect(api.bodies()[0]).toEqual({ q: "How can I contact him?", locale: "en", source: "palette", chip: "contact-reach" });
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

test("Perspectives topic: a cited answer links to its written source on About", async ({ page }) => {
  const api = await mockAsk(page, { status: enabled(), deltas: ["Kurniadi writes that he owns every merge decision."], tags: ["perspectives"], cite: "/contact#how" });
  await openPage(page, "/en/labs?tier=static");
  await page.getByTestId("ask-launcher").click();
  await dock(page).getByTestId("ask-topics").getByRole("button", { name: "Perspectives" }).click();
  await dock(page).getByRole("button", { name: "What are his coding principles?", exact: true }).click();
  await expect(thread(page)).toContainText("owns every merge decision");
  expect(api.bodies()[0]).toEqual({ q: "What are his coding principles?", locale: "en", source: "pill", chip: "persp-principles" });
  const link = thread(page).getByTestId("ask-cite");
  await expect(link).toHaveText(en.ask.dock.source.replace("{label}", en.ask.cite.how));
  await link.click();
  await expect(page).toHaveURL(/\/en\/contact#how$/);
  await expect(page.locator("#how")).toBeAttached();
});

test("lead intent: the contact card shows email, LinkedIn and the Contact page under the answer, and passes axe", async ({ page }) => {
  const contact = { email: "kurniadiahmadwijaya@gmail.com", linkedin: "https://www.linkedin.com/in/kurniadiwijaya" };
  await mockAsk(page, {
    status: enabled(),
    deltas: ['Kurniadi has built AI assistants with RAG, such as "AI Ticketing Assistant Migration". This looks like a strong fit, and he takes freelance or part-time engagements. Feel free to get in touch.'],
    tags: ["contact", "ai"],
    contact,
  });
  await openPage(page, "/en/labs?tier=static");
  await page.getByTestId("ask-launcher").click();
  await dock(page).getByRole("textbox", { name: en.ask.dock.inputLabel }).fill("I need an AI chatbot for my clinic, can you help?");
  await dock(page).getByRole("textbox", { name: en.ask.dock.inputLabel }).press("Enter");
  const card = thread(page).getByTestId("ask-contact");
  await expect(card).toBeVisible();
  await expect(card).toContainText(en.ask.contact.title);
  await expect(card.getByTestId("ask-contact-email")).toHaveAttribute("href", `mailto:${contact.email}`);
  await expect(card.getByTestId("ask-contact-linkedin")).toHaveAttribute("rel", "noopener noreferrer");
  await expect(card.getByTestId("ask-contact-page")).toHaveAttribute("href", "/en/contact");
  const axe = await new AxeBuilder({ page }).include("[data-testid='ask-dock']").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);
  // Opt-in capture for the PR (ASK_CAPTURE=<dir>).
  if (process.env.ASK_CAPTURE) await dock(page).screenshot({ path: `${process.env.ASK_CAPTURE}/ask-contact-card-${test.info().project.name}.png` });
});
