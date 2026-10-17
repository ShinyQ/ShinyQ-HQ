# Case-study metric strip (Round 9 P) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: shipped (2026-10-17). Spec: Round 9 design, section 6 (coordinator's session plan `2026-10-17-round-9-design.md`).

Shipped with two deviations: the Classic strip goes 3 across from `md` (it reuses `FactRow`'s rule classes and gives wide values room), and `HEADLINE_MAX` lives in `selectors.ts` (client-safe), re-exported from `schema.ts`.

**Goal:** Every case study (the Classic `/[locale]/labs/[slug]` page and the 3D Glass Drawer) opens with a strip of up to 3 headline results: a big value and its label.

**Architecture:** One optional `headline: true` flag on `Result` (schema-validated, at most 3 per pod) and one selector, `headlineResults`, that returns the flagged results or else the first 3. A presentational, hook-free `MetricStrip` component renders the strip; the Classic page renders it on the server (no new client JS) and the drawer renders it at the top of the overview tab from room-view metrics marked `headline`. The full results (every result with its measurement context) stay on both surfaces.

**Tech Stack:** Next.js 16 static export, React 19, Tailwind CSS v4, Zod, Vitest, Playwright.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text.
- EN and ID for every user-facing string; UI strings in `messages/en.json` and `messages/id.json` with identical keys.
- No confidence marker (owner, 2026-10-17): `Result.confidence` stays internal review data (decision 2026-10-11, #44); the strip shows value and label only. `tests/unit/room-views.test.ts` keeps guarding it.
- Classic JS unchanged: the Classic strip is server-rendered (no `"use client"`, no hooks).
- Classic CSS within 20,480 B gzip (`lighthouserc.json`); today about 19,945 B, so reuse existing utilities and add at most a handful of new ones.
- Lighthouse accessibility 1.0 on case-study pages; semantic list markup, no color-only meaning, contrast from existing tokens (`text-ink`, `text-ink-2`).
- Responsive: 3 across on desktop (Classic `sm` and up; drawer container at least `22rem`), stacked rows on phones.
- Content is data: never hardcode results; client company names never appear (C3).
- Client code imports locale values from `@/content/locales`, never values from `@/content/schema` or `@/content/load`.

---

## File map

| File | Change |
|---|---|
| `src/content/schema.ts` | `ResultSchema.headline` (optional boolean); pod refinement: at most 3 headline results |
| `src/content/selectors.ts` | `headlineResults(results)` |
| `src/components/MetricStrip.tsx` | New: hook-free strip (value, label), used by the Classic page and the drawer |
| `src/app/[locale]/labs/[slug]/page.tsx` | Strip at the top of the header; full results move into a "Results" chapter only when it adds something |
| `src/content/room-views/types.ts`, `src/content/room-views/labs.ts` | `RoomMetric.headline?: true` |
| `src/hud/drawer/RoomDrawer.tsx` | Overview tab opens with the strip (replaces the first-3 `MetricTiles`) |
| `messages/en.json`, `messages/id.json` | `labs.keyResults` |
| `tests/unit/headline-results.test.ts` | Selector and schema tests |
| `tests/hud/RoomDrawer.test.tsx` | Drawer strip test |
| `e2e/pageview.spec.ts` | Classic strip at 390x844 and 1440x900 |
| `docs/agents/content.md`, `docs/agents/page-view.md`, `docs/agents/hud-and-drawer.md`, `docs/features.md`, `docs/content.md`, `docs/decisions.md`, `docs/superpowers/README.md` | Current rules and the dated row |

---

### Task 1: `headline` flag and `headlineResults`

**Files:**
- Modify: `src/content/schema.ts` (`ResultSchema`, pod `superRefine`)
- Modify: `src/content/selectors.ts`
- Test: `tests/unit/headline-results.test.ts`

**Interfaces:**
- Produces: `headlineResults<T extends { headline?: boolean }>(results: readonly T[]): T[]` (flagged results in dataset order, else the first 3; never more than 3). `HEADLINE_MAX = 3` exported from `src/content/schema.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import rawData from "../../content/site-content.json";
import { HEADLINE_MAX, ResultSchema, SiteContentSchema } from "@/content/schema";
import { headlineResults } from "@/content/selectors";

const r = (value: string, headline?: boolean) => ({ value, ...(headline ? { headline } : {}) });

describe("headlineResults", () => {
  it("takes the first three when nothing is flagged", () => {
    expect(headlineResults([r("a"), r("b"), r("c"), r("d")]).map((x) => x.value)).toEqual(["a", "b", "c"]);
    expect(headlineResults([r("a")]).map((x) => x.value)).toEqual(["a"]);
  });
  it("takes the flagged results in dataset order", () => {
    expect(headlineResults([r("a"), r("b", true), r("c"), r("d", true)]).map((x) => x.value)).toEqual(["b", "d"]);
  });
  it("never returns more than HEADLINE_MAX", () => {
    expect(HEADLINE_MAX).toBe(3);
  });
});

describe("Result.headline in the schema", () => {
  it("accepts the flag and rejects a non-boolean", () => {
    const base = { value: "1", label: { en: "x", id: "x" }, confidence: "verified" as const };
    expect(ResultSchema.safeParse({ ...base, headline: true }).success).toBe(true);
    expect(ResultSchema.safeParse({ ...base, headline: "yes" }).success).toBe(false);
  });
  it("rejects a pod with more than three headline results", () => {
    const data = structuredClone(rawData) as { floors: { labs: { pods: { results: Record<string, unknown>[] }[] } } };
    const pod = data.floors.labs.pods.find((p) => p.results.length === 4)!;
    pod.results.forEach((res) => (res.headline = true));
    const parsed = SiteContentSchema.safeParse(data);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("headline");
  });
  it("the dataset passes", () => {
    expect(SiteContentSchema.safeParse(rawData).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/headline-results.test.ts`
Expected: FAIL (`headlineResults` and `HEADLINE_MAX` are not exported).

- [ ] **Step 3: Implement**

In `src/content/schema.ts`, above `ResultSchema`:

```ts
/** Results a case study opens with (the metric strip): flagged ones, else the first ones. */
export const HEADLINE_MAX = 3;
```

Add to `ResultSchema` (after `context`):

```ts
  /** Opens the case study in the metric strip (at most `HEADLINE_MAX` per pod); unflagged pods show their first results. */
  headline: z.boolean().optional(),
```

In the pod `.superRefine((pod, ctx) => { ... })`, add:

```ts
    if (pod.results.filter((r) => r.headline).length > HEADLINE_MAX) {
      ctx.addIssue({ code: "custom", path: ["results"], message: `At most ${HEADLINE_MAX} headline results per pod` });
    }
```

In `src/content/selectors.ts` (import `HEADLINE_MAX` as a value from `./schema`; the selectors file is server-side, check `bun run build` still passes `check-client-chunks`; if a client file imports `headlineResults`, define the constant in `src/content/locales.ts`-style client-safe module instead):

```ts
/** The results a case study opens with: the ones flagged `headline`, else the first `HEADLINE_MAX`. */
export function headlineResults<T extends { headline?: boolean }>(results: readonly T[]): T[] {
  const flagged = results.filter((r) => r.headline);
  return (flagged.length > 0 ? flagged : results).slice(0, HEADLINE_MAX);
}
```

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run tests/unit/headline-results.test.ts tests/content`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/schema.ts src/content/selectors.ts tests/unit/headline-results.test.ts
git commit -m "feat(content): headline flag on results and headlineResults selector"
```

### Task 2: `MetricStrip` on the Classic case study

**Files:**
- Create: `src/components/MetricStrip.tsx`
- Modify: `src/app/[locale]/labs/[slug]/page.tsx`, `messages/en.json`, `messages/id.json`
- Test: `e2e/pageview.spec.ts`

**Interfaces:**
- Consumes: `headlineResults` (Task 1).
- Produces: `MetricStrip({ items, label, className? }: { items: readonly { value: string; label: string }[]; label: string; className?: string })`, a `<ul aria-label={label}>` with `data-testid="metric-strip"` and one `<li data-testid="metric-strip-item">` per item. No hooks, no `"use client"`.

Layout (reuse existing utilities; check the gzip CSS size after the build):
- `<ul>`: `grid border-y border-line sm:grid-cols-3`.
- `<li>`: phones, a row: `grid grid-cols-[minmax(5.5rem,auto)_1fr] items-baseline gap-4 py-3` with a top border between rows (`[&+li]:border-t border-line`); from `sm`: `sm:flex sm:flex-col sm:gap-2 sm:py-6 sm:pr-6`, and `sm:[&+li]:border-t-0 sm:[&+li]:border-l sm:[&+li]:pl-6`.
- Value: `pv-num text-[28px] sm:text-[40px]` (the ledger's number style). Label: `text-sm leading-[21px] text-ink`.

Page changes (`page.tsx`):
- `const headline = headlineResults(pod.results);` and `const detail = pod.results.length > headline.length || pod.results.some((r) => r.context);`
- Header: replace the `#results` section with `<section aria-labelledby="key-results-title" className="mt-8"> <h2 id="key-results-title" className="sr-only">{t("keyResults")}</h2> <MetricStrip items={headline.map((r) => ({ value: r.value, label: r.label[locale] }))} label={t("keyResults")} /> </section>` placed directly under the tagline block (before the live link and share links are fine either way; keep it after the tagline `<p>` and before `FactRow`).
- Main column: when `detail`, a first chapter `<Chapter id="results" title={t("results")}><MetricLedger results={pod.results} locale={locale} /></Chapter>` before Problem. The TOC keeps its `results` entry only when `detail` is true.
- Messages: `labs.keyResults`: EN "Key results", ID "Hasil utama".

- [ ] **Step 1: Write the failing e2e test** (append to `e2e/pageview.spec.ts`; `heroPod` and `content` come from `./routes`)

```ts
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`case study opens with the metric strip at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await openPage(page, staticTier(`/en/labs/${heroPod.slug}`));
    const strip = page.getByRole("list", { name: en.labs.keyResults });
    const items = strip.getByTestId("metric-strip-item");
    const expected = headlineResults(heroPod.results);
    await expect(items).toHaveCount(expected.length);
    await expect(items.first()).toContainText(expected[0].value);
    await expect(strip).toBeInViewport();
    const boxes = await items.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    // Desktop: one row (3 across). Phone: stacked rows.
    if (viewport.width >= 640) expect(new Set(boxes.map(Math.round)).size).toBe(1);
    else expect(new Set(boxes.map(Math.round)).size).toBe(expected.length);
    await expect(page.getByText(/self-reported|strongly-inferred|verified/i)).toHaveCount(0);
    await context.close();
  });
}
```

(Import `headlineResults` from `../src/content/selectors` and `en` from `../messages/en.json` if not already imported.)

- [ ] **Step 2: Build and run it to verify it fails**

Run: `bun run build && E2E_PORT=4395 bunx playwright test e2e/pageview.spec.ts -g "metric strip" --retries 0`
Expected: FAIL (no list named "Key results").

- [ ] **Step 3: Implement `MetricStrip`, the page changes and the messages** (as specified above).

- [ ] **Step 4: Verify**

Run: `bun run build && E2E_PORT=4395 bunx playwright test e2e/pageview.spec.ts -g "metric strip|axe: /en/labs" --retries 0`
Expected: PASS. Then `for f in out/_next/static/chunks/*.css; do gzip -c $f | wc -c; done` is under 20480, and `bun run check:client-chunks` style output from the build shows no new client chunk changes for the Classic page (the page JS is unchanged: compare the `<script>` list of `out/en/labs/<slug>.html` before and after).

- [ ] **Step 5: Commit**

```bash
git add src/components/MetricStrip.tsx "src/app/[locale]/labs/[slug]/page.tsx" messages/en.json messages/id.json e2e/pageview.spec.ts
git commit -m "feat(labs): case studies open with a metric strip of up to 3 headline results"
```

### Task 3: The strip in the Glass Drawer

**Files:**
- Modify: `src/content/room-views/types.ts` (`RoomMetric`), `src/content/room-views/labs.ts`, `src/hud/drawer/RoomDrawer.tsx`
- Test: `tests/hud/RoomDrawer.test.tsx`, `tests/unit/room-views.test.ts`

**Interfaces:**
- Consumes: `headlineResults` (Task 1), `MetricStrip` (Task 2).
- Produces: `RoomMetric.headline?: true`, set on the pod metrics that `headlineResults(pod.results)` returns.

Room view: in `podView` (labs.ts), `const top = new Set(headlineResults(pod.results));` then `metrics: pod.results.map((r) => ({ value: r.value, label: r.label[locale], context: r.context?.[locale], ...(top.has(r) ? { headline: true as const } : {}) }))`.

Drawer (`TabPanel` default case): replace the "Key results" block with

```tsx
{headline.length > 0 && <MetricStrip items={headline} label={t("keyResults")} className="..." />}
```

where `const headline = view.metrics.filter((m) => m.headline);` For the drawer, pass a `variant="panel"` prop (add to `MetricStrip`: `variant?: "page" | "panel"`) that uses a container query instead of the `sm` breakpoint: `@container` on the wrapper and `@[22rem]:grid-cols-3` on the list (`MetricTiles` already uses `@[22rem]`, so the variant is cheap), value `text-[24px] leading-7 font-extrabold tracking-tight text-ink` (the tile number style at a size that fits 3 across in 420 px). The drawer's Results tab keeps the full `MetricTiles` with context.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/room-views.test.ts` add:

```ts
it("marks up to three headline metrics on every pod view", () => {
  for (const locale of ["en", "id"] as const) {
    const views = buildRoomViews(locale);
    for (const pod of getPods()) {
      const metrics = views[`L3:${pod.slug}`].metrics;
      const marked = metrics.filter((m) => m.headline).map((m) => m.value);
      expect(marked).toEqual(headlineResults(pod.results).map((r) => r.value));
    }
  }
});
```

In `tests/hud/RoomDrawer.test.tsx` add:

```ts
it("opens a case study with the metric strip of its headline results", () => {
  render(<Harness view={hero} />);
  const strip = screen.getByRole("list", { name: en.drawer.keyResults });
  const marked = hero.metrics.filter((m) => m.headline);
  expect(within(strip).getAllByTestId("metric-strip-item")).toHaveLength(marked.length);
  expect(strip).toHaveTextContent(marked[0].value);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/room-views.test.ts tests/hud/RoomDrawer.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** (as specified above; the "keyResults" heading becomes the list's accessible name, so drop the visible `<h3>` or keep it with `id` and `aria-labelledby`; keep whichever keeps the existing RoomDrawer tests green).

- [ ] **Step 4: Run the tests**

Run: `bunx vitest run tests/unit/room-views.test.ts tests/hud`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/room-views src/hud/drawer/RoomDrawer.tsx src/components/MetricStrip.tsx tests/unit/room-views.test.ts tests/hud/RoomDrawer.test.tsx
git commit -m "feat(drawer): case-study drawers open with the metric strip"
```

### Task 4: Docs and verification

**Files:** `docs/agents/content.md` (schema additions: `Result.headline`), `docs/agents/page-view.md` (case study layout: strip, Results chapter rule), `docs/agents/hud-and-drawer.md` (overview tab opens with the strip), `docs/features.md` (L3 and Classic bullets plus the status log), `docs/content.md` (how to flag headline results), `docs/decisions.md` (row: 2026-10-17, Case-study metric strip, value and label only, no confidence marker, #44 stands), `docs/superpowers/README.md` (this plan, status).

- [ ] **Step 1:** Update the docs (current state only in `docs/agents/*`).
- [ ] **Step 2:** `bun run verify:quick` then `bun run e2e:changed`; record the CSS gzip size and a Lighthouse check of one case study (`bunx lhci autorun` or the CI job).
- [ ] **Step 3:** Before/after captures of a case study at 390x844, 834x1112 and 1440x900 (Classic) and the drawer at 1440x900 and 390x844 (lite tier), saved under the session artifacts folder for the PR body.
- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs: case-study metric strip"
```
