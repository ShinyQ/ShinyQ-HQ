# L1 Lobby

The L1 Lobby floor: the certification wall, the Highlights Hall, the Rover menu kiosk, the Agent Office and the Lobby camera views.
Index: [AGENTS.md](../../AGENTS.md).

Layout (owner, more room 2026-10-19): one slab for the Lobby and the hall (`LOBBY_SLAB` in `floors/lobby/slab.ts`: x from -24, z from -27 to 27, the hall from x = 33), centered on the elevator axis. The hologram stays at (6, 0); the lane ring is r 13.5 and the stats ring r 11. Every obstacle pair clears 6 u (`spaceViolations` finds nothing on L1) and the walkway between the lane ring and each wall or the kiosk is at least 6 u (`tests/unit/lobby-layout.test.ts`). Positions derive from `LOBBY` and `LOBBY_SLAB`, so colliders, bounds, stops, the minimap and deep links follow them.

Related: floor rules shared by every floor live in [floors.md](floors.md); the Visitor Observatory (`L1:visits`) is described in [stats.md](stats.md) and [hud-and-drawer.md](hud-and-drawer.md).

## Certification wall

- Code: `floors/lobby/CertWall.tsx`; pure layout `CERT_WALL`, `certSlots`, `certPage`, `tabAngles`, `certPanelHalf` in `floors/lobby/layout.ts`.
- Shape: a curved holo-wall on an arc of radius 23.5 (`LOBBY.certWall.radius`) around the hologram, inside the `LOBBY.certWall` footprint. Badges keep their size at any radius (angles scale with it).
  - A layout test keeps the widest panel inside the footprint.
- Tabs come from `issuerTabs`: All, up to 3 issuers with 2 or more certifications, Other.
- Paging: 12 badges per page in two rows sized to content, a pager past 12.
- Draw calls:
  - badge bodies and glows: two instanced meshes;
  - outlines: one line mesh;
  - issuer logos: one mesh over the shared prebuilt logo atlas (`orientedQuadBuffers`, see [Logo atlas](#logo-atlas));
  - title, tab, pager and badge texts: one `BatchedLabels`, rendered over the logos.
- A badge click calls `openCert`.

## Skills wall

Code: `floors/lobby/SkillsWall.tsx`, layout in `floors/lobby/layout.ts` (`skillsWallLayout`).

- `LOBBY.skillsWall.w` is 40 u. Its plinth's back touches the north slab edge; the obstacle is the plinth footprint (`skillsWallRect`). Every skill group (owner, 2026-10-17: all groups, under one storey) sits 4 across by 2 down (`SKILLS_GRID`) in 10 u cells, in `SKILLS_WALL_ORDER` (`wallSkillGroups` in `@/content/selectors`): AI and LLM, Data science and ML, Azure, Languages on top; Backend, Frontend, Data and messaging, DevOps below. A group the order does not list still shows, appended.
- Heading colors (`GROUP_ACCENT`, palette colors only): AI violet, Data science green, Azure blue, Languages pink, Backend cyan, Frontend indigo (`COLORS.lane`), Data pale indigo (`COLORS.packet`), DevOps amber.
- Every item shows (owner, 2026-10-17: "show all"). A group with more than `SKILLS_SPLIT.over` (6) items splits into two sub-columns inside its cell, column-major (first half left). Each sub-column has its logos in one column and the same line spacing.
- The second sub-column starts at the cell middle (half the text width plus half of `SKILLS_SPLIT.gap`, 0.2 u), shifted only as far as needed so every item fits its slot (`skillItemWidth`: the icon gap plus about 0.5 em per glyph). Split cells in one grid column share that edge, so sub-columns line up down the wall; a group whose halves cannot both fit keeps one column.
- `SKILLS_PAD.column` is 0.6 u so Azure ("Document Intelligence" left, "Managed Identity" right) and Data science ("Hugging Face Transformers" right) split inside a 10 u cell; their second sub-columns sit at 4.95 u and 3.25 u from the cell's text left.
- Today: AI and LLM 9 (one column: "Azure OpenAI (incl. Realtime)" is too wide for half a cell), Data science 6 + 6, Azure 6 + 6, Languages 6, Backend 4 + 4, Frontend 5, Data 4 + 3, DevOps 5 + 4.
- Each grid row is as tall as its tallest cell (`rowHeights`): 11.25 u today, and the title's top (`skillsWallTop`, plinth and title included) at about 12.4 u, under one storey (at most 12.5 u by test; `FLOOR_GAP` is 14). `SKILLS_PAD.bottom` keeps the base row clear of the plinth lip, which hides the lowest 1.5 u or so from the stop's elevated camera.
- `LOBBY.skillsWall.h` is that measured height: the point-and-go hit box (`interact/registry.ts`) and the Lobby bounds read it, and a unit test fails when content grows the wall past it (update `h`, keep the title under 12.5 u).
- One `BatchedLabels` (title, headings, one text block per sub-column) and one `LogoQuads` (a logo for every item, over the prebuilt [logo atlas](#logo-atlas)): no extra draw call or program.
- Colliders, the point-and-go bounds, the stop (`host3d.ts`, 2.6 u in front) and the lane spoke derive from `LOBBY.skillsWall`.
- The `L1:skills` view zone (`camera/orbit.ts`) frames the whole wall at zoom 1.7 (phones 1.15 through `classView`: closer so the text reads, and the visitor pans). Like every zone it does not turn the camera under reduced motion.

## Logo atlas

- Both walls draw their logos from one prebuilt image, `public/atlas/logos.<hash>.webp`, with its generated client manifest `src/experience/logo-atlas.ts` (only the hashed file name, `LOGO_ATLAS_FILE`) and the build-side `scripts/logo-atlas.lock.json` (`file`, the logo order `srcs` and the `sources` hash, never bundled). The walls compute the layout from content (`atlasLayout(wallLogoSrcs(data))` in `Lobby.tsx`, passed to both walls as `atlas`), the same pure functions and order the script draws with. One request instead of one per logo, and no canvas drawing on the main thread.
- `bun run logo:atlas` (`scripts/logo-atlas.ts`) writes all three. Order: `atlasLayout(wallLogoSrcs(data))`, the skills wall items, then the certification issuers, deduped. Each logo is drawn by headless Chromium with the canvas code the runtime used before: 128 px cells (`ATLAS_CELL`), `atlasPad` (6%, 8 px) on every side, contain fit, centered. On macOS it uses Chrome's GPU raster (Metal, as the visual gate draws), so the cells match the runtime canvas pixel for pixel; elsewhere it falls back to SwiftShader, whose software raster anti-aliases SVG edges slightly differently, so regenerate on macOS. Then `quantize` rounds the pixels to a grid that looks the same (`QUANT`: RGB to multiples of 4 in SVG cells and 8 in raster cells, partial alpha to multiples of 5, at most 2 off; alpha 0 and 255 and the RGB 0 of transparent pixels stay exact, as the straight-alpha mipmaps blend them into logo edges): SSIM 0.998 against the exact pixels, about 41% fewer bytes. Lossy WebP is not used: its 4:2:0 chroma visibly smears thin colored edges. Stored as lossless WebP (`WEBP`: effort 6, quality 100, the smallest lossless setting, with `exact`); the script checks the quantized pixels round-trip.
- All outputs are committed (like the troika fonts): the build needs no browser and the dev server serves them as is. `bun run build` and `build:web` run `bun scripts/logo-atlas.ts --check`, which fails when the content-derived logo order differs from the lock's `srcs` (a wall logo added, removed or moved, or an order that differs between locales), the generated manifest was edited, a logo file changed or an atlas setting changed (the lock's `sources` hash covers every source file, `QUANT`, `WEBP` and `RASTER_VERSION`, which you bump when `rasterize` draws differently); `tests/unit/logo-atlas.test.ts` checks the same.
- Runtime (`useLogoAtlas` in `floors/lobby/LogoQuads.tsx`): one `Texture` shared by both walls. The atlas is decoded off the main thread by `createImageBitmap` (straight alpha, no color conversion, rows flipped, so `texture.flipY` is off): the same texels as an `<img>` with `flipY`, without the synchronous straight-alpha re-decode Chrome does when it uploads an `<img>` (about 14 ms against 4 ms on a desktop). Browsers without a reliable `createImageBitmap` fall back to the `<img>` with `flipY`: `canDecodeAtlasBitmap` (`logoAtlas.ts`) mirrors three's GLTFLoader gate (no `createImageBitmap`, Safari before 17, Firefox before 98), and `atlasFlipY` sets `flipY` for each path (straight alpha is the `Texture` default). sRGB, anisotropy 4, straight alpha and mipmaps, as the canvas atlas had. The last wall to unmount disposes it. UVs come from the content-derived layout through `quadBuffers` and `orientedQuadBuffers`; a logo missing from the atlas is skipped.
- Cache: `/atlas/*` is immutable for a year (`public/_headers`); a changed atlas gets a new name.

## Highlights Hall

Code: `floors/lobby/hallLayout.ts`. Design: [`docs/superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md`](../superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md) Part 2.

### Layout

- Every hall position is an offset from `LOBBY_SLAB` (`hallX` 33, `halfZ` 27): the slab runs to x = 69.
- A lead road leaves the Lobby south of the certification wall (z = 21, 6 u in from the south edge, 8 u clear of the wall; from x = 24, 6 u east of the Agent Office wing's east edge) into a 24 x 38 u plaza (8 u to the north stations, 2 u to contact, 3 u to the experience arch).
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
- Gateway arch over the lead road at x = 38:
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

Design: owner decisions D1 to D7 ([2026-10-18](../decisions/2026-10-18-agent-office.md)); backend, contract and privacy in [office.md](office.md). Code: `floors/lobby/officeLayout.ts` (pure: the wing offsets and builder, layout, rooms, stops, view zone, road; config.ts imports it, so it stays import-light), `floors/lobby/officeShell.ts` (3D-only: `OFFICE_SLOTS`, `officeShellBoxes`, `officeBounds`, `wingBounds`, `officeSign`), `floors/lobby/office/` (the mount, the loader and two lazy chunks), shared client modules `src/lib/office/poll.ts` and `src/lib/office/model.ts` (counts, titles, tones, `sinceLabel`, and the link checks `safeGithubUrl` / `safeRepoUrl`: the 3D drawer and the Classic card link only github.com, else show plain text).

### Layout

The office has its own south wing of the L1 slab ([owner decision](../decisions/2026-10-20-agent-office-wing.md)), reached by a lead road from the Lobby plaza like the Highlights Hall. Everything derives from S, the Lobby's south slab edge (`LOBBY.bounds.maxZ` = `LOBBY_SOUTH_EDGE` in `floors/lobby/spawn.ts`, from `LOBBY_SLAB.halfZ`: 27): `OFFICE_WING` holds the offsets and `officeWing(S)` builds `LOBBY.officeWing` in config.ts, the one source every reader uses (layout, shell, chunk trigger, scene, e2e, scripts). The office functions take the wing (`officeSlots(w)`, `officeObstacles(w)`, `officeStops(w)`, `officeZone(w)`, `officeRoad(w)`, ...). x values are absolute.

| Item | Offsets from S |
|---|---|
| Wing rect (`FloorLayout.wings`) | x -12 to 18, z S to S + 29 |
| Lead road `office-lead` (8 u, inside the plaza's x -3 to 9) | x 3 (x -1 to 7), z S - 8 to S + 6 |
| Lead span (`leadSpan`, in `roadZone`) | x -1 to 7, z S - 8 to S |
| Wing plaza `office` | 18 x 16 centred (3, S + 9.5) |
| Office stop (every office room) | (3, S + 16.5) |
| Desk arc centre | (3, S + 11) |
| Screen wall centre line | S + 28.85 (front face S + 28.7, 4.5 u behind the middle Rover's back at S + 24.2), its footprint flush with the wing's south edge |
| Wing sign | over the wing plaza's centre at (3, S + 9.5), y 4.5; fades out at the office stop |
| Reveal (`wingBounds`) | x -12 to 18, z S - 8 to S + 29 |

- One continuous console: five desks (4.05 x 0.9 u, top at y 0.95) on an arc of radius 11 at 40, 20, 0, -20 and -40 degrees from +z toward +x (`OFFICE.angles`); the width closes the 20 degree step at the desks' back edge, so neighbours meet. Each Rover stands behind its desk (radius 12.2) facing the arc centre. Slot 0 (Desk 1) is the east end: the office stop looks south, so Desk 1 is the leftmost Rover from there, in the drawer's order. The 17 x 5.2 u screen wall (frame 0.2 u, bottom at y 1.2, top of the frame at y 6.6, 0.3 u thick) faces north, 4.5 u behind the middle Rover's back and 7.35 u behind the end ones (owner request 2026-10-20: a higher wall, more space between the console and the wall); from the office stop every Rover's head and antenna tip stays under the screen's bottom edge on the six tuned sizes.
- Obstacles (`officeObstacles`), all reaching back to the wing's south edge, so the space between the Rovers and the wall is open to the eye but closed to the rover (no drive ends up behind the console): the east end (desk 1 and its Rover), the middle (desks 2 to 4, from the front of desks 2 and 4), the west end (desk 5 and its Rover), touching each other, the wall frame, then the CI tower (`officeTower`, the south-east corner between the east end box and the wing's east edge, from the end box's north edge) and the ship dock (`officeDock`, the south-west corner, mirrored). The end Rovers' pace (0.4 u) and dock (0.35 u back) reach up to 0.24 u past their row boxes into these corners, never past the obstacles. The wall frame and the tower column (`officeTowerTall`: 2 x 2 u around `officeTowerColumn`, up to plinth plus column, 9.4 u) are camera columns (`FloorLayout.tall`, `officeTall`). The concave floor around the stop is open: in front of the console the row boxes hide 7.2% more than the desk and Rover footprints (cap 15%); behind it they reach 7.35 u back to the wall (behind the end Rovers).
- CI tower and ship dock (`OFFICE.tower` `{ column: 2, h: 9, plinth: 0.4 }`, `OFFICE.dock` `{ pad: 0.25 }`): the shell draws the tower's plinth over its whole corner, its 2 u column (1.5 u in from the corner's east and north edges, turned toward the stop: in frame from the stop on desktop sizes) and the dock's low pad over its corner (`officeDockPad`, its centre).
- Road: the wing's lead road and plaza join the L1 network as a second part beside the hall's; `roadZone` is `[HALL_LAYOUT.zone, wing rect, leadSpan]`, so a drive into or out of the wing follows the wing road and `roadRoute` crosses between the two parts ([floors.md](floors.md#network)). `Lobby.tsx` draws them with the hall's road kit (`RoadMarkings`, L1 green) and the floating "AGENT OFFICE" sign (`FloatingSigns`, `hud.rooms.office`, low over the wing plaza, its plate 0.9 u over the rover driving under it); on the full tier both mount once the composer exists, so no canvas-target program compiles.
- Reveal: `REVEAL.wing` (`wingBounds()`, the wing reaching north over the lead span) wraps the wing road, the sign and `OfficeMount`; the intro orbit is unchanged.
- View zone `L1:office`: a 4 x 2.8 u area around the stop (`OFFICE.view.half`) looking south (+z), per camera class (`cameraClass`):

  | Class | Zoom | Pitch | Look offset | Wall top | Console and Rovers | CI tower, dock |
  |---|---|---|---|---|---|---|
  | desktop (1440 x 900, 1280 x 720, 1180 x 820) | 1.285 | 0.26 (elevation 53 degrees) | `{ up: -1.25, hold: true }` | 15.0% | 42.4% to 61.8% | in frame |
  | tablet (landscape phones, 640 to 1023 px wide landscape screens: 960 x 640, 844 x 390) | 1.2 | 0.35 (58.6 degrees) | none | 17.7% (113 px on 960 x 640, 69 px on 844 x 390) | 45.8% to 66.4% | in frame |
  | mobile (portrait screens, phones and tablets: 390 x 844, 820 x 1180) | 1.42 | 0.2 (55 degrees) | `{ forward: -5.25 }` | 14.9% | 31.4% to 42.6% | the dock on 820 x 1180 only |

  Fractions of the screen height from the top edge, the same on every size of a class (`tests/helpers/office-frame.ts`, pinned by `tests/unit/office-view.test.ts`; the console band runs from the highest Rover head to the lowest desk corner); the visitor's Rover is in frame on every size. From the stop the office fills the frame (owner decision [2026-10-20](../decisions/2026-10-20-office-chip-row.md): the wall's top 12% to 15% from the top edge, the console and the Rovers 45% to 85% down, the CI tower and the dock in frame on desktop sizes, with the chips in a row under the top bar): each class takes the view closest to those targets that keeps the whole wall and the five desks across the screen, every Rover's head (and antenna) under the screen, the desks and the visitor's Rover over the bottom band, and every Rover's head in frame with the rover anywhere in the stop's zone (`tests/unit/office-chip-placement.test.ts`). The camera position and the aim span every view (moving the stop only moves the camera the zoom and pitch already reach), and:
  - desktop: the tower column and the dock pad in frame on 1180 x 820 (the narrowest desktop) hold the camera back to zoom 1.285, where the wall's top and the Rovers' heads stand at most 27.4% of the height apart: the heads start at 42.4% with the wall's top at 15%. The look target drops 1.25 u (`up`) and holds through a hand zoom (`LookOffset.hold`, [Orbit](3d-experience.md#orbit)), so the near pose zooms in about the same aim;
  - tablet: every target but the wall's top, with the plain aim (no look offset). The wall's top stands at 17.7%, past the 15% target on purpose: on these short screens 15% put it under the HUD's 62 px top bar on 844 x 390 (57 px) and under the chip row's names on 960 x 640; at 17.7% it clears the bar by 7 px and the row (66 px plus a 32 px chip) by 15 px (`tests/unit/office-view.test.ts` checks both, its ceiling is 18% for this class). The console starts at 45.8%, and the tower and the dock are in frame on both sizes;
  - mobile: width bound (the whole wall and the five desks across 390 px, and every Rover's head in frame from the zone's corners), so the office spans under a third of the height. The look target moves 5.25 u toward the camera (`ViewZone.lookOffset`); a hand zoom eases that offset out, so its near pose is the plain one.

  A `pitch` opts into the turn-back ([3d-experience.md](3d-experience.md)). No spot over the lead road keeps the wing sign's plate whole in every frame it shows up in, so it hangs over the wing plaza's centre: from the primed spawn it is whole on the four landscape sizes and out of frame on the two portrait ones, and on the lead road whole ahead of the rover (`office-chip-placement` projects it on the six sizes). At the office stop it would stand whole in the foreground (large on a desktop screen), so it fades out while the rover is in the `L1:office` zone area (`wingSignHidden` in `officeShell.ts`, the `FloatingSigns` visibility written by `Lobby`): the ghost outline's 0.45 s curve on frame deltas, a cut under reduced motion, out of the draw once faded, back on leaving.
- Ghost outline: from the wing the view looks south past the L1 slab edge, under the L2 slab, whose ghost outline (amber) crossed the office view. The floors above hide their outline while the rover is in the wing (`FloorLayout.hideGhostAbove: [wing rect]`) or the `L1:office` zone (`hideGhostAbove: true`), fading over the ghost floors' 0.45 s curve and cutting under reduced motion; on the lead road, at the spawn and everywhere else the outline stays ([3d-experience.md](3d-experience.md#orbit), `tower/ghostOutline.ts`). A faded outline leaves the draw. The tower frame (`Tower`, the indigo box edges around the whole tower) follows the same areas and curve (`inLookUnderArea`): its far bottom edge, under the L3 slab's south end, drew a full-width line at the horizon over the office wall.
- Clearances under the full 6 u `SPACE_RULES` (`tests/unit/lobby-office.test.ts`, `tests/unit/highlights-layout.test.ts` checks the Lobby with the wing): the row boxes touch each other and the wall, the two end boxes keep 10.46 u apart and 6.09 u from the wing's side edges, the wall frame 6.3 u; the tower and the dock touch their end box and the wing's side and south edges, and keep 3.68 u to the middle box and 0.21 u to the wall frame across the end box, which fills that strip (`gapFilled`); the observatory corner (-18, S) keeps 6 u to the wing's west edge; nothing stands within 6 u of x 18 to 24 at z S (the hall lead road after the L1 re-spacing); the lead road stays off the hall's road zone and clear of the kiosk. The stop sits on 6 u wide floor (`wideGrid`), reachable from the spawn and the elevator, 5.5 u in front of the middle desk, 3.72 u from the middle box and 12.2 u from the wall.
- `tests/unit/lobby-office.test.ts` also builds the wing for S = 27 (every z shifts by +6, every x stays).

### Chunks and mounting

- `OfficeMount` (main path, in the wing's `IntroReveal`) always draws the furniture shell (desk tops, legs, wall frame, the CI tower's plinth and column, the dock pad: `MergedBoxes` and `MergedEdges`), so the navgrid never holds an invisible desk, before the chunk loads or if it fails. The live scene fades in over 0.25 s the first time it shows (`OFFICE_FADE_IN`: its hashed-alpha materials' opacity and the glow's `uOpacity`, no new program; a cut under reduced motion), so the Rovers and the wall never pop in beside the shell.
- Two lazy chunks, loaded by `office/chunk.ts` (its two `import()` calls are the only references to them):
  - the scene (`office/scene.ts`, `loadOffice`): `OfficeScene`, `OfficeChips` and the live feed's test hooks. Every 0.5 s after the first frame went idle (`afterFirstFrameIdle`), `OfficeMount` asks `officeLoadWanted`: on L1 or riding there, speculative prefetch on, and either within `OFFICE.loadRadius` (25 u) of the stop (the rover, or `LOBBY.arrival` during a ride) or running a mission bound for the office (the Rover menu's `office` mission, `OFFICE_MISSION`, or a `goto:` an office room from a chip, a Rover or a palette result; from the ride on). The whole lead road and wing are inside the radius; the spawn (30.8 u), the elevator arrival (38.6 u), the visits door and the hall lead road are not, so a session that never heads south never fetches the chunk. `?prefetch=off` never loads it on its own; a failed speculative load is not retried by the trigger.
  - the drawer body (`office/body.ts`, `loadOfficeBody`): `OfficeBody`, loaded only when an office drawer opens. Its mount effect also starts (or retries) the scene load on every open, even with `?prefetch=off`.
- Two more lazy chunks, loaded by `office/watchLoader.ts` (main path, React only; its two `import()` calls are the only references to them; a failed import forgets its promise, so the next call retries):
  - the office watch (`office/watchChunk.ts`, `loadOfficeWatch`): `officeSignal.ts`, `officeWatch.ts` and the minimap's `OfficeCue`. `OfficeMount` loads it once the first frame went idle and the visitor is on L1 (or riding there; at once, or as soon as that happens later), with speculative prefetch on (`?prefetch=off` never loads it on its own), and runs `startOfficeWatch` while mounted once the module is here (also when the scene chunk or `__hq.office` loaded it). On import it mirrors `needsKurniadi` into the loader's `officeAsks` (`setOfficeAsks`, read by the minimap's label through `useOfficeAsks`) and loads the beacon chunk the first time a Rover asks (once per session; a failed load retries on the next ask). It counts in the 3D session total (`BYTES_3D_BUDGET.officeWatch`).
  - the beacon (`office/beaconChunk.ts`, `loadOfficeBeacon`): `OfficeBeacon.tsx` and `beacon.ts` (stage B's deploy beam joins it). Most sessions never load it; outside the session total (`BYTES_3D_BUDGET.officeBeacon`).
  - `OfficeScene` imports `officeSignal.ts` too (Turbopack copies it into each chunk that imports it; one instance at run time) and loads the watch chunk whenever it feeds the signal, so the minimap and the beacon follow a scene loaded first.
- None is a floor chunk or on the first-frame path. Never import their modules statically from the `Experience.tsx` closure or the HUD (`tests/unit/office-chunk-graph.test.ts`).
- The live scene mounts once loaded, on L1 (or riding there), with the full tier's composer live (`useComposerLive`), never in the middle of the intro (a load during the boot card mounts at once, so the reveal ring switches it on). Once mounted it stays. `INTRO_LANDMARKS` stays at five.
- `OfficeReady` precompiles and pins the office's programs like `HallReady`, then sets `__hq.probes.office.loaded`.

### Rendering (7 scene calls, no new program)

- Main path (2): shell solids and shell edges, on the observatory's programs.
- Scene chunk (5):
  - Rover parts and treads: two instanced unit-box meshes on `MeshStandardMaterial` with `alphaHash` (the player Rover's wheel program).
  - Faces (128 x 96 cells) and desk screens (256 x 160 cells): one quad mesh on one 1024 x 512 canvas atlas, the player face's material settings. The quads carry a `normal` attribute (unused by the basic material) so they share the wall's program.
  - Glow: one instanced holo mesh (`HOLO_MODE.dot`): antenna tips, halos and CI progress dots.
- Helper drones: one small drone per active helper (the desk's v2 `helpers`, `OfficeRoverView.helpers`, 0 when asleep, off duty, off or offline) orbits its Rover's head, at most 4 drawn (`DRONES` and the pure `dronePoint` in `office/crew.ts`: radius 1.15 u, evenly spaced, parked at fixed angles under reduced motion). Bodies are parts 6 to 9 of each Rover in the parts mesh (`PARTS_PER_ROVER` 10, `writeDrones`), eye lights 4 glow instances per Rover (`CREW_GLOW.eyes`, zero scale on the lite tier): no new draw call or program. The rest instances draw none. The drones ride on the glow key (`droneKey`: their count, parked under reduced motion; a 30 Hz tick in full motion), so a still office still writes nothing per frame.
  - Screen wall: one quad with its own canvas (1280 x 392 full, 1024 x 314 lite: 75 px per u on the full tier, the screen's 17 x 5.2 aspect).
- Atlas: no mipmaps, `LinearFilter`. The first paint draws every cell and uploads the whole atlas once; after that only cells whose frame key changed repaint into a cell-sized canvas copied into place with `renderer.copyTextureToTexture`. Faces redraw at most 5 fps (`FACE_FPS_MAX`, both tiers), desk screens at most 10 fps full and 5 fps lite.
- Wall: checked twice a second; its model rebuilds only when the feed or the locale changed or a second passed, and the texture redraws only when its content or spinner changed.
- Per-frame work runs only while the office is in view on L1 (a frustum test of its bounds every 0.5 s, `officeRuntime.inView`). Instance-matrix, face-quad and glow writes are skipped when no pose, glow key or camera changed, and run through `whenDrawn`; the atlas paints only while the office is drawn (`shownInScene`), and the wall redraws through `whenDrawn`.
- Reduced motion holds still poses and crossfades faces and screens over 0.4 s on a state change (full motion cuts).
- The wing adds 2 slab calls (its box and grid) and the wing road's `RoadMarkings`. Measured with the office loaded: L1 settled at the spawn 100 scene calls lite and 102 full (cap 125), at the office stop 44 and 46 (the wing sign, the tower frame and the outlines of the floors above leave the draw there); programs within the baseline.

### States, chips and rooms

- Nine states (D5): `OFFICE_STATE_STYLE` (`office/officeVisual.ts`: face, desk screen and tone per state) with the tones in `STATE_TONE` (`src/lib/office/model.ts`); `STATUS_COLOR` (GitHub board statuses) lives in `officeVisual.ts` too, so the drawer body chunk stays off the canvas code. The input screen shows "Waiting for Kurniadi", never a question or prompt; the working screen scrolls invented code. Every Rover sleeps when the office is off, disabled or offline; a desk without a session (every desk when semi-live, GitHub only) is an off-duty Rover asleep.
- HTML chips (`OfficeChips` in the scene chunk, mounted by `hud/OfficeLayer.tsx` on the main path once the chunk is loaded, on L1, not riding, while exploring or with a drawer open), laid out by `OfficeScene` every frame through `officeRuntime.chips` and `officeRuntime.leads` (HintProbe pattern; owner decision [2026-10-20](../decisions/2026-10-20-office-chip-row.md)):
  - one compact row pinned under the HUD's top bar (`OFFICE_CHIP_TOP`: 66 px desktop, 64 px phones; the top row ends at 62 px from 768 px wide and at 58 px on a narrower phone), each chip centred on its Rover's projected head (`OFFICE_CHIP_ANCHORS`: each Rover's head top, `OFFICE_ROVER_HEAD_TOP` 1.95 u, in `officeShell.ts` on the main path with the other chip constants);
  - `layoutChipRow` (`officeShell.ts`, pure, allocation-free) keeps the chips in the order of their heads (the desk order in the office view) and nudges overlapping neighbours apart along x, `CHIP_ROW.gap` (6 px) apart, by the least total squared displacement (a crowded run centres on its heads' mean), then shifts the row inside its bounds as a whole; `chipRowBounds` keeps it `CHIP_ROW.edge` (8 px) inside the screen edges and past every HUD box in the row's 44 px band (`officeHudBoxes`: the desktop profile card and floor menu panel, the Corners minimap and joystick), and `chipMaxWidth` caps a chip at 176 px or less, so five always fit (`OfficeWatch` writes that cap as the chip's inline max width when it changes);
  - a leader line per chip (a 1 px HTML element in the state's colour at 60% opacity, no draw call, no transition) from the chip's bottom centre to its Rover's head, drawn while the head sits 8 px or more under the chip and the whole line crosses no HUD box (`segmentHitsBox`, pure, shared with the test); styles are written only when a value changes;
  - a state dot and the agent's name ("Off duty" without one) far; the activity added near ("<Agent> · <activity>", a longer line ends in an ellipsis); a CI progress bar near while CI runs. The label keeps the full text at any distance (`chipLines`: "Desk <n>: <agent> · <activity>, <title or Client project>, <done> of <total> jobs");
  - near/far band 32/34 u from the camera to the Rover's head (`OFFICE_CHIP_FAR` 33, `OFFICE_CHIP_FAR_BAND` 1): at the stop, with the rover anywhere in the stop's zone, the desktop camera sits 34.8 u or more from every head, and one zoom step brings all five within 29.4 u; a chip starts far and turns far again whenever it hides, and a far chip turns near only while the camera holds still (`roverRuntime.cameraSettled`), so the wider near chips never push the row about during a zoom;
  - one line at any zoom (`chipsOneLine`): on phones (the HUD's mobile class, portrait and landscape) every chip is a compact dot (the state dot alone in a 32 px pill), and where five 176 px chips would not fit the row (960 x 640, a portrait tablet) every chip keeps the name;
  - `tests/unit/office-chip-placement.test.ts` lays the row out from the stop camera at 1440 x 900, 1280 x 720, 1180 x 820, 820 x 1180, 960 x 640, 390 x 844 and 844 x 390 with conservative chip sizes and the measured HUD boxes: every chip shown and far at the stop and anywhere in its zone, near (or one line) at the near pose (one zoom step on desktop and tablet cameras, two on a portrait screen), and on every frame of a hand zoom, a turn and reduced motion: under the top bar, clear of the HUD boxes and each other, in order, nudged only to make room, the leader lines clear of the HUD boxes and the other chips;
  - chips show only while the rover is at the office stop (the `L1:office` view zone area, `atOfficeStop`) or an office drawer is open (`officeChipsHere` in `officeShell.ts`): from the Lobby, the lead road and the rest of the wing the office is a backdrop. The office stays in view there (its wall and Rovers animate, the feed polls);
  - how they show there follows the camera (`officeChipMode`, from `roverRuntime.cameraView` and `cameraHeld`, written by `CameraDirector` through `holdZone`, [Orbit](3d-experience.md#orbit)): in full once the camera holds the office view; hidden while that view is applied but the camera has not come to rest in it (arriving, so the row and its leaders do not slide while the camera swings in; a device rotation; a portrait screen's hand zoom, which eases its look offset out); once held, a hand zoom on a landscape screen or the rover moving inside the zone keeps them shown; and as compact dots in the row on every screen when the office view does not apply (reduced motion, a hand turn, drag or key turn inside the zone, first person, an office drawer open away from the stop);
  - a chip whose Rover's head is off screen hides; a hidden chip is written once (and turns far), then left alone until it comes back into view; all chips hide on phones while a drawer is open.
- Rooms: `L1:office` (the summary half of the wall, the east half seen from the plaza), `L1:office-github` (the west half), `L1:office-desk-1` to `-5` (per Rover); point-and-go targets `L1:station:office`, `L1:station:office-github`, `L1:station:office-desk-<n>` (registered by `OfficeScene` with `registerExtraInteractables`, `office/interact.ts`), all driving to the stop; a chip click does the same. Every office room keeps `/{locale}` (`isOfficeRoom`). The Rover menu mission `office` ("Watch the AI agents at work") opens the summary.
- Crew summary (summary drawer, `office/crewSummary.ts`, body chunk only): a screen-reader-only (`sr-only`) "Crew now" list, one sentence per desk (`crewLines`: "Desk 2: Claude is waiting for Kurniadi, since 14:02", `office.3d.crew.line` with the clock time from `Intl.DateTimeFormat(locale, { timeStyle: "short" })`, no time when the office sleeps; "Desk 5: off duty"), and a visually hidden `role="status"` `aria-live="polite"` paragraph (`useCrewNews` in `OfficeBody`, Strict Mode safe) that announces only changes since its last announcement, at most one announcement per 10 s, silent on open (`crewAnnouncement`): one sentence when the view mode changes (`office.3d.crew.mode.<mode>`), else the desks whose state changed (`office.3d.crew.change`; never activity, title or keepalive refreshes; off-duty desks are not announced). Strings: `office.3d.crew.*` (`title`, `line`, `offDuty`, `change`, four `mode` sentences, nine `state` phrases), both locales.
- Polling (`src/lib/office/poll.ts` through `office/live.ts`, `GET /api/office?v=2` parsed by `parseOfficeResponseV2`, so desks carry `helpers`): every 10 s while a desk of a live snapshot is awake, 30 s when semi-live, off, all asleep or without a snapshot; only while the office is in view on L1 (reason "view") or an office drawer is open ("drawer") and the tab is visible; visitor input resets a 10 minute idle stop, and the tab turning visible fetches at once; after errors the last snapshot stays 60 s, then "offline".
- Office watch and signal (watch chunk, `office/officeWatch.ts` and `office/officeSignal.ts`; never import the protocol module, the content schema or zod there): `OfficeMount` starts the watch once the first frame went idle and the watch chunk loaded (see Chunks and mounting) and stops it on unmount. It fetches `GET /api/office` at once, then every 30 s, only while the visitor is on L1 (not riding), the tab is visible at tick time (`document.visibilityState`), there was input in the last 10 min and the scene's poller is not running (`sceneFeeding`); only the newest answer applies. `signalFromBody` (v1 or v2 bodies) reads only `enabled`, the desk slots asking (`input`) and the newest deploy success at most 30 s old, with tiny guards (null on anything malformed, never throws, keeps no text). While the scene chunk's poller runs, `OfficeScene` feeds the signal from its own feed (one request stream) and sets `sceneFeeding`. Whoever feeds it, `setOfficeSignal` arms a module-level timer that clears `asking` and `deployAt` 60 s after `goodAt`, whether or not the watch or the scene still runs (riding off L1 unmounts the Lobby); stopping the watch clears them at once (never a stale beacon).
- Needs Kurniadi beacon (beacon chunk, `office/OfficeBeacon.tsx`, pure `office/beacon.ts`): one instanced mesh (`BEACON.slots` 5: the column, three bands, slot 4 kept at zero size for stage B's deploy beam) of `STAGE_KIND.beam` instances over the unit open cylinder on the hall's stage material (`createStageMaterial` from `HallFx.tsx`, on the main path; instance colors like the hall, so no new program; additive is GL state). The stage shader reads only the position from the instance matrix and the shape from `aStage` (height, radii) and the alpha from `aStage2.w`, so the frame writes those, never a scale. A column 1.6 u wide (`BEACON.r` 0.8) and 26 u tall rises 1.25 u behind the asking Rover (`beaconOrigin`; the wing plaza's centre when several ask), with three 0.3 u bands climbing it and widening every 1.6 s (held at a quarter, a half and three quarters under reduced motion), in the input tone (`COLORS.pink`, equal to `STATE_TONE.input`). Its frame reads `needsKurniadi` from the signal and leaves the draw (`visible` false) while nobody asks, so it costs 1 call only while lit; at the office stop it dims to 25% (`beaconGain(atOfficeStop())`, the flag carries the signal there). `OfficeMount` mounts it, inside the wing's `IntroReveal`, once its chunk loaded (`useOfficeBeaconModule`) and `ready` (the full tier's composer exists, like the intro beacons), so the precompile builds no canvas-target program; once mounted it stays. Probe `__hq.probes.office.beacon` (lit, every frame). `tests/unit/office-beacon-view.test.ts` (cameras from `tests/helpers/office-cameras.ts`): at least 30% of the column shows from the primed spawn on every landscape size but the 960 x 640 tablet viewport (desks 1 to 3 fall outside its frame); that viewport and the portrait sizes from the spawn, the elevator arrival and the hall lead road never show it (the wing is behind those cameras), and the minimap cue carries the signal there.

### Probes and tests

- `__hq.office`: `load()`, `loadBody()`, `state()`, `asks()` (trigger asks after the first frame went idle: the `?prefetch=off` proof), `watchNow()` (loads the watch chunk, waits until a watch runs (OfficeMount starts it on L1), then one tick of it, its gates apply; resolves once applied), `loadWatch()` and `loadBeacon()` (load the watch or beacon chunk: the bytes gate), `test()` once loaded (`feed`, `poll`, `advance`, `wanted`, `settled`).
- `__hq.probes.office`: `loaded`, `desks`, `states`, `mode`, `wallFrames`, `chips`, `bob`, `inView`, `polling`, `drones` (drawn helper drones per slot).
- Unit: `lobby-office`, `office-rooms`, `office-model`, `office-poll`, `office-visual`, `office-rig`, `office-atlas`, `office-frame`, `office-view`, `office-wall`, `office-runtime`, `office-chip-placement`, `office-chunk`, `office-live`, `office-interact`, `office-chunk-graph`, `office-signal`, `office-watch`, `office-watch-loader`, `office-beacon`, `office-beacon-view`, `office-crew-summary`, `office-drones`; jsdom: `tests/hud/OfficeChips.test.tsx`, `tests/hud/OfficeBody.test.tsx`. E2E: `e2e/office.spec.ts` with snapshots from `e2e/office-fixtures.ts`; perf: the L1 and B1 gates load the office first, plus the office stop spot ([performance.md](performance.md)).
- Owner captures: `bun scripts/office-shots.ts` (not committed).

## Rover menu kiosk

Code: `floors/lobby/kiosk.ts`. The kiosk lines up straight, radially into the hologram circle (owner decision).

- Body, stand and screen are one group turned by one yaw (`KIOSK.yaw`) that faces the hologram.
- The screen is centered on the body and only tilts back.
- Lines never wrap: `kioskFontSize` fits the longest line, `fitLine` ends longer ones in "...".
- Placement: on the kiosk axis (`LOBBY.kioskAxis`: the unit direction from the hologram to the Visitor Observatory), 22.5 u from the hologram (its front about 6 u past the lane ring, its box 6 u from the observatory).
- Lane spoke (`Lanes.tsx`): one straight radial segment ending 0.4 u in front of its front (`kioskLaneEnd`).
- Obstacle and pick volume: the axis-aligned box of the turned footprint (`kioskRect` in config.ts, `kioskBounds`).
- Point-and-go stop: `kioskStop()`, on the axis 3 u in front of the screen.
- Session spawn: that stop (`LOBBY.spawn`, heading `LOBBY.spawnHeading` toward the screen; both from `floors/lobby/spawn.ts`, with the kiosk axis, so the store reads them without the floor layouts), so the first rover placement is in front of the kiosk (owner decision).
- `tests/unit/kiosk.test.ts` checks the shared yaw, the centering, the straight spoke and the spawn.

## Lobby views

Code: `floors/lobby/observatoryLayout.ts`.

| Zone | Where | Camera |
|---|---|---|
| `L1:kiosk` | the spawn | desktop 0.62 rad off the kiosk axis at zoom 1.7 (landscape tablets 1.8, phones and portrait tablets 1.85), so the hologram's name, the rover at the kiosk and the observatory panel all read; tablets and phones straight down the axis through `ViewZone.classView` |
| `L1:arrival` | the elevator arrival point `LOBBY.arrival` (-6, 0), just inside the lane ring's west point | behind the rover, looking east at the hologram and the stats ring (`arrivalOnly`, `travel` east); zoom 1.03, phones 0.88, the widest views that keep the camera east of the glass shaft |
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
