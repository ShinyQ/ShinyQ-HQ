# L1 Highlights Hall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the L1 Lobby east, behind the certifications wall, into a short walk-through "Highlights Hall" with four stations (about me, top 3 projects, work experience, contact), each a Glass Drawer room, plus a "Quick tour" guided walk startable from Ask Rover and Cmd-K; register the stations as point-and-go targets; lower the floating Lobby title so it clears the HUD top bar at 1440x900; and rebuild the Ask Rover kiosk as one straight unit.

**Architecture:** One pure layout module (`src/experience/floors/lobby/hallLayout.ts`) defines the hall (slab extension to x = 64, a lead road around the south end of the certification wall, a 24 x 26 u plaza, four stations flush with the slab edges, door pads, spurs, camera view zones and a road zone) and feeds `buildFloorLayouts`, the scenery, the walk and the e2e tests, so scene and autopilot never disagree. Content comes from the existing selectors (`pickFeaturedPods` over `orderPods` for projects, timeline entries of type `job` and `freelance` newest first for experience, `getStats()` for the numbers, `getRoof()` for contact) through a small `ExperienceData.highlights` payload (3D) and a new room-view builder (drawer). The scenery is one merged mesh, one edge mesh, one `BatchedText`, one screenshot atlas (lazy-loaded) and the road markings, so the hall adds about 10 draw calls to the busiest floor. The stations join the point-and-go registry (`registerExtraInteractables`), so a click on a panel drives along the road and opens the drawer; the floors themselves carry no click handlers.

**Tech Stack:** Next.js 16 (static export), React 19, TypeScript strict, three.js with React Three Fiber 9 and drei 10, troika-three-text (`BatchedText`), zustand, next-intl, Vitest, Playwright (SwiftShader WebGL), Bun.

## Global Constraints

- Owner request (verbatim): "Since there is like 5 floor that too much to explore doesnt it?\" I'm thinking of a place for summary in the 1st flor like in the back side of the floor that containes WOW about me, top 3 highlighted projects, work experience (freelance, full time) and my contacts."
- Codebase: ShinyQ/ShinyQ-HQ, branch from `main` at `e2a6c53` or later. Read `AGENTS.md` (Walkable floors, walk engine, space rules, render budgets, Glass Drawer, Page View) before Task 1.
- The hall lives on L1 east of the certification wall (`LOBBY.certWall`, footprint x 23.8 to 26.2, z -9 to 9). The wall must stay readable from the plaza: nothing new stands between the plaza and the wall's west face; the passage runs around its south end (road center z = 15).
- Station order: (1) WOW about me, (2) top 3 projects, (3) work experience split "Employment" (`type: "job"`) and "Freelance" (`type: "freelance"`), newest first, labelled with the existing career type labels (`common.type.job` / `common.type.freelance`, "Employment" / "Pekerjaan", "Freelance"), never "Full-time", (4) contacts (email with copy, channels, CV viewer, availability).
- Room ids: `L1:highlights-about`, `L1:highlights-projects`, `L1:highlights-experience`, `L1:highlights-contact`.
- Top projects use the same selector as the Page View landing: `pickFeaturedPods(getPods())` (`src/content/pageview.ts`, `podHasGallery` over `orderPods`). Never hard-code slugs, counts or orgs anywhere (code or tests): content keeps changing (R4-K adds the Serupa ticketing pod and the `serupa-2025` Journey entry; R4-J renames and re-tiers pods); tests derive expectations from the dataset.
- Live sites (R4-J, `r4-j-live-links-mii-microsoft.md`): the top-projects station shows "Visit live site" (`common.visitLive`) for a project whose `podLiveLink(pod)` (`src/content/selectors.ts`) is not null: a `LiveSiteLink` in the drawer card and a small label under its screenshot in 3D (read from `LabPod.liveUrl` through `podLiveLink`). Never render a live URL any other way.
- Walkable-floor rules: roads at least 8 u wide, plazas at least 16 u, obstacles touching or at least 6 u apart (also from the slab edge), every door has a spur, 6 u wide floor from the start to within 4 u of every pad (`spaceViolations` / `expectSpaceRules`). The only allowed violation on L1 is the pre-existing skills wall 2 u from the north slab edge (the test names it exactly); the Ask Rover kiosk moves to touch the south edge in Task 3.
- Render budget: under 150 draw calls and 30k triangles per floor (`expectRenderBudget`, `e2e/hq.ts`). L1 is the busiest floor: keep headroom, the hall e2e caps L1 at 140 draw calls everywhere from the plaza to the hall on both tiers.
- Performance tiers and reduced motion: the hall has no animation; the lite tier uses the dimmer neon edges (`neonColor` by tier) and a smaller screenshot atlas; screenshots load only once the rover heads east (`shouldLoadShots`).
- Quick tour: a walk on L1 only; `WALK_FLOORS` gains `"L1"`, but L1 never shows the generic first-visit walk prompt (`NO_WALK_PROMPT`), because a separate onboarding feature introduces the hall. Startable from Ask Rover (mission "Quick tour: the highlights") and Cmd-K (the same mission).
- Point-and-go (R4-I, `r4-i-point-and-go.md`) merges first and this plan builds on it (Task 1 checks): click/tap-to-move is gone; `src/experience/interact/registry.ts` exports `Interactable` (`id`, `floor`, `kind: "door" | "elevator-pad" | "teleporter" | "station" | "kiosk" | "board"`, `label` as ONE resolved string for the tower's locale, `at`, `bounds`, `height?`, `action`), `InteractAction` (`open-room {room}`, `elevator-picker`, `teleport-picker {year}`, `command {command}`), `InteractData`, `interactablesFor(floor, layouts, data)`, `registerExtraInteractables(floor, items): () => void` and `useInteractables(floor, layouts, data)`. Existing L1 ids: `L1:pad:elevator`, `L1:station:profile`, `L1:station:skills`, `L1:kiosk:ask-rover`. The hall registers `L1:station:highlights-about|projects|experience|contact` (kind `station`, action `open-room`). The registry's L1 built-ins do not derive items from `FloorLayout.doors`, so the hall's doors never duplicate the stations.
- Ask Rover kiosk (owner review: "the line is not straight"): body, stand and screen turn as one unit square to the grid, the screen centered on the body, every text line on one straight baseline (no wrapping; long lines end in "..."), and the kiosk touches the south slab edge, clear of the hall road at z = 15.
- No em dashes (U+2014) anywhere: code, comments, copy, docs, commits, PR text (a unit test scans the repo).
- Content is data: never hardcode career facts in components; every user-facing string is resolved from content or a key in both `messages/en.json` and `messages/id.json` (identical keys and placeholders, `tests/unit/ui-copy.test.ts`).
- Public safety: no client company names (C3) anywhere; employers and freelance clients stay named. Do not edit `public/cv/`.
- Static export: no server runtime; every route still works without WebGL; the static tier maps each station to a landing anchor (`/#intro`, `/#work`, `/#journey`, `/#contact`).
- Deep links: `/{locale}#highlights` (first station) and `/{locale}#highlights-<station>` open a station in 3D; while a station is open the URL stays `/{locale}` (stations have no route of their own, like L4 shelves).
- Workflow: Bun; commit in logical steps with conventional messages, prefixed with `rtk` for git; before pushing run `bun run verify:quick` and `bun run e2e:changed`; one PR, never merged without the owner.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `src/experience/floors/lobby/kiosk.ts` | create (Task 3) | Pure Ask Rover kiosk: `KIOSK`, `kioskParts()` (one group, one yaw; body, stand and centered screen), `kioskStop()`, `kioskFacing()`, `kioskLines`, `kioskAllLines`, `kioskFontSize`, `kioskMaxChars`, `fitLine`. |
| `src/experience/floors/lobby/MissionKiosk.tsx`, `Lanes.tsx` | modify (Task 3) | Render the kiosk from `kioskParts`; the lane spoke ends at the screen front. |
| `src/experience/interact/registry.ts` | modify (Task 3) | The `L1:kiosk:ask-rover` approach point comes from `kioskStop()`; kiosk pick height 3.4. |
| `src/experience/floors/lobby/stations.ts` | create (Task 4) | Light, client-safe ids and helpers: `HIGHLIGHT_STATIONS`, `HighlightStation`, `highlightRoom`, `isHighlightRoom`, `highlightsRoomFromHash`, `experienceRows`, `HIGHLIGHT_STAT_COUNT`. Imported by the gate (main bundle), so it imports types only. |
| `src/content/highlights.ts` | create (Task 4) | Server selectors: `highlightProjects`, `highlightEntries` (`{ employment, freelance }`), `buildHighlightsData(locale)`. |
| `src/experience/types.ts` | modify (Tasks 4, 7) | `HighlightsData`, `ExperienceData.highlights`, `FloorLayout.roadZone`. |
| `src/content/experience.ts` | modify (Task 4) | `buildExperienceData` adds `highlights`. |
| `src/experience/missions/rooms.ts` | modify (Tasks 5, 9) | `RoomKind` `"highlights"`, four catalog rooms, `StructuralRoom` keys, `WALK_FLOOR.highlights`. |
| `src/content/room-views/highlights.ts` | create (Task 5) | `buildHighlightsViews(locale)`: drawer content for the four stations. |
| `src/content/room-views/roof.ts` | modify (Task 5) | Exports `contactItems(locale)` and `cvItems(locale)`, shared with the contact station. |
| `src/content/room-views/types.ts`, `index.ts` | modify (Task 5) | `RoomCard`, `RoomView.cards`; registers the builder. |
| `src/app/[locale]/page.tsx` | modify (Task 5) | `id="contact"` on the closing section (static anchor for the contact station). |
| `src/hud/drawer/blocks.tsx` | create (Task 6) | `MetricTiles`, `ItemLink`, `Sections`, `Chips` moved out of `RoomDrawer.tsx` (no import cycle for bodies). |
| `src/hud/drawer/HighlightsBody.tsx` | create (Task 6) | Drawer body for kind `highlights`: metrics, cards that ride to their room (`goToRoom`), "Visit live site" (`LiveSiteLink`) under a project card with a live link, contact plus CV. |
| `src/hud/drawer/RoofBody.tsx`, `bodies.tsx`, `RoomDrawer.tsx`, `ascii.ts` | modify (Task 6) | Export `ContactBody`/`CvBody`; register the body; import blocks; README view lists cards. |
| `src/experience/floors/lobby/hallLayout.ts` | create (Task 7) | `HALL`, `buildHighlightsHall()`, `HALL_LAYOUT`, `HallStation`, `shouldLoadShots`. |
| `src/experience/nav/road.ts`, `scene/Director.tsx` | modify (Task 7) | `routeUsesRoad(layout, from, to)`: the L1 road only for drives into or out of the hall. |
| `src/experience/config.ts` | modify (Tasks 2, 3, 7, 9) | Title constants, `LOBBY.kiosk` (touches the south edge), `LOBBY.bounds.maxX = 64`, L1 doors/road/zones, `WALK_FLOORS`, `NO_WALK_PROMPT`. |
| `src/experience/floors/lobby/hallContent.ts` | create (Task 8) | Pure scenery data: `hallSolids`, `hallLabels`, `hallShots`, `shotQuadBuffers`, `coverCrop`, `SHOT_CELL`. |
| `src/experience/floors/lobby/HighlightsHall.tsx` | create (Task 8; Task 11 adds the registration) | R3F hall: road markings, merged solids and edges, one `BatchedLabels` (with "Visit live site" tags), lazy screenshot atlas; registers the four stations as point-and-go targets. No click handlers of its own. |
| `src/experience/floors/lobby/SkillsWall.tsx` | modify (Task 8) | Title, headings and items in one `BatchedLabels` (8 fewer draw calls, pays for the hall). |
| `src/experience/floors/Lobby.tsx`, `src/experience/Experience.tsx` | modify (Tasks 5, 8, 10) | Mount the hall, hall labels (station names, `visitLive`), `interact.rooms` for the new structural rooms, deep-link placement, `hasPage`. |
| `src/experience/missions/walks.ts`, `src/hud/walk/WalkLayer.tsx` | modify (Task 9) | `highlightsWalk` ("Quick tour"); L1 walk without the prompt. |
| `src/content/schema.ts`, `content/site-content.json` | modify (Task 9) | `WalkIdSchema` adds `highlights`; mission `highlights` (order 2). |
| `src/hud/terminal.ts`, `src/hud/RoverTerminal.tsx` | modify (Task 9) | Up to 9 terminal missions (keys 1 to 9). |
| `src/experience/ExperienceGate.tsx` | modify (Task 10) | Reads `#highlights-<station>` on `/{locale}`. |
| `src/experience/floors/lobby/hallInteract.ts` | create (Task 11) | `highlightsInteractables(hall, labels)`: the four `L1:station:highlights-*` registry entries. |
| `src/experience/floors/lobby/layout.ts`, `ProfileHologram.tsx`, `camera/rigs.ts`, `camera/CameraDirector.tsx` | modify (Tasks 2, 3) | Lower, smaller Lobby title; `TITLE_TOP`; `FOLLOW_LOOK_AHEAD` moved to the pure rigs module; the kiosk box in `lobbyElements`. |
| `messages/en.json`, `messages/id.json` | modify (Tasks 4, 5, 8, 9) | `hud.rooms.highlights*`, `hall.*`, `walk.highlights.*`, `hud.pads.floorDesc.L1`. |
| `tests/unit/lobby-title.test.ts`, `kiosk.test.ts`, `highlights-data.test.ts`, `highlights-layout.test.ts`, `hall-content.test.ts`, `hall-interact.test.ts` | create | Unit tests. |
| `tests/hud/HighlightsRooms.test.tsx` | create (Task 6) | Drawer bodies with real content. |
| `tests/unit/room-views.test.ts`, `missions-rooms.test.ts`, `missions-runner.test.ts`, `walk.test.ts`, `search.test.ts`, `ascii.test.ts`, `road.test.ts`, `e2e-plan.test.ts`, `tests/hud/RoverTerminal.test.tsx`, `tests/hud/MissionHud.test.tsx` | modify | Follow the new rooms, mission, walk and helpers. |
| `e2e/highlights.spec.ts` | create (Task 1, grown in Task 12) | Budget probe, point-and-go on the stations, cards, live link, walk, Cmd-K, deep link, static anchors, reduced motion. |
| `e2e/experience.spec.ts`, `e2e/missions.spec.ts`, `e2e/screenshots.spec.ts` | modify | New slab bound, terminal key shift, kiosk before/after and hall captures. |
| `scripts/e2e-plan.ts` | modify (Task 1) | `highlights` spec and its rules. |
| `public/floors/L1.webp` | regenerate (Task 13) | Elevator picker thumbnail. |
| `README.md`, `AGENTS.md`, `docs/superpowers/specs/agent-hq/01-world-and-layout.md`, `docs/superpowers/plans/2026-10-12-highlights-hall.md` | modify / create (Tasks 1, 14) | Docs. |

### Hall geometry (floor-local units, used by every task)

```
z = -21 +----------+-----+--------------------+  slab north edge
        | about    |     | projects           |  stations 3 u deep, flush with the edge
z = -18 +---[pad]--+     +-------[pad]--------+  pads 1.1 u in front (z = -16.9)
        |  cert    |  plaza x 34..58, z -10..16  +--+ z -8
        |  wall    |                             |ex| experience x 61..64, pad (59.9, 1)
        | x 23.8.. |                             |  |
        |   26.2   |                             +--+ z 10
z = 15  ===lead road (14,15) -> (36,15)===>  +---[pad]---+ contact x 40..54, pad (47, 16.9)
z = 21  +----------------------------------------+-----------+  slab south edge
       x=14       x=28 (old slab edge)                     x=64 (new slab edge)
```

Stations: about x 32 to 42, z -21 to -18; projects x 48 to 64, z -21 to -18; experience x 61 to 64, z -8 to 10; contact x 40 to 54, z 18 to 21. A scratch run of `spaceViolations` on this geometry (with the real Lobby obstacles and the elevator pad) returns exactly one violation, the pre-existing skills wall 2 u from the north edge (with the kiosk moved by Task 3 to touch the south edge: x 1 to 3, z 17.6 to 21).

---

### Task 1: Plan copy, e2e spec skeleton and the L1 baseline probe

**Files:**
- Create: `docs/superpowers/plans/2026-10-12-highlights-hall.md` (copy of this plan)
- Create: `e2e/highlights.spec.ts`
- Modify: `scripts/e2e-plan.ts` (`ALL_SPECS`, `RULES`)
- Test: `tests/unit/e2e-plan.test.ts`

**Interfaces:**
- Consumes: `enterHQ(page, { tier })`, `driveTo(page, point)`, `snapshot(page)`, `expectRenderBudget(page)` from `e2e/hq.ts`.
- Produces: the `highlights` e2e spec name (later tasks add tests to `e2e/highlights.spec.ts`); e2e-plan rules that map `src/experience/floors/lobby/(stations|hallLayout|hallContent|HighlightsHall|hallInteract)`, `src/content/(highlights|room-views/highlights).ts` and `src/hud/drawer/HighlightsBody.tsx` to `["experience", "highlights", "walk"]`.

- [ ] **Step 1: Check the prerequisites, branch and copy the plan**

This plan builds on R4-I point-and-go (registry, no click-to-move) and R4-J live links (`podLiveLink`, `LabPod.liveUrl`). Both merge first.

```bash
git switch main && rtk git pull
test -f src/experience/interact/registry.ts && rtk grep -q "export function registerExtraInteractables" src/experience/interact/registry.ts && echo "R4-I present" || echo "STOP: R4-I point-and-go is not on main yet"
rtk grep -q "export function podLiveLink" src/content/selectors.ts && rtk grep -q "liveUrl?: string" src/experience/types.ts && echo "R4-J present" || echo "STOP: R4-J live links are not on main yet"
git switch -c feat/l1-highlights-hall
mkdir -p docs/superpowers/plans
cp /Users/shinyq/.copilot/session-state/d439b68f-b2e6-4b77-9feb-f9099e8cd824/files/plans/r4-g-highlights-hall.md docs/superpowers/plans/2026-10-12-highlights-hall.md
```

Expected: `R4-I present` and `R4-J present`. On a STOP, wait for that PR and pull again; do not stub the missing APIs. Read `src/experience/interact/registry.ts` (the contract quoted in Global Constraints) and `e2e/hq.ts` (`targetPoint`, `hoverTarget`, `hoveredTarget`, `interactablesOf`) before Task 3.

- [ ] **Step 2: Write the failing e2e-plan test**

Add inside the existing `describe` of `tests/unit/e2e-plan.test.ts` (next to the other `specsForChanges` cases):

```ts
  it("maps the Highlights Hall to its spec, the 3D experience and the walks", () => {
    expect(specsForChanges(["src/experience/floors/lobby/hallLayout.ts"]).specs).toEqual(["experience", "highlights", "walk"]);
    expect(specsForChanges(["src/experience/floors/lobby/HighlightsHall.tsx"]).specs).toEqual(["experience", "highlights", "walk"]);
    expect(specsForChanges(["src/content/room-views/highlights.ts"]).specs).toEqual(["experience", "highlights", "walk"]);
    expect(specsForChanges(["src/hud/drawer/HighlightsBody.tsx"]).specs).toEqual(["experience", "highlights", "walk"]);
    expect(specsForChanges(["src/experience/floors/lobby/CertWall.tsx"]).specs).toEqual(["experience", "highlights"]);
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bunx vitest run tests/unit/e2e-plan.test.ts`
Expected: FAIL (the new case gets `["experience", "labs", ...]` or `["experience"]`; and the "every spec is known" case fails once `e2e/highlights.spec.ts` exists in Step 5).

- [ ] **Step 4: Register the spec and its rules in `scripts/e2e-plan.ts`**

In `ALL_SPECS`, insert `"highlights",` between `"gallery",` and `"hud",`.

In `RULES`, directly above the line `// 3D floors.`, add:

```ts
  // L1 Highlights Hall: layout, scenery, payload, drawer content and body; its Quick tour runs in the walk spec.
  {
    test: /^src\/experience\/floors\/lobby\/(stations|hallLayout|hallContent|HighlightsHall|hallInteract)\.tsx?$|^src\/content\/(highlights|room-views\/highlights)\.ts$|^src\/hud\/drawer\/HighlightsBody\.tsx$/,
    specs: ["experience", "highlights", "walk"],
  },
```

Replace the Lobby rule (if R4-I or R4-H changed its spec list, keep their specs and add `"highlights"`)

```ts
  { test: /^src\/experience\/floors\/lobby\//, specs: ["experience"] },
```

with

```ts
  { test: /^src\/experience\/floors\/lobby\//, specs: ["experience", "highlights"] },
```

- [ ] **Step 5: Create `e2e/highlights.spec.ts` with the baseline probe**

```ts
import { test } from "@playwright/test";
import { driveTo, enterHQ, expectRenderBudget, snapshot } from "./hq";

/**
 * L1 Highlights Hall (docs/superpowers/plans/2026-10-12-highlights-hall.md). The probe below prints
 * the Lobby's draw calls at the spawn and on the passage south of the certification wall, so every
 * later task can compare against today's numbers (the Lobby is the busiest floor).
 */
test.describe.configure({ timeout: 180_000 });

test("L1 draw calls: plaza and passage", async ({ page }) => {
  for (const tier of ["lite", "full"] as const) {
    await enterHQ(page, { tier });
    await page.waitForTimeout(1500);
    const spawn = await snapshot(page);
    await driveTo(page, { x: 20, z: 15 });
    await page.waitForTimeout(1500);
    const passage = await snapshot(page);
    console.log(`L1 ${tier}: spawn ${spawn.drawCalls} calls, ${spawn.triangles} triangles; passage ${passage.drawCalls} calls, ${passage.triangles} triangles`);
    await expectRenderBudget(page);
  }
});
```

- [ ] **Step 6: Run the unit test and the probe; record the baseline**

Run: `bunx vitest run tests/unit/e2e-plan.test.ts`
Expected: PASS.

Run: `bun run build && bunx playwright test e2e/highlights.spec.ts --reporter=list`
Expected: PASS, with two lines like `L1 lite: spawn N calls, T triangles; passage M calls, U triangles`. Copy both lines into the PR description draft (Task 14 "Budget" section). Task 8 Step 9 saves 8 calls by batching the skills wall text; if any number here is already above 140, flag it in the PR description and ask the owner before Task 8, because the hall adds about 10 calls.

- [ ] **Step 7: Commit**

```bash
rtk git add docs/superpowers/plans/2026-10-12-highlights-hall.md e2e/highlights.spec.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
rtk git commit -m "test: L1 draw-call probe and the highlights e2e spec"
```

---

### Task 2: Lower and shrink the floating Lobby title

**Files:**
- Modify: `src/experience/config.ts` (`LOBBY.titleY`, new `LOBBY.titleFont`)
- Modify: `src/experience/floors/lobby/layout.ts` (title box, `TITLE_TOP`)
- Modify: `src/experience/floors/lobby/ProfileHologram.tsx`
- Modify: `src/experience/camera/rigs.ts` (export `FOLLOW_LOOK_AHEAD`), `src/experience/camera/CameraDirector.tsx` (import it)
- Modify: `docs/superpowers/specs/agent-hq/01-world-and-layout.md` (title row)
- Test: `tests/unit/lobby-title.test.ts`

**Interfaces:**
- Consumes: `followPose(cls, target, yaw, zoom)` (`camera/rigs.ts`), `followOffsetScale(cls, aspect)` (`camera/offset.ts`), `cameraClass(w, h)` (`lib/viewport.ts`), `lobbyElements(statCount)`.
- Produces: `LOBBY.titleY = 6.4`, `LOBBY.titleFont = { name: 0.58, headline: 0.3, gap: 0.12 }`, `TITLE_TOP` (world height of the name's top), `FOLLOW_LOOK_AHEAD` exported from `camera/rigs.ts`.

Context: at 1440x900 the name's top (y 7.6 + 0.78 x 1.2 = 8.54) projects to about 27 px from the top of the screen at the spawn, inside the HUD top bar (it ends at 76 px). With y 6.4 and a 0.58 name it projects to about 85 px. The title must stay above the stats tiles (top 5.85) and the monogram (top 5.85), so 6.4 is close to the floor: the box bottom is 6.4 - 0.12 - 0.3 x 1.2 = 5.92.

- [ ] **Step 1: Write the failing test**

`tests/unit/lobby-title.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getStats } from "@/content/load";
import { followOffsetScale } from "@/experience/camera/offset";
import { FOLLOW_LOOK_AHEAD, followPose, type CameraPose } from "@/experience/camera/rigs";
import { LOBBY } from "@/experience/config";
import { lobbyElements, TITLE_TOP } from "@/experience/floors/lobby/layout";
import { cameraClass } from "@/lib/viewport";

type V3 = [number, number, number];

/** Screen y (CSS px from the top) of a world point seen through a camera pose. */
function screenY(pose: CameraPose, p: V3, width: number, height: number): number {
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (v: V3): V3 => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f = norm(sub(pose.target, pose.position));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(p, pose.position);
  const ndcY = dot(d, u) / dot(d, f) / Math.tan(((pose.fov / 2) * Math.PI) / 180);
  return ((1 - ndcY) / 2) * height;
}

/** The resting follow pose at the Lobby spawn, built like CameraDirector (look ahead along the default forward). */
function spawnPose(width: number, height: number): CameraPose {
  const cls = cameraClass(width, height);
  const ahead = FOLLOW_LOOK_AHEAD[cls] * Math.SQRT1_2;
  return followPose(cls, [LOBBY.spawn.x - ahead, 1, LOBBY.spawn.z - ahead], 0, followOffsetScale(cls, width / height));
}

describe("Lobby title", () => {
  it("clears the HUD top bar at 1440 x 900 (the bar ends at 76 px)", () => {
    const top = screenY(spawnPose(1440, 900), [LOBBY.hologram.x, TITLE_TOP, LOBBY.hologram.z], 1440, 900);
    expect(top).toBeGreaterThanOrEqual(80);
  });

  it("still floats above the stats tiles and the monogram", () => {
    const boxes = lobbyElements(getStats().length);
    const title = boxes.find((b) => b.name === "title")!;
    for (const b of boxes.filter((b) => b.name.startsWith("tile-") || b.name === "monogram")) {
      expect(title.min[1], b.name).toBeGreaterThan(b.max[1]);
    }
    expect(TITLE_TOP).toBeCloseTo(LOBBY.titleY + LOBBY.titleFont.name * 1.2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/lobby-title.test.ts`
Expected: FAIL to compile/import: `FOLLOW_LOOK_AHEAD` and `TITLE_TOP` are not exported.

- [ ] **Step 3: Move `FOLLOW_LOOK_AHEAD` into the pure rigs module**

In `src/experience/camera/rigs.ts`, below `export const FOLLOW ...` add:

```ts
/** How far ahead of the rover (along the camera's forward) the follow camera looks, per camera class. */
export const FOLLOW_LOOK_AHEAD: Record<ViewportClass, number> = { desktop: 6, tablet: 6, mobile: 5 };
```

In `src/experience/camera/CameraDirector.tsx`, delete the line

```ts
const FOLLOW_LOOK_AHEAD = { desktop: 6, tablet: 6, mobile: 5 } as const;
```

and add `FOLLOW_LOOK_AHEAD` to the existing import list from `./rigs` (the same statement that imports `followPose`).

- [ ] **Step 4: Change the title constants**

In `src/experience/config.ts`, replace

```ts
  /** Name and headline float above the stats tiles. */
  titleY: 7.6,
```

with

```ts
  /**
   * Name and headline float above the stats tiles and the monogram (both top out at 5.85), low and
   * small enough that the name clears the HUD top bar at 1440 x 900 (tests/unit/lobby-title.test.ts).
   */
  titleY: 6.4,
  titleFont: { name: 0.58, headline: 0.3, gap: 0.12 },
```

In `src/experience/floors/lobby/layout.ts`, replace

```ts
/** Half of the name/headline text block width (Text maxWidth 14). */
const TITLE_HALF_WIDTH = 7;
```

with

```ts
/** Half of the name/headline text block width (Text maxWidth 14). */
const TITLE_HALF_WIDTH = 7;
/** Troika's "normal" line height is about 1.2 em. */
const TITLE_LINE = 1.2;
/** Height of the name's top (the headline hangs below `LOBBY.titleY`). */
export const TITLE_TOP = LOBBY.titleY + LOBBY.titleFont.name * TITLE_LINE;
const TITLE_BOTTOM = LOBBY.titleY - LOBBY.titleFont.gap - LOBBY.titleFont.headline * TITLE_LINE;
```

and in `lobbyElements` replace

```ts
    box("title", h.x, h.z, TITLE_HALF_WIDTH, TITLE_HALF_WIDTH, LOBBY.titleY - 0.6, LOBBY.titleY + 0.9),
```

with

```ts
    box("title", h.x, h.z, TITLE_HALF_WIDTH, TITLE_HALF_WIDTH, TITLE_BOTTOM, TITLE_TOP),
```

- [ ] **Step 5: Render the new sizes**

In `src/experience/floors/lobby/ProfileHologram.tsx`, replace the `<Billboard position={[0, LOBBY.titleY, 0]}>` block with:

```tsx
      <Billboard position={[0, LOBBY.titleY, 0]}>
        <Text font={FONTS.sansBold} fontSize={LOBBY.titleFont.name} color="#f4f4f5" anchorX="center" anchorY="bottom" maxWidth={14} textAlign="center">
          {name}
        </Text>
        <Text
          font={FONTS.sans}
          fontSize={LOBBY.titleFont.headline}
          color={COLORS.cyan}
          anchorX="center"
          anchorY="top"
          position={[0, -LOBBY.titleFont.gap, 0]}
          maxWidth={14}
          textAlign="center"
          material-toneMapped={false}
        >
          {headline}
        </Text>
      </Billboard>
```

- [ ] **Step 6: Run the tests**

Run: `bunx vitest run tests/unit/lobby-title.test.ts tests/unit/lobby-layout.test.ts tests/unit/rigs.test.ts`
Expected: PASS (the title test reports about 85 px; the Lobby layout test keeps the tiles below the title).

- [ ] **Step 7: Update appendix 01**

In `docs/superpowers/specs/agent-hq/01-world-and-layout.md`, replace the row

```
| Name and headline | Above the hologram, height 7.6 | Text block up to 14 wide | Billboarded, always above the stats tiles |
```

with

```
| Name and headline | Above the hologram, height 6.4 (name 0.58 u, headline 0.3 u) | Text block up to 14 wide | Billboarded, always above the stats tiles and the monogram, and below the HUD top bar at 1440 x 900 (`tests/unit/lobby-title.test.ts`) |
```

- [ ] **Step 8: Commit**

```bash
rtk git add src/experience/config.ts src/experience/floors/lobby/layout.ts src/experience/floors/lobby/ProfileHologram.tsx src/experience/camera/rigs.ts src/experience/camera/CameraDirector.tsx tests/unit/lobby-title.test.ts docs/superpowers/specs/agent-hq/01-world-and-layout.md
rtk git commit -m "fix(lobby): lower and shrink the floating title so it clears the top bar"
```

---

### Task 3: Straighten the Ask Rover kiosk (one unit, centered screen, straight lines, off the slab edge)

Owner review of the L1 kiosk: "the line is not straight". Today the `GlassBox` body is axis-aligned while the screen group is turned `[0, Math.PI / 4, 0]`, tilted `-0.3` and offset `[0.3, 2.15, 0.3]`, so from the follow camera the screen sits crooked against the box, and the 0.12 u text wraps (`maxWidth={2.9}`) into stepped lines. The kiosk body also stands 1 u from the south slab edge (a space-rule sliver).

Decision: square to the grid, facing east (`yaw = PI / 2`). The default follow camera sits at +x +z of the rover, so an east-facing screen reads from the spawn and from the kiosk stop (screen normal against the camera direction: dot about 0.7), and an axis-aligned footprint keeps the obstacle rect exact. Body, stand and screen are one group with one yaw; the screen has no yaw of its own, only its backward tilt.

**Files:**
- Create: `src/experience/floors/lobby/kiosk.ts`
- Modify: `src/experience/config.ts` (`LOBBY.kiosk`)
- Modify: `src/experience/floors/lobby/layout.ts` (kiosk box in `lobbyElements`)
- Modify: `src/experience/floors/lobby/MissionKiosk.tsx` (R4-I's version: no click handler)
- Modify: `src/experience/floors/lobby/Lanes.tsx` (spoke end)
- Modify: `src/experience/interact/registry.ts` (`L1:kiosk:ask-rover` approach point and height)
- Modify: `e2e/screenshots.spec.ts` (kiosk capture)
- Modify: `docs/superpowers/specs/agent-hq/01-world-and-layout.md` (kiosk row)
- Test: `tests/unit/kiosk.test.ts`; existing `tests/unit/lobby-layout.test.ts`, `tests/unit/interact-registry.test.ts`

**Interfaces:**
- Consumes: `LOBBY` (`config.ts`), `GlassBox`, `FONTS` (`tower/primitives.tsx`), R4-I `lobbyItems` in `registry.ts`.
- Produces:
  - `LOBBY.kiosk = { x: 2, z: 19.3, w: 2, d: 3.4 }` (world footprint x 1 to 3, z 17.6 to 21: touches the south edge).
  - `KIOSK` constants (`yaw`, `body`, `stand`, `screen`, `font`, `visible`, `stopGap`).
  - `kioskFacing(): Vec2`, `kioskParts(k?): KioskParts` (group-local `body`, `stand`, `screen`), `kioskStop(k?): Vec2` (`{ x: 5.5, z: 19.3 }`), `fitLine(text, max)`, `kioskMaxChars(width)`, `kioskAllLines(labels, title, hint)`, `kioskLines(labels, title, hint, offset, width)`, `kioskFontSize(lines, width)`.

- [ ] **Step 1: Capture "before" screenshots**

In `e2e/screenshots.spec.ts`, add `interactablesOf` to the `./hq` import and, after the `FLOOR_THUMBS` loop, add:

```ts
/** The L1 Ask Rover kiosk from its point-and-go stop, at the owner's review sizes (`hq-l1-kiosk-*`). */
for (const viewport of L4_VIEWPORTS) {
  test(`3D hq-l1-kiosk @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await open3D(browser, viewport);
    const kiosk = (await interactablesOf(page)).find((i) => i.id === "L1:kiosk:ask-rover")!;
    await driveTo(page, kiosk.at);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: shot("hq-l1-kiosk", viewport) });
    await context.close();
  });
}
```

Run:

```bash
bun run build && SCREENSHOTS=1 bunx playwright test e2e/screenshots.spec.ts -g "hq-l1-kiosk" --workers=1
mkdir -p screenshots/kiosk-before && cp screenshots/hq-l1-kiosk-*.png screenshots/kiosk-before/
```

Expected: three PNGs in `screenshots/kiosk-before/` showing the crooked screen.

- [ ] **Step 2: Write the failing test**

`tests/unit/kiosk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import { fitLine, KIOSK, kioskAllLines, kioskFacing, kioskFontSize, kioskLines, kioskMaxChars, kioskParts, kioskStop } from "@/experience/floors/lobby/kiosk";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

const parts = kioskParts();
const k = LOBBY.kiosk;
const rect = { minX: k.x - k.w / 2, maxX: k.x + k.w / 2, minZ: k.z - k.d / 2, maxZ: k.z + k.d / 2 };
/** World x/z of a group-local point (rotation by the group yaw, then the group position). */
const world = ([x, , z]: [number, number, number]) => {
  const c = Math.cos(parts.group.yaw);
  const s = Math.sin(parts.group.yaw);
  return { x: parts.group.position[0] + x * c + z * s, z: parts.group.position[2] - x * s + z * c };
};

describe("Ask Rover kiosk", () => {
  it("turns body, stand and screen as one unit, square to the grid", () => {
    // The screen and the body have no yaw of their own: both use the group's.
    expect(parts.screen.yaw).toBe(0);
    expect(parts.group.yaw).toBe(KIOSK.yaw);
    expect(Math.abs(KIOSK.yaw / (Math.PI / 2) - Math.round(KIOSK.yaw / (Math.PI / 2)))).toBeLessThan(1e-9);
    expect(parts.screen.tilt).toBeGreaterThan(0);
  });

  it("centers the screen and the stand on the body, the screen as wide as the body and resting on the stand", () => {
    expect(world(parts.screen.position)).toEqual(world(parts.body.position));
    expect(world(parts.stand.position)).toEqual(world(parts.body.position));
    expect(parts.screen.w).toBe(parts.body.size[0]);
    const standTop = parts.stand.position[1] + parts.stand.size[1] / 2;
    const screenBottom = parts.screen.position[1] - (parts.screen.h / 2) * Math.cos(parts.screen.tilt);
    expect(screenBottom).toBeCloseTo(standTop);
    expect(parts.stand.position[1] - parts.stand.size[1] / 2).toBeCloseTo(parts.body.size[1]);
  });

  it("matches the obstacle footprint, touches the south slab edge and keeps clear of the hall passage", () => {
    const [across, , depth] = parts.body.size;
    const f = kioskFacing();
    // Rotated by a quarter turn, the local depth runs along x and the width along z.
    expect(Math.abs(f.x) * depth + Math.abs(f.z) * across).toBeCloseTo(k.w);
    expect(Math.abs(f.x) * across + Math.abs(f.z) * depth).toBeCloseTo(k.d);
    const l1 = buildFloorLayouts(8).L1;
    expect(l1.obstacles[3]).toEqual(rect);
    expect(rect.maxZ).toBe(LOBBY.bounds.maxZ);
    // The Highlights Hall road (Task 7) runs east from (14, 15), 8 u wide: at least 4 u from its center line.
    expect(Math.hypot(14 - rect.maxX, Math.max(0, rect.minZ - 15))).toBeGreaterThanOrEqual(4);
  });

  it("puts the point-and-go stop centered in front of the screen, on open floor, facing the default camera", () => {
    const stop = kioskStop();
    const f = kioskFacing();
    expect(stop).toEqual({ x: 5.5, z: 19.3 });
    expect((stop.x - k.x) * f.x + (stop.z - k.z) * f.z).toBeGreaterThan(0);
    expect((stop.x - k.x) * f.z - (stop.z - k.z) * f.x).toBeCloseTo(0);
    expect(isWalkable(buildNavGrid(buildFloorLayouts(8).L1, ROVER.radius), stop)).toBe(true);
    // The default follow camera sits along (+1, +1): the screen faces it.
    expect((f.x + f.z) / Math.SQRT2).toBeGreaterThan(0.5);
  });

  for (const [locale, m] of [["en", en], ["id", id]] as const) {
    it(`keeps every line on one straight baseline (${locale})`, () => {
      const labels = getContent().missions.map((mission) => mission.label[locale]);
      const width = parts.screen.w;
      const all = kioskAllLines(labels, m.hud.kioskTitle, m.hud.kioskHint);
      const size = kioskFontSize(all, width);
      const usable = width - 2 * KIOSK.screen.pad;
      expect(size).toBeGreaterThanOrEqual(KIOSK.font.min);
      for (let offset = 0; offset < labels.length; offset++) {
        const lines = kioskLines(labels, m.hud.kioskTitle, m.hud.kioskHint, offset, width);
        expect(lines.every((l) => !l.includes("\n"))).toBe(true);
        for (const line of lines) expect(line.length * size * KIOSK.font.advance, line).toBeLessThanOrEqual(usable + 1e-9);
        expect(lines.length * KIOSK.screen.lineHeight * size).toBeLessThanOrEqual(parts.screen.h - 2 * KIOSK.screen.pad);
      }
      // Today's longest mission label (e.g. "Explore my Product Engineering work") fits without truncation.
      const longest = labels.reduce((a, b) => (b.length > a.length ? b : a));
      const at = labels.indexOf(longest);
      expect(kioskLines(labels, m.hud.kioskTitle, m.hud.kioskHint, at, width)).toContain(`${at + 1}. ${longest}`);
    });
  }

  it("shortens a line that could never fit with ASCII dots", () => {
    expect(fitLine("abcdefgh", 6)).toBe("abc...");
    expect(fitLine("abc", 6)).toBe("abc");
    expect(kioskMaxChars(3.4)).toBeGreaterThanOrEqual(50);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bunx vitest run tests/unit/kiosk.test.ts`
Expected: FAIL with "Failed to resolve import "@/experience/floors/lobby/kiosk"".

- [ ] **Step 4: Create `src/experience/floors/lobby/kiosk.ts`**

```ts
import { LOBBY } from "../../config";
import type { Vec2 } from "../../types";

/**
 * Ask Rover kiosk (owner review, October 2026: "the line is not straight"). Body, stand and screen are
 * one unit turned by one yaw, square to the floor grid and facing east, where the default follow camera
 * sits; the screen is centered on the body and every text line sits on one baseline. Pure.
 */
export const KIOSK = {
  /** Square to the grid, facing +x. */
  yaw: Math.PI / 2,
  body: { h: 1.2 },
  stand: { w: 0.4, d: 0.4, h: 0.35 },
  /** Leans back by `tilt` (radians) around its local x; `pad` is the text inset. */
  screen: { h: 1.9, tilt: 0.3, pad: 0.15, lineHeight: 1.45 },
  /** JetBrains Mono advances 0.6 em per glyph. */
  font: { max: 0.12, min: 0.09, advance: 0.6 },
  /** Mission lines on screen at once (it scrolls one line every 2.2 s). */
  visible: 5,
  /** The rover stops this far in front of the screen (point-and-go `L1:kiosk:ask-rover`). */
  stopGap: 2.5,
} as const;

type V3 = [number, number, number];

export interface KioskParts {
  /** The whole kiosk: one group at the footprint center, turned by `KIOSK.yaw`. Everything below is group-local. */
  group: { position: V3; yaw: number };
  /** Local size [across, height, depth]; across is the screen width. */
  body: { size: V3; position: V3 };
  stand: { size: V3; position: V3 };
  /** Centered on the body and the stand; tilted back by `tilt`; no yaw of its own. */
  screen: { position: V3; w: number; h: number; tilt: number; yaw: 0 };
}

const snap = (v: number) => Math.round(v * 1e9) / 1e9 + 0;

/** Unit direction the screen faces (floor plane). */
export function kioskFacing(): Vec2 {
  return { x: snap(Math.sin(KIOSK.yaw)), z: snap(Math.cos(KIOSK.yaw)) };
}

/** Body, stand and screen in the kiosk group's local space, from the world footprint `LOBBY.kiosk`. */
export function kioskParts(k: { x: number; z: number; w: number; d: number } = LOBBY.kiosk): KioskParts {
  const f = kioskFacing();
  const depth = Math.abs(f.x) * k.w + Math.abs(f.z) * k.d;
  const across = Math.abs(f.x) * k.d + Math.abs(f.z) * k.w;
  const standTop = KIOSK.body.h + KIOSK.stand.h;
  const halfDrop = (KIOSK.screen.h / 2) * Math.cos(KIOSK.screen.tilt);
  return {
    group: { position: [k.x, 0, k.z], yaw: KIOSK.yaw },
    body: { size: [across, KIOSK.body.h, depth], position: [0, KIOSK.body.h / 2, 0] },
    stand: { size: [KIOSK.stand.w, KIOSK.stand.h, KIOSK.stand.d], position: [0, KIOSK.body.h + KIOSK.stand.h / 2, 0] },
    screen: { position: [0, standTop + halfDrop, 0], w: across, h: KIOSK.screen.h, tilt: KIOSK.screen.tilt, yaw: 0 },
  };
}

/** Where the rover stops for the kiosk: centered in front of the screen. */
export function kioskStop(k: { x: number; z: number; w: number; d: number } = LOBBY.kiosk): Vec2 {
  const f = kioskFacing();
  const half = (Math.abs(f.x) * k.w + Math.abs(f.z) * k.d) / 2;
  return { x: snap(k.x + f.x * (half + KIOSK.stopGap)), z: snap(k.z + f.z * (half + KIOSK.stopGap)) };
}

/** Shortens a line to `max` characters with ASCII dots (the kiosk font always has them). */
export function fitLine(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

/** Most characters one line holds at the smallest font size. */
export function kioskMaxChars(width: number): number {
  return Math.floor((width - 2 * KIOSK.screen.pad) / (KIOSK.font.min * KIOSK.font.advance));
}

/** Every line the screen can ever show (title, each numbered mission, the hint): the font size fits the longest. */
export function kioskAllLines(labels: readonly string[], title: string, hint: string): string[] {
  return [title, ...labels.map((label, i) => `${i + 1}. ${label}`), `> ${hint}`];
}

/** The lines on screen at a scroll offset: title, `KIOSK.visible` numbered missions, a gap, the hint; each fitted to one line. */
export function kioskLines(labels: readonly string[], title: string, hint: string, offset: number, width: number): string[] {
  const max = kioskMaxChars(width);
  const shown = Array.from({ length: Math.min(KIOSK.visible, labels.length) }, (_, i) => (offset + i) % labels.length);
  return [title, ...shown.map((i) => `${i + 1}. ${labels[i]}`), "", `> ${hint}`].map((line) => fitLine(line, max));
}

/** One font size for every line: the longest line fills the usable width, within the min and max sizes. */
export function kioskFontSize(lines: readonly string[], width: number): number {
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const fit = (width - 2 * KIOSK.screen.pad) / (longest * KIOSK.font.advance);
  return Math.max(KIOSK.font.min, Math.min(KIOSK.font.max, fit));
}
```

- [ ] **Step 5: Move the footprint and fix the Lobby element box**

In `src/experience/config.ts`, replace `  kiosk: { x: 2, z: 19, w: 3, d: 2 },` with:

```ts
  /** Ask Rover kiosk footprint (x 1 to 3, z 17.6 to 21): touches the south slab edge; floors/lobby/kiosk.ts turns it to face east. */
  kiosk: { x: 2, z: 19.3, w: 2, d: 3.4 },
```

In `src/experience/floors/lobby/layout.ts` (`lobbyElements`), replace

```ts
    // Body plus the tilted screen above it (rotated 45 degrees, offset toward the camera).
    box("kiosk", k.x + 0.15, k.z + 0.15, k.w / 2 + 0.3, k.d / 2 + 0.6, 0, 3.2),
```

with

```ts
    // Body, stand and the screen centered above them, facing east (floors/lobby/kiosk.ts); the tilt leans it 0.3 u.
    box("kiosk", k.x, k.z, k.w / 2 + 0.3, k.d / 2, 0, 3.4),
```

In `src/experience/floors/lobby/Lanes.tsx`, replace `    spoke([LOBBY.kiosk.x + 1.2, LOBBY.kiosk.z - 1.2]),` with `    spoke([LOBBY.kiosk.x + LOBBY.kiosk.w / 2 + 0.4, LOBBY.kiosk.z]),`.

- [ ] **Step 6: Render the kiosk as one unit**

Replace the body of `src/experience/floors/lobby/MissionKiosk.tsx` (R4-I's version, already without the click handler) with:

```tsx
"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { getHQStore } from "@/store/useHQStore";
import { COLORS } from "../../config";
import type { ExperienceData } from "../../types";
import { FONTS, GlassBox } from "../../tower/primitives";
import { KIOSK, kioskAllLines, kioskFontSize, kioskLines, kioskParts } from "./kiosk";

const TICK = 2.2;

export interface KioskLabels {
  title: string;
  hint: string;
}

/**
 * Diegetic mirror of the Rover Terminal missions; a point-and-go target (L1:kiosk:ask-rover) that opens
 * Ask Rover. Body, stand and screen turn as one unit (floors/lobby/kiosk.ts); lines never wrap.
 */
export function MissionKiosk({ missions, labels }: { missions: ExperienceData["missions"]; labels: KioskLabels }) {
  const parts = useMemo(() => kioskParts(), []);
  const names = useMemo(() => missions.map((m) => m.label), [missions]);
  const fontSize = useMemo(() => kioskFontSize(kioskAllLines(names, labels.title, labels.hint), parts.screen.w), [names, labels.title, labels.hint, parts]);
  // Five missions at a time, one line every 2.2 s (static under reduced motion).
  const [offset, setOffset] = useState(0);
  const clock = useRef(0);
  useFrame((_, dt) => {
    if (names.length <= KIOSK.visible || getHQStore().getState().reducedMotion) return;
    clock.current += Math.min(dt, 0.1);
    if (clock.current > TICK) {
      clock.current = 0;
      setOffset((o) => (o + 1) % names.length);
    }
  });
  const text = kioskLines(names, labels.title, labels.hint, offset, parts.screen.w).join("\n");
  const { group, body, stand, screen } = parts;
  return (
    <group position={group.position} rotation={[0, group.yaw, 0]}>
      <GlassBox size={body.size} position={body.position} color={COLORS.green} fillOpacity={0.1} />
      <mesh position={stand.position} raycast={() => null}>
        <boxGeometry args={stand.size} />
        <meshBasicMaterial color={COLORS.green} transparent opacity={0.35} toneMapped={false} />
      </mesh>
      <group position={screen.position} rotation={[-screen.tilt, 0, 0]}>
        <mesh raycast={() => null}>
          <planeGeometry args={[screen.w, screen.h]} />
          <meshBasicMaterial color={COLORS.terminalBg} transparent opacity={0.95} />
        </mesh>
        <Text
          font={FONTS.mono}
          fontSize={fontSize}
          color={COLORS.terminalFg}
          anchorX="left"
          anchorY="top"
          position={[-screen.w / 2 + KIOSK.screen.pad, screen.h / 2 - KIOSK.screen.pad, 0.01]}
          lineHeight={KIOSK.screen.lineHeight}
          whiteSpace="nowrap"
          material-toneMapped={false}
        >
          {text}
        </Text>
      </group>
    </group>
  );
}
```

- [ ] **Step 7: Point the registry's kiosk target at the new stop**

In `src/experience/interact/registry.ts` (R4-I), add `import { kioskStop } from "../floors/lobby/kiosk";`, change `const KIOSK_HEIGHT = 3.2;` to `const KIOSK_HEIGHT = 3.4;`, and in `lobbyItems` replace

```ts
      // On the open floor south of the kiosk, clear of its obstacle by more than the rover radius.
      at: { x: kiosk.x, z: kiosk.z - kiosk.d / 2 - 2.5 },
```

with

```ts
      // Centered in front of the screen (floors/lobby/kiosk.ts), so the rover stops facing it.
      at: kioskStop(),
```

(`bounds: rectAround(kiosk, kiosk.w, kiosk.d)` already follows `LOBBY.kiosk`.) If R4-I's `PICK_HEIGHT.kiosk` in `pick.ts` is 3.2, set it to 3.4 too.

- [ ] **Step 8: Run the tests**

Run: `bunx vitest run tests/unit/kiosk.test.ts tests/unit/lobby-layout.test.ts tests/unit/interact-registry.test.ts tests/unit/floor-pads.test.ts tests/unit/pad-space.test.ts`
Expected: PASS. The Lobby walkway test keeps at least 4 u between the lane ring and the kiosk box (about 4.3 u), and the box stays on the slab (z up to 21).

- [ ] **Step 9: Capture "after" screenshots and compare**

```bash
bun run build && SCREENSHOTS=1 bunx playwright test e2e/screenshots.spec.ts -g "hq-l1-kiosk|3D lobby" --workers=1
mkdir -p screenshots/kiosk-after && cp screenshots/hq-l1-kiosk-*.png screenshots/kiosk-after/
```

Expected: in `screenshots/kiosk-after/` the screen sits square on its stand, centered on the body, its edges parallel to the body's, every line straight and unwrapped, at 1440x900, 834x1112 and 390x844. Put each before/after pair side by side in the PR (Task 14).

- [ ] **Step 10: Update appendix 01**

In `docs/superpowers/specs/agent-hq/01-world-and-layout.md`, replace the row

```
| Ask Rover kiosk | (2, 19) | 3 × 2 | Diegetic mirror of Ask Rover (the Rover Terminal missions) |
```

with

```
| Ask Rover kiosk | (2, 19.3), touching the south edge | 2 × 3.4 | Diegetic mirror of Ask Rover: body, stand and screen as one unit square to the grid, facing east (`floors/lobby/kiosk.ts`); lines never wrap |
```

- [ ] **Step 11: Commit**

```bash
rtk git add src/experience/floors/lobby/kiosk.ts src/experience/config.ts src/experience/floors/lobby/layout.ts src/experience/floors/lobby/MissionKiosk.tsx src/experience/floors/lobby/Lanes.tsx src/experience/interact/registry.ts e2e/screenshots.spec.ts tests/unit/kiosk.test.ts docs/superpowers/specs/agent-hq/01-world-and-layout.md
rtk git commit -m "fix(lobby): straighten the Ask Rover kiosk into one unit with unwrapped lines"
```

(add `src/experience/interact/pick.ts` when Step 7 changed it)

---

### Task 4: Station ids, content selectors and the 3D payload

**Files:**
- Create: `src/experience/floors/lobby/stations.ts`
- Create: `src/content/highlights.ts`
- Modify: `src/experience/types.ts` (`HighlightsData`, `ExperienceData.highlights`)
- Modify: `src/content/experience.ts` (`buildExperienceData`)
- Modify: `messages/en.json`, `messages/id.json` (`hud.rooms.highlights*`)
- Test: `tests/unit/highlights-data.test.ts`

**Interfaces:**
- Consumes: `pickFeaturedPods(sorted)` (`src/content/pageview.ts`), `getPods()` (site order), `getTimeline()`, `sortTimeline`, `coverImage(assets, locale)`, `buildCareerData(locale)`.
- Produces:
  - `HIGHLIGHT_STATIONS: readonly ["about", "projects", "experience", "contact"]`, `type HighlightStation`
  - `highlightRoom(station: HighlightStation): RoomId` (`"L1:highlights-<station>"`)
  - `isHighlightRoom(room: string): boolean`
  - `highlightsRoomFromHash(hash: string): RoomId | null`
  - `experienceRows(career: CareerData): { employment: CareerEntryView[]; freelance: CareerEntryView[] }` (newest first)
  - `HIGHLIGHT_STAT_COUNT = 4`
  - `highlightProjects(pods?: readonly Pod[]): Pod[]`, `highlightEntries(entries): { employment: TimelineEntry[]; freelance: TimelineEntry[] }`, `buildHighlightsData(locale): HighlightsData`
  - `interface HighlightsData { projects: { slug: string; title: string; wing: Wing; thumb: string }[] }`, `ExperienceData.highlights: HighlightsData` (live links stay on `LabPod.liveUrl` from R4-J; station names come from messages in the client, not the payload)

- [ ] **Step 1: Write the failing test**

`tests/unit/highlights-data.test.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCareerData, buildExperienceData } from "@/content/experience";
import { buildHighlightsData, highlightEntries, highlightProjects } from "@/content/highlights";
import { getPod, getPods, getTimeline } from "@/content/load";
import { pickFeaturedPods } from "@/content/pageview";
import { podLiveLink } from "@/content/selectors";
import { experienceRows, highlightRoom, highlightsRoomFromHash, isHighlightRoom } from "@/experience/floors/lobby/stations";

const names = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };

describe("Highlights data", () => {
  it("picks the same three projects as the Page View landing", () => {
    const landing = pickFeaturedPods(getPods()).map((p) => p.slug);
    expect(landing).toHaveLength(3);
    expect(highlightProjects().map((p) => p.slug)).toEqual(landing);
    expect(buildHighlightsData("en").projects.map((p) => p.slug)).toEqual(landing);
  });

  it("ships a cover thumbnail that exists for every project", () => {
    for (const p of buildHighlightsData("en").projects) {
      expect(p.thumb).toMatch(/\.thumb\.webp$/);
      expect(existsSync(join(process.cwd(), "public", p.thumb)), p.thumb).toBe(true);
    }
  });

  it("splits employment and freelance, newest first", () => {
    const { employment, freelance } = highlightEntries(getTimeline());
    expect(employment.length).toBeGreaterThan(0);
    expect(freelance.length).toBeGreaterThan(0);
    expect(employment.every((e) => e.type === "job")).toBe(true);
    expect(freelance.every((e) => e.type === "freelance")).toBe(true);
    for (const list of [employment, freelance]) {
      const starts = list.map((e) => e.start);
      expect(starts).toEqual([...starts].sort().reverse());
    }
  });

  it("orders the 3D rows like the drawer (same slugs, same order)", () => {
    const rows = experienceRows(buildCareerData("en"));
    const entries = highlightEntries(getTimeline());
    expect(rows.employment.map((e) => e.slug)).toEqual(entries.employment.map((e) => e.slug));
    expect(rows.freelance.map((e) => e.slug)).toEqual(entries.freelance.map((e) => e.slug));
  });

  it("finds every project's live link (R4-J) on the L3 payload, so the hall never ships it twice", () => {
    const data = buildExperienceData("en", names);
    for (const p of data.highlights.projects) {
      const labPod = data.labs.pods.find((pod) => pod.slug === p.slug)!;
      expect(podLiveLink(labPod)).toEqual(podLiveLink(getPod(p.slug)!));
    }
    expect(Object.keys(data.highlights.projects[0]).sort()).toEqual(["slug", "thumb", "title", "wing"]);
  });

  it("adds the payload to ExperienceData in the requested locale", () => {
    const data = buildExperienceData("id", names);
    expect(data.highlights.projects).toHaveLength(3);
    expect(data.highlights.projects[0].title).toBe(pickFeaturedPods(getPods())[0].title.id);
  });
});

describe("Highlights rooms", () => {
  it("builds room ids and parses deep-link hashes", () => {
    expect(highlightRoom("projects")).toBe("L1:highlights-projects");
    expect(isHighlightRoom("L1:highlights-contact")).toBe(true);
    expect(isHighlightRoom("L1:profile")).toBe(false);
    expect(highlightsRoomFromHash("#highlights")).toBe("L1:highlights-about");
    expect(highlightsRoomFromHash("#highlights-experience")).toBe("L1:highlights-experience");
    expect(highlightsRoomFromHash("#HIGHLIGHTS-CONTACT")).toBe("L1:highlights-contact");
    expect(highlightsRoomFromHash("#work")).toBeNull();
    expect(highlightsRoomFromHash("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/highlights-data.test.ts`
Expected: FAIL with "Failed to resolve import "@/content/highlights"".

- [ ] **Step 3: Create `src/experience/floors/lobby/stations.ts`**

```ts
import type { RoomId } from "@/content/schema";
import type { CareerData, CareerEntryView } from "../../types";

/**
 * L1 Highlights Hall stations (owner request, October 2026): a short walk-through gallery east of the
 * certification wall that sums up the tower. Ids and small helpers only, with type-only imports: the
 * gate reads the deep-link hash in the main bundle, the layout lives in hallLayout.ts.
 */
export const HIGHLIGHT_STATIONS = ["about", "projects", "experience", "contact"] as const;
export type HighlightStation = (typeof HIGHLIGHT_STATIONS)[number];

/** How many headline stats the About station shows (the first ones in content order). */
export const HIGHLIGHT_STAT_COUNT = 4;

export const highlightRoom = (station: HighlightStation): RoomId => `L1:highlights-${station}`;

export function isHighlightRoom(room: string): boolean {
  return HIGHLIGHT_STATIONS.some((s) => room === highlightRoom(s));
}

/** `#highlights` (the first station) or `#highlights-<station>` on `/{locale}`; null for anything else. */
export function highlightsRoomFromHash(hash: string): RoomId | null {
  const value = hash.replace(/^#/, "").toLowerCase();
  if (value === "highlights") return highlightRoom("about");
  const station = HIGHLIGHT_STATIONS.find((s) => value === `highlights-${s}`);
  return station ? highlightRoom(station) : null;
}

/** Employment ("job") and freelance rooms from the L2 payload, newest first (the Career Road reversed). */
export function experienceRows(career: CareerData): { employment: CareerEntryView[]; freelance: CareerEntryView[] } {
  const newest = career.years.flatMap((y) => y.entries).reverse();
  return { employment: newest.filter((e) => e.type === "job"), freelance: newest.filter((e) => e.type === "freelance") };
}
```

- [ ] **Step 4: Add the payload type**

In `src/experience/types.ts`:

Replace the first import line

```ts
import type { Accent, FloorId, RoomId, Tier, Wing } from "@/content/schema";
```

with

```ts
import type { Accent, FloorId, RoomId, Tier, Wing } from "@/content/schema";
```

(the file keeps its existing import line unchanged; nothing new is needed there)

In `interface ExperienceData`, after `roof: RoofData;` add:

```ts
  /** L1 Highlights Hall: the landing's featured projects with their cover thumbnails. */
  highlights: HighlightsData;
```

At the end of the file add:

```ts
/** L1 Highlights Hall payload (locale-resolved; drawer content comes from `room-views/highlights.ts`). */
export interface HighlightsData {
  /** The Page View landing's featured projects (`pickFeaturedPods` over site order), each with its 480 px cover thumbnail. */
  projects: { slug: string; title: string; wing: Wing; thumb: string }[];
}
```

- [ ] **Step 5: Add the station names to messages** (used by the catalog in Task 5 and the point-and-go labels in Tasks 8 and 11)

In `messages/en.json` under `hud.rooms`, after `"research": "Research shelf"` add (mind the comma on the previous line):

```json
      "highlightsAbout": "Highlights: about me",
      "highlightsProjects": "Highlights: top projects",
      "highlightsExperience": "Highlights: work experience",
      "highlightsContact": "Highlights: contact"
```

In `messages/id.json` under `hud.rooms`, after `"research": "Rak riset"` add:

```json
      "highlightsAbout": "Sorotan: tentang saya",
      "highlightsProjects": "Sorotan: proyek unggulan",
      "highlightsExperience": "Sorotan: pengalaman kerja",
      "highlightsContact": "Sorotan: kontak"
```

- [ ] **Step 6: Create `src/content/highlights.ts`**

```ts
import type { HighlightsData } from "@/experience/types";
import { getPods } from "./load";
import { coverImage } from "./media";
import { pickFeaturedPods } from "./pageview";
import type { Locale, Pod, TimelineEntry } from "./schema";
import { sortTimeline } from "./selectors";

/** The top projects: the Page View landing's featured pods (the first three with a gallery, in site order). */
export function highlightProjects(pods: readonly Pod[] = getPods()): Pod[] {
  return pickFeaturedPods(pods);
}

/** Employment and freelance entries, newest first, split for the Work experience station. */
export function highlightEntries(entries: readonly TimelineEntry[]): { employment: TimelineEntry[]; freelance: TimelineEntry[] } {
  const newest = [...sortTimeline(entries)].reverse();
  return { employment: newest.filter((e) => e.type === "job"), freelance: newest.filter((e) => e.type === "freelance") };
}

/** 3D payload: the three projects with their cover thumbnail (their live links stay on `LabPod.liveUrl`). */
export function buildHighlightsData(locale: Locale): HighlightsData {
  return {
    projects: highlightProjects().map((pod) => ({
      slug: pod.slug,
      title: pod.title[locale],
      wing: pod.wing,
      // pickFeaturedPods only returns pods with a gallery, so a cover always exists.
      thumb: coverImage(pod.assets, locale)!.thumb,
    })),
  };
}
```

- [ ] **Step 7: Ship it in `ExperienceData`**

In `src/content/experience.ts` add the import

```ts
import { buildHighlightsData } from "./highlights";
```

and in `buildExperienceData`, after `roof: buildRoofData(locale),` add:

```ts
    highlights: buildHighlightsData(locale),
```

- [ ] **Step 8: Run the tests**

Run: `bunx vitest run tests/unit/highlights-data.test.ts tests/unit/experience-data.test.ts tests/unit/ui-copy.test.ts`
Expected: PASS.

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
rtk git add src/experience/floors/lobby/stations.ts src/content/highlights.ts src/experience/types.ts src/content/experience.ts messages/en.json messages/id.json tests/unit/highlights-data.test.ts
rtk git commit -m "feat(highlights): station ids, content selectors and the 3D payload"
```

---

### Task 5: Catalog rooms, drawer content and the static anchors

**Files:**
- Modify: `src/experience/missions/rooms.ts` (`RoomKind`, `StructuralRoom`, catalog)
- Modify: `src/content/room-views/types.ts` (`RoomCard`, `RoomView.cards`)
- Modify: `src/content/room-views/roof.ts` (export `contactItems`, `cvItems`)
- Create: `src/content/room-views/highlights.ts`
- Modify: `src/content/room-views/index.ts`
- Modify: `messages/en.json`, `messages/id.json` (`hall` namespace)
- Modify: `src/app/[locale]/page.tsx` (`id="contact"`)
- Modify: `src/experience/Experience.tsx` (R4-I `labels.interact.rooms` gains the four new structural rooms)
- Test: `tests/unit/room-views.test.ts`, `tests/unit/missions-rooms.test.ts`

**Interfaces:**
- Consumes: Task 4 (`highlightRoom`, `HIGHLIGHT_STAT_COUNT`, `highlightProjects`, `highlightEntries`); `chain`, `single`, `messages`, `fill`, `roomId`, `linkLogo` (`room-views/shared.ts`); `coverImage`; `formatPeriod`; `podLiveLink` (R4-J, `@/content/selectors`).
- Produces:
  - `RoomKind` gains `"highlights"`; four catalog rooms with `path`/`floorPath` `/#intro`, `/#work`, `/#journey`, `/#contact`.
  - `interface RoomCard { room: RoomId; title: string; subtitle?: string; meta?: string; group?: string; image?: RoomImage; type?: CareerType; live?: string }`, `RoomView.cards?: RoomCard[]` (`live` is `podLiveLink(pod)?.href`, only on project cards with a live site).
  - `buildHighlightsViews(locale): RoomView[]` (chain about, projects, experience, contact).
  - `contactItems(locale): RoomLinkItem[]`, `cvItems(locale): RoomLinkItem[]` from `room-views/roof.ts`.
  - Messages `hall.{hall, about, projects, projectsSub, experience, counts, contact, more, cvHint, fullProfile, openProject, openRole}`. The experience groups reuse the career type labels `common.type.job` ("Employment" / "Pekerjaan") and `common.type.freelance` ("Freelance"), the same labels as the L2 type icons and the `/journey` chips.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/room-views.test.ts` (inside the top-level `describe`, after the last `it`):

```ts
  it("builds the Highlights Hall stations from the landing's selectors (both locales)", () => {
    for (const locale of LOCALES) {
      const views = buildRoomViews(locale);
      const about = views["L1:highlights-about"];
      expect(about.kind).toBe("highlights");
      expect(about.title).toBe(getProfile().name);
      expect(about.metrics.map((m) => m.value)).toEqual(getStats().slice(0, 4).map((s) => s.value));
      expect(about.link?.room).toBe("L1:profile");

      const projects = views["L1:highlights-projects"];
      expect(projects.cards?.map((c) => c.room)).toEqual(pickFeaturedPods(getPods()).map((p) => `L3:${p.slug}`));
      for (const card of projects.cards ?? []) expect(card.image?.thumb).toMatch(/\.thumb\.webp$/);
      // Live sites (R4-J) only through the guarded selector; never a hard-coded slug.
      expect(projects.cards?.map((c) => c.live)).toEqual(pickFeaturedPods(getPods()).map((p) => podLiveLink(p)?.href));

      const experience = views["L1:highlights-experience"];
      const { employment, freelance } = highlightEntries(getTimeline());
      expect(experience.cards?.map((c) => c.room)).toEqual([...employment, ...freelance].map((e) => `L2:${e.slug}`));
      expect(new Set(experience.cards?.map((c) => c.group)).size).toBe(2);
      expect(experience.cards?.every((c) => c.type === "job" || c.type === "freelance")).toBe(true);

      const contact = views["L1:highlights-contact"];
      const items = contact.sections.flatMap((s) => s.items ?? []);
      expect(items.some((i) => i.href === `mailto:${getContact().email}`)).toBe(true);
      expect(items.some((i) => i.href?.endsWith(".pdf"))).toBe(true);
      expect([about, projects, experience, contact].map((v) => v.next)).toEqual(["L1:highlights-projects", "L1:highlights-experience", "L1:highlights-contact", undefined]);
    }
  });
```

and extend its imports:

```ts
import { getContact, getContent, getPods, getProfile, getStats, getTimeline } from "@/content/load";
import { highlightEntries } from "@/content/highlights";
import { pickFeaturedPods } from "@/content/pageview";
import { podLiveLink } from "@/content/selectors";
```

(replace the existing `import { getContent, getPods, getProfile } from "@/content/load";` line).

Append to `tests/unit/missions-rooms.test.ts`, inside `describe("room catalog", ...)`:

```ts
  it("adds the four Highlights Hall stations, each with a landing anchor for the static tier", () => {
    const hall = rooms.filter((r) => r.kind === "highlights");
    expect(hall.map((r) => r.id)).toEqual(["L1:highlights-about", "L1:highlights-projects", "L1:highlights-experience", "L1:highlights-contact"]);
    expect(hall.map((r) => r.path)).toEqual(["/#intro", "/#work", "/#journey", "/#contact"]);
    for (const room of hall) {
      expect(room.floorPath).toBe(room.path);
      expect(room.surpriseWeight).toBe(0);
      expect(room.keywords).toContain("highlights");
    }
    expect(roomFromPath("/", rooms)?.id).toBe("L1:profile");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/room-views.test.ts tests/unit/missions-rooms.test.ts`
Expected: FAIL (`views["L1:highlights-about"]` is undefined; no `highlights` rooms).

- [ ] **Step 3: Add the catalog rooms**

In `src/experience/missions/rooms.ts`:

Replace the first import

```ts
import { clientKeywords, groupEntriesByYear, isResearch, orderPods } from "@/content/selectors";
```

with

```ts
import { pickFeaturedPods } from "@/content/pageview";
import { clientKeywords, groupEntriesByYear, isResearch, orderPods } from "@/content/selectors";
```

Replace

```ts
export type RoomKind = "lobby" | "career" | "workshop" | "pod" | "post" | "shelf" | "research" | "roof";
```

with

```ts
export type RoomKind = "lobby" | "highlights" | "career" | "workshop" | "pod" | "post" | "shelf" | "research" | "roof";
```

Replace

```ts
export type StructuralRoom = "profile" | "stats" | "skills" | "certifications" | "workshop" | "publications" | "talks" | "contact" | "cv" | "research";
```

with

```ts
export type StructuralRoom =
  | "profile"
  | "stats"
  | "skills"
  | "certifications"
  | "workshop"
  | "publications"
  | "talks"
  | "contact"
  | "cv"
  | "research"
  | "highlightsAbout"
  | "highlightsProjects"
  | "highlightsExperience"
  | "highlightsContact";
```

In `buildRoomCatalog`, directly after the `L1:certifications` `add(...)` line, add:

```ts
  // L1 Highlights Hall: four stations behind the certification wall. The static tier shows the landing's matching section.
  const featured = pickFeaturedPods(orderPods(content.floors.labs.pods));
  const hall = ["highlights", "sorotan", "summary", "ringkasan"];
  add({ floor: "L1", slug: "highlights-about", kind: "highlights", title: labels.highlightsAbout, subtitle: content.profile.headline, keywords: [...hall, "about", "tentang", content.profile.name], path: "/#intro", floorPath: "/#intro", surpriseWeight: 0 });
  add({ floor: "L1", slug: "highlights-projects", kind: "highlights", title: labels.highlightsProjects, keywords: [...hall, "top projects", "proyek", ...featured.map((p) => p.title.en)], path: "/#work", floorPath: "/#work", surpriseWeight: 0 });
  add({ floor: "L1", slug: "highlights-experience", kind: "highlights", title: labels.highlightsExperience, keywords: [...hall, "experience", "pengalaman", "employment", "pekerjaan", "freelance"], path: "/#journey", floorPath: "/#journey", surpriseWeight: 0 });
  add({ floor: "L1", slug: "highlights-contact", kind: "highlights", title: labels.highlightsContact, subtitle: content.floors.roof.availability, keywords: [...hall, "contact", "kontak", "email", "cv"], path: "/#contact", floorPath: "/#contact", surpriseWeight: 0 });
```

- [ ] **Step 4: Add `RoomCard` to the drawer contract**

In `src/content/room-views/types.ts`, above `export interface RoomView {` add:

```ts
/**
 * A card that rides to another room (Highlights Hall: a project on L3, a role on L2). Locale-resolved;
 * `group` is the heading the card is listed under ("Employment", "Freelance").
 */
export interface RoomCard {
  room: RoomId;
  title: string;
  subtitle?: string;
  meta?: string;
  group?: string;
  image?: RoomImage;
  /** Career rooms: the Neon line type icon in its `CAREER_TONE`. */
  type?: CareerType;
  /** Project cards: the public live site (`podLiveLink(pod)?.href`, R4-J), shown as "Visit live site". */
  live?: string;
}
```

and in `RoomView`, after the `research?: ...` field add:

```ts
  /** Highlights Hall: cards that ride to their room (`HighlightsBody`). */
  cards?: RoomCard[];
```

- [ ] **Step 5: Share the contact and CV items from the roof builder**

Replace the body of `src/content/room-views/roof.ts` with:

```ts
import { getContact, getProfile, getRoof } from "../load";
import type { Locale } from "../schema";
import { cvPdfPath } from "@/lib/cv";
import { chain, linkLogo, messages, roomId, single } from "./shared";
import type { RoomLinkItem, RoomView } from "./types";

/** Email first, then every published channel (new tab) with its logo. Shared with the Highlights Hall contact station. */
export function contactItems(locale: Locale): RoomLinkItem[] {
  const m = messages(locale);
  const contact = getContact();
  return [
    { title: m.common.email, meta: contact.email, href: `mailto:${contact.email}` },
    { ...linkLogo("LinkedIn"), title: "LinkedIn", href: contact.linkedin, external: true },
    { ...linkLogo("GitHub"), title: "GitHub", href: contact.github, external: true },
    ...(contact.huggingface ? [{ ...linkLogo("Hugging Face"), title: "Hugging Face", href: contact.huggingface, external: true }] : []),
    ...(contact.medium ? [{ ...linkLogo("Medium"), title: "Medium", href: contact.medium, external: true }] : []),
    ...(contact.googleScholar ? [{ ...linkLogo("Google Scholar"), title: "Google Scholar", href: contact.googleScholar, external: true }] : []),
    ...(contact.ieeeXplore ? [{ ...linkLogo("IEEE Xplore"), title: "IEEE Xplore", href: contact.ieeeXplore, external: true }] : []),
  ];
}

/** The CV PDF (download) and the /cv page. */
export function cvItems(locale: Locale): RoomLinkItem[] {
  const m = messages(locale);
  return [
    { title: m.drawer.rooms.cvPdf, href: cvPdfPath(getRoof().cv.fileName), external: true },
    { title: m.drawer.rooms.cvPage, href: "/cv" },
  ];
}

/** RF roof deck: the comms station and the CV kiosk. `RoofBody` (hud/drawer/RoofBody.tsx) renders both. */
export function buildRoofViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const roof = getRoof();
  const profile = getProfile();
  return chain([
    single({
      id: roomId("RF", "contact"),
      kind: "roof",
      title: m.hud.rooms.contact,
      subtitle: roof.availability[locale],
      meta: [profile.location[locale], profile.timezone],
      accent: "blue",
      sections: [{ title: m.drawer.rooms.channels, items: contactItems(locale) }],
      page: "/contact",
    }),
    single({
      id: roomId("RF", "cv"),
      kind: "roof",
      title: m.hud.rooms.cv,
      subtitle: m.contact.cvIntro,
      accent: "blue",
      sections: [{ title: m.drawer.rooms.downloads, items: cvItems(locale) }],
      page: "/cv",
    }),
  ]);
}
```

- [ ] **Step 6: Add the `hall` messages**

In `messages/en.json`, add a top-level key after `"walk": { ... },`:

```json
  "hall": {
    "hall": "Highlights Hall",
    "about": "About me",
    "projects": "Top 3 projects",
    "projectsSub": "The three projects I would show first, with screenshots.",
    "experience": "Work experience",
    "counts": "{employment} employment roles and {freelance} freelance projects, newest first",
    "contact": "Contact",
    "more": "+{count} more in the drawer",
    "cvHint": "My CV is one tap away: open this station",
    "fullProfile": "Read my full profile",
    "openProject": "Open in the Labs",
    "openRole": "Open on the Career Road"
  },
```

In `messages/id.json`, at the same place:

```json
  "hall": {
    "hall": "Aula Sorotan",
    "about": "Tentang saya",
    "projects": "3 proyek teratas",
    "projectsSub": "Tiga proyek yang akan saya tunjukkan lebih dulu, lengkap dengan screenshot.",
    "experience": "Pengalaman kerja",
    "counts": "{employment} peran pekerjaan dan {freelance} proyek freelance, terbaru lebih dulu",
    "contact": "Kontak",
    "more": "+{count} lainnya di panel",
    "cvHint": "CV saya tinggal satu ketukan: buka stasiun ini",
    "fullProfile": "Baca profil lengkap saya",
    "openProject": "Buka di Labs",
    "openRole": "Buka di Career Road"
  },
```

- [ ] **Step 7: Create `src/content/room-views/highlights.ts`**

```ts
import { formatPeriod } from "@/lib/format";
import { HIGHLIGHT_STAT_COUNT, highlightRoom } from "@/experience/floors/lobby/stations";
import { highlightEntries, highlightProjects } from "../highlights";
import { getProfile, getRoof, getStats, getTimeline } from "../load";
import { coverImage } from "../media";
import type { Locale, TimelineEntry } from "../schema";
import { podLiveLink } from "../selectors";
import { contactItems, cvItems } from "./roof";
import { chain, fill, messages, roomId, single } from "./shared";
import type { RoomCard, RoomView } from "./types";

/**
 * L1 Highlights Hall: the four stations behind the certification wall. About me (name, headline,
 * the first stats, the one-line intro), the landing's three featured projects, every employment and
 * freelance role newest first, and contact with the CV. Cards ride to their room (`HighlightsBody`).
 */
export function buildHighlightsViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const profile = getProfile();
  const roof = getRoof();
  const { employment, freelance } = highlightEntries(getTimeline());
  const role =
    (group: string) =>
    (e: TimelineEntry): RoomCard => ({
      room: roomId("L2", e.slug),
      title: e.role[locale],
      subtitle: e.org,
      meta: formatPeriod(e.start, e.end, locale),
      group,
      type: e.type,
    });
  return chain([
    single({
      id: highlightRoom("about"),
      kind: "highlights",
      title: profile.name,
      subtitle: profile.headline[locale],
      meta: [`${profile.currentRole.title[locale]} · ${profile.currentRole.org}`, profile.location[locale]],
      accent: "green",
      metrics: getStats()
        .slice(0, HIGHLIGHT_STAT_COUNT)
        .map((s) => ({ value: s.value, label: s.label[locale] })),
      sections: [{ body: profile.subheadline[locale] }],
      link: { room: roomId("L1", "profile"), label: m.hall.fullProfile },
      page: "/#intro",
    }),
    single({
      id: highlightRoom("projects"),
      kind: "highlights",
      title: m.hall.projects,
      subtitle: m.hall.projectsSub,
      accent: "violet",
      cards: highlightProjects().map((pod) => ({
        room: roomId("L3", pod.slug),
        title: pod.title[locale],
        subtitle: pod.tagline[locale],
        meta: m.common.wing[pod.wing],
        image: coverImage(pod.assets, locale),
        live: podLiveLink(pod)?.href,
      })),
      page: "/labs",
    }),
    single({
      id: highlightRoom("experience"),
      kind: "highlights",
      title: m.hall.experience,
      subtitle: fill(m.hall.counts, { employment: String(employment.length), freelance: String(freelance.length) }),
      accent: "amber",
      cards: [...employment.map(role(m.common.type.job)), ...freelance.map(role(m.common.type.freelance))],
      page: "/journey",
    }),
    single({
      id: highlightRoom("contact"),
      kind: "highlights",
      title: m.hall.contact,
      subtitle: roof.availability[locale],
      meta: [profile.location[locale], profile.timezone],
      accent: "blue",
      sections: [
        { title: m.drawer.rooms.channels, items: contactItems(locale) },
        { title: m.drawer.rooms.downloads, items: cvItems(locale) },
      ],
      page: "/contact",
    }),
  ]);
}
```

In `src/content/room-views/index.ts` add `import { buildHighlightsViews } from "./highlights";` and insert `...buildHighlightsViews(locale),` right after `...buildLobbyViews(locale),`.

- [ ] **Step 8: Give the landing's closing section the contact anchor**

In `src/app/[locale]/page.tsx`, replace

```tsx
      <section aria-labelledby="closing-title" className="pv-wrap pv-sec">
```

with

```tsx
      <section id="contact" aria-labelledby="closing-title" className="pv-wrap pv-sec">
```

- [ ] **Step 9: Name the new structural rooms for point-and-go**

`StructuralRoom` grew, so R4-I's `InteractLabels.rooms` (a `Record<StructuralRoom, string>`) needs the four names. In `src/experience/Experience.tsx`, inside the `interact: { ... rooms: { ... } }` labels object, after the last existing entry add:

```ts
          highlightsAbout: t("rooms.highlightsAbout"),
          highlightsProjects: t("rooms.highlightsProjects"),
          highlightsExperience: t("rooms.highlightsExperience"),
          highlightsContact: t("rooms.highlightsContact"),
```

Run: `bun run typecheck`
Expected: no errors (a missing key fails here).

- [ ] **Step 10: Run the tests**

Run: `bunx vitest run tests/unit/room-views.test.ts tests/unit/missions-rooms.test.ts tests/unit/search.test.ts tests/unit/ui-copy.test.ts tests/unit/interact-registry.test.ts tests/content/safety.test.ts tests/content/fonts.test.ts`
Expected: PASS (the catalog test "has a view for every room" now covers the four stations).

- [ ] **Step 11: Commit**

```bash
rtk git add src/experience/missions/rooms.ts src/content/room-views messages/en.json messages/id.json "src/app/[locale]/page.tsx" src/experience/Experience.tsx tests/unit/room-views.test.ts tests/unit/missions-rooms.test.ts
rtk git commit -m "feat(highlights): catalog rooms, drawer content and landing anchors"
```

---

### Task 6: The Highlights drawer body

**Files:**
- Create: `src/hud/drawer/blocks.tsx`
- Modify: `src/hud/drawer/RoomDrawer.tsx` (import the blocks, re-export `MetricTiles` and `Sections`)
- Modify: `src/hud/drawer/RoofBody.tsx` (export `ContactBody`, `CvBody`)
- Create: `src/hud/drawer/HighlightsBody.tsx`
- Modify: `src/hud/drawer/bodies.tsx`
- Modify: `src/hud/drawer/ascii.ts` (README view lists cards)
- Test: `tests/hud/HighlightsRooms.test.tsx`, `tests/unit/ascii.test.ts`

**Interfaces:**
- Consumes: `RoomView.cards` and `RoomCard` (Task 5, including `live`); `goToRoom(room)` (`missions/bridge.ts`); `TypeIcon`, `CAREER_TONE`; `LiveSiteLink({ href, label, srHint, className?, testId? })` (R4-J, `@/components/LiveSiteLink`); messages `hall.openProject`, `hall.openRole`, `common.visitLive`, `common.external`.
- Produces: `MetricTiles`, `Sections`, `Chips` exported from `src/hud/drawer/blocks.tsx`; `HighlightsBody` registered for kind `highlights`; cards render as `button[data-testid="highlight-card"][data-room]`.

- [ ] **Step 1: Write the failing tests**

`tests/hud/HighlightsRooms.test.tsx`:

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import type { Locale, RoomId } from "@/content/schema";
import { highlightEntries } from "@/content/highlights";
import { getContact, getPods, getStats, getTimeline } from "@/content/load";
import { pickFeaturedPods } from "@/content/pageview";
import { buildRoomViews } from "@/content/room-views";
import type { RoomView } from "@/content/room-views/types";
import { podLiveLink } from "@/content/selectors";
import { RoomDrawer } from "@/hud/drawer/RoomDrawer";

const goTo = vi.hoisted(() => vi.fn());
vi.mock("@/experience/missions/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/experience/missions/bridge")>()),
  goToRoom: goTo,
}));
// next-intl's Link needs the Next router; a locale-prefixing anchor is enough here.
vi.mock("@/i18n/navigation", async () => {
  const { useLocale } = await import("next-intl");
  return {
    Link: ({ href, ...rest }: { href: string } & Record<string, unknown>) => {
      const locale = useLocale();
      return <a href={`/${locale}${href}`} {...rest} />;
    },
  };
});

afterEach(() => {
  cleanup();
  goTo.mockReset();
});

function open(room: RoomId, locale: Locale = "en", edit: (view: RoomView) => RoomView = (v) => v) {
  const view = edit(buildRoomViews(locale)[room]);
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : id}>
      <RoomDrawer
        view={view}
        locale={locale}
        layout="side"
        tab="overview"
        readme={false}
        onTab={vi.fn()}
        onToggleReadme={vi.fn()}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
        onHologram={vi.fn()}
        onLink={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
  return screen.getByRole("dialog", { name: view.title });
}

describe("Highlights Hall rooms in the drawer", () => {
  it("about: four big numbers, the one-line intro and the full profile link", () => {
    const drawer = open("L1:highlights-about");
    expect(within(drawer).getAllByTestId("metric")).toHaveLength(4);
    expect(drawer).toHaveTextContent(getStats()[0].value);
    expect(within(drawer).getByRole("button", { name: en.hall.fullProfile })).toBeInTheDocument();
  });

  it("projects: the landing's three projects with screenshots; a card rides to its pod", async () => {
    const drawer = open("L1:highlights-projects");
    const featured = pickFeaturedPods(getPods());
    const cards = within(drawer).getAllByTestId("highlight-card");
    expect(cards.map((c) => c.getAttribute("data-room"))).toEqual(featured.map((p) => `L3:${p.slug}`));
    for (const card of cards) expect(card.querySelector("img")).toHaveAttribute("loading", "lazy");
    await userEvent.click(cards[0]);
    expect(goTo).toHaveBeenCalledWith(`L3:${featured[0].slug}`);
  });

  it("experience: Employment and Freelance groups (the career type labels), newest first; a card rides to its career room", async () => {
    const drawer = open("L1:highlights-experience");
    const { employment, freelance } = highlightEntries(getTimeline());
    expect(within(drawer).getByRole("heading", { name: en.common.type.job })).toBeInTheDocument();
    expect(within(drawer).getByRole("heading", { name: en.common.type.freelance })).toBeInTheDocument();
    expect(within(drawer).queryByRole("heading", { name: /full-time/i })).toBeNull();
    const cards = within(drawer).getAllByTestId("highlight-card");
    expect(cards).toHaveLength(employment.length + freelance.length);
    await userEvent.click(cards[0]);
    expect(goTo).toHaveBeenCalledWith(`L2:${employment[0].slug}`);
  });

  it("projects: Visit live site (new tab) under exactly the cards with a live link", () => {
    const featured = pickFeaturedPods(getPods());
    const real = open("L1:highlights-projects");
    expect(within(real).queryAllByTestId("highlight-live")).toHaveLength(featured.filter((p) => podLiveLink(p)).length);
    cleanup();
    const drawer = open("L1:highlights-projects", "en", (view) => ({
      ...view,
      cards: view.cards!.map((card, i) => ({ ...card, live: i === 0 ? "https://mii-microsoft.azurewebsites.net" : undefined })),
    }));
    const links = within(drawer).getAllByTestId("highlight-live");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(new RegExp(en.common.visitLive));
    expect(links[0]).toHaveAttribute("href", "https://mii-microsoft.azurewebsites.net");
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("contact: email with copy, the channels and the CV viewer", () => {
    const drawer = open("L1:highlights-contact");
    expect(drawer).toHaveTextContent(getContact().email);
    expect(within(drawer).getByTestId("copy-email")).toBeInTheDocument();
    expect(within(drawer).getByTestId("cv-view")).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: /LinkedIn/ })).toHaveAttribute("target", "_blank");
  });

  it("speaks Indonesian", () => {
    const drawer = open("L1:highlights-experience", "id");
    expect(within(drawer).getByRole("heading", { name: id.common.type.job })).toBeInTheDocument();
    expect(drawer).toHaveTextContent(id.hall.openRole);
  });
});
```

Append to `tests/unit/ascii.test.ts`, inside `describe("renderReadme", ...)` (the file already imports `renderReadme`):

```ts
  it("lists the Highlights Hall cards in the README view", () => {
    const view = buildRoomViews("en")["L1:highlights-experience"];
    const text = renderReadme(view, { overview: "Overview", architecture: "Architecture", results: "Results", stack: "Stack", links: "Links" });
    expect(text).toContain(`### ${en.common.type.job}`);
    expect(text).toContain(view.cards![0].title);
  });
```

and add at the top of the file:

```ts
import { buildRoomViews } from "@/content/room-views";
import en from "../../messages/en.json";
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/hud/HighlightsRooms.test.tsx tests/unit/ascii.test.ts`
Expected: FAIL (no `highlight-card` elements; the README misses the cards).

- [ ] **Step 3: Move the shared blocks out of `RoomDrawer.tsx`**

Create `src/hud/drawer/blocks.tsx` with the four components moved verbatim from `RoomDrawer.tsx` (`MetricTiles` with its JSDoc, `ItemLink`, `Sections`, `Chips`), now exported:

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { RoomLinkItem, RoomMetric, RoomSection } from "@/content/room-views/types";
import { Link } from "@/i18n/navigation";

/**
 * Result cards. `fluid` sizes the grid by its container (the drawer body), not the viewport: two
 * columns once the body is wide enough, and an odd last card spans the row.
 */
export function MetricTiles({ metrics, single = false, fluid = false }: { metrics: RoomMetric[]; single?: boolean; fluid?: boolean }) {
  const columns = single ? "" : fluid ? "@[22rem]:grid-cols-2 @[22rem]:[&>li:last-child:nth-child(odd)]:col-span-2" : "min-[420px]:grid-cols-2";
  return (
    <ul className={`grid gap-2 ${columns}`}>
      {metrics.map((m, i) => (
        <li key={i} className="flex flex-col gap-1 rounded-xl border border-glass-border bg-white/[0.03] p-3" data-testid="metric">
          <p className="text-[28px] leading-8 font-extrabold tracking-tight text-ink">{m.value}</p>
          <p className="text-sm leading-5 text-ink">{m.label}</p>
          {m.context && <p className="text-[13px] leading-5 text-ink-2">{m.context}</p>}
        </li>
      ))}
    </ul>
  );
}

function ItemLink({ item }: { item: RoomLinkItem }) {
  const t = useTranslations("common");
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
        {item.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.logo} alt="" width={16} height={16} className="size-4 shrink-0 object-contain" />
        )}
        {item.title}
      </span>
      {item.meta && <span className="block text-[13px] leading-5 text-ink-2">{item.meta}</span>}
    </>
  );
  if (!item.href) return <div className="py-1.5">{body}</div>;
  if (item.href.startsWith("/") && !item.external)
    return (
      <Link href={item.href} className="block min-h-11 rounded-md px-2 py-1.5 transition hover:bg-white/5">
        {body}
      </Link>
    );
  return (
    <a
      href={item.href}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noopener noreferrer" : undefined}
      className="block min-h-11 rounded-md px-2 py-1.5 transition hover:bg-white/5"
    >
      {body}
      {item.external && <span className="sr-only"> ({t("external")})</span>}
    </a>
  );
}

export function Sections({ sections }: { sections: RoomSection[] }) {
  return (
    <>
      {sections.map((section, i) => (
        <section key={i} className="space-y-2">
          {section.title && <h3 className="label text-ink-2">{section.title}</h3>}
          {section.body && <p className="text-[15px] leading-6 text-ink-2">{section.body}</p>}
          {section.bullets && (
            <ul className="space-y-2">
              {section.bullets.map((b, j) => (
                <li key={j} className="flex gap-2 text-[15px] leading-6 text-ink-2">
                  <span aria-hidden="true" className="label pt-1.5 text-cyan">
                    {String(j + 1).padStart(2, "0")}
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {section.items && (
            <ul className="-mx-2">
              {section.items.map((item, j) => (
                <li key={j}>
                  <ItemLink item={item} />
                </li>
              ))}
            </ul>
          )}
          {section.chips && <Chips items={section.chips} logos={section.chipLogos} />}
        </section>
      ))}
    </>
  );
}

export function Chips({ items, logos }: { items: string[]; logos?: (string | null | undefined)[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <li key={`${item}-${i}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-glass-border px-2.5 text-[13px] text-ink-2">
          {logos?.[i] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logos[i]} alt="" width={16} height={16} className="size-4" />
          )}
          {item}
        </li>
      ))}
    </ul>
  );
}
```

In `src/hud/drawer/RoomDrawer.tsx`: delete the `MetricTiles` (with its JSDoc), `ItemLink`, `Sections` and `Chips` functions; replace the types import

```ts
import type { RoomArchitecture, RoomLinkItem, RoomMetric, RoomSection, RoomView } from "@/content/room-views/types";
```

with

```ts
import type { RoomArchitecture, RoomView } from "@/content/room-views/types";
```

and below `import { ROOM_BODIES } from "./bodies";` add:

```ts
import { Chips, MetricTiles, Sections } from "./blocks";

// HologramOverlay and older callers import the blocks from here.
export { MetricTiles, Sections };
```

Keep `Link` imported in `RoomDrawer.tsx` (the overflow menu and footer still use it). Run `bun run lint` after the move: an unused import means a block was not moved completely.

- [ ] **Step 4: Export the roof bodies**

In `src/hud/drawer/RoofBody.tsx`, change `function ContactBody(` to `export function ContactBody(` and `function CvBody(` to `export function CvBody(`.

- [ ] **Step 5: Create `src/hud/drawer/HighlightsBody.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { RoomCard } from "@/content/room-views/types";
import { TypeIcon } from "@/components/TypeIcon";
import { CAREER_TONE } from "@/experience/fx/holoIcons";
import { goToRoom } from "@/experience/missions/bridge";
import type { RoomBodyProps } from "./bodies";
import { LiveSiteLink } from "@/components/LiveSiteLink";
import { MetricTiles, Sections } from "./blocks";
import { ContactBody, CvBody } from "./RoofBody";

/** One card: the cover or type icon, title, subtitle and period; the whole card rides to its room. */
function CardButton({ card, action }: { card: RoomCard; action: string }) {
  return (
    <button
      type="button"
      onClick={() => goToRoom(card.room)}
      className="glass glass-solid flex min-h-11 w-full items-stretch gap-3 overflow-hidden p-2 text-left transition hover:border-cyan/60"
      data-testid="highlight-card"
      data-room={card.room}
    >
      {card.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image.thumb}
          width={card.image.width}
          height={card.image.height}
          alt=""
          loading="lazy"
          decoding="async"
          className="aspect-[16/10] w-28 shrink-0 rounded-md bg-surface object-cover"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {card.type && <TypeIcon type={card.type} size={16} color={CAREER_TONE[card.type]} className="shrink-0" />}
          {card.title}
        </span>
        {card.subtitle && <span className="text-[13px] leading-5 text-ink-2">{card.subtitle}</span>}
        {card.meta && <span className="label text-ink-3">{card.meta}</span>}
        <span className="label pt-1 text-cyan">{action}</span>
      </span>
    </button>
  );
}

/** Cards in their groups, in order (experience: Employment, then Freelance). */
function CardList({ cards }: { cards: RoomCard[] }) {
  const t = useTranslations("hall");
  const tc = useTranslations("common");
  const groups: { label?: string; cards: RoomCard[] }[] = [];
  for (const card of cards) {
    const last = groups.at(-1);
    if (last && last.label === card.group) last.cards.push(card);
    else groups.push({ label: card.group, cards: [card] });
  }
  return (
    <div className="space-y-5">
      {groups.map((group, i) => (
        <section key={group.label ?? i} className="space-y-2">
          {group.label && <h3 className="label text-ink-2">{group.label}</h3>}
          <ul className="space-y-2">
            {group.cards.map((card) => (
              <li key={card.room}>
                <CardButton card={card} action={card.room.startsWith("L3:") ? t("openProject") : t("openRole")} />
                {/* A link cannot sit inside the card button: the live site (R4-J) gets its own row under it. */}
                {card.live && <LiveSiteLink href={card.live} label={tc("visitLive")} srHint={tc("external")} className="mt-1 inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-cyan" testId="highlight-live" />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Highlights Hall stations (kind "highlights"): cards for projects and roles, contact plus the CV for
 * the contact station, and the big numbers plus the intro for About me.
 */
export function HighlightsBody({ view }: RoomBodyProps) {
  if (view.cards?.length) return <CardList cards={view.cards} />;
  if (view.id === "L1:highlights-contact")
    return (
      <div className="space-y-6">
        <ContactBody view={{ ...view, sections: view.sections.slice(0, 1) }} />
        <CvBody view={{ ...view, sections: view.sections.slice(1) }} />
      </div>
    );
  return (
    <div className="space-y-5">
      {view.metrics.length > 0 && <MetricTiles metrics={view.metrics} fluid />}
      <Sections sections={view.sections} />
    </div>
  );
}
```

In `src/hud/drawer/bodies.tsx`, add `import { HighlightsBody } from "./HighlightsBody";` and the entry `highlights: HighlightsBody,` to `ROOM_BODIES`.

- [ ] **Step 6: List cards in the README view**

In `src/hud/drawer/ascii.ts`, in `renderReadme`, directly after the `if (view.sections.length > 0) { ... }` block, add:

```ts
  if (view.cards?.length) {
    let group: string | undefined;
    out.push("");
    for (const card of view.cards) {
      if (card.group && card.group !== group) {
        group = card.group;
        out.push(`### ${clean(card.group)}`, "");
      }
      out.push(...hanging("- ", [card.title, card.subtitle, card.meta].filter(Boolean).join(" · ")));
    }
  }
```

- [ ] **Step 7: Run the tests**

Run: `bunx vitest run tests/hud/HighlightsRooms.test.tsx tests/hud/RoomDrawer.test.tsx tests/hud/LibraryRoofRooms.test.tsx tests/unit/ascii.test.ts`
Expected: PASS.

Run: `bun run lint && bun run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
rtk git add src/hud/drawer tests/hud/HighlightsRooms.test.tsx tests/unit/ascii.test.ts
rtk git commit -m "feat(highlights): drawer body with cards that ride to their rooms"
```

---

### Task 7: Hall layout, the passage road and the L1 floor wiring

**Files:**
- Create: `src/experience/floors/lobby/hallLayout.ts`
- Modify: `src/experience/types.ts` (`FloorLayout.roadZone`)
- Modify: `src/experience/nav/road.ts` (`routeUsesRoad`)
- Modify: `src/experience/scene/Director.tsx` (`autopilotPath`)
- Modify: `src/experience/config.ts` (`LOBBY.bounds`, L1 layout)
- Modify: `e2e/experience.spec.ts` (new slab bound)
- Test: `tests/unit/highlights-layout.test.ts`, `tests/unit/road.test.ts`

**Interfaces:**
- Consumes: `HIGHLIGHT_STATIONS`, `highlightRoom` (Task 4); `ROAD`, `RoadNetwork`, `Road`, `Plaza`, `Spur` (`nav/road.ts`); `ViewZone` (type, `camera/orbit.ts`).
- Produces:
  - `HALL` constants: `maxX: 64`, `zone`, `lead`, `plaza`, `stations`, `facing`, `tone`, `padInset: 1.1`, `spurWidth: 4`, `panel: { h: 6, plinth: 0.35, depth: 0.3 }`, `entry`, `sign`, `lazyX: 18`.
  - `interface HallStation { station; room; rect; facing; front; pad; width; yaw; right }`
  - `interface HighlightsHallLayout { stations: HallStation[]; network: RoadNetwork; doors: DoorTrigger[]; obstacles: Rect[]; viewZones: ViewZone[]; zone: Rect }`
  - `buildHighlightsHall(): HighlightsHallLayout`, `HALL_LAYOUT`, `stationOf(name): HallStation`, `shouldLoadShots(floor: FloorId, x: number): boolean`
  - `FloorLayout.roadZone?: Rect`; `routeUsesRoad(layout: { road?: RoadNetwork; roadZone?: Rect }, from: Vec2, to: Vec2): boolean`
  - L1 layout: `bounds` x -24 to 64, `doors` (4 stations), `road`, `roadZone`, `viewZones`, obstacles extended by the 4 station rects.

- [ ] **Step 1: Write the failing tests**

`tests/unit/highlights-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { zoneAt } from "@/experience/camera/orbit";
import { followPose } from "@/experience/camera/rigs";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import { HALL, HALL_LAYOUT, shouldLoadShots, stationOf } from "@/experience/floors/lobby/hallLayout";
import { HIGHLIGHT_STATIONS, highlightRoom } from "@/experience/floors/lobby/stations";
import { roomTarget } from "@/experience/missions/host3d";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { buildRoadGraph, roadRoute, routeUsesRoad } from "@/experience/nav/road";
import { spaceViolations } from "@/experience/nav/space";
import type { Rect } from "@/experience/types";

const layouts = buildFloorLayouts(8);
const l1 = layouts.L1;
const label = (r: Rect) => `[${r.minX.toFixed(2)}..${r.maxX.toFixed(2)} x ${r.minZ.toFixed(2)}..${r.maxZ.toFixed(2)}]`;

describe("Highlights Hall layout", () => {
  it("extends the Lobby slab east and keeps the plaza, the spawn and the elevator where they were", () => {
    expect(LOBBY.bounds).toEqual({ minX: -24, maxX: 64, minZ: -21, maxZ: 21 });
    expect(l1.bounds).toEqual(LOBBY.bounds);
    expect(l1.spawn).toEqual(LOBBY.spawn);
    expect(l1.approach).toEqual({ x: -21, z: 0 });
  });

  it("passes the space rules with the real Lobby; only the skills wall, which predates them, sits near the slab edge", () => {
    const [, skills, , kiosk] = l1.obstacles;
    // Task 3 moved the kiosk to touch the south edge, clear of the passage road.
    expect(kiosk.maxZ).toBe(l1.bounds.maxZ);
    const violations = spaceViolations({ bounds: l1.bounds, obstacles: l1.obstacles, doors: l1.doors!, network: l1.road!, start: l1.approach, pads: l1.pads });
    expect(violations.map((v) => `${v.rule}: ${v.detail}`)).toEqual([
      `bounds-gap: 2.00 u between ${label(skills)} and the slab edge`,
    ]);
  });

  it("keeps the certification wall readable from the plaza: the passage runs south of it, the hall stands behind it", () => {
    const cert = l1.obstacles[2];
    for (const p of HALL.lead) expect(p.z - cert.maxZ).toBeGreaterThanOrEqual(ROVER.radius + 5);
    for (const s of HALL_LAYOUT.stations) expect(s.rect.minX).toBeGreaterThan(cert.maxX + 5);
  });

  it("gives every station one door that faces into it, with its pad on open floor 1.1 u in front", () => {
    expect(l1.doors!.map((d) => d.room)).toEqual(HIGHLIGHT_STATIONS.map(highlightRoom));
    const grid = buildNavGrid(l1, ROVER.radius);
    for (const s of HALL_LAYOUT.stations) {
      const door = l1.doors!.find((d) => d.room === s.room)!;
      expect(door.at).toEqual(s.pad);
      expect(door.facing).toEqual(s.facing);
      expect(isWalkable(grid, s.pad), s.room).toBe(true);
      expect(Math.hypot(s.pad.x - s.front.x, s.pad.z - s.front.z)).toBeCloseTo(HALL.padInset);
    }
    expect(stationOf("experience").pad.x).toBeCloseTo(59.9);
    expect(stationOf("experience").pad.z).toBe(1);
  });

  it("follows the hall road only for drives into or out of the hall", () => {
    const about = stationOf("about").pad;
    expect(routeUsesRoad(l1, l1.spawn, about)).toBe(true);
    expect(routeUsesRoad(l1, about, l1.approach)).toBe(true);
    expect(routeUsesRoad(l1, l1.spawn, { x: 6, z: -15 })).toBe(false);
    const route = roadRoute(l1.road!, buildNavGrid(l1, ROVER.radius), l1.spawn, about, buildRoadGraph(l1.road!))!;
    expect(route.at(-1)).toEqual(about);
    expect(route.some((p) => p.z >= 14 && p.x > LOBBY.certWall.x)).toBe(true);
  });

  it("drives missions to the station doors", () => {
    for (const s of HALL_LAYOUT.stations) expect(roomTarget(undefined, s.room, layouts, [])).toEqual(s.pad);
  });

  it("turns the camera to face each station from the plaza and looks into the hall from the passage", () => {
    for (const s of HALL_LAYOUT.stations) {
      const zone = zoneAt("L1", s.pad, l1.viewZones)!;
      expect(zone.id).toBe(s.room);
      const [cx, , cz] = followPose("desktop", [s.pad.x, 0, s.pad.z], zone.yaw).position;
      // The camera sits on the plaza side, so the station is straight ahead of the rover.
      expect((s.pad.x - cx) * s.facing.x + (s.pad.z - cz) * s.facing.z).toBeGreaterThan(10);
    }
    expect(zoneAt("L1", { x: 32, z: 15 }, l1.viewZones)?.id).toBe("L1:highlights-entry");
    expect(zoneAt("L1", LOBBY.spawn, l1.viewZones)).toBeNull();
  });

  it("loads the screenshots only once the rover heads for the hall", () => {
    expect(shouldLoadShots("L1", LOBBY.spawn.x)).toBe(false);
    expect(shouldLoadShots("L1", HALL.lazyX + 1)).toBe(true);
    expect(shouldLoadShots("L3", 40)).toBe(false);
  });
});
```

Append to `tests/unit/road.test.ts`, inside `describe("roadRoute", ...)`, and add `routeUsesRoad` to the file's existing multi-line import from `@/experience/nav/road`:

```ts
  it("limits a road to its zone when the floor sets one", () => {
    const road = { roads: [], plazas: [], spurs: [] };
    const zone = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    expect(routeUsesRoad({}, { x: 1, z: 1 }, { x: 2, z: 2 })).toBe(false);
    expect(routeUsesRoad({ road }, { x: -5, z: -5 }, { x: -6, z: -6 })).toBe(true);
    expect(routeUsesRoad({ road, roadZone: zone }, { x: -5, z: -5 }, { x: -6, z: -6 })).toBe(false);
    expect(routeUsesRoad({ road, roadZone: zone }, { x: -5, z: -5 }, { x: 5, z: 5 })).toBe(true);
    expect(routeUsesRoad({ road, roadZone: zone }, { x: 5, z: 5 }, { x: -6, z: -6 })).toBe(true);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/highlights-layout.test.ts tests/unit/road.test.ts`
Expected: FAIL with "Failed to resolve import "@/experience/floors/lobby/hallLayout"" and "routeUsesRoad is not a function".

- [ ] **Step 3: Add `routeUsesRoad` and `FloorLayout.roadZone`**

In `src/experience/types.ts`, in `interface FloorLayout`, after the `road?: RoadNetwork;` field add:

```ts
  /**
   * Limits `road` to drives that start or end inside this rect (L1: the Highlights Hall east of the
   * certification wall); other drives on the floor use the navgrid. Unset: every drive follows the road.
   */
  roadZone?: Rect;
```

In `src/experience/nav/road.ts`, directly above `export function roadRoute(` add:

```ts
/** Whether an autopilot drive follows the floor's road: always when it has one, unless `roadZone` limits it to drives into or out of that zone. */
export function routeUsesRoad(layout: { road?: RoadNetwork; roadZone?: Rect }, from: Vec2, to: Vec2): boolean {
  if (!layout.road) return false;
  const z = layout.roadZone;
  if (!z) return true;
  const inside = (p: Vec2) => p.x >= z.minX && p.x <= z.maxX && p.z >= z.minZ && p.z <= z.maxZ;
  return inside(from) || inside(to);
}
```

In `src/experience/scene/Director.tsx`, add `routeUsesRoad` to the import from `../nav/road` and replace

```ts
  /** Autopilot route: along the floor's road when it has one (walkable floors), else the navgrid. */
  const autopilotPath = useCallback(
    (floor: FloorId, from: Vec2, to: Vec2) => {
      const road = layouts[floor].road;
      return road ? roadRoute(road, grids[floor], from, to, roads[floor]) : findPath(grids[floor], from, to);
    },
    [layouts, grids, roads],
  );
```

with

```ts
  /** Autopilot route: along the floor's road when it has one (walkable floors; on L1 only into or out of the hall), else the navgrid. */
  const autopilotPath = useCallback(
    (floor: FloorId, from: Vec2, to: Vec2) => {
      const layout = layouts[floor];
      return routeUsesRoad(layout, from, to) ? roadRoute(layout.road!, grids[floor], from, to, roads[floor]) : findPath(grids[floor], from, to);
    },
    [layouts, grids, roads],
  );
```

- [ ] **Step 4: Create `src/experience/floors/lobby/hallLayout.ts`**

```ts
import type { FloorId, RoomId } from "@/content/schema";
import type { ViewZone } from "../../camera/orbit";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { DoorTrigger, Rect, Vec2 } from "../../types";
import { HIGHLIGHT_STATIONS, highlightRoom, type HighlightStation } from "./stations";

/**
 * L1 Highlights Hall (owner request, October 2026): the Lobby slab grows east from x = 28 to 64. A
 * lead road leaves the plaza south of the certification wall (which stays untouched and readable from
 * the plaza) into a 24 x 26 u hall plaza. Four stations stand flush with the slab edges, facing the
 * plaza, in walk order: about me (north-west), top projects (north-east), work experience (east),
 * contact (south). Pure: the floor layout, the scenery, the Quick tour and the e2e tests read it.
 * Checked by tests/unit/highlights-layout.test.ts (space rules with the real Lobby).
 */
export const HALL = {
  maxX: 64,
  /** Drives that start or end in here follow the hall road (`FloorLayout.roadZone`); east of the cert wall. */
  zone: { minX: 27, maxX: 64, minZ: -21, maxZ: 21 },
  lead: [
    { x: 14, z: 15 },
    { x: 36, z: 15 },
  ],
  plaza: { x: 46, z: 3, w: 24, d: 26 },
  stations: {
    about: { minX: 32, maxX: 42, minZ: -21, maxZ: -18 },
    projects: { minX: 48, maxX: 64, minZ: -21, maxZ: -18 },
    experience: { minX: 61, maxX: 64, minZ: -8, maxZ: 10 },
    contact: { minX: 40, maxX: 54, minZ: 18, maxZ: 21 },
  },
  /** Unit direction from each door pad into its station. */
  facing: {
    about: { x: 0, z: -1 },
    projects: { x: 0, z: -1 },
    experience: { x: 1, z: 0 },
    contact: { x: 0, z: 1 },
  },
  /** Station hues, matching the drawer accents (green, violet, amber, blue). */
  tone: { about: "#34d399", projects: "#a78bfa", experience: "#fbbf24", contact: "#60a5fa" },
  padInset: 1.1,
  spurWidth: 4,
  panel: { h: 6, plinth: 0.35, depth: 0.3 },
  /** The passage behind the cert wall: the camera turns to look into the hall. */
  entry: { minX: 28, maxX: 36, minZ: 11, maxZ: 19 },
  /** Floor sign on the lead road. */
  sign: { x: 22, z: 15 },
  /** Screenshots load once the rover is east of here on L1. */
  lazyX: 18,
} as const;

export interface HallStation {
  station: HighlightStation;
  room: RoomId;
  rect: Rect;
  /** Unit direction from the pad into the station (`DoorTrigger.facing`). */
  facing: Vec2;
  /** Middle of the station's front edge (the panel face). */
  front: Vec2;
  /** Door pad center, `HALL.padInset` in front of the station. */
  pad: Vec2;
  /** Panel width along its face. */
  width: number;
  /** Yaw that turns a label's +z toward the plaza (`BatchedLabel.yaw`). */
  yaw: number;
  /** The reader's right along the face (left to right as read). */
  right: Vec2;
}

export interface HighlightsHallLayout {
  stations: HallStation[];
  network: RoadNetwork;
  doors: DoorTrigger[];
  obstacles: Rect[];
  viewZones: ViewZone[];
  zone: Rect;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function buildStation(name: HighlightStation): HallStation {
  const r = HALL.stations[name];
  const f = HALL.facing[name];
  const center = { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
  const halfAlong = (Math.abs(f.x) * (r.maxX - r.minX) + Math.abs(f.z) * (r.maxZ - r.minZ)) / 2;
  const front = { x: center.x - f.x * halfAlong, z: center.z - f.z * halfAlong };
  return {
    station: name,
    room: highlightRoom(name),
    rect: { minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ },
    facing: { x: f.x, z: f.z },
    front,
    pad: { x: front.x - f.x * HALL.padInset, z: front.z - f.z * HALL.padInset },
    width: Math.abs(f.z) * (r.maxX - r.minX) + Math.abs(f.x) * (r.maxZ - r.minZ),
    // `0 - v` keeps +0 where v is 0 (no -0 in yaws and vectors).
    yaw: Math.atan2(0 - f.x, 0 - f.z),
    right: { x: 0 - f.z, z: f.x },
  };
}

/** Camera zone in front of a station: from its face 3 u back past the pad, across its width; the follow camera turns to face it head on. */
function stationZone(s: HallStation): ViewZone {
  const back = { x: s.pad.x - s.facing.x * 3, z: s.pad.z - s.facing.z * 3 };
  const across = { x: Math.abs(s.right.x) * (s.width / 2), z: Math.abs(s.right.z) * (s.width / 2) };
  return {
    id: s.room,
    area: {
      minX: Math.min(s.front.x, back.x) - across.x,
      maxX: Math.max(s.front.x, back.x) + across.x,
      minZ: Math.min(s.front.z, back.z) - across.z,
      maxZ: Math.max(s.front.z, back.z) + across.z,
    },
    // The default camera looks along (-1, -1): turning by (face yaw - PI/4) puts it on the plaza side.
    yaw: s.yaw - Math.PI / 4,
    zoom: clamp(s.width / 11, 1, 1.5),
  };
}

export function buildHighlightsHall(): HighlightsHallLayout {
  const stations = HIGHLIGHT_STATIONS.map(buildStation);
  const P = HALL.plaza;
  const plaza: Plaza = { id: "hall", center: { x: P.x, z: P.z }, w: P.w, d: P.d };
  const lead: Road = { id: "hall-lead", points: HALL.lead.map((p) => ({ x: p.x, z: p.z })), width: ROAD.minWidth };
  // Each spur starts 1 u inside the plaza, on the pad's line.
  const inside = (p: Vec2): Vec2 => ({ x: clamp(p.x, P.x - P.w / 2 + 1, P.x + P.w / 2 - 1), z: clamp(p.z, P.z - P.d / 2 + 1, P.z + P.d / 2 - 1) });
  const spurs: Spur[] = stations.map((s) => ({ room: s.room, from: inside(s.pad), to: s.pad, width: HALL.spurWidth, color: HALL.tone[s.station] }));
  return {
    stations,
    network: { roads: [lead], plazas: [plaza], spurs },
    doors: stations.map((s) => ({ room: s.room, at: s.pad, facing: s.facing })),
    obstacles: stations.map((s) => s.rect),
    viewZones: [{ id: "L1:highlights-entry", area: { ...HALL.entry }, yaw: -Math.PI / 2, zoom: 1.3 }, ...stations.map(stationZone)],
    zone: { ...HALL.zone },
  };
}

export const HALL_LAYOUT = buildHighlightsHall();

export function stationOf(name: HighlightStation): HallStation {
  return HALL_LAYOUT.stations.find((s) => s.station === name)!;
}

/** The screenshot atlas loads once the rover is on L1 and east of `HALL.lazyX` (heading for the hall). */
export function shouldLoadShots(floor: FloorId, x: number): boolean {
  return floor === "L1" && x > HALL.lazyX;
}
```

- [ ] **Step 5: Wire L1 in `src/experience/config.ts`**

Add the import below the other floor imports:

```ts
import { HALL, HALL_LAYOUT } from "./floors/lobby/hallLayout";
```

In `LOBBY`, replace the doc comment and `bounds` line

```ts
export const LOBBY = {
  bounds: { minX: -24, maxX: 28, minZ: -21, maxZ: 21 },
```

with

```ts
export const LOBBY = {
  /** The plaza ends at x = 28; the Highlights Hall (floors/lobby/hallLayout.ts) extends the slab east to `HALL.maxX`. */
  bounds: { minX: -24, maxX: HALL.maxX, minZ: -21, maxZ: 21 },
```

In `buildFloorLayouts`, replace the `L1: standard(...)` entry with:

```ts
    L1: {
      ...standard(
        "L1",
        LOBBY.bounds,
        [
          rect(hologram.x, hologram.z, hologram.radius * 2, hologram.radius * 2),
          rect(skillsWall.x, skillsWall.z, skillsWall.w, skillsWall.d),
          rect(certWall.x, certWall.z, certWall.w, certWall.d),
          rect(kiosk.x, kiosk.z, kiosk.w, kiosk.d),
          ...HALL_LAYOUT.obstacles,
        ],
        LOBBY.spawn,
      ),
      // Highlights Hall: station doors, the passage road (used only for drives into or out of the hall) and camera zones.
      doors: HALL_LAYOUT.doors,
      road: HALL_LAYOUT.network,
      roadZone: HALL_LAYOUT.zone,
      viewZones: HALL_LAYOUT.viewZones,
    },
```

- [ ] **Step 6: Follow the new slab in the e2e bound check**

In `e2e/experience.spec.ts`, test "WASD drives the rover and walls keep it inside the Lobby", replace

```ts
    // Lobby slab x -24 to 28, z -21 to 21 (centered on the elevator axis), minus the rover radius.
    expect(rover.x).toBeGreaterThan(-23.01);
    expect(rover.x).toBeLessThan(27.01);
```

with

```ts
    // Lobby slab x -24 to 64 (the Highlights Hall east of x = 28), z -21 to 21, minus the rover radius.
    expect(rover.x).toBeGreaterThan(-23.01);
    expect(rover.x).toBeLessThan(63.01);
```

- [ ] **Step 7: Run the tests**

Run: `bunx vitest run tests/unit/highlights-layout.test.ts tests/unit/road.test.ts tests/unit/lobby-layout.test.ts tests/unit/doors.test.ts tests/unit/floor-pads.test.ts tests/unit/pad-space.test.ts tests/unit/missions-host3d.test.ts tests/unit/navgrid.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add src/experience/floors/lobby/hallLayout.ts src/experience/types.ts src/experience/nav/road.ts src/experience/scene/Director.tsx src/experience/config.ts e2e/experience.spec.ts tests/unit/highlights-layout.test.ts tests/unit/road.test.ts
rtk git commit -m "feat(highlights): hall layout east of the cert wall with a passage road and station doors"
```

---

### Task 8: Hall scenery (one mesh, one edge mesh, one text batch, one lazy screenshot atlas)

**Files:**
- Create: `src/experience/floors/lobby/hallContent.ts`
- Create: `src/experience/floors/lobby/HighlightsHall.tsx`
- Modify: `src/experience/floors/Lobby.tsx` (`LobbyLabels.hall`, mount)
- Modify: `src/experience/Experience.tsx` (hall labels)
- Modify: `messages/en.json`, `messages/id.json` (`hud.pads.floorDesc.L1`)
- Test: `tests/unit/hall-content.test.ts`

**Interfaces:**
- Consumes: `HALL`, `HALL_LAYOUT`, `stationOf`, `HallStation`, `shouldLoadShots` (Task 7); `experienceRows`, `HIGHLIGHT_STAT_COUNT` (Task 4); `ExperienceData.highlights` (Task 4); `Box` (`floors/roof/solids.ts`); `BatchedLabel` (`fx/labelProps.ts`); `CAREER_TONE`; `MergedBoxes`, `MergedEdges` (`floors/roof/kit.tsx`; R4-I removed its `HitBox`, clicks go through the registry); `BatchedLabels`; `RoadMarkings`; `FONTS`; `podLiveLink` (`@/content/selectors`, R4-J) over `LabPod.liveUrl`.
- Produces:
  - `interface HallLabels { about; projects; experience; contact; employment; freelance; more(count): string; cvHint; hall; visitLive; stations: Record<HighlightStation, string> }` (`employment` and `freelance` are `common.type.job` / `common.type.freelance`; `stations` are `hud.rooms.highlights*`, the point-and-go names used in Task 11)
  - `interface HallFonts { sans; sansBold; mono; monoBold }`, `type HallInput = Pick<ExperienceData, "profile" | "stats" | "roof" | "career" | "highlights" | "labs">`
  - `HALL_ROWS = 6`, `SHOT`, `SHOT_CELL`, `onPanel(s, u, y, out?)`, `hallSolids(projectCount): Box[]`, `hallLabels(input, labels, fonts): BatchedLabel[]`, `hallShots(count): ShotQuad[]`, `shotQuadBuffers(quads, count)`, `coverCrop(iw, ih, cw, ch)`
  - `<HighlightsHall data labels tier />`; `LobbyLabels.hall: HallLabels`

- [ ] **Step 1: Write the failing test**

`tests/unit/hall-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { getStats } from "@/content/load";
import {
  coverCrop,
  HALL_ROWS,
  hallLabels,
  hallShots,
  hallSolids,
  onPanel,
  shotQuadBuffers,
  type HallLabels,
} from "@/experience/floors/lobby/hallContent";
import { podLiveLink } from "@/content/selectors";
import { HALL, HALL_LAYOUT, stationOf } from "@/experience/floors/lobby/hallLayout";
import { experienceRows } from "@/experience/floors/lobby/stations";

const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const labels: HallLabels = {
  about: "About me",
  projects: "Top 3 projects",
  experience: "Work experience",
  contact: "Contact",
  employment: "Employment",
  freelance: "Freelance",
  more: (count) => `+${count} more`,
  visitLive: "Visit live site",
  stations: { about: "Highlights: about me", projects: "Highlights: top projects", experience: "Highlights: work experience", contact: "Highlights: contact" },
  cvHint: "CV",
  hall: "Highlights Hall",
};
const fonts = { sans: "s", sansBold: "sb", mono: "m", monoBold: "mb" };
const texts = hallLabels(data, labels, fonts);

/** The station whose face a point sits on (just in front of it, within its width), and the point's `u` along that face. */
function faceCoords(p: [number, number, number]) {
  for (const s of HALL_LAYOUT.stations) {
    const d = -((p[0] - s.front.x) * s.facing.x + (p[2] - s.front.z) * s.facing.z);
    const u = (p[0] - s.front.x) * s.right.x + (p[2] - s.front.z) * s.right.z;
    if (d >= 0 && d < 0.2 && Math.abs(u) <= s.width / 2 + 1e-6) return { s, u };
  }
  return null;
}

describe("Highlights Hall scenery", () => {
  it("writes the WOW numbers, projects, roles and contact from the payload", () => {
    const all = texts.map((t) => t.text);
    expect(all).toContain(data.profile.name);
    expect(all).toContain(data.profile.headline);
    for (const stat of getStats().slice(0, 4)) expect(all).toContain(stat.value);
    for (const p of data.highlights.projects) expect(all).toContain(p.title);
    expect(all).toContain(experienceRows(data.career).employment[0].org);
    expect(all).toContain(data.roof.email);
    expect(all.every((t) => t.trim().length > 0)).toBe(true);
  });

  it("tags a project screenshot with Visit live site only when its L3 pod has an allowed live link", () => {
    const first = data.highlights.projects[0];
    const withLive = (liveUrl: string) => ({ ...data, labs: { ...data.labs, pods: data.labs.pods.map((pod) => (pod.slug === first.slug ? { ...pod, liveUrl } : { ...pod, liveUrl: undefined })) } });
    const tags = (input: typeof data) => hallLabels(input, labels, fonts).filter((t) => t.text === labels.visitLive.toUpperCase());
    const tagged = tags(withLive("https://mii-microsoft.azurewebsites.net"));
    expect(tagged).toHaveLength(1);
    expect(faceCoords(tagged[0].position)).toMatchObject({ s: stationOf("projects") });
    expect(faceCoords(tagged[0].position)!.u).toBeCloseTo(-5.2);
    // podLiveLink rejects hosts outside PUBLIC_LIVE_HOSTS, so no tag.
    expect(tags(withLive("https://internal-portal.azurewebsites.net"))).toHaveLength(0);
    // Real content: one tag per featured project whose L3 pod has a live link.
    const live = data.highlights.projects.filter((p) => podLiveLink(data.labs.pods.find((pod) => pod.slug === p.slug)!)).length;
    expect(tags(data)).toHaveLength(live);
  });

  it("shows at most HALL_ROWS roles per column and says how many more the drawer has", () => {
    const { employment, freelance } = experienceRows(data.career);
    const experience = stationOf("experience");
    const orgs = texts.filter((t) => t.font === fonts.sansBold && faceCoords(t.position)?.s === experience);
    expect(orgs).toHaveLength(Math.min(HALL_ROWS, employment.length) + Math.min(HALL_ROWS, freelance.length));
    if (employment.length > HALL_ROWS) expect(texts.map((t) => t.text)).toContain(`+${employment.length - HALL_ROWS} more`);
  });

  it("keeps every station label on its own panel, between the plinth and the panel top", () => {
    for (const t of texts.filter((t) => !t.tilt)) {
      const at = faceCoords(t.position);
      expect(at, t.text).not.toBeNull();
      const half = at!.s.width / 2;
      const left = t.anchorX === "left" ? at!.u : at!.u - (t.maxWidth ?? 0) / 2;
      const right = t.anchorX === "left" ? at!.u + (t.maxWidth ?? 0) : at!.u + (t.maxWidth ?? 0) / 2;
      expect(left, t.text).toBeGreaterThanOrEqual(-half - 1e-6);
      expect(right, t.text).toBeLessThanOrEqual(half + 1e-6);
      expect(t.position[1], t.text).toBeGreaterThan(HALL.panel.plinth);
      expect(t.position[1], t.text).toBeLessThan(HALL.panel.h);
      expect(t.yaw).toBe(at!.s.yaw);
    }
    const sign = texts.filter((t) => t.tilt);
    expect(sign).toHaveLength(1);
    expect(sign[0].position).toEqual([HALL.sign.x, 0.03, HALL.sign.z]);
  });

  it("builds plinths, panels, stat tiles and screenshot frames inside the hall, clear of the door pads", () => {
    const solids = hallSolids(3);
    expect(solids).toHaveLength(4 + 4 + 4 + 3);
    for (const b of solids) {
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(HALL.zone.minX);
      expect(b.x + b.w / 2).toBeLessThanOrEqual(HALL.zone.maxX + 1e-6);
      for (const s of HALL_LAYOUT.stations) {
        const dx = Math.max(0, Math.abs(s.pad.x - b.x) - b.w / 2);
        const dz = Math.max(0, Math.abs(s.pad.z - b.z) - b.d / 2);
        expect(Math.hypot(dx, dz)).toBeGreaterThan(0.9);
      }
    }
  });

  it("puts the screenshots on the projects panel, facing the plaza, one atlas cell each", () => {
    const quads = hallShots(3);
    expect(quads.map((q) => q.index)).toEqual([0, 1, 2]);
    const { positions, uvs, indices } = shotQuadBuffers(quads, 3);
    expect(positions).toHaveLength(36);
    expect(Array.from(uvs.slice(0, 8))).toEqual([0, 0, 1 / 3, 0, 1 / 3, 1, 0, 1]);
    expect(Array.from(indices.slice(0, 6))).toEqual([0, 1, 2, 0, 2, 3]);
    // Counter-clockwise as seen from the plaza: (b - a) x (c - a) points out of the panel.
    const v = (i: number) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const [a, b, c] = [v(0), v(1), v(2)];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const projects = stationOf("projects");
    expect(n[0] * -projects.facing.x + n[2] * -projects.facing.z).toBeGreaterThan(0);
    expect(onPanel(projects, 0, 1, 0)).toEqual([projects.front.x, 1, projects.front.z]);
  });

  it("crops screenshots to cover their cell", () => {
    const same = coverCrop(1600, 1000, 480, 300);
    expect(same.sx).toBeCloseTo(0);
    expect(same.sy).toBeCloseTo(0);
    expect(same.sw).toBeCloseTo(1600);
    expect(same.sh).toBeCloseTo(1000);
    const wide = coverCrop(1920, 1080, 480, 300);
    expect(wide.sh).toBeCloseTo(1080);
    expect(wide.sw).toBeCloseTo(1728);
    expect(wide.sx).toBeCloseTo(96);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/hall-content.test.ts`
Expected: FAIL with "Failed to resolve import "@/experience/floors/lobby/hallContent"".

- [ ] **Step 3: Create `src/experience/floors/lobby/hallContent.ts`**

```ts
import { CAREER_TONE } from "../../fx/holoIcons";
import type { BatchedLabel } from "../../fx/labelProps";
import type { ExperienceData, Vec2 } from "../../types";
import type { Box } from "../roof/solids";
import { podLiveLink } from "@/content/selectors";
import { HALL, stationOf, type HallStation } from "./hallLayout";
import { experienceRows, HIGHLIGHT_STAT_COUNT, type HighlightStation } from "./stations";

/**
 * Pure scenery data for the Highlights Hall: every solid in one merged mesh (plus its edges), every
 * text in one troika BatchedText, the three screenshots in one atlas quad mesh. Positions are
 * floor-local; panel coordinates are `u` along the face (the reader's right) and the height `y`.
 */

export interface HallLabels {
  about: string;
  projects: string;
  experience: string;
  contact: string;
  employment: string;
  freelance: string;
  /** "+{count} more in the drawer" */
  more: (count: number) => string;
  cvHint: string;
  /** Floor sign on the passage. */
  hall: string;
  /** "Visit live site" (`common.visitLive`, R4-J): tag under a project screenshot that has a live link. */
  visitLive: string;
  /** Station names for point-and-go (`hud.rooms.highlights*`). */
  stations: Record<HighlightStation, string>;
}

export interface HallFonts {
  sans: string;
  sansBold: string;
  mono: string;
  monoBold: string;
}

export type HallInput = Pick<ExperienceData, "profile" | "stats" | "roof" | "career" | "highlights" | "labs">;

/** Roles per experience column in 3D; the drawer lists every one. */
export const HALL_ROWS = 6;
const STAT_U = [-3.6, -1.2, 1.2, 3.6] as const;
const TILE = { y: 2.9, w: 2.2, h: 1.8 } as const;
const SHOT_U = [-5.2, 0, 5.2] as const;
export const SHOT = { y: 3.55, w: 4.6, h: 2.875 } as const;
/** Atlas cell per screenshot (16:10), smaller on the lite tier. */
export const SHOT_CELL = { full: { w: 480, h: 300 }, lite: { w: 320, h: 200 } } as const;
/** How far in front of the panel face tiles, screenshots and text sit (no z-fighting). */
const OUT = { tile: 0.03, shot: 0.07, text: 0.1 } as const;
const INK = { title: "#f8fafc", body: "#cbd5e1", cyan: "#22d3ee" } as const;

/** A point on a station face: `u` along it (the reader's right), at height `y`, `out` toward the plaza. */
export function onPanel(s: HallStation, u: number, y: number, out: number = OUT.text): [number, number, number] {
  return [s.front.x + s.right.x * u - s.facing.x * out, y, s.front.z + s.right.z * u - s.facing.z * out];
}

/** A thin box on a station face (stat tile, screenshot frame), `w` along the face. */
function faceBox(s: HallStation, u: number, yCenter: number, w: number, h: number, depth = 0.06): Box {
  const [x, , z] = onPanel(s, u, 0, OUT.tile);
  const along = Math.abs(s.right.x) > 0.5;
  return { x, z, y: yCenter - h / 2, w: along ? w : depth, d: along ? depth : w, h };
}

/** Plinths, panels, the four stat tiles and one frame per screenshot. */
export function hallSolids(projectCount: number): Box[] {
  const P = HALL.panel;
  const out: Box[] = [];
  for (const name of ["about", "projects", "experience", "contact"] as const) {
    const s = stationOf(name);
    const r = s.rect;
    out.push({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, y: 0, w: r.maxX - r.minX, d: r.maxZ - r.minZ, h: P.plinth });
    const along = Math.abs(s.right.x) > 0.5;
    out.push({
      x: s.front.x + (s.facing.x * P.depth) / 2,
      z: s.front.z + (s.facing.z * P.depth) / 2,
      y: P.plinth,
      w: along ? s.width : P.depth,
      d: along ? P.depth : s.width,
      h: P.h - P.plinth,
    });
  }
  const about = stationOf("about");
  for (const u of STAT_U) out.push(faceBox(about, u, TILE.y, TILE.w, TILE.h));
  const projects = stationOf("projects");
  for (const u of SHOT_U.slice(0, projectCount)) out.push(faceBox(projects, u, SHOT.y, SHOT.w + 0.2, SHOT.h + 0.2));
  return out;
}

/** Every hall text (station faces plus the floor sign), for one `BatchedLabels`. */
export function hallLabels(input: HallInput, labels: HallLabels, fonts: HallFonts): BatchedLabel[] {
  const out: BatchedLabel[] = [];
  const add = (s: HallStation, u: number, y: number, text: string, font: string, fontSize: number, color: string, extra: Partial<BatchedLabel> = {}) => {
    if (text.trim()) out.push({ text, position: onPanel(s, u, y), yaw: s.yaw, font, fontSize, color, textAlign: "center", ...extra });
  };
  const eyebrow = (s: HallStation, n: number, title: string) =>
    add(s, 0, 5.55, `0${n} · ${title.toUpperCase()}`, fonts.mono, 0.2, HALL.tone[s.station], { letterSpacing: 0.12, maxWidth: s.width - 1 });

  const about = stationOf("about");
  eyebrow(about, 1, labels.about);
  add(about, 0, 4.9, input.profile.name, fonts.sansBold, 0.6, INK.title, { maxWidth: about.width - 0.6 });
  add(about, 0, 4.25, input.profile.headline, fonts.sans, 0.3, INK.cyan, { maxWidth: about.width - 0.6 });
  input.stats.slice(0, HIGHLIGHT_STAT_COUNT).forEach((stat, i) => {
    add(about, STAT_U[i], TILE.y + 0.55, stat.value, fonts.sansBold, 0.5, INK.title, { maxWidth: TILE.w - 0.2 });
    add(about, STAT_U[i], TILE.y + 0.15, stat.label, fonts.sans, 0.14, INK.body, { anchorY: "top", maxWidth: TILE.w - 0.2, lineHeight: 1.2 });
  });
  add(about, 0, 1.3, input.roof.subheadline, fonts.sans, 0.24, INK.body, { maxWidth: about.width - 0.6 });

  const projects = stationOf("projects");
  eyebrow(projects, 2, labels.projects);
  input.highlights.projects.slice(0, SHOT_U.length).forEach((p, i) => {
    add(projects, SHOT_U[i], 1.75, p.title, fonts.sansBold, 0.24, INK.title, { maxWidth: SHOT.w });
    add(projects, SHOT_U[i], 1.35, input.labs.wings[p.wing].toUpperCase(), fonts.mono, 0.14, HALL.tone.projects, { letterSpacing: 0.1, maxWidth: SHOT.w });
    // Live sites (R4-J) come from the L3 payload through the guarded selector; the link itself lives in the drawer.
    if (podLiveLink(input.labs.pods.find((pod) => pod.slug === p.slug) ?? {})) {
      add(projects, SHOT_U[i], 0.95, labels.visitLive.toUpperCase(), fonts.mono, 0.13, INK.cyan, { letterSpacing: 0.1, maxWidth: SHOT.w });
    }
  });

  const experience = stationOf("experience");
  eyebrow(experience, 3, labels.experience);
  const rows = experienceRows(input.career);
  const columns = [
    { u: -4.4, title: labels.employment, list: rows.employment, tone: CAREER_TONE.job },
    { u: 4.4, title: labels.freelance, list: rows.freelance, tone: CAREER_TONE.freelance },
  ];
  for (const col of columns) {
    const left = col.u - 3.9;
    const row = { anchorX: "left" as const, textAlign: "left" as const, maxWidth: 7.8 };
    add(experience, col.u, 4.95, col.title.toUpperCase(), fonts.mono, 0.2, col.tone, { letterSpacing: 0.12, maxWidth: 7.8 });
    col.list.slice(0, HALL_ROWS).forEach((e, i) => {
      const y = 4.45 - i * 0.55;
      add(experience, left, y, e.org, fonts.sansBold, 0.2, INK.title, row);
      add(experience, left, y - 0.24, `${e.role} · ${e.period}`, fonts.sans, 0.14, INK.body, row);
    });
    const hidden = col.list.length - HALL_ROWS;
    if (hidden > 0) add(experience, left, 4.45 - HALL_ROWS * 0.55, labels.more(hidden), fonts.mono, 0.14, col.tone, row);
  }

  const contact = stationOf("contact");
  eyebrow(contact, 4, labels.contact);
  add(contact, 0, 4.85, input.roof.availability, fonts.sansBold, 0.36, INK.title, { maxWidth: contact.width - 1 });
  add(contact, 0, 3.9, input.roof.email, fonts.mono, 0.42, INK.cyan, { maxWidth: contact.width - 1 });
  add(contact, 0, 3.0, input.roof.channels.map((c) => c.label).join(" · "), fonts.sans, 0.22, INK.body, { maxWidth: contact.width - 1 });
  add(contact, 0, 2.2, labels.cvHint, fonts.mono, 0.18, HALL.tone.contact, { maxWidth: contact.width - 1 });

  // Floor sign on the passage, flat on the road, read from the plaza side.
  out.push({ text: labels.hall.toUpperCase(), position: [HALL.sign.x, 0.03, HALL.sign.z], yaw: 0, tilt: Math.PI / 2, font: fonts.monoBold, fontSize: 0.9, color: HALL.tone.about, letterSpacing: 0.1 });
  return out;
}

export interface ShotQuad {
  /** Atlas cell (project order). */
  index: number;
  center: [number, number, number];
  right: Vec2;
  w: number;
  h: number;
}

/** One quad per project screenshot on the projects panel. */
export function hallShots(count: number): ShotQuad[] {
  const s = stationOf("projects");
  return SHOT_U.slice(0, count).map((u, index) => ({ index, center: onPanel(s, u, SHOT.y, OUT.shot), right: s.right, w: SHOT.w, h: SHOT.h }));
}

/** Positions, uvs and indices for the screenshot quads over a one-row atlas of `count` cells (one draw call). */
export function shotQuadBuffers(quads: readonly ShotQuad[], count: number) {
  const positions = new Float32Array(quads.length * 12);
  const uvs = new Float32Array(quads.length * 8);
  const indices = new Uint16Array(quads.length * 6);
  quads.forEach((q, i) => {
    const hx = (q.right.x * q.w) / 2;
    const hz = (q.right.z * q.w) / 2;
    const hy = q.h / 2;
    const [x, y, z] = q.center;
    positions.set([x - hx, y - hy, z - hz, x + hx, y - hy, z + hz, x + hx, y + hy, z + hz, x - hx, y + hy, z - hz], i * 12);
    const u0 = q.index / count;
    const u1 = (q.index + 1) / count;
    uvs.set([u0, 0, u1, 0, u1, 1, u0, 1], i * 8);
    const b = i * 4;
    indices.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
  });
  return { positions, uvs, indices };
}

/** Source rectangle that covers a `cw` x `ch` cell with an `iw` x `ih` image (centered crop). */
export function coverCrop(iw: number, ih: number, cw: number, ch: number): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(cw / iw, ch / ih);
  const sw = cw / scale;
  const sh = ch / scale;
  return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh };
}
```

- [ ] **Step 4: Run the unit test**

Run: `bunx vitest run tests/unit/hall-content.test.ts`
Expected: PASS. If "keeps every station label on its own panel" fails for a stat label or a role line, shorten that label's `maxWidth` in `hallLabels`, never the panel width (the panel width comes from the layout and the space rules).

- [ ] **Step 5: Create `src/experience/floors/lobby/HighlightsHall.tsx`**

```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, SRGBColorSpace } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { BatchedLabels } from "../../fx/BatchedLabels";
import { RoadMarkings } from "../../fx/RoadMarkings";
import { roverRuntime } from "../../rover/runtime";
import { FONTS } from "../../tower/primitives";
import type { ExperienceData, GpuTier } from "../../types";
import { MergedBoxes, MergedEdges } from "../roof/kit";
import { coverCrop, hallLabels, hallShots, hallSolids, SHOT_CELL, shotQuadBuffers, type HallLabels } from "./hallContent";
import { HALL, HALL_LAYOUT, shouldLoadShots } from "./hallLayout";

/** Draws the cover thumbnails into one canvas row (cover fit); a failed image leaves its cell dark. */
function useShotAtlas(srcs: readonly string[], cell: { w: number; h: number }, enabled: boolean) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  const key = srcs.join("|");
  useEffect(() => {
    if (!enabled || srcs.length === 0) return;
    let cancelled = false;
    let built: CanvasTexture | null = null;
    const canvas = document.createElement("canvas");
    canvas.width = cell.w * srcs.length;
    canvas.height = cell.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    Promise.all(
      srcs.map(
        (src, i) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.decoding = "async";
            img.onload = () => {
              const { sx, sy, sw, sh } = coverCrop(img.naturalWidth, img.naturalHeight, cell.w, cell.h);
              ctx.drawImage(img, sx, sy, sw, sh, i * cell.w, 0, cell.w, cell.h);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = src;
          }),
      ),
    ).then(() => {
      if (cancelled) return;
      built = new CanvasTexture(canvas);
      built.colorSpace = SRGBColorSpace;
      built.anisotropy = 4;
      setTexture(built);
    });
    return () => {
      cancelled = true;
      built?.dispose();
    };
    // `key` captures srcs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cell.w, cell.h, enabled]);
  return texture;
}

/** The three project screenshots as one mesh over a canvas atlas, loaded once the rover heads for the hall. */
function ShotWall({ thumbs, tier }: { thumbs: readonly string[]; tier: GpuTier }) {
  const [load, setLoad] = useState(false);
  useFrame(() => {
    if (!load && shouldLoadShots(getHQStore().getState().floor, roverRuntime.x)) setLoad(true);
  });
  const texture = useShotAtlas(thumbs, SHOT_CELL[tier === "full" ? "full" : "lite"], load);
  const geometry = useMemo(() => {
    const { positions, uvs, indices } = shotQuadBuffers(hallShots(thumbs.length), thumbs.length);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("uv", new BufferAttribute(uvs, 2));
    g.setIndex(new BufferAttribute(indices, 1));
    g.computeBoundingSphere();
    return g;
  }, [thumbs.length]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!texture) return null;
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/**
 * L1 Highlights Hall: road markings (passage, plaza, spurs), every solid in one mesh plus one edge
 * mesh, every text in one BatchedText and the screenshots in one lazy atlas mesh. Clicks go through the
 * point-and-go registry (Task 11), not through meshes here. Static: nothing animates, so reduced motion needs no case.
 */
export function HighlightsHall({ data, labels, tier }: { data: ExperienceData; labels: HallLabels; tier: GpuTier }) {
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const solids = useMemo(() => hallSolids(data.highlights.projects.length), [data.highlights.projects.length]);
  const texts = useMemo(() => hallLabels(data, labels, FONTS), [data, labels]);
  const thumbs = useMemo(() => data.highlights.projects.map((p) => p.thumb), [data.highlights.projects]);
  return (
    <group name="highlights-hall">
      <RoadMarkings network={HALL_LAYOUT.network} color={HALL.tone.about} tier={tier} reducedMotion={reducedMotion} chevronSpacing={5} />
      <MergedBoxes boxes={solids} color="#0b1020" emissive={HALL.tone.about} emissiveIntensity={0.05} />
      <MergedEdges boxes={solids} color={HALL.tone.about} tier={tier} opacity={0.7} />
      {/* Text loads fonts asynchronously; keep it from holding back the geometry. */}
      <Suspense fallback={null}>
        <BatchedLabels labels={texts} name="highlights-labels" />
      </Suspense>
      <ShotWall thumbs={thumbs} tier={tier} />
    </group>
  );
}
```

- [ ] **Step 6: Mount it in the Lobby**

In `src/experience/floors/Lobby.tsx`:

Add the imports

```ts
import type { HallLabels } from "./lobby/hallContent";
import { HighlightsHall } from "./lobby/HighlightsHall";
```

Replace

```ts
export interface LobbyLabels {
  skillsTitle: string;
  certs: CertLabels;
  kiosk: KioskLabels;
}
```

with

```ts
export interface LobbyLabels {
  skillsTitle: string;
  certs: CertLabels;
  kiosk: KioskLabels;
  hall: HallLabels;
}
```

and after `<MissionKiosk missions={data.missions} labels={labels.kiosk} />` add:

```tsx
      <HighlightsHall data={data} labels={labels.hall} tier={tier} />
```

In `src/experience/Experience.tsx`, add `const tHall = useTranslations("hall");` next to the other `useTranslations` calls; in the `labels` memo, inside `lobby: { ... }` after the `kiosk:` line add:

```ts
        hall: {
          about: tHall("about"),
          projects: tHall("projects"),
          experience: tHall("experience"),
          contact: tHall("contact"),
          // The career type labels, like the L2 type icons and the /journey chips.
          employment: tCommon("type.job"),
          freelance: tCommon("type.freelance"),
          visitLive: tCommon("visitLive"),
          stations: {
            about: t("rooms.highlightsAbout"),
            projects: t("rooms.highlightsProjects"),
            experience: t("rooms.highlightsExperience"),
            contact: t("rooms.highlightsContact"),
          },
          more: (count: number) => tHall("more", { count }),
          cvHint: tHall("cvHint"),
          hall: tHall("hall"),
        },
```

and add `tHall` to the memo's dependency array.

- [ ] **Step 7: Describe L1 in the floor picker**

In `messages/en.json` replace `"L1": "Profile, stats, skills and certifications"` (under `hud.pads.floorDesc`) with `"L1": "Profile, the Highlights Hall, skills and certifications"`; in `messages/id.json` replace `"L1": "Profil, statistik, keahlian dan sertifikasi"` with `"L1": "Profil, Aula Sorotan, keahlian dan sertifikasi"`.

- [ ] **Step 8: Verify and look at it**

Run: `bun run verify:quick`
Expected: typecheck, lint, unit tests and the build pass.

Run: `bunx playwright test e2e/highlights.spec.ts --reporter=list`
Expected: PASS, and the printed passage numbers are at most about 10 calls above the Task 1 baseline.

Visual check: `bun run dev`, open `http://localhost:3000/en?tier=full`, press Boot rover, then drive east past the south end of the certification wall. Expected: chevrons on the passage, the "HIGHLIGHTS HALL" floor sign, four lit panels that read from their pads, the three screenshots appearing once you pass x = 18, and the certification wall unchanged from the plaza. Task 13 captures the review sizes.

- [ ] **Step 9: Pay for the hall: batch the skills wall text (saves 8 draw calls on L1)**

The skills wall draws its title and two texts per group as separate drei `<Text>` meshes (9 draw calls with 4 groups). They never billboard, so one `BatchedLabels` draws them in one call, which more than pays for the hall's road markings. In `src/experience/floors/lobby/SkillsWall.tsx`:

Replace the imports

```ts
import { Text } from "@react-three/drei";
import { useMemo } from "react";
```

with

```ts
import { useMemo } from "react";
import { BatchedLabels } from "../../fx/BatchedLabels";
import type { BatchedLabel } from "../../fx/labelProps";
```

After the `quads` memo add:

```ts
  // Title, headings and item columns in one BatchedText (one draw call instead of one per text).
  const labels = useMemo<BatchedLabel[]>(
    () => [
      { text: title.toUpperCase(), position: [0, h + 0.3, 0], font: FONTS.monoBold, fontSize: 0.42, letterSpacing: 0.12, color: COLORS.green, anchorX: "center", anchorY: "bottom" },
      ...skills.flatMap((group, i): BatchedLabel[] => {
        const left = -w / 2 + i * column + COLUMN_PAD;
        const front = d / 2 + 0.03;
        return [
          {
            text: group.label.toUpperCase(),
            position: [left, h - SKILLS_PAD.top, front],
            font: FONTS.monoBold,
            fontSize: LABEL_SIZE,
            letterSpacing: LABEL_TRACKING,
            lineHeight: LABEL_LINE,
            color: GROUP_ACCENT[group.id] ?? COLORS.white,
            anchorX: "left",
            anchorY: "top",
            textAlign: "left",
            maxWidth: textWidth,
          },
          // No maxWidth: one item per line, never wrapped (the drei Text used whiteSpace="nowrap").
          { text: group.items.join("\n"), position: [left + ICON_GAP, h - ITEM_TOP, front], font: FONTS.sans, fontSize: ITEM_SIZE, lineHeight: ITEM_LINE, color: "#e4e4e7", anchorX: "left", anchorY: "top", textAlign: "left" },
        ];
      }),
    ],
    [skills, title, h, w, d, column, textWidth, ITEM_TOP],
  );
```

and replace everything between `<GlassBox size={[w, h, d]} ... />` and `<group position={[0, 0, d / 2 + 0.035]}>` (the title `<Text>` and the `skills.map(...)` block of headings and items) with:

```tsx
        <BatchedLabels labels={labels} name="skills-labels" />
```

Re-run Step 8. Expected: the skills wall looks the same (title, headings in their group colors, one item per line next to its logo), and the probe's spawn number is at or below the Task 1 baseline even with the hall mounted.

- [ ] **Step 10: Commit**

```bash
rtk git add src/experience/floors/lobby/hallContent.ts src/experience/floors/lobby/HighlightsHall.tsx src/experience/floors/lobby/SkillsWall.tsx src/experience/floors/Lobby.tsx src/experience/Experience.tsx messages/en.json messages/id.json tests/unit/hall-content.test.ts
rtk git commit -m "feat(highlights): hall scenery with merged solids, one text batch and a lazy screenshot atlas"
```



---
### Task 9: The "Quick tour" walk and its mission (Ask Rover and Cmd-K)

**Files:**
- Modify: `src/content/schema.ts` (`WalkIdSchema`)
- Modify: `src/experience/missions/rooms.ts` (`WALK_FLOOR`)
- Modify: `content/site-content.json` (mission `highlights`, orders)
- Modify: `src/experience/config.ts` (`WALK_FLOORS`, `NO_WALK_PROMPT`)
- Modify: `src/experience/missions/walks.ts` (`highlightsWalk`)
- Modify: `src/hud/walk/WalkLayer.tsx`
- Modify: `src/hud/terminal.ts`, `src/hud/RoverTerminal.tsx` (9 missions)
- Modify: `messages/en.json`, `messages/id.json` (`walk.highlights`)
- Modify: `e2e/missions.spec.ts`, `e2e/experience.spec.ts` (terminal key shift)
- Test: `tests/unit/walk.test.ts`, `tests/unit/missions-runner.test.ts`, `tests/unit/search.test.ts`, `tests/hud/RoverTerminal.test.tsx`, `tests/hud/MissionHud.test.tsx`

**Interfaces:**
- Consumes: `experienceRows`, `highlightRoom`, `HighlightStation` (Task 4); `ExperienceData.highlights` (Task 4); room doors (Task 7) so `drive` stops on the pads.
- Produces:
  - `WalkId` gains `"highlights"`; `WALK_FLOOR.highlights = "L1"`.
  - `highlightsWalk(data: Pick<ExperienceData, "profile" | "roof" | "highlights" | "career">, labels: HighlightsWalkLabels): WalkDefinition` with id `"highlights"`, floor `"L1"`, four room stops, no filters.
  - `interface HighlightsWalkLabels { about; projects; experience; contact; counts(employment: number, freelance: number): string }`
  - `WALK_FLOORS = ["L1", "L2", "L3", "L4", "RF"]`, `NO_WALK_PROMPT: readonly FloorId[] = ["L1"]`.
  - Mission `highlights` (order 2): `elevator L1`, `walk highlights`; label "Quick tour: the highlights" / "Tur singkat: sorotan utama". The terminal shows up to 9 missions (keys 1 to 9).

- [ ] **Step 1: Write the failing tests**

In `tests/unit/walk.test.ts`: add `highlightsWalk` to the import from `@/experience/missions/walks`, change `import { WALK_FLOORS } from "@/experience/config";` to `import { NO_WALK_PROMPT, WALK_FLOORS } from "@/experience/config";`, change the roof test's last line to

```ts
    expect(WALK_FLOORS).toEqual(["L1", "L2", "L3", "L4", "RF"]);
```

and add inside `describe("walk definitions", ...)` (it reuses that block's `career` fixture: one job, one milestone):

```ts
  it("tours the Highlights Hall on L1: about, projects, experience, then contact, without a first-visit prompt", () => {
    const walk = highlightsWalk(
      {
        profile: { name: "N", monogram: "N", headline: "Engineer", role: "Role · Org", location: "Jakarta" },
        roof: { availability: "Open to talk", email: "me@example.com", channels: [], timezone: "GMT+7", subheadline: "Builds." },
        highlights: {
          projects: [
            { slug: "a", title: "A", wing: "ai", thumb: "/media/a/01.thumb.webp" },
            { slug: "b", title: "B", wing: "software", thumb: "/media/b/01.thumb.webp" },
          ],
        },
        career,
      },
      { about: "About me", projects: "Top 3 projects", experience: "Work experience", contact: "Contact", counts: (e, f) => `${e} employment, ${f} freelance` },
    );
    expect(walk).toMatchObject({ id: "highlights", floor: "L1" });
    expect(walk.filters).toBeUndefined();
    expect(walk.stops.map((s) => s.id)).toEqual(["L1:highlights-about", "L1:highlights-projects", "L1:highlights-experience", "L1:highlights-contact"]);
    expect(walk.stops[0]).toEqual({ id: "L1:highlights-about", to: "L1:highlights-about", room: "L1:highlights-about", title: "About me", subtitle: "Engineer" });
    expect(walk.stops[1].subtitle).toBe("A · B");
    expect(walk.stops[2].subtitle).toBe("1 employment, 0 freelance");
    expect(walk.stops[3].subtitle).toBe("me@example.com");
    expect(NO_WALK_PROMPT).toEqual(["L1"]);
  });
```

In `tests/unit/missions-runner.test.ts`, add to the `expected` map:

```ts
    highlights: ["elevator L1", "walk highlights"],
```

In `tests/unit/search.test.ts`, inside `describe("searchPalette", ...)` add:

```ts
  it('finds the Quick tour mission for "quick tour" and the Indonesian "tur singkat"', () => {
    expect(keys(searchPalette(entries, "quick tour"), "missions")[0]).toBe("mission:highlights");
    expect(keys(searchPalette(entries, "tur singkat"), "missions")[0]).toBe("mission:highlights");
    expect(entries.find((e) => e.key === "mission:highlights")?.floor).toBe("L1");
  });
```

In `tests/hud/RoverTerminal.test.tsx`, test "leads with software and AI, alternating per visit", replace the last two expectations with:

```ts
    expect(orderTerminalMissions(all, 1).map((m) => m.id).slice(2)).toEqual(["highlights", "journey", "projects", "hire", "cv", "blog", "surprise"]);
    expect(orderTerminalMissions([...all, ...all.map((m) => ({ ...m, id: `${m.id}-x`, order: m.order + 10 }))], 0)).toHaveLength(9);
```

In `tests/hud/MissionHud.test.tsx`, after the test "runs the journey walk mission as the journey page on static pages", add:

```tsx
  it("runs the Quick tour as the landing page on static pages", async () => {
    renderHud();
    act(() => openTerminal());
    const tour = index.missions.find((m) => m.id === "highlights")!;
    expect(tour.steps).toEqual([{ kind: "elevator", floor: "L1" }, { kind: "walk", walk: "highlights" }]);
    await userEvent.click(screen.getByRole("option", { name: tour.label.en }));
    await vi.waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en"));
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/walk.test.ts tests/unit/missions-runner.test.ts tests/unit/search.test.ts tests/hud/RoverTerminal.test.tsx tests/hud/MissionHud.test.tsx`
Expected: FAIL (`highlightsWalk` is not exported; no `highlights` mission; the terminal still caps at 8).

- [ ] **Step 3: Add the walk id and its floor**

In `src/content/schema.ts`, replace

```ts
/** Guided walks (src/experience/missions/walks.ts): L2 "Walk my journey" and L3 "Tour my projects". */
export const WalkIdSchema = z.enum(["journey", "projects", "writing"]);
```

with

```ts
/** Guided walks started by missions (src/experience/missions/walks.ts): L2 journey, L3 projects, L4 writing, L1 Quick tour. */
export const WalkIdSchema = z.enum(["journey", "projects", "writing", "highlights"]);
```

In `src/experience/missions/rooms.ts`, replace

```ts
export const WALK_FLOOR: Record<WalkId, FloorId> = { journey: "L2", projects: "L3", writing: "L4" };
```

with

```ts
export const WALK_FLOOR: Record<WalkId, FloorId> = { journey: "L2", projects: "L3", writing: "L4", highlights: "L1" };
```

- [ ] **Step 4: Add the mission**

In `content/site-content.json`, `missions`: insert after the `best-ai` mission object:

```json
    {
      "id": "highlights",
      "order": 2,
      "label": {
        "en": "Quick tour: the highlights",
        "id": "Tur singkat: sorotan utama"
      },
      "steps": [
        {
          "kind": "elevator",
          "floor": "L1"
        },
        {
          "kind": "walk",
          "walk": "highlights"
        }
      ]
    },
```

and shift the later orders by one: `journey` 2 to 3, `projects` 3 to 4, `hire` 4 to 5, `cv` 5 to 6, `blog` 6 to 7, `surprise` 7 to 8.

Run: `bun run validate:content`
Expected: no errors.

- [ ] **Step 5: Up to nine terminal missions**

In `src/hud/terminal.ts`, replace

```ts
 * (equal billing), then the rest in catalog order. At most 8 options (keys 1 to 8).
```

with

```ts
 * (equal billing), then the rest in catalog order. At most 9 options (keys 1 to 9).
```

and `return [...lead, ...rest].slice(0, 8);` with `return [...lead, ...rest].slice(0, 9);`.

In `src/hud/RoverTerminal.tsx`, replace `/** Already ordered for this visit (see `orderTerminalMissions`), at most 8. */` with `/** Already ordered for this visit (see `orderTerminalMissions`), at most 9. */` and, in the component doc comment, `Keys 1 to 8` with `Keys 1 to 9` (the key handler already accepts 1 to 9).

- [ ] **Step 6: Offer the walk on L1 without the prompt**

In `src/experience/config.ts`, replace

```ts
export const WALK_FLOORS: readonly FloorId[] = ["L2", "L3", "L4", "RF"];
```

with

```ts
export const WALK_FLOORS: readonly FloorId[] = ["L1", "L2", "L3", "L4", "RF"];

/**
 * Floors whose walk never shows the generic first-visit prompt; the launcher pill, Ask Rover and Cmd-K
 * still start it. L1: a separate onboarding introduces the Highlights Hall and its Quick tour.
 */
export const NO_WALK_PROMPT: readonly FloorId[] = ["L1"];
```

- [ ] **Step 7: Define the walk**

In `src/experience/missions/walks.ts`, add the import

```ts
import { experienceRows, highlightRoom, type HighlightStation } from "../floors/lobby/stations";
```

and append:

```ts
export interface HighlightsWalkLabels {
  about: string;
  projects: string;
  experience: string;
  contact: string;
  /** Subtitle of the experience stop, e.g. "9 employment roles and 6 freelance projects, newest first". */
  counts: (employment: number, freelance: number) => string;
}

/**
 * L1 "Quick tour": the four Highlights Hall stations in order (about me, top projects, work
 * experience, contact), each opening its drawer on arrival. No filters. Started from the launcher
 * pill, Ask Rover or Cmd-K (mission `highlights`); L1 never shows the first-visit prompt.
 */
export function highlightsWalk(data: Pick<ExperienceData, "profile" | "roof" | "highlights" | "career">, labels: HighlightsWalkLabels): WalkDefinition {
  const { employment, freelance } = experienceRows(data.career);
  const stop = (station: HighlightStation, title: string, subtitle: string): WalkStop => {
    const room = highlightRoom(station);
    return { id: room, to: room, room, title, subtitle };
  };
  return {
    id: "highlights",
    floor: "L1",
    stops: [
      stop("about", labels.about, data.profile.headline),
      stop("projects", labels.projects, data.highlights.projects.map((p) => p.title).join(" · ")),
      stop("experience", labels.experience, labels.counts(employment.length, freelance.length)),
      stop("contact", labels.contact, data.roof.email),
    ],
  };
}
```

- [ ] **Step 8: Register it in the Walk HUD**

In `src/hud/walk/WalkLayer.tsx`:

Replace `import { WALK_FLOORS } from "@/experience/config";` with `import { NO_WALK_PROMPT, WALK_FLOORS } from "@/experience/config";` and add `highlightsWalk` to the import from `@/experience/missions/walks`.

In `useWalkDefinitions`, add `const tHall = useTranslations("hall");` next to the other hooks, add this entry first in the returned object

```ts
      L1: highlightsWalk(
        { profile: data.profile, roof: data.roof, highlights: data.highlights, career: data.career },
        {
          about: tHall("about"),
          projects: tHall("projects"),
          experience: tHall("experience"),
          contact: tHall("contact"),
          counts: (employment, freelance) => tHall("counts", { employment, freelance }),
        },
      ),
```

and replace the memo dependencies with `[data.career, data.labs, data.library, data.roof, data.profile, data.highlights, t, tc, th, tl, tContact, tHall]`.

Replace the prompt effect's guard

```ts
    if (!walk || !exploring || active || promptSeen(floor)) return;
```

with

```ts
    if (!walk || !exploring || active || promptSeen(floor) || NO_WALK_PROMPT.includes(floor)) return;
```

and the launcher prop

```tsx
      launcher={promptSeen(floor) ? t(`${walk.definition.id}.start`) : undefined}
```

with

```tsx
      launcher={promptSeen(floor) || NO_WALK_PROMPT.includes(floor) ? t(`${walk.definition.id}.start`) : undefined}
```

- [ ] **Step 9: Walk messages**

In `messages/en.json` under `walk`, after the `"meet": { ... },` block add:

```json
    "highlights": {
      "title": "Take the quick tour?",
      "body": "A four-stop drive through the Highlights Hall: about me, my top projects, my work experience and how to reach me.",
      "start": "Quick tour",
      "name": "Quick tour"
    },
```

In `messages/id.json` at the same place:

```json
    "highlights": {
      "title": "Ikut tur singkat?",
      "body": "Perjalanan empat pemberhentian di Aula Sorotan: tentang saya, proyek teratas, pengalaman kerja dan cara menghubungi saya.",
      "start": "Tur singkat",
      "name": "Tur singkat"
    },
```

- [ ] **Step 10: Follow the terminal key shift in e2e**

`hire` moves from key 5 to key 6. In `e2e/missions.spec.ts`, test "terminal runs hire with its number key", replace `.nth(4)` with `.nth(5)` and `page.keyboard.press("5")` with `page.keyboard.press("6")`. In `e2e/experience.spec.ts`, test "the HUD Ask Rover button runs hire through the tower", replace `await page.keyboard.press("5");` with `await page.keyboard.press("6");`.

- [ ] **Step 11: Run the tests**

Run: `bunx vitest run tests/unit/walk.test.ts tests/unit/missions-runner.test.ts tests/unit/missions-static-host.test.ts tests/unit/missions-rooms.test.ts tests/unit/search.test.ts tests/content/dataset.test.ts tests/unit/ui-copy.test.ts tests/hud/RoverTerminal.test.tsx tests/hud/MissionHud.test.tsx tests/hud/WalkBar.test.tsx`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
rtk git add src/content/schema.ts src/experience/missions/rooms.ts src/experience/missions/walks.ts content/site-content.json src/experience/config.ts src/hud/walk/WalkLayer.tsx src/hud/terminal.ts src/hud/RoverTerminal.tsx messages/en.json messages/id.json e2e/missions.spec.ts e2e/experience.spec.ts tests/unit/walk.test.ts tests/unit/missions-runner.test.ts tests/unit/search.test.ts tests/hud/RoverTerminal.test.tsx tests/hud/MissionHud.test.tsx
rtk git commit -m "feat(highlights): Quick tour walk on L1, its Ask Rover and Cmd-K mission"
```

---

### Task 10: Deep links to the stations

**Files:**
- Modify: `src/experience/floors/lobby/stations.ts` (`gateStartRoom`)
- Modify: `src/experience/ExperienceGate.tsx`
- Modify: `src/experience/Experience.tsx` (`startSession`, `hasPage`)
- Test: `tests/unit/highlights-data.test.ts`, `tests/unit/intro-session.test.ts`, `e2e/highlights.spec.ts`

**Interfaces:**
- Consumes: `highlightsRoomFromHash`, `isHighlightRoom` (Task 4); L1 doors (Task 7); `introTarget`, `continuationSteps` (`introContinue.ts`).
- Produces: `gateStartRoom(startFloor?: FloorId, startRoom?: RoomId, hash: string): RoomId | undefined`. URL convention: `/{locale}#highlights` and `/{locale}#highlights-<about|projects|experience|contact>` open the station in 3D (first visit: after the intro, as the usual `intro:continue` mission); an open station keeps `/{locale}` and lives in the history entry (`hasPage` false), like the L4 shelves. The static tier uses each room's landing anchor (`/#intro`, `/#work`, `/#journey`, `/#contact`).

- [ ] **Step 1: Write the failing tests**

In `tests/unit/highlights-data.test.ts`, add `gateStartRoom` to the import from `@/experience/floors/lobby/stations` and add inside `describe("Highlights rooms", ...)`:

```ts
  it("starts the landing on a station from its hash, and never overrides a floor or room route", () => {
    expect(gateStartRoom(undefined, undefined, "#highlights-projects")).toBe("L1:highlights-projects");
    expect(gateStartRoom(undefined, undefined, "#work")).toBeUndefined();
    expect(gateStartRoom("L3", undefined, "#highlights")).toBeUndefined();
    expect(gateStartRoom(undefined, "L3:x", "#highlights")).toBe("L3:x");
  });
```

In `tests/unit/intro-session.test.ts`, add inside the `describe` that holds "rides, drives and opens a room; rides only for a floor":

```ts
  it("continues a Highlights Hall deep link in the Lobby: drive to the station and open it", () => {
    const target = introTarget({ startRoom: "L1:highlights-contact", ready: ["L1", "L2", "L3", "L4", "RF"] });
    expect(target).toEqual({ floor: "L1", room: "L1:highlights-contact", architecture: false });
    expect(continuationSteps(target!)).toEqual([
      { kind: "elevator", floor: "L1" },
      { kind: "drive", to: "L1:highlights-contact" },
      { kind: "open", room: "L1:highlights-contact" },
    ]);
  });
```

Append to `e2e/highlights.spec.ts` (update its imports to `import { expect, test, type Page } from "@playwright/test";`, add `asReturningVisitor, collectErrors, waitForHQ, waitForPhase, waitForRoom` to the `./hq` import, and add `import { stationOf } from "../src/experience/floors/lobby/hallLayout";`):

```ts
async function expectRoverNear(page: Page, point: { x: number; z: number }, tolerance = 1.5) {
  const { rover } = await snapshot(page);
  expect(Math.hypot(rover.x - point.x, rover.z - point.z)).toBeLessThan(tolerance);
}

test("a #highlights-<station> link on the landing opens that station at its door", async ({ page }) => {
  const errors = collectErrors(page);
  await asReturningVisitor(page);
  await page.goto("/en?tier=lite#highlights-contact");
  await waitForHQ(page);
  await waitForRoom(page, "L1:highlights-contact");
  await expectRoverNear(page, stationOf("contact").pad);
  await page.keyboard.press("Escape");
  await waitForPhase(page, "explore");
  await expect(page).toHaveURL(/\/en\?tier=lite/);
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/highlights-data.test.ts tests/unit/intro-session.test.ts`
Expected: FAIL (`gateStartRoom` is not exported); the intro test passes already (it pins existing behavior for the new rooms).

Run: `bun run build && bunx playwright test e2e/highlights.spec.ts -g "#highlights" --reporter=list`
Expected: FAIL (timeout in `waitForRoom`: the hash is ignored).

- [ ] **Step 3: Add `gateStartRoom`**

In `src/experience/floors/lobby/stations.ts`, change the first import to `import type { FloorId, RoomId } from "@/content/schema";` and append:

```ts
/** The room a gated page starts on: its own room, else (only on `/{locale}`, which has no start floor) a `#highlights-<station>` hash. */
export function gateStartRoom(startFloor: FloorId | undefined, startRoom: RoomId | undefined, hash: string): RoomId | undefined {
  if (startRoom || startFloor) return startRoom;
  return highlightsRoomFromHash(hash) ?? undefined;
}
```

- [ ] **Step 4: Read the hash in the gate**

In `src/experience/ExperienceGate.tsx`, add `import { gateStartRoom } from "./floors/lobby/stations";` and, below the `const [view, setView] = useState...` line, add:

```ts
  // `/{locale}#highlights-<station>` opens that Highlights Hall station (read once on the client; never on floor or room routes).
  const [hashRoom] = useState<RoomId | undefined>(() => (typeof window === "undefined" ? undefined : gateStartRoom(startFloor, undefined, window.location.hash)));
```

and in the `<Experience ... />` element replace `startRoom={startRoom}` with `startRoom={startRoom ?? hashRoom}`.

- [ ] **Step 5: Start at the station's door and keep `/{locale}` while it is open**

In `src/experience/Experience.tsx`, add `import { isHighlightRoom } from "./floors/lobby/stations";`. In `startSession`, replace

```ts
  } else if (startFloor && startFloor !== "L1" && READY_FLOORS.includes(startFloor)) {
    place(startFloor, doorOf(startFloor, startRoom) ?? layouts[startFloor].spawn);
  } else {
```

with

```ts
  } else if (startFloor && startFloor !== "L1" && READY_FLOORS.includes(startFloor)) {
    place(startFloor, doorOf(startFloor, startRoom) ?? layouts[startFloor].spawn);
  } else if (startRoom && floorOf(startRoom) === "L1") {
    // `/{locale}#highlights-<station>`: start on the station's door pad, then open it below.
    place("L1", doorOf("L1", startRoom) ?? layouts.L1.spawn);
  } else {
```

and replace the `hasPage` memo with:

```ts
  const hasPage = useMemo(() => {
    const hosted = new Set(data.library.posts.filter((p) => !p.url).map((p) => `L4:${p.slug}`));
    // Highlights Hall stations have no route of their own: they keep /{locale} and live in the history entry.
    return (room: RoomId) => !isHighlightRoom(room) && (!room.startsWith("L4:") || hosted.has(room));
  }, [data.library.posts]);
```

(and update the comment above it to "On L4 only hosted posts have their own route (/blog/{slug}); shelves, Medium posts and the L1 Highlights Hall stations keep the floor URL.").

- [ ] **Step 6: Run the tests**

Run: `bunx vitest run tests/unit/highlights-data.test.ts tests/unit/intro-session.test.ts tests/unit/drawer-url.test.ts`
Expected: PASS.

Run: `bun run build && bunx playwright test e2e/highlights.spec.ts e2e/boot-first.spec.ts --reporter=list`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add src/experience/floors/lobby/stations.ts src/experience/ExperienceGate.tsx src/experience/Experience.tsx tests/unit/highlights-data.test.ts tests/unit/intro-session.test.ts e2e/highlights.spec.ts
rtk git commit -m "feat(highlights): #highlights deep links open a station at its door"
```

---

### Task 11: Register the stations as point-and-go targets

**Files:**
- Create: `src/experience/floors/lobby/hallInteract.ts`
- Modify: `src/experience/floors/lobby/HighlightsHall.tsx` (registration)
- Test: `tests/unit/hall-interact.test.ts`

**Interfaces:**
- Consumes (R4-I, `src/experience/interact/registry.ts`): `Interactable` (`label` is one resolved string), `InteractData`, `InteractLabels`, `interactablesFor(floor, layouts, data)`, `registerExtraInteractables(floor, items): () => void`; `padHalf(door)` (`nav/doors.ts`); `HALL_LAYOUT`, `HALL`, `HighlightsHallLayout` (Task 7); `HallLabels.stations` (Task 8); `roomTarget` (`missions/host3d.ts`).
- Produces: `highlightsInteractables(hall: HighlightsHallLayout, labels: Record<HighlightStation, string>): Interactable[]` with ids `L1:station:highlights-about|projects|experience|contact` (the registry's `${floor}:${short kind}:${key}` rule, like `L1:station:profile`), kind `station`, `at` the door pad (= `roomTarget`), `bounds` the station footprint plus its door pad, `height` `HALL.panel.h`, action `{ type: "open-room", room }`. `HighlightsHall` registers them while L1 is mounted and disposes them on unmount.

- [ ] **Step 1: Write the failing test**

`tests/unit/hall-interact.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { highlightsInteractables } from "@/experience/floors/lobby/hallInteract";
import { HALL, HALL_LAYOUT } from "@/experience/floors/lobby/hallLayout";
import { HIGHLIGHT_STATIONS } from "@/experience/floors/lobby/stations";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { interactablesFor, registerExtraInteractables, type InteractData, type InteractLabels } from "@/experience/interact/registry";
import { roomTarget } from "@/experience/missions/host3d";
import en from "../../messages/en.json";

const names = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const experience = buildExperienceData("en", names);
const layouts = buildFloorLayouts(experience.years.length, {
  labs: experience.labs.pods,
  career: careerLayoutInput(experience.career),
  library: libraryLayoutInput(experience.library),
});
const labels: InteractLabels = {
  elevator: en.hud.pads.floorTitle,
  teleporter: (year) => en.hud.interact.teleporter.replace("{year}", String(year)),
  kiosk: en.hud.launcher.askRover,
  board: (wing) => en.hud.interact.board.replace("{wing}", wing),
  archive: en.hud.interact.archive,
  rooms: en.hud.rooms,
};
const data: InteractData = { experience, labels };
const stationNames = {
  about: en.hud.rooms.highlightsAbout,
  projects: en.hud.rooms.highlightsProjects,
  experience: en.hud.rooms.highlightsExperience,
  contact: en.hud.rooms.highlightsContact,
};
const items = highlightsInteractables(HALL_LAYOUT, stationNames);
let dispose: (() => void) | null = null;
afterEach(() => {
  dispose?.();
  dispose = null;
});

describe("Highlights Hall point-and-go targets", () => {
  it("are four L1 stations that open their room from the door pad", () => {
    expect(items.map((i) => i.id)).toEqual(HIGHLIGHT_STATIONS.map((s) => `L1:station:highlights-${s}`));
    items.forEach((item, i) => {
      const s = HALL_LAYOUT.stations[i];
      expect(item).toMatchObject({ floor: "L1", kind: "station", label: stationNames[s.station], height: HALL.panel.h, action: { type: "open-room", room: s.room } });
      expect(item.at).toEqual(roomTarget(undefined, s.room, layouts, experience.years));
      // The footprint covers the panel and the door pad, so pointing at either picks the station.
      expect(item.bounds.minX).toBeLessThanOrEqual(Math.min(s.rect.minX, s.pad.x));
      expect(item.bounds.maxX).toBeGreaterThanOrEqual(Math.max(s.rect.maxX, s.pad.x));
      expect(item.bounds.minZ).toBeLessThanOrEqual(Math.min(s.rect.minZ, s.pad.z));
      expect(item.bounds.maxZ).toBeGreaterThanOrEqual(Math.max(s.rect.maxZ, s.pad.z));
      expect(item.bounds.maxX).toBeLessThanOrEqual(layouts.L1.bounds.maxX);
      expect(item.bounds.maxZ).toBeLessThanOrEqual(layouts.L1.bounds.maxZ);
    });
  });

  it("join the L1 registry next to the built-ins, once each, until disposed", () => {
    dispose = registerExtraInteractables("L1", items);
    const l1 = interactablesFor("L1", layouts, data);
    for (const item of items) expect(l1.filter((i) => i.id === item.id)).toEqual([item]);
    expect(l1.map((i) => i.id)).toEqual(expect.arrayContaining(["L1:pad:elevator", "L1:station:profile", "L1:station:skills", "L1:kiosk:ask-rover"]));
    // The hall's doors never come back as built-in door targets (no duplicate target per station).
    expect(l1.some((i) => i.id.startsWith("L1:door:"))).toBe(false);
    dispose();
    dispose = null;
    expect(interactablesFor("L1", layouts, data).some((i) => i.id.startsWith("L1:station:highlights-"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bunx vitest run tests/unit/hall-interact.test.ts`
Expected: FAIL with "Failed to resolve import "@/experience/floors/lobby/hallInteract"".

- [ ] **Step 3: Create `src/experience/floors/lobby/hallInteract.ts`**

```ts
import type { Interactable } from "../../interact/registry";
import { padHalf } from "../../nav/doors";
import type { Rect } from "../../types";
import { HALL, type HallStation, type HighlightsHallLayout } from "./hallLayout";
import type { HighlightStation } from "./stations";

/** The station panel plus its door pad (doors face along x or z), so pointing at either picks it. */
function stationBounds(s: HallStation): Rect {
  const { along, across } = padHalf({ room: s.room, at: s.pad, facing: s.facing });
  const hx = Math.abs(s.facing.x) * along + Math.abs(s.facing.z) * across;
  const hz = Math.abs(s.facing.z) * along + Math.abs(s.facing.x) * across;
  return {
    minX: Math.min(s.rect.minX, s.pad.x - hx),
    maxX: Math.max(s.rect.maxX, s.pad.x + hx),
    minZ: Math.min(s.rect.minZ, s.pad.z - hz),
    maxZ: Math.max(s.rect.maxZ, s.pad.z + hz),
  };
}

/**
 * The four Highlights Hall stations as point-and-go targets (R4-I registry): a click drives along the
 * hall road to the door pad and opens the station's drawer. `labels` are the resolved station names.
 */
export function highlightsInteractables(hall: HighlightsHallLayout, labels: Record<HighlightStation, string>): Interactable[] {
  return hall.stations.map(
    (s): Interactable => ({
      id: `L1:station:${s.room.slice(3)}`,
      floor: "L1",
      kind: "station",
      label: labels[s.station],
      at: { x: s.pad.x, z: s.pad.z },
      bounds: stationBounds(s),
      height: HALL.panel.h,
      action: { type: "open-room", room: s.room },
    }),
  );
}
```

- [ ] **Step 4: Register them from the hall**

In `src/experience/floors/lobby/HighlightsHall.tsx`, add the imports

```ts
import { registerExtraInteractables } from "../../interact/registry";
import { highlightsInteractables } from "./hallInteract";
```

(`useEffect` is already imported) and as the first statement after `const reducedMotion = ...` add:

```ts
  // Point-and-go: the stations are registry targets while L1 is mounted (the hall has no click handlers of its own).
  useEffect(() => registerExtraInteractables("L1", highlightsInteractables(HALL_LAYOUT, labels.stations)), [labels.stations]);
```

(`registerExtraInteractables` returns its dispose function, which the effect returns.)

- [ ] **Step 5: Run the tests, including the registry's own**

Run: `bunx vitest run tests/unit/hall-interact.test.ts tests/unit/interact-registry.test.ts tests/unit/interact-pick.test.ts`
Expected: PASS.

Run: `bun run build && bunx playwright test e2e/interact.spec.ts e2e/highlights.spec.ts --reporter=list`
Expected: PASS (R4-I's own point-and-go spec still passes with the extra L1 targets).

- [ ] **Step 6: Commit**

```bash
rtk git add src/experience/floors/lobby/hallInteract.ts src/experience/floors/lobby/HighlightsHall.tsx tests/unit/hall-interact.test.ts
rtk git commit -m "feat(highlights): the four stations are point-and-go targets"
```

---

### Task 12: End-to-end coverage (point-and-go stations, cards, live links, Quick tour, Cmd-K, deep link, static anchors, budget)

**Files:**
- Modify (rewrite): `e2e/highlights.spec.ts`

**Interfaces:**
- Consumes: everything above; `stationOf` (Task 7), `highlightRoom` (Task 4), `pickFeaturedPods`, `orderPods`, `podLiveLink`; e2e helpers `enterHQ`, `driveTo` (setup drives only; visitors point and go), `waitForRoom`, `waitForFloor`, `snapshot`, `expectRenderBudget`, `openPage`, `asReturningVisitor`, `waitForHQ`, `waitForPhase`, `waitForSceneLive`, `waitForCameraSettle`, `waitForRoverMove`, `collectErrors`, and R4-I's `interactablesOf`, `targetPoint`, `hoveredTarget`.
- Produces: `L1_MAX_DRAW_CALLS = 140` (the hall's headroom rule) and the e2e contract for the hall.

- [ ] **Step 1: Replace `e2e/highlights.spec.ts` with the full spec**

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import content from "../content/site-content.json";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { pickFeaturedPods } from "../src/content/pageview";
import type { Pod } from "../src/content/schema";
import { orderPods, podLiveLink } from "../src/content/selectors";
import { stationOf } from "../src/experience/floors/lobby/hallLayout";
import { highlightRoom, type HighlightStation } from "../src/experience/floors/lobby/stations";
import {
  asReturningVisitor,
  collectErrors,
  driveTo,
  enterHQ,
  expectRenderBudget,
  hoveredTarget,
  interactablesOf,
  openPage,
  snapshot,
  targetPoint,
  waitForCameraSettle,
  waitForFloor,
  waitForHQ,
  waitForPhase,
  waitForRoom,
  waitForRoverMove,
  waitForSceneLive,
} from "./hq";

/**
 * L1 Highlights Hall (docs/superpowers/plans/2026-10-12-highlights-hall.md): the passage past the
 * certification wall, the four stations as point-and-go targets and their drawers, cards that ride to
 * L3 and L2, live links, the Quick tour (Ask Rover and Cmd-K), the #highlights deep link, the static
 * anchors and the render budget. Expectations come from the dataset, never from slugs or counts.
 */
test.describe.configure({ timeout: 180_000 });

/** Headroom under the 150-call floor budget (`RENDER_BUDGET` in e2e/hq.ts): the Lobby is the busiest floor. */
const L1_MAX_DRAW_CALLS = 140;
const STATIONS: readonly HighlightStation[] = ["about", "projects", "experience", "contact"];
const tour = content.missions.find((m) => m.id === "highlights")!;
const featured = pickFeaturedPods(orderPods(content.floors.labs.pods as unknown as Pod[]));
const roles = content.floors.careerArchive.entries.filter((e) => e.type === "job" || e.type === "freelance");
const NAMES: Record<HighlightStation, string> = {
  about: en.hud.rooms.highlightsAbout,
  projects: en.hud.rooms.highlightsProjects,
  experience: en.hud.rooms.highlightsExperience,
  contact: en.hud.rooms.highlightsContact,
};
/** The station's point-and-go id (R4-I registry, Task 11). */
const target = (station: HighlightStation) => `L1:station:highlights-${station}`;

async function expectRoverNear(page: Page, point: { x: number; z: number }, tolerance = 1.5) {
  const { rover } = await snapshot(page);
  expect(Math.hypot(rover.x - point.x, rover.z - point.z)).toBeLessThan(tolerance);
}

/** Setup only: parks 2.5 u in front of a station's pad, inside its camera zone (the follow camera turns to face the panel). */
async function faceStation(page: Page, station: HighlightStation) {
  const drawer = page.getByTestId("room-drawer");
  if (await drawer.count()) {
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
  }
  const s = stationOf(station);
  await driveTo(page, { x: s.pad.x - s.facing.x * 2.5, z: s.pad.z - s.facing.z * 2.5 });
  await waitForCameraSettle(page);
}

/** Point and go: click the glowing panel; the rover drives to the door pad along the road and the drawer opens. */
async function openStation(page: Page, station: HighlightStation) {
  await faceStation(page, station);
  const start = (await snapshot(page)).rover;
  const point = await targetPoint(page, target(station), 0.5);
  await page.mouse.click(point.x, point.y);
  await waitForRoverMove(page, start, 1);
  await waitForRoom(page, highlightRoom(station));
  await expectRoverNear(page, stationOf(station).pad);
  return page.getByTestId("room-drawer");
}

test.describe("Highlights Hall", () => {
  test("the four stations are point-and-go targets; pointing at one highlights it with its name", async ({ page }) => {
    await enterHQ(page);
    await faceStation(page, "about");
    const items = await interactablesOf(page);
    for (const station of STATIONS) {
      const item = items.find((i) => i.id === target(station));
      expect(item, station).toMatchObject({ kind: "station", label: NAMES[station], action: { type: "open-room", room: highlightRoom(station) } });
      expect(item!.at).toEqual(stationOf(station).pad);
    }
    const point = await targetPoint(page, target("about"), 0.5);
    await page.mouse.move(point.x, point.y, { steps: 4 });
    await expect.poll(() => hoveredTarget(page)).toEqual({ id: target("about"), via: "pointer" });
    await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe("pointer");
  });

  test("clicking each station drives there along the road and opens its drawer", async ({ page, context }) => {
    const errors = collectErrors(page);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await enterHQ(page);

    let drawer = await openStation(page, "about");
    await expect(drawer.getByTestId("metric")).toHaveCount(4);
    await expect(drawer).toContainText(content.profile.name);

    drawer = await openStation(page, "projects");
    const cards = drawer.getByTestId("highlight-card");
    await expect(cards).toHaveCount(featured.length);
    expect(await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-room")))).toEqual(featured.map((p) => `L3:${p.slug}`));
    const live = featured.map((p) => podLiveLink(p)?.href).filter((href): href is string => Boolean(href));
    await expect(drawer.getByTestId("highlight-live")).toHaveCount(live.length);
    for (const [i, href] of live.entries()) {
      const link = drawer.getByTestId("highlight-live").nth(i);
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("target", "_blank");
    }

    drawer = await openStation(page, "experience");
    await expect(drawer.getByTestId("highlight-card")).toHaveCount(roles.length);
    await expect(drawer.getByRole("heading", { name: en.common.type.job })).toBeVisible();
    await expect(drawer.getByRole("heading", { name: en.common.type.freelance })).toBeVisible();

    drawer = await openStation(page, "contact");
    await drawer.getByRole("button", { name: en.drawer.rooms.copyEmail }).click();
    await expect(drawer.getByRole("status")).toHaveText(en.drawer.rooms.copied);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(content.floors.roof.contact.email);
    await expect(drawer.getByTestId("cv-view")).toBeVisible();
    const axe = await new AxeBuilder({ page }).include("[data-testid='room-drawer']").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("a project card rides to L3 and opens its pod", async ({ page }) => {
    await enterHQ(page);
    const drawer = await openStation(page, "projects");
    await drawer.getByTestId("highlight-card").first().click();
    await waitForFloor(page, "L3");
    await waitForRoom(page, `L3:${featured[0].slug}`);
  });

  test("a role card rides to L2 and opens its career room", async ({ page }) => {
    await enterHQ(page);
    const drawer = await openStation(page, "experience");
    const card = drawer.getByTestId("highlight-card").first();
    const room = (await card.getAttribute("data-room"))!;
    expect(room.startsWith("L2:")).toBe(true);
    await card.click();
    await waitForFloor(page, "L2");
    await waitForRoom(page, room);
  });

  test("Quick tour from Ask Rover visits the four stations in order; L1 never shows the walk prompt", async ({ page }) => {
    const errors = collectErrors(page);
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite&walk=on");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    // Proving that nothing happens: other floors show their prompt 700 ms after arrival.
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("walk-prompt")).toHaveCount(0);
    await expect(page.getByTestId("walk-launcher").getByRole("button", { name: new RegExp(en.walk.highlights.start) })).toBeVisible();

    await page.getByTestId("hud").getByRole("button", { name: "Ask Rover", exact: true }).click();
    await page.getByRole("dialog", { name: "Ask Rover" }).getByRole("option", { name: tour.label.en }).click();
    const bar = page.getByTestId("walk-bar");
    await expect(page.getByTestId("walk-counter")).toContainText("Stop 1 of 4");
    await expect(bar).toHaveAttribute("data-stop", highlightRoom("about"));
    await waitForRoom(page, highlightRoom("about"));
    for (const [i, station] of STATIONS.slice(1).entries()) {
      await page.keyboard.press("]");
      await expect(page.getByTestId("walk-counter")).toContainText(`Stop ${i + 2} of 4`);
      await waitForRoom(page, highlightRoom(station));
      await expectRoverNear(page, stationOf(station).pad);
    }
    expect(errors).toEqual([]);
  });

  test("Cmd-K finds the Quick tour and starts it", async ({ page }) => {
    await enterHQ(page);
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox")).toBeFocused();
    await page.keyboard.type("quick tour");
    await expect(page.getByRole("option", { name: new RegExp(tour.label.en) }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("walk-bar")).toHaveAttribute("data-stop", highlightRoom("about"));
    await waitForRoom(page, highlightRoom("about"));
  });

  test("a #highlights-<station> link on the landing opens that station at its door", async ({ page }) => {
    const errors = collectErrors(page);
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite#highlights-contact");
    await waitForHQ(page);
    await waitForRoom(page, highlightRoom("contact"));
    await expectRoverNear(page, stationOf("contact").pad);
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    await expect(page).toHaveURL(/\/en\?tier=lite/);
    expect(errors).toEqual([]);
  });

  test("speaks Indonesian", async ({ page }) => {
    await enterHQ(page, { path: "/id" });
    const drawer = await openStation(page, "experience");
    await expect(drawer.getByRole("heading", { name: id.common.type.job })).toBeVisible();
    await expect(drawer).toContainText(id.hall.openRole);
  });

  test("the static tier maps every station to a landing section", async ({ page }) => {
    await openPage(page, "/en?tier=static");
    for (const anchor of ["#intro", "#work", "#journey", "#contact"]) await expect(page.locator(anchor)).toHaveCount(1);
  });

  for (const tier of ["lite", "full"] as const) {
    test(`L1 keeps headroom under the floor budget from the plaza to the hall (${tier})`, async ({ page }) => {
      await enterHQ(page, { tier });
      const spots = [null, { x: 20, z: 15 }, { x: 34, z: 13 }, stationOf("projects").pad, stationOf("experience").pad];
      for (const spot of spots) {
        if (spot) {
          if (await page.getByTestId("room-drawer").count()) await page.keyboard.press("Escape");
          await driveTo(page, spot);
        }
        await page.waitForTimeout(1500);
        await expectRenderBudget(page);
        const { drawCalls, triangles } = await snapshot(page);
        console.log(`L1 ${tier} at ${spot ? `(${spot.x}, ${spot.z})` : "spawn"}: ${drawCalls} calls, ${triangles} triangles`);
        expect(drawCalls).toBeLessThanOrEqual(L1_MAX_DRAW_CALLS);
      }
    });
  }

  test("reduced motion: the hall renders still and inside the budget", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enterHQ(page);
    expect(await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { reducedMotion: boolean } } } }).__hq.store.getState().reducedMotion)).toBe(true);
    await driveTo(page, { x: 34, z: 13 });
    await page.waitForTimeout(1500);
    await expectRenderBudget(page);
    expect((await snapshot(page)).drawCalls).toBeLessThanOrEqual(L1_MAX_DRAW_CALLS);
  });
});
```

- [ ] **Step 2: Build and run the spec**

Run: `bun run build && bunx playwright test e2e/highlights.spec.ts --reporter=list`
Expected: all tests PASS; the budget tests print the L1 numbers per spot. Copy them into the PR description "Budget" section next to the Task 1 baseline.

If a budget test fails above 140 calls: the printed spot tells where. In the hall, check that `MergedEdges`, `MergedBoxes` and `BatchedLabels` each appear once in the R3F tree (React DevTools, or `__hq` + `renderer.info`); on the plaza, re-check Task 8 Step 9 (the skills wall must be one `BatchedLabels`).

- [ ] **Step 3: Run the specs this branch touches**

Run: `bun run e2e:changed`
Expected: PASS (it maps the changed paths to `experience`, `highlights`, `walk`, `missions`, `hud`, `pageview`, `static-routes` and the drawer specs).

- [ ] **Step 4: Commit**

```bash
rtk git add e2e/highlights.spec.ts
rtk git commit -m "test(highlights): e2e for stations, cards, Quick tour, deep link and the L1 budget"
```

---

### Task 13: Screenshots at the review sizes and the L1 picker thumbnail

**Files:**
- Modify: `e2e/screenshots.spec.ts`
- Regenerate: `public/floors/L1.webp`

**Interfaces:**
- Consumes: `stationOf` (Task 7); `open3D`, `shot`, `L4_VIEWPORTS` (1440x900, 834x1112, 390x844) in `e2e/screenshots.spec.ts`; `bun run floor:thumbs` (needs `cwebp`).
- Produces: `screenshots/hq-l1-plaza-*.png`, `hq-l1-hall-*.png`, `hq-l1-projects-*.png` (gitignored, for the PR) and the committed picker thumbnail.

- [ ] **Step 1: Add the hall captures**

In `e2e/screenshots.spec.ts`, add `import { stationOf } from "../src/experience/floors/lobby/hallLayout";` and, after the `FLOOR_THUMBS` loop, add:

```ts
/** L1 at the owner's review sizes: the plaza (title under the top bar), the view into the Highlights Hall, and the projects station with its drawer. */
for (const viewport of L4_VIEWPORTS) {
  test(`3D hq-l1-hall @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await open3D(browser, viewport);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: shot("hq-l1-plaza", viewport) });
    await driveTo(page, { x: 34, z: 13 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: shot("hq-l1-hall", viewport) });
    await driveTo(page, stationOf("projects").pad);
    await waitForRoom(page, "L1:highlights-projects");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot("hq-l1-projects", viewport) });
    await context.close();
  });
}
```

- [ ] **Step 2: Capture and review**

Run: `bun run build && SCREENSHOTS=1 bunx playwright test e2e/screenshots.spec.ts -g "hq-l1-hall|3D lobby" --workers=1`
Expected: PASS; nine `screenshots/hq-l1-*` PNGs plus the existing `3D lobby` captures. Check: at 1440x900 the name and headline sit fully below the top bar; on 834x1112 and 390x844 the panels read and the walk pill does not cover them; the certification wall still faces the plaza with nothing in front of it.

- [ ] **Step 3: Regenerate the L1 picker thumbnail**

Run: `bun run build && bun run floor:thumbs`
Expected: five `public/floors/*.webp` lines with sizes. Keep only L1 (the other floors did not change; SwiftShader output is not byte-stable):

```bash
git checkout -- public/floors/L2.webp public/floors/L3.webp public/floors/L4.webp public/floors/RF.webp
```

Run: `bunx vitest run tests/content` (the asset tests check thumbnail size and format)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add e2e/screenshots.spec.ts public/floors/L1.webp
rtk git commit -m "test(highlights): hall captures at 1440x900, 834x1112 and 390x844; refresh the L1 thumbnail"
```

---

### Task 14: Docs, full verification and the PR

**Files:**
- Modify: `README.md`, `AGENTS.md`, `docs/superpowers/specs/agent-hq/01-world-and-layout.md`

**Interfaces:**
- Consumes: everything above.
- Produces: docs that match the code; one PR.

- [ ] **Step 1: README**

In the roadmap table, after the row `| Walkable floors 3 | ... | Done |`, add:

```
| Highlights Hall | L1 summary behind the certifications wall: about me, top 3 projects, work experience (employment and freelance), contact; the "Quick tour" walk | Done |
```

Append to the paragraph that starts "On L1 (Lobby) the stats ring, ...":

```
Behind the certifications wall, a road past its south end leads into the **Highlights Hall**, a short walk-through summary of the tower: about me (name, headline, four big numbers, the one-line intro), the top 3 projects with screenshots (the same three as the landing), work experience split into Employment and Freelance (newest first; a card rides to the role on L2) and contact (email with copy, channels, the CV viewer, availability). Point at a station and click (or tap twice) to drive there and open its drawer; a project with a public site shows **Visit live site**. **Quick tour** (Ask Rover, Cmd-K or the launcher pill) drives through all four. `/{locale}#highlights` or `/{locale}#highlights-<about|projects|experience|contact>` opens a station directly.
```

In the routes table, in the `/{locale}` row, append before the final `|`: ` In 3D, the Lobby and the Highlights Hall (`#highlights-<station>` opens a station).`

- [ ] **Step 2: AGENTS.md**

Make these edits (each keeps the surrounding style; no em dashes):

1. Folder layout, under `experience/floors/roof/ ...`, add:

```
  experience/floors/lobby/      L1: pure layout.ts (Lobby elements, CERT_WALL, TITLE_TOP), stations.ts (Highlights Hall ids, deep-link hash, experienceRows; type-only imports, the gate uses it), hallLayout.ts (HALL, buildHighlightsHall, HALL_LAYOUT), hallContent.ts (merged solids, labels, screenshot atlas) plus R3F walls, kiosk, HighlightsHall and hallInteract.ts
```

2. Folder layout, the `e2e/` line: insert `Highlights Hall (highlights.spec.ts: point-and-go stations, cards, live links, Quick tour, deep link, L1 budget), ` after `Library + Roof (library-roof.spec.ts), `.

3. "Missions and HUD", the sentence "Room ids beyond pods, career entries and posts: `L1:profile`, ..." : add `L1:highlights-about`, `L1:highlights-projects`, `L1:highlights-experience`, `L1:highlights-contact` (kind `highlights`; static paths are landing anchors `/#intro`, `/#work`, `/#journey`, `/#contact`).

4. "Content access", schema additions: change "`{ kind: "walk", walk }` (`WalkIdSchema`: `journey`, `projects`, `writing`; ..." to list `highlights` too, and add after the `blog` mission sentence: "The `highlights` mission ("Quick tour: the highlights") is `elevator L1` then `walk highlights`; on the static tier it opens `/{locale}` (the landing is the summary). The Rover Terminal lists up to 9 missions (keys 1 to 9)." Also add `ExperienceData.highlights` (`projects` from `pickFeaturedPods`) and `RoomView.cards` (`RoomCard`) to the documented additions.

5. "3D experience", add a bullet after the L1 certification wall bullet:

```
- L1 Highlights Hall (owner request, October 2026; `floors/lobby/hallLayout.ts`): the Lobby slab runs to x = 64. A lead road leaves the plaza south of the certification wall (z = 15; the wall stays untouched and readable from the plaza) into a 24 x 26 u plaza with four stations flush with the slab edges: about me (north-west), top projects (north-east), work experience (east), contact (south), rooms `L1:highlights-*`, each with a door pad 1.1 u in front and a camera zone that faces it. `FloorLayout.roadZone` limits the L1 road to drives into or out of the hall (`routeUsesRoad`), so Lobby trips keep the navgrid. The scenery (`HighlightsHall.tsx`) is the road markings, one merged mesh and one edge mesh (`MergedBoxes`, `MergedEdges` from the roof kit), one `BatchedLabels` and one screenshot atlas mesh that loads once the rover is east of x = 18 (`shouldLoadShots`); nothing animates. The skills wall text is one `BatchedLabels` too, which pays for the hall. `e2e/highlights.spec.ts` caps L1 at 140 draw calls from the plaza to the hall on both tiers. Projects come from `pickFeaturedPods` (the landing's three), experience from timeline entries of type `job` and `freelance`, newest first (`highlightEntries`, `experienceRows`). `/{locale}#highlights(-<station>)` opens a station (`gateStartRoom` in the gate); an open station keeps `/{locale}` (`hasPage` false). The stations are point-and-go targets `L1:station:highlights-<station>` (kind `station`, `open-room`), registered by `HighlightsHall` with `registerExtraInteractables` (`hallInteract.ts`); the registry's L1 built-ins do not derive targets from L1 doors. The work experience columns use the career type labels (`common.type.job` "Employment", `common.type.freelance`), and a project with `podLiveLink` gets "Visit live site" (a tag in 3D, a `LiveSiteLink` in the drawer).
```

6. "Walkable floors: road kit and guided walks": change "`WALK_FLOORS` (`src/experience/config.ts`, now `["L2", "L3", "L4", "RF"]`)" to "`WALK_FLOORS` (`src/experience/config.ts`, now `["L1", "L2", "L3", "L4", "RF"]`; floors in `NO_WALK_PROMPT`, today `["L1"]`, never show the first-visit prompt, only the launcher pill)", add `highlightsWalk` ("Quick tour": the four stations, no filters) to the list of walk definitions, and add "`FloorLayout.roadZone` limits a floor's road to drives that start or end inside it." to the road kit bullet.

7. "Glass Drawer": add "`highlights` uses `HighlightsBody` (cards from `RoomView.cards` ride to their room with `goToRoom`; the contact station reuses `ContactBody` and `CvBody` from `RoofBody`); the shared blocks (`MetricTiles`, `Sections`, `Chips`) live in `hud/drawer/blocks.tsx`." after the `roof` body sentence.


8. "3D experience", after the Highlights Hall bullet add:

```
- L1 Ask Rover kiosk (`floors/lobby/kiosk.ts`, owner review "the line is not straight"): body, stand and screen are one group turned by one yaw (`KIOSK.yaw`, square to the grid, facing east toward the default follow camera); the screen is centered on the body and only tilts back; lines never wrap (`kioskFontSize` fits the longest line, `fitLine` ends longer ones in "..."). The footprint `LOBBY.kiosk` (x 1 to 3, z 17.6 to 21) touches the south slab edge, and the point-and-go stop `kioskStop()` sits centered in front of the screen. `tests/unit/kiosk.test.ts` checks the shared yaw and the centering.
```

- [ ] **Step 3: Appendix 01**

In `docs/superpowers/specs/agent-hq/01-world-and-layout.md`, section 2: replace the footprint sentence's start "Footprint: 52 × 42 u, x from -24 to 28 and z from -21 to 21." with "Footprint: 88 × 42 u, x from -24 to 64 and z from -21 to 21 (the plaza ends at x = 28; the Highlights Hall fills x 28 to 64)." and add rows to the element table:

```
| Highlights Hall lead road | (14, 15) to (36, 15), 8 u wide | | Passes the certification wall's south end; floor sign "Highlights Hall" at (22, 15) |
| Highlights Hall plaza | (46, 3) | 24 × 26 | Open floor; spurs to the four stations |
| About me station | x 32 to 42, z -21 to -18 | 10 × 3, panel 6 u tall | Name, headline, the first four stats, the one-line intro; room `L1:highlights-about` |
| Top projects station | x 48 to 64, z -21 to -18 | 16 × 3 | The landing's three featured projects with screenshots; room `L1:highlights-projects` |
| Work experience station | x 61 to 64, z -8 to 10 | 3 × 18 | Employment and Freelance columns, newest first, six rows each; room `L1:highlights-experience` |
| Contact station | x 40 to 54, z 18 to 21 | 14 × 3 | Availability, email, channels, CV hint; room `L1:highlights-contact` |
```

- [ ] **Step 4: Em dash scan and full local verification**

Run: `rg -n "\x{2014}" README.md AGENTS.md docs src tests e2e messages content scripts` (expect no output; the pattern is the em dash code point, so this plan never contains the character itself), then `bun run verify:quick`, then `bun run e2e:changed`.
Expected: no em dashes; all green.

- [ ] **Step 5: Commit the docs**

```bash
rtk git add README.md AGENTS.md docs/superpowers/specs/agent-hq/01-world-and-layout.md
rtk git commit -m "docs: L1 Highlights Hall, Quick tour, deep links, the kiosk and the L1 budget"
```

- [ ] **Step 6: Push and open the PR**

Write the PR body to `screenshots/pr-body.md` (the folder is gitignored):

```markdown
## L1 Highlights Hall

Owner request: a summary place on the 1st floor, at the back, with WOW about me, the top 3 projects, work experience (freelance, full time) and contacts, because five floors are a lot to explore.

- The Lobby slab grows east (x 28 to 64). A road past the south end of the certifications wall (which stays untouched and readable from the plaza) leads into the Highlights Hall: four stations, each a Glass Drawer room.
  1. About me: name, headline, four big numbers (the first stats, live facts included), the one-line intro.
  2. Top 3 projects: the landing's featured projects (`pickFeaturedPods`), screenshots in 3D (one lazy atlas) and in the drawer; a card rides to the pod on L3.
  3. Work experience: Employment and Freelance (the career type labels), newest first; a card rides to the role on L2.
  4. Contact: email with copy, channels, the CV viewer, availability.
- Quick tour: a four-stop guided walk, from Ask Rover ("Quick tour: the highlights"), Cmd-K or the launcher pill. No first-visit prompt on L1 (the onboarding will introduce the hall).
- Deep links: `/{locale}#highlights` and `/{locale}#highlights-<station>`; the static tier maps each station to its landing section.
- Point-and-go: the four stations are registry targets (`L1:station:highlights-*`); a click drives along the road and opens the drawer.
- Top projects show "Visit live site" where `podLiveLink` has a public site (R4-J).
- Ask Rover kiosk: body, stand and screen are one straight unit facing the camera; lines no longer wrap; it touches the south slab edge. Before/after pairs below.
- The floating Lobby title is lower and smaller, so it clears the top bar at 1440x900.

## Budget

L1 before (Task 1 probe): <paste the two lines>
L1 after (highlights.spec budget tests): <paste the lines>; cap 140 (floor budget 150).

## Screenshots

`screenshots/hq-l1-plaza|hall|projects-{1440x900,834x1112,390x844}.png` (attached).

Kiosk before / after (Task 3): `screenshots/kiosk-before/hq-l1-kiosk-*.png` next to `screenshots/kiosk-after/hq-l1-kiosk-*.png`, one pair per size.

## Checks

`bun run verify:quick`, `bun run e2e:changed` green locally.
```

Then:

```bash
rtk git push -u origin feat/l1-highlights-hall
gh pr create --title "L1 Highlights Hall: summary stations behind the certifications wall and the Quick tour" --body-file screenshots/pr-body.md --label screenshots
```

Attach the nine `hq-l1-plaza|hall|projects` PNGs and the three kiosk before/after pairs to the PR. Do not merge: the owner reviews.

---

## Risks and open questions

- **Registry and live-link contracts.** Everything here builds on R4-I (registry, `L1:station:*` ids, `registerExtraInteractables` returning a disposer, `label` as one string, built-ins without L1 door targets) and R4-J (`podLiveLink`, `LabPod.liveUrl`, `LiveSiteLink`, `common.visitLive`). Task 1 stops if either is missing. If R4-I later derives door targets on L1, the hall would get a second target per station; `tests/unit/hall-interact.test.ts` fails on any `L1:door:` id.
- **L1 draw calls.** The hall adds about 10 calls (road markings 4, solids 1, edges 1, text 1, screenshots 1, door glow 1 to 2); batching the skills wall saves 8. The real numbers depend on SwiftShader and the camera; Task 1 records the baseline and Task 12 enforces 140.
- **Title height vs. 1280x720.** The title projects at about 85 px at 1440x900 but about 68 px at 1280x720, still close to the top bar there; going lower would put it into the stats tiles or the monogram (both top out at 5.85). The tests pin 1440x900 as requested.
- **"Employment" covers more than full-time.** The data type is `job`, which includes internships and contract roles; the station uses the career type label "Employment" (owner follow-up), the same as the L2 icons, never "Full-time".
- **Tower frame and intro shot.** `Tower` frames L1, L3, L4 and RF; if L3's slab ends west of x = 64, the frame (and the exterior intro shot) widens a little. Check the `3D boot` screenshot.
- **Terminal order.** The Quick tour takes key 3; `hire` moves from 5 to 6 (e2e updated). Anyone relying on the old key numbers in docs or habits sees a shift.
- **HTML size.** `ExperienceData.highlights` adds well under 1 KB to every gated page's inlined props (three projects: slug, title, wing, thumbnail), far below the 80 KB document budget; live links and station names are not duplicated in it.
- **Kiosk move touches R4-I's file.** Task 3 edits `registry.ts` (`kioskStop()`, height 3.4) and possibly `PICK_HEIGHT.kiosk` in `pick.ts`; R4-I's tests must stay green. The kiosk faces east now: from the far west of the plaza it reads at an angle, which the owner can review in the before/after captures.
- **Content in flight.** R4-K adds the Serupa pod and the `serupa-2025` entry, and R4-J re-tiers pods; the top three and the experience lists can change with them. Nothing in code or tests names a slug, org or count beyond the "top 3" rule, so these land without plan changes (screenshots will differ).
- **Dev certs prototype.** `CertsWorld` draws `LOBBY.bounds`, so the dev-only certs harness shows the longer slab; it is never exported.

## Self-review

- **Spec coverage.** Hall east of the cert wall with a passage (Task 7, south end, wall untouched); four stations in order with drawer bodies and in-world displays (Tasks 5, 6, 8); WOW about me with 3 to 4 numbers from stats and live facts (Tasks 5, 8); top 3 projects with the landing selector and lazy screenshot textures within budget (Tasks 4, 5, 8); "Visit live site" through `podLiveLink` in the drawer and in 3D (Tasks 5, 6, 8, 12); experience split "Employment" and "Freelance" with the career type labels, newest first, cards to L2 rooms (Tasks 4, 5, 6); contacts with copy, channels, CV viewer, availability (Tasks 5, 6); room ids (Task 4); point-and-go stations with the registry's exact shapes and ids (Task 11) and e2e that click stations instead of moving by click (Task 12); Quick tour walk on L1 without the generic prompt, from Ask Rover and Cmd-K (Task 9); space rules with real content (Task 7); render budget with headroom, tiers, reduced motion (Tasks 8, 12); EN/ID (Tasks 4, 5, 8, 9, 12); title fix (Task 2); kiosk as one straight unit with unwrapped lines, moved off the slab sliver, unit test and before/after screenshots (Task 3); deep links and static anchors (Tasks 5, 10); no hard-coded slugs or counts (all tests derive from the dataset); floor picker thumbnail (Task 13); unit, e2e, screenshots at 1440x900, 834x1112, 390x844, docs, PR (Tasks 1 to 14).
- **Placeholders.** None in code steps. The budget numbers pasted into the PR (Tasks 1, 12) are measured at execution time; the R4-I and R4-J APIs are checked in Task 1 Step 1.
- **Type consistency.** `HighlightStation`, `highlightRoom`, `isHighlightRoom`, `highlightsRoomFromHash`, `gateStartRoom`, `experienceRows`, `HIGHLIGHT_STAT_COUNT` (stations.ts); `HALL`, `HALL_LAYOUT`, `HallStation`, `HighlightsHallLayout`, `stationOf`, `shouldLoadShots` (hallLayout.ts); `HallLabels`, `HallFonts`, `HallInput`, `hallSolids`, `hallLabels`, `hallShots`, `shotQuadBuffers`, `coverCrop`, `SHOT_CELL`, `HALL_ROWS`, `onPanel` (hallContent.ts); `HighlightsData`, `ExperienceData.highlights`, `FloorLayout.roadZone`, `routeUsesRoad`, `RoomCard`, `RoomView.cards`, `HighlightsBody`, `highlightsWalk`, `HighlightsWalkLabels`, `NO_WALK_PROMPT`, `highlightsInteractables` (hallInteract.ts); `KIOSK`, `kioskParts`, `kioskFacing`, `kioskStop`, `kioskLines`, `kioskAllLines`, `kioskFontSize`, `kioskMaxChars`, `fitLine` (kiosk.ts); `HallLabels.employment`, `HallLabels.visitLive`, `HallLabels.stations`, `RoomCard.live` are defined once and used with the same names and signatures in later tasks.

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-10-12-highlights-hall.md` (Task 1 copies it there). Two options:

1. **Subagent-driven (recommended):** a fresh subagent per task with a review between tasks (superpowers:subagent-driven-development). R4-I and R4-J must be on main first (Task 1 checks). Tasks 2, 3 and 4 are independent of each other; Tasks 5 to 14 follow in order.
2. **Inline:** execute task by task with checkpoints (superpowers:executing-plans).
