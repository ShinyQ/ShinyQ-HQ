# L1 Lobby More Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: shipped in #252 (4ff54fb), 2026-10-20

**Goal:** Give the L1 Lobby components more breathing room without changing any component, content or behavior: every L1 obstacle pair 6 u apart (`SPACE_RULES`) and at least 6 u of walkway between the lane ring and each wall or the kiosk.

**Architecture:** One shared slab constant (`LOBBY_SLAB` in `src/experience/floors/lobby/slab.ts`: west edge, half depth, hall west edge). `LOBBY` (config.ts) and `HALL` (hallLayout.ts) and the gallery (hallGallery.ts) derive their positions from it, so colliders, bounds, stops, view zones, the minimap, deep links and the intro landmarks follow. The Agent Office wing (PR3) attaches relative to the south slab edge.

**Tech Stack:** three.js, React Three Fiber, Vitest, Playwright.

## Measured before (main 4498e4f)

- `spaceViolations` on L1: one breach, the skills wall 2.0 u off the north slab edge (grandfathered).
- Walkways from the lane ring (rover band, r 13.5): cert wall 4.3 u, kiosk 4.4 u, skills wall 4.5 u.
- Hall lead road 2 u from the cert wall's south end; stats tiles 2 u inside the lane ring.
- Captures: the skills wall's east end stacks behind the cert wall; on tablet and phone the hall's about pedestal and gate stack above it.

## Tasks

- [x] `LOBBY_SLAB` (minX -24, halfZ 27, hallX 33); `HALL` stations, lead road (z = halfZ - 6), plaza, gate, entry, zone and lazyX as offsets; gallery (about center, monolith backZ, contact card, fountain) from them.
- [x] `LOBBY`: bounds from the slab, lane ring 13.5, stats ring 11, skills wall flush north (`skillsWallRect`, the plinth footprint), cert arc 23.5 (`LOBBY.certWall.radius`, read by `CERT_WALL`), kiosk at 22.5 u, observatory in the new south-west corner; the arrival point stays at (-6, 0) with its zooms (a farther arrival point forces narrower zooms that put the name under the HUD at 1194x834).
- [x] Spawn view zooms retuned on captures (desktop 1.7, landscape tablets 1.8, phones and portrait tablets 1.85); intro `revealReach` 90; the pinned desktop intro poses re-captured, compared to 1e-9 u (the last bit varies with the JIT tier).
- [x] Unit tests: lobby-layout (54 u slab, walkways at least 6 u), highlights-layout (no space-rule breach), hall-gallery (gate at x 38, lead road z 21), intro (phone orbit radius bound 28 for the zoomed-out landing).
- [x] Docs: `docs/agents/floor-l1-lobby.md`, `docs/agents/stats.md`, `docs/features.md`, decision `docs/decisions/2026-10-19-l1-lobby-more-room.md`.
- [ ] Rebase onto Office PR3; keep its lead road in the x -3 to 9 corridor south of the ring.
- [ ] Verify: `bun run verify:quick`, `bun run e2e:changed`, `e2e/highlights.spec.ts` L1 scene calls at most 125 on both tiers, the perf lane.
- [ ] Owner review: before and after captures at 1440x900, 834x1194 and 390x844, the top-down render and the intro video.
- [ ] After approval: README hero (`bun scripts/readme-hero.ts`), `og:stills` floor-L1, `floor:thumbs`, visual-gate owner note.
