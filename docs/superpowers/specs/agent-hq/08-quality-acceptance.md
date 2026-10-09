# Appendix 08: Quality, Performance and Acceptance

Part of [Agent HQ design spec](../2026-10-09-agent-hq-design.md).

## 1. Browser and device support

| Tier | Requirement | Experience |
|---|---|---|
| `full` | WebGL2, not a low-end GPU (detect-gpu tier ≥ 2), not coarse pointer with `deviceMemory < 4` | Everything, including bloom and point lights |
| `lite` | WebGL2 available, lower tier or mobile | No bloom, no point lights, fewer particles, DPR ≤ 1.5 |
| `static` | No WebGL2, tier 0, `saveData`, or a WebGL error | HTML pages only (same content and missions as links) |

Supported browsers: latest 2 versions of Chrome, Edge, Firefox and Safari; iOS Safari 16.4+; Android Chrome 110+. Visitors can force a tier with `?tier=lite` or `?tier=static`.

## 2. Performance budgets

| Metric | Budget | Measured by |
|---|---|---|
| LCP (`/en`, mobile 4G, mid-range) | < 2.5 s | Lighthouse CI |
| CLS | < 0.05 | Lighthouse CI |
| TBT | < 300 ms | Lighthouse CI |
| Initial JS (gzip, before 3D) | < 350 KB | `@next/bundle-analyzer` check in CI |
| 3D chunk (gzip) | < 600 KB | Same |
| Frame rate | ≥ 55 fps desktop (full), ≥ 30 fps mid-range phone (lite) | Manual check plus a Playwright perf probe that samples `requestAnimationFrame` deltas |
| Draw calls per floor | < 150 | `renderer.info` assertion in a dev-only test |
| Memory | No growth after 10 floor round-trips | Disposal test (geometry/material counts return to baseline) |

## 3. Test strategy

| Layer | Tool | What |
|---|---|---|
| Content | Vitest | Schema validation, all `id` translations present, public-safety lint (blocklist of client names, codenames, private repo names from a private list kept outside the repo and injected in CI as a secret), no em dashes in any text, asset existence |
| Logic | Vitest | Mission runner (each mission's step sequence, cancel), navgrid A* (reachability, snapping), URL parse/serialize round-trip, input intent mapping, store actions |
| Components | Vitest + Testing Library | HUD: Rover Terminal keyboard flow, palette search and grouping, drawer tabs and focus trap, language toggle |
| E2E | Playwright | Boot and intro skip, each mission end to end, ⌘K to a pod, elevator via wheel and panel, deep link to a pod, hologram view, README toggle, language switch, Quick view, static tier fallback (`?tier=static`) |
| Visual | Playwright screenshots | Lobby, L2 corridor, L3 with drawer, hologram, Roof, Quick view at 1440×900, 1024×1366 and 390×844 (WebGL via SwiftShader in CI) |
| Accessibility | axe-core in Playwright | Zero serious/critical violations on static pages and HUD overlays |
| Performance | Lighthouse CI | Budgets above on `/en`, `/en/quick`, `/en/labs/{hero}` |

## 4. Acceptance criteria per build phase

### Phase 0: scaffold and content
- The repo builds a static export with `bun run build`, and CI runs typecheck, lint, unit tests and the build.
- `site-content.json` validates. The public-safety lint passes.
- `/en`, `/id`, `/en/quick`, `/en/journey`, `/en/labs/{slug}`, `/en/library`, `/en/contact` and `/en/cv` render real content as HTML.
- A CV PDF per locale is generated at build time.
- A Cloudflare Pages preview deploys from CI.

### Phase 1: tower shell
- Five floor slabs render with their accent edges. The elevator moves between all floors via wheel, PageUp/PageDown, swipe and panel.
- The camera rigs (follow, rail, dolly) work with placeholder geometry. The GPU tier gate selects `full`, `lite` or `static`.

### Phase 2: rover and Lobby
- The rover drives with keyboard, click-to-move, tap-to-move and joystick, with collision.
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
- Performance budgets and the accessibility check pass in CI. Sound works and is muted by default.
- The README easter egg works. SEO metadata, `hreflang`, the sitemap and OG images exist.
- Production deploys to `kurniadi.pages.dev`. The old site's `/cv.pdf` path redirects to the new CV.
