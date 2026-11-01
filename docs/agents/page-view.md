# Page View

The static HTML pages (the Classic site): naming, navigation, layout, filters, the landing hero, the 404 and empty states. Index: [AGENTS.md](../../AGENTS.md).

## Naming (owner decision)

- User-facing name: **Classic site** (ID **Situs klasik**) wherever a visitor reads it:
  - the 3D top bar button and its tooltip, the boot card link, the static-tier notice and the screen-reader canvas description
  - keys `hud.pageView`, `hud.pageViewHint`, `hud.staticNotice`, `hud.canvasDescription`
- The way back stays **Back to 3D** (ID **Kembali ke 3D**, `hud.back3d`); `hud.explore3d` stays reserved.
- The public parameter is `?view=classic` (`?view=page` stays accepted as an alias and is normalized to `?view=classic`).
- "Page View" remains the internal name. These never change: code, the `pv-` classes, `data-testid="page-view"` and the stored value `hq:view=page`.
- Playwright finds the button with `{ name: "Classic site" }`.

## Shareable links

Pure helpers in `src/lib/view-param.ts`; storage and the in-place URL rewrite in `src/lib/view-pref.ts`; the inline head script (see [3d-experience.md](3d-experience.md#head-script)) inlines `decideView` and `normalizeViewSearch`. Values: `page` (Classic) and `3d`; storage key `hq:view`.

- **Precedence**, decided on every load:
  1. An explicit `?view=` (`classic` or `page` is Classic, `3d` or `architecture` is 3D).
  2. This tab's choice (`sessionStorage["hq:view"]`).
  3. The remembered preference (`localStorage["hq:view"]`).
  4. 3D.
- The decided view is pinned into `sessionStorage["hq:view"]` on every load, so a tab keeps its view when the preference changes elsewhere.
- **URL rules** (`normalizeViewSearch`):
  - Classic shows `?view=classic` (other parameters kept, `view=classic` last; the `page` alias is rewritten).
  - 3D drops `view=classic|page|3d` and keeps `view=architecture`.
  - The URL is rewritten with `replaceState`, never a navigation.
- `ViewParamSync` (`src/components/ViewParamSync.tsx`, in the locale layout):
  - After every client navigation it restores `?view=classic` on the URL while the tab is Classic. Its effect also depends on the rendered route segments (`useSelectedLayoutSegments`), because a client navigation can land on the URL a 3D room already pushed.
  - It keeps every internal page `<a href>` in step (`viewHref`, `src/lib/view-links.ts`; a `MutationObserver` runs only on the Classic site), so copy link, new tab and middle click carry the view. The language switch carries it too.
  - It skips `[data-hq-page-link]`, `[data-hq-view]` and `[download]`, files (paths with an extension) and other origins.
  - The boot card's Classic site link is `?view=classic` (`data-hq-page-link`); Enter the 3D HQ has `data-hq-view="3d"`.
- **Choosing a view:** `chooseView` (Classic site, Back to 3D) writes the tab and the remembered preference, normalizes the URL and fires the view events. `setTabView` (the drawer's Open page) writes the tab only.
- **Drawer page links** (Read case study, Read post, Open page) point at the Classic page with `?view=classic` and carry `data-hq-view="page"`. The target never equals the URL the room pushed (a same-URL navigation would keep the 3D route mounted), and new tabs open Classic too.
- **Share buttons** (`ShareLinks`, `src/components/ShareLinks.tsx`): "Copy Classic link" and "Copy 3D link" (copied state "Link copied", announced politely).
  - Clipboard rejection or an unavailable API shows a localized polite status and a named, focusable read-only field with the exact captured canonical URL. Menu recovery stays in the failed action's `li`; page recovery stays outside the buttons. It never takes focus automatically. The latest attempt alone updates feedback, failure persists, and only success has a cleaned-up two-second reset timer. The Classic About email action follows the same contract with the raw email address.
  - Where: the case study header (`/labs/<slug>`), posts (`/blog/<slug>`, after the tags) and the room drawer's overflow menu.
  - Classic: `${SITE_URL}${path}?view=classic${hash}`. 3D: `${SITE_URL}${threeDPath(path)}`; gated routes keep their path, posts open `/{locale}/library`, everything else the Lobby. Other query parameters are dropped.
  - `SITE_URL` is `https://kurniadi.pages.dev` unless `NEXT_PUBLIC_SITE_URL` is set at build.
  - A 3D link has no parameter, so a recipient whose remembered choice is Classic gets the Classic site (their "Default HQ view" setting applies); only `?view=` links override it.
- **SEO:** canonical, `og:url` and the sitemap never carry `view`; the parameter only selects what a visitor sees.
- **Preference API** for "Default HQ view": `getViewPreference`, `setViewPreference`, `subscribeViewPreference` in `view-pref.ts` (localStorage only). It decides new tabs and visits, not the current tab. An explicit link view takes priority.
- Tests: `e2e/view-links.spec.ts`, `tests/unit` for the helpers.

## Design

- System: the Hallmark redesign (decision 2026-10-27), locked in [`DESIGN.md`](../../DESIGN.md): the Neon Grid kept
  as the brand, genre atmospheric, posture Restrained. Earlier spec (history):
  `docs/superpowers/specs/2026-10-10-pageview-revamp-design.md`; mockups: `docs/design/pageview/`.
- CSS layer, tokens and type scale: [styling-and-i18n.md](styling-and-i18n.md#page-view-layer).
- The Hallmark stamp (shape, hero posture per route, nav, footer, waivers) heads `src/app/globals.css`; keep it true
  when a page's composition changes.
- Never on Classic surfaces: an eyebrow or tracked mono capitals over a heading, a middle-dot-joined meta string, an
  arrow glued to a link, a decorative dot or square marker, a card inside a card, glass. Labels are `pv-meta`.

## Navigation

| Label | Route | Floor |
|---|---|---|
| Work | `/labs` | L3 |
| Journey | `/journey` | L2 |
| Writing | `/library` | L4 |
| About | `/contact` | RF |

- The header is a search-led bar: the brand (the rover mark `hq-header-mark` beside "ShinyQ HQ", `meta.siteName`,
  linking home; never the owner's name, owner decision 2026-10-27), the four sections with their floor codes, then
  the Rover menu and the visible ⌘K search pill (`HudLaunchers`, `pv-tool`) and the language switch. The current
  section carries a bottom rule in its floor colour.
- The footer is only links and the copyright line, no name (owner decision 2026-10-27): Pages (the sections, Quick
  view, How this site was built and the CV dialog, `cv-open-footer`), Elsewhere (the email and the profiles), then
  "© {year} ShinyQ HQ" under a hairline.
- Quick view and CV live in the footer, the Home hero and About.
- How this site was built (`/build`, key `nav.build`) is a footer link and a link under About's story; it is not in the primary nav. It is a Classic page without a 3D counterpart yet, with its own share card and TechArticle JSON-LD.
- URLs and anchors never change (the room catalog and missions link to them).
- Back to 3D stays owned by `ExperienceGate`; the footer keeps 112 px of bottom padding for it.
- Link prefetch (owner decision): header, nav (bar and mobile tabs), crumb, hero and section "more" links use `QuietLink` (`src/components/QuietLink.tsx`).
  - It renders `prefetch={false}`, so nothing prefetches in the viewport, and calls `router.prefetch(href)` (next-intl's `useRouter`, locale prefixed) once on `pointerenter`, `focus` or `touchstart`: the route's RSC payload and chunks arrive before the click.
  - No intent prefetch while `useQuietNav()` is true (boot cover or 3D tower showing). A link that passes its own `prefetch` keeps Next's behavior; object hrefs get no intent prefetch.
  - Card and footer links still use the plain `Link` (viewport prefetch while scrolling). Test: `tests/unit/quiet-link.test.tsx`.

## Layout

- `pv-wrap` container: 1440 px with a 64 px gutter (24 px under 60rem, 16 px under 40rem), so the measure is 1312 px
  and holds at 1920; 12 columns from `lg`.
- Section heads: `SectionWide` (the head block above a full-width body, the link on the right) or `SectionSplit` (a
  4-column sticky sidehead beside 8 columns). Section gaps come from `pv-sec`, `pv-sec-s` and `pv-sec-l`.
- Ruled rows (`pv-rows`) instead of card grids for indexes and ledgers; counts and results are ruled facts too (the
  Work wing counts, the case study Results ledger, the home stats ledger), never tiles.
- Restraint:
  - Dates and periods use `pv-date` (tabular mono); labels, captions and meta use `pv-meta` (body face, sentence
    case). `pv-data` (mono capitals) is the 3D and dialog label, never a Classic label.
  - A project's headline result is a `pv-result` block (value over label on a neutral hairline).
  - Filter and contents bars (`pv-filters`) are flat: hairline and a near-opaque fill, no `.glass`, shadow or blur.
  - `pv-lead` keeps a measure near 52 characters in wide places (page intros); the hero's opt out.
  - Inside a reading column (`pv-col`, the 8-column main column of a case study or a Journey entry) a lead runs the
    column's full width, so its edge lines up with the ruled lists below; ledger and list text there is not capped.
- Floor and wing colors only mark wayfinding (the active nav rule); never fill surfaces with them.

### Case study (`/labs/<slug>`)

- The header opens with the metric strip (`MetricStrip`, `src/components/MetricStrip.tsx`, server-rendered, no client JS) under the tagline: up to 3 headline results (`headlineResults`), a big value (`pv-num`) and its label, as a list named "Key results" (`labs.keyResults`). 3 across from `md`, stacked rows below.
- No confidence marker: `Result.confidence` is never rendered (decision 2026-10-11, confirmed 2026-10-17).
- A "Results" chapter (`MetricLedger`, every result with how it was measured) opens the main column only when it adds something: more results than the strip, or any `context`. The TOC lists it only then. Without it, the strip's section carries the `#results` anchor (the drawer's Results tab links there).
- **Story mode** (owner decision 2026-10-25): a pod with `story` (every `STORY_SLUGS` pod, [content.md](content.md#pod)) reads as a story instead.
  - Chapters in order: Situation (`#problem`, `story.situation`), Role and key decisions (`#approach`, `DecisionList`), Results (`#results`, always the full `MetricLedger`), then Lesson (`#lesson`, only with `story.lesson`), then the usual architecture, gallery, code and stack chapters.
  - The ids `problem` and `approach` stay, so 3D drawer tabs, missions and old links keep working; only the labels change (`labs.situation`, `labs.decisions`, `labs.results`, `labs.lesson`). The strip never carries `#results` in story mode.
  - `DecisionList` (`src/components/page/Story.tsx`) numbers the decisions like `StepList`: the title, then "Why" (`labs.why`) and the reason. `Lesson` is a quote with a neutral hairline rule (never a colored stripe).
  - `pod.problem` and `pod.approach` still feed the 3D drawer and Ask; the Classic page shows them only for pods without a story.
- After "More {wing} projects" the page ends with the [closing section](#closing-section), plus "Ask Rover about this project".

### Closing section

- `ClosingCta` (`src/components/page/ClosingCta.tsx`, server markup, `data-testid="closing-cta"`, `#contact`): the availability line (`roof.availability`) as the heading, the email (`mailto:`), then About and contact and View CV as ghost buttons, then any page action passed as children (last, so a late island never moves the others).
- Where (owner decision 2026-11-01, so a reader who is convinced never hunts for the footer): the landing's last section, every case study after "More {wing} projects", and `/cv` under the cover (`cv={false}`: the cover has View CV already).
- Case studies add `AskAboutButton` (`src/components/page/AskAboutButton.tsx`, client): "Ask Rover about this project" (`case.askAboutLabel`) opens the Ask dock with `case.askAbout` and the project title, entry `case`. Like the hero bar it shows until Ask the HQ is known to be off. The question always takes Ask's default route ([ask.md](ask.md#scope-routing), `namesProject`).
- One class set for every page, so it adds no CSS; case study HTML grows by the section only.
- Tests: `e2e/pageview.spec.ts` ("closing section"), `tests/ask/case-question.test.ts`.

### Time Travel (`/journey`)

- Placement: the `#time-travel` section sits between the intro and the year filter (`src/components/time-travel/`). It is Classic only: nothing in the 3D `Experience.tsx` closure imports it.
- Server-rendered SVG skyline, one building per stop (`pre-2019`, then 2019 to 2026), each kind's blocks one `<path>`, plus the 9 year panels (2026 visible, the rest `hidden`) and the small `TimeTravelControls` island (range and Play). The year ticks are an `aria-hidden` HTML row under the SVG (the prologue tick is "<2019", `timeTravel.prologueShort`).
- DOM contract the island and the tests rely on: `data-tt-panel` (one per stop, in order), `data-tt-stop={index}` (the building `<g>`), `data-tt-outline={index}` (its outline `<rect>`) and `data-tt-link={index}` (the `<a>` around a building). Each building also has a transparent hit-area `<rect>` so the whole slot is clickable. The panels carry no other attribute for tests: read them by order or text.
- The panel tally reads "+{count} new" / "+{count} baru" when a stop added items; an `in-progress` certification is not counted (its `issued` is only the planned month). Highlight links read "role, organization" for an entry, the title for a pod, publication or certification, and a stop's `highlights[].label` (`{ en, id }`) replaces either; no two highlights share link text (`tests/content/time-travel.test.ts`).
- The announcement is a separate `sr-only` `aria-live="polite"` paragraph owned by the island, not a panel heading.
- The labels come as props from the server-only `timeTravel` namespace, which is in neither namespace list. The island imports locale values only from `@/content/locales`.
- Colors use the `ACCENT_TEXT` classes with `currentColor`, so the section adds almost no CSS.
- Motion follows `html[data-motion]` and `html[data-hq-still]`; the building rise and the panel fade use WAAPI on `transform` and `opacity` only. The URL never changes while scrubbing.
- Play restarts from the prologue when the current stop is the last one; otherwise it resumes from the held stop. Any pointer press or slider key (arrows, Home, End, Page Up and Down, even where the value cannot change) and any plain building click stops it. A building click with a modifier key or a non-primary button keeps the link behavior (no select, no halt).
- Without JS, building links go to `#yYYYY` (the prologue to `#y2019`) and the controls do not render.
- Budgets: 0 3D bytes, CSS +34 B gzip, island about 727 B gzip. The journey HTML grew about 8.6 KB gzip (`/en/journey` 47,564 to 56,157 B, `/id/journey` 48,428 to 57,266 B, cap 83,968 B) because the RSC flight payload carries the section a second time; the parent session accepted it (option A, 2026-10-25), and no cap rises. What it buys: every stop's caption, tally and highlights ship in the server HTML (crawlers, reader modes and no-JS link targets). Without JS the visitor sees now (2026) plus building links to every year's rows below; the other 8 panels carry `hidden`. `/en/quick` is unchanged.
- Tests: `e2e/time-travel.spec.ts`, `tests/hud/TimeTravelControls.test.tsx`, `tests/unit/time-travel.test.ts`, `tests/content/time-travel.test.ts`.

### Other Classic pages (Hallmark redesign, part 3)

- Page intros (`PageIntro`): no floor eyebrow; the title on seven columns, an aside on four.
- Journey entries (`/journey/<slug>`) and posts (`/blog/<slug>`) are Long Documents: a breadcrumb (`case.breadcrumb`,
  Journey / the entry's type) instead of the eyebrow, the 3D room (`L2:<slug>`, `case.room`) in the facts row, chapter
  gaps at the section scale, Previous and Next without arrows. Post prose holds about 70 characters a line
  (`.prose-hq > p` capped at 36rem); the date is a `<time>` under the title.
- `/cv`: the title, the intro, then page 1 beside "2 pages, PDF" and the two actions at the top of their column, so View
  CV is in the 1280 x 800 first screen (`cv-card`, `cv-read`, `cv-download`, `cv-cover-image` kept), then the
  [closing section](#closing-section) without View CV.
- `/library` research: the paper title is text with its button laid over it (named by the title, so it never wraps
  inside a control label); Preview (`paper-cite`) and Read the paper sit below it.
- The Time Travel skyline is named as a chart (`tt-chart` on its SVG).
- Guide cards and repo rows join their meta with commas, never middle dots.
- Quick view (`/quick`, owner decision 2026-11-01) is a short brief, every list capped with a link to its full page
  (`SectionSplit` `more`): the profile carries the contact line (`quick-contact`: availability and the email) and View
  CV (`cv-open-quick`); the first 3 projects of each wing (`/labs?wing=`), the 6 latest roles (`/journey`), 3 side
  projects (`/journey#workshop`), the certifications summary (`limit`, its own link to About), the 3 latest posts
  (`/library`). Skills, stats and awards stay whole (awards are listed nowhere else). Every ToC anchor stays. Test:
  `e2e/pageview.spec.ts` ("Quick view brief").

## Filters

- Client islands over server-rendered rows: `WorkIndex`, `JourneyFilter`, and `TopicFilter` on `/library` with `?topic=`.
- Row attributes:
  - pods: `data-pod`/`data-wing`/`data-stack` (`podAttrs`)
  - timeline entries: `data-entry`/`data-type`/`data-year`
  - Writing: `data-topic-row`/`data-topics` from `topicsOfItem`; a section with no visible row hides
- The islands only toggle `hidden`.
- The query string (`?wing=`, `?stack=`, `?type=`) is the state, so links and reloads keep the view and `?tier=` survives.
- Without JS everything stays visible.

## Perspectives (owner decision)

- No Page View section: About and Quick view never render them (no `#perspectives` section, ToC chip or `perspectives-<id>` anchor).
- They are Ask knowledge only: see "Content access" in [content.md](content.md) and "Ask the HQ" in [ask.md](ask.md).
- `e2e/pageview.spec.ts` scans `out/` for `perspectiveFingerprints` of every entry.

## Landing (home hero)

- Section order after the hero (`src/app/[locale]/page.tsx`, the recruiter path, owner decision 2026-10-25): Selected
  work (`#work`), the intro (`#intro`: bio, status and the `#stats` ledger), Journey, Certifications and Skills (one
  `paper-2` band, both anchors), the Live Agent Office (`#office`, lazy, [office.md](office.md#classic-card-and-ask)),
  Writing, Contact (the [closing section](#closing-section)).

### Hero

- `HomeHero` (`src/components/page/Hero.tsx`), Hallmark posture Ledge: it fills the first screen, the static Neon Grid
  is the field above and the content rests at its base, so `#work` (and its lazy screenshots) starts below the fold.
- First the owner portrait beside the name (`.pv-d-xl`, no eyebrow).
- Portrait: `Portrait` (`src/components/page/Portrait.tsx`):
  - round, cyan ring with one quiet cyan glow, 72/96/128 px
  - `loading="lazy"` with `fetchpriority="low"`, so it never loads under the boot cover (`content-visibility: hidden` keeps lazy images idle) and never becomes the LCP element
  - About shows it at 80/112 px beside its title
- Then a 7/5 split: the headline and the motto (`profile.subheadline`), the proof strip and the actions on the left,
  the Ask bar (`AskHeroBar`, visible "Ask AI about my work" label, outlined send button) on the right.
- The proof strip (`ProofStrip`, `src/components/page/ProofStrip.tsx`, `data-testid="hero-proof"`, owner decision 2026-10-25):
  - the three stats listed in `profile.heroProof` (`heroProofStats`, `src/content/pageview.ts`, in that order), each with its `data-stat` id;
  - each value in the display face over its `short` label, parted by vertical hairlines, no box;
  - a list named "Key numbers" (`home.proofLabel`), server-rendered, no motion;
  - the stats ledger skips these ids, so no number shows twice.
- The actions: View CV (`CvButton`, `cv-open-hero`) is the one primary button, solid cyan (full width on phones), then
  See the work (`/labs`), then Enter the 3D HQ (ghost buttons). The About intro's CV button is `cv-open-intro`.
- Under the actions, the contact line (`data-testid="hero-contact"`, owner decision 2026-11-01): the availability
  (`roof.availability`) and the email as a `mailto:` link, in `pv-small`, so a recruiter can write from the first
  screen (1440 x 900 and 390 x 844, `e2e/pageview.spec.ts`). Server markup, no new CSS.
- `EnterHqButton` (client): a real link to `/{locale}?tier=lite&view=3d` (an explicit 3D choice for the plain-link
  path) that sends `enterHq()` once the gate's tier is known; shown only under `html[data-hq-3d]`.
- The backdrop is the body's static Neon Grid plus one fixed indigo bloom (`hx-bloom`, the `--color-bloom` vignette
  token); nothing in the hero moves.
- First paint waits for the whole hero: `<link rel="expect" href="#hero-end" blocking="render">` (hoisted into the
  head by React) targets `#hero-end`, an empty hidden span, the hero's last node. Chrome unblocks on the target's
  start tag. Without it a busy device can paint a half-parsed hero and shift it.

### Stats ledger

- `#stats` (`StatTicker`, `src/components/page/StatTicker.tsx`, the L1:stats room): a still, ruled ledger in two
  columns under "In short", headed "At a glance" (`home.statsTitle`), the stats from `DYNAMIC_STATS` marked Live, and
  the visits item (`TickerVisits`) appended.
- It replaced the marquee (decision 2026-10-27): nothing on the Classic site moves on its own, so there is no pause
  control, no duplicate track and no date stamp.

### Selected work (featured projects)

- `pickFeaturedPods(getPods())` (owner decision):
  - the pods with `Pod.selected`, rank 1 first
  - then the first other pods with a gallery, in `orderPods` order
  - independent of `tier`, so a hero such as AI Fraud Document Review stays a key project with its hologram without a landing slot
- Rendered by `FeaturedProject` (`src/components/page/Featured.tsx`) as a Feature Stack (decision 2026-10-27, it
  replaced the 3/2/1 card grid): one project a row (`ul.hx-stack`, `data-testid="featured-grid"`), parted by a
  hairline:
  - from 1024 px the text holds sticky on six columns beside the screenshots on six (640 px, so a 1440 px capture stays sharp at 2x); below, the text comes first
  - the text: the title (the row's link), the headline result (`pod.results[0]` as a `pv-result` in the display face,
    `data-testid="feature-result"`; recruiters scan results first), the tagline, the facts (wing, period, client) as a
    `dl`, on `/labs` the stack logos, and the live link
  - the screenshots: the cover (also a hidden link to the case study, since the sticky column holds the title's
    stretched link), three filmstrip slots and the screenshot count as a caption
- `/labs` Key projects use the same rows.

### Other key projects

- Other key projects follow as full-width `WorkRow`s.
- "More key projects" lists `moreKeyProjects` (`src/content/pageview.ts`): key projects (hero with a gallery, `isKeyProject`) outside Selected work.
- Projects without screenshots show `ProjectPlaceholder` (rover glyph, initials, wing tint, decorative):
  - on `/labs`, Quick view and the filmstrip
  - in `WorkFeature` and `WorkRow` as the cover

### Live Agent Office card

- `OfficeSection` (`src/components/office/OfficeSection.tsx`, server) renders `#office` with its labels resolved on the server (`officeCardLabels`: `office.classic` never reaches the client messages).
- `OfficeLazy` loads the `OfficePanel` chunk once the section is within a screen of the viewport (an `IntersectionObserver` with a `100%` root margin, like the Visits section), so neither the panel nor its polling runs on first load or under the 3D tower. Until then a static loading line and note hold the card's height (`OFFICE_RESERVE`); a failed chunk shows the offline line.
- `OfficeShell` hides the whole section when the office is switched off (the disabled body).
- Data, polling and privacy: [office.md](office.md#classic-card-and-ask); `e2e/office-classic.spec.ts`.

### Landing styles

- Styles live in `src/app/landing.css` (`hx-` classes).
- Nothing animates: no loops, no entrance; never animate the `h1` (LCP).
- Mockup and captures: `docs/design/landing/` (history); Hallmark before and after captures: `.hallmark/` (git-ignored).

## Not found (404)

- `src/app/global-not-found.tsx` (owner decision 2026-10-25): "Rover took a wrong turn", in English with one
  Indonesian line (`lang="id"`), because the bad URL may carry no locale. Strings: the `notFound` namespace, read
  straight from `messages/*.json`; `robots` is `noindex, follow`.
- Hallmark posture Corridor: the rover, the status code as a large muted numeral (aria-hidden, in place of the old
  "404 · Off the map" eyebrow; `notFound.kicker` stays in the messages), the title, the body and the Indonesian line.
- Three ways out in a `nav` named "Ways back" (`notFound.waysBack`): View the CV first (primary, `/en/cv`,
  `not-found-cv`), See the work (`/en/labs`, `not-found-work`), and Home with English and Bahasa Indonesia links.
- "Did you mean": `DidYouMean` (`src/components/DidYouMean.tsx`, a client island) fetches
  `/data/routes/index.json` after paint and shows `suggestRoute(location.pathname, routes)` as a link
  (`data-testid="did-you-mean"`), or nothing.
  - The index is every page of the export in both locales with its title (`buildRouteIndex`,
    `src/lib/route-index.ts`, served by `src/app/data/[...path]/route.ts`), so it follows `allPagePaths` by itself.
  - `suggestRoute` (`src/lib/did-you-mean.ts`): null for an existing page; a missing or wrong-case locale is
    corrected (English when missing); else the closest last segment in the same section by edit distance, within
    `max(2, a third of its length)`.
  - The suggestion sits in a `role="status"` live region that is always rendered with a reserved line (`min-h-6`), so
    the late answer shifts nothing.
- Works without JavaScript; only the suggestion needs it.
- Styles: utility classes and the shared `pv-` classes, plus `src/app/not-found.module.css` for the rover's glow and
  wobble only (nothing 404-only goes into `globals.css`). The module hand-copies the two selectors of the
  `motion-reduce` variant (`:root[data-motion="reduced"]` and the `prefers-reduced-motion` media query under
  `:root:not([data-motion="full"])`) because `@reference` / `@variant` does not resolve in a CSS module; keep them in
  step with `globals.css`.
- Tests: `e2e/not-found.spec.ts`, `tests/unit/did-you-mean.test.ts`, `tests/unit/route-index.test.ts`.

## Empty and offline states

- Every empty, failed or offline state names a next step (a filter to clear, a page to open, when to check back),
  never only "unavailable": for example the Work filter's no match, the room drawer's load failure, Ask offline, the
  visit stats and the Live Agent Office when offline. Voice: "Errors and refusals" in
  [content-style-and-safety.md](content-style-and-safety.md#bilingual-editorial-voice).
