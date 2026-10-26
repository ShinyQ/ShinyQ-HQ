# Classic design pass: recruiter path polish

Date: 2026-10-26.

Status: draft, awaiting parent approval

Request: improve the Classic site with `redesign-existing-projects` (audit, then upgrade) and check the result with
`web-design-guidelines`. Design decisions are delegated to the parent session; the owner sees only budget raises and
rule changes. This pass refines the 2026-10-25 recruiter pass (#320,
`docs/superpowers/specs/2026-10-25-classic-recruiter-pass-design.md`); it keeps the landing order, the proof strip,
View CV as the primary action, story case studies and the 404.

## Audit summary

Audited on production (same tree as `main` at 6397c628) with `?view=classic` at 1440x900 and 390x844 (fold checks also
at 375x667 and 360x740): landing, `/labs`, a story case study, `/journey` with Time Travel, `/library`, a post,
`/contact`, `/cv` and the 404. Ranked by impact on a recruiter visitor:

| # | Impact | Finding | Picked |
|---|---|---|---|
| F1 | High | A case study has no CV or contact action; it ends in prev/next cards | yes |
| F2 | High | `/labs` Key projects cards hide the headline result that the landing cards show | yes |
| F3 | High | `/cv` on phones: View CV and Download start below the first screen (882 px on 390x844) | yes |
| F4 | Medium-high | The role title (`profile.headline`) is set at the motto's size and has no presence | yes |
| F5 | Medium | Phone chrome: sticky header and tab row take 110 px of 844 | no (needs JS and sticky offset changes) |
| F6 | Medium | The Ask teaser bubble covers body text on phones | no (HUD file, overlaps the phone-first 3D work) |
| F7 | Low-medium | 404 Home card is a `span` with a button hover; small link targets; no `theme-color` | yes |
| F8 | Low | No pressed state on `pv-btn` | yes |
| F9 | Low | `...` instead of `…` in two strings | yes |
| F10 | Low | No `translate="no"` on the owner's name | yes |

Rejected audit advice (conflicts with owner decisions): a font swap, sentence case headings, grain overlays or new
accents, asymmetric or staggered cards, fewer wayfinding colors.

## Changes

### 1. Case study next step (F1)

`src/app/[locale]/labs/[slug]/page.tsx`, a new block at the top of the related section (`#related-title`), before
the prev/next cards:

- One ruled row (`border-y border-line`, `py-6`, `flex flex-wrap items-center gap-x-6 gap-y-4`): the heading
  `case.nextStep` as an `h2` at `pv-h3`, then View CV (`CvButton`, `pv-btn pv-btn-primary`, `testId="cv-open-case"`)
  and About and contact (`Link` to `/contact`, `pv-btn pv-btn-ghost`, the existing `home.aboutContact` label).
- On every case study (story or not). No new component: about 15 lines of JSX.
- Strings (new, server-only `case` namespace, so not in client messages):
  - `case.nextStep` EN "Hiring for work like this?", ID "Sedang merekrut untuk pekerjaan seperti ini?" (UI strings are
    sentence case, like "Selected work"; Title Case applies to content titles only)
- The current related heading and cards stay; the row sits above them with `mb-10`.

### 2. Results on `/labs` Key projects (F2)

`src/components/page/Work.tsx`, `WorkFeature`:

- Render `pod.results[0]` as the `pv-result` block (value `pv-num text-[24px]`, label `pv-result-label`) right under
  the title, the same markup and `data-testid="feature-result"` as `FeaturedProject`, then the tagline, then the live
  link and the stack logo row at the foot (`TechLogoRow max={6}`, was 9, so the card does not grow).
- Remove the unused `lead` and `pair` sizes (only `size="grid"` is used, `src/app/[locale]/labs/page.tsx:63`); the
  `size` prop goes away. Their `aspect-[16/8]` utilities leave the stylesheet if nothing else uses them.

### 3. `/cv` actions first on phones (F3)

`src/components/cv/CvCover.tsx`:

- The actions column gets `-order-1 md:order-none` (both utilities already ship, used by `Timeline` and
  `LibraryBlocks`), so below `md` the page reads: "2 pages · PDF", View CV, Download, then the page image.
- The two-column split moves from `sm:` to `md:` (`md:grid-cols-[minmax(0,320px)_1fr]`, `md:p-6`, `md:mt-auto`), so
  640 to 767 px also stacks with the actions first. The old `sm:` arbitrary class is used only here and leaves.
- The page image keeps `fetchpriority="high"` and stays in the first screen on phones.

### 4. Hero role title (F4)

`src/components/page/Hero.tsx`: `profile.headline` moves from `pv-lead font-semibold` to `pv-h3 pv-h3-l` (Archivo
700, 26 to 34 px, balanced wrap, ink). The motto keeps `pv-lead text-ink-2`. The element stays a `p` (one `h1` per
page). Quick view keeps its own header unchanged.

- Fold rule: View CV stays inside the first screen at 375x667, 390x844 and 1440x900 (today its bottom is at 537 px on
  375x667).

### 5. 404 cleanup (F7)

`src/app/global-not-found.tsx`:

- The Home box drops `pv-btn pv-btn-ghost` for a plain box with the same shape (`rounded-xl border border-line-2 px-5 py-3`,
  existing utilities, no hover), since it is not a control.
- Its English and Bahasa Indonesia links become `inline-flex min-h-11 items-center` targets with `pv-uline` (existing).
- `export const viewport = { themeColor: "#05050c" }`, matching the locale pages.

### 6. Small polish (F8, F9, F10)

- `src/app/pageview.css`: `.pv-btn:active { transform: translateY(1px); }`. No transition is added, so the press is
  instant and needs no `motion-reduce` rule.
- `messages/en.json` and `messages/id.json`: `office.classic.loading` uses `…` ("Opening the office…", "Membuka
  kantor…"); the ellipsis is in all three font cuts.
- `translate="no"` on the hero `h1` (`Hero.tsx`) and the header name span (`SiteHeader.tsx`).

## Out of scope

- No 3D changes; nothing under `src/experience`, the boot card, onboarding or `src/hud` (F6 included).
- F5 (phone sticky chrome) and F11 (a desktop `Invalid URL` page error seen once in one run, not reproduced) are
  reported, not fixed.
- No content, token, font or section order changes.

## Budgets

| Budget | Effect (estimate) |
|---|---|
| CSS 20,480 B (global chunk 19,635 B) | `:active` about +30 B gz; `md:p-6` and `md:mt-auto` up to +30 B gz if not already generated; minus `aspect-[16/8]`, `[&_.pv-ph]:aspect-[16/8]` and the old `sm:grid-cols` class; net under +60 B gz of the 845 B headroom |
| JS 240 KB | 0 (no new islands; `CvButton` already ships on every page in the footer) |
| HTML 83,968 B | `/en/labs` about +350 B gz (66.4 KB); case pages about +150 B gz (42.6 KB); home about +30 B; `/en/quick` and `/id/quick` about +30 B (header only) |
| LCP, CLS, TBT | unchanged: no image or font changes, static layout only |
| 3D | 0 bytes |

No cap rises.

## Testing

- `e2e/pageview.spec.ts`:
  - a case study shows the next-step row with `cv-open-case`, which opens the CV reader;
  - `/en/labs` Key projects cards each show `feature-result` under the title;
  - the hero View CV stays inside the first screen at 375x667;
  - existing edge-stripe and axe checks keep passing on these templates.
- CV spec (the existing `/cv` e2e): at 390x844, `cv-read` and `cv-download` are inside the first screen.
- `e2e/not-found.spec.ts`: the Home links are at least 44 px high; `theme-color` is set.
- Unit: none new (no logic). `tests/content/fonts.test.ts` covers the ellipsis.
- Lighthouse: `/en`, `/en/labs`, `/en/labs/voice-ai-contact-center`, `/en/cv` stay in budget.
- Before/after captures with `captureShot` for the hero, a labs card, `/cv` on a phone and the case study end.

## Docs

- `docs/agents/page-view.md`: case study next step, Key projects result, `/cv` order, the hero role title, 404 Home box.
- `docs/agents/styling-and-i18n.md`: the `pv-btn` pressed state.
- `docs/features.md` status log line. No decision file (no owner decision changes).

## Delivery

One PR, in commits by area: case study and labs cards; `/cv` and hero; 404 and polish; docs.
