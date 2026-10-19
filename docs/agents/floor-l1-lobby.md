# L1 Lobby

The L1 Lobby floor: the certification wall, the Highlights Hall, the Rover menu kiosk, the Agent Office and the Lobby camera views.
Index: [AGENTS.md](../../AGENTS.md).

Related: floor rules shared by every floor live in [floors.md](floors.md); the Visitor Observatory (`L1:visits`) is described in [stats.md](stats.md) and [hud-and-drawer.md](hud-and-drawer.md).

## Certification wall

- Code: `floors/lobby/CertWall.tsx`; pure layout `CERT_WALL`, `certSlots`, `certPage`, `tabAngles`, `certPanelHalf` in `floors/lobby/layout.ts`.
- Shape: a curved holo-wall on an arc of radius 19.6 around the hologram, inside the `LOBBY.certWall` footprint.
  - A layout test keeps the widest panel inside the footprint.
- Tabs come from `issuerTabs`: All, up to 3 issuers with 2 or more certifications, Other.
- Paging: 12 badges per page in two rows sized to content, a pager past 12.
- Draw calls:
  - badge bodies and glows: two instanced meshes;
  - outlines: one line mesh;
  - issuer logos: one atlas mesh (`orientedQuadBuffers`);
  - title, tab, pager and badge texts: one `BatchedLabels`, rendered over the logos.
- A badge click calls `openCert`.

## Skills wall

Code: `floors/lobby/SkillsWall.tsx`, layout in `floors/lobby/layout.ts` (`skillsWallLayout`).

- `LOBBY.skillsWall.w` is 40 u. Every skill group (owner, 2026-10-17: all groups, under one storey) sits 4 across by 2 down (`SKILLS_GRID`) in 10 u cells, in `SKILLS_WALL_ORDER` (`wallSkillGroups` in `@/content/selectors`): AI and LLM, Data science and ML, Azure, Languages on top; Backend, Frontend, Data and messaging, DevOps below. A group the order does not list still shows, appended.
- Heading colors (`GROUP_ACCENT`, palette colors only): AI violet, Data science green, Azure blue, Languages pink, Backend cyan, Frontend indigo (`COLORS.lane`), Data pale indigo (`COLORS.packet`), DevOps amber.
- Every item shows (owner, 2026-10-17: "show all"). A group with more than `SKILLS_SPLIT.over` (6) items splits into two sub-columns inside its cell, column-major (first half left). Each sub-column has its logos in one column and the same line spacing.
- The second sub-column starts at the cell middle (half the text width plus half of `SKILLS_SPLIT.gap`, 0.2 u), shifted only as far as needed so every item fits its slot (`skillItemWidth`: the icon gap plus about 0.5 em per glyph). Split cells in one grid column share that edge, so sub-columns line up down the wall; a group whose halves cannot both fit keeps one column.
- `SKILLS_PAD.column` is 0.6 u so Azure ("Document Intelligence" left, "Managed Identity" right) and Data science ("Hugging Face Transformers" right) split inside a 10 u cell; their second sub-columns sit at 4.95 u and 3.25 u from the cell's text left.
- Today: AI and LLM 9 (one column: "Azure OpenAI (incl. Realtime)" is too wide for half a cell), Data science 6 + 6, Azure 6 + 6, Languages 6, Backend 4 + 4, Frontend 5, Data 4 + 3, DevOps 5 + 4.
- Each grid row is as tall as its tallest cell (`rowHeights`): 11.25 u today, and the title's top (`skillsWallTop`, plinth and title included) at about 12.4 u, under one storey (at most 12.5 u by test; `FLOOR_GAP` is 14). `SKILLS_PAD.bottom` keeps the base row clear of the plinth lip, which hides the lowest 1.5 u or so from the stop's elevated camera.
- `LOBBY.skillsWall.h` is that measured height: the point-and-go hit box (`interact/registry.ts`) and the Lobby bounds read it, and a unit test fails when content grows the wall past it (update `h`, keep the title under 12.5 u).
- One `BatchedLabels` (title, headings, one text block per sub-column) and one `LogoQuads` (a logo for every item): no extra draw call or program.
- Colliders, the point-and-go bounds, the stop (`host3d.ts`, 2.6 u in front) and the lane spoke derive from `LOBBY.skillsWall`.
- The `L1:skills` view zone (`camera/orbit.ts`) frames the whole wall at zoom 1.7 (phones 1.15 through `classView`: closer so the text reads, and the visitor pans). Like every zone it does not turn the camera under reduced motion.

## Highlights Hall

Code: `floors/lobby/hallLayout.ts`. Design: [`docs/superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md`](../superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md) Part 2.

### Layout

- The Lobby slab runs to x = 64.
- A lead road leaves the plaza south of the certification wall (z = 15) into a 24 x 26 u plaza.
  - The certification wall stays untouched and readable from the plaza.
- Four stations sit flush with the slab edges, rooms `L1:highlights-*`:

  | Station | Position |
  |---|---|
  | about me | north-west |
  | top projects | north-east |
  | work experience | east |
  | contact | south |

- Each station has a door pad 1.1 u in front and a camera zone that faces it.
- `FloorLayout.roadZone` limits the L1 road to drives into or out of the hall (`routeUsesRoad`), so Lobby trips keep the navgrid.

### Scenery (a gallery)

- Shapes live in `hallGallery.ts`, inside the station footprints, so pads, doors, spurs and deep links keep their places.
- About me: a round holo pedestal.
  - The portrait is a hologram disc.
  - The four stat tiles stand in an arc and drift on the full tier; their texts move through the `BatchedLabels` handle.
- Top projects: three monolith screens in a shallow arc.
- Work experience: a lit arch (columns on the pillars, the title on the lintel, an amber glow in the opening).
- Contact: beside a signal beacon with pulsing rings and a floating card.
- Gateway arch over the lead road at x = 33:
  - pillars are obstacles; the rover drives under the lintel;
  - the floating "Highlights Hall" sign (`FloatingSigns`, `gateSign`); nothing is written on the floor;
  - a light curtain sweeps once per browser session on the first eastward pass (`gateCrossed`, `sessionStorage["hq:hall-gate"]`, probe `__hq.probes.hallGate`), never under reduced motion.
- A light fountain (light only) marks the plaza center.
- Fake spotlight cones, uplights and glow pools are one instanced mesh; no real lights on any tier.

### Rendering

- Every hall effect draws with the shared holo program (`HOLO_MODE.stage` in `fx/holoFx.ts`, per-instance kind in `aStage`, instances from `hallStage.ts`), so the gallery adds no program of its own.
- `HighlightsHall.tsx` draws:
  - the road markings, one merged solid mesh, one line mesh, one `BatchedLabels`;
  - the screenshot atlas: black until it loads once the rover is east of `HALL.lazyX` (`shouldLoadShots`);
  - the portrait disc, the tiles, the lights, the portal, the beacon rings, the sign, and the curtain while it sweeps.
- `HallView` hides the instanced effects while the hall's bounds are out of view.
- `HallReady` precompiles and pins every program (`precompileObject`) once the scene draws into its final target, before the hall shows.
- Shader materials are never culled by the ride cull ([3d-experience.md](3d-experience.md)).
- The tall shapes are in the camera collision (`hallTall`, `FloorLayout.tall` on L1).
- Reduced motion holds everything still.
- `Lobby.tsx` builds the hall once the rover is on L1 or riding there (the boot card included, so the intro orbit shows it), then keeps it.
- The skills wall and certification wall texts are one `BatchedLabels` each, which pays for the hall.
- Budget: `RenderCounter` counts the full tier's composer passes apart from scene calls, and `e2e/highlights.spec.ts` caps L1 at 125 scene calls (`FLOOR_SCENE_CAPS`) from the plaza to the hall on both tiers.

### Content

- Projects come from `pickFeaturedPods` (the landing's three).
- Experience comes from timeline entries of type `job` and `freelance`, newest first (`highlightEntries`, `experienceRows`).
- The work experience columns use the career type labels (`common.type.job` "Employment", `common.type.freelance`).
- A project with `podLiveLink` gets "Visit live site": a tag in 3D, a `LiveSiteLink` in the drawer.

### Deep links and point-and-go

- `/{locale}#highlights(-<station>)` opens a station (`gateStartRoom` in the gate).
- An open station keeps `/{locale}` (`hasPage` false).
- The stations are point-and-go targets `L1:station:highlights-<station>` (kind `station`, `open-room`), registered by `HighlightsHall` with `registerExtraInteractables` (`hallInteract.ts`); see [floors.md](floors.md).
- The registry's L1 built-ins do not derive targets from L1 doors.

## Agent Office

Design: owner decisions D1 to D7 ([2026-10-18](../decisions/2026-10-18-agent-office.md)); backend, contract and privacy in [office.md](office.md). Code: `floors/lobby/officeLayout.ts` (pure layout, rooms, stops, view zone; config.ts imports it, so it stays import-light), `floors/lobby/officeShell.ts` (3D-only: `officeShellBoxes`, `officeBounds`), `floors/lobby/office/` (the mount, the loader and two lazy chunks), shared client modules `src/lib/office/poll.ts` and `src/lib/office/model.ts`.

### Layout

- South plaza strip (D7), slab unchanged (`OFFICE.slabEdge` equals `LOBBY.bounds.maxZ` 21): five desks (2.6 x 0.9 u, top at y 0.95) on an arc around (3.5, 10), desk radius 8, at 51.3, 25.65, 0, -25.65 and -51.3 degrees from +z toward +x (`OFFICE.angles`). Slot 0 (Desk 1) is the east end: the office stop looks south, so Desk 1 is the leftmost Rover from there, in the drawer's order.
- Each Rover stands 1.2 u behind its desk (radius 9.2), facing the plaza; four cable trays run along the arc between the desks; a 17 x 4 u screen wall (frame 0.2 u, bottom at y 0.6, 0.3 u thick) stands on the south edge with its plane at z 20.7, facing north.
- Obstacles (`officeObstacles`): one per desk and Rover (the end ones reach back to the wall, so no pocket behind the row is reachable) and the wall (to the slab edge). The wall frame is a camera column (`FloorLayout.tall`, `officeTall`). The concave floor in front of the desks is open.
- Stop (3.5, 14.2) for every office room (`FloorLayout.stops`, `officeStops`); view zone `L1:office` around it looks south (zoom 1.3, tablets 1.25, phones 1.2).
- Clearances (`tests/unit/lobby-office.test.ts`): 3.67 u east of the kiosk, 2.32 u west of the hall lead road start, the stop 3.35 u in front of the middle desk, the wall 0.35 u behind the middle Rover, every office obstacle more than 1 u from every other L1 obstacle.
- Space rules: the office is one fixture whose inner gaps are by design ([owner decision](../decisions/2026-10-19-agent-office-space-rules.md)); `tests/unit/highlights-layout.test.ts` checks the Lobby's space rules without it.

### Chunks and mounting

- `OfficeMount` (main path, in an `IntroReveal` with `officeBounds()`) always draws the furniture shell (desk tops, legs, cable trays, wall frame: `MergedBoxes` and `MergedEdges`), so the navgrid never holds an invisible desk, before the chunk loads or if it fails.
- Two lazy chunks, loaded by `office/chunk.ts` (its two `import()` calls are the only references to them):
  - the scene (`office/scene.ts`, `loadOffice`): `OfficeScene`, `OfficeChips` and the live feed's test hooks. Every 0.5 s after the first frame went idle (`afterFirstFrameIdle`), `OfficeMount` asks `officeLoadWanted`: on L1 or riding there, within `OFFICE.loadRadius` (40 u) of the stop (the rover, or `LOBBY.arrival` during a ride; the spawn is inside it), speculative prefetch on. `?prefetch=off` never loads it on its own; a failed speculative load is not retried by the trigger.
  - the drawer body (`office/body.ts`, `loadOfficeBody`): `OfficeBody`, loaded only when an office drawer opens. Its mount effect also starts (or retries) the scene load on every open, even with `?prefetch=off`.
- Neither is a floor chunk or on the first-frame path. Never import their modules statically from the `Experience.tsx` closure (`tests/unit/office-chunk-graph.test.ts`).
- The live scene mounts once loaded, on L1 (or riding there), with the full tier's composer live (`useComposerLive`), never in the middle of the intro (a load during the boot card mounts at once, so the reveal ring switches it on). Once mounted it stays. `INTRO_LANDMARKS` stays at five.
- `OfficeReady` precompiles and pins the office's programs like `HallReady`, then sets `__hq.probes.office.loaded`.

### Rendering (7 scene calls, no new program)

- Main path (2): shell solids and shell edges, on the observatory's programs.
- Scene chunk (5):
  - Rover parts and treads: two instanced unit-box meshes on `MeshStandardMaterial` with `alphaHash` (the player Rover's wheel program).
  - Faces (128 x 96 cells) and desk screens (256 x 160 cells): one quad mesh on one 1024 x 512 canvas atlas, the player face's material settings. The quads carry a `normal` attribute (unused by the basic material) so they share the wall's program.
  - Glow: one instanced holo mesh (`HOLO_MODE.dot`): antenna tips, halos and CI progress dots.
  - Screen wall: one quad with its own canvas (1280 x 300 full, 1024 x 240 lite).
- Atlas: no mipmaps, `LinearFilter`. The first paint draws every cell and uploads the whole atlas once; after that only cells whose frame key changed repaint into a cell-sized canvas copied into place with `renderer.copyTextureToTexture`. Faces redraw at most 5 fps (`FACE_FPS_MAX`, both tiers), desk screens at most 10 fps full and 5 fps lite.
- Wall: checked twice a second; its model rebuilds only when the feed or the locale changed or a second passed, and the texture redraws only when its content or spinner changed.
- Per-frame work runs only while the office is in view on L1 (a frustum test of its bounds every 0.5 s, `officeRuntime.inView`). Instance-matrix, face-quad and glow writes are skipped when no pose, glow key or camera changed, and run through `whenDrawn`; the atlas paints only while the office is drawn (`shownInScene`), and the wall redraws through `whenDrawn`.
- Reduced motion holds still poses and crossfades faces and screens over 0.4 s on a state change (full motion cuts).
- Measured with the office loaded: L1 settled 93 scene calls lite and 95 full (cap 125, +7), about 880 more triangles, programs unchanged.

### States, chips and rooms

- Nine states (D5): `OFFICE_STATE_STYLE` (`office/officeVisual.ts`: face, desk screen and tone per state) with the tones in `STATE_TONE` (`src/lib/office/model.ts`); `STATUS_COLOR` (GitHub board statuses) lives in `officeVisual.ts` too, so the drawer body chunk stays off the canvas code. The input screen shows "Waiting for Kurniadi", never a question or prompt; the working screen scrolls invented code. Every Rover sleeps when the office is off, disabled or offline; a desk without a session (every desk when semi-live, GitHub only) is an off-duty Rover asleep.
- HTML chips (`OfficeChips` in the scene chunk, mounted by `hud/OfficeLayer.tsx` on the main path once the chunk is loaded, on L1, not riding, while exploring or with a drawer open) follow the Rovers (HintProbe pattern, moved by `OfficeScene` through `officeRuntime.chips`):
  - a state dot, "<Agent> · <activity>", then the title or "Client project" and a CI progress bar; the task line is the chip's `aria-describedby`;
  - near/far band 27/29 u from the camera (`OFFICE_CHIP_FAR` 28, `OFFICE_CHIP_FAR_BAND` 1): a far chip shows the agent and activity only;
  - on phones a far chip is compact (the state dot alone in a 32 px pill, its label keeps the agent and activity), and every chip is clamped 8 px inside the screen edges;
  - a hidden chip is written once, then left alone until it comes back into view; all chips hide on phones while a drawer is open.
- Rooms: `L1:office` (the summary half of the wall, the east half seen from the plaza), `L1:office-github` (the west half), `L1:office-desk-1` to `-5` (per Rover); point-and-go targets `L1:station:office`, `L1:station:office-github`, `L1:station:office-desk-<n>` (registered by `OfficeScene` with `registerExtraInteractables`, `office/interact.ts`), all driving to the stop; a chip click does the same. Every office room keeps `/{locale}` (`isOfficeRoom`). The Rover menu mission `office` ("Watch the AI agents at work") opens the summary.
- Polling (`src/lib/office/poll.ts` through `office/live.ts`): every 10 s while a desk of a live snapshot is awake, 30 s when semi-live, off, all asleep or without a snapshot; only while the office is in view on L1 (reason "view") or an office drawer is open ("drawer") and the tab is visible; visitor input resets a 10 minute idle stop, and the tab turning visible fetches at once; after errors the last snapshot stays 60 s, then "offline".

### Probes and tests

- `__hq.office`: `load()`, `loadBody()`, `state()`, `asks()` (trigger asks after the first frame went idle: the `?prefetch=off` proof), `test()` once loaded (`feed`, `poll`, `advance`, `wanted`, `settled`).
- `__hq.probes.office`: `loaded`, `desks`, `states`, `mode`, `wallFrames`, `chips`, `bob`, `inView`, `polling`.
- Unit: `lobby-office`, `office-rooms`, `office-model`, `office-poll`, `office-visual`, `office-rig`, `office-atlas`, `office-frame`, `office-view`, `office-wall`, `office-runtime`, `office-chunk`, `office-live`, `office-interact`, `office-chunk-graph`; jsdom: `tests/hud/OfficeChips.test.tsx`, `tests/hud/OfficeBody.test.tsx`. E2E: `e2e/office.spec.ts` with snapshots from `e2e/office-fixtures.ts`; perf: the L1 and B1 gates load the office first, plus the office stop spot ([performance.md](performance.md)).
- Owner captures: `bun scripts/office-shots.ts` (not committed).

## Rover menu kiosk

Code: `floors/lobby/kiosk.ts`. The kiosk lines up straight, radially into the hologram circle (owner decision).

- Body, stand and screen are one group turned by one yaw (`KIOSK.yaw`) that faces the hologram.
- The screen is centered on the body and only tilts back.
- Lines never wrap: `kioskFontSize` fits the longest line, `fitLine` ends longer ones in "...".
- Placement: on the kiosk axis (`LOBBY.kioskAxis`: the unit direction from the hologram to the Visitor Observatory), 19.2 u from the hologram.
- Lane spoke (`Lanes.tsx`): one straight radial segment ending 0.4 u in front of its front (`kioskLaneEnd`).
- Obstacle and pick volume: the axis-aligned box of the turned footprint (`kioskRect` in config.ts, `kioskBounds`).
- Point-and-go stop: `kioskStop()`, on the axis 3 u in front of the screen.
- Session spawn: that stop (`LOBBY.spawn`, heading `LOBBY.spawnHeading` toward the screen), so the first rover placement is in front of the kiosk (owner decision).
- `tests/unit/kiosk.test.ts` checks the shared yaw, the centering, the straight spoke and the spawn.

## Lobby views

Code: `floors/lobby/observatoryLayout.ts`.

| Zone | Where | Camera |
|---|---|---|
| `L1:kiosk` | the spawn | desktop 0.62 rad off the kiosk axis at zoom 1.5, so the hologram's name, the rover at the kiosk and the observatory panel all read; tablets and phones straight down the axis through `ViewZone.classView` |
| `L1:arrival` | the elevator arrival point `LOBBY.arrival` (-6, 0) | behind the rover, looking east at the hologram and the stats ring (`arrivalOnly`, `travel` east); zoom 1.03, phones 0.88, the widest views that keep the camera east of the glass shaft |
| `L1:visits` | the observatory door | |

- `CameraDirector` primes the zone under the rover when it is marked `prime` (only `L1:kiosk`; `primeZone`), on the first frame and through the boot and the intro.
- The intro's end pose is that follow pose (yaw, zoom, look-ahead, offset scale), so the intro lands on the spawn view with no jump.
- `resetView` returns to the default north-west look.
- The elevator rolls the rover on east from the shaft to `LOBBY.arrival`; the camera glides out of the car into the arrival zone ([Elevator arrival](3d-experience.md#elevator-arrival)). Under reduced motion the rover and the camera cut to it.
- The arrival zone is `arrivalOnly`: it applies only to an elevator arrival, never to a rover driving through later. The session still spawns at the kiosk stop in `L1:kiosk` (a `prime` zone), not on the arrival point.

## Intro reveal and beacons

Code: `intro/landmarks.ts` (pure), `intro/beacons.ts` (the per-frame beacon step), `intro/IntroReveal.tsx` (with `revealDistance` from `intro/runtime.ts`), `intro/IntroBeacons.tsx`, wired in `floors/Lobby.tsx`. The beacons come from the intro chunk (`introModule()`, [Boot and intro](3d-experience.md#boot-and-intro)); `IntroReveal` stays on the main path.

- During the boot and the intro the Lobby is dark: each landmark sits in an `IntroReveal` with its floor rect (hologram and stats ring, skills wall, certification wall, kiosk, observatory, Highlights Hall) and switches on, with a quick neon flicker (on 0.06 s, off until 0.14 s), once the reveal ring around the rover reaches it (`revealDistance`). The grid and the lanes mask themselves in their shaders, so `Lanes` is not wrapped.
- Outside the intro (`introRuntime.active` false: explore, a skipped intro, the reduced-motion fade) every landmark shows.
- `IntroReveal` writes `visible` per frame from `introRuntime`, never through React state. three's `compile` prepares the programs of hidden objects too (it only gathers lights from visible ones), so the boot precompile builds and pins the hidden landmarks' programs; their buffers and textures still upload on the first frame they draw.
- Beacons: `IntroBeacons` is one instanced holo mesh (`HOLO_MODE.beacon`, 5 instances, `aAlpha`) lying on the floor under the five `INTRO_LANDMARKS` (stats, skills, hall, observatory, elevator). After `INTRO.wake` each landmark pulses once (`beaconAlpha`, gone by 2 s) the first frame it projects within `|ndc.x| < 0.55`, `|ndc.y| < 0.75`, and its id goes into `introRuntime.lit` (probe `__hq.intro.lit`; the e2e intro test expects at least three on the lite desktop view; the narrow tablet and phone frames never centre `hall`, so they pulse four).
- `Lobby` mounts the beacons only while `phase` is `intro`, and on the full tier only once the lazy composer exists: mounted earlier, the frame-3 precompile would build a second, canvas-target holo program.
