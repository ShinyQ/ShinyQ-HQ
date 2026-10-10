# Page View revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the HTML Page View (`src/app/[locale]/**`, `src/components/**`) to the editorial Neon Grid design in `docs/superpowers/specs/2026-10-10-pageview-revamp-design.md`, keeping URLs, anchors, the 3D gate and Back to 3D working.

**Architecture:** A page-level CSS layer in `globals.css` (tokens shared with the HUD plus page type and layout classes) and a set of small server components in `src/components/page/`. Filters are client islands over server-rendered lists (all rows ship in the HTML; JS only hides). Pure filter and selection logic lives in `src/content/pageview.ts` so Vitest covers it in node.

**Tech Stack:** Next.js 16 static export, React 19, Tailwind 4, next-intl, Vitest + Testing Library, Playwright + axe.

## Global Constraints

- No em dashes anywhere (unit test scans the repo).
- Content is data: no career facts in components; copy in `site-content.json` and `messages/*.json` is final. New UI strings go into both `messages/en.json` and `messages/id.json` with identical keys and placeholders.
- Static export: no server runtime; client islands only where interaction needs it.
- URLs unchanged: `/{locale}`, `/journey[/slug]`, `/labs[/slug]`, `/library`, `/blog/[slug]`, `/contact`, `/quick`, `/cv`. Anchors unchanged: `#stats #skills #certifications` (Home), `#y{year} #workshop` (Journey), `#posts #research #publications #talks` (Library), `#results #architecture #gallery #stack` (case study), `#cv #channels` (Contact).
- Every page keeps its `ExperienceGate` mount with the same props. Back to 3D stays owned by `ExperienceGate`.
- Touch targets at least 44 px. AA contrast. `prefers-reduced-motion` respected.
- Fonts via `next/font/google` only (self-hosted at build; CSP blocks runtime CDNs).
- Before pushing: `bun run typecheck && bun run lint && bun run test && bun run build && bun run e2e`.

## File structure

| File | Responsibility |
|---|---|
| `src/app/fonts.ts` | add Archivo (`wdth` axis) |
| `src/app/globals.css` | HUD tokens (`.glass .eyebrow .chip .card`), page layer (`.pv-*` type, layout, rows) |
| `src/content/pageview.ts` | pure helpers: pod filters, stack options, counts, timeline filters, URL params, nav matching, home selection |
| `src/components/page/Layout.tsx` | `PageIntro`, `SectionSplit`, `Marker`, `ActionLink` |
| `src/components/page/Work.tsx` | `WorkFeature`, `WorkRow` |
| `src/components/page/WorkIndex.tsx` | client filter island for `/labs` |
| `src/components/page/Case.tsx` | `FactRow`, `MetricLedger`, `StepList` |
| `src/components/page/CaseToc.tsx` | client scroll-spy ToC |
| `src/components/page/Timeline.tsx` | `TimelineRow` |
| `src/components/page/JourneyFilter.tsx` | client type filter for `/journey` |
| `src/components/page/Writing.tsx` | `PostLead`, `PostRow`, `PaperRow`, `ModelRow`, `TalkRow` |
| `src/components/page/About.tsx` | `ContactPanel`, `ChannelList`, `PrincipleList`, `SkillGroups`, `CertList`, `CopyEmail` (client) |
| `src/components/NavLink.tsx` | client nav item with `aria-current` |
| `src/components/SiteHeader.tsx`, `SiteFooter.tsx`, `LocaleSwitch.tsx` | rewritten / restyled |
| `src/components/ArchitectureDiagram.tsx`, `Gallery.tsx`, `LibraryBlocks.tsx`, `WorkshopAnnex.tsx`, `Chip.tsx`, `MetricTile.tsx` | restyled to tokens; `Gallery` gains `layout="mosaic"` |
| `src/app/[locale]/**/page.tsx` | page templates |
| `tests/unit/pageview.test.ts` | helper tests |
| `tests/hud/WorkIndex.test.tsx`, `JourneyFilter.test.tsx`, `NavLink.test.tsx`, `CaseToc.test.tsx` | island tests |
| `e2e/pageview.spec.ts` | nav, filters, anchors, axe per template |
| `e2e/pageview-visual.spec.ts` | opt-in visual captures at 1440x900, 1024x1366, 390x844 |

---

### Task 1: Tokens, fonts and page CSS layer

**Files:** Modify `src/app/fonts.ts`, `src/app/globals.css`. Test: existing suites (`bun run test`), visual check via `bun run dev`.

**Produces:** CSS variables `--font-display`, `--color-line`, `--color-line-2`, `--color-surface`, `--color-surface-2`; classes `.glass .eyebrow .chip .card` and the page layer `.pv-wrap .pv-grid .pv-sec .pv-sidehead .pv-d-xl .pv-d-l .pv-h2 .pv-h3 .pv-lead .pv-body .pv-small .pv-data .pv-num .pv-mark .pv-btn .pv-btn-primary .pv-btn-ghost .pv-go .pv-uline .pv-rows .pv-row .pv-stretch .pv-logos .pv-tags`.

- [ ] **Step 1: Archivo**

```ts
// src/app/fonts.ts
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";

export const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
export const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });
export const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", display: "swap", axes: ["wdth"] });

export const fontClassName = `${inter.variable} ${jetbrains.variable} ${archivo.variable}`;
```

- [ ] **Step 2: tokens in `@theme`**: add `--font-display: var(--font-archivo), ui-sans-serif, system-ui, sans-serif;` and the four `line`/`surface` colors with the values from the spec section 4.

- [ ] **Step 3: body background**: replace the fixed full-page grid with the hero-only grid. `body { position: relative; background-color: var(--color-void); }` plus

```css
body::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 960px;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(rgb(99 102 241 / 0.09) 1px, transparent 1px),
    linear-gradient(90deg, rgb(99 102 241 / 0.09) 1px, transparent 1px);
  background-size: 48px 48px;
  background-position: center top;
  mask-image: linear-gradient(to bottom, #000 0%, rgb(0 0 0 / 0.6) 45%, transparent 100%);
}
```

Body font size moves to 16/1.65.

- [ ] **Step 4: HUD tokens**: `.glass` uses the prototype values (spec section 4) and `@media (pointer: coarse) { .glass { backdrop-filter: none; background: rgb(14 14 24 / 0.9); } }`. Add `.eyebrow`, `.chip` (with `[aria-pressed="true"]` inverted state and `.chip-count`), `.card`.

- [ ] **Step 5: page layer**: port `docs/design/pageview/pageview.css` classes under the `pv-` prefix inside `@layer components` (type scale, grid helpers, rows, marks, buttons, header and footer pieces, filters, case-study blocks, gallery mosaic, responsive rules at 1080 px and 760 px). Accent colors come from `var(--color-*)`.

- [ ] **Step 6: run** `bun run test` (safety and copy tests unaffected) and `bun run lint`. Expected: PASS.

- [ ] **Step 7: commit** `feat(pageview): shared HUD tokens, Archivo and page CSS layer`.

### Task 2: Pure helpers

**Files:** Create `src/content/pageview.ts`, `tests/unit/pageview.test.ts`.

**Produces:**

```ts
export type Wing = "software" | "ai";
export interface PodFilter { wing: Wing | "all"; stack: string | null }
export function parsePodFilter(search: string): PodFilter;
export function podFilterQuery(filter: PodFilter): string;            // "" or "?wing=ai&stack=FastAPI"
export function matchesPod(pod: Pick<Pod, "wing" | "stack">, filter: PodFilter): boolean;
export function stackOptions(pods: readonly Pick<Pod, "stack">[], min?: number): { name: string; count: number }[];
export function wingCounts(pods: readonly Pick<Pod, "wing">[]): Record<"all" | Wing, number>;
export type EntryType = TimelineEntry["type"];
export function parseTypeFilter(search: string): EntryType | "all";
export function typeCounts(entries: readonly Pick<TimelineEntry, "type">[]): Record<"all" | EntryType, number>;
export function navMatch(pathname: string, href: string): boolean;     // locale-less paths
```

- [ ] **Step 1: failing tests**

```ts
import { describe, expect, it } from "vitest";
import { matchesPod, navMatch, parsePodFilter, parseTypeFilter, podFilterQuery, stackOptions, typeCounts, wingCounts } from "@/content/pageview";

const pods = [
  { wing: "ai" as const, stack: ["FastAPI", "Azure OpenAI"] },
  { wing: "software" as const, stack: ["Node.js", "FastAPI"] },
  { wing: "ai" as const, stack: ["Next.js"] },
];

describe("pod filters", () => {
  it("parses and serializes the query", () => {
    expect(parsePodFilter("?wing=ai&stack=FastAPI")).toEqual({ wing: "ai", stack: "FastAPI" });
    expect(parsePodFilter("?wing=nope")).toEqual({ wing: "all", stack: null });
    expect(podFilterQuery({ wing: "all", stack: null })).toBe("");
    expect(podFilterQuery({ wing: "software", stack: "Next.js" })).toBe("?wing=software&stack=Next.js");
  });
  it("matches wing and stack together", () => {
    expect(pods.filter((p) => matchesPod(p, { wing: "ai", stack: "FastAPI" }))).toHaveLength(1);
    expect(pods.filter((p) => matchesPod(p, { wing: "all", stack: "FastAPI" }))).toHaveLength(2);
    expect(pods.filter((p) => matchesPod(p, { wing: "all", stack: null }))).toHaveLength(3);
  });
  it("lists stacks used by at least `min` pods, most used first, then by name", () => {
    expect(stackOptions(pods, 2)).toEqual([{ name: "FastAPI", count: 2 }]);
    expect(stackOptions(pods).map((s) => s.name)).toEqual(["FastAPI", "Azure OpenAI", "Next.js", "Node.js"]);
  });
  it("counts wings", () => {
    expect(wingCounts(pods)).toEqual({ all: 3, ai: 2, software: 1 });
  });
});

describe("timeline filters", () => {
  it("parses the type and counts entries", () => {
    expect(parseTypeFilter("?type=award")).toBe("award");
    expect(parseTypeFilter("?type=x")).toBe("all");
    expect(typeCounts([{ type: "job" }, { type: "job" }, { type: "award" }])).toEqual({ all: 3, job: 2, freelance: 0, education: 0, award: 1, milestone: 0 });
  });
});

describe("navMatch", () => {
  it("matches the section and its children only", () => {
    expect(navMatch("/labs", "/labs")).toBe(true);
    expect(navMatch("/labs/voice", "/labs")).toBe(true);
    expect(navMatch("/blog/x", "/library")).toBe(true);
    expect(navMatch("/labsx", "/labs")).toBe(false);
    expect(navMatch("/", "/labs")).toBe(false);
  });
});
```

- [ ] **Step 2: run** `bunx vitest run tests/unit/pageview.test.ts`, expected FAIL (module missing).
- [ ] **Step 3: implement** (`URLSearchParams`; `navMatch` treats `/blog` as part of `/library` and `/cv` as its own; `stackOptions` sorts by `count desc, name asc`).
- [ ] **Step 4: run** again, expected PASS.
- [ ] **Step 5: commit** `feat(pageview): pure filter and nav helpers`.

### Task 3: Layout primitives, header, footer and nav

**Files:** Create `src/components/page/Layout.tsx`, `src/components/NavLink.tsx`, `tests/hud/NavLink.test.tsx`. Modify `SiteHeader.tsx`, `SiteFooter.tsx`, `LocaleSwitch.tsx`, `src/hud/HudLaunchers.tsx` (accept `compact`), `messages/en.json`, `messages/id.json`.

**Interfaces:**
- `PageIntro({ floor?: FloorId; floorLabel?: string; title: string; lead?: string; aside?: ReactNode; crumb?: { href: string; label: string } })` renders `.pv-wrap` with an h1.
- `SectionSplit({ id, title, intro?, more?: { href: string; label: string }, children })` renders `<section id aria-labelledby>` with a 4/8 grid.
- `Marker({ accent: Accent; children })` renders the 7 px square plus data text.
- `NavLink({ href, floor, accent, children })` client; `aria-current="page"` when `navMatch(pathname, href)`.

**New messages** (EN / ID):

| key | EN | ID |
|---|---|---|
| `nav.work` | Work | Karya |
| `nav.writing` | Writing | Tulisan |
| `nav.about` | About | Tentang |
| `nav.mobile` | Sections | Bagian |
| `footer.pages` | Pages | Halaman |
| `footer.elsewhere` | Elsewhere | Tautan lain |

- [ ] **Step 1: failing test** (`tests/hud/NavLink.test.tsx`, jsdom): mock `@/i18n/navigation` (`usePathname` returns `"/labs/voice-ai-contact-center"`, `Link` renders `<a>`); render `NavLink href="/labs"` and `href="/journey"`; expect the first to have `aria-current="page"` and the second none.
- [ ] **Step 2: run**, FAIL.
- [ ] **Step 3: implement** `NavLink`, then rewrite `SiteHeader` to the spec section 2 (brand with `Monogram`-styled square, desktop `<nav aria-label={t("label")}>` with 4 `NavLink`s, tools: `HudLaunchers compact`, `LocaleSwitch`; mobile `<nav aria-label={t("mobile")}>` row). Keep the skip link and `no-print`. Footer per spec. `LocaleSwitch` keeps `aria-label={label}` and `aria-current` semantics (e2e uses `navigation "Language"` and link `ID`).
- [ ] **Step 4: run** `bunx vitest run tests/hud/NavLink.test.tsx tests/unit/ui-copy.test.ts`, PASS.
- [ ] **Step 5: commit** `feat(pageview): header, footer and layout primitives`.

### Task 4: Work index (`/labs`)

**Files:** Create `src/components/page/Work.tsx`, `src/components/page/WorkIndex.tsx`, `tests/hud/WorkIndex.test.tsx`. Modify `src/app/[locale]/labs/page.tsx`, messages.

**Interfaces:**
- `WorkFeature({ pod, locale, size: "lead" | "pair" | "grid" })` server: `<article>` with cover (`coverImage`, thumb for pair/grid), `Marker` wing, period, client, `h3` with stretched `Link`, tagline, outcomes (lead: 2 results; else 1). Pods without assets show the first result as a number block.
- `WorkRow({ pod, locale })` server: `<li class="pv-index-row" data-wing data-stack={pod.stack.join("|")}>`.
- `WorkIndex({ total, stacks, counts, labels, children })` client: renders the filter bar, then `children`; on change it toggles `hidden` on descendants with `[data-pod]` using `matchesPod`, hides a block whose items are all hidden (`[data-pod-block]`), updates the `role="status"` count and `history.replaceState` with `podFilterQuery`; shows the empty state when none match.

**New messages** (`work` namespace):

| key | EN | ID |
|---|---|---|
| `title` | Work | Karya |
| `keyProjects` | Key projects | Proyek utama |
| `allProjects` | All projects | Semua proyek |
| `filters` | Filter projects | Filter proyek |
| `wing` | Wing | Wing |
| `all` | All | Semua |
| `stack` | Stack | Stack |
| `anyStack` | Any stack | Semua stack |
| `showing` | Showing {shown} of {total} | Menampilkan {shown} dari {total} |
| `empty` | No projects match these filters. | Tidak ada proyek yang cocok dengan filter ini. |
| `clear` | Clear filters | Hapus filter |
| `wingShort.software` | Software | Software |
| `wingShort.ai` | AI | AI |

- [ ] **Step 1: failing test** (`WorkIndex.test.tsx`): render `WorkIndex` with three children `<li data-pod data-wing="ai" data-stack="FastAPI|Azure OpenAI">A</li>` etc.; click "AI" chip, expect `B` hidden and status "Showing 2 of 3"; choose stack "Node.js" with AI pressed, expect the empty state and "Clear filters"; click it, all visible and `window.location.search === ""`.
- [ ] **Step 2: run**, FAIL.
- [ ] **Step 3: implement** components and the page: `PageIntro` (floor L3, title `work.title`, lead `labs.intro`, aside with wing counts and `labs.softwareIntro` / `labs.aiIntro`), `WorkIndex` wrapping "Key projects" (6 hero pods, AI first, as `WorkFeature size="grid"` alternating 7/5 and 5/7 spans) and "All projects" (featured then listed as `WorkRow`). Metadata title `work.title`. Keep `ExperienceGate startFloor="L3"`. The gallery e2e expects an `article` containing the pod title link and its `.thumb.webp` cover on `/labs`, which `WorkFeature` satisfies.
- [ ] **Step 4: run** `bunx vitest run tests/hud/WorkIndex.test.tsx`, PASS.
- [ ] **Step 5: commit** `feat(pageview): Work index with wing and stack filters`.

### Task 5: Case study (`/labs/[slug]`)

**Files:** Create `src/components/page/Case.tsx`, `src/components/page/CaseToc.tsx`, `tests/hud/CaseToc.test.tsx`. Modify `src/app/[locale]/labs/[slug]/page.tsx`, `ArchitectureDiagram.tsx`, `Gallery.tsx`, `Chip.tsx`, `MetricTile.tsx` (`ConfidenceBadge` restyle), messages.

**Interfaces:**
- `FactRow({ items: { label: string; value: ReactNode }[] })`.
- `MetricLedger({ results, locale })` renders `<ul>` of value, label, context, `ConfidenceBadge`.
- `StepList({ steps, locale })` ordered list with two-digit numbers.
- `CaseToc({ items: { id: string; label: string }[]; label: string; children?: ReactNode })` client; sets `aria-current="true"` on the link whose section is in view (IntersectionObserver, rootMargin `-30% 0px -60% 0px`); without IntersectionObserver it renders plain links.
- `Gallery` adds `layout="mosaic"` (first image spans 4 of 6 columns and 2 rows; full image for the first, thumbs for the rest). Buttons and `data-testid="gallery"` unchanged.

**New messages:** `case.onThisPage` "On this page" / "Di halaman ini"; `case.more` "More from the {wing}" / "Lainnya dari {wing}".

- [ ] **Step 1: failing test** (`CaseToc.test.tsx`): stub `IntersectionObserver` capturing the callback; render with two items and matching `<section id>` elements; fire the callback with the second entry intersecting; expect its link `aria-current="true"`. Second test: delete `window.IntersectionObserver`, render, expect two links and no throw.
- [ ] **Step 2: run**, FAIL.
- [ ] **Step 3: implement** components and the page per spec section 6. Keep `#results li` (results ledger), `#architecture`, `#gallery`, `#stack img[src^='/tech/']` (logo chips), JSON-LD, `ExperienceGate startRoom`. Related nav uses `adjacent()` within the wing.
- [ ] **Step 4: run** `bunx vitest run tests/hud/CaseToc.test.tsx tests/hud/Gallery.test.tsx`, PASS.
- [ ] **Step 5: commit** `feat(pageview): case study template`.

### Task 6: Journey and journey entry

**Files:** Create `src/components/page/Timeline.tsx`, `src/components/page/JourneyFilter.tsx`, `tests/hud/JourneyFilter.test.tsx`. Modify `journey/page.tsx`, `journey/[slug]/page.tsx`, `WorkshopAnnex.tsx`, messages.

**Interfaces:**
- `TimelineRow({ entry, locale, headingLevel? })` renders `<li data-entry data-type={entry.type}>` with period, role link to `/journey/{slug}`, org with `OrgLogo size 24`, summary, type `Marker`.
- `JourneyFilter({ counts, labels })` client: type chips (`aria-pressed`), hides `[data-entry]` rows not matching and `[data-year]` blocks left empty, `?type=` via `replaceState`.

**New messages** (`journey`): `show` "Show" / "Tampilkan", `jumpTo` "Jump to" / "Lompat ke", `filters` "Filter entries" / "Filter entri", `entries` "{count, plural, one {# entry} other {# entries}}" / "{count, plural, other {# entri}}", `all` "All" / "Semua", `navTitle` "Journey" / "Perjalanan".

- [ ] **Step 1: failing test**: render `JourneyFilter` above two `[data-year]` blocks with rows of types job and award; click "Awards"; expect the job row hidden, the job-only year block hidden, `aria-pressed` on Awards.
- [ ] **Step 2: run**, FAIL.
- [ ] **Step 3: implement**. Journey page: `PageIntro` (floor L2, title `journey.navTitle`, lead `journey.intro`, aside: year jump chips with `#y{year}` and `#workshop`), sticky glass filter, `<ol>` of years newest first (`id="y{year}"`, `data-year`), rows newest first, "Prologue" note kept, workshop annex as rows (side projects, repos with stars). Entry page per spec section 6.
- [ ] **Step 4: run** the test, PASS.
- [ ] **Step 5: commit** `feat(pageview): Journey timeline with type filter`.

### Task 7: Writing and blog post

**Files:** Create `src/components/page/Writing.tsx`. Modify `library/page.tsx`, `blog/[slug]/page.tsx`, `LibraryBlocks.tsx` (`ResearchList` restyled to paper rows, keeping DOI link text `DOI {doi}`, author highlight `<strong>`, research profile links and the "as of" metrics line), messages.

**New messages:** `writing.title` "Writing" / "Tulisan", `writing.sections` "Sections" / "Bagian", `writing.readPost` "Read the post" / "Baca tulisan".

- [ ] **Step 1:** page blocks are async server components, so they are covered in e2e (Task 10). Implement `PostLead`, `PostRow` (date, title link or Medium external link with the `common.external` sr hint, excerpt, tags, language badges), `ModelRow`, `TalkRow`.
- [ ] **Step 2:** Library page: `PageIntro` (floor L4, title `writing.title`, lead `library.intro`, aside section chips with counts), `SectionSplit`s `#posts` (lead plus rows), `#research`, `#publications`, `#talks`. Blog post: crumb to `/library`, date, languages, `display-l` title, prose.
- [ ] **Step 3: run** `bun run build:web` then `bunx playwright test e2e/library-roof.spec.ts -g "static Library"`, PASS.
- [ ] **Step 4: commit** `feat(pageview): Writing page and post template`.

### Task 8: About and contact

**Files:** Create `src/components/page/About.tsx`. Modify `contact/page.tsx`, `ProfileBlocks.tsx` (restyle `PrincipleGrid` to ruled rows as `PrincipleList`, `SkillsWall` to groups, `CertificationList` to rows, `AwardList` rows), messages.

**Interfaces:** `ContactPanel({ roof, profile, locale })` (availability as h2, `mailto` primary button, `CopyEmail` client button using `navigator.clipboard` with `common.copyEmail` / `common.copied`, location, `ChannelList` with `id="channels"`).

**New messages:** `about.title` "About and contact" / "Tentang dan kontak".

- [ ] **Step 1:** implement; page sections: intro (story lead + `ContactPanel` aside), `#how`, `#skills`, `#certifications`, `#cv` (EN and ID PDF buttons with `hrefLang`, CV page link).
- [ ] **Step 2: run** `bunx playwright test e2e/static-routes.spec.ts`, PASS.
- [ ] **Step 3: commit** `feat(pageview): About and contact page`.

### Task 9: Home, Quick view, CV chrome, 404

**Files:** Modify `src/app/[locale]/page.tsx`, `quick/page.tsx`, `cv/page.tsx` (screen chrome only), `global-not-found.tsx`, messages.

**New messages** (`home`): `seeWork` "See the work" / "Lihat karya", `selectedWork` "Selected work" / "Karya pilihan", `allProjects` "All {count} projects" / "Semua {count} proyek", `fullJourney` "Full journey" / "Perjalanan lengkap", `writingTitle` "Writing" / "Tulisan", `allWriting` "All writing" / "Semua tulisan", `aboutContact` "About and contact" / "Tentang dan kontak", `openTo` "Open to" / "Terbuka untuk", `since` "since {date}" / "sejak {date}", `location` "Location" / "Lokasi".

- [ ] **Step 1:** Home per spec section 6 (hero with status card, `#stats` ledger, selected work: AI hero pods lead + pair, software hero pods as rows, recent work rows, writing rows, compact `#skills` and `#certifications`, closing). Remove the tower directory box.
- [ ] **Step 2:** Quick view: `PageIntro`, sticky glass ToC, sections with `SectionSplit` and the new rows (keeps all existing ids). CV: screen header and download buttons restyled; print sheet untouched.
- [ ] **Step 3: run** `bun run test && bun run build:web && bunx playwright test e2e/static-routes.spec.ts e2e/seo.spec.ts`, PASS.
- [ ] **Step 4: commit** `feat(pageview): Home, Quick view and CV chrome`.

### Task 10: E2E, axe and visual captures; docs; cleanup

**Files:** Create `e2e/pageview.spec.ts`, `e2e/pageview-visual.spec.ts`. Modify `AGENTS.md` (folder layout: `src/components/page/`, `src/content/pageview.ts`; Styling: Archivo, `pv-` layer, HUD tokens), `package.json` script `screenshots:pages`. Delete components left unused (`PodCard`, `TimelineItem`, `Section` if unreferenced).

- [ ] **Step 1: e2e** (all with `hq:terminal-seen` set and `?tier=static`):

```ts
const TEMPLATES = ["/en", "/en/labs", `/en/labs/${heroPod.slug}`, "/en/journey", `/en/journey/${firstEntry.slug}`, "/en/library", "/en/contact", "/en/quick", "/id"];
for (const path of TEMPLATES) test(`axe: ${path}`, async ({ page }) => { await page.goto(`${path}?tier=static`); await expectNoSeriousViolations(page); });

test("nav marks the current section", async ({ page }) => {
  await page.goto(`/en/labs/${heroPod.slug}?tier=static`);
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: /Work/ })).toHaveAttribute("aria-current", "page");
});

test("Work filters by wing and stack and keeps the URL", async ({ page }) => {
  await page.goto("/en/labs?tier=static");
  await page.getByRole("button", { name: /^AI/ }).click();
  await expect(page).toHaveURL(/wing=ai/);
  await expect(page.getByRole("status")).toContainText(/Showing \d+ of 30/);
  await page.reload();
  await expect(page.getByRole("button", { name: /^AI/ })).toHaveAttribute("aria-pressed", "true");
});

test("Journey type filter hides other entries", async ({ page }) => {
  await page.goto("/en/journey?tier=static");
  await page.getByRole("button", { name: /^Awards/ }).click();
  await expect(page.locator("[data-entry][data-type='job']").first()).toBeHidden();
  await expect(page.locator("[data-entry][data-type='award']").first()).toBeVisible();
});

test("no horizontal overflow on phones", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const path of TEMPLATES) {
    await page.goto(`${path}?tier=static`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
});
```

- [ ] **Step 2: visual** (`pageview-visual.spec.ts`, opt-in with `SCREENSHOTS=1`): for 1440x900, 1024x1366, 390x844 capture full-page `screenshots/pageview/{page}-{w}x{h}.png` for Home, Work, Case study, Journey, Writing, About with `?tier=static`, reduced motion, fonts ready.
- [ ] **Step 3: run** `bun run typecheck && bun run lint && bun run test && bun run build && bun run e2e`, all PASS.
- [ ] **Step 4: commit** `test(pageview): axe, filters and visual captures` and `docs: AGENTS.md Page View conventions`.

## Self-review

- Spec coverage: IA and nav (Task 3), grid/type/tokens (Task 1), components (Tasks 3 to 8), templates (Tasks 4 to 9), states (Tasks 4 and 6 empty states, optional rows), a11y (Task 10 axe, 44 px, aria), Back to 3D unchanged (gate untouched), Explore in 3D (no change, documented), testing (Tasks 2 to 6, 10).
- Names: `matchesPod`, `parsePodFilter`, `podFilterQuery`, `stackOptions`, `wingCounts`, `parseTypeFilter`, `typeCounts`, `navMatch` used consistently in Tasks 2 to 6.
