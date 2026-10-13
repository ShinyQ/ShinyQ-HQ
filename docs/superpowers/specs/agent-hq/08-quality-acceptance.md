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

| Metric | Budget | Measured by |
|---|---|---|
| LCP (`/en`, mobile 4G, mid-range) | < 2.5 s | Lighthouse CI |
| CLS | < 0.05 | Lighthouse CI |
| TBT | < 300 ms | Lighthouse CI |
| Initial JS (gzip, before 3D) | < 350 KB | `@next/bundle-analyzer` check in CI |
| 3D chunk (gzip) | < 600 KB | Same |
| Frame rate | ≥ 55 fps desktop (full), ≥ 30 fps mid-range phone (lite); rendering is capped at 60 fps on high-refresh displays (no idle cap) | `scripts/perf-gpu.ts sp4` on real GPUs (frame p95 ≤ 18 ms), the runtime safety net in the field |
| Draw calls per floor | < 150, all render passes counted, at settled spots and at the intro and elevator ride peaks | `expectRenderBudget` (e2e) and `e2e/gpu.spec.ts` (peaks) |
| Boost effects | At most 3 extra draw calls while boosting (trail, streaks, sparks), 0 when not boosting; idle frames identical to no boost; no shader compiled on the first boost; reduced motion shows none | `e2e/boost.spec.ts` (`__hq.rover.boostFx`, `trail`, `streaks`, `sparks`, `boostFov`, `boostPitch`) |
| Elevator dolly | At least 12 distinct car heights and no jump above 25% of the trip, even under a 6x CPU throttle; no shader compiled while the car moves | `e2e/ride.spec.ts` (car height sampled every frame, `window.__hq.ridePrep.lastRide`); on real devices `?perf=1` logs one line per ride |
| Bytes before the first 3D frame (game-first `/en`, lite) | Only the HTML, CSS, page fonts, initial JS and the 3D chunks; no Page View images, link prefetch or room data | `e2e/boot-first.spec.ts` quiet boot |
| Memory | No growth after 10 Lobby to Roof round trips and 5 Page View toggles | `e2e/memory.spec.ts`: `renderer.info` geometries, textures and `programs.length` equal their baseline (three has no material count), JS heap growth < 2 MB |

## 3. Test strategy

| Layer | Tool | What |
|---|---|---|
| Content | Vitest | Schema validation, all `id` translations present, public-safety lint (blocklist of client names, codenames, private repo names from a private list kept outside the repo and injected in CI as a secret), no em dashes in any text, asset existence |
| Logic | Vitest | Mission runner (each mission's step sequence, cancel), navgrid A* (reachability, snapping), URL parse/serialize round-trip, input intent mapping, store actions |
| Components | Vitest + Testing Library | HUD: Rover Terminal keyboard flow, palette search and grouping, drawer tabs and focus trap, language toggle |
| E2E | Playwright | Boot and intro skip, each mission end to end, ⌘K to a pod, elevator via wheel and panel, deep link to a pod, hologram view, README toggle, language switch, Quick view, static tier fallback (`?tier=static`) |
| Visual | Playwright screenshots | Lobby, L2 corridor, L3 with drawer, hologram, Roof, Quick view at 1440×900, 1024×1366 and 390×844 (WebGL via SwiftShader in CI) |
| Accessibility | axe-core in Playwright | Zero serious/critical violations on static pages and HUD overlays |
| Performance | Lighthouse CI | A warm-up run of `/en?lhci-warmup=1`, then budgets on `/en`, `/en/quick`, `/en/journey`, `/en/labs/voice-ai-contact-center` (3 runs each). The warm-up URL is excluded from assertions. CI budgets in `lighthouserc.json` are authoritative. |

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
