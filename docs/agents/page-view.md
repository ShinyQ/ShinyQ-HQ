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

- Spec: `docs/superpowers/specs/2026-10-10-pageview-revamp-design.md` (editorial Neon Grid).
- Mockups: `docs/design/pageview/`.
- CSS layer and type scale: [styling-and-i18n.md](styling-and-i18n.md#page-view-layer).

## Navigation

| Label | Route | Floor |
|---|---|---|
| Work | `/labs` | L3 |
| Journey | `/journey` | L2 |
| Writing | `/library` | L4 |
| About | `/contact` | RF |

- Quick view and CV live in the footer, the Home hero and About.
- How this site was built (`/build`, key `nav.build`) is a footer link and a link under About's story; it is not in the primary nav. It is a Classic page without a 3D counterpart yet, with its own share card and TechArticle JSON-LD.
- URLs and anchors never change (the room catalog and missions link to them).
- Back to 3D stays owned by `ExperienceGate`; the footer keeps 112 px of bottom padding for it.
- Link prefetch (owner decision): header, nav (bar and mobile tabs), crumb, hero and section "more" links use `QuietLink` (`src/components/QuietLink.tsx`).
  - It renders `prefetch={false}`, so nothing prefetches in the viewport, and calls `router.prefetch(href)` (next-intl's `useRouter`, locale prefixed) once on `pointerenter`, `focus` or `touchstart`: the route's RSC payload and chunks arrive before the click.
  - No intent prefetch while `useQuietNav()` is true (boot cover or 3D tower showing). A link that passes its own `prefetch` keeps Next's behavior; object hrefs get no intent prefetch.
  - Card and footer links still use the plain `Link` (viewport prefetch while scrolling). Test: `tests/unit/quiet-link.test.tsx`.

## Layout

- `pv-wrap` container (1240 px), 12 columns from `lg`.
- A 4-column sticky sidehead plus 8 columns of content (`SectionSplit`).
- Ruled rows (`pv-rows`) instead of card grids; counts and results are ruled facts too (the Work wing counts, the
  case study Results ledger), never tiles.
- Restraint (design refinement, spec `docs/superpowers/specs/2026-10-19-classic-design-refinement.md`):
  - Dates and periods use `pv-date` (sentence case, tabular mono); `pv-data` capitals are for labels only.
  - Project cards (landing Selected work, Work Key projects) share `pv-h3-card` titles and `pv-card-text`; a card's
    headline result is a `pv-result` block (value over label on a neutral hairline) right under the title on both
    (recruiters scan results first). Project list rows (`WorkRow`) keep theirs in its own column.
  - Filter and contents bars (`pv-filters`) are flat: hairline and a near-opaque fill, no `.glass`, shadow or blur.
  - `pv-lead` keeps a measure near 66 characters (`max-width: 30em`) in wide places (page intros); the hero's motto opts out.
  - Inside a reading column (`pv-col`, the 8-column main column of a case study or a Journey entry) a lead runs the column's full width, so its edge lines up with the ruled lists below; ledger and list text there is not capped either.
- Floor and wing colors only mark wayfinding (`Marker`, the active nav rule); never fill surfaces with them.

### Case study (`/labs/<slug>`)

- The header opens with the metric strip (`MetricStrip`, `src/components/MetricStrip.tsx`, server-rendered, no client JS) under the tagline: up to 3 headline results (`headlineResults`), a big value (`pv-num`) and its label, as a list named "Key results" (`labs.keyResults`). 3 across from `md`, stacked rows below.
- No confidence marker: `Result.confidence` is never rendered (decision 2026-10-11, confirmed 2026-10-17).
- A "Results" chapter (`MetricLedger`, every result with how it was measured) opens the main column only when it adds something: more results than the strip, or any `context`. The TOC lists it only then. Without it, the strip's section carries the `#results` anchor (the drawer's Results tab links there).
- **Story mode** (owner decision 2026-10-25): a pod with `story` (every `STORY_SLUGS` pod, [content.md](content.md#pod)) reads as a story instead.
  - Chapters in order: Situation (`#problem`, `story.situation`), Role and key decisions (`#approach`, `DecisionList`), Results (`#results`, always the full `MetricLedger`), then Lesson (`#lesson`, only with `story.lesson`), then the usual architecture, gallery, code and stack chapters.
  - The ids `problem` and `approach` stay, so 3D drawer tabs, missions and old links keep working; only the labels change (`labs.situation`, `labs.decisions`, `labs.results`, `labs.lesson`). The strip never carries `#results` in story mode.
  - `DecisionList` (`src/components/page/Story.tsx`) numbers the decisions like `StepList`: the title, then "Why" (`labs.why`) and the reason. `Lesson` is a quote with a neutral hairline rule (never a colored stripe).
  - `pod.problem` and `pod.approach` still feed the 3D drawer and Ask; the Classic page shows them only for pods without a story.
- A next-step row (`data-testid="case-next-step"`, heading `case.nextStep`, "Hiring for work like this?") closes every
  case study before the related projects: View CV (`CvButton`, `cv-open-case`, `pv-btn-primary`) and About and
  contact (`home.aboutContact`, a ghost link to `/contact`).

### Time Travel (`/journey`)

- Placement: the `#time-travel` section sits between the intro and the year filter (`src/components/time-travel/`). It is Classic only: nothing in the 3D `Experience.tsx` closure imports it.
- Server-rendered SVG skyline, one building per stop (`pre-2019`, then 2019 to 2026), each kind's blocks one `<path>`, plus the 9 year panels (2026 visible, the rest `hidden`) and the small `TimeTravelControls` island (range and Play). The year ticks are an `aria-hidden` HTML row under the SVG (the prologue tick is "<2019", `timeTravel.prologueShort`).
- DOM contract the island and the tests rely on: `data-tt-panel` (one per stop, in order), `data-tt-stop={index}` (the building `<g>`), `data-tt-outline={index}` (its outline `<rect>`) and `data-tt-link={index}` (the `<a>` around a building). Each building also has a transparent hit-area `<rect>` so the whole slot is clickable. The panels carry no other attribute for tests: read them by order or text.
- The panel tally reads "+{count} new" / "+{count} baru" when a stop added items. Highlight links read "role, organization" for an entry, the title for a pod, publication or certification, and a stop's `highlights[].label` (`{ en, id }`) replaces either; no two highlights share link text (`tests/content/time-travel.test.ts`).
- The announcement is a separate `sr-only` `aria-live="polite"` paragraph owned by the island, not a panel heading.
- The labels come as props from the server-only `timeTravel` namespace, which is in neither namespace list. The island imports locale values only from `@/content/locales`.
- Colors use the `ACCENT_TEXT` classes with `currentColor`, so the section adds almost no CSS.
- Motion follows `html[data-motion]` and `html[data-hq-still]`; the building rise and the panel fade use WAAPI on `transform` and `opacity` only. The URL never changes while scrubbing.
- Play restarts from the prologue when the current stop is the last one; otherwise it resumes from the held stop. Any pointer press or slider key (arrows, Home, End, Page Up and Down, even where the value cannot change) and any plain building click stops it. A building click with a modifier key or a non-primary button keeps the link behavior (no select, no halt).
- Without JS, building links go to `#yYYYY` (the prologue to `#y2019`) and the controls do not render.
- Budgets: 0 3D bytes, CSS +34 B gzip, island about 727 B gzip. The journey HTML grew about 8.6 KB gzip (`/en/journey` 47,564 to 56,157 B, `/id/journey` 48,428 to 57,266 B, cap 83,968 B) because the RSC flight payload carries the section a second time; the parent session accepted it (option A, 2026-10-25), and no cap rises. What it buys: every stop's caption, tally and highlights ship in the server HTML (crawlers, reader modes and no-JS link targets). Without JS the visitor sees now (2026) plus building links to every year's rows below; the other 8 panels carry `hidden`. `/en/quick` is unchanged.
- Tests: `e2e/time-travel.spec.ts`, `tests/hud/TimeTravelControls.test.tsx`, `tests/unit/time-travel.test.ts`, `tests/content/time-travel.test.ts`.

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
  work (`#work`), the intro (`#intro`: bio and status), Journey, Certifications, Skills, the Live Agent Office
  (`#office`, lazy, [office.md](office.md#classic-card-and-ask)), Writing, Contact.

### Hero

- `HomeHero` (`src/components/page/Hero.tsx`) starts with the owner portrait and the name.
- Portrait: `Portrait` (`src/components/page/Portrait.tsx`):
  - round, cyan ring with one quiet cyan glow, 72/96/128 px
  - `loading="lazy"` with `fetchpriority="low"`, so it never loads under the boot cover (`content-visibility: hidden` keeps lazy images idle) and never becomes the LCP element
  - About shows it at 80/112 px beside its title
- Name: no eyebrow, `.hx-name` up to 112 px, `translate="no"` (so is the header name).
- Then the headline (`profile.headline`, the role) in the display face (`pv-h3 pv-h3-l`) and the motto
  (`profile.subheadline`) in `pv-lead`. View CV stays inside the first screen on a 375x667 phone
  (`e2e/pageview.spec.ts`).
- Then the proof strip (`ProofStrip`, `src/components/page/ProofStrip.tsx`, `data-testid="hero-proof"`, owner decision 2026-10-25, style B):
  - the three stats listed in `profile.heroProof` (`heroProofStats`, `src/content/pageview.ts`, in that order), each with its `data-stat` id;
  - one quiet bordered row (hairline dividers, `bg-surface`), the value in the display face (`pv-num`) beside the stat's `short` label; on phones three equal cells with the value above the label;
  - a list named "Key numbers" (`home.proofLabel`), server-rendered, no motion;
  - the ticker skips these ids, so no number shows twice in the first screen.
- Then the actions: View CV (`CvButton`, `cv-open-hero`) is the one primary button (full width on phones), then See the work (`/labs`), then Enter the 3D HQ (ghost buttons). The About intro's CV button is `cv-open-intro`.
- Then it composes:
  - the CSS-only backdrop: a slow two-tone glow and a low, faint Neon Grid floor (no data packets, no glow on the name)
  - `EnterHqButton` (client): a real link to `/{locale}?tier=lite&view=3d` (an explicit 3D choice for the plain-link path) that sends `enterHq()` once the gate's tier is known; shown only under `html[data-hq-3d]`
  - `AskHeroBar` (visible "Ask AI about my work" label) across the full width; no illustration beside the name (owner decision)
  - the `StatTicker` band
- First paint waits for the whole hero: `<link rel="expect" href="#hero-end" blocking="render">` (hoisted into the head by React) targets `#hero-end`, an empty hidden span after the ticker. Chrome unblocks on the target's start tag, so the target is the hero's last node. Without it a busy device can paint a half-parsed hero, and the ticker arriving grows `.hx`, which moves the percentage-sized backdrop (glow, ground) and the centered column: a layout shift.

### Stat ticker

- `#stats`: a plain marquee with live stats from `DYNAMIC_STATS` marked.
- No "Updated" stamp and no "Pause motion" switch (owner decision); hover or focus holds it.
- From sm the ticker bar keeps the floating "Ask AI" and "Back to 3D" columns free.
- On phones the hero fills the first screen and the ticker starts below it.

### Selected work (featured projects)

- `pickFeaturedPods(getPods())` (owner decision):
  - the pods with `Pod.selected`, rank 1 first
  - then the first other pods with a gallery, in `orderPods` order
  - independent of `tier`, so a hero such as AI Fraud Document Review stays a key project with its hologram without a landing slot
- Rendered by `FeaturedProject` (`src/components/page/Featured.tsx`) as equal-height cards in one grid:
  - 3 columns from 1024 px, 2 from 768 px, 1 on phones
  - screenshot, three filmstrip slots, wing, period and client, the title, the headline result right under the title
    (`pod.results[0]` as a `pv-result`, `data-testid="feature-result"`; recruiters scan results first), the tagline,
    then the live link pinned to the bottom
- Never stagger or span cards (owner decision).
- `/labs` Key projects use the same grid with one card shape, `WorkFeature` (`src/components/page/Work.tsx`): cover
  (or placeholder), wing, period and client, the title, `pod.results[0]` as a `pv-result` under the title
  (`feature-result`, like the landing cards), the tagline, then the live link and the stack logos (`TechLogoRow`, up
  to 6, only with a cover) at the foot.

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
- Animate only `transform` and `opacity`, starting after 0.5 s.
- Stop under reduced motion (the ticker then wraps, no scroll region).
- Hold still under automation and for crawlers (`html[data-hq-still]`).
- Never animate the `h1` (LCP).
- Mockup and captures: `docs/design/landing/` (`bun docs/design/landing/gen-landing.ts`; built captures in `built/` from `bun run screenshots:pages`).

## CV page (`/cv`)

- `CvCover` (`src/components/cv/CvCover.tsx`): below `md` the actions (View CV, Download PDF) come first, then
  page 1; from `md` the page image and the actions sit side by side (`e2e/pageview.spec.ts` checks both actions in
  the first screen at 390x844). Everything else about the CV: [content.md](content.md#cv).

## Not found (404)

- `src/app/global-not-found.tsx` (owner decision 2026-10-25): "Rover took a wrong turn", in English with one
  Indonesian line (`lang="id"`), because the bad URL may carry no locale. Strings: the `notFound` namespace, read
  straight from `messages/*.json`; `robots` is `noindex, follow`.
- Three ways out in a `nav` named "Ways back" (`notFound.waysBack`): View the CV first (primary, `/en/cv`,
  `not-found-cv`), See the work (`/en/labs`, `not-found-work`), and Home with English and Bahasa Indonesia links.
  - The Home box (`not-found-home`) is a plain bordered box, not a button (it holds two links); each link is a 44 px
    target (`min-h-11`).
  - `viewport.themeColor` is `#05050c`.
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
