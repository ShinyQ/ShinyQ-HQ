# AGENTS.md: conventions for ShinyQ HQ

Read this before changing anything. It applies to humans and AI agents in every build phase.

## Source of truth

- Design: `docs/superpowers/specs/2026-10-09-agent-hq-design.md` plus appendices `docs/superpowers/specs/agent-hq/01..08`. An appendix wins over the main spec for its topic.
- Owner content decisions C1 to C9 (appendix 07 section 7) override everything else about content.
- Phase plans live in `docs/superpowers/plans/`. Write one before starting a phase.

## Hard rules

- **No em dashes** (U+2014) anywhere: code, comments, copy, docs, commits, PR text. A unit test scans the repo. Use commas, colons, parentheses or "to".
- **Public repo.** Never commit private evidence, internal product codenames, private repository names, cloud resource names, phone numbers, addresses, ID numbers, money amounts, salary or review text, the Master's degree, 2026 hackathon entries or any photo. Client and freelance client names are allowed (C3, C8).
- **Content is data.** Pages, rooms, pods and missions are generated from `content/site-content.json`. Never hardcode career facts in components.
- **Bilingual.** Every user-facing content string is `{ en, id }`. Indonesian is natural and professional ("saya"), technical terms stay in English. UI strings live in `messages/en.json` and `messages/id.json` with identical keys.
- **Static export.** `output: "export"`: no server runtime, no middleware/proxy, no API routes, no `next/image` optimization. Every route must pre-render through `generateStaticParams` and set `dynamicParams = false` on dynamic segments.
- **Every route works without WebGL.** 3D (Phase 1+) mounts client-side on top of the HTML pages and must never replace their content.

## Folder layout

```
content/
  site-content.json             public dataset (validated by src/content/schema.ts)
  blog/<slug>.<locale>.mdx      blog posts, one file per language
  safety-blocklist.default.txt  committed generic blocklist
  .safety-blocklist.local.txt   PRIVATE, gitignored; real codenames and repo names
messages/{en,id}.json           UI strings (next-intl)
public/brand/                   committed brand assets (KAW monogram)
public/fonts/                   Inter + JetBrains Mono woff for in-world troika Text (OFL); jetbrains-mono-symbols-700 is the troika fallback (arrows, shapes) so nothing loads from a CDN
public/tech/                    tech logos (svg/webp, see its README for sources), resolved by src/content/tech.ts
public/logos/                   company and school logos (TimelineEntry.logo), 128 px webp
public/media/<pod-slug>/        pod gallery images: NN-name.webp (max 1600 wide) + NN-name.thumb.webp (480 wide)
public/_headers, _redirects     Cloudflare Pages headers (CSP, caching) and redirects (/cv.pdf)
scripts/
  build-cv.ts                   prints /{locale}/cv to out/cv/*.pdf after next build
  serve-static.ts               serves out/ like Cloudflare Pages, incl. simple _redirects (e2e, CV, Lighthouse)
  validate-fragment.ts          schema + safety check for content files
src/
  app/(root)/                   "/" language redirect (own root layout)
  app/[locale]/                 all localized routes (root layout with <html lang>)
  app/global-not-found.tsx      404.html
  app/sitemap.ts, robots.ts     static metadata routes (all locales, hreflang alternates)
  app/og/[...path]/route.tsx    build-time OG PNGs: /og/{locale}.png, /og/{locale}/{labs,blog}/{slug}.png
  app/data/[...path]/route.ts   build-time Glass Drawer content: /data/rooms/{locale}.json
  components/                   static-page UI (server components unless noted)
  components/page/              Page View building blocks: Layout (PageIntro, SectionSplit, SectionWide, Marker, StatLedger), Work, Case, Timeline, About; client islands WorkIndex, JourneyFilter, CaseToc, CopyEmail; urlState (query string as filter state)
  content/schema.ts             zod schemas, types via z.infer (appendix 06 + additions below)
  content/load.ts               getContent() and typed accessors
  content/selectors.ts          pure sorting and grouping helpers
  content/pageview.ts           pure Page View helpers (pod and timeline filters, URL params, nav matching), client-safe
  content/blog.ts               MDX discovery with translation fallback
  content/experience.ts         buildExperienceData(locale, floorNames): small payload for the 3D chunk (labPods for L3)
  content/tech.ts               getTechLogo(name) registry (aliases, text-only allowlist), client-safe
  content/media.ts              GalleryImage, toGalleryImages, coverImage, thumbSrc (client-safe)
  content/room-views/           RoomView contract (types.ts) and one drawer-content builder per floor
  content/safety.ts             blocklist loading and forbidden patterns
  i18n/                         next-intl routing, request config, navigation, assertLocale
  lib/                          format (Intl dates), accent class maps, gpu-tier, url-sync, viewport
  lib/boot-first.ts             game-first load: inline head script, shouldBootFirst, releaseBootCover
  lib/site.ts                   SITE_URL, pageMetadata, ogImagePath, beacon token
  lib/routes.ts                 allPagePaths() for the sitemap (keep in sync with generateStaticParams)
  lib/jsonld.ts                 schema.org Person, WebSite, CreativeWork (pods), BlogPosting (posts)
  lib/og.tsx, og-cards.ts       Neon Grid OG card renderer and the list of cards
  lib/audio/                    procedural Web Audio engine + useAudio hook (see its README)
  experience/                   3D experience (see "3D experience" below)
  experience/floors/career/     L2: pure layout.ts (buildCorridor, scrubTarget) plus R3F CareerRooms, YearGates, WorkshopAnnex
  experience/floors/labs/       L3: pure layout.ts, board.ts, hologramParts.ts plus R3F Atrium, Pods, PacketLanes, HologramStage
  experience/missions/          pure mission system: host.ts (MissionHost), rooms.ts, runner.ts, surprise.ts, staticHost.ts, bridge.ts and host3d.ts (3D wiring)
  hud/                          HUD over the canvas (profile card, elevator panel, controls, boot, joystick) plus RoverTerminal, CommandPalette, search, MissionHud, HudLaunchers, events, HologramOverlay
  hud/drawer/                   Glass Drawer: RoomDrawer (UI), DrawerHost (store, data, audio), bodies, layout, urlSync, data, ascii (README)
  store/useHQStore.ts           zustand store (appendix 06 section 2 plus documented additions)
tests/unit/                     Vitest: schema, selectors, format, safety, store, intents, navgrid, rover, rigs, url sync, missions, search, SEO, audio, doors, career layout, labs layout, room views, drawer layout and URL, ASCII, hologram
tests/hud/                      Vitest + Testing Library (jsdom per file): terminal, palette, MissionHud, RoomDrawer, L4/RF rooms
tests/content/                  Vitest: dataset, public safety, assets
e2e/                            Playwright: static routes, Page View (pageview.spec.ts: axe per template, filters, anchors, phone overflow), 3D experience (experience.spec.ts), Career Archive (career.spec.ts), Labs + drawer + hologram (labs.spec.ts), Library + Roof (library-roof.spec.ts), missions + axe, opt-in screenshots (screenshots.spec.ts, pageview-visual.spec.ts)
```

## Content access

- Import from `@/content/load`: `getContent`, `getProfile`, `getStats`, `getSkills`, `getCertifications`, `getAwards`, `getPods(wing?)` (hero, featured, listed, then `order`), `getPod(slug)`, `getTimeline()` (oldest first), `getTimelineEntry(slug)`, `getTimelineEntryById(id)`, `getYears()` (year rooms; pre-2019 entries fold into 2019 as the prologue), `getPosts()`, `getPost(slug)`, `getLibrary()`, `getRoof()`, `getContact()`, `getSideProjects()`, `getPublicRepos()`, `getMissions()`, `tr(text, locale)`.
- Types come from `@/content/schema` (`Pod`, `TimelineEntry`, `Mission`, `MissionStep`, `RoomId`, `Locale`, ...). Do not redeclare them.
- Tech logos: `getTechLogo(name)` from `@/content/tech` returns `{ src, label } | null` (normalizes case, versions like "Next.js 14", parentheticals, "A / B" compounds and kebab-case tags such as "azure-openai"). Unknown names render as text chips. Every stack and skill name in content must resolve or be listed in `TEXT_ONLY_TECH` (`tests/unit/tech.test.ts`). To add a logo, drop the file in `public/tech/`, add an entry in `tech.ts` and a line in `public/tech/README.md`. `ChipList items logos` and `TechLogoRow` (`src/components/Chip.tsx`) render them on static pages.
- Pod galleries: `pod.assets[0]` is the cover (pod cards, JSON-LD). Images live in `public/media/<pod-slug>/` with a `.thumb.webp` sibling, are webp without metadata and must be reviewed for personal data, internal codenames and client secrets before commit (`redacted: true` means reviewed and safe; a test enforces it and the 25 MB media budget). Name files by pod slug, never by codename. Render them with `<Gallery images={toGalleryImages(pod.assets, locale)} />` (`src/components/Gallery.tsx`, `layout="grid" | "strip"`), which opens `Lightbox` (arrows, Home/End, swipe, Esc, focus trap and restore; keys are captured so the rover and drawer ignore them).
- Room ids are `${FloorId}:${slug}` (`L3:voice-ai-contact-center`, `L2:jenius-2024`, `RF:contact`). `id === slug` for pods and timeline entries.
- Schema additions beyond appendix 06 (keep them documented here): `Confidence` also allows `"self-reported"` (C4); `Profile.monogram/subheadline/currentRole/timezone/story/principles`; `Certification.code`; `TimelineEntry.url/confidence`; `Pod.client`; `PostRef.url` (external posts such as Medium get no `/blog` page); `Contact.medium`; research metadata on `Publication` (`authors`, `publisher`, `date`, `doi`, `citations`, `summary`, `pdf`, `code`; all optional), `library.researchMetrics` (`source`, `citations`, `hIndex`, `asOf`: always show the date, e.g. "as of Oct 2026"), `Contact.googleScholar` and `Contact.ieeeXplore`; `SideProject.year`; top-level `awards[]`; mission steps `{ kind: "palette", filter }` and `{ kind: "surprise" }`.

## Missions and HUD

- The runner (`createMissionRunner`) is framework-free and talks to the world only through `MissionHost` (`src/experience/missions/host.ts`). The static tier uses `createStaticHost` (route navigation, one page load per mission); the 3D tier implements the same interface on top of the store. Never import React, the store or three.js into `experience/missions/`.
- Rooms come from `buildRoomCatalog` (`rooms.ts`). Room ids beyond pods, career entries and posts: `L1:profile`, `L1:stats`, `L1:skills`, `L1:certifications`, `L2:workshop`, `L4:research` (kind `research`: papers and the thesis, see `isResearch` in `content/selectors.ts`), `L4:publications` (the models shelf: models and datasets), `L4:talks`, `RF:contact`, `RF:cv`. Every room has a static `path` (open) and `floorPath` (drive).
- The layout builds a serializable `HudIndex` on the server (`src/hud/index-data.ts`) so zod and the dataset never ship to the client. HUD components get data through props.
- Open HUD overlays from anywhere with `openPalette(filter?)` / `openTerminal()` from `src/hud/events.ts` (window `hq:hud` events).
- localStorage keys owned by the HUD: `hq:terminal-seen` (first-visit auto-open, Lobby only), `hq:recent` (recent rooms on the static tier), `hq:visits` (alternates best-swe and best-ai). Tests and screenshots that must not see the auto-open terminal set `hq:terminal-seen`.

## i18n

- Locales `en` (default) and `id`, always prefixed. `/` is a static page that redirects using `localStorage["hq:locale"]`, then `navigator.language`.
- In server components call `assertLocale((await params).locale)` then `setRequestLocale(locale)`, and use `getTranslations({ locale, namespace })`.
- Use `Link` from `@/i18n/navigation` for internal links (it adds the locale prefix). Dates go through `src/lib/format.ts` (`formatYearMonth`, `formatPeriod`, `formatDate`); ranges are written "X to Y" / "X hingga Y", never with dashes.
- Metadata: `pageMetadata({ locale, path, title, description, type?, publishedTime?, tags?, image? })` from `src/lib/site.ts` adds canonical, `hreflang` alternates, Open Graph and Twitter cards. `image` defaults to `/og/{locale}.png`; use `ogImagePath(...)` for pod and post cards. A page that sets `openGraph` replaces the parent's, so always go through `pageMetadata`.
- New page routes must be added to `src/lib/routes.ts` (sitemap). New pods and hosted posts get OG cards and sitemap entries automatically.

## 3D experience (Phases 1 to 5a)

- `ExperienceGate({ data, startFloor?, startRoom? })` (client) runs on `/{locale}`, `/{locale}/journey` (`startFloor="L2"`), `/{locale}/journey/[slug]` (`startRoom="L2:slug"`), `/{locale}/labs` (`startFloor="L3"`), `/{locale}/labs/[slug]` (`startRoom="L3:slug"`), `/{locale}/library` (`startFloor="L4"`) and `/{locale}/contact` (`startFloor="RF"`); pages get `data` from `experienceDataFor(locale)` (`src/experience/gate-data.ts`). A start floor or room skips boot and intro, places the rover at the room's door (or the floor spawn) and opens the drawer; `?view=architecture` opens the hologram. It decides the tier (`src/lib/gpu-tier.ts`, `?tier=full|lite|static` override) once per page load, after commit and never during render (the WebGL probe takes seconds on software renderers and would block client navigation into gated routes), then lazy-loads `src/experience/Experience.tsx` with `next/dynamic` and portals it over the page. While it is open, `#site-shell` (header, main, footer in the locale layout) is `inert`. The HTML stays in the DOM for SEO and is the static tier.
- Game-first load: an inline head script (`bootFirstScript()` from `src/lib/boot-first.ts`, in the locale layout) sets `html[data-hq-boot]` before first paint on gated routes when WebGL2 exists, `?tier=static` is absent, `hq:view` is not `page`, Save-Data is off, the visitor is not bot-like (`isBotLike(navigator, search)`: crawler, preview and audit user agents, or `navigator.webdriver` without a `?tier=lite|full` override, which covers Lighthouse 12; the gate uses the same check and stays on the page, so these never load the 3D chunk) and this session has not already probed static (`sessionStorage["hq:probe"]`, written by the gate; `?tier=lite|full` overrides it). CSS then hides `#site-shell` behind the SSR `BootCover` (`src/components/BootCover.tsx`). The gate preloads the 3D chunk and calls `releaseBootCover("ready" | "page" | "static")` (first canvas frame via `Experience`'s `onFirstFrame`, page view, or static tier); an 8 s timeout reveals the page if nothing does. Right after first paint the script probes WebGL once (`window.__hqProbe`, reused by `readTierInputs`, so there is no second context) and releases the cover at once without WebGL2 or on a software renderer. `#site-shell` also stays `visibility: hidden` while `html[data-hq]` is set (tower open), so the page never paints under it and never becomes a late LCP. `BootOverlay` renders the same `BootCard`, so the handoff does not move. The script runs under the existing `script-src 'unsafe-inline'` CSP; if that is ever removed, add its sha256 to `public/_headers`. Keep the route regex in `shouldBootFirst` in sync with the routes that mount `ExperienceGate`.
- The 3D chunk gets its content as a serializable `ExperienceData` prop from the server page, so it never bundles `site-content.json` or zod. Add floor data there (L4 and RF: `library` and `roof` from `src/content/experience-floors.ts`), not by importing `@/content/load` in client code. `skills[].logos` carries the tech logo per item; the L1 skills wall draws them as one merged quad mesh over a runtime canvas atlas (`floors/lobby/LogoQuads.tsx`, pure layout in `logoAtlas.ts`), one draw call in total.
- Data flow: input sources (`input/useInputSources.ts`, HUD buttons, joystick) emit intents on the `intents` bus. `scene/Director.tsx` consumes them each frame and drives the elevator ride machine (`tower/elevator.ts`), the `RoverController` (`rover/controller.ts`, `nav/navgrid.ts`, `nav/collision.ts`) and the store. Per-frame pose lives in `rover/runtime.ts` (mutated in `useFrame`, never read in render). HUD and scene talk only through the store and intents.
- Pure modules (config, elevator, rigs, movement, faces, navgrid, collision, intents, url-sync, gpu-tier, viewport) must stay free of React and three side effects so Vitest can run them in node.
- Camera: `camera/orbit.ts` holds the orbit state (unbounded yaw, tilt limited to about ±9°, clamped zoom, eased steps, reset, wall auto-face via `VIEW_ZONES`). Add a floor's view zones there. `orbit` intents carry a `source`, so a floor can filter (for example L2 scrubbing on one-finger drags). Controls per device are in appendix 03 section 2.
- Floors above the rover render as ghosts each frame (`tower/FloorLevel.tsx`), because the follow camera sits higher than `FLOOR_GAP`. Only the current floor, the ride target and their neighbours mount content.
- `READY_FLOORS` in `src/experience/config.ts` lists floors with real 3D content (Phase 5a: `["L1", "L2", "L3", "L4", "RF"]`). URL sync writes floor routes only for ready floors; placeholders keep `/{locale}` and the HUD links to their HTML page. Add a floor there when its phase ships, and mount the gate on its route.
- `buildFloorLayouts(yearCount, extras: LayoutExtras = {})`: each floor phase adds its own optional input field to `LayoutExtras` (`types.ts`; Phase 4 adds `labs`, Phase 3 `career`) instead of a new positional parameter.
- L4 and RF coordinates live in pure modules: `floors/library/layout.ts` (`LIBRARY`, `spineSlots(n)`, `postStop(i, n)`, `LIBRARY_STOPS`, `LIBRARY_DOORS`, `libraryObstacles()`) and `floors/roof/layout.ts` (`ROOF`, `terminalSlots(n)`, `ROOF_STOPS`, `ROOF_DOORS`, `roofObstacles()`). They feed the navgrid, the door triggers, `roomTarget` and the R3F components, so scene and autopilot never disagree. Deep links spawn in front of the content (`spawn` in `buildFloorLayouts`). Blog spines follow `getPosts()` order (newest first, alternating rows), the room catalog's order; spines have no door trigger (a 1.8 u pitch along the lane would open a post every few steps), so `roomTarget(room, id, layouts, years, rooms)` finds a post's stop from the catalog. In-world room objects use `roomHandlers(room)` (`floors/interact.ts`), which calls `goToRoom`.
- Door triggers are generic: fill `FloorLayout.doors` (`{ room, at, size? }`, 2 x 2 zone centered on `at`). The Director (`nav/doors.ts`) fires `{ type: "open", room }` once the rover stands in a zone or drives in manually (not while following a path through it), latched until it leaves, and handles it with `openRoom`. `roomTarget` (host3d) drives to `door.at` for any room with a door. The check is swept from the previous frame's position (`doorAlong`), so a slow frame (up to 2 u of travel) cannot skip a zone.
- L2 Career Archive (`floors/career/layout.ts`, Phase 3): one 14 u segment per year from `getYears()` starting at x = -20, rooms alternating sides (`z = -10` first) and stacking outward every 9 u, award rooms 6 x 6 (trophy plinth with one cup per placing that year), all other rooms 9 x 8. Rooms are open bays: only the 2 x 2 pedestal blocks the rover, so stacked rows are reached across the inner bay. The Workshop annex (20 x 16) follows the last segment, with the repo wall on the north side and the window to L3 at the slab end. The 3D chunk gets `ExperienceData.career` (`buildCareerData`); drawer content comes from `room-views/career.ts`. Repeated room geometry is instanced, room labels more than 30 u away along x are hidden, and the corridor mounts only while the rover is on L2 or riding there, which keeps L2 under 150 draw calls and the Lobby intro light.
- Rail floors: `FloorLayout.scrubStops` are the x stops a horizontal swipe (`scrub` intent) drives to (`scrubTarget`: one stop per 30% of the screen width, swipe left goes forward in time). The rail camera steers along the corridor axes and slides in z by `|z| - 4` once the rover leaves the corridor, so side rooms stay in frame.
- Content of floors below the rover is not drawn unless the elevator is moving (the opaque slab above hides it).
- Store additions beyond appendix 06: `ride` (elevator ride state), `device` (`viewport`, `camera`, `coarse`), `reducedMotion`, `notice`, `readme` (README view in the drawer); actions `openRoom(room, tab?)`, `setDrawerTab`, `toggleReadme(on?)`, `openHologram()` / `closeHologram()` (phase `hologram`, which also blocks the elevator). Persisted keys are `visited`, `firstVisit`, `locale` (key `hq:v1`); `sound` mirrors the audio engine (`@/lib/audio`, `localStorage["hq:sound"]`), which is the source of truth. The Director plays `ding` on elevator arrival, `beep` when the rover opens the terminal, and feeds `setRumble(speed)` every frame. `sessionStorage` keys: `hq:view` (page view), `hq:resume` (language switch resumes the floor without boot or intro).
- Deviations from the spec (kept deliberately): the tier gate is a local heuristic instead of `detect-gpu` (no runtime CDN fetch; software renderers such as SwiftShader map to `static` like detect-gpu tier 0, so headless browsers and Lighthouse see the HTML page unless `?tier=` is set); L3 keeps the global shaft and puts the atrium in front of its door, with the wings as mirror halls running east (Software north, AI south; appendix 01 section 4 is updated); the rover spawns turned toward the camera so its face greets the visitor.
- Playwright sets `navigator.webdriver`, so e2e tests that need the 3D tier pass `?tier=lite|full`; tests of real auto-detection call `asHumanBrowser(page)` (`e2e/hq.ts`).
- `window.__hq` exposes `{ store, rover }` for Playwright. The rover hides during the hologram view; pod labels too.

## Glass Drawer (shared room panel, Phase 4)

- Every room on every floor renders through one drawer. It shows `store.activeRoom` while the phase is `room` and closes with `closeRoom()`. Open rooms with `store.getState().openRoom(id, tab?)` (or the `open` intent, a door trigger, or a mission `open` step: `host3d.openRoom` opens the drawer on READY floors and navigates to the room page elsewhere).
- Content is a serializable, locale-resolved `RoomView` (`src/content/room-views/types.ts`): header (`code`, `title`, `subtitle`, `meta`, `badges`, `accent`), `variant` (`"tabs"` for pods with Overview/Architecture/Results/Stack, `"single"` for everything else), `sections` (body, bullets, link items, chips), `metrics` (value, label, context), `architecture`, `stack` (`{ name, logo? }`, logos from `getTechLogo` via `stackItems`), `gallery` (`RoomImage` = `GalleryImage`, rendered with `Gallery` strip and `Lightbox`), section `chipLogos` (aligned with `chips`; skills and post tags), link item `logo` (Roof channels, research profiles, models), header `logo` (career rooms: org logo; career `gallery` holds the linked pod's images or one cover per pod), `page` (Full case study / Open page), `external`, `link` (room on another floor, run with `goToRoom` from `missions/bridge.ts`), `hologram`, `prev`/`next`.
- One builder per floor in `src/content/room-views/` (`lobby`, `career`, `labs`, `library`, `roof`), aggregated by `buildRoomViews(locale)` and exported at build time to `/data/rooms/{locale}.json`. The drawer fetches it once (`loadRoomViews`), so pages do not grow. A floor phase owns its builder file; a test checks that every catalog room has a view.
- Custom single-pane bodies: register `({ view, locale }) => JSX` per room kind in `src/hud/drawer/bodies.tsx`. Rooms without one use the generic renderer (metrics, sections, stack, gallery). `roof` uses `RoofBody` (email mailto plus copy with `click`, channels, per-locale CV downloads with `click`); `research` uses `ResearchBody`, fed by the optional `RoomView.research` (`items` with authors, venue, DOI, summary and dated citations; `self`, the owner's name to highlight; `profiles`; `metrics`); posts use the generic renderer with a "Read post" footer action (Medium posts: "Read the post" in a new tab).
- Layout: side panel (420 px) on desktop and landscape tablets at least 900 px wide, else a bottom sheet with snap points at 45% and 92% (`hud/drawer/layout.ts`). The follow camera shifts the rover 15% left or 20% up with `setViewOffset` while it is open.
- Keyboard: focus moves in and is trapped; Esc closes; `t` toggles the README terminal view (`hud/drawer/ascii.ts` renders the architecture with box-drawing characters). The drawer is `aria-modal`, so world keys pause while it is open; clicking the floor closes it and drives.
- URL (`hud/drawer/urlSync.ts`, mounted by Experience): opening pushes the room URL, switching rooms and the hologram replace it (`?view=architecture`), closing replaces it with the floor URL, back/forward reopen or close rooms. Other query params (`?tier=`) are kept. Rooms without their own route (`hasPage`, from Experience: L4 shelves and Medium posts) keep the floor URL and are remembered in the history entry.
- Hologram view (hero pods with at least 3 nodes): `HologramStage` draws the diagram on the pod's stage by `layer`/`row`, packets on edges at 2 u/s, async edges dashed, a veil dims the world, and `camera/focus.ts` flies the camera in (`hologramPose`). `HologramOverlay` shows the result cards, prev/next hero pods (arrows, buttons, horizontal swipe) and Esc back to the drawer. E2E tests run WebGL on SwiftShader (`playwright.config.ts` launch args).

## Page View (static pages)

- Design: `docs/superpowers/specs/2026-10-10-pageview-revamp-design.md` (editorial Neon Grid); mockups in `docs/design/pageview/`.
- Nav labels: Work (`/labs`, L3), Journey (`/journey`, L2), Writing (`/library`, L4), About (`/contact`, RF); Quick view and CV live in the footer, the Home hero and About. URLs and anchors never change (the room catalog and missions link to them).
- Layout: `pv-wrap` container (1240 px), 12 columns from `lg`, a 4-column sticky sidehead plus 8 columns of content (`SectionSplit`), ruled rows (`pv-rows`) instead of card grids. Floor and wing colors only mark wayfinding (`Marker`, the active nav rule); never fill surfaces with them.
- Filters (`WorkIndex`, `JourneyFilter`) are client islands over server-rendered rows: rows carry `data-pod`/`data-wing`/`data-stack` (`podAttrs`) or `data-entry`/`data-type`/`data-year`, the islands only toggle `hidden`, and the query string (`?wing=`, `?stack=`, `?type=`) is the state, so links and reloads keep the view and `?tier=` survives. Without JS everything stays visible.
- Back to 3D stays owned by `ExperienceGate`; the footer keeps 112 px of bottom padding for it.

## Styling

- Neon Grid tokens from appendix 05 live in `src/app/globals.css` (`@theme`): `void`, `glass`, `glass-border`, `ink`, `ink-2`, `ink-3`, accents `cyan violet pink green amber blue white`. `ink-3` is `#8b8b94` (not `#71717a`) to keep AA contrast on the void.
- Utility classes: `.glass`, `.label` (mono uppercase metadata), `.link`, `.prose-hq` (MDX). Accent classes must come from the static maps in `src/lib/accent.ts` so Tailwind can see them.
- HUD tokens shared with the 3D overlay (prototype values): `.glass` (blur 18 px, drops the blur on coarse pointers), `.eyebrow`, `.chip` (+ `.chip-count`, `aria-pressed` inverts), `.card`; colors `line`, `line-2`, `surface`, `surface-2`.
- Page View layer: `src/app/pageview.css` (`pv-` classes: type scale `pv-d-xl pv-d-l pv-h2 pv-h3 pv-lead pv-body pv-small pv-data pv-num`, `pv-mark`, `pv-btn`, `pv-go`, `pv-rows`, `pv-stretch`, header, filter bar, ToC). Grid spans use Tailwind utilities with the default `md`/`lg` breakpoints.
- Fonts: Inter (body), JetBrains Mono (data only) and Archivo (`--font-display`, variable `wdth` axis for condensed titles and numerals) via `next/font/google` (`src/app/fonts.ts`). Touch targets at least 44 px (`min-h-11`).

## Public-safety lint

- `tests/content/safety.test.ts` scans `site-content.json`, MDX and messages with the merged blocklist (committed default + `content/.safety-blocklist.local.txt` + `SAFETY_BLOCKLIST` env var, which CI reads from a repository secret) and forbidden patterns (em dash, money, phone numbers, Azure hostnames, Master's degree).
- Blocklist format: one term per line or comma separated, `#` comments. Plain terms match case-insensitively on word boundaries; `/regex/` terms are case-sensitive.
- Validate content edits quickly with `bun run validate:content`.

## Workflow

- Package manager: Bun. Scripts: `dev`, `build` (export + CV PDFs), `build:web`, `typecheck` (`next typegen && tsc`), `lint`, `test`, `e2e`, `screenshots`, `serve`, `validate:content`.
- Before pushing: `bun run typecheck && bun run lint && bun run test && bun run build && bun run e2e`.
- Commit in logical steps with conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `ci:`, `chore:`). Prefer the `rtk` git wrapper. One PR per phase; do not merge without the owner.
- CI (`.github/workflows/ci.yml`) runs check, build + e2e, a non-blocking Lighthouse CI job (`lighthouserc.json`, appendix 08 budgets), and a Cloudflare Pages preview (project `vars.CF_PREVIEW_PROJECT`, default `shinyq-hq`) only when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist.
- Production (`.github/workflows/deploy.yml`) deploys `out/` on push to `main` only when both secrets and the `CF_PAGES_PROJECT` variable are set. Owner setup: `docs/deploy.md`.
- Build-time env: `NEXT_PUBLIC_SITE_URL` (canonical origin, default `https://kurniadi.pages.dev`, from `vars.SITE_URL`) and `NEXT_PUBLIC_CF_BEACON_TOKEN` (Cloudflare Web Analytics, omitted when unset, from `vars.CF_BEACON_TOKEN`).
- Audio: use `audio` / `useAudio` from `@/lib/audio`; never create another `AudioContext`. Sounds are synthesized, so there are no audio files to add.

## Next.js version notes

This repo uses Next.js 16, which differs from older training data (async `params`, global `PageProps`/`LayoutProps` types from `next typegen`, `proxy` instead of `middleware`, `global-not-found`). Read the bundled docs in `node_modules/next/dist/docs/` before using an unfamiliar API. `agentRules: false` in `next.config.ts` stops `next dev` from injecting its own block into this file.
