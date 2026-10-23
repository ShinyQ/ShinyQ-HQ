# Content

How code reads the dataset and its side files (CV, paper PDFs, logos, diagrams, galleries, certifications, study guides, perspectives, indexes) and the schema fields added beyond appendix 06.

Index: [AGENTS.md](../../AGENTS.md).

Related: [content-style-and-safety.md](content-style-and-safety.md) (hard rules, Title Case, forbidden patterns), [../content.md](../content.md) (content workflows), [../superpowers/specs/agent-hq/06-data-contracts.md](../superpowers/specs/agent-hq/06-data-contracts.md) (appendix 06).

## Accessors and types

- Import from `@/content/load`:
  - `getContent`, `getProfile`, `getStats`, `getSkills`, `getCertifications`, `getAwards`.
  - `getPods(wing?)`: site order, `orderPods` in `@/content/selectors` (pods with a gallery first, then hero, featured, listed, then `order`). `getPod(slug)`.
  - `getTimeline()` (oldest first), `getTimelineEntry(slug)`, `getTimelineEntryById(id)`.
  - `getYears()`: year rooms; pre-2019 entries fold into 2019 as the prologue.
  - `getPosts()`, `getPost(slug)`, `getLibrary()`, `getRoof()`, `getContact()`, `getSideProjects()`, `getPublicRepos()`, `getMissions()`, `tr(text, locale)`.
- The build story has its own module, `@/content/build-story` (schemas `BuildStorySchema` and `BuildFactsSchema`, `STATION_IDS`):
  - `getBuildStory()` reads `content/build-story.json`; `getBuildFacts()` reads the snapshot `content/generated/build-facts.json` written by `scripts/build-facts.ts`.
  - It pulls zod into the bundle, so it is server-side only: import it from server components and scripts, never from a client component (client pieces take plain props; `src/lib/build-page.ts` holds the pure joins).
  - Counts always come from the snapshot, never from the story text. See [../content.md](../content.md#build-story).
  - The story also feeds the B1 Engine Room: `buildEngineViews` (`content/room-views/engine.ts`) builds the station drawers and `buildEngineData` the floor's `ExperienceData.engine` (bay titles for the signs and the registry), see [floor-b1-engine-room.md](floor-b1-engine-room.md).
- Types come from `@/content/schema` (`Pod`, `TimelineEntry`, `Mission`, `MissionStep`, `RoomId`, `Locale`, ...). Do not redeclare them.
- Client code imports the locale values from `@/content/locales`, never values from `@/content/schema` (type-only imports are fine); `bun run build` fails otherwise.

## Room ids

- Room ids are `${FloorId}:${slug}` (`L3:voice-ai-contact-center`, `L2:jenius-2024`, `RF:contact`).
- `id === slug` for pods and timeline entries.
- The prefix also picks the Glass Drawer data file: a room's view ships in `/data/rooms/{locale}-{floor}.json` of its prefix (B1: `b1-{locale}.json`), see [hud-and-drawer.md](hud-and-drawer.md#builders-and-data). A room shown on another floor still lives in its prefix's file.

## CV

- File: the owner's own PDF at `public/cv/{roof.cv.fileName}.pdf`. Use it as-is, English only, no web export (owner decision).
- Every CV entry point opens the in-site CV viewer modal instead of downloading (owner decision):
  - Use `<CvButton>` (`src/components/cv/CvButton.tsx`: a real link to `/{locale}/cv` that calls `openCv()`, so it works before hydration and with modifier keys) or `openCv()` from `src/hud/events.ts`.
  - The viewer (`CvViewer`, also the body of `/{locale}/cv`) shows pre-rendered page images (`CV_PAGES` from `@/lib/cv`, no PDF renderer in the browser).
  - Page images: near-lossless WebP (`WEBP_NEAR_LOSSLESS` in `scripts/pdf-pages.ts`, one VP8L frame) at 800, 1200 and 1600 px, served through `srcset`. Lossy WebP and AVIF need more bytes for the same SSIM on text. `tests/content/cv.test.ts` holds a per-width byte budget (90, 150 and 200 KB).
  - `PageViewer` loads page 1 eagerly (`fetchPriority="high"` on the `/cv` page, where it is the LCP) and every later page with `loading="lazy"`; all pages use `decoding="async"` (`tests/unit/page-srcset.test.tsx`).
  - Controls: zoom, the page count, a "Download PDF" link (`cvPdfPath` and `cvDownloadName`) and "Open in new tab".
- Update the CV:
  - Replace the file under the same name and run `bun run cv:pages` (poppler and webp, e.g. `brew install poppler webp`).
  - `tests/content/cv.test.ts` fails until the page images match the PDF's sha256.
  - Run `cv:pages` with `TMPDIR="$PWD/.cv-tmp"` where `/tmp` is not writable.
- The CV is the source of truth for the CV-derived facts on the site (owner decision). In the same PR, update:
  - the pinned `CV_SHA256` in `tests/content/cv.test.ts`;
  - the content in `content/site-content.json`;
  - the markers in `tests/content/cv-facts.test.ts` (site side always runs; the PDF side runs where `pdftotext` exists, so locally, not on CI).
- Facts with stronger evidence that the CV does not contradict (git history, credential records) stay and are listed in the PR for the owner.
- The PDF is exempt from the forbidden patterns lint (binary; it lists items the site text hides, by the owner's choice).
- Old per-locale URLs 301 to it (`public/_redirects`).

## Paper PDFs

- `Publication.document` (`{ file, version: "manuscript" | "redacted" | "published", notice?: "ieee" }`, papers and theses only) hosts `public/papers/{file}.pdf`.
- Redaction rules:
  - Personal data (student or staff IDs, home addresses, phone numbers, signatures, QR codes) is redacted by rasterizing the page with the regions blacked out, never by covering text.
  - The unredacted original is never committed.
  - IEEE papers host only the authors' manuscript with `notice: "ieee"` (schema check), never IEEE's final PDF. The ICICyTA 2021 COVID-19 paper has none yet; its accepted manuscript can be added later.
- After adding or replacing a PDF run `bun run paper:pages`: it refuses text that matches `PERSONAL_DATA_PATTERNS` (`paperTextProblems`: NIM, NIP, NIK/NPWP, RT/RW address, phone). `tests/content/papers.test.ts` pins the sha256 and runs the same check when `pdftotext` exists.
- Preview data: `buildPaperPreview` adds `PaperPreview.document` (`pdf`, `version`, `notice`, `pageCount`). Page images stay out of the preview; the lazy reader reads `paperPages(file)` from `@/lib/papers`.
- "Read the paper" (`PaperReadLink`: a real link to the PDF that calls `openPaper(preview, { read: true })`):
  - sits in the Page View research list and the L4 Research drawer;
  - the paper modal shows it as a button and swaps its body for `PaperReader` (alt text "<title>, page N of M", the IEEE notice in English plus the DOI of the published version).
- `/papers/*` detaches the site CSP (`frame-ancestors 'none'`) so the browser PDF viewer opens the file in a new tab; nothing is framed.
- The Ask pack says the full text can be read on the site.

## Study guides

Workflow: [../content.md](../content.md#study-guides) and [../study-guides-runbook.md](../study-guides-runbook.md).

- Data: `content/study-guides.json`, its own file, parsed by `StudyGuidesFileSchema` (`@/content/schema`; unique `slug` and `certId`, at most 8 domains, `version` 12 hex, `cover` `/study-guides/<slug>.webp`). Read it on the server through `getStudyGuides()` (`@/content/load`); invalid data fails `next build`.
- Views: `guideViews(locale)` and `guideForCert(certId)` in `@/content/guide-views` (server only) build `GuideView` (locale-resolved title, summary and domain labels, `editionLabel`, `sizeLabel`, `url` and `downloadUrl`).
- Client-safe helpers in `@/content/guides` (no zod, React or three): the `GuideView` type, `GUIDE_SLUG`, `guideUrl(slug, version)` (`/api/guides/<slug>?v=<version>`), `guideDownloadUrl` (adds `&download=1`), `GUIDE_PAGE_KEY`, `weightLabel`, `sizeLabel`. Never build a guide URL by hand: the `?v=` version is what makes the immutable cache safe.
- Consumers:
  - the Classic shelf `GuideShelf` on `/library` (server, labels resolved; its Read and Download controls are plain server markup, no client island);
  - `CertView.guide` (see [Certifications](#certifications));
  - the L4 Study Vault's books (`LibraryData.guides` from `buildLibraryData`, only `slug`, `spine`, `issuer`, `code` and `title`; [floor-l4-library.md](floor-l4-library.md#study-vault));
  - the guide dialog fetches `/data/guides/{locale}.json` (`src/app/data/[...path]/route.ts`: the views plus the `guides` strings; [styling-and-i18n.md](styling-and-i18n.md#client-messages)).
- Open the reader only through `DialogHost`: a `<button type="button" data-hq-guide={slug}>` (its delegated document click listener opens the guide and returns focus to that button), or the `hq:hud` command `sendHudCommand({ type: "guide", slug })` from code. Never add a client island or a preload just for a Read button: Turbopack groups Page View islands into a chunk that every Classic page loads, and `/labs` pages sit at the Lighthouse JS budget.
- Chunks: `GuideDialog` rides in the `CertDialog` chunk (`DialogHost` loads both through `loadCertDialog`, so the card's "Read study guide" swaps at once). The reader and pdf.js load only through dynamic imports: `GuideDialog` imports `./GuideReader` by hand (a failed chunk lands in the dialog's error state with Retry), and `pdf.ts` imports `pdfjs-dist` on first use (or `pdfjs-dist/legacy/build/pdf.mjs` and its legacy worker when `needsLegacyPdfjs()` finds a missing built-in: `Map.prototype.getOrInsertComputed`, `Math.sumPrecise`, `URL.parse`, `Promise.try` or `Promise.withResolvers`). pdf.js never listens for its worker port's `error`, so `pdf.ts` does: a failed worker rejects `workerFailure()`, and the reader races the open against it and a 45 s timeout (`raceLoad`, `OPEN_TIMEOUT_MS`). A closed document's destroy is awaited (at most 5 s, `DESTROY_WAIT_MS`) before the next open (`destroyTask`, `afterDestroy`), except when its worker died. `tests/unit/guide-chunks-graph.test.ts` fails when `Experience.tsx` or the locale layout reach the reader, `pdf.ts` or pdf.js statically ([performance.md](performance.md#study-guide-reader)). Pure reader rules (zoom steps, render window, canvas sizing with a 4096 px side cap and a pixel budget from `canvasPixelCap`: 5,242,880 on touch screens, 16,777,216 elsewhere; keys; the last page read, saved under `GUIDE_PAGE_KEY`) live in `reader-model.ts`.
- Reader layout: `GuideToolbar` is one compact header row (Close, title, Chapters with its outline popover, Download; `HEADER_ROW`, shared with the dialog's loading and error header so the swap does not jump). `GuideControls` is the floating pill (page input and count, Prev, Next, a divider, Zoom out, Zoom in, Fit width; `glass glass-solid`, `rounded-full`) placed absolute at the bottom center of the pages column (`.column` in `GuideReader.module.css`, never over the thumbnail rail), before the scroller in the DOM so Tab goes header, pill, pages. The scroller's `.stack` bottom padding is the pill height plus its margin (`--controls-height`, `--controls-bottom`), so the last page scrolls clear of it. Limit buttons stay focusable with `aria-disabled`. Targets are 44 px on coarse pointers and 36 px under `pointer-fine:` ([styling-and-i18n.md](styling-and-i18n.md)). Unit tests: `tests/hud/GuideToolbar.test.tsx`, `tests/hud/GuideControls.test.tsx`.
- Pages Function: `functions/api/guides/[slug].ts` with `createGuidesHandler` in `functions/_lib/guides.ts`. It imports `content/study-guides.json` itself, so a slug not in the deployed file answers 404. A well-formed `?v=` (12 lowercase hex) reads exactly `<slug>/<v>.pdf` with a year of immutable caching (any existing version key: its bytes never change), and 404 when that object is missing; no `?v=` or a malformed one serves the current version with a five minute cache. A plain GET is one R2 `get`; HEAD, `If-None-Match` and `Range` requests read `head` first. It sets its own headers (Cloudflare Pages does not apply `public/_headers` to Function responses), including `Content-Security-Policy: frame-ancestors 'none'` and `X-Content-Type-Options: nosniff`. Binding `GUIDES` (R2 `hq-study-guides`, [ask.md](ask.md#bindings-vars-and-secrets)).
- Never commit a PDF; covers in `public/study-guides/` are the only committed output of `scripts/study-guides.ts`.

## Tech logos

- `getTechLogo(name)` from `@/content/tech` returns `{ src, label } | null`. It normalizes case, versions like "Next.js 14", parentheticals, "A / B" compounds and kebab-case tags such as "azure-openai".
- Unknown names render as text chips.
- Every stack and skill name in content must resolve or be listed in `TEXT_ONLY_TECH` (`tests/unit/tech.test.ts`).
- Skill group ids (`SkillGroupSchema`): `ai`, `ds` (Data science and ML, site-only, after `ai`), `azure`, `languages`, `backend`, `frontend`, `data` (Data and messaging), `devops`. The CV groups match the CV (`tests/content/cv-facts.test.ts`, `SITE_ONLY_SKILLS` for the rest).
- Add a logo: drop the file in `public/tech/`, add an entry in `tech.ts` and a line in `public/tech/README.md`.
- `ChipList items logos` and `TechLogoRow` (`src/components/Chip.tsx`) render them on static pages.

## Architecture diagrams

- Authored node and optional edge labels accept a nonempty shared string or strict `{ en, id }` text. Legacy strings render verbatim in either locale.
- Resolve a raw graph once for the requested locale before layout, accessible summaries and room-view serialization. Layout and client DTO labels remain strings; never mutate cached source graphs.
- Node IDs, edge endpoints, ordering and group strings are structural. Groups remain shared membership/display keys, not localized captions.

### Blog architecture figures

- A post embeds `<Architecture pod="<pod-slug>" caption="..." />` (the case study's diagram) or `<Architecture diagram="<id>" caption="..." />` (from `content/blog/diagrams.json`).
- Resolved by `resolvePostArchitecture` in `@/content/post-diagrams`; bound per post by `postMdxComponents` (defined in `src/components/blog/mdx.tsx`, bound per page in `src/app/[locale]/blog/[slug]/page.tsx`).
- Tags are self-closing, with double-quoted string props, and the same tags in both locales.
- `tests/content/post-diagrams.test.ts` fails on an unknown reference, a missing caption or an unused diagram.

### `ArchitectureDiagram`

- Draws every architecture (case studies and posts): real box and arrow diagrams (owner decision), in `src/components/diagram/`.
- Build-time inline SVG with no client JS.
- Three layouts swapped by media queries:

  | Layout | Direction | Rule |
  |---|---|---|
  | `wide` | left to right | from 1100 px when it fits `WIDE_LIMIT`; posts break out of the text column through `.arch-break` |
  | `column` | top to bottom | |
  | `phone` | top to bottom | at most 318 px wide with text of at least 12 px |

- One `role="img"` with a summary of every connection (`diagram` messages).
- `layout.ts` keeps the authored `layer` and `row` grid for `wide` and searches node orders, lanes and channel orders for the fewest crossings (`layoutCost`).
- `tests/unit/diagram-layout.test.ts` checks every real diagram (no overlapping boxes or labels, orthogonal edges) and zero crossings in post diagrams.

## Pod galleries

- `pod.assets[0]` is the cover (pod cards, JSON-LD).
- Files in `public/media/<pod-slug>/`:
  - a `.thumb.webp` sibling (480 px);
  - when wider than 1200 px, a `.w1200.webp` rendition (`bun scripts/media-sizes.ts` after adding images; `tests/unit/media-sizes.test.ts` fails until it exists);
  - webp without metadata.
- Review every image for personal data, internal codenames and client secrets before commit. `redacted: true` means reviewed and safe; a test enforces it and the 25 MB media budget.
- Name files by pod slug, never by codename.
- Render project images with `srcSet={imageSrcSet(image)}` and a `sizes` that matches the slot (`CARD_SIZES` for cards, `@/content/media`), so DPR 2 and 3 screens get a sharp file.
- Render galleries with `<Gallery images={toGalleryImages(pod.assets, locale)} />` (`src/components/Gallery.tsx`, `layout="grid" | "strip"`).
  - It opens `Lightbox` (arrows, Home/End, swipe, Esc, focus trap and restore; keys are captured so the rover and drawer ignore them).

### Exclusions and live-app captures (owner decisions)

- Text only: SITA (`mining-coa-assistant`) and FREDDY (`automotive-fraud-dashboard`); `tests/content/dataset.test.ts` pins `assets: []`.
- The vendor portal (eVendor) is shown as Metrodata work with a gallery, captured from a local demo instance with demo data:
  - owner-provided demo accounts, a throwaway copy of the demo database, a fresh clone of the app;
  - staff and vendor views, six desktop screens and a phone triptych;
  - the same masking: names, PO, invoice and other document numbers, values, codes and the signed-in user blurred in the page before capture.
  - Demo passwords never enter a repository, file, log or PR text.
- Signed-in captures of a live app:
  - use a temporary Chrome profile (sync off) that the owner signs in to, and block every write request;
  - blur vendor and people names, emails, phone numbers, money and amounts, tax IDs, bank accounts, document numbers, Azure hostnames and tenant names before each shot;
  - then pass an OCR check and a by-eye review;
  - skip screens that are mostly sensitive; delete the profile and raw captures afterwards.
- Hostnames never appear in copy, alt text, file names or PR text, and internal apps never get a `liveUrl`.

## Certifications

- Read them through `certViews(locale)` (`@/content/cert-views`):
  - sorted earned newest first, then in progress, then expired;
  - `short` drops the "Microsoft Certified:" style prefix;
  - `logo` comes from `issuerLogo` via `getTechLogo`; both are server only so the tech registry stays out of client islands;
  - joint programs such as "Kominfo x IBM" stay text.
- Page View renders `<Certifications locale limit? />` (`src/components/certs/`):
  - up to 3 featured cards (`featured: true` pins, then the newest earned with a code), then a dense two-column list;
  - a certification without an exam code (Google's Generative AI Leader) shows `shortLabel` (display only, never a code) in the featured card's big title slot, and the newest code-less one is pinned with `featured: true` to stay among the cards; the 3D badge headline stays code or issuer;
  - `limit` (home) caps the rows and links to `/contact#certifications`;
  - from `CERT_FILTER_MIN` (10) the full list gets issuer chips, a status select (`?issuer=`, `?status=` in the query string) and a local search box.
- Every card, row and 3D badge calls `openCert(view)` (`hq:hud` command), which `DialogHost` shows as `CertDialog` (shared `Modal`, width `sm`):
  - issuer, code, full name, status, dates, credential ID and "Open credential" (new tab, `rel="noopener noreferrer"`);
  - "Read study guide" (primary; "Open credential" turns ghost) when `CertView.guide` is set: a `data-hq-guide` button, so `DialogHost` swaps the card for the guide dialog, keeping the card's opener for focus return.
- `CertView.guide` is the study guide slug for the certification (`guideForCert(certId)` in `@/content/guide-views`) or `null`, so the 3D wall and the Classic cards get the action from the same views.
- Never frame a credential site and never render "Verified" style labels.
- Strings live in `messages/*.json` `certs`.

## Perspectives

- Kurniadi's own Q&A answers live in `content/perspectives.json` (`PerspectivesFileSchema`, outside `SiteContent`).
- Knowledge for Ask the HQ only (owner decision): no page, section, anchor, sitemap or Cmd-K entry shows them. See [ask.md](ask.md).
- Entries:
  - all approved through the file `status: "approved"`: 15 engineering entries, plus 30 answers the owner wrote and endorsed, each tagged with one topic from `PERSPECTIVE_TOPICS` (`work-style`, `ai-industry`, `indonesia-tech`, `policy`, `lifestyle`; `perspectiveTopic`).
- Reading:
  - only through `getPerspectives()` (published: `approved: true`, or no `approved` field in a file whose `status` is `"approved"`);
  - `getPerspectivesFile()` includes drafts and is for checks and tests only;
  - never import the JSON or `@/content/load` into a client component: `e2e/pageview.spec.ts` scans every text file of `out/`, JS chunks included, for perspective fingerprints (`scanBuildOutput`).
- Helpers in `@/content/perspectives`:
  - `perspectiveSourcePath`: the path Ask cites (the first `sources` item with a page, `/blog/<slug>`, `/labs/<slug>` or `/library` for a talk, else none);
  - `perspectiveIssues`, `perspectiveFingerprints`.
- A fact from outside the site (for example a published survey) needs a `references` item `{ label, url }` on an allowed host (`PERSPECTIVE_REFERENCE_HOSTS`); the pack names the label, never the URL.
- Questions are not titles (no Title Case rule).
- Owner workflow: [`docs/ask-runbook.md` section 15](../ask-runbook.md).
- File schema: see [Perspectives file](#perspectives-file) below.

## Indexes

### Tech Reactor index

- `getTechIndex()` merges every pod `stack` spelling (`techKey`, `TECH_ALIASES`) and puts each tech on one of six rings (`REACTOR_RINGS`):
  - its CV skill group first (`GROUP_RING`, languages by `LANGUAGE_RING`), else `EXTRA_RING` (the site-only `ds` group has no ring, so its techs keep their `EXTRA_RING` ring);
  - third-party integrations that fit no ring go in `MISC_TECH`.
- A new pod tech must get a ring or a misc entry in `src/content/tech-rings.ts` (`tests/unit/tech-index.test.ts` fails otherwise, and also on stale entries).
- Slugs (`techSlug`) come from the canonical key, so a display spelling can change without breaking `#labs-tech=` links.

### Topic index

- `getTopicIndex()` puts every post, paper, thesis, model and talk on the topics in `TOPICS` (`src/content/topic-map.ts`), for the L4 Topic Constellation ([floor-l4-library.md](floor-l4-library.md)):
  - post tags fold through `TOPIC_TAGS` (one topic per tag; `TOPIC_SKIP_TAGS` for tags left out);
  - papers, models and talks (no tags in content) map by id through `ITEM_TOPICS`;
  - `TOPIC_UNMAPPED` lists items allowed without a topic.
- A new post tag or item must get a topic or an allowlist entry (`tests/unit/topic-index.test.ts` fails otherwise, and on stale entries).
- A new topic needs `library.topics.names.<slug>` in both message files.
- Labels name existing tags or words already in the titles; never add content for a topic.
- It feeds `LibraryData.topics`, the `L4:topics` drawer view, `HudIndex.topics` and the Classic Writing filter (`topicsOfItem`).

## Side projects

- `sideProjects` lists only work that has no project pod (owner decision).
- When a side project gets a full pod (a pod `repos` entry equals its `repo`):
  - remove it from `sideProjects` (no Workshop bench, Classic site list or Ask chunk);
  - add its old room to `RETIRED_SIDE_ROOMS`;
  - `tests/unit/career-workshop.test.ts` fails on a duplicate.
- Sentiboard, e-wallet sentiment and the S&P 500 optimizer went this way: they are Data and ML pods.

## Confidence and positioning

- Confidence is internal review data (owner decision):
  - `Stat.confidence`, `Result.confidence` and `TimelineEntry.confidence` stay in the dataset;
  - no page, drawer view, OG card, JSON-LD or Ask chunk renders or ships them;
  - result `context` only says how a number was measured (never "Self-reported in my CV");
  - `tests/unit/room-views.test.ts` and `tests/ask/pack.test.ts` guard this.
- Positioning: the headline is "AI and Software Engineer" (ID "AI dan Software Engineer"; the CV's order, owner decision) with no cloud vendor. Azure, AWS and VPS hosting belong in stacks, project details and certifications.

## L3 wings

- Display names come from `common.wing`: "Product Engineering", "AI Engineering" in both locales, "Data and ML" / "Data dan ML".
- Ids, keys and URLs stay `software` / `ai` / `data`. Never hardcode wing names.
- `data` is the middle road, the spine from the hub to the Tech Reactor (see [3D experience: L3 Data and ML spine](floor-l3-labs.md)).
- Side-wing code uses `SIDE_WINGS` and `WING_SIDE`; everything that lists wings uses `LABS_WINGS` (`floors/labs/layout.ts`).

## Schema additions beyond appendix 06

Keep them documented here.

### Top-level `production`

`ProductionSchema` (owner approved), read through `getProduction()`: "How I run AI in production". Shown in the L3 Ops Control Room ([floor-l3-labs.md](floor-l3-labs.md)).

| Field | Rule |
|---|---|
| `title`, `intro`, `outro` | text |
| `points` | `{ id, lead, text }` |
| `tiles` | `{ id, label, value, detail, panel }`; `panel` (`metrics`, `traces`, `alerts`) picks the Ops Control Room screen |
| `alerts` | rule families on the Alerts screen |
| `caseStudies` | pod slugs, checked by `tests/content/production.test.ts` |
| `alertExcerpt` | optional `{ caption, code }`: a masked Bicep rule, every resource, client and project name a neutral placeholder |
| `dashboard` | optional: an `Asset` plus `caption`, rendered locally with demo traffic |

- Facts only, aggregated, never a client, resource, host or subscription name.
- Sentence case, not a title (no Title Case rule).

### `Pod`

- `Pod.client`:
  - a proper name string: a freelance client, or the employer itself when it was the customer, such as `"Metrodata"` for the vendor portal (owner decision);
  - or a `{ en, id }` sector label for an employer's client;
  - render it with `clientLabel(client, locale)` from `@/content/selectors`.
- `Pod.repos`: optional, 1 to 4 public `https://github.com/ShinyQ/<repo>` roots, main first; `GITHUB_REPO_PATTERN`.
- `Pod.publications`: ids of `library.publications`, checked by `SiteContentSchema`. The base object without that check is `SiteContentObjectSchema`, which `validate-fragment.ts` extends.
  - `repos` and `publications` show as "Code and research" on the case study (`PodCodeResearch`: papers and the thesis open the paper preview) and in the drawer (`RoomView` section with link items).
- `Pod.selected`: optional 1 to 3 (owner decision).
  - The landing "Selected work" rank, also the L1 Highlights Hall projects through `pickFeaturedPods`.
  - Needs a gallery, ranks unique, checked by the schema.
- `Pod.shortTitle`: optional `{ en, id }`, the one-line title on the L3 directory boards.
  - At most `SHORT_TITLE_MAX` (32) characters and shorter than `title` in each locale (schema check).
  - Title Case and no first person like any title (`tests/content/title-case.test.ts`, `first-person.test.ts`).
  - It reaches the 3D chunk as `LabPod.shortTitle` only when set; the L3 directory boards read `shortTitle ?? title`.
  - Every other surface (Classic site, Cmd-K, drawer, OG, JSON-LD, Ask) keeps `title`.
- `Pod.liveUrl`: optional public live site.
  - https, site root only, host in `PUBLIC_LIVE_HOSTS` from `src/content/live-links.ts`, checked by the schema; today only the two MII Microsoft sites.
  - Read it through `podLiveLink(pod)` from `@/content/selectors` (`{ href, host } | null`, re-checks the allowlist; works on `Pod` and the 3D `LabPod.liveUrl`).
  - Every "Visit live site" surface uses it: the case study page, project rows and cards (`PodLiveCta`), the Glass Drawer footer (`RoomView.live`), JSON-LD `sameAs`, and 3D stations such as the L1 Highlights Hall.
  - Render it with `LiveSiteLink`.
  - Ask chunks say a live site exists but never carry the hostname.
  - Adding a host is an owner decision, never a content-only edit.
- `Result.headline`: optional `true` puts a result in the case study's metric strip; at most `HEADLINE_MAX` (3) per pod (schema check). Read the strip's results through `headlineResults(results)` from `@/content/selectors`: the flagged ones in dataset order, else the first three. `HEADLINE_MAX` lives in `selectors.ts` (client-safe) and is re-exported from `schema.ts`. The room-view builder marks those metrics `RoomMetric.headline`.

### Other types

| Type | Field | Rule and where it renders |
|---|---|---|
| `Confidence` | `"self-reported"` | also allowed (C4) |
| `Result` | `Result.context` | optional |
| `Profile` | `Profile.subheadline/currentRole/timezone/story/principles` | added fields |
| `Certification` | `Certification.code`, `Certification.credentialId` | added fields |
| `Certification` | `Certification.expires` | YYYY-MM |
| `Certification` | `Certification.issued` | also allows `YYYY` when the CV gives only a year (TOEFL ITP; never invent a month) |
| `Certification` | `Certification.featured`, `status: "expired"` | added |
| `TimelineEntry` | `TimelineEntry.url/confidence` | added fields |
| `PostRef` | `PostRef.url` | external posts such as Medium get no `/blog` page |
| `ArchitectureNode` | `ArchitectureNode.group` | optional frame name around related nodes in the drawn diagram |
| `Contact` | `Contact.medium`, `Contact.googleScholar`, `Contact.ieeeXplore` | added fields |
| `Publication` | research metadata: `authors`, `publisher`, `date`, `doi`, `citations`, `summary`, `abstract`, `pages`, `pdf`, `code` | all optional; `abstract` is English only, written for the site; `pages` ("1-6", for citations) |
| `Publication` | `Publication.document` | see [Paper PDFs](#paper-pdfs) |
| `library` | `library.researchMetrics` | `source`, `citations`, `hIndex`, `asOf`: always show the date, e.g. "as of Oct 2026" |
| `SideProject` | `SideProject.year` | added field |
| top level | `awards[]` | added |
| `ExperienceData` | `ExperienceData.highlights` | `buildHighlightsData`: `projects` from `pickFeaturedPods`, experience rows, stats, contact; feeds the hall ([floor-l1-lobby.md](floor-l1-lobby.md)) |
| `ExperienceData` | `ExperienceData.engine` | `buildEngineData`: the seven bays with their titles (the dark ones included) for the B1 signs and the point-and-go names; feeds [the Engine Room](floor-b1-engine-room.md) |
| `RoomView` | `RoomView.engine` (`RoomEngine`) | `buildEngineViews`: the B1 station block (diagram, rounds, gates, excerpt or tiles) and resolved labels |
| `RoomView` | `RoomView.cards` (`RoomCard`) | carries the station cards |
| `LibraryData` | `LibraryData.posts[].tags` | carries post tags to the 3D chunk |

### Missions

- Mission steps `{ kind: "palette", filter }` and `{ kind: "surprise" }` (the runner still supports `surprise`; no mission uses it).
- Missions and their static-tier behavior:

  | Mission | Label | 3D steps | Static tier |
  |---|---|---|---|
  | `work` | "Explore the work" | `elevator L3`, then `say` "Pick a wing: Product Engineering, AI Engineering, or Data and ML." | opens `/labs` and says the line |
  | `journey` | "Career timeline, 2019 to 2026" | `elevator L2` only (the rover arrives at the start of the Career Road) | opens `/{locale}/journey` |
  | `projects` | "Browse projects" | `elevator L3` then `palette pods` | opens `/labs` and the pods palette |
  | `blog` | "Read the writing" | `elevator L4` then `palette posts` | opens `/library` and the posts palette |
  | `highlights` | "See the highlights" | `elevator L1`, then `drive` and `open` `L1:highlights-about` | opens `/{locale}#intro` |
  | `cv` | "View CV" | `elevator RF`, then `drive` and `open` `RF:cv` | opens `/{locale}/cv` |
  | `hire` | "Discuss a role or project" | `elevator RF`, then `drive` and `open` `RF:contact` | opens `/{locale}/contact` |
  | `office` | "Watch the AI agents at work" | `elevator L1`, then `drive` and `open` `L1:office` | opens `/{locale}#office` (the Live Agent Office card) |

- The Rover menu lists the missions in catalog `order` (at most 9, keys 1 to 9); the `work` mission ("Explore the work", order 0) rides to L3 and Rover then says to pick a wing. See [hud-and-drawer.md](hud-and-drawer.md).

### Perspectives file

The separate perspectives file, `PerspectivesFileSchema`:

| Field | Rule |
|---|---|
| `status` | file status (`"approved"` publishes entries without an `approved` field) |
| `entries` | 10 to 50 |
| `question` | 120 characters |
| `answer` | 640 characters |
| `tags`, `asOf` | per entry |
| `sources`, `references`, `approved` | optional |
