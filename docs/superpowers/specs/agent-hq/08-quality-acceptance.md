# Appendix 08: Quality, Performance and Acceptance

Status: living appendix, implemented across #1 to #12 (phases 0 to 5) and the later rounds, kept current with the code (last updated in #157)

Part of [Agent HQ design spec](../2026-10-09-agent-hq-design.md).

## 1. Browser and device support

| Tier | Requirement | Experience |
|---|---|---|
| `full` | WebGL2, fine pointer, not a low-memory or low-core device (local heuristic, `src/lib/gpu-tier.ts`) | Everything, including bloom; DPR up to 2 within an 8.3 MP pixel budget, composer MSAA 4 below DPR 1.5; a runtime safety net steps DPR, then MSAA, then bloom on sustained drops (at most 2 changes per minute) |
| `lite` | WebGL2 available, lower tier or mobile | No bloom, no point lights, fewer particles, DPR ≤ 1.5 |
| `static` | No WebGL2, tier 0, `saveData`, or a WebGL error that survives one automatic remount (the notice offers Retry 3D) | HTML pages only (same content and missions as links) |

Supported browsers: latest 2 versions of Chrome, Edge, Firefox and Safari; iOS Safari 16.4+; Android Chrome 110+. Visitors can force a tier with `?tier=lite` or `?tier=static`.

## 2. Performance budgets

CI budgets are authoritative (owner decision 2026-10-13). Where a CI gate exists, its number is the budget; the "Spec ceiling" column is only the outer limit a CI number may never be raised past. A budget changes only with an owner note in the PR that needs it. The numbers live in `lighthouserc.json` (Page View) and `e2e/budgets.ts` (3D). Only deterministic counters and bytes are gated; time-based 3D numbers are trends or real-device checks, because SwiftShader timing says nothing about a GPU.

| Metric | CI gate (authoritative) | Spec ceiling | Measured by |
|---|---|---|---|
| LCP, Page View (`/en`, `/id`, `/en/quick`, `/en/journey`, a pod page, `/en/contact`; `/en/cv` warn-only) | < 2,000 ms (median of 3) | 2.5 s | Lighthouse CI, simulated mobile 4G |
| CLS | < 0.01 | 0.05 | Lighthouse CI |
| TBT | < 200 ms | 300 ms | Lighthouse CI |
| Page View transfer per page | JS 240 KB (245,760 B), CSS 20 KB, fonts 60 KB, HTML 80 KB; warn at 90% | JS 350 KB | Lighthouse CI `resource-summary`; per-chunk diff against main in the job summary |
| 3D JS after the gate (gzip), lite and full, main path | < 450 KB each | 600 KB | `e2e/perf/bytes-3d.spec.ts`: transfer sizes after the 3D gate (floor chunks excluded, `?prefetch=off`) minus the Page View's scripts; fonts, JSON and CSS reported. 450 KB gates the critical path before the first frame; the session total (main + all floor chunks, which idle prefetch loads) is capped at 470 KB full and 446.4 KB lite (owner decision 2026-10-16: the measured 455.0 and 431.4 KB plus 15 KB) |
| 3D floor chunk, loaded on demand (gzip) | L3 <= 20 KB, L4 <= 16 KB, RF <= 8 KB (owner-approved in the Round 7 design, 2026-10-15) | none | `e2e/perf/bytes-3d.spec.ts`: the main path is measured with `?prefetch=off`, then each floor loads through `__hq.floorChunks.load` |
| Scene draw calls per floor, settled, both tiers | < 150; L1 <= 125, RF <= 79 | 150 | `expectRenderBudget`: worst frame over at least 20 frames and 1.2 s |
| Post-processing passes (full tier) | <= 20 | 20 | same, counted apart from scene calls |
| Scene draw calls at peaks: boot plus intro, every elevator ride, hover, boosting | < 150 | 150 | `e2e/perf/peaks.spec.ts` (scene calls, and every render pass of the worst whole frame), every frame of the window |
| Triangles per frame | < 30,000 | 30,000 | `expectRenderBudget` |
| Shader programs per floor, both tiers | <= baseline + 2 (`e2e/perf/baseline.json`) | none | `e2e/perf/floors.spec.ts` |
| Memory after 10 Lobby to Roof round trips and 5 Page View toggles | geometries, textures and `programs.length` back to their baseline (delta 0); JS heap growth < 2 MB | no growth | `e2e/memory.spec.ts` (P3, lite, reduced motion) and `e2e/perf/memory-full.spec.ts` (3 round trips on the full tier with Motion Full, owner decision 16 of 2026-10-14) on `renderer.info` (three.js has no material count) |
| Frame rate | none (not measurable in CI) | >= 55 fps desktop full, >= 30 fps mid-range phone lite; rendering is capped at 60 fps on high-refresh displays (no idle cap) | `scripts/perf-gpu.ts sp4` on real GPUs (frame p95 <= 18 ms) and the `?perf=1` overlay before a release; the runtime safety net and the RUM beacon FPS buckets (appendix 06 section 4) in the field |
| Game-first timeline: cover paint, headline, first frame, intro end, first drawer | trend only (nightly artifact) | headline < 1.5 s and first frame < 6 s on the P1 profile | `.github/workflows/perf-nightly.yml` (`e2e/perf/timeline.spec.ts`) |
| Elevator dolly | At least 12 distinct car heights and no jump above 25% of the trip, even under a 6x CPU throttle; no shader compiled while the car moves | same | `e2e/ride.spec.ts` (car height sampled every frame, `window.__hq.ridePrep.lastRide`); on real devices `?perf=1` shows the last ride in the overlay and logs one line per ride |
| Spectacle effects (L2 horizon and origin, L3 reactor and waterfalls, floating signs) | One shared holo shader program (instanced, double sided, `fx/holoFx.ts`); L2 at most +3k triangles and +6 scene calls, L3 at most +6k triangles and +10 scene calls over main at every pose and ride; static under reduced motion (no spin above 0.2 rad/s, no flow); lite draws fewer towers, rings, strips and waterfall panels | same | `e2e/perf/floors.spec.ts`, `e2e/perf/peaks.spec.ts`, `e2e/spectacle.spec.ts` (`__hq.probes.spectacle` frozen under reduced motion) |
| L3 Ops Control Room | No new program (merged boxes, line batch and text batch as on the directory wall, the floating sign program): L3 within `e2e/perf/baseline.json` + 2; 5 extra scene calls, 7 with the live panel; L3 under 150 scene calls and 30k triangles at every peak; lite drops the graph lines; static (nothing animates, so reduced motion needs nothing); the live panel only from real data and hidden when the snapshot is missing, invalid or older than 7 days | same | `e2e/production.spec.ts` (`__hq.probes.ops`, `expectRenderBudget` under reduced motion), `e2e/perf/floors.spec.ts` |
| L3 Data and ML annex | No new material or program (pods, panel, sign, road and highlights reuse the existing meshes and the shared holo program: L3 within `e2e/perf/baseline.json` + 2); the data panel joins the directory wall's 3 calls and the wing sign the sign group; each data pod adds only its billboard title; L3 under 150 scene calls and 30k triangles at the annex and with the Data ring lit | same | `e2e/labs-data.spec.ts` (`expectRenderBudget` at the far data pod and with the pick), `e2e/perf/floors.spec.ts` |
| L3 Tech Reactor | Shared holo program (no new program: L3 within `e2e/perf/baseline.json` + 2); 2 extra scene calls idle (ring labels), 4 with a pick (plus pod highlights and road glow, both instanced); L3 under 150 scene calls and 30k triangles with a pick; lite draws no glow curtains or floor ring and shorter beacons; reduced motion holds the rings still, Surprise me included | same | `e2e/reactor.spec.ts` (`__hq.probes.reactor`, `expectRenderBudget` with a pick), `e2e/perf/floors.spec.ts` |
| L4 Topic Constellation | Shared holo program, instanced with instance colors (no new program: L4 within `e2e/perf/baseline.json` + 2); idle adds the pedestal and monument columns (1), the orbs (1), the links (1, full only) and one sign group (2); a pick adds the station beacons and road glow (2, the shared `FilterHighlights`); L4 under 150 scene calls and 30k triangles with a pick; lite drops orb halos, links and glow curtains and shortens the beacons; reduced motion holds the orbit and the pulse | same | `e2e/topics.spec.ts` (`__hq.probes.topics`, `expectRenderBudget` with a pick), `e2e/perf/floors.spec.ts` |
| Visitor Observatory (L1 south-west corner, moved from RF on 2026-10-14) and the L1 visits tile | Reuses the holo-fx program (modes `globe` and `dot`) and the hall's merged solid and line materials: no new program (L1 within `e2e/perf/baseline.json` + 2); +7 scene calls on L1 (plinth, outline, globe body, land dots, country dots, panel plates, panel text) and about +6k triangles on full (+2.6k on lite); L1 stays at most 125 scene calls and under 30k triangles at the spawn, the elevator arrival and the station; RF is back to its pre-#90 deck and cap; the L1 ring tile adds no draw call (instanced); globe still under reduced motion | same | `e2e/visits.spec.ts` (budget at the spawn, `__hq.probes.spectacle.observatory` frozen), `e2e/perf/floors.spec.ts` |
| Public visit stats on the Classic site | The Contact "Visits" panel and its map data load in a lazy chunk when the section nears the viewport (never under the 3D tower); the home ticker item and the footer switch add about 2.3 KB gzip | JS 240 KB | Lighthouse CI `resource-summary` |
| Boost effects | At most 3 extra draw calls while boosting (trail, streaks, sparks), 0 when not boosting; idle frames identical to no boost; no shader compiled on the first boost; reduced motion shows none | same | `e2e/boost.spec.ts` (`__hq.rover.boostFx`, `trail`, `streaks`, `sparks`, `boostFov`, `boostPitch`) |
| Fast return (Return pads, beam into the car) | The Return disc joins the instanced pad mesh (0 calls); one icon (1 call lite, 2 full); the sign 2 calls only within the label fade range, 0 beyond; the beam column 1 call while a beam runs. No new shader programs; ride stats unchanged (`programs` 0, at least 12 distinct car heights) | same | `e2e/fast-return.spec.ts`, `e2e/perf/floors.spec.ts`, `e2e/perf/peaks.spec.ts`, `e2e/ride.spec.ts` |
| Client chunks | Contain no zod or content loader (`_zod`, `readFileSync`, `site-content`) | same | Post-build gate `scripts/check-client-chunks.ts` (part of `bun run build`) |
| Troika font cuts | At most 64 KB in total, every in-world character covered | same | `tests/content/troika-fonts.test.ts` |
| Bytes before the first 3D frame (game-first `/en`, lite) | Only the HTML, CSS, page fonts, initial JS and the 3D chunks; no Page View images, link prefetch or room data | same | `e2e/boot-first.spec.ts` quiet boot |

Known over budget: none (`KNOWN_OVER` in `e2e/perf/peaks.spec.ts` is empty; an id goes there only with its measurement in the PR, and leaves as soon as its test passes). The two elevator rides P4 recorded there (`lite ride-L3-L2`: 124 scene calls, 31,306 triangles; `full ride-L2-L1`: 116 scene calls plus 17 post passes, 34,059 triangles) drew the floor under a still solid slab while the car was parked; the ride cull (`tower/rideCull.ts`) skips every mesh whose bounds, clipped to the view frustum, lie in a solid slab's shadow, which brings them to 89 scene calls and 25,966 triangles, and 86 scene calls plus 17 post passes and 25,727 triangles. A per-frame check on a real GPU (each ride frame rendered with and without the culled meshes) finds no change beyond the renderer's own 1 to 3 pixel noise at 1/255, and the visual gate's ride poses match main.

Highlights Hall gallery (spectacle round, `docs/superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md` Part 2): the rebuild may add at most 20 scene calls to any L1 view (the hard cap stays 125) and keeps every peak under 30,000 triangles. Its instanced effects (lights, stat tiles, beacon rings) cannot be frustum culled per mesh, so `HallView` hides them while the hall's bounds (tested as a 6 x 6 grid of cells) are outside the view; the Lobby spawn draws fewer calls than before. No real lights on any tier (a light would change the program of every lit material in the tower). Every hall effect (stage lights, the gateway curtain and the portal, stat tiles, screenshots, the portrait hologram, the beacon rings) and the gateway sign's plate draw with the shared holo program (`fx/holoFx.ts`, `HOLO_MODE.stage`, per-instance kinds), so the gallery adds exactly that one program to L1 on each tier (lite 42 to 43, full 60 to 61 measured on a Metal GPU; the committed baseline moves by 1 on both tiers).

## 3. Test strategy

| Layer | Tool | What |
|---|---|---|
| Content | Vitest | Schema validation, all `id` translations present, public-safety lint (blocklist of client names, codenames, private repo names from a private list kept outside the repo and injected in CI as the required `SAFETY_BLOCKLIST` secret: `scripts/scan-export.ts` fails `main` and production deploy runs without it and warns on pull requests; failure output names private terms only as `private term #n`), no em dashes in any text, asset existence |
| Logic | Vitest | Mission runner (each mission's step sequence, cancel), navgrid A* (reachability, snapping), URL parse/serialize round-trip, input intent mapping, store actions |
| Components | Vitest + Testing Library | HUD: Rover Terminal keyboard flow, palette search and grouping, drawer tabs and focus trap, language toggle |
| E2E | Playwright | Boot and intro skip, each mission end to end, ⌘K to a pod, elevator via wheel and panel, deep link to a pod, hologram view, README toggle, language switch, Quick view, static tier fallback (`?tier=static`) |
| Visual | Playwright screenshots | Lobby, L2 corridor, L3 with drawer, hologram, Roof, Quick view at 1440×900, 1024×1366 and 390×844 (WebGL via SwiftShader in CI) |
| Accessibility | axe-core in Playwright | Zero serious/critical violations on static pages and HUD overlays |
| Performance | Lighthouse CI (a warm-up run of `/en?lhci-warmup=1` first, never asserted); Playwright perf lane (`bun run e2e:perf`, CI job `3D perf gates`); nightly timeline; `?perf=1` and RUM for real devices | Budgets in section 2 on `/en`, `/id`, `/en/quick`, `/en/journey`, `/en/labs/voice-ai-contact-center`, `/en/contact` (3 runs each; `/en/cv` too, warn-only) and every 3D floor on both tiers. CI budgets (`lighthouserc.json`, `e2e/budgets.ts`) are authoritative. |

## 4. Acceptance criteria per build phase

### Phase 0: scaffold and content
- The repo builds a static export with `bun run build`, and CI runs typecheck, lint, unit tests and the build.
- `site-content.json` validates. The public-safety lint passes.
- `/en`, `/id`, `/en/quick`, `/en/journey`, `/en/labs/{slug}`, `/en/library`, `/en/contact` and `/en/cv` render real content as HTML.
- The owner's CV PDF is exported unchanged at `/cv/kurniadi-ahmad-wijaya-cv.pdf` and linked from every CV entry point in both locales.
- A Cloudflare Pages preview deploys from CI.

### Phase 1: tower shell
- Five floor slabs render with their accent edges. The elevator moves between all floors via wheel, PageUp/PageDown, swipe and panel.
- The camera rigs (follow, rail, dolly) work with placeholder geometry. The GPU tier gate selects `full`, `lite` or `static`.

### Phase 2: rover and Lobby
- The rover drives with keyboard and joystick, with collision (click and tap to move were replaced by point-and-go in October 2026, see appendix 03).
- Faces change by state. The Lobby shows the profile hologram, stats ring, skills wall and certifications wall from content.

### Phase 3: Career Archive
- The corridor is generated from `careerArchive.entries` grouped by year, with year gates and alternating rooms.
- The rail camera works, and horizontal swipe scrubs through time on touch. Year rooms open the drawer with correct content.
- The Workshop lists side projects and public repos: one bench per side project and one skyline bar per repo, each opening its own drawer (F3, `e2e/workshop.spec.ts`).
- L2 Workshop (F3): the time console teleports to any year plaza and back to the elevator; the forecourt routes reach the console, the gateway, every bench and every bar (`tests/unit/career-workshop.test.ts`, space rules with the Return pad); the skyline height is a log scale of stars and the color follows the language (`tests/unit/career-skyline.test.ts`). Budgets at the Workshop: no more scene calls than the old annex (measured: 71 to 56 on full at 1440 × 900, 61 to 46 on lite at 390 × 844), triangles under 30k at every peak, programs within the perf baseline + 2. Reduced motion: the console's jump is the fade cut and nothing in the Workshop animates (the icons' sway stops, the Horizon clock holds).

### Phase 4: Labs
- Both wings are generated from data (`wing`, `tier`, `order`): hero rows plus featured grids, with the correct holograms. Listed items appear in the wing directory and ⌘K.
- Career rooms with `podRef` and pods with `timelineRef` link to each other through a mission.
- The Glass Drawer works on all breakpoints. The hologram view works for every hero pod, with prev/next.
- Tech Reactor (2026-10-14): every pod tech maps to a ring or the misc allowlist (`tests/unit/tech-index.test.ts`); picking a tech, a ring click, Surprise me, the `#labs-tech` deep link, Cmd-K and reduced motion pass `e2e/reactor.spec.ts`.
- Data and ML annex (2026-10-14): the hub wings, reactor, Return pad and view zones are unchanged with the annex (`tests/unit/labs-data-annex.test.ts`); every data pod has a tech on the Data ring and pandas lights all of them (`tests/unit/tech-index.test.ts`); the data pods are reachable, their drawers carry code and research links, the data panel opens the project list and `/labs?wing=data` filters the Classic site (`e2e/labs-data.spec.ts`).
- Topic Constellation (2026-10-14): every post, paper, thesis, model and talk maps to a topic or the explicit allowlist and every post tag to a topic (`tests/unit/topic-index.test.ts`); the end plaza passes the space and pad rules and routes around the pedestal (`tests/unit/library-end.test.ts`); picking a topic, an orb click, the `#library-topic` deep link, Cmd-K in 3D and on the Classic site, the monument, the Return pad beam and reduced motion pass `e2e/topics.spec.ts`; from the plaza approach, the constellation and monument camera zones and while orbiting, with and without a pick, on desktop and phone, no two shown end-plaza signs overlap by more than 2% of the smaller plate (projected quads, `__hq.probes.topics.labels`), and `placeLabels` keeps shown boxes apart (`tests/unit/label-placement.test.ts`).

### Phase 5: Library, Roof, missions
- The Library renders posts in both languages with badges. Posts open as pages.
- The Roof shows the beacon, comms terminals and CV kiosk.
- The Rover Terminal and ⌘K run every mission in the catalog end to end. Cancel works.

### Phase 6: polish and launch
- Performance budgets and the accessibility check pass in CI. Sound works and is on by default (owner decision, appendix 05 section 5), starting on the first gesture; a mute persists.
- The README easter egg works. SEO metadata, `hreflang`, the sitemap and OG images exist. Round 5 (P9): every page's title contains the owner's name (section pages at most 60 characters, home at most 95), every description is 140 to 160 characters (EN and ID), every page has a canonical, hreflang en/id/x-default and a 1200x630 JPEG share card of at most 300 KB with no edge stripes, and every page except home has a BreadcrumbList (`bun run og:check`, `tests/unit/seo-copy.test.ts`).
- Motion default (owner decision 2026-10-14): a new visitor gets Full on every OS, so with `prefers-reduced-motion: reduce` the elevator ride still shows at least 12 car heights and the intro moves; picking System brings back the 150 ms cut under the OS flag and Reduced gives it everywhere; a stored version 2 `system` migrates to Full, a stored `reduced` stays (`e2e/motion.spec.ts`; unit: `tests/unit/motion.test.ts`, `boot-first.test.ts`). Specs that test reduced motion pick System first (`chooseMotion` in `e2e/hq.ts`).
- Boost (round 5, owner pick): holding Shift (or the touch boost toggle while the joystick drives) shows twin path-following trails, speed streaks and wheel sparks, squats and leans the body and widens the camera; release clears every effect and the camera returns; reduced motion shows none of it; a tap on the touch boost button sets `aria-pressed="true"`, the next clears it, and a floor change resets it (`e2e/boost.spec.ts` at 390x844 and 820x1180).
- Fast return (owner decision 2026-10-14): the L2 annex and L3 east plaza Return pads beam the rover onto the elevator call pad facing the car without opening the floor picker; a floor change more than 40 u from the call pad (owner decision 2026-10-14, raised from 25 u) beams into the car, then rides with unchanged ride stats; within 40 u the rover drives (the L1 spawn, the L3 overview and the RF arrival spot are e2e cases); reduced motion shows the fade cut (`e2e/fast-return.spec.ts`; unit: `tests/unit/fast-return.test.ts`, `floor-pads.test.ts`, `interact-registry.test.ts`, `interact-pick.test.ts`).
- How I run AI in production (owner approved 2026-10-14): About shows the section right after "How I work" with the four points, five proof tiles, the masked dashboard and alert rule and five case study links, passing axe; Cmd-K "Ops Control Room" lands on `/{locale}/contact#production` on the Classic site and opens `L3:ops` in 3D; the room's door opens its drawer by point-and-go; the live panel shows only real snapshot rows and hides on a 204 or stale snapshot; reduced motion keeps L3 inside its render budget (`e2e/production.spec.ts`; unit: `tests/content/production.test.ts`, `tests/unit/labs-ops*.test.ts`, `room-views.test.ts`, `interact-registry.test.ts`; Ask: `tests/ask/pack.test.ts`, golden q42).
- Production deploys to `kurniadi.pages.dev`. The old site's `/cv.pdf` path redirects to the new CV.
