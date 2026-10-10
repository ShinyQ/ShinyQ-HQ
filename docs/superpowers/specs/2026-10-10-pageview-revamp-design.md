# Page View revamp: editorial Neon Grid (design spec)

Sub-project C of the 2026-10-10 polish plan. Scope: the HTML site under `src/app/[locale]/**` and `src/components/**`, shown on the static tier and after "Page view" in the 3D HQ. Mockups: `docs/design/pageview/` (generated from `content/site-content.json` by `gen-mockups.ts`; screenshots in `screenshots/`).

Owner request: "for the Page View its looks so AI and need full revamp on the design so its structured more in UX and more good in design".

## 1. Direction

**Thesis.** The Page View is the printed directory of the tower. Each page is a floor sheet on a strict 12-column grid where real content (outcomes, dates, stacks, screenshots) carries the design. It refuses the generic portfolio: no gradient blobs, no glow-on-hover cards, no rows of identical icon cards, no vague hero.

**Own world.**
- Void ground (`#05050c`). The 48 px indigo Neon Grid is drawn only behind the first viewport and fades out by 960 px, so reading areas are plain.
- Type: **Archivo** (variable, `wdth` 62 to 125) for display and numerals in condensed widths; **Inter** for body; **JetBrains Mono** only for data (dates, floor ids, counts, tags).
- Floor and wing colors are wayfinding, never fills: a 7 px square before a data label, and a 2 px rule under the active nav item. Body copy and surfaces stay neutral.
- HUD glass only on layers that float over content: sticky header, sticky filter bar, Back to 3D. In-flow blocks use hairline rules (ledgers, indexes) or the quiet `.card`.
- Hierarchy comes from size and weight steps and an asymmetric grid (sidehead 4 columns, content 8; lead feature 7, pair 5), not from color.

**Story.** In one viewport a visitor learns who this is, what he builds, where he works now, and can jump to the work. Every following section answers one question (numbers, work, path, writing, contact) and ends in a link to the full page.

## 2. Information architecture and nav

| Nav label (EN / ID) | Route | Floor | Content |
|---|---|---|---|
| Home (brand link) | `/{locale}` | L1 | hero, at a glance, selected work, recent work, writing, closing contact |
| Work / Karya | `/{locale}/labs` | L3 | filterable project index |
| (case study) | `/{locale}/labs/[slug]` | L3 | problem, approach, architecture, results, gallery, stack, related |
| Journey / Perjalanan | `/{locale}/journey` | L2 | timeline by year with type filter, workshop annex |
| (entry) | `/{locale}/journey/[slug]` | L2 | entry detail |
| Writing / Tulisan | `/{locale}/library` | L4 | blog, research, models and datasets, talks |
| (post) | `/{locale}/blog/[slug]` | L4 | MDX post |
| About / Tentang | `/{locale}/contact` | RF | story, contact channels, how I work, skills, certifications, CV |
| Quick view, CV | `/{locale}/quick`, `/{locale}/cv` | none | footer, Home hero, About CV block |

URLs and in-page anchors stay stable: `#stats`, `#skills`, `#certifications` (Home), `#y{year}`, `#workshop` (Journey), `#posts`, `#research`, `#publications`, `#talks` (Library), `#results`, `#architecture`, `#stack`, `#gallery` (case study), `#cv`, `#channels` (Contact). The room catalog (`experience/missions/rooms.ts`) points at these. Skills and certifications move to About visually, but Home keeps `#skills` and `#certifications` sections so `/#skills` deep links still land (Home renders compact versions: the skills groups as chip rows and the certification list).

**Header** (`SiteHeader`, sticky, glass): brand (KAW monogram square, name, mono subline "ShinyQ HQ"), primary nav (4 items with floor id prefix on desktop), tools (Missions `>_`, Search with shortcut, EN/ID switch). Active item: `aria-current="page"` plus a 2 px floor-colored rule at the header's bottom edge. Child routes (`/labs/x`) mark their parent.

**Below 1024 px** (`lg`): header row with brand, Missions (icon only), Search (icon only), language; a second row with the 4 nav items as equal tabs (no hamburger, no hidden menu). The desktop nav (with floor id prefixes) starts at 1024 px.

**Footer**: name, availability, email; Pages column (Work, Journey, Writing, About, Quick view, CV); Elsewhere column (LinkedIn, GitHub, Medium, Google Scholar); base row with "built" note and source link. Bottom padding leaves room for the Back to 3D button.

## 3. Grid, type, spacing

- Container: max 1240 px, side padding `clamp(20px, 4vw, 48px)`, 12 columns, 24 px gutter.
- Breakpoints (Tailwind defaults): `lg` 1024 (12-column grid, sticky sideheads, ToC, desktop nav), `md` 768 (row columns, sticky filter bar); below that one column and tab nav.
- Section rhythm: `padding-top: clamp(80px, 10vw, 136px)`; more space above a heading than below.

| Token | Face | Size / line | Use |
|---|---|---|---|
| `display-xl` | Archivo 800, wdth 78 | clamp(56, 8vw, 96) / 0.9 | Home name |
| `display-l` | Archivo 800, wdth 82 | clamp(44, 5.6vw, 76) / 0.95 | page h1 |
| `h2` | Archivo 750, wdth 88 | clamp(28, 2.8vw, 40) / 1.05 | section titles |
| `h3` | Archivo 700, wdth 92 | 22 / 1.2 (lead feature 26 to 34) | item titles |
| `num` | Archivo 700, wdth 72, tabular | 22 to 44 | metrics, years, codes |
| `lead` | Inter 400 | clamp(18, 1.45vw, 21) / 1.55 | intros |
| body | Inter 400 | 16 / 1.65, measure 68ch | paragraphs |
| `small` | Inter 400 | 14 / 22 | secondary |
| `data` | JetBrains Mono 500, +0.06em, uppercase | 12 / 16 | dates, floor ids, counts |

Letter spacing never below -0.03em. Headings use `text-wrap: balance`.

## 4. Tokens (shared with the HUD)

Added to `globals.css` `@theme` and components (values from the prototype `agent-hq.html`):

- `--color-line: rgb(255 255 255 / 0.09)`, `--color-line-2: rgb(255 255 255 / 0.16)`, `--color-surface: rgb(255 255 255 / 0.025)`, `--color-surface-2: rgb(255 255 255 / 0.05)`.
- `.glass`: `rgb(14 14 24 / 0.64)`, `blur(18px) saturate(140%)`, 1 px `line` border, 16 px radius, `0 12px 40px rgb(0 0 0 / 0.45), inset 0 1px 0 rgb(255 255 255 / 0.05)`. Coarse pointers drop the blur and raise opacity to 0.9.
- `.eyebrow`: mono 11 px, uppercase, 0.08em (the HUD section label). On pages it appears only as the floor locator (section 7).
- `.chip`: pill, 1 px `line`, `rgb(255 255 255 / 0.04)`; pressed state inverts to ink on void.
- `.card`: 1 px `line`, 12 px radius, `surface` fill, no shadow.
- Existing tokens stay (`void`, `ink`, `ink-2`, `ink-3`, accents); `.label` stays for HUD code. Sub-project B may already ship `.glass/.eyebrow/.chip/.card`; if so C uses B's definitions and only adds the page-specific classes below.
- Fonts: Archivo added in `src/app/fonts.ts` via `next/font/google` (self-hosted at build, CSP safe) with `axes: ["wdth"]`, variable `--font-archivo`, exposed as `--font-display`.

## 5. Component inventory

All server components unless noted. Live in `src/components/page/` (new) or replace existing files.

| Component | Purpose |
|---|---|
| `SiteHeader` | rewritten (section 2); `NavLink` client child computes `aria-current` from `usePathname`. |
| `SiteFooter` | rewritten (section 2). |
| `PageIntro` | page h1 block: floor locator, `display-l` title, lead, optional right column slot (counts, jump links). |
| `SectionSplit` | sidehead (h2, intro, "more" link; sticky on desktop) + content column. Replaces `Section` for page bodies. |
| `Ledger` | value column + sentence rows (Home stats). |
| `WorkFeature` | cover image, wing marker, period, client, title link (stretched), tagline, outcomes (2 results) or one result. Sizes `lead` and `pair`. |
| `WorkRow` | index row: wing marker, title, tagline, tech logos; client; start date; headline result. |
| `WorkIndex` (client) | filter bar (wing chips with counts, stack select, live result count) over `WorkFeature`s and `WorkRow`s; reads/writes `?wing=` and `?stack=` with `history.replaceState`, keeping other params. Server renders all rows so it works without JS. Sticky from 768 px; in flow on phones. |
| `TimelineRow` | period, role (link), org with logo, summary, type marker. |
| `JourneyFilter` (client) | type chips with counts; hides rows and empty years; `?type=`. |
| `MetricLedger` | case-study results row with context and confidence badge. |
| `FactRow` | role, period, client (only when present). |
| `CaseToc` (client) | sticky "On this page" with scroll-spy (`IntersectionObserver`), hidden below 1024 px. |
| `ArchitectureDiagram` | restyled: rows by `layer`, nodes with label and sublabel, kind tint on the border only. |
| `Gallery` | layout `mosaic` added (first image 4 of 6 columns, two rows); `Lightbox` unchanged. |
| `PostRow`, `PostLead` | writing list; lead post in a `.card`. |
| `PaperRow` | year, title, authors (self in bold), venue, citations, DOI. |
| `ChannelList` | contact channels as rows (name, host path). |
| `CertRow`, `SkillGroup`, `PrincipleList` | About blocks. |
| `ContactPanel` | availability, email button, copy email (client, existing `click` sound not used on pages), location, channels. |
| `Closing` | Home end: availability statement as display text, email, About and CV actions. |
| `ConfidenceBadge`, `Chip`, `TechLogoRow`, `OrgLogo`, `Monogram` | kept, restyled to tokens. |
| `PodCard`, `TimelineItem`, `MetricTile`, `Section`, `PageHeader` | kept only where still used (Quick view); removed when unused. |

## 6. Page templates

**Home.** Hero grid: name (`display-xl`) and headline plus subheadline (lead) and bio in 8 columns; status `.card` in 4 columns aligned to the bottom (current role, location with timezone, availability, actions "See the work" and "Download CV"). Then: At a glance (`#stats`, ledger); Selected work (AI hero pods as lead + pair with covers, software hero pods as index rows, "All N projects"); Recent work (last 4 jobs or freelance entries as timeline rows, "Full journey"); Writing (3 latest posts, "All writing"); `#skills` and `#certifications` compact; Closing. The old Tower directory box and story/principles move to About (the 3D HUD covers floor navigation).

**Work (`/labs`).** Page intro with wing counts (AI, Software with their existing intros). Sticky filter bar. "Key projects": the 6 hero pods in an alternating 7/5 then 5/7 grid; pods without images lead with their first result as a number block. "All projects": featured then listed pods as `WorkRow`s. Filtering applies to both blocks; when nothing matches, an empty state with "Clear filters".

**Case study (`/labs/[slug]`).** Crumb "Work". Wing marker, tier, room id; title (`display-l`); tagline (lead). Fact row. Results ledger (`#results`, 4 columns, 2 on mobile). Body 8 columns + ToC 4 columns: Problem (lead size), What I did (numbered steps; the numbers are real sequence), Architecture (`#architecture`), Gallery (`#gallery`, mosaic), Tech stack (`#stack`, logo chips). Then "More from the {wing}": previous and next pods, plus the related career entry. JSON-LD unchanged.

**Journey.** Intro with year jump links. Sticky type filter. Years newest first: the year as a sticky `num` in 2 columns, rows in 10. Prologue entries keep the "Prologue" note. Workshop annex (`#workshop`): side projects as rows, public repos as rows with stars and language.

**Journey entry.** Same header grammar as the case study (crumb, type marker, `display-l` role, org with logo, period, confidence), summary as lead, highlights as a ruled list, stack chips, link to the case study, prev/next.

**Writing (`/library`).** Intro with section chips (counts). Blog (`#posts`): lead post card, then rows (date, title, excerpt, tags, language or "Medium"). Research (`#research`): citations and h-index with source and "as of" date, paper rows. Models and datasets (`#publications`), Talks (`#talks`).

**Blog post.** Crumb "Writing", date and languages, `display-l` title, `.prose-hq` at 68ch.

**About (`/contact`).** Title "About and contact"; story (first sentences as lead, rest as body) in 7 columns; `ContactPanel` in 4 (`#channels` inside). How I work (principles as ruled rows), Skills (groups with logo chips), Certifications (code, name, issuer, date, credential link), CV (`#cv`: the CV PDF download, CV page link).

**Quick view.** Same tokens: page intro, sticky glass ToC (existing ids), sections use `SectionSplit` and the new rows instead of card grids. **CV**: a download button and an inline preview of the owner's PDF (no print sheet; the PDF is not generated from the site).

**404.** `display-l` "Room not found", body, link home.

## 7. Floor locator, Explore in 3D, Back to 3D

- Each floor page shows its floor as a data marker above the h1 (`■ L3 · Labs`). It is wayfinding to the 3D tower, which is the site's premise, not a decorative kicker. It is the only label above a heading.
- **Back to 3D** keeps its behavior and owner (`ExperienceGate`): fixed bottom-right, solid cyan pill, `3` shortcut, first Tab stop in page view. Only its shadow becomes an offset shadow (`0 10px 30px -10px`). The footer reserves 112 px bottom padding so it never covers the last link.
- **Explore in 3D**: no extra in-content link. On the static tier the device cannot run the tower, so offering it would fail; in page view the fixed Back to 3D button is the single entry. The `hud.explore3d` string stays reserved.

## 8. States

- Filters with no match: the list area shows "No projects match these filters." and a "Clear filters" button; the result count reads "Showing 0 of 30" in a `role="status"` region.
- Pods without gallery images: no Gallery chapter; their feature shows a result block instead of a cover.
- Missing optional data (client, architecture, timeline ref, confidence) omits the row or chapter; no placeholders.
- Loading: pages are static; images use `loading="lazy"` with fixed aspect ratios so layout does not shift. The Room data fetch belongs to the HUD drawer, not to pages.
- Translation missing (blog): existing notice, restyled as a `.card`.

## 9. Accessibility

- Contrast: `ink-2` (#a1a1aa) and `ink-3` (#8b8b94) on void pass AA for body; accent text only on data labels (≥ 12 px, mono, all pass 4.5:1 on void).
- One h1 per page; section h2s labelled with `aria-labelledby`; lists are lists.
- Stretched links on rows and features: the title is the link; the row is clickable via `::after`, focus ring on the title.
- Filters are `button[aria-pressed]` and a labelled `select`; result count in `role="status"`.
- ToC uses `aria-current="true"` for the visible section.
- Touch targets ≥ 44 px; skip link stays first.
- `prefers-reduced-motion`: no image zoom on hover, no smooth scroll.
- axe (WCAG 2 AA) runs on every page template in e2e.

## 10. Motion

One authored moment: hovering a work feature scales the cover 1.5% and underlines the title; rows tint `surface` and color the title. No entrance animations.

## 11. Testing

- Vitest + Testing Library: `WorkIndex` filtering and URL params, `JourneyFilter`, `NavLink` active state, `CaseToc` fallback without IntersectionObserver.
- Unit: pure helpers (`filterPods`, `stackOptions`, `homeSelection`).
- Playwright: existing static route and anchor tests keep passing; new axe test per template; visual snapshots at 1440x900, 1024x1366 and 390x844 for Home, Work, Case study, Journey, Writing, About (static tier via `?tier=static`).

## 12. Out of scope

3D experience, HUD drawer and Rover Terminal styling (Sub-project B), boot cover and head script (Sub-project A), content and copy changes.
