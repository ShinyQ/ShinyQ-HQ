# Folder layout

Where things live in the repository: one entry per path with a short description. Index: [AGENTS.md](../../AGENTS.md).

Paths are relative to the repository root. Three paths are not in a fresh checkout on purpose (all gitignored): `content/.safety-blocklist.local.txt` (private, kept by the owner), `functions/_generated/` (written by the build) and `.study-guides/` (prepared study guide PDFs, written by `scripts/study-guides.ts`; never committed).

## content/

- `content/site-content.json`: public dataset (validated by `src/content/schema.ts`).
- `content/ask/suggestions.json`: curated Ask the HQ question pills (EN/ID, topics, tags, follow-ups). See "Ask the HQ" in [ask.md](ask.md).
- `content/build-story.json`: the build story (EN/ID) behind the `/build` page; read by `src/content/build-story.ts`. See "Build story" in [content.md](content.md).
- `content/ask/site-build.json`: how ShinyQ HQ itself was built (EN/ID), Ask knowledge only; it points to the `/build` page. See "Ask the HQ" in [ask.md](ask.md).
- `content/perspectives.json`: Kurniadi's professional Q&A (EN/ID), Ask knowledge only once approved (no page). See "Content access" in [content.md](content.md).
- `content/study-guides.json`: the certification study guides (EN/ID; human fields by hand, `pages`, `bytes`, `version` and `cover` by `scripts/study-guides.ts`); the PDFs live in the private R2 bucket `hq-study-guides`. See "Study guides" in [content.md](content.md#study-guides).
- `content/blog/<slug>.<locale>.mdx`: blog posts, one file per language.
- `content/blog/diagrams.json`: post-local architecture diagrams for `<Architecture diagram=... />` (post slug, then diagram id, then the pod `architecture` shape).
- `content/safety-blocklist.default.txt`: committed blocklist: client company names (C3), personal data, Azure resource names.
- `content/safety-allowlist.txt`: product names the lint must never flag (removed from the merged blocklist).
- `content/.safety-blocklist.local.txt`: PRIVATE, gitignored; private repo and cloud resource names.
- `content/generated/dynamic-facts.json`: weekly live facts (numbers, dates, booleans, IDs only), written by `scripts/refresh-facts.ts`.
- `content/generated/build-facts.json`: the build page's measured numbers (git, tests, CI jobs, budgets), written by `scripts/build-facts.ts` (CI and deploy builds refresh it).
- `content/generated/cv-pages.json`: CV page image manifest (sizes, PDF sha256), written by `scripts/cv-pages.ts`.
- `content/generated/paper-pages.json`: paper PDF page image manifest (sizes, PDF sha256), written by `scripts/paper-pages.ts`.

## functions/, wrangler.toml and workers/

- `functions/api/ask.ts`: Ask the HQ Pages Function (POST /api/ask).
- `functions/api/rum.ts`: anonymous performance beacon (POST /api/rum to Analytics Engine perf_events; `functions/_lib/rum.ts`).
- `functions/api/visit.ts`, `functions/api/stats.ts`: public visit stats.
  - Beacon: POST /api/visit to visit_events (`functions/_lib/visit.ts`).
  - Snapshot: GET /api/stats from KV STATS_KV (`functions/_lib/stats.ts`).
- `functions/api/office/` (`index.ts`, `beat.ts`, `github.ts`): Agent Office routes (GET /api/office, POST beats and
  webhooks) forwarding to the hq-office Worker through the service binding OFFICE (`functions/_lib/office.ts`).
- `functions/api/guides/[slug].ts`: GET and HEAD /api/guides/<slug>, a study guide PDF from R2 `GUIDES` with byte ranges, ETag and versioned caching (`functions/_lib/guides.ts`).
- `functions/_lib/`: its pure modules: pipeline, checks, limits, security, prompt (PROMPT_VERSION), retrieval, the stored pack index (`pack-index.ts`) and the pack source (`pack-source.ts`: memory, KV, pin, fallback).
- `functions/_generated/`: gitignored, from `scripts/build-knowledge.ts`: `pack.json` (the stored knowledge pack, uploaded to KV, never bundled), `fallback.json` (bundled fallback pack), `pack-meta.json` (the bundle's pin) and `safety.json`.
- `wrangler.toml`: Pages bindings and vars for /api/ask, /api/rum, /api/visit, /api/stats and /api/guides (source of truth once deployed; no secrets).
- `workers/stats/`: hq-stats Cron Worker (own wrangler.toml, scheduled only): daily public visit stats rollup into KV STATS_KV. See "Public visit stats" in [stats.md](stats.md).
- `workers/office/`: hq-office Worker (own wrangler.toml, no route) and its Durable Object `Office`: the Agent Office
  state. See [office.md](office.md).

## messages/

- `messages/{en,id}.json`: UI strings (next-intl).

## public/

- `public/brand/`: committed brand assets.
  - The rover brand mark (owner decision): `rover-mark.svg` tile, `-glyph`, `-mono`, `rover-lockup{,-light}.svg`; written by `bun scripts/brand-marks.ts` from `src/lib/brand-mark.ts` (see its README).
  - The owner portrait: 160, 320, 640 px square WebP, `src/lib/brand-photo.ts`; HUD profile card, L1 Highlights Hall, and the landing hero and About through `Portrait`.
- `public/fonts/3d/`: in-world troika fonts.
  - Subset WOFF cuts under content-hashed names (`bun scripts/troika-fonts.ts` from `src/assets/fonts/troika/`, manifest `src/experience/troika-fonts.json`).
  - The symbols cut is the troika fallback (arrows, shapes), so nothing loads from a CDN.
  - LICENSE files stay in `public/fonts/`.
- `public/tech/`: tech logos (svg/webp, see its README for sources), resolved by `src/content/tech.ts`.
- `public/atlas/`: the L1 wall logo atlas, `logos.<hash>.webp` (quantized, lossless WebP, content-hashed), written with its client manifest `src/experience/logo-atlas.ts` (the hashed file name) and the build-side `scripts/logo-atlas.lock.json` by `bun run logo:atlas`, committed.
- `public/logos/`: company and school logos (TimelineEntry.logo), 128 px webp.
- `public/media/<pod-slug>/`: pod gallery images: NN-name.webp (max 1600 wide) + NN-name.thumb.webp (480 wide) + NN-name.w1200.webp (1200 wide, `scripts/media-sizes.ts`).
- `public/media/production/`: the masked Grafana probe dashboard of "How I run AI in production" (same three sizes as the pod galleries; `scripts/media-sizes.ts` covers it).
- `public/cv/`: the owner's CV PDF, committed as-is (one file for both locales, never generated).
- `public/cv/pages/`: CV page images for the in-site viewer (1600, 1200 and 800 px lossless webp), output of `bun run cv:pages`, committed.
- `public/papers/`: self-hosted paper PDFs and their page images, output of `bun run paper:pages`, committed.
  - `{file}.pdf`: redacted or authors' manuscript (see "Content access" in [content.md](content.md)).
  - `{file}/{file}-N.webp`: page images, 1400 px.
- `public/study-guides/`: page 1 covers of the study guides (`<slug>.webp`, 480 px wide), output of `bun scripts/study-guides.ts prepare`, committed (the PDFs never are).
- `public/floors/`: elevator picker thumbnails (320 x 180 webp, one per floor), output of `bun run floor:thumbs`, committed.
- `public/og-assets/`: share card inputs, output of `bun run og:stills`, committed (the build never needs WebGL).
  - One 1200x630 still per floor (floor-{L1,L2,L3,L4,RF}.jpg).
  - The owner's photo (400 px PNG).
- `public/_headers`, `public/_redirects`: Cloudflare Pages headers (CSP, caching, same-origin framing for /cv/*) and redirects (old CV paths).

## tools/

- `tools/office-relay/`: the Agent Office relay (Bun CLI) and its installer for the GitHub Copilot, Claude Code and
  Codex hooks; runs on the owner's machine, never on the site. See [office.md](office.md#relay).

## scripts/

### Build and post-build

- `scripts/serve-static.ts`: serves out/ like Cloudflare Pages, incl. simple _redirects (e2e, Lighthouse).
- `scripts/defer-scripts.ts`: post-build (part of `build`): swaps the Next.js chunk tags in out/**/*.html for one loader that requests them after first contentful paint (LCP).
- `scripts/root-redirect.ts`: post-build (part of `build`): copies the `/` language redirect (`#hq-root-redirect`) to the top of <head> in out/index.html, so it runs before the stylesheet (`__hqRedirect` guard).
- `scripts/check-client-chunks.ts`: post-build (part of `build`): fails when zod (`_zod`), `readFileSync` or `site-content` appears in out/_next/static/chunks, or when a chunk any exported page loads carries a floor layout (a view zone id per layout module, `FLOOR_LAYOUT_MARKERS`).
- `scripts/csp-hashes.ts`: post-build (last step of `build`): adds a per-page script policy meta tag (sha256 of every inline script, no `'unsafe-inline'`) to out/**/*.html and fails on any problem.
- `scripts/csp-policy.ts`: its pure rules (`inlineScripts`, `pagePolicy`, `addScriptPolicy`, `exportPolicyProblems`), shared with scan-export.ts, deploy-smoke.ts, the unit tests and Playwright.
- `scripts/build-knowledge.ts`: Ask the HQ knowledge pack (part of `build`).
- `scripts/ask-pack.ts`: publishes the knowledge pack to Workers KV and flips, pins or rolls back its pointer (deploy.yml, rollback.yml; runbook section 17).
- `scripts/build-facts.ts`: `--write` refreshes `content/generated/build-facts.json` (needs full git history).

### Fonts, brand and content

- `scripts/subset-fonts.sh`: subsets the axis-narrowed page fonts to the used characters and OpenType features (fonttools); `tests/content/fonts.test.ts` checks coverage.
- `scripts/troika-fonts.ts`, `scripts/troika-glyphs.ts`: subset the in-world fonts (fonttools) to the characters 3D text uses; `tests/content/troika-fonts.test.ts` checks coverage.
- `scripts/logo-atlas.ts`: draws every L1 wall logo into one quantized, lossless WebP atlas with headless Chromium (`bun run logo:atlas`); `--check` (part of `build`) and `tests/unit/logo-atlas.test.ts` fail when it is stale.
- `scripts/validate-fragment.ts`: schema + safety check for content files.
- `scripts/docs-index.ts`: prints the owner decisions log (`docs/decisions/`) and the plans table (each plan's `Status:` line) at read time; nothing it prints is committed.
- `scripts/brand-marks.ts`: writes the rover brand mark files (public/brand/, src/app/icon.svg, apple-icon.png, favicon.ico) from `src/lib/brand-mark.ts`; the lockup wordmark is outlined by brand-wordmark.py (fonttools).
- `scripts/title-case.ts`: lists content titles not in Title Case; `--write` fixes site-content.json and the MDX frontmatter.
- `scripts/pdf-pages.ts`: shared pdftoppm/cwebp helpers for cv-pages.ts and paper-pages.ts.
- `scripts/cv-pages.ts`: `cv:pages`: renders the CV PDF to page webps + content/generated/cv-pages.json (needs poppler and webp locally).
- `scripts/paper-pages.ts`: `paper:pages`: checks each paper PDF's text for personal data (PERSONAL_DATA_PATTERNS) and blocklisted names, then renders page webps + content/generated/paper-pages.json.
- `scripts/study-guides.ts`: `prepare` (safety scan, PDF metadata, object streams, version, cover), `upload` (wrangler R2 put into `hq-study-guides`) and `check` for the study guide PDFs; runbook [../study-guides-runbook.md](../study-guides-runbook.md).
- `scripts/floor-thumbs.ts`: `floor:thumbs` step 2: converts the "floor thumbnail" captures (e2e/screenshots.spec.ts) into public/floors/*.webp (needs webp).

### E2E planning and perf reports

- `scripts/ci-plan.ts`: smart CI planner (`Plan CI` job): classifies a PR's changed files and plans the e2e shards (every spec, the mapped specs or none), the 3D perf gates (with an import walk from the 3D roots) and Lighthouse; fails safe to a full run.
- `scripts/e2e-plan.ts`: pure path-to-spec map, worker-aware duration-balanced shard split, CI log timing parser and runner speed normalization (unit tested, including the shard union against the real `--list`).
- `scripts/e2e-changed.ts`: `e2e:changed`: runs the specs that cover your changed paths.
- `scripts/e2e-shard.ts`: `e2e:shard i/N` and `e2e:perf:shard i/N`: duration-balanced CI shard (e2e/durations.json) with a blob report; `--dry` prints the plan.
- `scripts/e2e-durations.ts`: `e2e:durations`: refreshes e2e/durations.json from the E2E shard and 3D perf gates logs of the last green main CI runs, scaled to a median-speed runner (needs `gh`).
- `scripts/perf-report.ts`, `scripts/perf-summary.ts`: pure summary logic and CLI: per-chunk JS diffs, 3D gate tables, timeline trend, program baseline (no dependencies).
- `scripts/perf-base.sh`: downloads the newest main artifact as a summary baseline (never fails).
- `scripts/flaky-report.ts`: tests that passed only on retry, from the merged e2e JSON report, in the `Build, CV and e2e` job summary (warnings, never fails).

### Deploy, Ask and stats operations

- `scripts/ci-status.ts`: deploy gate: reuse the green complete CI result (`ci-full` artifact) for a commit or its tree.
- `scripts/merge-gate.ts`: fast-path gate of a merge deploy: merged same-repository PR, same tree, required checks green on its head, no open `deploy-rollback` issue.
- `scripts/rollback.ts`: `rollback.yml`: rolls Pages production back after a red `main` CI (`pages`), opens or updates (`issue`) and closes (`clear`) the `deploy-rollback` issue.
- `scripts/ci-nightly.ts`: `Nightly report` job of the nightly CI run: opens, updates or closes the one `ci-nightly` issue (dry run off `main`).
- `scripts/ask-eval.ts`: real-model golden and red-team runs (ask-eval.yml).
- `scripts/provision-ask.ts`: idempotent Cloudflare provisioning (dry run unless --apply).
- `scripts/refresh-facts.ts`, `scripts/ask-staleness.ts`, `scripts/content-gap.ts`, `scripts/purge-ask-logs.ts`: live facts, freshness warning, unanswered-question report, gateway log purge.
- `scripts/deploy-smoke.ts`: post-deploy production check (Ask status and pack date, live facts on /en, analytics beacon, /api/rum and /api/visit 405, /api/stats 204 or a valid snapshot).
- `scripts/uptime.ts`: hourly production check (uptime.yml): / and /en with og tags, /api/ask status, /api/stats freshness, last deploy.yml; one retry, then one `uptime` issue opened, updated or closed.
- `scripts/stats-token-check.ts`: CI probes before the hq-stats deploy: the analytics token (CF_STATS_TOKEN, else CF_EVAL_TOKEN) reads Web Analytics and Analytics Engine, CLOUDFLARE_API_TOKEN sees Workers (KV advisory; never prints a token).
- `scripts/stats-dry-run.ts`: runs the hq-stats pipeline against production data into an in-memory KV and prints the snapshot (WA_TOKEN, WA_ACCOUNT_ID from the environment).

### Captures

- `scripts/dev-shots.ts`: captures the dev-only L4 concepts prototype at 1440x900, 834x1112 and 390x844 (needs bun run dev; CONCEPTS, SHOTS, WIDTHS, BASE_URL).
- `scripts/capture-dev.ts`: owner review captures (dev routes or the served export) at 1440x900, 834x1112 and 390x844 with draw call metrics.
- `scripts/readme-hero.ts`: README media from the served export on the virtual frame clock (`e2e/vclock.ts`): the hero GIF (ffmpeg plus gifsicle, under 6 MB), its still and the floor stills in docs/readme/.
- `scripts/office-shots.ts`: Agent Office owner captures (the nine states, the summary, GitHub and desk drawers, semi-live and off) on a served export with `/api/office` answered from fixtures, at 1440x900, 820x1180 and 390x844 on both tiers; never committed.

## src/

### src/app/

- `src/app/(root)/`: "/" language redirect (own root layout).
- `src/app/[locale]/`: all localized routes (root layout with <html lang>).
- `src/app/global-not-found.tsx`: 404.html.
- `src/app/sitemap.ts`, `src/app/robots.ts`: static metadata routes (all locales, hreflang alternates).
- `src/app/og/[...path]/route.tsx`: build-time OG JPEGs: /og/{locale}.jpg, /og/{locale}/page/{quick,journey,labs,library,contact,cv}.jpg, /og/{locale}/{labs,blog}/{slug}.jpg.
- `src/app/data/[...path]/route.ts`: build-time client data: Glass Drawer content, one file per floor: /data/rooms/{locale}-{floor}.json (L1 to RF) and /data/rooms/b1-{locale}.json (B1 Engine Room, fetched only when unlocked), each fetched with a `?v=` content hash, /data/hud/index.json, the 3D page data /data/experience/{locale}.json (fetched by ExperienceGate with the 3D chunk), and the study guide dialog's data /data/guides/{locale}.json (guide views plus the `guides` strings).

### src/assets/

- `src/assets/fonts/`: self-hosted page fonts for next/font/local (`src/app/fonts.ts`): cuts narrowed to the used axes, characters and features (`scripts/subset-fonts.sh`), see its README.

### src/components/

- `src/components/`: static-page UI (server components unless noted).
- `src/components/Modal.tsx`: shared modal dialog (portal, focus trap, Esc, full-screen sheet on phones); DialogHost.tsx mounts the site-wide modals.
- `src/components/diagram/`: architecture diagrams as build-time SVG: layout.ts (pure grid layout, edge router and order search), DiagramSvg.tsx (boxes, arrows, labels).
- `src/components/blog/`: blog post MDX components: `mdx.tsx` (`postMdxComponents`: the `Architecture` tag and a focusable `pre`), `PostArchitecture.tsx` (the figure: `ArchitectureDiagram` plus a figcaption, server only).
- `src/components/LiveSiteLink.tsx`: "Visit live site" link (new tab, noopener noreferrer, external icon, data-live-link), shared by pages and the drawer.
- `src/components/certs/`: Certifications.
  - Certifications (server: featured cards + rows).
  - CertIndex (client island: preview clicks, issuer/status/search filter).
  - CertDialog (lazy preview modal in DialogHost), IssuerMark.
- `src/components/docs/PageViewer.tsx`: shared page image viewer (zoom, page count, download, new tab, lazy pages) behind the CV viewer and the paper reader.
- `src/components/cv/`: CV viewer: CvViewer (PageViewer with the CV pages), CvDialog (lazy modal), CvButton (every CV entry point).
- `src/components/paper/`: paper preview.
  - PaperDialog (lazy modal: abstract, APA/IEEE/BibTeX, DOI and Scholar links, "Read the paper").
  - PaperReader (PageViewer with a paper PDF, PaperNotice), PaperTrigger, PaperReadLink.
- `src/components/guides/`: study guides.
  - GuideShelf (server: the `/library#guides` cards with server-rendered Read, a `data-hq-guide` button `DialogHost` opens, and Download PDF).
  - GuideDialog (lazy modal in DialogHost: fetches /data/guides/{locale}.json, loading and error states, then imports the reader).
  - GuideReader (lazy chunk, `GuideReader.module.css`), GuidePage, GuideThumbs, GuideToolbar, ui; `pdf.ts` (loads pdf.js and its worker on first use), `reader-model.ts` (pure rules), `data-path.ts`.
- `src/components/page/`: Page View building blocks.
  - Layout (PageIntro, SectionSplit, SectionWide, Marker, StatLedger), Work, Case, Timeline, About.
  - Production (About `#production`, server only; `AlertExcerpt` in `src/components/`).
  - Client islands WorkIndex, JourneyFilter, CaseToc, CopyEmail; urlState (query string as filter state).
- `src/components/stats/`: VisitsPanel (Topic and Period radio groups, counters, DotMap, split, topic shares, chips, View as table), VisitsSection/VisitsLazy (Contact `#visits`), TickerVisits (home ticker item), OptOutToggle + optOutStore ("Don't count my visits").

### src/content/

- `src/content/schema.ts`: zod schemas, types via z.infer (appendix 06 + additions, see [content.md](content.md)).
- `src/content/locales.ts`: LOCALES, DEFAULT_LOCALE, Locale with no imports: the only place client code reads locale values from.
- `src/content/live-links.ts`: PUBLIC_LIVE_HOSTS, PUBLIC_LIVE_NAMES, liveUrlProblem, isPublicLiveUrl: the public live link allowlist for Pod.liveUrl (pure).
- `src/content/load.ts`: getContent() and typed accessors (getStats() overlays live facts).
- `src/content/dynamic-facts.ts`: DynamicFactsSchema for content/generated/dynamic-facts.json.
- `src/content/selectors.ts`: pure sorting and grouping helpers (`orderPods`: site order for projects, gallery first).
- `src/content/title-case.ts`: `titleCase` rules for content titles; content/titles.ts lists the title fields (see "Content style" in [content-style-and-safety.md](content-style-and-safety.md)).
- `src/content/pageview.ts`: pure Page View helpers (pod and timeline filters, URL params, nav matching), client-safe.
- `src/content/blog.ts`: MDX discovery with translation fallback.
- `src/content/citation.ts`: PaperPreview type and pure APA, IEEE and BibTeX formatters (client-safe; the paper dialog formats with `previewCitations`); content/papers.ts builds previews on the server.
- `src/content/experience.ts`: buildExperienceData(locale, floorNames): small payload for the 3D chunk (labPods for L3).
- `src/content/tech.ts`: getTechLogo(name) registry (aliases, text-only allowlist), client-safe.
- `src/content/tech-rings.ts`, `src/content/tech-index.ts`: L3 Tech Reactor: six rings from the CV skill groups, explicit ring map, aliases and misc allowlist; pure `buildTechIndex` (read it through `getTechIndex()` from `@/content/load`).
- `src/content/topic-map.ts`, `src/content/topic-index.ts`: L4 Topic Constellation: the topic list, tag folds, item-to-topic map and allowlists; pure `buildTopicIndex` (read it through `getTopicIndex()` from `@/content/load`).
- `src/content/certs.ts`: pure certification helpers and the CertView type (sort, featured, issuer counts and wall tabs, filter, issuer logos), client-safe.
- `src/content/cert-views.ts`: certViews(locale) / toCertViews: serializable CertView[] for the island, the preview card and the 3D wall.
- `src/content/guides.ts`: GuideView type and pure study guide helpers (URLs, weight and size labels, page key), client-safe.
- `src/content/guide-views.ts`: guideViews(locale) and guideForCert(certId), server only (reads `getStudyGuides()`).
- `src/content/media.ts`: GalleryImage, toGalleryImages, coverImage, thumbSrc (client-safe).
- `src/content/room-views/`: RoomView contract (types.ts) and one drawer-content builder per floor.
- `src/content/safety.ts`: blocklist loading and forbidden patterns.

### src/ask/ and src/i18n/

- `src/ask/`: Ask the HQ client, wire protocol and pack builder (shared with functions/).
- `src/i18n/`: next-intl routing, request config, navigation, assertLocale.

### src/lib/

- `src/lib/`: format (Intl dates), accent class maps, gpu-tier, url-sync, viewport.
- `src/lib/boot-first.ts`: game-first load: inline head script, shouldBootFirst, releaseBootCover.
- `src/lib/content-hash.ts`: `shortHash`, the 12-character `?v=` content hash of the build-time `/data/*` files (HUD index, 3D page data, room data per floor); server only.
- `src/lib/perf-marks.ts`: User Timing marks of the game-first timeline (hq:boot-release, hq:first-frame, hq:intro-start, hq:intro-end, hq:explore, hq:first-drawer).
- `src/lib/visits/`: public visit stats display (S2).
  - contract.ts (re-exports S1's StatsSnapshotV1, validator and fixtures).
  - model.ts (freshness, formatCount, visitsView).
  - store.ts (one GET /api/stats per page: requestStats, useStats).
  - geo.ts + generated geo-data.ts (Natural Earth land grid and country points, `bun scripts/visits-geo.ts`).
  - labels.ts (server: chip and floor labels).
- `src/lib/rum/protocol.ts`: RUM beacon wire contract (buckets, parseRumPayload, rumDataPoint), shared with functions/.
- `src/lib/stats/`: public visit stats, shared by the Worker, the Functions and the clients: protocol.ts (StatsSnapshotV1, parseStatsSnapshot), fixtures.ts, visit.ts (beacon contract), visitClient.ts (beacon), floors.ts (floorOfPath), optout.ts.
- `src/lib/office/`: the Agent Office client contract (`protocol.ts`), fixtures (`fixtures.ts`), poller (`poll.ts`, `POLL`) and shared model (`model.ts`: `STATE_TONE`, counts, desk titles), shared by the 3D office and the Classic card; no React, no three.
- `src/lib/brand-mark.ts`: the rover brand mark (owner decision).
  - Geometry, colors and SVG bodies for every variant.
  - `RoverMark` (src/components/RoverMark.tsx) inlines it in the header.
  - The boot card shows `/brand/rover-mark.svg` as a lazy image, so the mark module stays out of the 3D chunk.
- `src/lib/site.ts`: SITE_URL, pageMetadata (absolute titles), ogImagePath, OG_PAGES, beacon token.
- `src/lib/seo.ts`: every page's title, description and share card: seoFor, seoMetadata, fitDescription, keyResult.
- `src/lib/routes.ts`: allPagePaths() for the sitemap (keep in sync with generateStaticParams).
- `src/lib/jsonld.ts`: schema.org Person (employer, address, university, skills, profiles), WebSite, ProfilePage (About), CreativeWork with SoftwareSourceCode parts (pods), BlogPosting (posts), BreadcrumbList (pageJsonLd).
- `src/lib/og.tsx`, `og-layout.ts`, `og-assets.ts`, `og-encode.ts`, `og-cards.ts` (all in `src/lib/`): neon cinematic OG renderer, pure layout rules, build-time inputs (floor stills, photo, pod covers), JPEG encoder (baseline with a JFIF header, never progressive: link unfurlers), list of cards.
- `src/lib/first-person.ts`: hasFirstPerson (owner rule: no first person in mottos, taglines and titles).
- `src/lib/audio/`: procedural Web Audio engine + useAudio hook (see its README).
- `src/lib/day-night.ts`: the day and night preference (`hq:day-night`: readDayNight, setDayNight, subscribeDayNight, dayNightOn); imports nothing, safe for the HUD bundle.

### src/experience/

- `src/experience/`: 3D experience (see "3D experience" in [3d-experience.md](3d-experience.md)).
- `src/experience/floorOrder.ts`: `FLOOR_IDS`, `READY_FLOORS`, `floorIndex` (imports `@/lib/floors` and types only; the store and the Classic HUD read it, `config.ts` re-exports it).

#### Perf

- `src/experience/perf/`: render counters (renderStats, RenderCounter), FrameSampler, the ?perf=1 overlay, timeline marks, the RUM decision and probe.
  - perfOverlayOn is the one flag parser, also for the Director's ride console line.
  - Overlay and probe are static imports in the 3D chunk that mount only with the flag or in a sampled session: a dynamic import inside the 3D chunk can make Turbopack regroup shared modules into the Page View bundle.
  - The floor chunks were measured against that risk and cost the Classic site +381 B (see "Floor chunks" in [floors.md](floors.md)).

#### Gate data

- `src/experience/gate-data.ts` (server only): `experienceDataFor(locale)`, the 3D page data, and `experienceDataVersion(locale)`, its content hash for the gate's URL. `src/experience/data-client.ts`: `loadExperienceData(locale, version)`, the gate's fetch of `/data/experience/{locale}.json`.

#### Sky

- `src/experience/sky/`: day and night (see "Day and night" in [3d-experience.md](3d-experience.md)).
  - dayNight.ts (pure: CYCLE_MS, SKY, clockPhase, parseSkyParam, resolveSkyMode, skyState), applySky.ts (writes a state into the dome and the sun and moon mesh), skyRuntime.ts (live state for `__hq.sky` and the RF stars).
  - SkyController.tsx: lights, the dome and the two-instance sun and moon mesh, on the shared holo program (`HOLO_MODE.sky`, `HOLO_MODE.orb`).

#### Floor chunks

- `src/experience/floors/floorChunks.ts`: pure, no React.
  - `LAZY_FLOORS` (L3, L4, RF, B1) and `PUBLIC_LAZY_FLOORS` (L3, L4, RF), `createFloorChunks` (state machine eager/idle/loading/ready/failed; failed counts as settled, a later load retries).
  - The app instance `floorChunks`, `speculativePrefetchOn` (`?prefetch=off`), `rideChunkHold`, `floorChunksHandle` (`window.__hq.floorChunks`).
- `src/experience/floors/chunks/`: one entry per lazy floor, the only importers of `Labs` / `Library` / `Roof` / `EngineRoom` and their floor-only HUD pieces.
  - `labs.ts` (L3: Labs, OpsBody, ReactorBody, HologramOverlay).
  - `library.ts` (L4: Library, ResearchBody, TopicsBody).
  - `roof.ts` (RF: Roof).
  - `engine.ts` (B1: EngineRoom, EngineBody).
- `src/experience/floors/lazyFloors.tsx`: `labsFloor()`, `libraryFloor()`, `roofFloor()`, `engineFloor()` getters from `floorGetters`, and `useFloorChunks(near)`.
  - A getter returns the loaded component, null while the chunk loads, React.lazy for a failed floor without a module; a rejection drops the wrapper, so the canvas remount retries (`tests/unit/lazy-floors.test.ts`).
  - Beside it: floorPrefetch.ts (pure `prefetchFor`) and FloorChunkPrefetch.tsx (the triggers).

#### Floors

- `src/experience/floors/career/`: L2 Career Road.
  - Pure layout.ts (buildCareerRoad, placeAt, labelFade, roadZAt, scrubTarget).
  - R3F CareerRooms, YearGates (road, arches), WorkshopAnnex.
  - Pure workshopLayout.ts (forecourt, console, gateway, benches, skyline stops, camera zones) and skyline.ts (log star scale, language colors).
- `src/experience/floors/labs/`: L3 Project Roads.
  - Pure layout.ts, directory.ts (directory board content), board.ts, hologramParts.ts.
  - ops.ts (Ops Control Room numbers, screens, lines, labels), opsLive.ts (live panel rows), opsHash.ts (`L3:ops`, `#production`, import-free).
  - R3F Hub, Pods, PacketLanes, HologramStage, OpsRoom.
- `src/experience/floors/library/`: L4 Writing.
  - Pure model.ts (LibraryLayout contract, dockAlong, signsFor, paperSlots, tagLinks, `YEAR_POST`).
  - signPlacement.ts (`placeLibraryLabels`: which timeline signs show).
  - concepts/ (atrium, newsroom, constellation builders), layout.ts (buildLibraryLayout: the owner's pick).
  - decor/ (R3F decor per concept, BookHolograms.tsx shared turning book, pure flipBooks.ts and signFrame.ts: one frame of the timeline and end plaza sign placement).
- `src/experience/floors/roof/`: RF roof deck.
  - Pure layout.ts (buildRoofLayout, ROOF_DECK, roofActive), solids.ts (merged boxes, lattice, scatter).
  - kit.tsx (MergedBoxes, MergedEdges, PulseRings, HitBox, aboutCard).
  - SignalGarden.tsx (the picked scenery with the courier drone) and Sky.
- `src/experience/floors/engine/`: B1 Engine Room (see [floor-b1-engine-room.md](floor-b1-engine-room.md)).
  - Pure layout.ts (buildEngineLayout, ENGINE, bays, racks) and scenery.ts (solids, flow and panel instances, signs).
  - EngineFx.tsx (`FlowMesh`, `PanelMesh`); `floors/EngineRoom.tsx` is the floor and `floors/chunks/engine.ts` its chunk entry.
- `src/experience/floors/lobby/`: L1.
  - Pure layout.ts (Lobby elements, CERT_WALL, TITLE_TOP); logoAtlas.ts (atlas layout and quad buffers) and LogoQuads.tsx (the shared prebuilt logo atlas texture, `useLogoAtlas`).
  - roverMark3d.ts (the profile hologram as the rover brand mark: head, screen, `^_^` face, antenna, treads; drawn by ProfileHologram.tsx in five calls on existing programs).
  - kiosk.ts (Rover menu kiosk parts, lines, the radial spoke end and the spawn stop).
  - spawn.ts (the kiosk axis, `LOBBY_SPAWN`, `LOBBY_SPAWN_HEADING`; types only, the store reads it; `LOBBY` in config.ts builds on it).
  - observatory.ts, observatoryLayout.ts and VisitsStation.tsx (the Visitor Observatory `L1:visits`: parts, door and view zones, scene).
  - officeLayout.ts (the Agent Office wing offsets and `officeWing`, layout, rooms, obstacles, stops, view zone and road; config.ts imports it, so it stays import-light; it reaches the Classic page chunk only through the office loader `office/chunk.ts`, which the drawer bodies import, never through config.ts), officeShell.ts (3D-only, main path: `OFFICE_SLOTS`, `officeShellBoxes`, `officeBounds`, `wingBounds`, `officeSign`, the stop gates `atOfficeStop`, `officeChipsHere` and `wingSignHidden`, the chip anchors and constants, the office canvas helpers) and office/ (see [floor-l1-lobby.md](floor-l1-lobby.md#agent-office)):
    - main path: `OfficeMount.tsx` (the furniture shell, the load trigger, the fade-in, the watch chunk's load and the watch's start, the beacon's mount), `chunk.ts` (`loadOffice`, `loadOfficeBody`, `officeHandle` for `__hq.office`) and `watchLoader.ts` (`loadOfficeWatch`, `loadOfficeBeacon`, `useOfficeWatchModule`, `useOfficeBeaconModule`, `officeAsks` with `setOfficeAsks` and `useOfficeAsks`, `officeWatchNow`; imports React only);
    - the watch chunk `watchChunk.ts` (mirrors the signal into `officeAsks`, loads the beacon chunk on the first ask): `officeSignal.ts` (the beacon's signal: `officeSignal`, `setOfficeSignal`, `useOfficeSignal`, `signalFromBody`; imports React only, shared with the scene and beacon chunks), `officeWatch.ts` (`startOfficeWatch`, `officeWatchTick`) and `src/hud/minimap/OfficeCue.tsx`;
    - the beacon chunk `beaconChunk.ts`: `OfficeBeacon.tsx` (the Needs Kurniadi beacon mesh) and `beacon.ts` (pure: `BEACON`, `beaconOrigin`, `beaconGain`, `beaconInstances`);
    - the scene chunk `scene.ts`: `OfficeScene.tsx` (Rovers, atlas, glow, wall, chip placement), `OfficeChips.tsx`, `runtime.ts` (in-view flag, chip elements, near/far flags), `live.ts` (the poller and `officeTest`), the pure modules `officeModel.ts`, `officeVisual.ts` (`OFFICE_STATE_STYLE`, `STATUS_COLOR`, poses), `officeRig.ts`, `officeAtlas.ts`, `officeFrame.ts`, `officeWall.ts` and `interact.ts`;
    - the drawer body chunk `body.ts`: `OfficeBody.tsx` and `crewSummary.ts` (the summary drawer's crew sentences and announcements).
  - visitsRoom.ts (room id, `#visits` deep link; type-only imports, the gate uses it).
  - stations.ts (Highlights Hall ids, deep-link hash, experienceRows; type-only imports, the gate uses it).
  - hallLayout.ts (HALL, buildHighlightsHall, HALL_LAYOUT, stationOf, gatePillars).
  - hallGallery.ts (gallery shapes: faces, pedestal and tiles, monoliths, lit arch, beacon, gateway arch, fountain, lights, `hallTall`, `gateCrossed`).
  - hallSolids.ts (merged boxes, prisms and neon lines), hallContent.ts (labels, screenshot atlas).
  - hallStage.ts (stage effect instances for the holo program's `stage` mode), gateSweep.ts (`hq:hall-gate`), hallInteract.ts (station targets).
  - R3F walls, kiosk, HighlightsHall and HallFx.

#### Systems

- `src/experience/tower/`: the tower around the floors: Tower.tsx, FloorLevel.tsx (per floor one slab box and grid per slab rect and one outline, ghost fades), slabOutline.ts (pure: the outline segments, none across a wing joint), ElevatorShaft.tsx and elevator.ts, the ride cull (rideCull.ts, RideCullHooks.tsx, slabShadow.ts), floorRegistry.ts, near.ts and visibility.ts.
- `src/experience/missions/`: pure mission system: host.ts (MissionHost), rooms.ts, runner.ts, surprise.ts, staticHost.ts, bridge.ts and host3d.ts (3D wiring).
- `src/experience/nav/`: pure navigation.
  - navgrid, collision, doors.
  - slab.ts (multi-rect slabs: `slabRects`, `slabBox`, `inSlab`, `clampToSlab`, `slabInsetRects`, `slabEdges`, `slabCorners`; see [floors.md](floors.md#multi-rect-slabs-wings)).
  - road.ts (road kit, pathBetween), roadRoute.ts (road waypoints with navgrid legs, across network parts that do not touch; 3D-only), roadGeometry.ts (road mesh data), space.ts (space rules, pad rules).
  - pads.ts (floor pads, the pad latch), teleport.ts (L2 teleport beam timeline).
- `src/experience/hints/`: "!" hint bubbles: source.ts (the only registry read), pure select.ts (nearestHint, hintAnchor), runtime.ts, HintProbe.tsx (no draw calls).
- `src/experience/interact/`: point-and-go.
  - Pure registry.ts (Interactable, interactablesFor, registerExtraInteractables).
  - pick.ts (pick volumes, name tag anchor, click versus tap, performInteract, commands) and runtime.ts (`__hq.interact` probe).
  - InteractLayer.tsx (one invisible instanced hit mesh, outline, destination ring, name tag), useInteractables.ts, missed.ts (empty clicks).

#### Effects (fx)

- `src/experience/fx/RoadMarkings.tsx`: road strip, chevrons, dashed edges and spur stubs (4 draw calls per floor; 3 on L3, which turns chevrons off).
- `src/experience/fx/HoloIcon.tsx`: neon line hologram icons from holoIcons.ts (career type line art shared with components/TypeIcon.tsx).
- `src/experience/fx/BatchedLabels.tsx`: all labels of a floor in one draw call (troika BatchedText; labelProps.ts holds the pure label type).
- `src/experience/fx/FloatingSign.tsx`: floating signs (every word that would lie on a floor).
  - `FloatingSigns`; pure placement in signLayout.ts (`SignSpec`, `signPlate`, `signFacing`, `wrapSign`).
  - plateProjection.ts (`projectPlate`: a sign's plate in CSS pixels, shared by the L4 and end plaza placement hooks).
- `src/experience/fx/holoFx.ts`: the one spectacle shader (`createHoloMaterial`, `HOLO_MODE`: plate, skyline, glow, flow, pillar, fall, core, ring, strip); HoloMesh.tsx draws a single one as a one-instance mesh.
- `src/experience/fx/BoostFx.tsx`: boost effects: twin path-following trails, speed streaks, wheel sparks (pure parts: boostConfig.ts, boostTrail.ts, streaks.ts, sparks.ts).
- `src/experience/fx/PadGlow.tsx`: floor pads: one instanced glow per floor plus a neon icon per kind (PAD_ICONS); clicks go through point-and-go (the rover drives onto the pad, then the picker opens). TeleportBeam.tsx draws the beam.

#### Dev prototypes

- `src/experience/prototype/`: dev-only walkable floors prototype (L2 and L3 use the real Career Road and Project Roads layouts; type icons); route src/app/[locale]/dev/floors/page.dev.tsx.
- `src/experience/prototype/certs/`: dev-only certification harness: CERT_FIXTURE (the live 7 plus 23 FICTIONAL entries, tests and dev only) and the real Page View and 3D wall at /{locale}/dev/certs?view=3d&n=7|30&tier=lite|full.
- `src/experience/prototype/library/`: dev-only L4 concepts prototype (all three concepts on the real content, Glass Drawer and paper modal); route src/app/[locale]/dev/library/page.dev.tsx?concept=atrium|newsroom|constellation&view=rover|top&tier=full|lite&motion=reduce&posts=N.

### src/hud/

- `src/hud/`: HUD over the canvas.
  - Profile card, elevator panel with named floors from `hud.floorLabel`, controls, boot, bottom band with the joystick (double tap boosts); `layout.ts` is the per-device HUD composition.
  - Corners (phones and tablets): FloorChip (floor sheet) and FloorButtons, ViewControls (ResetView).
  - Plus RoverTerminal, CommandPalette, search, MissionHud, HudLaunchers, events, HologramOverlay, InteractStatus (point-and-go: aria-live target, Go chip, one-time hint).
- `src/hud/menu/`: HudMenu (the Corners menu sheet), SettingsSheet (desktop), SheetHeader, useHudToggles (the `N` and `,` keys).
- `src/hud/settings/`: the settings registry (`registry.ts`), SettingsPanel and one file per setting in `defs/`.
- `src/hud/minimap/`: the pure model, Minimap, MapOverview, MapLayers and the `hq:minimap` preference.
- `src/hud/ask/`: Ask the HQ dock: AskDock (launcher, teaser, mounted in the layout), AskChat (lazy panel), AskPill (3D), useAskThread, availability (status, tower, layout).
- `src/hud/dialog/`: Rover's dialog.
  - Pure engine.ts (say, queue, typewriter), store.ts (singleton, useDialog).
  - onboarding.ts, floorIntro.ts, hintLines.ts, storage.ts, tutorial.ts, placement.ts.
  - DialogBox, DialogLayer (3D chunk only), Spotlight, OnboardingLayer, HintLayer.
- `src/hud/pads/`: floor pad pickers: PadPicker (floor and year lists on the shared Modal, a bottom sheet on phones), BeamFade; pure picker.ts (options, roving focus, floorThumb).
- `src/hud/drawer/`: Glass Drawer: RoomDrawer (UI), DrawerHost (store, data, audio), bodies, layout, urlSync, data, ascii (README).

### src/store/

- `src/store/useHQStore.ts`: zustand store (appendix 06 section 2 plus documented additions, see [3d-experience.md](3d-experience.md)).

## tests/

- `tests/helpers/space.ts`: expectSpaceRules(...) for walkable floor layouts.
- `tests/helpers/edge-accents.ts`: static scanner for colored left/top edge stripes (`tests/unit/edge-accents.test.ts`).
- `tests/helpers/office-cameras.ts`: settled L1 follow cameras and the six office sizes, shared by `office-chip-placement` and `office-beacon-view`.
- `tests/unit/`: Vitest.
  - Schema, selectors, format, safety, store, intents, navgrid, rover, rigs, url sync, missions, search, SEO, audio, doors.
  - Career layout, labs layout, arrival framing and directory boards, sign facing, library concepts and layout.
  - Room views, drawer layout and URL, ASCII, hologram, interact registry and pick logic.
- `tests/hud/`: Vitest + Testing Library (jsdom per file): terminal, palette, MissionHud, AskDock, RoomDrawer, L4/RF rooms.
- `tests/content/`: Vitest: dataset, public safety, assets.
- `tests/ask/`: Vitest: Ask pipeline, checks, handler, pack, curated pills (retrieval gate); golden.json and redteam.json sets (the counts and the golden `passThreshold` live in the files).

## e2e/

### e2e/ specs (Playwright)

| Area | Spec and what it covers |
|---|---|
| Static routes | static routes |
| Page View | `pageview.spec.ts`: axe per template, filters, anchors, phone overflow |
| 3D experience | `experience.spec.ts` |
| Career Archive | `career.spec.ts` |
| Labs + drawer + hologram | `labs.spec.ts` |
| L3 Data and ML spine | `labs-data.spec.ts` |
| L3 three paths | `labs-paths.spec.ts`: arrival and the mirrored end on both tiers, the reactor drive on full; every pose with `LABS_SHOTS` |
| Library + Roof | `library-roof.spec.ts` |
| L4 label overlap and caps | `library-labels.spec.ts` (rendered); `tests/unit/library-label-sweep.test.ts` runs the same sweep without a renderer |
| Floating signs, the reactor routes and spectacle motion gating | `spectacle.spec.ts` |
| Highlights Hall | `highlights.spec.ts`: point-and-go stations, cards, live links, the highlights mission, deep link, the gateway arch and its one-shot curtain, L1 budget (full tier walk) |
| Agent Office | `office.spec.ts`: the lazy chunk and its trigger (declines at the spawn, loads on the lead road), `?prefetch=off` (no load on its own; an office drawer loads the body and starts the scene), partial atlas uploads without GL errors, states and chips, Rover, chip, summary and GitHub drawers, the mission, semi-live, off and disabled modes, offline after the keep-last window, reduced motion, Motion Full, Indonesian, a 390 x 844 phone (chips stay compact dots, no text, zoomed in), the L1 budget at the office (lite); snapshots from `e2e/office-fixtures.ts` |
| RF roof deck | `roof.spec.ts` |
| Missions + axe | missions |
| Floor pads and pickers | `pads.spec.ts` |
| Point-and-go | `interact.spec.ts`: hover, click, empty floor, touch, reduced motion |
| How I run AI in production | `production.spec.ts`: the About section and axe, Cmd-K, the L3 Ops Control Room, its drawer, live panel, deep link and reduced motion |
| Study guides | `guides.spec.ts`: the `/library#guides` shelf and the certification card open the reader (page 1 with its text layer, Next, page input, Home and End, Esc and focus return), chapters, a same-origin download with no new tab, the resumed page, axe, the phone layout; `/api/guides/*` comes from `e2e/fixtures/guide-pdf.ts` |
| Zero CSP violations | `csp.spec.ts`: Classic routes, 404, the `/` redirect, the CV viewer, 3D boot, intro, a ride and a deep link |
| Opt-in screenshots | `screenshots.spec.ts`, `pageview-visual.spec.ts` |

### e2e/ support and perf lane

- `e2e/budgets.ts`: every 3D CI threshold (render, bytes, programs, memory).
- `e2e/office-fixtures.ts`: Agent Office snapshots for `office.spec.ts` and `scripts/office-shots.ts` (the nine states over two snapshots, one private desk without a title, one off-duty slot).
- `e2e/durations.json`: median seconds per test of both lanes from CI logs (`bun run e2e:durations`), for the CI shard split.
- `e2e/perf/`: perf lane (PERF=1, `bun run e2e:perf`, CI job `3D perf gates`).
  - bytes-3d, floors (+ baseline.json), peaks, memory-full (the memory gate on the full tier with Motion Full), nightly timeline, local look check.
  - The lite, reduced-motion memory gate is `e2e/memory.spec.ts` in the default suite.
  - `guide-reader.spec.ts` (perf key `guides`): the study guide reader's chunk and worker caps.
- `e2e/fixtures/guide-pdf.ts`: a generated fixture PDF (no owner content, no committed binary) and `routeGuides` / `serveGuides`, which answer `/api/guides/*` with byte ranges in e2e.
- `e2e/perf-probes.spec.ts`: default suite: ?perf=1 overlay on and off, timeline marks, RUM beacon.

## docs/

- `docs/features.md`: feature reference by floor (controls, floors, Ask, CI, performance, status log); the README links here.
- `docs/content.md`: content guide (dataset, posts, galleries, certifications, CV, paper PDFs and their redaction steps, study guides, safety lint).
- `docs/deploy.md`, `docs/ask-runbook.md`, `docs/study-guides-runbook.md`: deploy, Ask the HQ and study guide (R2 upload) runbooks.
- `docs/decisions.md`: how to add and read owner decisions (static, no table); `docs/decisions/`: one file per decision, `YYYY-MM-DD-slug.md`.
- `docs/superpowers/`: specs (with a status table) and plans (status only in each plan's `Status:` line).
- `docs/readme/`: README media: hero.gif, hero.jpg, floor-{L1,L2,L3,L4,RF}.jpg (output of `scripts/readme-hero.ts`, committed).
