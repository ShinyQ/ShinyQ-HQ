# Performance

Performance gates and budgets, measurement on real devices, fast local verification and how to write 3D tests.
Index: [AGENTS.md](../../AGENTS.md).

## Performance gates and measurement

### Where budgets live

- Authoritative budgets: appendix 08 section 2 ([08-quality-acceptance.md](../superpowers/specs/agent-hq/08-quality-acceptance.md)).
  - CI numbers win. Change one only with an owner note in the PR.
  - Page View numbers: `lighthouserc.json`. 3D numbers: `e2e/budgets.ts`.

### Budgets

| Budget | Value | Source |
|---|---|---|
| 3D JS after the gate, main path (`?prefetch=off`), one cap for both tiers | under 466.4 KB gzip (measured full 465.4 KB, lite 449.7 KB) | `e2e/budgets.ts` (`BYTES_3D_BUDGET.failAt`) |
| L3 floor chunk (`BYTES_3D_BUDGET.floors`) | L3 20 KB gzip | `e2e/budgets.ts` |
| L4 floor chunk | L4 16 KB gzip | `e2e/budgets.ts` |
| RF floor chunk | RF 8 KB gzip | `e2e/budgets.ts` |
| B1 floor chunk (unlocked session only) | B1 16 KB gzip (measured 5.0 KB) | `e2e/budgets.ts` |
| B1 settled scene calls | under 100 (`FLOOR_SCENE_CAPS.B1`; measured 45 lite, 48 full) | `e2e/budgets.ts` |
| L1 Agent Office total (`BYTES_3D_BUDGET.officeTotal`) | 40 KB gzip: the scene chunk plus the drawer body (plus the replay chunk once it ships), the office chunks' own cap (measured 33,069 B of 40,960 B) | `e2e/budgets.ts` |
| L1 Agent Office scene chunk (`BYTES_3D_BUDGET.office`) | 26.6 KB gzip, idle on every L1 visit and in the session total, a sanity cap inside the office total (measured 26,586 B of 27,200 B: measured plus 614 B) | `e2e/budgets.ts` |
| L1 Agent Office drawer body chunk (`BYTES_3D_BUDGET.officeBody`) | 6.93 KB gzip, incremental over the scene chunk, outside the session total, a sanity cap inside the office total (measured 6,483 B of 7,097 B: measured plus 614 B) | `e2e/budgets.ts` |
| L1 office watch chunk (`BYTES_3D_BUDGET.officeWatch`) | 2.03 KB gzip, inside the session total (measured 1,555 B of 2,075 B: set at 1,461 B plus 614 B) | `e2e/budgets.ts` |
| L1 office beacon chunk (`BYTES_3D_BUDGET.officeBeacon`) | 2.59 KB gzip, outside the session total (measured 2,043 B of 2,657 B: measured plus 614 B) | `e2e/budgets.ts` |
| Session total, full tier (`BYTES_3D_BUDGET.session`) | full 522.4 KB (measured 521.8 KB, 534,358 B of 534,972 B) | `e2e/budgets.ts` |
| Session total, lite tier | lite 506.7 KB (measured 506.1 KB, 518,224 B of 518,838 B) | `e2e/budgets.ts` |
| Study guide reader, downloaded on the Read click (`GUIDE_READER_BUDGET`) | chunk 160 KB gzip (measured 140.8 KB), worker 400 KB gzip (measured 361.3 KB) | `e2e/budgets.ts`, [Study guide reader](#study-guide-reader) |
| Shader programs per floor and tier | within `e2e/perf/baseline.json` + 2 | `e2e/perf/baseline.json`, headroom in `e2e/budgets.ts` (`PROGRAM_HEADROOM`) |
| Full-tier memory round trips (`GPU_MEMORY_BUDGET.fullTierRoundTrips`) | (3) Lobby to Roof round trips, geometries, textures and programs at baseline, heap within the budget | `e2e/budgets.ts` (`GPU_MEMORY_BUDGET`) |
| Look check (`e2e:look`) | at most 0.1% of pixels may differ | `e2e/perf/look.spec.ts` |
| Visual gate, strict profile | per-pixel 0.1, at most 0.1% of pixels | `e2e/visual-gate.spec.ts` |
| Page View LCP | 2 s | `lighthouserc.json` |
| Page View CLS | 0.01 | `lighthouserc.json` |
| Page View TBT | 200 ms | `lighthouserc.json` |
| Page View transfer budgets for fonts, HTML, CSS and JS | see the file (HTML 83,968 B, 82 KB since 2026-10-18; keep at least 4 KB of headroom on every page: the layout sends only `LAYOUT_NAMESPACES`, see [styling-and-i18n.md](styling-and-i18n.md#client-messages)) | `lighthouserc.json` |
| RUM sampling (`RUM_RATE`) | 25% of 3D sessions | `src/experience/perf/rumDecision.ts` |

Lighthouse CI is described in [ci-and-deploy.md](ci-and-deploy.md#ci).

Classic links in the header, nav, crumbs, hero and section heads prefetch on intent (hover, focus, touchstart), never in the viewport: `/en` makes no RSC (`_rsc=`, `.txt`) request without interaction (was 11, plus 4 route chunks). See [page-view.md](page-view.md#navigation).

Layout islands load their heavy parts on first use ([hud-and-drawer.md](hud-and-drawer.md#opening-overlays-and-modals)): the command palette with its search and the Rover menu are lazy chunks (about 5.4 KB and 2.4 KB gzip), and the audio engine (`engine.ts`, `synth.ts`, `music.ts`, about 3.8 KB gzip) loads only when the 3D view needs sound (`src/lib/audio/singleton.ts`, see `src/lib/audio/README.md`), so the Page View never downloads it and the 3D gate's no-interaction session does not either. The HUD index loads on open or at idle, and `GET /api/ask` once per tab session at most for the entry points ([ask.md](ask.md#availability)).

- next-intl `experimental.messages.precompile` was tried and not kept: it compiles every import of `messages/*.json`, and server modules read those as raw strings (`hud/index-data.ts`, `seo.ts`, `og-cards.ts`, `jsonld.ts`, the Ask pack and others), so the export fails. It would drop the ICU parser chunk (about 12 KB gzip on every Classic page) once those modules read raw messages another way.

JetBrains Mono (`jetbrains` in `src/app/fonts.ts`) stays preloaded with Inter and Archivo: it paints in the first viewport of every page.

- Classic site: the header (`>_` tool, EN/ID switch; on desktop also the site name, the nav floor labels and `Ctrl K`) and `pv-data` labels such as the floor eyebrow, filter labels and chip counts. Boot cover: its eyebrow, the role line and the boot log.
- Dropping the preload would swap these from the fallback after first paint. Recheck with a first-viewport scan of computed `font-family` before changing it.

The Cloudflare Web Analytics beacon (production builds only) is requested last: after the `load` event, after the deferred app chunk scripts are inserted (requested; at most 1 s after `load`) and then on idle (500 ms deadline), so it is requested after the HTML, CSS, fonts and every app chunk. See [stats.md](stats.md#cloudflare-web-analytics-beacon).

CV page images (`/{locale}/cv`, the LCP there) are near-lossless WebP, about 27% fewer image bytes than lossless at the same look (SSIM >= 0.997); lossy WebP and AVIF were larger at that quality. Page 1 is eager with `fetchPriority="high"`, later pages `loading="lazy"` (Chrome still fetches page 2 at low priority after page 1: it sits within the lazy-load distance). See [content.md](content.md#cv).

### Classic bundle and the floor layouts

- No chunk an exported page loads carries a floor layout: `experience/config.ts` imports every layout (L1 hall, L2 Career Road, L3 Project Roads and ops, L4 newsroom, RF, B1, the road kit), so only the 3D path may import it.
- Classic-reachable code (the store `src/store/useHQStore.ts`, `hud/drawer/DrawerHost.tsx`, `hud/switchLocale.ts`) reads the floor order from `src/experience/floorOrder.ts` and the Lobby spawn from `src/experience/floors/lobby/spawn.ts`; both import only `@/lib/floors` and types.
- Guards: `tests/unit/floor-order.test.ts` (static import graph of those modules) and `scripts/check-client-chunks.ts` in `bun run build` (fails when a page chunk holds a layout's view zone id, `FLOOR_LAYOUT_MARKERS`).
- The floor layouts (about 22 KB gzip) load only after the 3D gate, on the 3D main path; the 3D caps include them (owner decision, option A: [2026-10-19-floor-order-out-of-classic.md](../decisions/2026-10-19-floor-order-out-of-classic.md), with the measured numbers).

### Perf lane (`e2e/perf/`)

- Runs only with `PERF=1`: `bun run e2e:perf`.
  - CI job `3D perf gates`: `bun run e2e:perf:shard i/N`, duration-balanced shards: the whole lane on 4 shards on `main`, dispatches and the nightly; on a PR, 2 shards running only the perf tests the changed paths affect (`scripts/perf-plan.ts`: a floor's gate and its rides for a floor change, the bytes gate for the HUD, a shared `src/` module the gates of the 3D files that import it (the Ask client `boot` and `bytes`, the certifications the Lobby), `memory-full` only for memory-sensitive paths such as the renderer, `Effects`, the floor chunk loader and shared geometry or materials; [ci-and-deploy.md](ci-and-deploy.md#what-a-pull-request-runs)).
  - Run one perf key locally with the same grep, for example `PERF=1 bunx playwright test --grep "L3 (full|lite): settled"`.
  - Run it when you touch the render path, materials, floor mounting or the 3D chunk's imports.
  - One spec: `E2E_PORT=<port> bun run e2e:perf e2e/perf/<file>` (with `PERF=1` the test dir is `e2e/perf`).
- `floors`, `peaks` and `memory-full` set `sessionStorage["hq:sky"] = "night"` in a `beforeEach`: automation's still night draws no sky, so the gates opt in to measure it as visitors see it at night (`look`, `bytes-3d` and `timeline` do not).
- The same `beforeEach` sets `localStorage["hq:ambience"] = "off"`: synthesizing the floor ambience (the L3 and L4 layers cost about as much as the music) competes with SwiftShader for the CI CPU and skews ride timing, so the render gates carry only the music; `tests/unit/audio-ambience.test.ts`, `tests/unit/audio.test.ts` and `e2e/ambience.spec.ts` cover the ambience.
- Each test writes `perf-report/<id>.json`; `bun scripts/perf-summary.ts gates --head perf-report` prints the tables.

| Spec | What it gates |
|---|---|
| `bytes-3d` | 3D JS after the gate (see below) |
| `floors` | every floor and tier (B1 too, ridden from the Lobby when unlocked): settled scene calls, post passes, triangles, shader programs within `e2e/perf/baseline.json` + 2; L4 also at the Study Vault stop (same caps and L4 program baseline, reported as the settled peak `settled-L4-vault`); L1 and B1 load the Agent Office chunk first, and two more L1 spots hold the same cap and baseline: the office stop (reported as `settled-L1-office`) and the spawn with the Needs Kurniadi beacon lit (`/api/office` answered with `crewA`, reported as `settled-L1-beacon`), and the always-live office from the Lobby: the spawn turned toward the wing (`settled-L1-spawn-wing`) and the lane ring's south point turned toward it (`settled-L1-ring-south`), each once the office is in view and far; at the office stop and from those two spots `/api/office` answers the ship-it script (`shipStep` in `e2e/office-fixtures.ts`, the lanes lit) and the draw calls are read with a burst playing and the production deploy beam running (`playEffects`; the beacon chunk loads before the programs settle, so they count it); at the stop the test also compares the frame rate with the effects to the still office (lite: at least 75%) and holds the GPU objects flat across live switches (three rounds of the ship-it steps, a v3 body, offline through `advance` and back, each with the effects); L1 measured 100 lite and 102 full at the spawn, 101 and 103 with the beacon, 100 and 102 at the spawn turned toward the wing, 65 and 67 at the ring's south point, 44 and 45 at the office stop; lite 13.3 fps with the effects against 14.0 still (SwiftShader); cap 125 |
| `peaks` | boot plus intro, elevator rides through the panel, hover, boosting; every frame |
| `memory-full` | full-tier memory gate (owner decision, see below); it writes the `memory-full` entry of the summary |
| `guide-reader` | the study guide reader's chunk and worker caps (perf key `guides`, see below) |

#### `bytes-3d`

- Main path: 3D JS after the gate under `BYTES_3D_BUDGET.failAt`, 466.4 KB gzip, on both tiers, measured with `?prefetch=off` so it is the main path only.
  - It gates the critical path before the first frame. Measured: full 465.4 KB (476,592 B), lite 449.7 KB (460,458 B) (the full tier adds the lazy `Effects` chunk).
- Floor chunks: each is loaded through `__hq.floorChunks.load` and capped on its own: `BYTES_3D_BUDGET.floors`, L3 20 KB, L4 16 KB, RF 8 KB, B1 16 KB gzip.
  - Incremental: a module shared by two floors counts toward the first one loaded, L3.
- Session total: idle prefetch loads every floor in a normal session, so the session total (main + the public floor chunks, `BYTES_3D_BUDGET.sessionFloors`) has its own cap, `BYTES_3D_BUDGET.session` (owner decision). B1 loads only in an unlocked session, so it is measured in a separate unlocked session and held to `BYTES_3D_BUDGET.floors.B1`. That cap counts B1 plus any modules it shares with the public floors (`?prefetch=off` never loads L3, L4 or RF first), a safe over-count.
  - full 522.4 KB: measured 521.8 KB (main 465.4 KB plus floor chunks 28.9 KB plus the office watch chunk 1.5 KB plus the office scene chunk 26.0 KB).
  - lite 506.7 KB: measured 506.1 KB (main 449.7 KB plus floor chunks 28.9 KB plus the office watch chunk 1.5 KB plus the office scene chunk 26.0 KB).
  - Each cap, `failAt` included, is the measured value plus about 0.6 KB (owner decisions 2026-10-19: the Study Vault, the floor layouts out of the Classic bundle, and the inline idle frame cadence; the same rule relayed for the L1 Agent Office 2026-10-19/20, [decision](../decisions/2026-10-19-agent-office-3d-budgets.md), applied for the office crew, [decision](../decisions/2026-10-21-office-crew-budgets.md), the always-live office, [decision](../decisions/2026-10-21-office-always-live-budgets.md), the ten desks, [decision](../decisions/2026-10-21-office-live-ten-budgets.md), and last for the ship-it pipeline, [decision](../decisions/2026-10-21-office-pipeline-budgets.md)); a PR that grows the 3D path asks the owner, then rebases on `main`, re-measures and sets the caps the same way.
  - Floor chunks measured L3 13.9 KB, L4 11.7 KB, RF 3.3 KB, B1 5.0 KB (B1 only in unlocked sessions).
  - The audio engine chunk is not in either total: it loads only when the 3D view needs sound (a gesture, or a sound after an activation), and the measured sessions make none.
  - Both sessions are a returning visitor's (`asReturningVisitor`), so the intro chunk (`intro/scene.ts`, loaded only by a session that plays the intro; [Boot and intro](3d-experience.md#boot-and-intro)) is in neither total.
  - Asserted and logged; `scripts/perf-report.ts` prints them as "Floor chunks (loaded on demand)".
- Agent Office: its scene chunk loads at idle on every L1 visit (the always-live office, owner decision 2026-10-21, [decision](../decisions/2026-10-21-office-always-live.md); never with `?prefetch=off` on its own, never on the first-frame path), so it is loaded through `__hq.office.load()` right after the watch chunk, held to `BYTES_3D_BUDGET.office` (26.6 KB, measured 26,586 B) and counted in the session total; its drawer body chunk through `__hq.office.loadBody()` after that, held to `BYTES_3D_BUDGET.officeBody` (6.93 KB, measured 6,483 B), outside the session total. Together (plus the replay chunk through `__hq.office.loadReplay()` once it ships) they are held to the office revamp's own budget, `BYTES_3D_BUDGET.officeTotal` 40 KB (owner decision 2026-10-20, measured 33,069 B); the two per-chunk caps are sanity caps inside it ([L1 Agent Office](floor-l1-lobby.md#chunks-and-mounting)).
  - The office watch chunk (`office/watchChunk.ts`: the signal, the 30 s watch and the minimap cue) loads once the first frame went idle on L1 (every L1 session, never with `?prefetch=off`), so it is measured through `__hq.office.loadWatch()` right after the session floors (a module it shares with the office chunks counts here), held to `BYTES_3D_BUDGET.officeWatch` and counted in the session total. The beacon chunk (`office/beaconChunk.ts`: the beacon and deploy beam mesh) loads only the first time a Rover needs Kurniadi or a fresh production deploy succeeds; it is measured last through `__hq.office.loadBeacon()` and held to `BYTES_3D_BUDGET.officeBeacon`, outside the session total (owner decision 2026-10-20, [decision](../decisions/2026-10-20-office-revamp-chunks-contract.md)). The main path keeps only their loader (`office/watchLoader.ts`); Turbopack copies the shared `officeSignal.ts` into each chunk that imports it (the watch, the beacon and the office scene).
  - The Classic page chunks carry no office code (`/en` page scripts 219.0 KB gzip, gzip -9 of the page's chunks): the drawer bodies import the office loader (`office/chunk.ts`) for the office drawer body, and the loader imports no layout (the always-live trigger asks no distance), never `experience/config` (`check-client-chunks`, `tests/unit/floor-order.test.ts`, `tests/unit/office-chunk-graph.test.ts`); the 3D-only shell helpers live in `officeShell.ts`. The `office` strings sit in `CLIENT_NAMESPACES`, so `/en/quick` HTML is unchanged.
- JSON is reported (`other.json`), not capped. The Glass Drawer data is split per floor ([hud-and-drawer.md](hud-and-drawer.md#builders-and-data)), so a Lobby session fetches only the L1 file on idle (7.4 KB gzip of JSON with the twelve Agent Office views: the summary, GitHub and ten desks, was 74.2 KB with the single 340 KB rooms file; the split costs the main path about 0.16 KB gzip).
- Images are reported (`other.image`), not capped. The L1 skills and certification wall logos are one prebuilt WebP atlas (quantized, then lossless) (`scripts/logo-atlas.ts`, [floor-l1-lobby.md](floor-l1-lobby.md#logo-atlas)), one request instead of one per logo (58 today), cached as immutable. It costs more bytes than the sources (about 126 KB against about 81 KB of gzipped SVG and WebP on the wire): a 128 px raster of every logo, quantized only as far as the walls still look the same (lossy WebP smears thin colored edges). Never go back to fetching logos one by one from 3D code.

#### Study guide reader

- `e2e/perf/guide-reader.spec.ts` (perf key `guides`) opens `/en/library?tier=static#guides` with the fixture PDF (`e2e/fixtures/guide-pdf.ts`), clicks Read and gzip-sizes every script loaded after the click:
  - `GUIDE_READER_BUDGET.chunk`, 160 KB: the main-thread JS (the dialog and reader chunks plus pdf.js), measured 142.1 KB;
  - `GUIDE_READER_BUDGET.worker`, 400 KB: the pdf.js worker with its Turbopack bootstrap (the entry plus the chunks in its `#params`), measured 361.3 KB (the pdf.js 6.4 worker alone is about 354 KB);
  - no script loaded before the click carries pdf.js (the snapshot of the initial load is taken right before the click, after a state wait, never `networkidle`).
- The caps measure the modern path (Chromium). The legacy pdf.js build and worker (`pdfjs-dist/legacy/build/`, picked by `needsLegacyPdfjs` in `pdf.ts`) are separate lazy assets loaded only by browsers that lack a built-in the modern build calls; they are about 147 KB and 379 KB gzip and are not capped.
- The key is not 3D: `pagePerfKeys` in `scripts/perf-plan.ts` maps the reader's page code (`src/components/guides/`, `src/content/guides.ts`, `DialogHost.tsx`, `dialog-loaders.ts`, the `/library` page) to `guides`, and `scripts/ci-plan.ts` adds it to a PR's perf keys. Run it alone with `PERF=1 bunx playwright test --grep "the study guide reader stays"`.
- `tests/unit/guide-chunks-graph.test.ts` (every PR) walks the static imports of `src/experience/Experience.tsx` and `src/app/[locale]/layout.tsx` and fails when either reaches `GuideReader.tsx`, `pdf.ts` or any static `pdfjs-dist` import; it also checks that `GuideDialog` imports the reader and `pdf.ts` imports pdf.js dynamically. So the reader adds nothing to the 3D bytes or the Classic pages' initial load.

#### Memory gates

- `memory-full` (owner decision): `GPU_MEMORY_BUDGET.fullTierRoundTrips` (3) Lobby to Roof round trips on the full tier with Motion Full leave geometries, textures and programs at their baseline and the heap within the budget.
  - Its warm-up tour rides with Motion Full as well: a Motion Reduced warm-up left 2 geometries and a program for the first measured trips to build (a false failure in PR #201's CI).
- The lite, reduced-motion memory gate is `e2e/memory.spec.ts` in the regular suite.
- B1 memory: `e2e/memory.spec.ts` rides Lobby to B1 round trips in an unlocked session (`e2e/b1.ts`). The perf lane covers B1 in `floors.spec.ts` (settled, after a ride from the Lobby) and `peaks.spec.ts` (rides L1 to B1 and RF to B1, both tiers).
- Both use the `e2e/hq.ts` memory helpers and the one budget. The baseline and the final read are settled (`readSettledGpuCounters`); the per-trip numbers are for the failure message only and read unsettled (`readGpuCounters`), so each trip still calls the elevator the moment the rover arrives.

#### Program baseline and known peaks

- Programs are read once settled (`waitForStablePrograms` in `e2e/perf/helpers.ts`, used by `floors.spec.ts` and `daynight.spec.ts`): the program count and the warmed floors must read the same over two `PROGRAM_SETTLE.frames` (60) frame windows in a row and at least 5 s.
  - The deadline follows the frame rate, not a fixed time (`programSettleMs` in `e2e/budgets.ts`): room for `PROGRAM_SETTLE.windows` (3) windows at the slowest window's frame time, never under 90 s (or the caller's timeout), never over 6 min. Time granted past the 90 s floor extends the test's timeout, as `waitForFloor` does.
  - Why: the slowest CI runner (4 x EPYC 7763) renders the full-tier L1 at about 1.5 s a frame, so one window takes about 90 s with no change in programs.
  - A timeout names its cause (programs that changed, or too few windows with no change seen), the frames per window and the slowest measured frame time.
- After an intended material or precompile change, regenerate the program baseline and say why in the PR:
  1. `PERF=1 E2E_PORT=<port> bunx playwright test e2e/perf/floors.spec.ts`
  2. `bun scripts/perf-summary.ts baseline --head perf-report --write e2e/perf/baseline.json`
- `KNOWN_OVER` in `e2e/perf/peaks.spec.ts` lists peaks over budget waiting for a fix (expected failures). Remove an id as soon as it passes.

### 3D page data off the gated pages

- The gated pages (`/{locale}`, journey, labs, library, contact and their room pages) do not serialize `ExperienceData` into the HTML or the RSC payload (about 8 to 9 KB gzip per document; numbers in [the decision](../decisions/2026-10-19-3d-page-data-static-json.md)).
- The data is static versioned JSON, `/data/experience/{locale}.json?v=<hash>` (about 9.4 KB gzip), fetched by `ExperienceGate` in parallel with the 3D chunk (`src/experience/data-client.ts`); the Classic site and the static tier never download it. Detail: [3d-experience.md](3d-experience.md#experiencedata).
- The 3D bytes gate counts scripts only, so its numbers do not move; the JSON shows under `json` in its report. Guard: no exported HTML or `.txt` file may carry the payload (check with `grep -rl roomCount out --include=*.html --include=*.txt`).

### 3D mount without a Suspense retry

- `ExperienceGate` renders the loaded 3D component directly, never through `next/dynamic` or `React.lazy`: a lazy component suspends once even when its chunk is in, and React holds that Suspense retry until 300 ms after its fallback showed. Detail: [3d-experience.md](3d-experience.md#gate-and-tiers).
- The first frame (`/en`, returning visitor, `?prefetch=off`, local build, median of 3) is about 400 to 420 ms on both tiers, about 225 to 265 ms earlier than through `next/dynamic` (numbers in [the decision](../decisions/2026-10-20-3d-mount-without-suspense-retry.md)).
- Keep `next/dynamic` and `React.lazy` off the first-frame path.

### Look check

- Before and after any render-path change:
  1. On a main build in `out-main/`: `E2E_DIR=out-main E2E_PORT=<port> bun run e2e:look --update-snapshots`
  2. On yours: `E2E_PORT=<port> bun run e2e:look`
- Canvas at desktop full 1440x900 and 2560x1440 and phone lite 390x844; at most 0.1% of pixels may differ.

### Full-tier composer bytes

- The full tier's composer uses `postprocessing` directly (`scene/postComposer.ts`, see [3d-experience.md](3d-experience.md#full-tier-post-processing)); `@react-three/postprocessing` bundled n8ao into the lazy `Effects` chunk.
- The `Effects` chunk is about 16 KB gzip and loads only on the full tier (the wrapper's version was about 24 KB; numbers in [the floor order decision](../decisions/2026-10-19-floor-order-out-of-classic.md)).
- Same look: the strict visual gate is pixel-equal within its tolerance on every pose. Manual check after a dependency change: no chunk under `out/_next/static/chunks` contains `N8AO` (`grep -l N8AO out/_next/static/chunks/*.js` prints nothing).

### Per-frame work

- Per-frame work (`useFrame`) should do nothing it does not need.
  - Skip when its inputs are unchanged (as `FloatingSigns` does for a parked rover under a still camera).
  - Wrap work that only changes how an object on a floor looks when drawn in `whenDrawn(object, work)` (`src/experience/scene/drawnWork.ts`, as the L3 pod holograms do).
  - That work then skips while FloorLevel hides the floor and catches up in the scene's `onBeforeRender` before a render that shows it, so no frame draws stale data.
- Do not move test-probe writes off the frame (e2e reads several probes as one frame's snapshot).
- Check with CDP `Performance.getMetrics` TaskDuration per rendered frame before and after, and with `scripts/visual-gate.ts --profile strict`.

### Frame rate and timeline

- Never gate time: SwiftShader FPS and timings are noise.
- A parked scene renders at the idle cadence (30 fps or on demand, [3d-experience.md](3d-experience.md#idle-cadence)); it is off under automation, so specs and the perf lane count 60 fps frames. Measure it on a real GPU with `navigator.webdriver` hidden: `__hq.frames()` over 5 s parked and the CDP `Performance.getMetrics` TaskDuration delta (main-thread busy time).
- Frame rate is checked on real devices with `?perf=1` and in the field with the RUM beacon.
  - The `?perf=1` overlay shows FPS p50/p10, frame p95, scene and post calls, GPU objects, tier and renderer, DPR and pixels, and a sixth line with the last elevator ride from `window.__hq.ridePrep.lastRide`.
  - It mounts only with the flag (about 1 KB inside the 3D chunk, never on the Page View).
  - `perfOverlayOn` in `experience/perf/lines.ts` is the one parser of the flag.
- The nightly `perf-nightly.yml` (`bun run e2e:timeline`, `e2e/perf/timeline.spec.ts`, tagged `@nightly`) records the game-first timeline (marks in `src/lib/perf-marks.ts`) as a trend artifact.

### Game-first LCP

- On a game-first visit the LCP is the boot card's owner block (`boot-who`), painted with the SSR boot cover; nothing that mounts later under the cover may become a larger candidate.
  - Chrome records a text block once, at its first paint, grouped by the nearest non-anonymous block; a later, larger block replaces the candidate until the first input. Content painted under the opaque cover counts (no occlusion), and an opacity or visibility reveal counts at the reveal.
  - The HUD (with the controls hint, about 17,400 px2 on a phone) mounts under the cover with the 3D chunk, about 5 s in on a returning slow-4G phone; it used to become the LCP there.
  - The owner block's lines are inline `<span role="paragraph">` split by `<br />` inside one block with zero font size and line height (`.hq-boot-who` in `globals.css`; the 4 px gaps are a bottom-aligned inline block, `.hq-boot-gap`), so their text forms one candidate (about 39,000 px2 at 390 x 844, 50,000 px2 at 1440 x 900) with the same pixels as four stacked paragraphs in Chrome, Safari and Firefox, paragraph roles in all three accessibility trees and one line per row in plain-text copy and `innerText`.
  - Rejected: `display: contents` paragraphs in a flex column (one candidate in Chrome, but lines collapse in Firefox, which takes the line height of text in a `display: contents` element from its block, and a `<br />` there shifts lines in Safari); `display: inline` paragraphs with the `<br />` inside them (the paragraph's empty fragment after the break adds its line height in Chrome).
- `e2e/boot-first.spec.ts` ("game-first LCP", Pixel 7, lite, returning visitor) asserts the last LCP entry is the owner block and lands within 1 s of the cover title's paint (`elementtiming` `hq-headline`).
- Measure a change near the cover or the HUD with a throttled returning visit (slow 4G, 4x CPU) and read every `largest-contentful-paint` entry, not just the last.

### RUM beacon

- Contract: appendix 06 section 4 ([06-data-contracts.md](../superpowers/specs/agent-hq/06-data-contracts.md)). Related: [stats.md](stats.md).
- 25% of 3D sessions (`RUM_RATE`), once per browser session (`sessionStorage["hq:rum"]`), coarse buckets only.
- `POST /api/rum` to Analytics Engine `perf_events`.
- Never under automation: `?rum=1` forces it in a test or on a preview, `?rum=0` opts out.
- Never with Do Not Track or GPC (they win over `?rum=1` too).
- Do not add fields without amending appendix 06 and `src/lib/rum/protocol.ts` together.
- Never send a URL, user agent, renderer string or free text.

## Fast verification

The full local suite takes 20 to 40 minutes on SwiftShader; most of it covers code you did not touch. Verify what you changed locally. PR CI runs only the tests your change affects plus a small smoke set (smart CI, [ci-and-deploy.md](ci-and-deploy.md#what-a-pull-request-runs)); a push to `main` runs what its merged PR's green same-tree run did not (the complement, [ci-and-deploy.md](ci-and-deploy.md#complement-runs-on-main), or everything when there is no such run) and merges that PR run's perf and Lighthouse reports into its own, so `main` keeps complete baselines; the nightly runs the full suite (8 e2e shards, the [nightly-only tests](#nightly-only-e2e-tests) included), the whole perf lane (4 shards) and Lighthouse. A test the map does not tie to your paths runs only after the merge, so keep the `RULES` in `scripts/e2e-plan.ts` current when you add a spec or move code, and add the `full-ci` label for a risky cross-cutting change.

### Which command when

| When | Command | Time |
|---|---|---|
| Before every push | `bun run verify:quick` (typecheck, lint, unit tests, `next build`, then `og:check` over the export) | about 1 to 2 minutes |
| Before every push, after it | `bun run e2e:changed` (only the specs that cover your changed paths) | usually 1 to 4 minutes |
| Render path, materials, floor mounting, the elevator or what the 3D chunk imports changed | `E2E_PORT=<port> bun run e2e:perf` (3D bytes, floors, peaks, the full-tier memory gate) | about 10 to 12 minutes on 2 workers |
| CPU changes | `bun run bench` | |
| Unsure | `bun run e2e:smoke` (static routes, SEO, deploy rules, game-first load, Page View) | about 1 to 2 minutes |
| Shared test infrastructure changed, before a phase PR, or to reproduce a CI failure | `bun run e2e:full` (whole suite) | about 6 to 10 minutes locally |
| Look-preserving changes | `bun scripts/visual-gate.ts` (see below) | about 20 minutes plus builds |

- `verify:quick` plus `e2e:changed`: together about 5 minutes.
- `e2e:changed` never runs the perf lane. The lite memory gate `e2e/memory.spec.ts` runs in the default suite, so `e2e:changed` picks it for memory-related paths.
- Reproduce one CI failure: `bun run e2e:full e2e/career.spec.ts -g "swipe"`.

### `e2e:changed`

- Diffs against the merge base with `origin/main` plus staged, unstaged and untracked files.
- Maps paths to specs in `scripts/e2e-plan.ts`. Examples:

| Changed paths | Specs |
|---|---|
| `src/experience/floors/labs/**` | `labs`, `labs-data`, `labs-paths`, `gallery` and more |
| `src/experience/interact/**` | `interact`, `experience`, `pads` and `career` |
| `src/experience/floors/{floorChunks,floorPrefetch,lazyFloors,FloorChunkPrefetch}` and `floors/chunks/**` | `floor-chunks`, `ride`, `experience`, `labs` and `library-roof` |
| `src/experience/tower/**`, `scene/Director.tsx`, `scene/precompile.ts` and `text-config.ts` | `ride` and `experience` |
| `src/app/**` and `src/components/**` | `pageview`, `static-routes` and `gallery` |
| `src/experience/data-client.ts` (with `ExperienceGate.tsx`) and `src/app/data/**` (the static client data, the 3D page data included) | `boot-first`, `experience` and more (`src/app/data/**` also `labs` and `library-roof`) |
| `src/hud/drawer/**` | the drawer specs, `drawer-solid` included |
| `src/hud/dialog/**` and `src/experience/hints/**` | `onboarding`, `experience` and `camera` |
| `src/hud/dialog/{EngineUnlockLayer,engineRoomAction}`, `hud/{floorRows,FloorButtons}` and `hud/pads/**` | `b1-unlock`, `hud-corners`, `hud` and `pads` (the specs they matched before stay through `ALSO_RULES`) |
| `src/hud/{menu,minimap,settings}/**`, `FloorChip`, `FloorButtons`, `ChunkFailed`, `layout.ts`, `src/lib/{local-pref,quality-pref}.ts` | `hud-corners`, `hud` and `onboarding` (`Joystick` and `boost.ts` add `boost`) |
| `src/hud/Hud.tsx`, `ViewControls`, `src/components/Modal.tsx`, `dialog/DialogBox` and `dialog/placement`, `ask/AskDock` | their own specs plus `hud-corners` |
| `src/hud/FloorButtons.tsx`, `src/hud/Hud.tsx` and `src/experience/Experience.tsx` (the elevator panel, the unbuilt-floor link, the route each floor writes) | their own specs plus `arrivals` (its desktop tour rides the panel to every floor) |
| `src/experience/camera/**` | `camera`, `experience`, `career`, `ride` and `arrivals` |
| `src/experience/config.ts`, `floorOrder.ts`, `floors/lobby/spawn.ts` (also the kiosk specs), `floors/career/**`, `floors/library/**`, `floors/labs/layout.ts`, `floors/roof/layout.ts` and `floors/lobby/observatoryLayout.ts` (arrival points and zones) | `arrivals` plus the floor's own specs |
| `src/experience/input/**`, the rover fade and the rover mesh and runtime | `camera` and `experience` (the mesh and runtime add `rover-idle` and `idle-cadence`) |
| `src/experience/rover/{idle,activity}.ts` | `rover-idle` (`idle.ts` adds `idle-cadence`) |
| The L4 Study Vault (`floors/library/{decor/StudyVault,decor/vault,layout,model,concepts/newsroom}`, `Library.tsx`, `interact/{registry,pick}.ts`, `hud/events.ts`), the reader (`src/components/guides/**`, `DialogHost.tsx`) and `e2e/fixtures/guide-pdf.ts` | their own specs plus `guides-vault` (through `ALSO_RULES`) |
| `Readable`, `HoloIcon`, the scene probes and `tower/FloorLevel.tsx` | `camera`, `career`, `experience` and `ride` |
| `src/experience/scene/{FrameLoop,framePacer,cover,coverWatch,idle}`, `CanvasBoundary`, `recovery` and `tower/rideClock` | `lifecycle`, `experience` and `pads` (the scene files add `idle-cadence`) |
| `fx/useDispose`, `scene/memoryProbe`, `scene/sharedResources` and floor mounting (`tower/{Tower,near,FloorLevel}`) | `memory` and `experience` |
| `src/experience/sky/**` and `src/lib/day-night.ts` | `daynight` and `experience` |
| `src/experience/floors/{engine/**,EngineRoom.tsx,chunks/engine.ts}`, `hud/drawer/EngineBody.tsx`, `content/room-views/engine.ts`, `experience/b1.ts`, `hud/floorRows.ts`, `e2e/b1.ts` | `engine-room`, `b1-unlock`, `floor-chunks`, `memory` and more (`floors/engine/layout.ts` adds `arrivals` and `memory`) |
| L1 Agent Office: `floors/lobby/office/**` (scene and drawer body chunks), `officeLayout`, `officeShell`, `src/lib/office/{poll,model,protocol,fixtures}.ts`, `hud/OfficeLayer.tsx` (plus its HUD specs: `experience`, `missions`, `drawer-solid`, `hud`), `e2e/office-fixtures.ts` | `office`, `experience`, `highlights`, `interact`, `onboarding` and `hud-corners` (the office Functions and the Worker are unit tested only); `src/lib/office/**` adds `office-classic` |
| Classic office card: `src/components/office/**` (the home page's `#office`) | `office-classic` and `pageview` (`src/app/[locale]/page.tsx` adds `office-classic`) |
| `e2e/hq.ts`, `playwright.config.ts`, `package.json`, `bun.lock` or `next.config.ts` | the full suite |
| unmapped paths | adds the smoke specs |
| docs and unit tests | nothing |

- `ALSO_RULES` in `scripts/e2e-plan.ts` add specs on top of the first matching rule: shared files that the B1 Engine Room touched (floor rows and picker, drawer data and host, audio, the sky controller, the tower and shaft, chunk loading and prefetch, the data route) keep their own specs and add `engine-room`; the drawer data per floor (`hud/drawer/{data,data-path}.ts`, `DrawerHost.tsx`, `content/room-views/index.ts`, the data route) adds `floor-chunks` and every floor's deep-link specs (`labs`, `highlights`, `visits`, `production`, `reactor`, `topics`, `career`, `library-roof`); the Cmd-K files (`hudActions`, `search`, `palette-types`, `MissionHud`) add `b1-unlock`; `src/lib/office/**` and the home page add `office-classic`; so do the unlock's producers (`src/store/`, `Experience.tsx`, `ExperienceGate.tsx`, `src/lib/audio/engine.ts`).
- `scripts/b1-shots.ts` (like the other capture scripts) is offline tooling: it runs no spec.
- `scripts/office-shots.ts` (the Agent Office owner captures: the nine states, the drawers and the modes at 1440x900, 820x1180 and 390x844 on both tiers, `/api/office` answered from `e2e/office-fixtures.ts`) is offline tooling too.
- The perf planner (`scripts/perf-plan.ts`, PR CI only) maps the lazy B1 files (`floors/engine/**`, `EngineRoom.tsx`, `chunks/engine.ts`, `EngineBody`, `room-views/engine.ts`) to `bytes`, `floor:B1` and `ride:B1`. `floors/engine/layout.ts` and `src/experience/b1.ts` are on the main 3D path (the tower, the registry and the store read them), so they keep the full lane. The office's shared client modules (`src/lib/office/{poll,model,protocol}.ts`) map to `bytes`, `floor:L1` and `floor:B1` (the B1 gate loads the office before the ride); `src/lib/office/fixtures.ts` ships no client code and moves no gate. The office's 3D files (`floors/lobby/office/**`, `officeLayout`, `officeShell`) take the Lobby keys plus `floor:B1`.
- Options: `--dry` prints the plan, `--base <ref>` changes the base, extra args go to Playwright (`bun run e2e:changed --headed`).
- When you add a spec or a folder, add its rule (a unit test checks every spec is known).

### Benches

- `bun run bench` runs the Vitest benches in `tests/bench/` (path finding on the real layouts, palette typing) against frozen copies of the old code in `tests/helpers/*-legacy.ts`.
- Use it for CPU changes and paste the table into the PR.

### Screenshots

- `bun run screenshots`, `screenshots:pages` (15 minutes or more) run only when visuals change and the owner asks for captures, or in CI:
  - nightly on `main`;
  - on demand (Actions > Screenshots > Run workflow);
  - on a PR labelled `screenshots` (also automatic for changes under `docs/design/**`).
- Artifacts: `screenshots`.

### Visual gate

- For look-preserving changes (render budget, batching, visibility, anything that may move pixels):
  `E2E_PORT=<port> bun scripts/visual-gate.ts --base HEAD --profile strict|msaa|batching|release`
  - Builds the base ref in a sibling worktree.
  - `--head <ref>` compares another commit instead of the working tree (builds are cached per commit in sibling worktrees).
  - Captures 3 devices (full 1440x900@2, full 2560x1440@1, lite 390x844) x 8 poses at fixed frame counts with a virtual frame clock (`e2e/vclock.ts`).
  - Runs on the real GPU on macOS (ANGLE Metal; `VISUAL_GATE_GPU=swiftshader` for the CI renderer).
  - Compares the working tree build within the profile's thresholds (strict: per-pixel 0.1, at most 0.1% of pixels).
  - About 20 minutes on an M-series Mac plus builds; one run at a time.
  - `--self` measures the harness noise.
- GPU timings on a real GPU: `bun scripts/perf-gpu.ts sp4|sp9` (results in `docs/perf/r5-gpu.md`).

### Workers and stale builds

- Playwright uses 2 workers locally and on each CI shard (4 vCPU runners).
  - Every worker renders WebGL on the CPU, so more workers starve each other and make 3D tests time out; do not raise it.
  - Do not run two e2e suites at once on one machine.
- Turbopack can serve stale CSS after large style or dependency changes: `rm -rf .next` before `verify:quick` if the export looks wrong.
- Tailwind scans every file in the repo, docs included: a utility class written in a plan or a doc snippet ships in the stylesheet (budget 20,480 B). Use utilities the stylesheet already has.
- B1 UI strings live in the 3D-only `engine` message namespace (`CLIENT_NAMESPACES`, not `LAYOUT_NAMESPACES`), so they never ride in the Classic pages' HTML (budget 80 KB). Read floor labels through `useFloorLabel`.
- `e2e:*` serves `out/` from the last build, so rebuild after code changes (`verify:quick` does).

### CI shards

- CI shards with `scripts/e2e-shard.ts` (both lanes):
  - `playwright test --list`, then the longest test first onto the least-loaded worker by the CI medians in `e2e/durations.json`, counting `CI_WORKERS_PER_SHARD` (2) Playwright workers per shard, so a long test fills one worker while its shard's other worker takes shorter tests. The worker count is a constant: every shard computes the same plan.
  - Each shard logs its estimate (`about N worker-s, M s on 2 workers`) and a runner fingerprint (`runner: <vCPUs> x <CPU model>, sha256 <n> MB/s`).
  - Unknown tests count as the median; without the file it falls back to round-robin.
  - Playwright's own `--shard` cuts contiguous blocks.
- Refresh the timings with `bun run e2e:durations` (the last 5 green nightly runs) when the `E2E shard n/8` job times drift apart; PR shard counts are sized from the same file, without the nightly-only tests.
  - It skips runs without test results, divides each job's samples by its runner speed factor (the job's median ratio to the tests' medians; `normalizeRunnerSpeed`) before the medians, and prints each job's factor and runner.
  - GitHub runners differ in CPU speed and SwiftShader is CPU-bound: every test of a shard runs at about its runner's factor, 0.65 to 1.21 across 7 runs on 2026-10-18. A static plan cannot see that, so equal estimates still finish about 3 min apart on 9 to 10 min shards.
- `bun run e2e:shard 1/8 --dry` prints the plan.
- Shards upload blob reports that `Build, CV and e2e` merges into the `playwright-report` artifact.
- Reproduce a shard locally: `bun run e2e:shard 2/8`.

## Writing 3D tests

- Wait on state, never on time. Use the helpers in `e2e/hq.ts`:
  - `enterHQ`.
  - `enterFloorRoute`: deep link, waits for the scene loop.
  - `waitForSceneLive`: the phase is `explore` before the first frame on deep links, and input sent earlier is dropped.
  - `waitForCameraSettle`: counts rendered frames, so a stalled main thread does not look settled.
  - `waitForFrames`, `waitForFloor`, `waitForRoom`, `waitForRoverMove`.
  - `waitForFloor` follows the ride, not the clock: rides are frame-bound (`RIDE_CAP`, `MAX_PHYSICS_STEP`), so at about 1 fps on a busy SwiftShader runner one trip takes minutes. Its `timeout` is a no-progress window (the live ride from `__hq.motion()` and the rover position); time spent while the ride moves extends the test's timeout, and a trip past `RIDE_FRAME_BUDGET` frames fails. The budgets themselves (scene calls, triangles, memory) never loosen.
  - `expect.poll` for values.
- Static pages: `openPage(page, url)` (or `waitForHydration` after a reload or full navigation) before clicking client islands.
  - The Next.js chunks load after first paint, so `load` fires before hydration (signal: `html[data-hydrated]`, set by `MissionHud`).
  - A URL assertion after a client-side navigation (`router.push`: the RSC payload plus the page chunk) uses `{ timeout: NAV_TIMEOUT }` (`e2e/hq.ts`, 15 s): a CI runner shared with WebGL workers can stall the whole browser for 5 to 6 s, longer than the 5 s expect default.
  - Name UI by its message key (`en.hud.launcher.askRover`), not literal text, so a rename breaks the typecheck instead of a test run.
- `page.waitForTimeout` is only for proving that nothing happens (for example that `?tier=static` never mounts the canvas).
- Pass `?tier=lite` (no bloom or motes) unless the test is about the full tier.
  - Without `?tier=`, auto-detection reads the renderer: SwiftShader is static, and on a real GPU a known-weak integrated GPU (Intel HD or UHD Graphics, low-end Mali, Adreno 5xx and below; `WEAK_GPU` in `src/lib/gpu-tier.ts`) is lite, so a full-tier test or capture on such a machine passes `?tier=full`.
- Agent Office tests drive the lazy chunk through `__hq.office` ([floor-l1-lobby.md](floor-l1-lobby.md#probes-and-tests)), never through time:
  - `load()` and `loadBody()` load the scene and drawer body chunks; `state()` is the scene chunk's state; `asks()` counts the speculative trigger's asks after the first frame went idle (a `?prefetch=off` test proves the trigger ran yet `state()` stayed `idle`).
  - `test()` (once loaded): `poll()` fetches now (and lets its one fetch land while nothing wants the poller), `settled()` counts settled fetches (wait for it to grow: a 204 keeps the feed unchanged), `advance(ms)` skews the poller's clock to cross the 60 s keep-last window, `feed()` and `wanted()` read the state.
  - Answer `/api/office` with a route from `e2e/office-fixtures.ts` or `OFFICE_FIXTURES`.
- Memory gates read `readSettledGpuCounters` and `readJsHeapAfterGc` and assert with `expectNoGpuGrowth` against `GPU_MEMORY_BUDGET` (`e2e/budgets.ts` is the one definition of the counts, trips, toggles and heap slack).

### Animation speed

Functional specs run rides, drives, camera eases and the intro 4x faster in game time; the perf lane and the memory gates never do (owner experiment, [decisions.md](../decisions.md)).

- Runtime: `animationSpeed()` (`src/experience/scene/animationSpeed.ts`) is 1 unless `navigator.webdriver` is set and a fixture set `window.__hqE2ESpeed` (at most `MAX_ANIMATION_SPEED`, 8). It is read once per frame and multiplies the time after the per-frame caps, so a slow SwiftShader frame still moves 4x:
  - the ride stages (`advanceRide` `speed`); the closed-door waits (`held`, `PREPARE_TIMEOUT`, `chunkHeld`) stay on real frame time, so the car never moves before the floor is ready;
  - the autopilot (`RoverController.step` `speed`: the door approach, the arrival roll-on, point-and-go, missions) and the beam; manual driving stays real-time;
  - `CameraDirector`'s eases, the arrival glide and the intro clock; held Q/E/R/F and the zoom push idle stay real-time.
  - Decorative clocks (orbiting labels, shaders, rover idle), HUD timers and mission `say` pauses keep real time.
  - The store's rover mirror (`setRover`, every `STORE_SYNC_S`) syncs `speed` times as often, so `snapshot().rover` lags the live pose by the same game distance as at 1x.
- Fixture (`e2e/hq.ts`): a functional spec opts in with `test.beforeEach(({ context }) => fastAnimations(context))`. `E2E_SPEED` sets the speed (default 4; `E2E_SPEED=1` runs the same specs at real speed to measure or bisect); `PERF=1` makes `fastAnimations` a no-op.
- `resetRenderPeaks` drops the page to real speed until `readRenderPeaks`, so every render-budget window measures at real speed.
- A test that asserts pacing, a duration or a trajectory sampled frame by frame (the intro's length, the dolly's car heights `distinctY`, a closest approach, a mid-drive position window) calls `realAnimations(page | context)` before navigating, or `setAnimationSpeed(page, 1)` on a live page.
- Never opted in (a unit test checks the first four): `e2e/perf/**`, `memory.spec.ts`, `gpu.spec.ts`, `ride.spec.ts`; also `motion.spec.ts` and `fast-return.spec.ts` (they sample the dolly and the drive mid-flight), `perf-probes`, `daynight`, `rover-idle`, `lifecycle`, `boost` (manual driving), the visual and screenshot specs and the static-page specs.
- Add `fastAnimations` to a new spec only when its assertions are end states (a floor, a room, a pose after settling), and run it at `E2E_SPEED=1` and the default once before pushing.

### Keeping the suite lean

Each check lives in one place, at the cheapest level that can see the regression (the 2026-10-18 trim, [decisions.md](../decisions.md)):

- Settled floor budgets on a deep link belong to `e2e/perf/floors.spec.ts` (both tiers, with the program baseline). A default-suite spec measures a budget only where the perf lane does not look: a drive, a pose, a station, reduced motion, first person.
- A check with no quality-tier input runs on lite (label placement, routes, HUD, drawers). Run the full tier only for what it adds (bloom, motes, programs, its own budget numbers).
- Do not sample a pose sweep in CI when every pose sits far under budget: keep the highest pose and put the rest behind a capture switch (`LABS_SHOTS`, `L4_SHOTS`) or the local visual gate.
- Layout facts (positions, distances, mirror symmetry, reachable stops, counts) go into Vitest against the pure layout modules; the e2e keeps one case that proves the wiring.
- One ride tour covers the elevator panel, arrivals and routes on every floor (`e2e/arrivals.spec.ts`); add per-floor ride checks there rather than in a new tour.
- Before adding an e2e, search the suite for the same flow (`grep -rn "<the probe or test id>" e2e/`); fold a new assertion into the test that already reaches that state.
- A slow budget sweep, or a second viewport or tier of the same behavior, ends its title with ` @nightly` (see [Nightly-only e2e tests](#nightly-only-e2e-tests)).

### Nightly-only e2e tests

Owner decision 2026-10-18 ([decisions.md](../decisions.md)): no test is dropped; slow budget and matrix checks run only in the nightly.

- A test whose title ends with ` @nightly` runs in the nightly schedule run of `ci.yml` and on a dispatch with the `nightly` input. Pull requests and pushes to `main` (complement runs included) pass `--grep-invert @nightly`, and so does `bun run e2e:changed` (`--nightly` runs them too).
- Shard sizing leaves them out (`specSeconds` in `scripts/e2e-plan.ts`); a selection that matches no test passes (`--pass-with-no-tests` in `scripts/e2e-shard.ts`).
- `bun run e2e:durations` reads the nightly runs by default, the only runs that cover every test.
- A unit test in `tests/unit/e2e-plan.test.ts` pins the count: update it and this list together.
- Per behavior, pull requests and `main` keep one representative viewport and tier; the rest of the matrix is nightly.

| Test | Worker-s | What still guards it on PRs and `main` |
|---|---|---|
| `library-labels`: L4 timeline labels, desktop and phone | 108 + 72 | `tests/unit/library-label-sweep.test.ts`: the same poses and checks without a renderer, on every PR. |
| `gpu`: boot warms every floor (full tier) | 288 | `e2e/perf/floors.spec.ts` (programs per floor against the baseline) when the render path changes. |
| `daynight`: day costs the same programs and calls as night on L1 | 120 | The day and night behavior tests in `daynight.spec.ts`; the L1 perf gate. |
| `highlights`: L1 headroom under the floor budget (full) | 132 | The L1 perf gate on both tiers; the reduced-motion station and gate checks in `highlights.spec.ts`. |
| `memory`: 10 Lobby to Roof round trips (lite) | 162 | `e2e/perf/memory-full.spec.ts` (the same round trips on the full tier); the B1 round trips and Page View toggles stay. |
| `topics`: end plaza labels (desktop) | 50.8 | The phone variant (narrower caps, the most crowded screen). |
| `labs-paths`: arrival (1440x900 full) | 54.7 | The phone arrival; the desktop full tier through the reactor drive. |

- Not moved: the remaining viewport or tier pairs cost under 25 s per variant (HUD corners, drawer, Page View landing) or test tier-specific behavior (the first boost's programs, the Labs arrival calls per tier).
- The gpu, daynight and highlights checks do not follow a PR's perf selection: the perf lane runs only `e2e/perf/`, so it would need a second test directory and a per-floor grep in the e2e job.

### Retries and flaky tests

- No blanket retries: CI retries once; fix a flaky test instead of adding retries.
- The `Build, CV and e2e` job summary lists every test that passed only on retry (`scripts/flaky-report.ts`, plus a warning annotation).
- Give each one an issue with an owner, never a quarantine.
