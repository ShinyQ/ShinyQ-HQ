# Classic site design refinement

Date: 2026-10-19.

Status: in review

Owner request (summary): a design refinement of the existing Classic site, not a redesign. Keep the editorial Neon
Grid identity, its colors and its three fonts; remove generic decoration, improve typography, proportions, rhythm and
hierarchy, refine shared components instead of replacing them, and compare before and after at desktop 1440x900,
tablet 834x1194 and phone 390x844. Method: the `redesign-existing-projects` audit, with `minimalist-ui` for
restraint. Where a skill rule conflicts with the site (neon accents, Archivo, Inter, JetBrains Mono) or a recorded
owner decision, the site and the decision win.

Scope: every Classic page in both locales (home, Quick view, Journey and its entries, Work and case studies,
Writing and posts, About, CV, How this site was built) and the shared dialogs. The 3D experience is out of scope.

## Constraints kept

- No new colors, fonts, dependencies or features; no content, route, backend or logic changes.
- Owner decisions stand: featured cards are equal height in one grid with the neutral hairline and `hq-glow`; no
  colored edge stripes or top rules (cards, the certification preview); no confidence or "Verified" labels; no
  illustration beside the hero name; the ticker has no "Updated" stamp or pause switch.
- Motion stays compositor only and stops under reduced motion (`@variant motion-reduce`).

## The 10 weaknesses, ranked

Ranked by visual impact first, then by implementation risk (lower first). All ten are CSS or markup refinements in
shared styles and components.

| # | Weakness | Impact | Risk |
|---|---|---|---|
| 1 | Hero backdrop over-decorated | High | Low |
| 2 | All-caps mono on every date | High | Low |
| 3 | Project card text set like body copy | High | Low |
| 4 | Run-in results on project cards | Medium-high | Low |
| 5 | Frosted filter and contents bars | Medium-high | Low |
| 6 | Wing count tiles on Work | Medium | Low |
| 7 | Case study Results ledger in four narrow columns | Medium | Low |
| 8 | Closing headline louder than the page title | Medium | Low |
| 9 | Lead paragraphs too wide | Medium | Low |
| 10 | Noisy overlays and tags | Low-medium | Low |

### 1. Hero backdrop over-decorated

Before: three animated layers (a drifting two-color glow, a rolling perspective grid at 40% alpha and three
"data packet" streaks) plus a glow on the name and a triple halo on the portrait. The grid's horizon cuts through
the Ask bar, so the busiest part of the backdrop sits under the main input.

Change: remove the packets; lower the grid (shorter, fainter, horizon below the Ask chips); soften the glow; drop the
name's text shadow; the portrait keeps its cyan ring with one quiet shadow. The Neon Grid floor and the slow drift
stay, so the hero is still recognizably the HQ, and the first frame is calmer.

### 2. All-caps mono on every date

Before: `pv-data` (mono, uppercase, 0.06em tracking) sets labels and dates alike: "MAY 2026 TO OCT 2026", "FEB
2026 TO / PRESENT" (wrapping in the Journey column), "OCT 16, 2026". Shouting capitals on every row flatten the
hierarchy between a label and a value.

Change: a `pv-date` style for dates and periods (the same mono and color, sentence case, tabular figures, no extra
tracking), used on project cards and rows, Journey rows, posts and certification rows. Category labels and field
names keep `pv-data` capitals, so a label now reads as a label and a date as a value.

### 3. Project card text set like body copy

Before: the card tagline uses the 17 px, 1.65 body style, so a 360 px card runs four to five loose lines; the same
card is titled at 21 px on the home page and 34 px on Work.

Change: a card text style (15 px, 24 px leading, `text-wrap: pretty`) and one card title size on both pages (the
card's job is to scan, the case study is where reading happens).

### 4. Run-in results on project cards

Before: a condensed display numeral runs into a sans label on one line ("~2 s to ~0.2 s Knowledge-lookup..."),
with different baselines and the label wrapping under the number.

Change: the result is a small block on a hairline at the bottom of the card, value above label, so results line up
across a row like the metric strip on case studies.

### 5. Frosted filter and contents bars

Before: the Work, Journey and Writing filters and the Quick view and Build contents bars use `.glass`: a frosted
panel with a 40 px drop shadow and an inner highlight around pill chips (a box around boxes).

Change: a flat bar: the hairline, a near-opaque void fill (it stays sticky and legible over scrolled content), no
shadow or blur, a tighter radius.

### 6. Wing count tiles on Work

Before: three bordered cards with a big count; on phones the "PRODUCT ENGINEERING" label overflows its tile.

Change: the same three facts as a ruled list (the `pv-rows` rhythm the rest of the site uses), with labels that
wrap inside their column on phones.

### 7. Case study Results ledger in four narrow columns

Before: right under the metric strip, every result sits in a 190 px column; values break over two lines and labels
run five to nine lines.

Change: ruled rows with the value in a fixed column and the label and how it was measured beside it, like the
About facts ledger; the strip keeps the at-a-glance role.

### 8. Closing headline louder than the page title

Before: the home page's closing availability line is set at up to 64 px over four lines, larger than any section
title and close to the hero.

Change: the section title scale with a comfortable measure, so the email address stays the main action.

### 9. Lead paragraphs too wide

Before: `pv-lead` at 21 px runs about 85 to 90 characters per line (home "In short", About, case study Problem).

Change: the measure is capped at about 66 characters in wide places (page intros), with `text-wrap: pretty` to avoid
orphans. Inside the 8-column reading column of a case study or a Journey entry (`pv-col`) the column already is the
measure, so a lead (and the Results ledger's method line) runs its full width and lines up with the ruled lists below
(owner review).

### 10. Noisy overlays and tags

Before: "11 SCREENSHOTS" in tracked mono capitals on a black plate over the cover, and filled, bordered mono tags.

Change: a quieter count (sentence case, smaller plate) and hairline-only tags.

## Checks

- Before and after captures of every page at the three sizes, both locales, plus the certification preview; side by
  side comparisons for review (session artifacts, not committed).
- `bun run verify:quick`, `bun run e2e:changed` (pageview, motion, landing), axe in `pageview.spec.ts`, Lighthouse
  CI budgets (CSS stays under 20,480 B gzip).
