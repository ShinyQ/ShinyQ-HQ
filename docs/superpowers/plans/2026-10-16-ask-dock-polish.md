# Ask Dock Polish Implementation Plan

Status: shipped in #162 (880b62d), 2026-10-16

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the start of an Ask answer in view, make follow-up pills compact, show the rover mark in the panel header, rename the loading label to "Rover is thinking . . ." and shrink chat and suggestion text by about one step.

**Architecture:** A pure scroll module (`src/hud/ask/scroll.ts`) decides where the thread scrolls: the newest content, but never past the first line of the current answer, and never while the visitor has scrolled away. `AskChat.tsx` wires it in place of the old "scroll to bottom" layout effect. Follow-ups become one horizontally scrollable row of compact pills; the header uses `RoverMark` (inline SVG from `src/lib/brand-mark.ts`) and the thinking bubble renders a stable screen-reader label plus animated dots.

**Tech Stack:** Next.js 16 client components, Tailwind v4, next-intl, Vitest + Testing Library, Playwright + axe.

## Global Constraints

- Owner request (2026-10-16, verbatim): "So ive just think that the AI Chatbot suggestion was too big when text done write we cannot see the start of chatbot answer also the logo on the left of Ask The HQ on chatbot panel should be Rover and Thinking... should change into Rover is thinking . . . Other than that ive think that in. chat panel the chat text size and the suggestion font size can be reduce a little"
- No em dashes (U+2014) anywhere (a unit test scans the repo).
- EN and ID: `ask.thinking` is "Rover is thinking . . ." / "Rover sedang berpikir . . ."; both message files keep identical keys.
- Reduced motion: no smooth scroll and no dot animation when the effective setting is reduced (`html[data-motion="reduced"]`, or no attribute and the OS asks for reduced motion; `data-motion="full"` means full).
- Never steal scroll: once the visitor scrolls the thread themselves, the panel stops moving it until the next question, the next open or a pill mode change.
- Text sizes: at least 12 px; pill touch targets stay at least 44 px tall (`min-h-11`).
- Header icon is decorative (`aria-hidden`), inline SVG through `RoverMark` (`src/components/RoverMark.tsx`), never an `<img>`.
- Label in name (WCAG 2.5.3): any `aria-label` starts with the visible text.
- Classic site JS gate (Lighthouse, 240 KB) stays green; `AskChat` is a lazy chunk, so the mark module only lands there.
- Commit with conventional messages; rebase on `origin/main` before pushing; do not merge.

---

### Task 1: Pure scroll rules

**Files:**
- Create: `src/hud/ask/scroll.ts`
- Test: `tests/unit/ask-scroll.test.ts`

**Interfaces:**
- Produces:
  - `ANSWER_TOP_GAP = 12`, `USER_SCROLL_SLACK = 8`
  - `anchoredScrollTop(box: { scrollHeight: number; clientHeight: number }, answerTop: number | null, gap?: number): number`
  - `scrolledAway(current: number, lastSet: number | null, slack?: number): boolean`
  - `askReducedMotion(root?: HTMLElement | null, systemReduced?: () => boolean): boolean`

- [x] **Step 1: Write the failing test** (`tests/unit/ask-scroll.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { ANSWER_TOP_GAP, anchoredScrollTop, askReducedMotion, scrolledAway } from "@/hud/ask/scroll";

const box = (scrollHeight: number, clientHeight = 400) => ({ scrollHeight, clientHeight });
const root = (motion?: string) => ({ getAttribute: (name: string) => (name === "data-motion" ? (motion ?? null) : null) }) as unknown as HTMLElement;

describe("anchoredScrollTop", () => {
  it("goes to the bottom without an answer to anchor", () => {
    expect(anchoredScrollTop(box(1000), null)).toBe(600);
    expect(anchoredScrollTop(box(300), null)).toBe(0);
  });
  it("shows the bottom while the whole answer fits", () => {
    expect(anchoredScrollTop(box(1000), 700)).toBe(600);
  });
  it("never scrolls past the answer's first line", () => {
    expect(anchoredScrollTop(box(2000), 500)).toBe(500 - ANSWER_TOP_GAP);
  });
  it("never goes below zero", () => {
    expect(anchoredScrollTop(box(2000), 4)).toBe(0);
  });
});

describe("scrolledAway", () => {
  it("is false before the panel scrolled and within the slack", () => {
    expect(scrolledAway(120, null)).toBe(false);
    expect(scrolledAway(126, 120)).toBe(false);
  });
  it("is true when the visitor moved the thread", () => {
    expect(scrolledAway(40, 120)).toBe(true);
    expect(scrolledAway(200, 120)).toBe(true);
  });
});

describe("askReducedMotion", () => {
  it("follows the Motion setting, then the OS", () => {
    expect(askReducedMotion(root("full"), () => true)).toBe(false);
    expect(askReducedMotion(root("reduced"), () => false)).toBe(true);
    expect(askReducedMotion(root(), () => true)).toBe(true);
    expect(askReducedMotion(root(), () => false)).toBe(false);
  });
});
```

- [x] **Step 2: Run it to see it fail**

Run: `bunx vitest run tests/unit/ask-scroll.test.ts`
Expected: FAIL, module `@/hud/ask/scroll` not found.

- [x] **Step 3: Implement** (`src/hud/ask/scroll.ts`)

```ts
import { MOTION_ATTR } from "@/lib/motion";
import { prefersReducedMotion } from "@/lib/reduced-motion";

/** Space kept above an answer's first line when it is pinned to the top of the thread. */
export const ANSWER_TOP_GAP = 12;
/** A scroll position this far from the last one the panel set is the visitor's own. */
export const USER_SCROLL_SLACK = 8;

/**
 * Where the Ask thread scrolls (owner request 2026-10-16): the newest content, but never past the
 * first line of the current answer (`answerTop`, its offset inside the scroll content), so a long
 * answer and the follow-up pills under it never push the answer's start out of view.
 */
export function anchoredScrollTop(box: { scrollHeight: number; clientHeight: number }, answerTop: number | null, gap = ANSWER_TOP_GAP): number {
  const bottom = Math.max(0, box.scrollHeight - box.clientHeight);
  if (answerTop === null) return bottom;
  return Math.max(0, Math.min(bottom, answerTop - gap));
}

/** True once the visitor moved the thread away from where the panel last put it. */
export function scrolledAway(current: number, lastSet: number | null, slack = USER_SCROLL_SLACK): boolean {
  return lastSet !== null && Math.abs(current - lastSet) > slack;
}

/** The effective reduced-motion flag outside the 3D store: the Motion setting (`html[data-motion]`), else the OS. */
export function askReducedMotion(
  root: HTMLElement | null = typeof document === "undefined" ? null : document.documentElement,
  systemReduced: () => boolean = prefersReducedMotion,
): boolean {
  const motion = root?.getAttribute(MOTION_ATTR);
  if (motion === "full") return false;
  if (motion === "reduced") return true;
  return systemReduced();
}
```

- [x] **Step 4: Run it to see it pass**

Run: `bunx vitest run tests/unit/ask-scroll.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/hud/ask/scroll.ts tests/unit/ask-scroll.test.ts
git commit -m "feat(ask): pure scroll rules that keep an answer's start in view"
```

---

### Task 2: Anchored scrolling in the panel

**Files:**
- Modify: `src/hud/ask/AskChat.tsx` (the "Keep the newest message in view" layout effect, the scroll container, `ask_`)
- Test: `e2e/ask.spec.ts` (new tests plus a slow-stream helper)

**Interfaces:**
- Consumes: `anchoredScrollTop`, `scrolledAway`, `askReducedMotion` from Task 1.
- Produces: `data-testid="ask-scroll"` on the scroll container (used by the e2e tests and the captures).

- [x] **Step 1: Write the failing e2e tests** in `e2e/ask.spec.ts`

Add after `mockAsk`:

```ts
/**
 * A real stream for `/api/ask` POSTs (route.fulfill sends the body at once): the page's fetch returns
 * a ReadableStream that emits one SSE frame every `everyMs`, after `firstMs`. GETs still go to the route mock.
 */
async function slowAsk(page: Page, { deltas, firstMs = 300, everyMs = 120, tags = ["ai", "voice"] }: { deltas: string[]; firstMs?: number; everyMs?: number; tags?: string[] }) {
  await page.addInitScript(
    ({ deltas, firstMs, everyMs, tags, asOf }) => {
      const real = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!url.endsWith("/api/ask") || (init?.method ?? "GET") !== "POST") return real(input, init);
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
      };
    },
    { deltas, firstMs, everyMs, tags, asOf: AS_OF },
  );
}

const LONG_ANSWER = Array.from({ length: 14 }, (_, i) => `Sentence ${i + 1} explains how the voice agent handles calls in production. `);

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
```

Tests (desktop at top level, phone inside the existing `test.describe("phones")`):

```ts
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
  await expect(dock(page).getByTestId("ask-thinking")).toContainText("Rover is thinking");
  // Wait until the thread overflows and the panel has followed the stream down, then scroll up.
  await expect.poll(() => scroller.evaluate((node) => node.scrollTop)).toBeGreaterThan(20);
  await expect(dock(page).getByTestId("ask-followups")).toHaveCount(0);
  await scroller.evaluate((node) => node.scrollTo({ top: 0 }));
  await expect(dock(page).getByTestId("ask-followups")).toBeVisible();
  expect(await scroller.evaluate((node) => node.scrollTop)).toBeLessThan(5);
});
```

Inside `test.describe("phones", ...)`:

```ts
  test("bottom sheet: a long answer keeps its first line in view", async ({ page }) => {
    await mockAsk(page, { status: enabled(), deltas: LONG_ANSWER });
    await openPage(page, "/en/labs?tier=static");
    await page.getByTestId("ask-launcher").click();
    await dock(page).getByTestId("ask-topics").getByRole("button", { name: "AI" }).click();
    await dock(page).getByRole("button", { name: "How does the voice AI contact center work?", exact: true }).click();
    await expectAnswerStartInView(page);
  });
```

- [x] **Step 2: Build and run them to see them fail**

Run: `bun run build && E2E_PORT=4391 bunx playwright test e2e/ask.spec.ts -g "first line|never overridden"`
Expected: FAIL (no `ask-scroll` test id; the thread scrolls to the bottom).

- [x] **Step 3: Implement in `AskChat.tsx`**

Import: `import { anchoredScrollTop, askReducedMotion, scrolledAway } from "./scroll";`

Replace the "Keep the newest message in view while it streams." block with:

```tsx
  // Owner request 2026-10-16: follow the answer as it streams, but never past its first line, and
  // stop following once the visitor scrolls the thread; a new question, an open or a pill mode
  // change follows again.
  const last = messages.at(-1);
  const follow = useRef(true);
  const lastSet = useRef<number | null>(null);
  const prevPhase = useRef(phase);
  const scrollThread = useCallback((top: number, smooth: boolean) => {
    const node = scrollRef.current;
    if (!node) return;
    lastSet.current = top;
    if (smooth && typeof node.scrollTo === "function" && !askReducedMotion()) node.scrollTo({ top, behavior: "smooth" });
    else node.scrollTop = top;
  }, []);
  const onThreadScroll = () => {
    const node = scrollRef.current;
    if (node && scrolledAway(node.scrollTop, lastSet.current)) follow.current = false;
  };
  useLayoutEffect(() => {
    follow.current = true;
  }, [messages.length, open]);
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    follow.current = true;
    scrollThread(Math.max(0, node.scrollHeight - node.clientHeight), false);
  }, [mode, scrollThread]);
  useLayoutEffect(() => {
    const node = scrollRef.current;
    const finished = prevPhase.current !== "idle" && phase === "idle";
    prevPhase.current = phase;
    if (!node || !follow.current) return;
    const answers = threadRef.current?.querySelectorAll<HTMLElement>("[data-role='assistant']");
    const answer = last?.role === "assistant" && answers?.length ? answers[answers.length - 1] : null;
    const answerTop = answer ? answer.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop : null;
    scrollThread(anchoredScrollTop(node, answerTop), finished);
  }, [messages.length, last?.text, last?.role, phase, open, scrollThread]);
```

Notes for the implementer:
- Add `useCallback` to the React import.
- The `mode` effect must be declared before the anchored effect, so a send (which sets `mode` to `"auto"` and appends a message in the same commit) ends anchored.
- The smooth scroll after an answer finishes fires intermediate scroll events that `scrolledAway` reads as the visitor's own; that is fine, the next question, open or mode change follows again.
- Put `ref={scrollRef}` container `onScroll={onThreadScroll}` and `data-testid="ask-scroll"`.

- [x] **Step 4: Run the new tests and the whole spec**

Run: `bun run build && E2E_PORT=4391 bunx playwright test e2e/ask.spec.ts`
Expected: PASS (all tests).

- [x] **Step 5: Commit**

```bash
git add src/hud/ask/AskChat.tsx e2e/ask.spec.ts
git commit -m "feat(ask): keep the answer's first line in view and never steal the visitor's scroll"
```

---

### Task 3: Compact pills, smaller text, rover mark, "Rover is thinking . . ."

**Files:**
- Modify: `src/hud/ask/AskChat.tsx` (header icon, thinking bubble, font sizes, follow-up row, `QuestionPill`)
- Modify: `messages/en.json`, `messages/id.json` (`ask.thinking`)
- Modify: `docs/features.md` (Ask the HQ, "Where")
- Test: `tests/hud/AskDock.test.tsx`, `e2e/ask.spec.ts`

**Interfaces:**
- Consumes: `RoverMark` from `@/components/RoverMark` (`{ id: string; size: number; variant?: "tile" | "glyph" | "mono"; className?: string }`).
- Produces: `data-testid="ask-mark"` on the header mark wrapper, `data-testid="ask-thinking"` (unchanged) whose text content is exactly the message.

- [x] **Step 1: Write the failing tests**

`tests/hud/AskDock.test.tsx` (new `it` inside the main describe):

```tsx
  it("shows the rover mark in the header and 'Rover is thinking . . .' while waiting", async () => {
    let finish: (value: AskResult) => void = () => {};
    askMock.ask.mockImplementation(() => new Promise<AskResult>((resolve) => (finish = resolve)));
    await ready();
    act(() => openAsk("What is he building now?", { source: "hero" }));
    const panel = await dock();
    const mark = within(panel).getByTestId("ask-mark");
    expect(mark.querySelector("svg[data-brand-mark]")).toHaveAttribute("aria-hidden", "true");
    const thinking = await within(panel).findByTestId("ask-thinking");
    expect(thinking).toHaveTextContent(en.ask.thinking);
    expect(en.ask.thinking).toBe("Rover is thinking . . .");
    await act(async () => finish({ outcome: "answer", source: "primary", asOf: "2026-10-11" }));
  });
```

`e2e/ask.spec.ts`, in "Page View launcher: topic, pill, inert answer, follow-ups, Esc", after the follow-ups are visible:

```ts
  // Owner request 2026-10-16: smaller text, one compact row of follow-ups, 44 px targets.
  expect(await thread(page).locator("[data-role='assistant'] p").first().evaluate((n) => getComputedStyle(n).fontSize)).toBe("14px");
  const pill = followUps.getByRole("button", { name: "What latency did the voice agent reach?", exact: true });
  expect(await pill.evaluate((n) => getComputedStyle(n).fontSize)).toBe("13px");
  expect((await pill.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await followUps.boundingBox())!.height).toBeLessThan(80);
  await expect(dock(page).getByTestId("ask-mark").locator("svg[data-brand-mark]")).toBeVisible();
```

- [x] **Step 2: Run them to see them fail**

Run: `bunx vitest run tests/hud/AskDock.test.tsx`
Expected: FAIL (no `ask-mark`, old thinking text).

- [x] **Step 3: Implement**

Messages: `messages/en.json` `"thinking": "Rover is thinking . . ."`; `messages/id.json` `"thinking": "Rover sedang berpikir . . ."`.

`AskChat.tsx`:

1. Header icon (replace the `SparkIcon` span; drop `SparkIcon` from the import if unused):

```tsx
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-cyan/35 bg-cyan/10" data-testid="ask-mark">
            <RoverMark id="hq-ask-mark" size={26} variant="glyph" />
          </span>
```

2. Thinking bubble (stable text for screen readers, animated dots only when motion is allowed):

```tsx
              {phase === "thinking" && (
                <li className="self-start rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-5 text-ink-2" data-testid="ask-thinking">
                  <ThinkingLabel text={t("thinking")} />
                </li>
              )}
```

```tsx
/** "Rover is thinking . . .": the words stay put and the trailing dots pulse in turn (still under reduced motion). */
function ThinkingLabel({ text }: { text: string }) {
  const words = text.replace(/[\s.]+$/, "");
  const dots = text.slice(words.length).match(/\./g)?.length ?? 0;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words}
        {Array.from({ length: dots }, (_, i) => (
          <span key={i} className="text-cyan motion-safe:animate-pulse" style={{ animationDelay: `${i * 160}ms` }}>
            {" ."}
          </span>
        ))}
      </span>
    </>
  );
}
```

3. Sizes: every `text-[15px] leading-6` in the thread (welcome, user and assistant messages) becomes `text-sm leading-[22px]`; the system message `text-sm leading-5` becomes `text-[13px] leading-5`; the cite link `text-[13px] leading-5` becomes `text-xs leading-5`; the topic grid buttons `text-sm` become `text-[13px]`; the offline note stays.

4. Follow-ups: one horizontally scrollable row that bleeds to the panel edges.

```tsx
                  <ul className="-mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:thin]" data-testid="ask-followups">
                    {followUps.map((s) => (
                      <QuestionPill key={s.id} compact suggestion={s} ... />
                    ))}
                    <li className="shrink-0">
                      <button type="button" onClick={() => setMode("topics")} className="chip min-h-11 text-ink-2">
                        {td("moreTopics")}
                      </button>
                    </li>
                  </ul>
```

5. `QuestionPill` gets `compact?: boolean` (follow-ups: `shrink-0 w-max max-w-[15rem]` on the `li`), and the question button text becomes `text-[13px] leading-[18px]` with `py-1.5` (keep `min-h-11`; the edit button keeps `min-h-11 w-11`).

`docs/features.md`, "Where" bullet on topic pills, append: "Follow-ups sit in one compact row under the answer, and the thread keeps the answer's first line in view (it never scrolls once the visitor has)."

- [x] **Step 4: Run tests**

Run: `bunx vitest run tests/hud/AskDock.test.tsx tests/unit/ask-scroll.test.ts && bun run build && E2E_PORT=4391 bunx playwright test e2e/ask.spec.ts`
Expected: PASS, axe tests included.

- [x] **Step 5: Commit**

```bash
git add src/hud/ask/AskChat.tsx messages/en.json messages/id.json docs/features.md tests/hud/AskDock.test.tsx e2e/ask.spec.ts
git commit -m "feat(ask): compact follow-ups, smaller chat text, rover mark and 'Rover is thinking . . .'"
```

---

### Task 4: Safe markdown subset and link policy (pure)

Owner addition (2026-10-16, verbatim): "Also for chatbot can you made a markdown renderer i think some result cn be answered in bullet point and link as well".

Confirmed requirements: paragraphs, bullet and numbered lists, bold, italic, inline code and links; no raw HTML, no images, no headings larger than the body (a heading line renders as a bold paragraph), no tables (pipes stay text); React elements only (never `dangerouslySetInnerHTML`); no new dependency. Links: site paths (relative `/labs/x` or `/en/labs/x`, or https on the site's own origin) and the public repository (`ASK_REPO_CITE`) and `PUBLIC_LIVE_HOSTS` site roots; anything else renders as its label text. Never `javascript:`, `data:` or protocol-relative. Streaming: an unclosed `**`, `` ` `` or `[text](` stays literal text until closed.

**Files:**
- Create: `src/ask/links.ts`, `src/ask/markdown.ts`
- Test: `tests/unit/ask-markdown.test.ts`

Use relative imports only in these two files (`./protocol`, `../content/live-links`): `functions/_lib` imports them and wrangler does not resolve the `@/` alias.

**Interfaces (produces):**
- `src/ask/links.ts`: `ASK_SITE_ORIGINS: readonly string[]`, `type AskLinkTarget = { kind: "site"; path: string } | { kind: "external"; href: string }`, `askLinkTarget(raw: string, origins?: readonly string[]): AskLinkTarget | null`, `siteHref(path: string, locale: AskLocale): string`, `ASK_LINK_PAGES: readonly string[]` (locale-less top pages an answer may always link to).
- `src/ask/markdown.ts`: `type Inline`, `type Block`, `parseMarkdown(source: string, options?: { origins?: readonly string[] }): Block[]`, `parseInline(source: string, options?: { origins?: readonly string[]; links?: boolean }): Inline[]`, `markdownToPlain(source: string): string`.

- [x] **Step 1: Write the failing tests** (`tests/unit/ask-markdown.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { askLinkTarget, siteHref } from "@/ask/links";
import { markdownToPlain, parseInline, parseMarkdown } from "@/ask/markdown";
import { ASK_REPO_CITE } from "@/ask/protocol";

const text = (s: string) => ({ type: "text", text: s });

describe("askLinkTarget", () => {
  it("allows site paths with or without a locale, and the site origin", () => {
    expect(askLinkTarget("/labs/voice-ai-contact-center")).toEqual({ kind: "site", path: "/labs/voice-ai-contact-center" });
    expect(askLinkTarget("/id/journey/jenius-2024")).toEqual({ kind: "site", path: "/journey/jenius-2024" });
    expect(askLinkTarget("/contact#how")).toEqual({ kind: "site", path: "/contact#how" });
    expect(askLinkTarget("/")).toEqual({ kind: "site", path: "/" });
    expect(askLinkTarget("https://kurniadi.pages.dev/en/library")).toEqual({ kind: "site", path: "/library" });
    expect(askLinkTarget("https://preview.example/en/labs", ["https://preview.example"])).toEqual({ kind: "site", path: "/labs" });
  });
  it("allows the public repository and live site roots", () => {
    expect(askLinkTarget(ASK_REPO_CITE)).toEqual({ kind: "external", href: ASK_REPO_CITE });
    expect(askLinkTarget("https://mii-microsoft.azurewebsites.net/")).toEqual({ kind: "external", href: "https://mii-microsoft.azurewebsites.net/" });
  });
  it("blocks everything else", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<b>x</b>",
      "//evil.example/en/labs",
      "http://kurniadi.pages.dev/en/labs",
      "https://evil.example/",
      "https://kurniadi.pages.dev.evil.example/en",
      "https://user@kurniadi.pages.dev/en",
      "/admin",
      "/labs/../../etc",
      "/labs/x?y=1",
      "/labs/x y",
      "\\\\evil.example",
      "https://github.com/ShinyQ/other",
      "https://mii-microsoft.azurewebsites.net/admin",
    ]) expect(askLinkTarget(bad), bad).toBeNull();
  });
  it("builds locale hrefs", () => {
    expect(siteHref("/labs/x", "id")).toBe("/id/labs/x");
    expect(siteHref("/", "en")).toBe("/en");
    expect(siteHref("/#highlights", "en")).toBe("/en#highlights");
  });
});

describe("parseInline", () => {
  it("parses bold, italic, nested emphasis and code", () => {
    expect(parseInline("a **b** c")).toEqual([text("a "), { type: "strong", children: [text("b")] }, text(" c")]);
    expect(parseInline("*a **b** c*")).toEqual([{ type: "em", children: [text("a "), { type: "strong", children: [text("b")] }, text(" c")] }]);
    expect(parseInline("***x***")).toEqual([{ type: "strong", children: [{ type: "em", children: [text("x")] }] }]);
    expect(parseInline("run `bun test` now")).toEqual([text("run "), { type: "code", text: "bun test" }, text(" now")]);
    expect(parseInline("snake_case_name and 2 * 3 * 4")).toEqual([text("snake_case_name and 2 * 3 * 4")]);
  });
  it("keeps unclosed markers literal while streaming", () => {
    expect(parseInline("Hello **wor")).toEqual([text("Hello **wor")]);
    expect(parseInline("see [Voice AI](")).toEqual([text("see [Voice AI](")]);
    expect(parseInline("see [Voice AI](/labs/voice")).toEqual([text("see [Voice AI](/labs/voice")]);
    expect(parseInline("tick `code")).toEqual([text("tick `code")]);
  });
  it("links allowed targets and renders blocked ones as their label", () => {
    expect(parseInline("[Voice](/labs/voice-ai-contact-center)")).toEqual([{ type: "link", target: { kind: "site", path: "/labs/voice-ai-contact-center" }, children: [text("Voice")] }]);
    expect(parseInline("[x](javascript:alert(1))")).toEqual([text("x")]);
    expect(parseInline("[**x**](https://evil.example)")).toEqual([{ type: "strong", children: [text("x")] }]);
    expect(parseInline("[a [b](/labs)](/library)")).not.toContainEqual(expect.objectContaining({ type: "link", children: expect.arrayContaining([expect.objectContaining({ type: "link" })]) }));
  });
  it("never interprets HTML", () => {
    expect(parseInline("<script>alert(1)</script> <img src=x onerror=alert(1)>")).toEqual([text("<script>alert(1)</script> <img src=x onerror=alert(1)>")]);
  });
  it("supports backslash escapes and line breaks", () => {
    expect(parseInline("\\*not em\\*")).toEqual([text("*not em*")]);
    expect(parseInline("a\nb")).toEqual([text("a"), { type: "br" }, text("b")]);
  });
});

describe("parseMarkdown", () => {
  it("builds paragraphs, bullet and numbered lists", () => {
    const blocks = parseMarkdown("Projects:\n- **Voice AI**\n- Fraud review\n  continued\n\n1. One\n2. Two\n\nDone.");
    expect(blocks.map((b) => b.type)).toEqual(["p", "ul", "ol", "p"]);
    expect(blocks[1]).toEqual({ type: "ul", items: [[{ type: "strong", children: [text("Voice AI")] }], [text("Fraud review continued")]] });
    expect(blocks[2]).toMatchObject({ type: "ol", start: 1 });
  });
  it("renders headings as bold paragraphs and leaves tables and images as text", () => {
    expect(parseMarkdown("## Skills")).toEqual([{ type: "p", children: [{ type: "strong", children: [text("Skills")] }] }]);
    expect(parseMarkdown("| a | b |")).toEqual([{ type: "p", children: [text("| a | b |")] }]);
    expect(markdownToPlain("![logo](https://evil.example/x.png)")).toBe("!logo");
  });
  it("projects to plain text for the server checks", () => {
    expect(markdownToPlain("Projects:\n- **Voice AI** [page](/labs/voice-ai-contact-center)\n- *Fraud* `review`")).toBe("Projects:\n\nVoice AI page\nFraud review");
  });
});
```

- [x] **Step 2: Run it to see it fail**

Run: `bunx vitest run tests/unit/ask-markdown.test.ts`
Expected: FAIL, modules not found.

- [x] **Step 3: Implement `src/ask/links.ts`**

```ts
import { isPublicLiveUrl } from "../content/live-links";
import { ASK_REPO_CITE, type AskLocale } from "./protocol";

/**
 * Where a link in an Ask answer may point (owner request 2026-10-16): this site's own pages, the
 * public repository and the public live sites. Shared by the server checks (functions/_lib/checks.ts)
 * and the dock's markdown renderer; anything else renders as its label text.
 */
export const ASK_SITE_ORIGINS: readonly string[] = ["https://kurniadi.pages.dev"];

/** Locale-less top pages an answer may always link to (the server also allows the retrieved chunks' paths). */
export const ASK_LINK_PAGES: readonly string[] = ["/", "/labs", "/journey", "/library", "/contact", "/quick", "/cv"];

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const SITE_PATH = new RegExp(`^/(?:(?:labs|journey|blog)/${SLUG}|labs|journey|library|contact|quick|cv)?(?:#${SLUG}(?:=${SLUG})?)?$`);
const UNSAFE = /[\s\\<>"'`\u0000-\u001F\u007F]/;

export type AskLinkTarget = { kind: "site"; path: string } | { kind: "external"; href: string };

function sitePath(path: string): AskLinkTarget | null {
  let bare = path.replace(/^\/(?:en|id)(?=\/|#|$)/, "") || "/";
  if (bare.length > 1) bare = bare.replace(/\/(?=#|$)/, "");
  return SITE_PATH.test(bare) ? { kind: "site", path: bare } : null;
}

/** Classifies a link target: a site page (locale-less path), an allowlisted external URL, or null (render the label). */
export function askLinkTarget(raw: string, origins: readonly string[] = ASK_SITE_ORIGINS): AskLinkTarget | null {
  const url = raw.trim();
  if (!url || url.length > 200 || UNSAFE.test(url) || url.startsWith("//")) return null;
  if (url.startsWith("/")) return sitePath(url);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
  if (origins.includes(parsed.origin)) return parsed.search ? null : sitePath(`${parsed.pathname}${parsed.hash}`);
  if (url === ASK_REPO_CITE || url === `${ASK_REPO_CITE}/`) return { kind: "external", href: ASK_REPO_CITE };
  if (isPublicLiveUrl(url)) return { kind: "external", href: parsed.href };
  return null;
}

/** The href of a site path in the visitor's language. */
export function siteHref(path: string, locale: AskLocale): string {
  if (path === "/") return `/${locale}`;
  if (path.startsWith("/#")) return `/${locale}${path.slice(1)}`;
  return `/${locale}${path}`;
}
```

- [x] **Step 4: Implement `src/ask/markdown.ts`**

```ts
import { askLinkTarget, type AskLinkTarget } from "./links";

/**
 * The safe markdown subset of Ask answers (owner request 2026-10-16): paragraphs, bullet and
 * numbered lists, bold, italic, inline code and allowlisted links. A tiny parser to plain data; the
 * dock renders it as React elements and the server checks read `markdownToPlain`. HTML is never
 * interpreted, unclosed markers stay literal (a streaming answer), and heading lines become bold text.
 */
export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; target: AskLinkTarget; children: Inline[] }
  | { type: "br" };

export type Block = { type: "p"; children: Inline[] } | { type: "ul"; items: Inline[][] } | { type: "ol"; start: number; items: Inline[][] };

export interface MarkdownOptions {
  /** Origins that count as this site (absolute links to them become site paths). */
  origins?: readonly string[];
}

const BULLET = /^\s{0,3}[-*+\u2022]\s+(.*)$/;
const ORDERED = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const ESCAPABLE = /[\\`*_[\]()#+\-.!]/;
const MAX_DEPTH = 3;
const WORD = /[\p{L}\p{N}]/u;

const runLength = (s: string, at: number, c: string) => {
  let n = 0;
  while (s[at + n] === c) n++;
  return n;
};

/** Index of the marker that closes emphasis opened before `from`, or -1. */
function findClose(s: string, from: number, c: string, width: number): number {
  for (let j = from + 1; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === "`") {
      const end = s.indexOf("`", j + 1);
      if (end > j) {
        j = end;
        continue;
      }
    }
    if (s[j] !== c) continue;
    const run = runLength(s, j, c);
    const before = s[j - 1];
    if (width === 2 && run >= 2 && !/\s/.test(before)) return j + run - 2;
    if (width === 1 && run === 1 && !/\s/.test(before) && (c !== "_" || !WORD.test(s[j + 1] ?? ""))) return j;
    j += run - 1;
  }
  return -1;
}

function matchLink(s: string, at: number): { label: string; url: string; end: number } | null {
  const close = s.indexOf("](", at + 1);
  if (close < 0) return null;
  const label = s.slice(at + 1, close);
  if (!label || /[\n[\]]/.test(label)) return null;
  const end = s.indexOf(")", close + 2);
  if (end < 0) return null;
  const url = s.slice(close + 2, end);
  if (!url || /[\s(]/.test(url)) return null;
  return { label, url, end };
}

export function parseInline(source: string, options: MarkdownOptions & { links?: boolean } = {}, depth = 0): Inline[] {
  const { links = true } = options;
  const out: Inline[] = [];
  let text = "";
  const push = (node: Inline) => {
    if (text) out.push({ type: "text", text });
    text = "";
    out.push(node);
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\" && ESCAPABLE.test(source[i + 1] ?? "")) {
      text += source[i + 1];
      i += 2;
      continue;
    }
    if (c === "\n") {
      push({ type: "br" });
      i++;
      continue;
    }
    if (c === "`") {
      const end = source.indexOf("`", i + 1);
      if (end > i + 1 && !source.slice(i + 1, end).includes("\n")) {
        push({ type: "code", text: source.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if ((c === "*" || c === "_") && depth < MAX_DEPTH) {
      const width = source[i + 1] === c ? 2 : 1;
      const open = i + width;
      const next = source[open] ?? "";
      const intraword = c === "_" && WORD.test(source[i - 1] ?? "");
      if (next && !/\s/.test(next) && !intraword) {
        const close = findClose(source, open - 1, c, width);
        if (close > open) {
          push({ type: width === 2 ? "strong" : "em", children: parseInline(source.slice(open, close), options, depth + 1) });
          i = close + width;
          continue;
        }
      }
      text += source.slice(i, open);
      i = open;
      continue;
    }
    if (c === "[" && links) {
      const link = matchLink(source, i);
      if (link) {
        const children = parseInline(link.label, { ...options, links: false }, depth + 1);
        const target = askLinkTarget(link.url, options.origins);
        if (target) push({ type: "link", target, children });
        else {
          if (text) out.push({ type: "text", text });
          text = "";
          out.push(...children);
        }
        i = link.end + 1;
        continue;
      }
    }
    text += c;
    i++;
  }
  if (text) out.push({ type: "text", text });
  return mergeText(out);
}

function mergeText(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const node of nodes) {
    const last = out.at(-1);
    if (node.type === "text" && last?.type === "text") last.text += node.text;
    else out.push(node);
  }
  return out;
}

export function parseMarkdown(source: string, options: MarkdownOptions = {}): Block[] {
  const blocks: Block[] = [];
  const state = { para: [] as string[], list: null as { type: "ul" | "ol"; start: number; items: string[] } | null };
  const inline = (s: string) => parseInline(s, options);
  const flushPara = () => {
    if (state.para.length) blocks.push({ type: "p", children: inline(state.para.join("\n")) });
    state.para = [];
  };
  const flushList = () => {
    const list = state.list;
    if (list) blocks.push(list.type === "ul" ? { type: "ul", items: list.items.map(inline) } : { type: "ol", start: list.start, items: list.items.map(inline) });
    state.list = null;
  };
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const heading = HEADING.exec(raw);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({ type: "p", children: [{ type: "strong", children: inline(heading[1]) }] });
      continue;
    }
    const bullet = BULLET.exec(raw);
    const ordered = bullet ? null : ORDERED.exec(raw);
    if (bullet || ordered) {
      const type = bullet ? "ul" : "ol";
      flushPara();
      if (state.list && state.list.type !== type) flushList();
      if (!state.list) state.list = { type, start: ordered ? Number(ordered[1]) : 1, items: [] };
      state.list.items.push(bullet ? bullet[1] : ordered![2]);
      continue;
    }
    if (state.list && /^\s/.test(raw)) {
      state.list.items[state.list.items.length - 1] += ` ${raw.trim()}`;
      continue;
    }
    flushList();
    state.para.push(raw.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

const plainInline = (nodes: Inline[]): string =>
  nodes.map((n) => (n.type === "text" || n.type === "code" ? n.text : n.type === "br" ? "\n" : plainInline(n.children))).join("");

/** The answer as plain text: marks dropped, links as their labels, list items one per line. */
export function markdownToPlain(source: string): string {
  return parseMarkdown(source)
    .map((b) => (b.type === "p" ? plainInline(b.children) : b.items.map(plainInline).join("\n")))
    .join("\n\n");
}
```

Note: the expected value in the plain-text test (`"Projects:\n\nVoice AI page\nFraud review"`) follows from this code: the paragraph and the list are separate blocks joined by a blank line. If a test expectation and this code disagree on a detail that is not a safety rule, fix the test to the documented behavior, never weaken a blocked-link case.

- [x] **Step 5: Run the tests to see them pass**

Run: `bunx vitest run tests/unit/ask-markdown.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/ask/links.ts src/ask/markdown.ts tests/unit/ask-markdown.test.ts
git commit -m "feat(ask): safe markdown subset and link allowlist for answers"
```

---

### Task 5: Render markdown answers in the dock

**Files:**
- Create: `src/hud/ask/AskMarkdown.tsx`
- Modify: `src/hud/ask/AskChat.tsx` (`Message`: the assistant `<p>` becomes `AskMarkdown`)
- Test: `tests/hud/AskDock.test.tsx`, `e2e/ask.spec.ts`

**Interfaces:**
- Consumes: `parseMarkdown`, `Block`, `Inline` (Task 4), `siteHref`, `ASK_SITE_ORIGINS` (Task 4).
- Produces: `AskMarkdown({ text, locale, onNavigate?, className? })`.

- [x] **Step 1: Write the failing tests**

`tests/hud/AskDock.test.tsx`:

```tsx
  it("renders a markdown answer: lists, bold and allowlisted links only", async () => {
    answerWith("Projects:\n- **Voice AI** [case study](/labs/voice-ai-contact-center)\n- [x](javascript:alert(1)) and <b>raw</b>\n- [repo](https://github.com/ShinyQ/ShinyQ-HQ)");
    await ready();
    act(() => openAsk("Which projects?", { source: "hero" }));
    const panel = await dock();
    const answer = await vi.waitFor(() => {
      const node = panel.querySelector("[data-role='assistant']");
      expect(node?.querySelectorAll("li")).toHaveLength(3);
      return node as HTMLElement;
    });
    expect(answer.querySelector("strong")).toHaveTextContent("Voice AI");
    expect(within(answer).getByRole("link", { name: "case study" })).toHaveAttribute("href", "/en/labs/voice-ai-contact-center");
    const repo = within(answer).getByRole("link", { name: /^repo/ });
    expect(repo).toHaveAttribute("target", "_blank");
    expect(repo).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(answer).queryByRole("link", { name: "x" })).toBeNull();
    expect(answer.querySelector("b")).toBeNull();
    expect(answer.innerHTML).not.toMatch(/javascript:/i);
  });
```

`e2e/ask.spec.ts` (top level):

```ts
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
```

- [x] **Step 2: Run to see them fail**

Run: `bunx vitest run tests/hud/AskDock.test.tsx`
Expected: FAIL (the answer is one `<p>` of raw text).

- [x] **Step 3: Implement `src/hud/ask/AskMarkdown.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useMemo, type ReactNode } from "react";
import { ASK_SITE_ORIGINS, siteHref } from "@/ask/links";
import { parseMarkdown, type Inline } from "@/ask/markdown";
import type { Locale } from "@/content/schema";

/**
 * An Ask answer as the safe markdown subset (src/ask/markdown.ts), rendered as React elements: text
 * is never parsed as HTML and links are allowlisted (src/ask/links.ts). Site links stay in the tab
 * (`onNavigate` closes the bottom sheet first); external links open a new tab.
 */
export function AskMarkdown({ text, locale, onNavigate, className = "" }: { text: string; locale: Locale; onNavigate?: () => void; className?: string }) {
  const t = useTranslations("ask.dock");
  const blocks = useMemo(() => parseMarkdown(text, { origins: typeof window === "undefined" ? ASK_SITE_ORIGINS : [...ASK_SITE_ORIGINS, window.location.origin] }), [text]);

  const inline = (nodes: Inline[]): ReactNode[] =>
    nodes.map((node, i) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "br":
          return <br key={i} />;
        case "code":
          return (
            <code key={i} className="rounded bg-surface-2 px-1 py-px font-mono text-[0.92em] text-ink">
              {node.text}
            </code>
          );
        case "strong":
          return (
            <strong key={i} className="font-semibold text-ink">
              {inline(node.children)}
            </strong>
          );
        case "em":
          return <em key={i}>{inline(node.children)}</em>;
        case "link":
          return node.target.kind === "site" ? (
            <a key={i} href={siteHref(node.target.path, locale)} onClick={onNavigate} className="link" data-ask-link="site">
              {inline(node.children)}
            </a>
          ) : (
            <a key={i} href={node.target.href} target="_blank" rel="noopener noreferrer" className="link" data-ask-link="external">
              {inline(node.children)}
              <span aria-hidden="true"> ↗</span>
              <span className="sr-only"> ({t("newTab")})</span>
            </a>
          );
      }
    });

  return (
    <div className={`space-y-2 break-words ${className}`}>
      {blocks.map((block, i) => {
        if (block.type === "p") return <p key={i}>{inline(block.children)}</p>;
        const items = block.items.map((item, j) => <li key={j}>{inline(item)}</li>);
        return block.type === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-cyan/70">
            {items}
          </ul>
        ) : (
          <ol key={i} start={block.start} className="list-decimal space-y-1 pl-5 marker:text-ink-2">
            {items}
          </ol>
        );
      })}
    </div>
  );
}
```

`Message` in `AskChat.tsx` (assistant branch): replace the `<p className="... whitespace-pre-wrap ...">` with

```tsx
      <span className="sr-only">{labels.hq}: </span>
      <AskMarkdown text={message.text} locale={locale} onNavigate={onCite} className="text-sm leading-[22px] text-ink" />
```

(`dock.newTab` already exists in both message files; check with `grep -n '"newTab"' messages/*.json`.)

- [x] **Step 4: Run tests**

Run: `bunx vitest run tests/hud/AskDock.test.tsx tests/unit/ask-markdown.test.ts && bun run build && E2E_PORT=4391 bunx playwright test e2e/ask.spec.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/hud/ask/AskMarkdown.tsx src/hud/ask/AskChat.tsx tests/hud/AskDock.test.tsx e2e/ask.spec.ts
git commit -m "feat(ask): render answers as a safe markdown subset in the dock"
```

---

### Task 6: Server: let the model use lists and site links, keep every check on plain text

**Files:**
- Modify: `functions/_lib/checks.ts` (`sanitizeAnswer`, `checkAnswer`, new `answerLinkPaths`)
- Modify: `functions/_lib/retrieve.ts` (context lines carry the chunk's page)
- Modify: `functions/_lib/prompt.ts` (rule 4, `PROMPT_VERSION`)
- Modify: `scripts/ask-eval.ts` (`scoreGolden` and the red-team match read `markdownToPlain`)
- Modify: `docs/features.md`, `docs/ask-runbook.md` if it states "plain text only"
- Test: `tests/ask/checks.test.ts`, `tests/ask/pipeline.test.ts` (and any test that pins context lines)

**Interfaces:**
- Consumes: `markdownToPlain` (Task 4), `askLinkTarget`, `ASK_LINK_PAGES` (Task 4), `ASK_REPO_CITE`.
- Produces: `sanitizeAnswer(raw: string, links?: ReadonlySet<string>): string` (markdown kept, links normalized), `answerLinkPaths(chunks: readonly KnowledgeChunk[]): Set<string>`.

Design:
- `sanitizeAnswer` keeps newlines, list markers, `**`, `*`, `_` and single backticks; still strips invisible characters, `<script>`/`<style>` blocks, every HTML tag, images (`![alt](url)` becomes nothing), heading marks, code fences (the markers only, so `containsCode` still sees the code) and em dashes; collapses spaces per line and 3+ newlines to 2; then rewrites every `[label](url)`: kept as `[label](path)` only when `askLinkTarget(url)` is a site path in `links` (default: `ASK_LINK_PAGES`) or the repository URL when `links` has it; otherwise just `label`. The length cap cuts at the last ". ", "? ", "! " or newline.
- `answerLinkPaths(chunks)` = `ASK_LINK_PAGES` plus every chunk `url` that `askLinkTarget` accepts (site paths as their locale-less path, the repository URL as itself).
- `checkAnswer`: `text = sanitizeAnswer(answer, answerLinkPaths(chunks))`; blocklist, forbidden output and secret patterns run on `text` (URLs included); every other check (leak, first person, code, personal data, consulting, fit, defamation, outcome, numbers, employers, names, sources) runs on `plain = markdownToPlain(text)`. The `ok` result returns `text` (markdown).
- Context lines: `- ${body}${dated}${link}` where `link = target ? \` [link: ${chunk.url}]\` : ""` for chunk urls `askLinkTarget` accepts.
- Rule 4 becomes: `"4. Answer in the same language as the question (English or Indonesian). Keep it short: at most 3 short sentences, or one short sentence and a bullet list of at most 5 short items when listing projects, skills, posts or roles. You may use **bold** for a title and a markdown link [title](link) only with a link given in CONTEXT; no headings, tables, images or other links. Refer to him as Kurniadi."` Bump `PROMPT_VERSION` to `"2026-10-16.markdown.1"`.

- [x] **Step 1: Write the failing tests** (`tests/ask/checks.test.ts`; update the existing `sanitizeAnswer` expectation on line 73 to `"Hi **there**, ok"`)

```ts
describe("markdown answers (owner request 2026-10-16)", () => {
  it("keeps the safe subset and drops links outside the allowlist", () => {
    const links = new Set(["/labs/voice-ai-contact-center", "/labs"]);
    expect(sanitizeAnswer("Two:\n- **Voice AI** [case](/en/labs/voice-ai-contact-center)\n- [x](javascript:alert(1))\n- [y](/labs/made-up)\n- [z](https://evil.example)", links)).toBe(
      "Two:\n- **Voice AI** [case](/labs/voice-ai-contact-center)\n- x\n- y\n- z",
    );
    expect(sanitizeAnswer("# Title\n![img](https://evil.example/a.png) ok\n```\nconst a = 1;\n```")).toBe("Title\nok\nconst a = 1;");
  });
  it("runs the content checks on the plain text", () => {
    // `checkInput` is the file's existing helper that builds a valid CheckInput; reuse it (or the
    // literal the neighbouring tests use) with this answer.
    const result = checkAnswer(checkInput({ answer: "Projects:\n- **Voice AI Contact Center** [case study](/labs/voice-ai-contact-center)" }));
    expect(result.ok).toBe(true);
  });
});
```

Implementer note: read the top of `tests/ask/checks.test.ts` and `tests/ask/pipeline.test.ts` for the existing fixtures (pack, vocabulary, safety); write the second test with them, choosing words the fixture vocabulary knows. Add a pipeline test where the mock model returns a list answer with one allowed link (a retrieved chunk's url) and one made-up link, and assert the streamed text keeps the first and turns the second into its label.

- [x] **Step 2: Run to see them fail**

Run: `bunx vitest run tests/ask/checks.test.ts tests/ask/pipeline.test.ts`
Expected: FAIL.

- [x] **Step 3: Implement** as designed above. Keep imports relative (`../../src/ask/markdown`, `../../src/ask/links`).

- [x] **Step 4: Run the Ask suites**

Run: `bunx vitest run tests/ask tests/unit/ask-markdown.test.ts && bun run typecheck`
Expected: PASS. Fix any test that pinned the old context line format or plain-text-only behavior to the new documented behavior.

- [x] **Step 5: Commit**

```bash
git add functions/_lib scripts/ask-eval.ts tests/ask docs
git commit -m "feat(ask): the model may answer with short lists and site links; checks read plain text"
```

---

### Task 7: Verify, capture, PR

- [x] `bun run verify:quick`, then `bun run e2e:changed`.
- [x] Byte delta: Classic first-load JS (Lighthouse transfer, should be unchanged) and the lazy `AskChat` chunk gzip before (build of the base commit) and after.
- [x] Captures (desktop 1440x900 side panel, 390x844 bottom sheet): mid-stream, after an answer with pills, and a bullet answer with links; before from the base build with a mocked `/api/ask`, after from this branch; images in the session artifacts folder, uploaded to the PR.
- [x] Check `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`; rebase on `origin/main`; push; open the PR; report to the coordinator.
