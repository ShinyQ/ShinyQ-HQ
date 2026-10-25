# Classic Recruiter Pass Implementation Plan

Status: shipped in #320 (3015599), 2026-10-25

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Classic site win a recruiter in 10 seconds. The landing page gets a proof strip and View CV as its primary button, six featured case studies read as stories, and the 404 and empty states always offer a next step.

**Architecture:**
- **Data first:** new optional schema fields (`stat.short`, `profile.heroProof`, `pod.story`) with cross-checks in `SiteContentSchema`. Rendering then reads only data.
- **Components:** server components reuse existing Neon Grid classes, so the global stylesheet barely grows.
- **404:** "Did you mean" is one small client component reading a static `/data/routes/index.json` built by the existing data route handler.

**Tech Stack:** Next.js 16 static export, React 19, next-intl, zod 4, Tailwind 4, Vitest, Playwright. Bun is the package manager.

Spec: [`docs/superpowers/specs/2026-10-25-classic-recruiter-pass-design.md`](../specs/2026-10-25-classic-recruiter-pass-design.md).

## Global Constraints

- **Visual identity:** no new colors, fonts or dependencies. The Neon Grid backdrop, tokens and the three fonts (Inter, JetBrains Mono, Archivo) stay.
- **Prior owner decisions stand:**
  - no illustration beside the hero name;
  - no colored edge stripes (use `AccentDot` / `hq-glow`; a neutral hairline is fine);
  - the ticker has no "Updated" stamp or pause switch;
  - motion stops under reduced motion (`@variant motion-reduce`, never a bare `prefers-reduced-motion` query).
- **Budgets:**
  - Classic, every page (`lighthouserc.json`): CSS 20,480 B, JS 245,760 B, HTML 83,968 B, LCP 2 s, CLS 0.01.
  - The global stylesheet is about 19.5 KB gzip, so new styles must reuse existing classes. Growth of the global CSS chunk stays under 250 B gzip.
  - The 404 gets its own CSS module.
  - `/en/quick` HTML is near its budget: strings in `LAYOUT_NAMESPACES` (`ask`, `certs`, `cv`, ...) must not get longer.
- **Hard rules:**
  - no em dashes (U+2014) anywhere, including commits;
  - no first person in titles, taglines, page titles or chapter headings ("Role and key decisions", never "My ...");
  - every user-facing string is `{ en, id }`, and `messages/en.json` and `messages/id.json` keep identical keys;
  - no client company names (sector labels only);
  - content is data: no career facts hard-coded in components.
- **Lessons** (`pod.story.lesson`) are the owner's opinions: drafted only from the owner's existing words, added only after owner approval.
- **No 3D code changes.** `stats` stays at exactly 6 entries; the 3D Lobby stats ring reads them unchanged.
- **Workflow:** use `rtk` for git; conventional commits; one PR; at most 2 CI runs in flight.

## File map

| File | Responsibility |
|---|---|
| `src/content/schema.ts` | `StatSchema.short`, `ProfileSchema.heroProof`, `PodStorySchema`, `STORY_SLUGS`, cross-checks |
| `content/site-content.json` | stats swap and short labels, `profile.heroProof`, six `pod.story` |
| `src/content/pageview.ts` | `heroProofStats()` |
| `src/components/page/ProofStrip.tsx` (new) | the hero proof strip |
| `src/components/page/Hero.tsx` | proof slot, View CV primary, button order |
| `src/components/page/Featured.tsx` | result line under the title |
| `src/app/[locale]/page.tsx` | ticker without the proof stats, the new section order |
| `src/components/page/Story.tsx` (new) | `DecisionList`, `Lesson` |
| `src/app/[locale]/labs/[slug]/page.tsx` | story chapters when `pod.story` exists |
| `src/lib/route-index.ts` (new) | `ROUTES_INDEX_FILE`, `buildRouteIndex()` |
| `src/lib/did-you-mean.ts` (new) | `suggestRoute()` (pure) |
| `src/app/data/[...path]/route.ts` | serves `routes/index.json` |
| `src/components/DidYouMean.tsx` (new) | the client island on the 404 |
| `src/app/global-not-found.tsx` and `src/app/not-found.module.css` (new) | the 404 page |
| `messages/en.json`, `messages/id.json` | new keys and empty-state copy |
| Tests | `tests/content/recruiter-pass.test.ts` (new), `tests/unit/did-you-mean.test.ts` (new), `tests/unit/route-index.test.ts` (new), `e2e/pageview.spec.ts`, `e2e/not-found.spec.ts` (new), `e2e/office-classic.spec.ts` |
| Docs | `docs/agents/page-view.md`, `docs/agents/content.md`, `docs/content.md`, `docs/features.md`, `docs/decisions/2026-10-25-classic-recruiter-pass.md` |

---

### Task 1: Data model and the stats swap

**Files:**
- Modify: `src/content/schema.ts` (`StatSchema` about line 90, `ProfileSchema` about line 71, `SiteContentSchema` about line 611)
- Modify: `content/site-content.json` (`stats`, `profile`)
- Create: `tests/content/recruiter-pass.test.ts`

**Interfaces:**
- Produces:
  - `Stat.short?: LocalizedText`
  - `Profile.heroProof: string[]` (exactly 3)
  - `STAT_SHORT_MAX = 28`
  - stats ids `enterprise-clients`, `prs-merged-2026` and `microsoft-certifications`, each with `short`.

- [ ] **Step 1: Write the failing test**

Create `tests/content/recruiter-pass.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import data from "../../content/site-content.json";
import { SiteContentSchema, STAT_SHORT_MAX } from "@/content/schema";
import { hasFirstPerson } from "@/lib/first-person";

const content = SiteContentSchema.parse(data);

describe("landing proof strip data (owner decision 2026-10-25)", () => {
  it("names exactly three distinct stats, each with a short label in both locales", () => {
    expect(content.profile.heroProof).toEqual(["enterprise-clients", "prs-merged-2026", "microsoft-certifications"]);
    for (const id of content.profile.heroProof) {
      const stat = content.stats.find((s) => s.id === id);
      expect(stat, id).toBeDefined();
      for (const locale of ["en", "id"] as const) {
        const short = stat!.short?.[locale] ?? "";
        expect(short.length, `${id} ${locale}`).toBeGreaterThan(0);
        expect(short.length, `${id} ${locale}`).toBeLessThanOrEqual(STAT_SHORT_MAX);
        expect(hasFirstPerson(short, locale), `${id} ${locale}`).toBe(false);
      }
    }
  });

  it("keeps six stats: 12+ enterprise clients in, building since 2019 out", () => {
    expect(content.stats).toHaveLength(6);
    expect(content.stats.map((s) => s.id)).not.toContain("shipping-since-2019");
    expect(content.stats.find((s) => s.id === "enterprise-clients")).toMatchObject({ value: "12+", confidence: "self-reported" });
  });

  it("rejects a proof id that is not a stat, and a proof stat without a short label", () => {
    const unknown = structuredClone(data);
    unknown.profile.heroProof = ["enterprise-clients", "prs-merged-2026", "no-such-stat"];
    expect(SiteContentSchema.safeParse(unknown).success).toBe(false);
    const bare = structuredClone(data) as typeof data & { stats: { id: string; short?: unknown }[] };
    delete bare.stats.find((s) => s.id === "prs-merged-2026")!.short;
    expect(SiteContentSchema.safeParse(bare).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/content/recruiter-pass.test.ts`
Expected: FAIL. `STAT_SHORT_MAX` is not exported, and `heroProof` is undefined.

- [ ] **Step 3: Extend the schema**

In `src/content/schema.ts`, add `short` to `StatSchema`:

```ts
/** Longest `Stat.short` in either locale (one cell of the landing proof strip). */
export const STAT_SHORT_MAX = 28;

export const StatSchema = z.strictObject({
  id: SlugSchema,
  value: nonEmpty,
  label: LocalizedTextSchema,
  /** Short label for the landing proof strip (`profile.heroProof`, owner decision 2026-10-25); `label` stays the full sentence. */
  short: LocalizedTextSchema.optional(),
  source: nonEmpty,
  confidence: ConfidenceSchema,
});
```

`StatSchema` is declared after `ProfileSchema`, so move the `STAT_SHORT_MAX` const above `ProfileSchema`. Then add `heroProof` as the last `ProfileSchema` field:

```ts
  photo: AssetSchema.optional(),
  /** The landing hero's proof strip (owner decision 2026-10-25): exactly three `stats` ids, each with a `short` label. */
  heroProof: z.array(SlugSchema).length(3),
});
```

Add these checks inside `SiteContentSchema`'s `superRefine`, after the selected-rank loop:

```ts
  const statIndex = new Map(content.stats.map((s, i) => [s.id, i]));
  if (new Set(content.profile.heroProof).size !== content.profile.heroProof.length) {
    ctx.addIssue({ code: "custom", path: ["profile", "heroProof"], message: "heroProof lists a stat twice" });
  }
  content.profile.heroProof.forEach((id, i) => {
    const at = statIndex.get(id);
    if (at === undefined) {
      ctx.addIssue({ code: "custom", path: ["profile", "heroProof", i], message: `Unknown stat "${id}"` });
      return;
    }
    const short = content.stats[at].short;
    if (!short) ctx.addIssue({ code: "custom", path: ["stats", at, "short"], message: `Stat "${id}" is in profile.heroProof and needs a short label` });
    else for (const locale of LOCALES) {
      if (short[locale].length > STAT_SHORT_MAX) ctx.addIssue({ code: "custom", path: ["stats", at, "short", locale], message: `Longer than ${STAT_SHORT_MAX} characters` });
    }
  });
```

If `LOCALES` is not yet defined above that point, use `(["en", "id"] as const)`.

- [ ] **Step 4: Update the dataset**

Run this one-off script (`site-content.json` round-trips exactly through `JSON.stringify(..., null, 2) + "\n"`):

```bash
bun -e '
const fs = require("fs");
const p = "content/site-content.json";
const c = JSON.parse(fs.readFileSync(p, "utf8"));
const at = c.stats.findIndex((s) => s.id === "shipping-since-2019");
c.stats.splice(at, 1, {
  id: "enterprise-clients",
  value: "12+",
  label: { en: "Enterprise clients served with Azure-native AI platforms since February 2026", id: "Klien enterprise yang dilayani dengan platform AI berbasis Azure sejak Februari 2026" },
  short: { en: "enterprise clients", id: "klien enterprise" },
  source: "Owner-confirmed count of enterprise client engagements at Metrodata since Feb 2026 (owner decision 2026-10-24); never tied to repository evidence",
  confidence: "self-reported",
});
const short = { "prs-merged-2026": { en: "PRs merged in 2026", id: "PR di-merge selama 2026" }, "microsoft-certifications": { en: "cloud and AI certifications", id: "sertifikasi cloud dan AI" } };
for (const s of c.stats) if (short[s.id]) s.short = short[s.id];
// Key order: short right after label.
c.stats = c.stats.map(({ id, value, label, short, source, confidence }) => ({ id, value, label, ...(short ? { short } : {}), source, confidence }));
c.profile.heroProof = ["enterprise-clients", "prs-merged-2026", "microsoft-certifications"];
fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
'
git --no-pager diff --stat content/site-content.json
```

Expected: one file changed. The diff touches only `stats` and the end of `profile`.

- [ ] **Step 5: Run the tests and the content validator**

Run: `bunx vitest run tests/content && bun run validate:content`
Expected: all pass. If an existing test pinned the old stat list (for example a stats snapshot), update it to the new ids. Do not change any 3D test.

- [ ] **Step 6: Run the Ask tests**

The stats feed the Ask pack. Run: `bunx vitest run tests/ask`
Expected: PASS. If a golden item expected "since 2019" from the stats chunk, re-point it at the timeline fact (the 2019 start remains in the career entries) and keep the item's intent.

- [ ] **Step 7: Commit**

```bash
rtk git add src/content/schema.ts content/site-content.json tests/content/recruiter-pass.test.ts
rtk git commit -m "feat(content): hero proof stats (12+ enterprise clients replaces building since 2019) with short labels"
```

---

### Task 2: Recruiter-first hero and landing order

**Files:**
- Create: `src/components/page/ProofStrip.tsx`
- Modify: `src/content/pageview.ts` (add `heroProofStats`)
- Modify: `src/components/page/Hero.tsx`
- Modify: `src/components/page/Featured.tsx:62-77`
- Modify: `src/app/[locale]/page.tsx`
- Modify: `messages/en.json`, `messages/id.json` (`home.proofLabel`)
- Test: `tests/unit/hero-proof.test.ts` (create), `e2e/pageview.spec.ts`, `e2e/office-classic.spec.ts:316-320`

**Interfaces:**
- Consumes: `Profile.heroProof` and `Stat.short` (Task 1).
- Produces:
  - `heroProofStats(stats: readonly Stat[], ids: readonly string[]): Stat[]`
  - `<ProofStrip stats locale label />`
  - `HomeHero({ locale, ticker, proof })`
  - test ids `hero-proof`, `cv-open-hero` (hero) and `cv-open-intro` (About section).

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/hero-proof.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { heroProofStats } from "@/content/pageview";
import { getProfile, getStats } from "@/content/load";

describe("heroProofStats", () => {
  it("returns the proof stats in heroProof order", () => {
    expect(heroProofStats(getStats(), getProfile().heroProof).map((s) => s.id)).toEqual(["enterprise-clients", "prs-merged-2026", "microsoft-certifications"]);
  });
  it("skips an id with no stat instead of throwing", () => {
    expect(heroProofStats(getStats(), ["enterprise-clients", "missing"]).map((s) => s.id)).toEqual(["enterprise-clients"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/hero-proof.test.ts`
Expected: FAIL. `heroProofStats` is not exported.

- [ ] **Step 3: Add `heroProofStats`**

Append to `src/content/pageview.ts` (add `Stat` to its type import from `./schema`):

```ts
/** The landing proof strip's stats, in `profile.heroProof` order (owner decision 2026-10-25); unknown ids are skipped. */
export function heroProofStats(stats: readonly Stat[], ids: readonly string[]): Stat[] {
  return ids.map((id) => stats.find((s) => s.id === id)).filter((s): s is Stat => s !== undefined);
}
```

Run: `bunx vitest run tests/unit/hero-proof.test.ts`
Expected: PASS.

- [ ] **Step 4: Create the proof strip**

Create `src/components/page/ProofStrip.tsx`:

```tsx
import type { Locale, Stat } from "@/content/schema";

/**
 * The landing hero's proof strip (owner decision 2026-10-25, style B): three verified stats in one quiet bordered row,
 * the value in the display face beside its short label; on phones three equal cells with the value above the label.
 * Server-rendered, no motion. The ticker below skips these ids so no number shows twice in the first screen.
 */
export function ProofStrip({ stats, locale, label }: { stats: readonly Stat[]; locale: Locale; label: string }) {
  return (
    <ul aria-label={label} data-testid="hero-proof" className="mt-7 grid grid-cols-3 divide-x divide-line rounded-xl border border-line-2 bg-surface sm:inline-grid">
      {stats.map((stat) => (
        <li key={stat.id} data-stat={stat.id} className="flex min-w-0 flex-col gap-1 px-3 py-3 sm:flex-row sm:items-baseline sm:gap-2.5 sm:px-5">
          <span className="pv-num text-[22px] leading-none sm:text-[28px]">{stat.value}</span>
          <span className="text-[12px] leading-4 text-ink-2 sm:text-[13px]">{stat.short?.[locale] ?? stat.label[locale]}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Hero: a proof slot, View CV primary, button order**

In `src/components/page/Hero.tsx`:
- import `CvButton` from `@/components/cv/CvButton`;
- add `proof: ReactNode` to the props;
- read the `common` namespace;
- replace the CTA block.

```tsx
export async function HomeHero({ locale, ticker, proof }: { locale: Locale; ticker: ReactNode; proof: ReactNode }) {
  const t = await getTranslations({ locale, namespace: "home" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const profile = getProfile();
```

```tsx
          <p className="pv-lead mt-7 max-w-none font-semibold">{profile.headline[locale]}</p>
          <p className="pv-lead mt-1 max-w-none text-ink-2">{profile.subheadline[locale]}</p>
          {proof}
          {/* Recruiter-first (owner decision 2026-10-25): View CV is the one primary action; full width on phones. */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <CvButton className="pv-btn pv-btn-primary w-full justify-center sm:w-auto" testId="cv-open-hero">
              {tc("viewCv")}
            </CvButton>
            <QuietLink href="/labs" className="pv-btn pv-btn-ghost">
              {t("seeWork")}
            </QuietLink>
            <EnterHqButton label={t("hero.enter3d")} hint={t("hero.enter3dHint")} />
          </div>
          <AskHeroBar />
```

Update the component's doc comment: "the proof strip and View CV first (owner decision 2026-10-25), then See the work and Enter the 3D HQ". If `EnterHqButton` renders with primary styling, pass or set it to the ghost style. Read `src/components/page/EnterHqButton.tsx` and change its class to `pv-btn pv-btn-ghost` if it uses `pv-btn-primary`.

- [ ] **Step 6: Landing page: proof, ticker and the new section order**

In `src/app/[locale]/page.tsx`:
- import `ProofStrip` and `heroProofStats`;
- pass `proof`;
- filter the ticker;
- rename the About button's test id;
- move sections into the order **work → intro → journey → certifications → skills → office → writing → contact**.

```tsx
  const proof = heroProofStats(getStats(), profile.heroProof);
  const tickerStats = getStats().filter((s) => !profile.heroProof.includes(s.id));
```

```tsx
      <HomeHero
        locale={locale}
        proof={<ProofStrip stats={proof} locale={locale} label={t("proofLabel")} />}
        ticker={
          <StatTicker
            stats={tickerStats}
```

The intro button becomes `<CvButton className="pv-btn pv-btn-ghost" testId="cv-open-intro">`. The JSX blocks themselves stay unchanged: cut `<OfficeSection locale={locale} />` and place it after the `#skills` section; place `#certifications` directly after `#journey`; keep `#writing` after the office.

- [ ] **Step 7: Featured cards lead with the result**

In `src/components/page/Featured.tsx`, move the result block from the bottom group to directly under the `<h3>`, and keep `PodLiveCta` at the bottom:

```tsx
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
      </div>
```

Update the component's doc comment to say "the headline result under the title (recruiters scan results first, 2026-10-25)".

- [ ] **Step 8: Add the message key**

In `messages/en.json` under `home`, add `"proofLabel": "Key numbers"`. In `messages/id.json` under `home`, add `"proofLabel": "Angka utama"`.

- [ ] **Step 9: Update the e2e expectations**

In `e2e/pageview.spec.ts`, inside the test "landing: three featured projects with their screenshots, the stats ticker, and no 3D offer on the static tier", replace the stats loop:

```ts
  const proofIds = data.profile.heroProof;
  const strip = page.getByTestId("hero-proof");
  await expect(strip.getByRole("listitem")).toHaveCount(3);
  for (const id of proofIds) {
    const stat = data.stats.find((s) => s.id === id)!;
    await expect(strip.locator(`[data-stat="${id}"]`)).toContainText(stat.value);
    await expect(ticker.getByRole("listitem").filter({ hasText: stat.label.en })).toHaveCount(0);
  }
  for (const stat of data.stats.filter((s) => !proofIds.includes(s.id))) await expect(ticker.getByRole("listitem").filter({ hasText: stat.label.en })).toHaveCount(1);
```

Add a test after it:

```ts
test("landing: View CV is the primary hero action and the sections follow the recruiter path", async ({ page }) => {
  await openPage(page, staticTier("/en"));
  const hero = page.locator("section[aria-labelledby='hero-title']");
  const cv = hero.getByTestId("cv-open-hero");
  await expect(cv).toHaveClass(/pv-btn-primary/);
  await expect(cv).toHaveText(en.common.viewCv);
  await expect(hero.locator(".pv-btn-primary")).toHaveCount(1);
  const order = await page.locator("main > section[id], #site-shell section[id]").evaluateAll((els) => els.map((el) => el.id));
  const expected = ["work", "intro", "journey", "certifications", "skills", "office", "writing", "contact"];
  expect(order.filter((id) => expected.includes(id))).toEqual(expected);
});
```

If `OfficeSection` renders its root without `id="office"` on a `section`, adapt the selector to the element that carries `#office`; the anchor test at line 105 confirms the id exists. In `e2e/office-classic.spec.ts` (about lines 316-320), the disabled-office clip now spans skills to writing:

```ts
      const skills = await pageBox("#skills");
      const writing = await pageBox("#writing");
      await clip(`disabled-${size.width}`, skills.bottom - 240, writing.top + 240);
```

Also update the comment above it: "the area between the skills and the writing".

- [ ] **Step 10: Run the unit tests, build and the affected e2e specs**

```bash
bunx vitest run tests/unit/hero-proof.test.ts tests/unit/messages* tests/content
bun run build >/dev/null && find out/_next -name "*.css" | xargs -I{} sh -c 'printf "%s %s\n" "$(gzip -9c {} | wc -c)" {}' | sort -n | tail -1
bunx playwright test e2e/pageview.spec.ts e2e/visits.spec.ts e2e/highlights.spec.ts --grep-invert @nightly
```

Expected:
- Unit tests pass.
- The largest CSS chunk stays at or under 19,731 B gzip, which is 250 B over the 19,481 B measured before this pass. If it grows more, replace new utility classes with ones already used elsewhere on the site.
- The e2e specs pass.

- [ ] **Step 11: Commit**

```bash
rtk git add src/components/page/ProofStrip.tsx src/content/pageview.ts src/components/page/Hero.tsx src/components/page/Featured.tsx "src/app/[locale]/page.tsx" messages/en.json messages/id.json tests/unit/hero-proof.test.ts e2e/pageview.spec.ts e2e/office-classic.spec.ts
rtk git commit -m "feat(page): recruiter-first landing: proof strip, View CV as the primary action, results first and a new section order"
```

---

### Task 3: Story data for the six featured case studies

**Files:**
- Modify: `src/content/schema.ts` (`PodStorySchema`, `PodSchema.story`, `STORY_SLUGS`, cross-check)
- Modify: `content/site-content.json` (six pods)
- Modify: `tests/content/recruiter-pass.test.ts`

**Interfaces:**
- Produces:
  - `PodStory = { situation: LocalizedText; decisions: { title: LocalizedText; why: LocalizedText }[]; lesson?: LocalizedText }`
  - `Pod.story?: PodStory`
  - `STORY_SLUGS: readonly string[]` (the six slugs).

- [ ] **Step 1: Write the failing test**

Append to `tests/content/recruiter-pass.test.ts` (add `STORY_SLUGS` to the schema import):

```ts
describe("case study stories (owner decision 2026-10-25)", () => {
  const pods = content.floors.labs.pods;
  it("the six featured slugs carry a story with 2 to 4 decisions", () => {
    expect([...STORY_SLUGS].sort()).toEqual(["ai-code-security-platform", "ai-solutions-assistant", "digital-banking-integrations", "fabric-forecasting-dashboard", "fraud-review-platform", "voice-ai-contact-center"]);
    for (const slug of STORY_SLUGS) {
      const story = pods.find((p) => p.slug === slug)?.story;
      expect(story, slug).toBeDefined();
      expect(story!.decisions.length, slug).toBeGreaterThanOrEqual(2);
      expect(story!.decisions.length, slug).toBeLessThanOrEqual(4);
    }
  });
  it("decision titles have no first person and stay one line", () => {
    for (const pod of pods) for (const d of pod.story?.decisions ?? []) for (const locale of ["en", "id"] as const) {
      expect(hasFirstPerson(d.title[locale], locale), `${pod.slug}: ${d.title[locale]}`).toBe(false);
      expect(d.title[locale].length, `${pod.slug}: ${d.title[locale]}`).toBeLessThanOrEqual(90);
    }
  });
  it("adds no new numbers: every number in a story already appears in the pod's own text", () => {
    const numbers = (s: string) => s.match(/\d[\d.,]*/g) ?? [];
    for (const pod of pods) {
      if (!pod.story) continue;
      for (const locale of ["en", "id"] as const) {
        const known = [pod.tagline[locale], pod.problem[locale], ...pod.approach.map((a) => a[locale]), ...pod.results.flatMap((r) => [r.value, r.label[locale], r.context?.[locale] ?? ""]), pod.role[locale]].join(" ");
        const story = [pod.story.situation[locale], ...pod.story.decisions.flatMap((d) => [d.title[locale], d.why[locale]])].join(" ");
        for (const n of numbers(story)) expect(known, `${pod.slug} ${locale}: "${n}"`).toContain(n);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/content/recruiter-pass.test.ts`
Expected: FAIL. `STORY_SLUGS` is not exported.

- [ ] **Step 3: Extend the schema**

In `src/content/schema.ts`, above `PodSchema`:

```ts
/**
 * A case study told as a story (owner decision 2026-10-25): the situation, the owner's key decisions with why, and an
 * optional lesson in the owner's own words (added only after the owner approves it). Body text, so the first person is
 * fine in `situation` and `why`; decision titles read as headings (no first person).
 */
export const PodStorySchema = z.strictObject({
  situation: LocalizedTextSchema,
  decisions: z.array(z.strictObject({ title: LocalizedTextSchema, why: LocalizedTextSchema })).min(2).max(4),
  lesson: LocalizedTextSchema.optional(),
});

/** The featured case studies that must read as stories (owner decision 2026-10-25). */
export const STORY_SLUGS = ["voice-ai-contact-center", "ai-code-security-platform", "ai-solutions-assistant", "fraud-review-platform", "digital-banking-integrations", "fabric-forecasting-dashboard"] as const;
```

In `PodSchema`'s object, after `publications`, add:

```ts
    /** Story chapters on the case study page (`STORY_SLUGS` must have one); `problem` and `approach` stay for 3D and Ask. */
    story: PodStorySchema.optional(),
```

In `SiteContentSchema`'s `superRefine`, add:

```ts
  for (const slug of STORY_SLUGS) {
    const i = content.floors.labs.pods.findIndex((p) => p.slug === slug);
    if (i === -1) ctx.addIssue({ code: "custom", path: ["floors", "labs", "pods"], message: `STORY_SLUGS names a missing pod "${slug}"` });
    else if (!content.floors.labs.pods[i].story) ctx.addIssue({ code: "custom", path: ["floors", "labs", "pods", i, "story"], message: `"${slug}" needs a story (situation and 2 to 4 decisions)` });
  }
```

Export the type next to the other `z.infer` exports: `export type PodStory = z.infer<typeof PodStorySchema>;`

- [ ] **Step 4: Write the six stories (no lessons yet)**

Write each story only from that pod's existing `problem`, `approach`, `results`, `role` and `tagline`, plus the read-only career-intelligence evidence (`~/Workspace/Career Development/career-intelligence`, where `_brief/corrections.md` is binding).

Rules:
- `situation`: 2 to 4 sentences: who had the problem, what was needed, the constraint. No numbers that are not in the pod's text.
- `decisions`: the 3 choices that mattered most, usually from `approach`. Each `title` is an imperative or past-tense phrase without "I" or "My" (at most 90 characters). Each `why` is one or two sentences of reasoning; the first person is allowed.
- Indonesian is natural and professional ("saya"), with technical terms in English.
- No client names: keep the pod's `client` sector label wording.
- No em dashes.

The first story, to copy into `voice-ai-contact-center`:

```json
"story": {
  "situation": {
    "en": "Callers were stuck in rigid phone menus. MII needed a voice agent that answers from the company knowledge base, lets callers interrupt while it speaks or searches, and hands over to a human and back within the same call, with a live console for supervisors.",
    "id": "Penelepon terjebak di menu telepon yang kaku. MII membutuhkan voice agent yang menjawab dari knowledge base perusahaan, bisa diinterupsi saat sedang berbicara atau mencari, dan bisa mengalihkan panggilan ke manusia lalu kembali dalam panggilan yang sama, dengan konsol live untuk supervisor."
  },
  "decisions": [
    {
      "title": { "en": "Moved knowledge lookups out of the realtime loop", "id": "Memindahkan akses knowledge base keluar dari realtime loop" },
      "why": { "en": "A caller interrupting mid-search had to be heard at once, so lookups became cancellable tasks sharing one time budget, and barge-in accounts for audio still playing.", "id": "Penelepon yang menyela saat pencarian berlangsung harus langsung didengar, jadi akses knowledge base saya jadikan task yang bisa dibatalkan dengan satu anggaran waktu bersama, dan barge-in memperhitungkan audio yang masih diputar." }
    },
    {
      "title": { "en": "Replaced a retiring voice service with self-hosted WebRTC on zonal VMs", "id": "Mengganti layanan suara yang akan dihentikan dengan WebRTC self-hosted di VM zonal" },
      "why": { "en": "The managed service was being retired; I documented the decision, then proved the new path with hard VM-stop failover drills.", "id": "Layanan managed tersebut akan dihentikan; saya mendokumentasikan keputusannya, lalu membuktikan jalur baru dengan drill failover yang mematikan VM secara paksa." }
    },
    {
      "title": { "en": "Built an evaluation harness before shipping changes", "id": "Membangun evaluation harness sebelum merilis perubahan" },
      "why": { "en": "A media emulator, golden questions and a calibrated LLM judge meant any change without supporting evidence stayed disabled.", "id": "Media emulator, golden question, dan LLM judge yang terkalibrasi membuat setiap perubahan tanpa bukti pendukung tetap dinonaktifkan." }
    }
  ]
}
```

Write the other five the same way, in this order: `ai-code-security-platform`, `ai-solutions-assistant`, `fraud-review-platform`, `digital-banking-integrations`, `fabric-forecasting-dashboard`. Insert each `story` key right after the pod's `results`, with the same `bun -e` read, modify and write pattern as Task 1 Step 4.

- [ ] **Step 5: Run the content tests and the validator**

Run: `bunx vitest run tests/content && bun run validate:content`
Expected: PASS, including the "no new numbers" check, first person, Title Case and em-dash scans.

- [ ] **Step 6: Commit**

```bash
rtk git add src/content/schema.ts content/site-content.json tests/content/recruiter-pass.test.ts
rtk git commit -m "feat(content): story data (situation and key decisions) for the six featured case studies"
```

---

### Task 4: Story chapters on the case study page

**Files:**
- Create: `src/components/page/Story.tsx`
- Modify: `src/app/[locale]/labs/[slug]/page.tsx`
- Modify: `messages/en.json`, `messages/id.json` (`labs.situation`, `labs.decisions`, `labs.why`, `labs.lesson`)
- Test: `e2e/pageview.spec.ts` (update "case study keeps its anchors" and add a story test)

**Interfaces:**
- Consumes: `Pod.story` (Task 3).
- Produces:
  - `<DecisionList decisions locale whyLabel />`
  - `<Lesson text />`
  - Chapter ids: `problem` (Situation), `approach` (Role and key decisions), `results`, `lesson`. The old ids are kept so existing deep links and 3D drawer anchors still work.

- [ ] **Step 1: Write the failing e2e test**

In `e2e/pageview.spec.ts`, change the test "case study keeps its anchors and table of contents" to a pod without a story, and add a story test after it:

```ts
const storyPod = content.floors.labs.pods.find((p) => p.slug === "voice-ai-contact-center")!;
const plainPod = content.floors.labs.pods.find((p) => p.tier === "hero" && !STORY_SLUGS.includes(p.slug as (typeof STORY_SLUGS)[number]))!;

test("case study keeps its anchors and table of contents", async ({ page }) => {
  await openPage(page, staticTier(`/en/labs/${plainPod.slug}`));
  for (const id of ["results", "problem", "approach", "stack"]) await expect(page.locator(`#${id}`)).toBeAttached();
  await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Problem" })).toHaveAttribute("href", "#problem");
});

test("a featured case study reads as a story: situation, key decisions, results, then lesson, with the old anchors kept", async ({ page }) => {
  await openPage(page, staticTier(`/en/labs/${storyPod.slug}`));
  const chapters = await page.locator("article section[id] > h2").evaluateAll((els) => els.map((h) => h.parentElement!.id));
  const story = ["problem", "approach", "results"];
  expect(chapters.filter((id) => story.includes(id))).toEqual(story);
  await expect(page.locator("#problem h2")).toHaveText(en.labs.situation);
  await expect(page.locator("#approach h2")).toHaveText(en.labs.decisions);
  await expect(page.locator("#approach li")).toHaveCount(data.floors.labs.pods.find((p) => p.slug === storyPod.slug)!.story!.decisions.length);
  await expect(page.locator("#approach li").first()).toContainText(en.labs.why);
  const toc = page.getByRole("navigation", { name: "On this page" });
  await expect(toc.getByRole("link", { name: en.labs.situation })).toHaveAttribute("href", "#problem");
  await expectNoSeriousViolations(page);
});
```

Add `STORY_SLUGS` to the imports from `../src/content/schema`. In `e2e/routes.ts`, add `story?: unknown` to the pod type if TypeScript needs it.

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run build >/dev/null && bunx playwright test e2e/pageview.spec.ts -g "reads as a story"`
Expected: FAIL. `#problem h2` still reads "Problem".

- [ ] **Step 3: Add the messages**

Under `labs` in `messages/en.json`: `"situation": "Situation"`, `"decisions": "Role and key decisions"`, `"why": "Why"`, `"lesson": "Lesson"`.

Under `labs` in `messages/id.json`: `"situation": "Situasi"`, `"decisions": "Peran dan keputusan utama"`, `"why": "Alasan"`, `"lesson": "Pelajaran"`.

- [ ] **Step 4: Create the story components**

Create `src/components/page/Story.tsx`:

```tsx
import type { Locale, PodStory } from "@/content/schema";

/** Key decisions of a story case study: numbered like `StepList`, each a title and its reason (owner decision 2026-10-25). */
export function DecisionList({ decisions, locale, whyLabel }: { decisions: PodStory["decisions"]; locale: Locale; whyLabel: string }) {
  return (
    <ol className="pv-rows pv-rows-closed">
      {decisions.map((d, i) => (
        <li key={i} className="grid grid-cols-[40px_1fr] gap-3 py-5">
          <span aria-hidden="true" className="pt-1 font-mono text-xs text-violet">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{d.title[locale]}</p>
            <p className="mt-1.5 text-ink-2">
              <span className="pv-data mr-2">{whyLabel}</span>
              {d.why[locale]}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The owner's lesson: a quote with a neutral hairline rule (never a colored stripe). */
export function Lesson({ text }: { text: string }) {
  return <blockquote className="pv-lead border-l border-line-2 pl-5 text-ink">{text}</blockquote>;
}
```

- [ ] **Step 5: Render the story on the case page**

In `src/app/[locale]/labs/[slug]/page.tsx`:
- import `DecisionList` and `Lesson`;
- compute `const story = pod.story;`
- replace the `toc` constant:

```tsx
  const toc = story
    ? [
        { id: "problem", label: t("situation") },
        { id: "approach", label: t("decisions") },
        { id: "results", label: t("results") },
        ...(story.lesson ? [{ id: "lesson", label: t("lesson") }] : []),
        ...(pod.architecture ? [{ id: "architecture", label: t("architecture") }] : []),
        ...(images.length > 0 ? [{ id: "gallery", label: tg("title") }] : []),
        ...(codeResearch ? [{ id: "code", label: t("codeResearch") }] : []),
        { id: "stack", label: tc("stack") },
      ]
    : [
        ...(detail ? [{ id: "results", label: t("results") }] : []),
        { id: "problem", label: t("problem") },
        { id: "approach", label: t("approach") },
        ...(pod.architecture ? [{ id: "architecture", label: t("architecture") }] : []),
        ...(images.length > 0 ? [{ id: "gallery", label: tg("title") }] : []),
        ...(codeResearch ? [{ id: "code", label: t("codeResearch") }] : []),
        { id: "stack", label: tc("stack") },
      ];
```

In a story, the Results chapter always renders, because it sits after the decisions. Change the metric-strip section's id condition to `id={detail || story ? undefined : "results"}`. Then replace the body's first three chapters (the Results, Problem and Approach `Chapter` elements) with:

```tsx
            {story ? (
              <>
                <Chapter id="problem" title={t("situation")}>
                  <p className="pv-lead text-ink-2">{story.situation[locale]}</p>
                </Chapter>
                <Chapter id="approach" title={t("decisions")}>
                  <DecisionList decisions={story.decisions} locale={locale} whyLabel={t("why")} />
                </Chapter>
                <Chapter id="results" title={t("results")}>
                  <MetricLedger results={pod.results} locale={locale} />
                </Chapter>
                {story.lesson && (
                  <Chapter id="lesson" title={t("lesson")}>
                    <Lesson text={story.lesson[locale]} />
                  </Chapter>
                )}
              </>
            ) : (
              <>
                {detail && (
                  <Chapter id="results" title={t("results")}>
                    <MetricLedger results={pod.results} locale={locale} />
                  </Chapter>
                )}
                <Chapter id="problem" title={t("problem")}>
                  <p className="pv-lead text-ink-2">{pod.problem[locale]}</p>
                </Chapter>
                <Chapter id="approach" title={t("approach")}>
                  <StepList steps={pod.approach} locale={locale} />
                </Chapter>
              </>
            )}
```

- [ ] **Step 6: Run the tests**

```bash
bunx vitest run tests/unit/messages* tests/content
bun run build >/dev/null && bunx playwright test e2e/pageview.spec.ts -g "case study"
```

Expected: PASS for "keeps its anchors", "reads as a story" and the existing "case study opens with the metric strip" tests.

- [ ] **Step 7: Commit**

```bash
rtk git add src/components/page/Story.tsx "src/app/[locale]/labs/[slug]/page.tsx" messages/en.json messages/id.json e2e/pageview.spec.ts e2e/routes.ts
rtk git commit -m "feat(page): featured case studies read as a story: situation, key decisions with why, results, lesson"
```

---

### Task 5: The six lessons (owner approval gate)

**Files:**
- Create (outside the repo): `~/.copilot/session-state/b819ac3a-f7ac-417b-a233-965c0fd98e54/files/lessons-draft.md`
- Modify: `content/site-content.json` (only the lessons the owner approves)

- [ ] **Step 1: Collect the owner's own words for each pod**

For each of the six pods, search the owner's writing for a stated lesson or principle on the same topic. Sources:
- `content/blog/*.en.mdx` and `*.id.mdx`
- `content/perspectives.json`
- `profile.principles` and `profile.howIWork` in `content/site-content.json`
- `~/Workspace/Career Development/career-intelligence` (read-only; notes on each project)

Run: `grep -ril "<topic word>" content/blog content/perspectives.json "$HOME/Workspace/Career Development/career-intelligence" | head`

- [ ] **Step 2: Write the draft file**

For each pod, write one entry to `lessons-draft.md`:
- the proposed EN and ID lesson, one or two sentences, close to the source wording;
- the exact source path and the quoted passage it comes from.

If no source exists, write "No source: owner to write". Never invent a lesson.

- [ ] **Step 3: Ask the owner**

Use `ask_user` once per lesson. Choices: "Approve as written", "Edit (I will type it)", "Skip this one". Record each answer in the draft file.

- [ ] **Step 4: Add the approved lessons**

Set `story.lesson` (`{ en, id }`) on each approved pod with the `bun -e` read, modify and write pattern. Skipped pods keep no `lesson`; the chapter stays hidden.

Run: `bunx vitest run tests/content && bun run validate:content`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add content/site-content.json
rtk git commit -m "feat(content): owner-approved lessons for the story case studies"
```

---

### Task 6: Route index and the did-you-mean matcher

**Files:**
- Create: `src/lib/did-you-mean.ts`, `src/lib/route-index.ts`
- Modify: `src/app/data/[...path]/route.ts`
- Test: `tests/unit/did-you-mean.test.ts`, `tests/unit/route-index.test.ts`

**Interfaces:**
- Produces:
  - `type RouteEntry = { p: string; t: string }`: a locale-prefixed path and its title in that locale.
  - `ROUTES_INDEX_FILE = "index.json"`, served at `/data/routes/index.json`.
  - `buildRouteIndex(): RouteEntry[]`
  - `suggestRoute(requested: string, routes: readonly RouteEntry[]): RouteEntry | null`
  - `editDistance(a: string, b: string): number`

- [ ] **Step 1: Write the failing matcher test**

Create `tests/unit/did-you-mean.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { editDistance, suggestRoute, type RouteEntry } from "@/lib/did-you-mean";

const routes: RouteEntry[] = [
  { p: "/en", t: "Kurniadi Ahmad Wijaya" },
  { p: "/id", t: "Kurniadi Ahmad Wijaya" },
  { p: "/en/labs", t: "Work" },
  { p: "/en/labs/voice-ai-contact-center", t: "Realtime Voice AI Contact Center" },
  { p: "/id/labs/voice-ai-contact-center", t: "Contact Center Voice AI Realtime" },
  { p: "/en/cv", t: "CV" },
];

describe("suggestRoute", () => {
  it("fixes a slug typo", () => expect(suggestRoute("/en/labs/voice-ai-contact-centre", routes)?.p).toBe("/en/labs/voice-ai-contact-center"));
  it("adds a missing locale (English by default)", () => expect(suggestRoute("/labs/voice-ai-contact-center", routes)?.p).toBe("/en/labs/voice-ai-contact-center"));
  it("keeps the requested locale", () => expect(suggestRoute("/id/labs/voice-ai-contact-centre", routes)?.p).toBe("/id/labs/voice-ai-contact-center"));
  it("ignores a trailing slash, a query and case", () => expect(suggestRoute("/EN/CV/?x=1", routes)?.p).toBe("/en/cv"));
  it("suggests nothing for a far-off path", () => expect(suggestRoute("/en/totally-unrelated-thing", routes)).toBeNull());
  it("suggests nothing for an existing page", () => expect(suggestRoute("/en/labs", routes)).toBeNull());
});

describe("editDistance", () => {
  it("counts single edits", () => {
    expect(editDistance("centre", "center")).toBe(2);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/did-you-mean.test.ts`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement the matcher**

Create `src/lib/did-you-mean.ts`:

```ts
/** One page of the static export for the 404 suggestion: locale-prefixed path and its title in that locale. */
export interface RouteEntry {
  p: string;
  t: string;
}

const LOCALE = /^\/(en|id)(?=\/|$)/;

/** Levenshtein distance (two rows). */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Lowercase path without query, hash or trailing slash. */
function clean(path: string): string {
  const bare = path.split(/[?#]/)[0].toLowerCase().replace(/\/+$/, "");
  return bare === "" ? "/" : bare;
}

/**
 * The page a mistyped URL most likely meant (404 "Did you mean", owner decision 2026-10-25): the requested locale (English
 * when missing), the same section, and the closest last segment within a third of its length. Null for an existing page
 * or when nothing is close.
 */
export function suggestRoute(requested: string, routes: readonly RouteEntry[]): RouteEntry | null {
  const path = clean(requested);
  if (routes.some((r) => r.p === path)) return null;
  const locale = LOCALE.exec(path)?.[1] ?? "en";
  const rest = path.replace(LOCALE, "") || "/";
  const target = `/${locale}${rest === "/" ? "" : rest}`;
  const exact = routes.find((r) => r.p === target);
  if (exact) return exact;
  const parts = rest.split("/").filter(Boolean);
  const section = parts.length > 1 ? `/${locale}/${parts.slice(0, -1).join("/")}/` : `/${locale}/`;
  const last = parts.at(-1) ?? "";
  let best: RouteEntry | null = null;
  let bestScore = Infinity;
  for (const route of routes) {
    if (!route.p.startsWith(section) || route.p.slice(section.length).includes("/")) continue;
    const score = editDistance(last, route.p.slice(section.length));
    if (score < bestScore) {
      best = route;
      bestScore = score;
    }
  }
  return best && bestScore <= Math.max(2, Math.floor(last.length / 3)) ? best : null;
}
```

Run: `bunx vitest run tests/unit/did-you-mean.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing route-index test**

Create `tests/unit/route-index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRouteIndex } from "@/lib/route-index";
import { allPagePaths } from "@/lib/routes";

describe("buildRouteIndex", () => {
  const index = buildRouteIndex();
  it("lists every page path in both locales with a title", () => {
    expect(index).toHaveLength(allPagePaths().length * 2);
    for (const entry of index) {
      expect(entry.p).toMatch(/^\/(en|id)(\/|$)/);
      expect(entry.t.length).toBeGreaterThan(0);
    }
    expect(index.find((e) => e.p === "/en/labs/voice-ai-contact-center")?.t).toBe("Realtime Voice AI Contact Center");
  });
  it("stays small", () => expect(JSON.stringify(index).length).toBeLessThan(24_000));
});
```

- [ ] **Step 5: Implement the route index**

Create `src/lib/route-index.ts`:

```ts
import { getContent, getPod, getPost, getTimelineEntry } from "@/content/load";
import { LOCALES, type Locale } from "@/content/schema";
import { allPagePaths } from "@/lib/routes";
import type { RouteEntry } from "@/lib/did-you-mean";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

export const ROUTES_INDEX_FILE = "index.json";

const NAV = { en: en.nav, id: id.nav } as const;
const STATIC_TITLE: Record<string, (locale: Locale) => string> = {
  "/": () => getContent().profile.name,
  "/quick": (l) => NAV[l].quick,
  "/journey": (l) => NAV[l].journey,
  "/labs": (l) => NAV[l].work,
  "/library": (l) => NAV[l].writing,
  "/contact": (l) => NAV[l].contact,
  "/cv": (l) => NAV[l].cv,
  "/build": (l) => NAV[l].build,
};

function titleOf(path: string, locale: Locale): string {
  const fixed = STATIC_TITLE[path];
  if (fixed) return fixed(locale);
  const [, section, slug] = path.split("/");
  if (section === "labs") return getPod(slug)?.title[locale] ?? path;
  if (section === "blog") return getPost(slug)?.title[locale] ?? path;
  if (section === "journey") {
    const entry = getTimelineEntry(slug);
    return entry ? `${entry.role[locale]} · ${entry.org}` : path;
  }
  return path;
}

/** Every page of the export in both locales with its title: the 404's "Did you mean" data (`/data/routes/index.json`). */
export function buildRouteIndex(): RouteEntry[] {
  return LOCALES.flatMap((locale) => allPagePaths().map((path) => ({ p: `/${locale}${path === "/" ? "" : path}`, t: titleOf(path, locale) })));
}
```

In `src/app/data/[...path]/route.ts`:
- import `buildRouteIndex` and `ROUTES_INDEX_FILE` from `@/lib/route-index`;
- add `{ path: ["routes", ROUTES_INDEX_FILE] }` to `generateStaticParams`;
- add this line before the `kind === "guides"` branch: `if (kind === "routes" && file === ROUTES_INDEX_FILE) return Response.json(buildRouteIndex());`
- mention `out/data/routes/index.json` in the doc comment.

- [ ] **Step 6: Run the tests and build**

Run: `bunx vitest run tests/unit/did-you-mean.test.ts tests/unit/route-index.test.ts && bun run build >/dev/null && ls -la out/data/routes/index.json`
Expected: PASS, and the file exists (well under 24 KB).

- [ ] **Step 7: Commit**

```bash
rtk git add src/lib/did-you-mean.ts src/lib/route-index.ts "src/app/data/[...path]/route.ts" tests/unit/did-you-mean.test.ts tests/unit/route-index.test.ts
rtk git commit -m "feat(404): a static route index and a did-you-mean matcher for mistyped URLs"
```

---

### Task 7: The 404 page

**Files:**
- Create: `src/components/DidYouMean.tsx`, `src/app/not-found.module.css`, `e2e/not-found.spec.ts`
- Modify: `src/app/global-not-found.tsx`, `messages/en.json`, `messages/id.json` (`notFound`)

**Interfaces:**
- Consumes:
  - `suggestRoute` and `RouteEntry` from `src/lib/did-you-mean.ts`;
  - `/data/routes/index.json` (Task 6).
- Produces: test ids `not-found-cv`, `not-found-work`, `did-you-mean`.

- [ ] **Step 1: Write the failing e2e test**

Create `e2e/not-found.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import en from "../messages/en.json";

test("404: Rover took a wrong turn, three ways out, CV first", async ({ page }) => {
  const response = await page.goto("/en/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.notFound.title);
  await expect(page.getByTestId("not-found-cv")).toHaveAttribute("href", "/en/cv");
  await expect(page.getByTestId("not-found-work")).toHaveAttribute("href", "/en/labs");
  await expect(page.getByRole("link", { name: /English/ })).toHaveAttribute("href", "/en");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});

test("404: suggests the closest page for a mistyped project URL", async ({ page }) => {
  await page.goto("/en/labs/voice-ai-contact-centre");
  const suggestion = page.getByTestId("did-you-mean");
  await expect(suggestion).toBeVisible();
  await expect(suggestion.getByRole("link")).toHaveAttribute("href", "/en/labs/voice-ai-contact-center");
});

test("404: no suggestion for a far-off path, and the page works without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/en/totally-unrelated-thing");
  await expect(page.getByTestId("not-found-cv")).toBeVisible();
  await expect(page.getByTestId("did-you-mean")).toHaveCount(0);
  await context.close();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run build >/dev/null && bunx playwright test e2e/not-found.spec.ts`
Expected: FAIL. `not-found-cv` is not found, and the title text differs.

- [ ] **Step 3: Update the messages**

Replace `notFound` in `messages/en.json`:

```json
  "notFound": {
    "kicker": "404 · Off the map",
    "title": "Rover took a wrong turn",
    "body": "This floor isn't on the map. Here are three good ways back.",
    "cv": "View the CV",
    "cvHint": "One page, 30 seconds",
    "work": "See the work",
    "workHint": "Selected projects",
    "home": "Home",
    "homeHint": "English · Bahasa Indonesia",
    "didYouMean": "Did you mean"
  },
```

And in `messages/id.json`:

```json
  "notFound": {
    "kicker": "404 · Di luar peta",
    "title": "Rover salah belok",
    "body": "Lantai ini tidak ada di peta. Ini tiga jalan kembali.",
    "cv": "Lihat CV",
    "cvHint": "Satu halaman, 30 detik",
    "work": "Lihat karya",
    "workHint": "Proyek pilihan",
    "home": "Beranda",
    "homeHint": "English · Bahasa Indonesia",
    "didYouMean": "Mungkin maksudnya"
  },
```

Check that nothing else reads `notFound.body` as an SEO description longer than allowed: `metadata.description` uses it, and it stays a short sentence.

- [ ] **Step 4: Create the client island**

Create `src/components/DidYouMean.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { suggestRoute, type RouteEntry } from "@/lib/did-you-mean";

/** The 404's "Did you mean" line: fetches the static route index after paint and shows the closest page, or nothing. */
export function DidYouMean({ label, className }: { label: string; className?: string }) {
  const [match, setMatch] = useState<RouteEntry | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/data/routes/index.json")
      .then((r) => (r.ok ? (r.json() as Promise<RouteEntry[]>) : []))
      .then((routes) => live && setMatch(suggestRoute(location.pathname, routes)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!match) return null;
  return (
    <p className={className} data-testid="did-you-mean">
      <span className="pv-data">{label}</span>{" "}
      <a href={match.p} className="font-semibold text-cyan">
        {match.t} →
      </a>
    </p>
  );
}
```

- [ ] **Step 5: Create the 404 styles (loaded only on this page)**

Create `src/app/not-found.module.css`:

```css
@reference "./globals.css";

.rover {
  width: 88px;
  height: 88px;
  margin-inline: auto;
  filter: drop-shadow(0 0 22px rgb(34 211 238 / 0.45));
  animation: wobble 3s ease-in-out infinite;
  @variant motion-reduce {
    animation: none;
  }
}

@keyframes wobble {
  0%,
  100% {
    transform: rotate(-6deg) translateY(0);
  }
  50% {
    transform: rotate(6deg) translateY(-6px);
  }
}

.paths {
  display: grid;
  gap: 12px;
  margin-top: 28px;
}

@media (min-width: 640px) {
  .paths {
    grid-template-columns: repeat(3, minmax(0, 200px));
    justify-content: center;
  }
}

.path {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}
```

- `@reference` imports the theme and the `motion-reduce` custom variant without emitting any of `globals.css`, so the repo rule ("write reduce rules as `@variant motion-reduce`") holds and the global stylesheet does not grow.
- After `bun run build`, confirm that the 404's CSS chunk contains `data-motion="reduced"`: `grep -l 'data-motion' out/_next/static/chunks/*.css`.
- If `@reference` does not resolve in a CSS module, fall back to the variant's selectors, copied exactly from `src/app/globals.css` (`:root[data-motion="reduced"] .rover` plus `@media (prefers-reduced-motion: reduce) { :root:not([data-motion="full"]) .rover }`), and say so in the PR.

- [ ] **Step 6: Rewrite the 404 page**

Replace `src/app/global-not-found.tsx`:

```tsx
import Link from "next/link";
import type { Metadata } from "next";
import { DidYouMean } from "@/components/DidYouMean";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { fontClassName } from "./fonts";
import "./globals.css";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: `404 · ${en.meta.siteName}`,
  description: en.notFound.body,
  robots: { index: false, follow: true },
};

/**
 * The 404 (owner decision 2026-10-25, option B): Rover took a wrong turn, in English with one Indonesian line (the URL may
 * carry no locale), three ways out with the CV first for recruiters, and a "Did you mean" suggestion from the static route
 * index. Works without JavaScript; only the suggestion needs it.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${fontClassName} antialiased`}>
      <body className="flex min-h-screen items-center">
        <main className="pv-wrap py-16 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.rover} src="/brand/rover-mark.svg" alt="" width={88} height={88} />
          <p className="pv-data mt-5 text-cyan">{en.notFound.kicker}</p>
          <h1 className="pv-d-l mt-3">{en.notFound.title}</h1>
          <p className="pv-lead mx-auto mt-4 text-ink-2">{en.notFound.body}</p>
          <p lang="id" className="mt-2 text-sm text-ink-3">
            {id.notFound.title}. {id.notFound.body}
          </p>
          <DidYouMean label={en.notFound.didYouMean} className="mt-6" />
          <nav aria-label="404" className={styles.paths}>
            <Link className={`pv-btn pv-btn-primary ${styles.path}`} href="/en/cv" data-testid="not-found-cv">
              <b className="block">{en.notFound.cv}</b>
              <span className="text-xs font-normal">{en.notFound.cvHint}</span>
            </Link>
            <Link className={`pv-btn pv-btn-ghost ${styles.path}`} href="/en/labs" data-testid="not-found-work">
              <b className="block">{en.notFound.work}</b>
              <span className="text-xs font-normal text-ink-3">{en.notFound.workHint}</span>
            </Link>
            <span className={`pv-btn pv-btn-ghost ${styles.path}`}>
              <b className="block">{en.notFound.home}</b>
              <span className="text-xs font-normal">
                <Link href="/en">English</Link> ·{" "}
                <Link href="/id" lang="id">
                  Bahasa Indonesia
                </Link>
              </span>
            </span>
          </nav>
        </main>
      </body>
    </html>
  );
}
```

The `pv-btn` rules may be inline-flex with centered text. If the hint line does not wrap under the title, add `flex-direction: column; align-items: flex-start;` to `.path`.

- [ ] **Step 7: Run the tests**

Run: `bunx vitest run tests/unit/messages* && bun run build >/dev/null && bunx playwright test e2e/not-found.spec.ts`
Expected: PASS. The CSP check in the build (`csp-hashes`) also passes for `out/404.html`.

- [ ] **Step 8: Commit**

```bash
rtk git add src/components/DidYouMean.tsx src/app/not-found.module.css src/app/global-not-found.tsx messages/en.json messages/id.json e2e/not-found.spec.ts
rtk git commit -m "feat(404): Rover took a wrong turn: three ways out with the CV first, and a did-you-mean suggestion"
```

---

### Task 8: Empty and offline states with a next step

**Files:**
- Modify: `messages/en.json`, `messages/id.json` (copy only)

`ask` is a layout namespace (inlined into every page's HTML, and `/en/quick` is near its HTML budget). So `ask.error.offline` must not get longer than today: 69 characters in EN, 72 in ID.

- [ ] **Step 1: Record the current lengths**

Run:

```bash
bun -e 'for (const l of ["en","id"]) { const m = require(`./messages/${l}.json`); console.log(l, m.ask.error.offline.length, m.stats.offline, "|", m.office.classic.offlineEmpty, "|", m.office.classic.noGithub, "|", m.work.empty, "|", m.drawer.unavailable); }'
```

- [ ] **Step 2: Replace the copy**

| Key | EN | ID |
|---|---|---|
| `ask.error.offline` | `Rover is resting. The CV and the work pages answer most questions.` | `Rover sedang istirahat. CV dan halaman karya menjawab banyak hal.` |
| `stats.offline` | `Visitor numbers are refreshing. Check back in a minute.` | `Angka pengunjung sedang diperbarui. Coba lagi sebentar lagi.` |
| `office.classic.offlineEmpty` | `The live office is quiet right now. See recent work in Writing and Work.` | `Kantor live sedang sepi. Lihat karya terbaru di Tulisan dan Karya.` |
| `office.classic.noGithub` | `Nothing public yet today.` | `Belum ada aktivitas publik hari ini.` |
| `work.empty` | `No projects match these filters. Clear a filter or ask Rover.` | `Tidak ada proyek yang cocok. Hapus filter atau tanya Rover.` |
| `drawer.unavailable` | `This room didn't load. Open the full page instead.` | `Ruang ini belum termuat. Buka halaman lengkapnya saja.` |

Leave `office.3d.wall.empty` unchanged: it is a 3D string, and the 3D session budget has no room.

- [ ] **Step 3: Run the checks**

```bash
bun -e 'for (const l of ["en","id"]) { const m = require(`./messages/${l}.json`); const n = m.ask.error.offline.length; if (n > (l === "en" ? 69 : 72)) throw new Error(`${l} ask.error.offline grew to ${n}`); }'
bunx vitest run tests/unit tests/hud
bun run build >/dev/null && gzip -9c out/en/quick.html | wc -c
```

Expected: no error and the tests pass. Fix any test that pinned the old copy: assert the new key value, not the literal. `out/en/quick.html` gzip size is at or below 77,230 B, its value before this pass.

- [ ] **Step 4: Commit**

```bash
rtk git add messages/en.json messages/id.json tests
rtk git commit -m "feat(copy): empty and offline states always name a next step"
```

---

### Task 9: Docs, decision, verification and PR

**Files:**
- Modify: `docs/agents/page-view.md`, `docs/agents/content.md`, `docs/content.md`, `docs/features.md`
- Create: `docs/decisions/2026-10-25-classic-recruiter-pass.md`
- Modify: the `Status:` line of `docs/superpowers/specs/2026-10-25-classic-recruiter-pass-design.md` and of this plan

- [ ] **Step 1: Update the agent docs (current state only)**

- `docs/agents/page-view.md`:
  - landing hero order: proof strip (`profile.heroProof`, style B), View CV primary (`cv-open-hero`), See the work, Enter the 3D HQ, Ask bar;
  - the ticker skips the proof ids;
  - section order;
  - featured cards show the result under the title;
  - case study story mode (ids `problem` and `approach` kept);
  - the 404 (three paths, `DidYouMean`, `/data/routes/index.json`, CSS module).
- `docs/agents/content.md`: `stat.short` (at most 28 characters), `profile.heroProof` (exactly 3), `pod.story` and `STORY_SLUGS`, and lessons as owner words only.
- `docs/content.md`: "Writing a story case study": situation, 2 to 4 decisions with why, no new numbers, and lessons approved by the owner.
- `docs/features.md`: one bullet each under the Classic site: recruiter landing, story case studies, 404.

- [ ] **Step 2: Write the decision file**

Create `docs/decisions/2026-10-25-classic-recruiter-pass.md`:

```markdown
# Classic site

- Date: 2026-10-25
- PR: [#N](https://github.com/ShinyQ/ShinyQ-HQ/pull/N)

The Classic site is built to win a recruiter in 10 seconds:
- **Proof:** the landing hero shows three impact numbers in one quiet strip (12+ enterprise clients, PRs merged in 2026, 5 certifications; `profile.heroProof`). "12+ enterprise clients" replaces "Building software since 2019" so `stats` stays at six for the 3D stats ring.
- **CTA:** View CV is the one primary action, then See the work and Enter the 3D HQ.
- **Order:** sections follow the recruiter path (work, about, journey, certifications, skills, live office, writing, contact).
- **Case studies:** six featured case studies read as a story (situation, role and key decisions with why, results, lesson). Lessons are the owner's own words, approved one by one.
- **404:** "Rover took a wrong turn" with the CV first and a did-you-mean suggestion.
- **Empty states:** they always name a next step.

The look (Neon Grid, tokens, fonts) is unchanged.
```

Set the PR number after Step 5.

- [ ] **Step 3: Verify everything locally**

```bash
bun run verify:quick
bun run e2e:changed
```

Expected: both green. If an unrelated, known-flaky test fails once (for example the DrawerHost B1 timeout), re-run that file alone and note it in the PR.

- [ ] **Step 4: Commit the docs**

```bash
rtk git add docs
rtk git commit -m "docs: Classic recruiter pass (landing, story case studies, 404, empty states)"
```

- [ ] **Step 5: Push and open the PR**

```bash
gh run list -R ShinyQ/ShinyQ-HQ -s in_progress; gh run list -R ShinyQ/ShinyQ-HQ -s queued
rtk git push -u origin feat/classic-recruiter-pass
```

Open the PR with `create_pull_request`. Title: "feat(page): Classic recruiter pass: proof strip and View CV, story case studies, 404 and empty states". The body summarizes the three parts, the budgets checked (global CSS growth, `/en/quick` HTML), the tests added, and the lessons approved.

Then:
- set the decision file's PR number;
- set both `Status:` lines to `in review` with the PR link;
- commit and push.

After merge, set both to `shipped in #N (sha), date`.
