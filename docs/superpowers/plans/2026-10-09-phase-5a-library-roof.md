# Phase 5a: L4 Library and RF Roof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the L4 Library and the RF Roof as real 3D floors generated from `content/site-content.json`, give the `blog`, `hire` and `cv` missions real target points, and deep link `/{locale}/library` and `/{locale}/contact` straight into those floors.

**Architecture:** Pure layout modules (`floors/library/layout.ts`, `floors/roof/layout.ts`) own every coordinate: they feed the navgrid obstacles and door triggers in `config.ts`, the mission stops in `missions/host3d.ts` and the R3F components, so the scene, the autopilot and the tests can never disagree. The server builds a small `library` and `roof` payload into `ExperienceData` for the 3D floors. Rooms open in the Phase 4 Glass Drawer: the Library and Roof `RoomView` builders (`content/room-views/library.ts`, `roof.ts`) carry the content and `RoofBody` adds email copy and CV downloads.

**Tech Stack:** Next.js 16 static export, React 19, three 0.186, @react-three/fiber 9, @react-three/drei 10 (`Text`), zustand 5, next-intl 4, Vitest, Playwright (SwiftShader WebGL, `?tier=lite`).

## Global Constraints

- No em dashes (U+2014) anywhere. Ranges are written "X to Y".
- Content is data: titles, links, availability and CV file names come from `@/content/load`; UI strings live in `messages/{en,id}.json` with identical keys.
- Public repo: nothing private; the public-safety lint stays green.
- Static export; every route works without WebGL; the 3D overlay never replaces the HTML page.
- L4 (appendix 01 section 5): footprint 48 x 32, accent white `#e5e7eb`, blog shelves in 2 rows at z = -10 and z = -2, publications shelf at z = +8, talks stage at (16, 10), language badges `EN`, `ID` or `EN/ID`, elevator door (-24, 0).
- RF (appendix 01 section 6): footprint 40 x 40, open sky (stars, slow particle clouds), accent blue `#60a5fa`, beacon at (0, -6) with the availability ribbon, comms terminals on an arc of radius 10 in front of the beacon, CV kiosk at (10, 6), elevator door (-20, 0).
- Budgets: fewer than 150 draw calls per floor; reduced motion freezes clouds and the beacon pulse.
- Audio only through `@/lib/audio` (`click` on email copy and CV download).
- Shared files (`host3d.ts`, `config.ts`, store, `Experience*.tsx`, `Tower.tsx`) get small additive edits only (coordination with Phases 3 and 4).
- Before pushing: `bun run typecheck && bun run lint && bun run test && bun run build && bun run e2e`. Never use port 4310 (owner's server); e2e uses `E2E_PORT`.

## Decisions

1. **Single source of coordinates.** Layout modules are pure (no React, no three) so Vitest runs them in node.
2. **Post order.** Spines follow `getPosts()` (newest first), the same order `buildRoomCatalog` uses. Post `i` goes to row `i % 2` (row 0 at z = -2, nearest the lane; row 1 at z = -10) and slot `floor(i / 2)`, centered on the shelf. A test pins the payload order to the catalog.
3. **Door triggers.** The publications shelf, the talks stage, the comms terminals and the CV kiosk get `FloorLayout.doors` at their stops. Book spines get none: a 1.8 u spine pitch along the lane would open a post every few steps. Posts open by clicking a spine, the lectern, the palette or a mission; `roomTarget(room, id, layouts, years, rooms = [])` finds the spine stop from the catalog.
4. **Opening rooms.** Phase 4's drawer shows every room; `host3d.openRoom` already opens it on READY floors. Posts use the generic body with a "Read post" footer action (Medium: "Read the post", new tab); `RoofBody` renders the comms terminals (mailto, copy with `click`, channels) and the CV kiosk (per-locale downloads with `click`, `/cv`).
5. **In-world clicks** (spines, lectern, plates, stage, terminals, kiosk) call `goToRoom(id)` from `missions/bridge.ts`, so clicks, the palette and missions behave the same and manual input cancels them.
6. **Deep links.** `/{locale}/library` and `/{locale}/contact` mount `ExperienceGate` with `startFloor` (Phase 4 plumbing): no boot, no intro, spawn in front of the content.
7. **URLs.** Opening a hosted post mirrors `/{locale}/blog/{slug}`. Shelves and Medium posts have no route of their own, so the drawer URL sync keeps the floor URL for them (`hasPage`).

## File structure

```
src/experience/floors/library/layout.ts   LIBRARY constants, spineSlots(n), postStop(i, n), LIBRARY_STOPS, libraryObstacles()
src/experience/floors/roof/layout.ts      ROOF constants, terminalSlots(n), ROOF_STOPS, roofObstacles()
src/experience/floors/Library.tsx         L4 composition
src/experience/floors/library/*.tsx       BlogShelves, Lectern, PublicationsShelf, TalksStage
src/experience/floors/Roof.tsx            RF composition
src/experience/floors/roof/*.tsx          Sky (stars + clouds), Beacon, CommsTerminals, CvKiosk
src/content/experience-floors.ts          buildLibraryData(locale), buildRoofData(locale)
src/hud/drawer/RoofBody.tsx               drawer body for RF rooms (email copy, channels, CV downloads)
tests/unit/library-roof-layout.test.ts    layout generation, stops, navgrid reachability
tests/hud/LibraryRoofRooms.test.tsx       drawer: read post, Medium link, copy email, CV links
e2e/library-roof.spec.ts                  blog, hire, cv missions in 3D, email copy, CV link, deep links
```

Modified: `config.ts` (READY_FLOORS, L4/RF obstacles, doors, spawns), `types.ts` (ExperienceData.library/roof), `content/experience.ts`, `content/room-views/{library,roof}.ts`, `missions/host3d.ts` (post stops), `Experience.tsx` (labels, `hasPage`), `tower/Tower.tsx`, `hud/drawer/{bodies.tsx,RoomDrawer.tsx,DrawerHost.tsx,urlSync.ts}`, library and contact pages, messages, `e2e/hq.ts`, `e2e/experience.spec.ts`, `e2e/screenshots.spec.ts`, `AGENTS.md`.

---

### Task 1: Pure layouts and navgrid obstacles

**Files:** create `floors/library/layout.ts`, `floors/roof/layout.ts`; modify `config.ts`; test `tests/unit/library-roof-layout.test.ts`.

**Produces:**
- `LIBRARY = { shelves: { x: 2, w: 24, d: 1.2, h: 3.2, rows: [-2, -10] }, lectern: { x: -18, z: -7, w: 1.6, d: 1.2 }, publications: { x: -4, z: 8, w: 20, d: 1, h: 2.6 }, stage: { x: 16, z: 10, w: 7, d: 5, h: 0.4 } }`
- `spineSlots(n): { index, row, x, z }[]` (spine center on the shelf front), `postStop(i, n): Vec2` (1.6 u in front of the spine), `LIBRARY_STOPS: { publications, talks }`, `libraryObstacles(): Rect[]`.
- `ROOF = { beacon: { x: 0, z: -6, r: 1.2 }, arc: 10, terminal: { w: 1.8, d: 0.8 }, kiosk: { x: 10, z: 6, w: 3, d: 2 } }`, `terminalSlots(n): { x, z, angle }[]`, `ROOF_STOPS: { contact, cv }`, `roofObstacles(n)`.

- [ ] Write failing tests: slots alternate rows and stay on the shelf, stops are walkable on the floor navgrid and reachable from the elevator approach (`findPath`), terminals sit on the arc of radius 10 around the beacon, every stop is outside every inflated obstacle.
- [ ] Implement both modules; wire `buildFloorLayouts` L4/RF obstacles; append `"L4", "RF"` to `READY_FLOORS`.
- [ ] `bun run test tests/unit/library-roof-layout.test.ts` passes; commit `feat: L4 and RF layouts`.

### Task 2: Experience data and mission targets

**Files:** create `src/content/experience-floors.ts`; modify `types.ts`, `content/experience.ts`, `missions/host3d.ts`, `missions/bridge.ts`; tests in `experience-data.test.ts`, `missions-host3d.test.ts`.

**Produces:** `ExperienceData.library = { posts: { slug, title, excerpt, date, languages, tags, url }[], publications: { id, title, kind, venue, year, url }[], talks: { id, title, event, date, role }[] }`, `ExperienceData.roof = { availability, email, channels: { id, label, href }[], cv: { en, id, page } }`; `goToRoom(room)`.

- [ ] Tests: posts follow `buildRoomCatalog` order; channels include LinkedIn, GitHub, Hugging Face, Medium; CV paths are `/cv/{fileName}-{locale}.pdf`. `roomTarget` sends `L4:the-sun-the-moon-and-the-dark-sea` to `postStop(i, n)`, `L4:publications`/`L4:talks`/`RF:contact`/`RF:cv` to their stops; `openRoom` on L4/RF sets `activeRoom`; `driveTo` closes an open room.
- [ ] Implement; commit `feat: library and roof data, real mission stops`.

### Task 3: L4 Library scene

- [ ] `Library.tsx` + `BlogShelves` (glowing spines, hover title, EN/ID badge, Medium spines pink with an arrow), `Lectern` (newest hosted post, click opens it), `PublicationsShelf` (framed plates by kind: paper, thesis, model), `TalksStage` (stage and screen listing talks). Clicks call `goToRoom`.
- [ ] Mount in `Tower.tsx` with labels from messages; commit `feat: L4 Library floor`.

### Task 4: RF Roof scene

- [ ] `Roof.tsx` + `Sky` (stars + drifting clouds, `fog={false}`, frozen under reduced motion), `Beacon` (pulsing light + availability ribbon), `CommsTerminals` (email, LinkedIn, GitHub, Hugging Face, Medium), `CvKiosk`. Clicks call `goToRoom`.
- [ ] Mount in `Tower.tsx`; commit `feat: RF Roof floor`.

### Task 5: Drawer content for L4 and RF

- [ ] Tests first (`tests/hud/LibraryRoofRooms.test.tsx`): hosted post shows "Read post" linking to `/{locale}/blog/{slug}` and a note when untranslated; Medium post opens in a new tab; copy email writes to the clipboard and plays `click`; CV body links both PDFs (visitor's language first) and `/cv`.
- [ ] Implement `RoofBody`, register it for kind `roof`, add the "Read post" footer label and the translation note; keep shelves and Medium posts on the floor URL (`hasPage`); commit.

### Task 6: Deep links

- [ ] Library and contact pages mount `ExperienceGate` with `startFloor="L4"`/`"RF"` (Phase 4 plumbing); spawns in front of the content; commit.

### Task 7: E2E, screenshots, docs

- [ ] `e2e/library-roof.spec.ts`: blog, hire, cv missions end to end (`?tier=lite`), email copy, CV download link, deep links for both locales, Medium link target, draw call budget on L4 and RF.
- [ ] Update `e2e/experience.spec.ts` (hire now stays in 3D), add L4/RF to `screenshots.spec.ts` (3 viewports).
- [ ] `AGENTS.md` (READY_FLOORS, layout modules, goToRoom, startFloor, room panel); run the full check suite; commit; push; PR "Phase 5a: Library and Roof" with screenshots.
