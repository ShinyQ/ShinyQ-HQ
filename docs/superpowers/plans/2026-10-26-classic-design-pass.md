# Classic Design Pass Implementation Plan

Status: in review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Classic site's recruiter path (spec `docs/superpowers/specs/2026-10-26-classic-design-pass-design.md`, picks F1 to F4 and F7 to F10) at almost no byte cost.

**Architecture:** Server-rendered markup and class changes only, reusing existing `pv-` classes, generated Tailwind utilities and the existing `CvButton` island. One new server-only string pair (`case.nextStep`), one CSS rule (`.pv-btn:active`).

**Tech Stack:** Next.js 16 static export, Tailwind v4, next-intl, Playwright e2e, Vitest.

## Global Constraints

- No em dashes (U+2014) anywhere, including commits.
- No first person in headings; UI strings are sentence case (Title Case is for content titles only).
- Every UI string in both `messages/en.json` and `messages/id.json` with identical keys.
- No colored edge stripes; neutral hairlines only. No CSS `text-transform` for casing.
- Reduced-motion rules use `@variant motion-reduce` (this plan adds no motion).
- No changes under `src/experience`, `src/hud`, the boot card or onboarding.
- No new client islands or client code: View CV reuses `CvButton` (`src/components/cv/CvButton.tsx`).
- Budgets (Lighthouse CI, Bun gzip): CSS 20,480 B (largest chunk 19,928 B before), HTML 83,968 B, JS 245,760 B. Any cap raise stops the work.
- Commits: conventional messages; package manager Bun.
- e2e pages open with `openPage(page, staticTier(path))` from `e2e/hq.ts` and `staticTier` in `e2e/pageview.spec.ts`; wait on state, never on time.

---

### Task 1: Case study next step (F1)

**Files:**
- Modify: `src/app/[locale]/labs/[slug]/page.tsx` (import `CvButton`, add a section before `<section aria-labelledby="related-title">`)
- Modify: `messages/en.json`, `messages/id.json` (`case.nextStep`)
- Test: `e2e/pageview.spec.ts`

**Interfaces:**
- Consumes: `CvButton({ className, children, testId })` from `@/components/cv/CvButton`; `tc("viewCv")` (namespace `common`); `th("aboutContact")` (namespace `home`, add `const th = await getTranslations({ locale, namespace: "home" })` if absent); `tcase` (namespace `case`).
- Produces: `data-testid="case-next-step"` on the section, `data-testid="cv-open-case"` on the CV link.

- [ ] **Step 1: Write the failing e2e test** (append after the story test in `e2e/pageview.spec.ts`)

```ts
for (const pod of [storyPod, plainPod]) {
  test(`case study ${pod.slug} ends with a next step: View CV opens the reader, About and contact links on`, async ({ page }) => {
    await openPage(page, staticTier(`/en/labs/${pod.slug}`));
    const row = page.getByTestId("case-next-step");
    await expect(row.getByRole("heading", { level: 2 })).toHaveText(en.case.nextStep);
    await expect(row.getByRole("link", { name: en.home.aboutContact })).toHaveAttribute("href", "/en/contact?tier=static");
    const cv = row.getByTestId("cv-open-case");
    await expect(cv).toHaveClass(/pv-btn-primary/);
    await expect(cv).toHaveText(en.common.viewCv);
    await cv.click();
    await expectCvReader(page);
  });
}
```

Note: check the actual `href` the static tier produces for internal links (`ViewParamSync` and `?tier=` handling); if the About link renders as `/en/contact`, assert that instead. Read an existing assertion in this spec for an internal link on a `staticTier` page before choosing.

- [ ] **Step 2: Run it to see it fail**

Run: `bun run build && bunx playwright test e2e/pageview.spec.ts -g "ends with a next step"`
Expected: FAIL (no `case-next-step`).

- [ ] **Step 3: Add the strings**

`messages/en.json`, inside `"case"`: `"nextStep": "Hiring for work like this?"`
`messages/id.json`, inside `"case"`: `"nextStep": "Sedang merekrut untuk pekerjaan seperti ini?"`

- [ ] **Step 4: Add the section** in `src/app/[locale]/labs/[slug]/page.tsx`, immediately before the related section:

```tsx
<section aria-labelledby="next-step-title" className="pv-wrap pt-16" data-testid="case-next-step">
  <div className="flex flex-wrap items-center gap-x-6 gap-y-4 border-y border-line py-6">
    <h2 id="next-step-title" className="pv-h3 mr-auto">
      {tcase("nextStep")}
    </h2>
    <div className="flex flex-wrap gap-3">
      <CvButton className="pv-btn pv-btn-primary" testId="cv-open-case">
        {tc("viewCv")}
      </CvButton>
      <Link href="/contact" className="pv-btn pv-btn-ghost">
        {th("aboutContact")}
      </Link>
    </div>
  </div>
</section>
```

Use only utilities already in the built stylesheet; after the build, confirm the largest CSS chunk did not grow (`bun <session>/measure.ts out` or compare `ls -l out/_next/static/chunks/*.css`). If `pt-16` is not generated, use the spacing the neighbouring sections use (`pv-sec` adds its own padding; do not stack both).

- [ ] **Step 5: Run the test to see it pass**

Run: `bun run build && bunx playwright test e2e/pageview.spec.ts -g "next step|reads as a story|anchors and table"`
Expected: PASS (the story test still finds its chapters because the new section is outside `article`).

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/labs/[slug]/page.tsx" messages/en.json messages/id.json e2e/pageview.spec.ts
git commit -m "feat(page): case studies end with a next step, View CV and About and contact"
```

### Task 2: Headline results on `/labs` Key projects (F2)

**Files:**
- Modify: `src/components/page/Work.tsx` (`WorkFeature`)
- Modify: `src/app/[locale]/labs/page.tsx:63` (drop `size="grid"`)
- Test: `e2e/pageview.spec.ts`

**Interfaces:**
- Produces: `WorkFeature({ pod, locale })` (the `size` prop is removed). `data-testid="feature-result"` on the result block.

- [ ] **Step 1: Confirm no other users** of the `lead` and `pair` variants

Run: `grep -rn "WorkFeature\|size=\"lead\"\|size=\"pair\"" src tests e2e scripts`
Expected: only `src/components/page/Work.tsx` and `src/app/[locale]/labs/page.tsx:63` (`size="grid"`). If anything else uses them, stop and keep the variants.

- [ ] **Step 2: Write the failing e2e test**

```ts
test("Work Key projects show each card's headline result under the title", async ({ page }) => {
  await openPage(page, staticTier("/en/labs"));
  const cards = page.locator("#key-projects article");
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const result = card.getByTestId("feature-result");
    await expect(result).toHaveCount(1);
    const order = await card.evaluate((el) => {
      const title = el.querySelector(".pv-feature-title")!;
      const res = el.querySelector("[data-testid='feature-result']")!;
      const text = el.querySelector(".pv-card-text")!;
      return [title.compareDocumentPosition(res) & 4, res.compareDocumentPosition(text) & 4];
    });
    expect(order).toEqual([4, 4]);
  }
});
```

(Every Key project is a hero pod with results; if a pod has no results the card renders none, so if this test fails on a card with `pod.results.length === 0`, filter those cards using `data-pod` and the dataset instead of weakening the order check.)

- [ ] **Step 3: Run it to see it fail**

Run: `bunx playwright test e2e/pageview.spec.ts -g "Key projects show"` (after `bun run build`)
Expected: FAIL (0 `feature-result`).

- [ ] **Step 4: Rewrite `WorkFeature`** as one card shape:

```tsx
/**
 * A Key project card on Work: its cover (or a designed placeholder), wing, period and client, the title, the headline
 * result under the title (recruiters scan results first, as on the landing cards), the tagline, then the live link
 * and the stack logos at the foot.
 */
export async function WorkFeature({ pod, locale }: { pod: Pod; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "work" });
  const cover = coverImage(pod.assets, locale);
  const result = pod.results[0];
  return (
    <article className="pv-feature relative flex h-full flex-col gap-4">
      {cover ? (
        <div className="pv-shot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover.src} srcSet={imageSrcSet(cover)} sizes={CARD_SIZES} alt={cover.alt} width={cover.width} height={cover.height} loading="lazy" decoding="async" className="aspect-[16/10]" />
        </div>
      ) : (
        <div className="pv-shot">
          <ProjectPlaceholder id={`ph-card-${pod.slug}`} title={pod.title[locale]} wing={pod.wing} size="card" />
        </div>
      )}
      <p className="pv-data flex flex-wrap items-center gap-x-4 gap-y-1">
        <Marker accent={WING_ACCENT[pod.wing]}>{t(`wingShort.${pod.wing}`)}</Marker>
        <span className="pv-date">{formatPeriod(pod.period.start, pod.period.end, locale)}</span>
        {pod.client && <span>{clientLabel(pod.client, locale)}</span>}
      </p>
      <h3 className="pv-h3 pv-h3-card pv-feature-title">
        <Link href={`/labs/${pod.slug}`} className="pv-stretch">
          {pod.title[locale]}
        </Link>
      </h3>
      {result && (
        <div className="pv-result" data-testid="feature-result">
          <p className="pv-num text-[24px]">{result.value}</p>
          <p className="pv-result-label">{result.label[locale]}</p>
        </div>
      )}
      <p className="pv-card-text">{pod.tagline[locale]}</p>
      <div className="mt-auto flex flex-col gap-4 empty:hidden">
        <PodLiveCta pod={pod} locale={locale} />
        {cover && <TechLogoRow items={pod.stack} max={6} />}
      </div>
    </article>
  );
}
```

Keep the original `<img>` attributes formatted the way Prettier/ESLint want (run `bunx eslint --fix` on the file). In `labs/page.tsx` change `<WorkFeature pod={pod} locale={locale} size="grid" />` to `<WorkFeature pod={pod} locale={locale} />`.

- [ ] **Step 5: Run the tests**

Run: `bun run build && bunx playwright test e2e/pageview.spec.ts -g "Key projects show|Work filters|horizontal overflow|axe: /en/labs"`
Expected: PASS. Also run any existing grid alignment test that covers `/labs` Key projects (`expectAlignedGrid`, search the spec for `key-projects`).

- [ ] **Step 6: Commit**

```bash
git add src/components/page/Work.tsx "src/app/[locale]/labs/page.tsx" e2e/pageview.spec.ts
git commit -m "feat(page): Work Key projects show the headline result under the title"
```

### Task 3: `/cv` actions first on phones (F3) and the hero role title (F4)

**Files:**
- Modify: `src/components/cv/CvCover.tsx`
- Modify: `src/components/page/Hero.tsx:51`
- Test: `e2e/pageview.spec.ts`

- [ ] **Step 1: Write the failing e2e tests**

```ts
/** The element's bottom edge is inside the first screen (no scrolling). */
async function expectInFirstScreen(locator: Locator) {
  const { bottom, height } = await locator.evaluate((el) => ({ bottom: el.getBoundingClientRect().bottom + scrollY, height: innerHeight }));
  expect(bottom).toBeLessThanOrEqual(height);
}

test("landing: View CV stays above the fold on a 375x667 phone with the larger role title", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  await openPage(page, staticTier("/en"));
  await expect(page.locator("section[aria-labelledby='hero-title'] .pv-h3-l")).toHaveText(data.profile.headline.en);
  await expectInFirstScreen(page.getByTestId("cv-open-hero"));
  await page.close();
});

test("/cv on a phone: View CV and Download PDF come before the page image, inside the first screen", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await openPage(page, staticTier("/en/cv"));
  const card = page.getByTestId("cv-card");
  await expectInFirstScreen(card.getByTestId("cv-read"));
  await expectInFirstScreen(card.getByTestId("cv-download"));
  const readTop = await card.getByTestId("cv-read").evaluate((el) => el.getBoundingClientRect().top);
  const imgTop = await card.getByTestId("cv-cover-image").evaluate((el) => el.getBoundingClientRect().top);
  expect(readTop).toBeLessThan(imgTop);
  await page.close();
});
```

Check where `data.profile.headline` lives in `content/site-content.json` (`getProfile()` in `src/content/load.ts`) and adjust the path if it differs. `Locator` is already imported in this spec.

- [ ] **Step 2: Run them to see them fail**

Run: `bunx playwright test e2e/pageview.spec.ts -g "375x667|/cv on a phone"` (after a build)
Expected: the hero test fails on the `.pv-h3-l` locator; the `/cv` test fails on the first-screen check.

- [ ] **Step 3: Hero role title** in `src/components/page/Hero.tsx`:

```tsx
<p className="pv-h3 pv-h3-l mt-7">{profile.headline[locale]}</p>
<p className="pv-lead mt-2 max-w-none text-ink-2">{profile.subheadline[locale]}</p>
```

(`mt-2` on the motto only if it is already generated; otherwise keep `mt-1`.)

- [ ] **Step 4: `/cv` order** in `src/components/cv/CvCover.tsx`:
  - card: `className="card mt-8 grid gap-6 p-5 md:grid-cols-[minmax(0,320px)_1fr] md:p-6"`
  - actions column: `className="-order-1 flex min-w-0 flex-col md:order-none"`
  - buttons row: `className="mt-5 flex flex-wrap gap-3 md:mt-auto"`

  After the build, compare the largest CSS chunk with the baseline (19,928 B Bun gzip). If `md:p-6` or `md:mt-auto` are new utilities the chunk may grow a few bytes; that is expected and goes in the PR table. Remove nothing else.

- [ ] **Step 5: Run the tests**

Run: `bun run build && bunx playwright test e2e/pageview.spec.ts -g "375x667|/cv on a phone|/en/cv shows page 1|/id/cv shows page 1|View CV is the primary|LCP element on a phone|first paint waits"`
Expected: PASS (the hero name stays the LCP element).

- [ ] **Step 6: Commit**

```bash
git add src/components/cv/CvCover.tsx src/components/page/Hero.tsx e2e/pageview.spec.ts
git commit -m "feat(page): role title in the display face, /cv actions first on phones"
```

### Task 4: 404 cleanup (F7) and small polish (F8, F9, F10)

**Files:**
- Modify: `src/app/global-not-found.tsx`
- Modify: `src/app/pageview.css` (after `.pv-btn-ghost:hover`)
- Modify: `messages/en.json`, `messages/id.json` (`office.classic.loading`)
- Modify: `src/components/page/Hero.tsx` (`h1`), `src/components/SiteHeader.tsx` (name span)
- Test: `e2e/not-found.spec.ts`

- [ ] **Step 1: Write the failing e2e test** (append to `e2e/not-found.spec.ts`)

```ts
test("404: the Home box is not a button, its links are 44 px targets, theme-color matches the site", async ({ page }) => {
  await page.goto("/en/no-such-page");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#05050c");
  const home = page.getByTestId("not-found-home");
  await expect(home).not.toHaveClass(/pv-btn/);
  for (const name of [/English/, /Bahasa Indonesia/]) {
    const box = await home.getByRole("link", { name }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bunx playwright test e2e/not-found.spec.ts` (after a build)
Expected: FAIL (no theme-color, no `not-found-home`).

- [ ] **Step 3: 404 changes** in `src/app/global-not-found.tsx`:
  - `import type { Metadata, Viewport } from "next";` and `export const viewport: Viewport = { themeColor: "#05050c" };`
  - Replace the Home `span` with:

```tsx
<div className="flex flex-col items-start rounded-xl border border-line-2 px-5 py-3 text-left" data-testid="not-found-home">
  <b className="block text-[15px] font-semibold">{en.notFound.home}</b>
  <span className="flex flex-wrap items-center gap-x-2 text-xs">
    <Link className="pv-uline inline-flex min-h-11 items-center" href="/en">English</Link>
    <span aria-hidden="true">·</span>
    <Link className="pv-uline inline-flex min-h-11 items-center" href="/id" lang="id">Bahasa Indonesia</Link>
  </span>
</div>
```

  Use only utilities already generated (check the built CSS for `.py-3`, `.px-5`, `.rounded-xl`, `.gap-x-2`, `.text-\[15px\]`; swap any missing one for a generated equivalent).

- [ ] **Step 4: Pressed state** in `src/app/pageview.css`, after `.pv-btn-ghost:hover { ... }`:

```css
  /* Pressed: an instant 1 px press (no transition, so nothing to reduce under reduced motion). */
  .pv-btn:active {
    transform: translateY(1px);
  }
```

- [ ] **Step 5: Ellipsis**: `messages/en.json` `office.classic.loading` to `"Opening the office…"`; `messages/id.json` to `"Membuka kantor…"`. Search e2e and tests for the old strings (`grep -rn "Opening the office\|Membuka kantor" e2e tests src`) and update any literal copies.

- [ ] **Step 6: `translate="no"`** on the hero `h1` (`<h1 id="hero-title" translate="no" ...>`) and on the header name span in `SiteHeader.tsx` (`<span translate="no" className="block font-semibold text-ink">`).

- [ ] **Step 7: Run tests**

Run: `bun run build && bunx playwright test e2e/not-found.spec.ts e2e/office-classic.spec.ts && bunx vitest run tests/content/fonts.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/global-not-found.tsx src/app/pageview.css messages/en.json messages/id.json src/components/page/Hero.tsx src/components/SiteHeader.tsx e2e/not-found.spec.ts
git commit -m "feat(page): 404 Home box and targets, pressed buttons, ellipsis, untranslated name"
```

### Task 5: Docs, measurements, verification and PR

**Files:**
- Modify: `docs/agents/page-view.md` (case study, Work Key projects, hero, `/cv`, 404 sections)
- Modify: `docs/agents/styling-and-i18n.md` (Page View layer: `pv-btn` pressed state)
- Modify: `docs/features.md` (Classic site bullets)
- Modify: this plan's `Status:` line, the spec's `Status:` line

- [ ] **Step 1: Docs** (current state only, no history):
  - page-view.md Case study: "A next-step row (`case-next-step`, `case.nextStep`) closes every case study before the related projects: View CV (`CvButton`, `cv-open-case`, primary) and About and contact (ghost)."
  - page-view.md Selected work / Other key projects: `/labs` Key projects cards (`WorkFeature`) show `pod.results[0]` as `pv-result` under the title like the landing cards; the stack logo row (up to 6) sits at the foot.
  - page-view.md Hero: the headline is set in `pv-h3 pv-h3-l` (display face), the motto in `pv-lead`; View CV stays inside the first screen at 375x667 (e2e).
  - page-view.md: new short `/cv` note: below `md` the actions come first, then page 1.
  - page-view.md Not found: the Home box is a plain bordered box (not a button), its links are 44 px targets; `theme-color` set.
  - styling-and-i18n.md Page View layer: "`pv-btn` has an instant 1 px pressed state (`:active`), no transition."
  - features.md Classic site: one bullet "Design pass (2026-10-26)" summarising the four visible changes.
- [ ] **Step 2: Measure** with `bun <session>/measure.ts out` after `bun run build`; record before/after for the largest CSS chunk, `/en/labs`, `/en/quick`, `/id/quick`, the case study, `/en`, `/en/cv`. Stop and report if any cap would be exceeded.
- [ ] **Step 3: Verify**: `bun run verify:quick`, then `bun run e2e:changed`. Fix anything red.
- [ ] **Step 4: web-design-guidelines check** on the changed files; record the result for the PR.
- [ ] **Step 5: After screenshots** at 1440 and 390 for hero, `/labs` Key projects, case study end, `/cv`, 404; attach before/after to the PR.
- [ ] **Step 6: Commit docs** (`docs: Classic design pass rules and status`), check the CI queue (`gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`), push, open the PR ready for review.
