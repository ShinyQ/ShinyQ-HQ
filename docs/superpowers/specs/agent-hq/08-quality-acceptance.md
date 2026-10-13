# Appendix 08: Quality, Performance and Acceptance

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
| LCP, Page View (`/en`, `/en/quick`, `/en/journey`, a pod page) | < 2,000 ms (median of 3) | 2.5 s | Lighthouse CI, simulated mobile 4G |
| CLS | < 0.01 | 0.05 | Lighthouse CI |
| TBT | < 200 ms | 300 ms | Lighthouse CI |
| Page View transfer per page | JS 240 KB (245,760 B), CSS 20 KB, fonts 60 KB, HTML 80 KB; warn at 90% | JS 350 KB | Lighthouse CI `resource-summary`; per-chunk diff against main in the job summary |
| 3D JS after the gate (gzip), lite and full | < 450 KB each | 600 KB | `e2e/perf/bytes-3d.spec.ts`: transfer sizes after the 3D gate minus the Page View's scripts; fonts, JSON and CSS reported |
| Scene draw calls per floor, settled, both tiers | < 150; L1 <= 125, RF <= 79 | 150 | `expectRenderBudget`: worst frame over at least 20 frames and 1.2 s |
| Post-processing passes (full tier) | <= 20 | 20 | same, counted apart from scene calls |
| Scene draw calls at peaks: boot plus intro, every elevator ride, hover, boosting | < 150 | 150 | `e2e/perf/peaks.spec.ts` and `e2e/gpu.spec.ts`, every frame of the window |
| Triangles per frame | < 30,000 | 30,000 | `expectRenderBudget` |
| Shader programs per floor, both tiers | <= baseline + 2 (`e2e/perf/baseline.json`) | none | `e2e/perf/floors.spec.ts` |
| Memory after 10 Lobby to Roof round trips and 5 Page View toggles | geometries, textures and `programs.length` back to their baseline (delta 0); JS heap growth < 2 MB | no growth | `e2e/memory.spec.ts` (P3) on `renderer.info` (three.js has no material count) |
| Frame rate | none (not measurable in CI) | >= 55 fps desktop full, >= 30 fps mid-range phone lite; rendering is capped at 60 fps on high-refresh displays (no idle cap) | `scripts/perf-gpu.ts sp4` on real GPUs (frame p95 <= 18 ms) and the `?perf=1` overlay before a release; the runtime safety net and the RUM beacon FPS buckets (appendix 06 section 4) in the field |
| Game-first timeline: cover paint, headline, first frame, intro end, first drawer | trend only (nightly artifact) | headline < 1.5 s and first frame < 6 s on the P1 profile | `.github/workflows/perf-nightly.yml` (`e2e/perf/timeline.spec.ts`) |
| Elevator dolly | At least 12 distinct car heights and no jump above 25% of the trip, even under a 6x CPU throttle; no shader compiled while the car moves | same | `e2e/ride.spec.ts` (car height sampled every frame, `window.__hq.ridePrep.lastRide`); on real devices `?perf=1` shows the last ride in the overlay and logs one line per ride |
| Boost effects | At most 3 extra draw calls while boosting (trail, streaks, sparks), 0 when not boosting; idle frames identical to no boost; no shader compiled on the first boost; reduced motion shows none | same | `e2e/boost.spec.ts` (`__hq.rover.boostFx`, `trail`, `streaks`, `sparks`, `boostFov`, `boostPitch`) |
| Client chunks | Contain no zod or content loader (`_zod`, `readFileSync`, `site-content`) | same | Post-build gate `scripts/check-client-chunks.ts` (part of `bun run build`) |
| Troika font cuts | At most 64 KB in total, every in-world character covered | same | `tests/content/troika-fonts.test.ts` |
| Bytes before the first 3D frame (game-first `/en`, lite) | Only the HTML, CSS, page fonts, initial JS and the 3D chunks; no Page View images, link prefetch or room data | same | `e2e/boot-first.spec.ts` quiet boot |

Known over budget: none (`KNOWN_OVER` in `e2e/perf/peaks.spec.ts` is empty; an id goes there only with its measurement in the PR, and leaves as soon as its test passes). The two elevator rides P4 recorded there (`lite ride-L3-L2`: 124 scene calls, 31,306 triangles; `full ride-L2-L1`: 116 scene calls plus 17 post passes, 34,059 triangles) drew the floor under a still solid slab while the car was parked; the ride cull (`tower/rideCull.ts`) skips every mesh whose bounds, clipped to the view frustum, lie in a solid slab's shadow, which brings them to 89 scene calls and 25,966 triangles, and 86 scene calls plus 17 post passes and 25,727 triangles. A per-frame check on a real GPU (each ride frame rendered with and without the culled meshes) finds no change beyond the renderer's own 1 to 3 pixel noise at 1/255, and the visual gate's ride poses match main.

## 3. Test strategy

| Layer | Tool | What |
|---|---|---|
| Content | Vitest | Schema validation, all `id` translations present, public-safety lint (blocklist of client names, codenames, private repo names from a private list kept outside the repo and injected in CI as a secret), no em dashes in any text, asset existence |
| Logic | Vitest | Mission runner (each mission's step sequence, cancel), navgrid A* (reachability, snapping), URL parse/serialize round-trip, input intent mapping, store actions |
| Components | Vitest + Testing Library | HUD: Rover Terminal keyboard flow, palette search and grouping, drawer tabs and focus trap, language toggle |
| E2E | Playwright | Boot and intro skip, each mission end to end, ⌘K to a pod, elevator via wheel and panel, deep link to a pod, hologram view, README toggle, language switch, Quick view, static tier fallback (`?tier=static`) |
| Visual | Playwright screenshots | Lobby, L2 corridor, L3 with drawer, hologram, Roof, Quick view at 1440×900, 1024×1366 and 390×844 (WebGL via SwiftShader in CI) |
| Accessibility | axe-core in Playwright | Zero serious/critical violations on static pages and HUD overlays |
| Performance | Lighthouse CI (a warm-up run of `/en?lhci-warmup=1` first, never asserted); Playwright perf lane (`bun run e2e:perf`, CI job `3D perf gates`); nightly timeline; `?perf=1` and RUM for real devices | Budgets in section 2 on `/en`, `/en/quick`, `/en/journey`, `/en/labs/voice-ai-contact-center` (3 runs each) and every 3D floor on both tiers. CI budgets (`lighthouserc.json`, `e2e/budgets.ts`) are authoritative. |

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
- The Workshop annex lists side projects and public repos.

### Phase 4: Labs
- Both wings are generated from data (`wing`, `tier`, `order`): hero rows plus featured grids, with the correct holograms. Listed items appear in the wing directory and ⌘K.
- Career rooms with `podRef` and pods with `timelineRef` link to each other through a mission.
- The Glass Drawer works on all breakpoints. The hologram view works for every hero pod, with prev/next.

### Phase 5: Library, Roof, missions
- The Library renders posts in both languages with badges. Posts open as pages.
- The Roof shows the beacon, comms terminals and CV kiosk.
- The Rover Terminal and ⌘K run every mission in the catalog end to end. Cancel works.

### Phase 6: polish and launch
- Performance budgets and the accessibility check pass in CI. Sound works and is on by default (owner decision, appendix 05 section 5), starting on the first gesture; a mute persists.
- The README easter egg works. SEO metadata, `hreflang`, the sitemap and OG images exist. Round 5 (P9): every page's title contains the owner's name (section pages at most 60 characters, home at most 95), every description is 140 to 160 characters (EN and ID), every page has a canonical, hreflang en/id/x-default and a 1200x630 JPEG share card of at most 300 KB with no edge stripes, and every page except home has a BreadcrumbList (`bun run og:check`, `tests/unit/seo-copy.test.ts`).
- Boost (round 5, owner pick): holding Shift (or the touch boost toggle while the joystick drives) shows twin path-following trails, speed streaks and wheel sparks, squats and leans the body and widens the camera; release clears every effect and the camera returns; reduced motion shows none of it; a tap on the touch boost button sets `aria-pressed="true"`, the next clears it, and a floor change resets it (`e2e/boost.spec.ts` at 390x844 and 820x1180).
- Production deploys to `kurniadi.pages.dev`. The old site's `/cv.pdf` path redirects to the new CV.
