# Page View

The static HTML pages (the Classic site): naming, navigation, layout, filters and the landing hero. Index: [AGENTS.md](../../AGENTS.md).

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
  - Where: the case study header (`/labs/<slug>`), posts (`/blog/<slug>`, after the tags) and the room drawer's overflow menu.
  - Classic: `${SITE_URL}${path}?view=classic${hash}`. 3D: `${SITE_URL}${threeDPath(path)}`; gated routes keep their path, posts open `/{locale}/library`, everything else the Lobby. Other query parameters are dropped.
  - `SITE_URL` is `https://kurniadi.pages.dev` unless `NEXT_PUBLIC_SITE_URL` is set at build.
  - A 3D link has no parameter, so a recipient whose remembered choice is Classic gets the Classic site (their "Open links in" setting applies); only `?view=` links override it.
- **SEO:** canonical, `og:url` and the sitemap never carry `view`; the parameter only selects what a visitor sees.
- **Preference API** for a settings entry "Open links in": `getViewPreference`, `setViewPreference`, `subscribeViewPreference` in `view-pref.ts` (localStorage only). It decides new tabs and visits, not the current tab. The settings entry binds to this API.
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

## Layout

- `pv-wrap` container (1240 px), 12 columns from `lg`.
- A 4-column sticky sidehead plus 8 columns of content (`SectionSplit`).
- Ruled rows (`pv-rows`) instead of card grids.
- Floor and wing colors only mark wayfinding (`Marker`, the active nav rule); never fill surfaces with them.

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

### Hero

- `HomeHero` (`src/components/page/Hero.tsx`) starts with the owner portrait and the name.
- Portrait: `Portrait` (`src/components/page/Portrait.tsx`):
  - round, cyan ring and violet glow, 72/96/128 px
  - `loading="lazy"` with `fetchpriority="low"`, so it never loads under the boot cover (`content-visibility: hidden` keeps lazy images idle) and never becomes the LCP element
  - About shows it at 80/112 px beside its title
- Name: no eyebrow, `.hx-name` up to 112 px.
- Then the headline and the motto (`profile.subheadline`).
- Then it composes:
  - the CSS-only backdrop
  - `EnterHqButton` (client): a real link to `/{locale}?tier=lite&view=3d` (an explicit 3D choice for the plain-link path) that sends `enterHq()` once the gate's tier is known; shown only under `html[data-hq-3d]`
  - `AskHeroBar` (visible "Ask AI about my work" label) across the full width; no illustration beside the name (owner decision)
  - the `StatTicker` band

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
  - screenshot, three filmstrip slots, text, then the live link and key result pinned to the bottom
- Never stagger or span cards (owner decision).
- `/labs` Key projects use the same grid.

### Other key projects

- Other key projects follow as full-width `WorkRow`s.
- "More key projects" lists `moreKeyProjects` (`src/content/pageview.ts`): key projects (hero with a gallery, `isKeyProject`) outside Selected work.
- Projects without screenshots show `ProjectPlaceholder` (rover glyph, initials, wing tint, decorative):
  - on `/labs`, Quick view and the filmstrip
  - in `WorkFeature` and `WorkRow` as the cover

### Landing styles

- Styles live in `src/app/landing.css` (`hx-` classes).
- Animate only `transform` and `opacity`, starting after 0.5 s.
- Stop under reduced motion (the ticker then wraps, no scroll region).
- Hold still under automation and for crawlers (`html[data-hq-still]`).
- Never animate the `h1` (LCP).
- Mockup and captures: `docs/design/landing/` (`bun docs/design/landing/gen-landing.ts`; built captures in `built/` from `bun run screenshots:pages`).
