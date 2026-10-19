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
- `FloorLayout.roadZone` limits the L1 road to drives into or out of the hall or the [Agent Office wing](#agent-office) (`routeUsesRoad`), so Lobby trips keep the navgrid.

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

Design: owner decisions D1 to D7 ([2026-10-18](../decisions/2026-10-18-agent-office.md)); backend, contract and privacy in [office.md](office.md). Code: `floors/lobby/officeLayout.ts` (pure: the wing offsets and builder, layout, rooms, stops, view zone, road; config.ts imports it, so it stays import-light), `floors/lobby/officeShell.ts` (3D-only: `OFFICE_SLOTS`, `officeShellBoxes`, `officeBounds`, `wingBounds`, `officeSign`), `floors/lobby/office/` (the mount, the loader and two lazy chunks), shared client modules `src/lib/office/poll.ts` and `src/lib/office/model.ts`.

### Layout

The office has its own south wing of the L1 slab ([owner decision](../decisions/2026-10-20-agent-office-wing.md)), reached by a lead road from the Lobby plaza like the Highlights Hall. Everything derives from S, the Lobby's south slab edge (`LOBBY.bounds.maxZ`, 21): `OFFICE_WING` holds the offsets and `officeWing(S)` builds `LOBBY.officeWing` in config.ts, the one source every reader uses (layout, shell, chunk trigger, scene, e2e, scripts). The office functions take the wing (`officeSlots(w)`, `officeObstacles(w)`, `officeStops(w)`, `officeZone(w)`, `officeRoad(w)`, ...). x values are absolute.

| Item | Offsets from S |
|---|---|
| Wing rect (`FloorLayout.wings`) | x -12 to 18, z S to S + 25 |
| Lead road `office-lead` (8 u, inside the plaza's x -3 to 9) | x 3 (x -1 to 7), z S - 8 to S + 6 |
| Lead span (`leadSpan`, in `roadZone`) | x -1 to 7, z S - 8 to S |
| Wing plaza `office` | 18 x 16 centred (3, S + 9.5) |
| Office stop (every office room) | (3, S + 16.5) |
| Desk arc centre | (3, S + 11) |
| Screen wall centre line | S + 24.7, its footprint flush with the wing's south edge |
| Wing sign | over the wing plaza's centre at (3, S + 9.5), y 4.5 |
| Reveal (`wingBounds`) | x -12 to 18, z S - 8 to S + 25 |

- One continuous console: five desks (4.05 x 0.9 u, top at y 0.95) on an arc of radius 11 at 40, 20, 0, -20 and -40 degrees from +z toward +x (`OFFICE.angles`); the width closes the 20 degree step at the desks' back edge, so neighbours meet. Each Rover stands behind its desk (radius 12.2) facing the arc centre. Slot 0 (Desk 1) is the east end: the office stop looks south, so Desk 1 is the leftmost Rover from there, in the drawer's order. The 17 x 4 u screen wall (frame 0.2 u, bottom at y 0.6, 0.3 u thick) faces north, 0.35 u behind the middle Rover's back.
- Obstacles (`officeObstacles`), all reaching back to the wing's south edge so no pocket behind the console is reachable: the east end (desk 1 and its Rover), the middle (desks 2 to 4, from the front of desks 2 and 4), the west end (desk 5 and its Rover), touching each other, and the wall frame. The wall frame is a camera column (`FloorLayout.tall`, `officeTall`). The concave floor around the stop is open: in front of the console the row boxes hide 7.2% more than the desk and Rover footprints (cap 15%).
- Road: the wing's lead road and plaza join the L1 network as a second part beside the hall's; `roadZone` is `[HALL_LAYOUT.zone, wing rect, leadSpan]`, so a drive into or out of the wing follows the wing road and `roadRoute` crosses between the two parts ([floors.md](floors.md#network)). `Lobby.tsx` draws them with the hall's road kit (`RoadMarkings`, L1 green) and the floating "AGENT OFFICE" sign (`FloatingSigns`, `hud.rooms.office`, low over the wing plaza, its plate 0.9 u over the rover driving under it); on the full tier both mount once the composer exists, so no canvas-target program compiles.
- Reveal: `REVEAL.wing` (`wingBounds()`, the wing reaching north over the lead span) wraps the wing road, the sign and `OfficeMount`; the intro orbit is unchanged.
- View zone `L1:office`: a 4 x 2.8 u area around the stop (`OFFICE.view.half`) looking south (+z), per camera class (`cameraClass`):

  | Class | Zoom | Pitch | Look offset | Sky over the wall |
  |---|---|---|---|---|
  | desktop (1440 x 900, 1280 x 720, 1180 x 820) | 1.24 | none (levels on exit, no turn-back) | none | 33.1% |
  | tablet (landscape phones, 640 to 1023 px wide landscape screens) | 1.15 | -0.1 | none | 32.7% |
  | mobile (portrait screens, phones and tablets: 390 x 844, 820 x 1180) | 1.3 | 0.2 | `{ forward: -6.25 }` | 20.4% |

  A `pitch` opts into the turn-back ([3d-experience.md](3d-experience.md)). Each class takes the closest view that keeps the wall, the five desks and the Rover in frame, the chips far, and the near pose (one zoom step, two on a portrait screen) clear. The follow rig keeps its look target (the rover plus its look-ahead, over the desks) at the screen centre, so on a landscape screen the wall's top sits about a third of the way down (most of that band holds the two chip rows). A portrait screen moves its look target 6.25 u toward the camera (`ViewZone.lookOffset`, [Orbit](3d-experience.md#orbit), owner decision [2026-10-20](../decisions/2026-10-20-office-look-offset-ghost-outline.md)): the view tilts down to about 20% sky (at most 22% by test) with the five desks and the Rover in frame; a hand zoom eases the offset out, so the near pose is the plain one (31.5% sky). No spot over the lead road keeps the wing sign's plate whole in every frame it shows up in, so it hangs over the wing plaza's centre: from the primed spawn it is whole on the four landscape sizes and out of frame on the two portrait ones, at the office stop whole under the rover and the desks on every class (on a landscape phone it reaches 6 px into the hint band), and on the lead road whole ahead of the rover (`office-chip-placement` projects it on the six sizes).
- Ghost outline: from the wing the view looks south past the L1 slab edge, under the L2 slab, whose ghost outline (amber) crossed the office view. The floors above hide their outline while the rover is in the wing (`FloorLayout.hideGhostAbove: [wing rect]`) or the `L1:office` zone (`hideGhostAbove: true`), fading over the ghost floors' 0.45 s curve and cutting under reduced motion; on the lead road, at the spawn and everywhere else the outline stays ([3d-experience.md](3d-experience.md#orbit), `tower/ghostOutline.ts`).
- Clearances under the full 6 u `SPACE_RULES` (`tests/unit/lobby-office.test.ts`, `tests/unit/highlights-layout.test.ts` checks the Lobby with the wing): the row boxes touch each other and the wall, the two end boxes keep 10.46 u apart and 6.09 u from the wing's side edges, the wall frame 6.3 u; the observatory corner (-18, S) keeps 6 u to the wing's west edge; nothing stands within 6 u of x 18 to 24 at z S (the hall lead road after the L1 re-spacing); the lead road stays off the hall's road zone and clear of the kiosk. The stop sits on 6 u wide floor (`wideGrid`), reachable from the spawn and the elevator, 5.5 u in front of the middle desk, 3.72 u from the middle box and 8.2 u from the wall.
- `tests/unit/lobby-office.test.ts` also builds the wing for S = 27 (every z shifts by +6, every x stays).

### Chunks and mounting

- `OfficeMount` (main path, in the wing's `IntroReveal`) always draws the furniture shell (desk tops, legs, wall frame: `MergedBoxes` and `MergedEdges`), so the navgrid never holds an invisible desk, before the chunk loads or if it fails.
- Two lazy chunks, loaded by `office/chunk.ts` (its two `import()` calls are the only references to them):
  - the scene (`office/scene.ts`, `loadOffice`): `OfficeScene`, `OfficeChips` and the live feed's test hooks. Every 0.5 s after the first frame went idle (`afterFirstFrameIdle`), `OfficeMount` asks `officeLoadWanted`: on L1 or riding there, speculative prefetch on, and either within `OFFICE.loadRadius` (25 u) of the stop (the rover, or `LOBBY.arrival` during a ride) or running a mission bound for the office (the Rover menu's `office` mission, `OFFICE_MISSION`, or a `goto:` an office room from a chip, a Rover or a palette result; from the ride on). The whole lead road and wing are inside the radius; the spawn (30.8 u), the elevator arrival (38.6 u), the visits door and the hall lead road are not, so a session that never heads south never fetches the chunk. `?prefetch=off` never loads it on its own; a failed speculative load is not retried by the trigger.
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
- The wing adds 2 slab calls (its box and grid) and the wing road's `RoadMarkings`. Measured with the office loaded: L1 settled at the spawn 101 scene calls lite and 103 full (cap 125), at the office stop 51 and 53; programs within the baseline.

### States, chips and rooms

- Nine states (D5): `OFFICE_STATE_STYLE` (`office/officeVisual.ts`: face, desk screen and tone per state) with the tones in `STATE_TONE` (`src/lib/office/model.ts`); `STATUS_COLOR` (GitHub board statuses) lives in `officeVisual.ts` too, so the drawer body chunk stays off the canvas code. The input screen shows "Waiting for Kurniadi", never a question or prompt; the working screen scrolls invented code. Every Rover sleeps when the office is off, disabled or offline; a desk without a session (every desk when semi-live, GitHub only) is an off-duty Rover asleep.
- HTML chips (`OfficeChips` in the scene chunk, mounted by `hud/OfficeLayer.tsx` on the main path once the chunk is loaded, on L1, not riding, while exploring or with a drawer open), moved by `OfficeScene` through `officeRuntime.chips` (HintProbe pattern):
  - each hangs up from a fixed anchor (`officeRuntime.anchors`, `CHIP_ROW` `{ gap: 0.2, step: 2.2 }` in `office/runtime.ts`) on the wall's front face, 0.2 u over its frame at its Rover's x, desks 2 and 4 one step (2.2 u) higher: an arc of two rows over the wall, so neighbours never share a row; the wall stands right behind the Rovers, so a chip over a Rover's head would cover the wall's text from the plaza;
  - from the office stop every chip is far and on screen, and no chip covers the wall, a desk screen, the visitor's rover, another chip or the HUD (the top bar, the bottom band, the desktop profile card and elevator panel, the Corners minimap and joystick); at the near pose (one zoom step on desktop and tablet cameras, two on a portrait screen) the middle three show their task lines and every shown chip stays clear of the same (`tests/unit/office-chip-placement.test.ts` projects the stop camera at 1440 x 900, 1280 x 720, 1180 x 820, 820 x 1180, 390 x 844 and 844 x 390 with conservative chip sizes and the measured HUD boxes);
  - a state dot, "<Agent> · <activity>", then the title or "Client project" and a CI progress bar; the task line is the chip's `aria-describedby`;
  - near/far band 29/31 u from the camera (`OFFICE_CHIP_FAR` 30, `OFFICE_CHIP_FAR_BAND` 1): a far chip shows the agent and activity only; at the stop the chips sit 34 u or more away;
  - on phones (the HUD's mobile class, portrait and landscape) every chip stays far and compact at any zoom (`nextChipFar(far, dist, phone)`): the state dot alone in a 32 px pill, its label keeps the agent and activity, no task line and no `aria-describedby`; a 390 px screen cannot hold two near chips side by side, and the desk's drawer shows the task;
  - every chip is clamped 8 px inside the screen edges, and its top never above `OFFICE_CHIP_TOP` (66 px desktop, 64 px phones; the HUD's top row ends at 62 px from 768 px wide and at 58 px on a narrower phone, `tests/unit/office-chip-placement.test.ts` `hudBar`): a chip whose anchor rises that high stops right under it;
  - a hidden chip is written once, then left alone until it comes back into view; all chips hide on phones while a drawer is open.
- Rooms: `L1:office` (the summary half of the wall, the east half seen from the plaza), `L1:office-github` (the west half), `L1:office-desk-1` to `-5` (per Rover); point-and-go targets `L1:station:office`, `L1:station:office-github`, `L1:station:office-desk-<n>` (registered by `OfficeScene` with `registerExtraInteractables`, `office/interact.ts`), all driving to the stop; a chip click does the same. Every office room keeps `/{locale}` (`isOfficeRoom`). The Rover menu mission `office` ("Watch the AI agents at work") opens the summary.
- Polling (`src/lib/office/poll.ts` through `office/live.ts`): every 10 s while a desk of a live snapshot is awake, 30 s when semi-live, off, all asleep or without a snapshot; only while the office is in view on L1 (reason "view") or an office drawer is open ("drawer") and the tab is visible; visitor input resets a 10 minute idle stop, and the tab turning visible fetches at once; after errors the last snapshot stays 60 s, then "offline".

### Probes and tests

- `__hq.office`: `load()`, `loadBody()`, `state()`, `asks()` (trigger asks after the first frame went idle: the `?prefetch=off` proof), `test()` once loaded (`feed`, `poll`, `advance`, `wanted`, `settled`).
- `__hq.probes.office`: `loaded`, `desks`, `states`, `mode`, `wallFrames`, `chips`, `bob`, `inView`, `polling`.
- Unit: `lobby-office`, `office-rooms`, `office-model`, `office-poll`, `office-visual`, `office-rig`, `office-atlas`, `office-frame`, `office-view`, `office-wall`, `office-runtime`, `office-chip-placement`, `office-chunk`, `office-live`, `office-interact`, `office-chunk-graph`; jsdom: `tests/hud/OfficeChips.test.tsx`, `tests/hud/OfficeBody.test.tsx`. E2E: `e2e/office.spec.ts` with snapshots from `e2e/office-fixtures.ts`; perf: the L1 and B1 gates load the office first, plus the office stop spot ([performance.md](performance.md)).
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
- Session spawn: that stop (`LOBBY.spawn`, heading `LOBBY.spawnHeading` toward the screen; both from `floors/lobby/spawn.ts`, with the kiosk axis, so the store reads them without the floor layouts), so the first rover placement is in front of the kiosk (owner decision).
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

- During the boot and the intro the Lobby is dark: each landmark sits in an `IntroReveal` with its floor rect (hologram and stats ring, skills wall, certification wall, kiosk, observatory, Highlights Hall, the Agent Office wing) and switches on, with a quick neon flicker (on 0.06 s, off until 0.14 s), once the reveal ring around the rover reaches it (`revealDistance`). The grid and the lanes mask themselves in their shaders, so `Lanes` is not wrapped.
- Outside the intro (`introRuntime.active` false: explore, a skipped intro, the reduced-motion fade) every landmark shows.
- `IntroReveal` writes `visible` per frame from `introRuntime`, never through React state. three's `compile` prepares the programs of hidden objects too (it only gathers lights from visible ones), so the boot precompile builds and pins the hidden landmarks' programs; their buffers and textures still upload on the first frame they draw.
- Beacons: `IntroBeacons` is one instanced holo mesh (`HOLO_MODE.beacon`, 5 instances, `aAlpha`) lying on the floor under the five `INTRO_LANDMARKS` (stats, skills, hall, observatory, elevator). After `INTRO.wake` each landmark pulses once (`beaconAlpha`, gone by 2 s) the first frame it projects within `|ndc.x| < 0.55`, `|ndc.y| < 0.75`, and its id goes into `introRuntime.lit` (probe `__hq.intro.lit`; the e2e intro test expects at least three on the lite desktop view; the narrow tablet and phone frames never centre `hall`, so they pulse four).
- `Lobby` mounts the beacons only while `phase` is `intro`, and on the full tier only once the lazy composer exists: mounted earlier, the frame-3 precompile would build a second, canvas-target holo program.
