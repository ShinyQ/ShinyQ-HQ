# L1 Lobby

The L1 Lobby floor: the certification wall, the Highlights Hall, the Rover menu kiosk and the Lobby camera views.
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
  - issuer logos: one mesh over the shared prebuilt logo atlas (`orientedQuadBuffers`, see [Logo atlas](#logo-atlas));
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
- One `BatchedLabels` (title, headings, one text block per sub-column) and one `LogoQuads` (a logo for every item, over the prebuilt [logo atlas](#logo-atlas)): no extra draw call or program.
- Colliders, the point-and-go bounds, the stop (`host3d.ts`, 2.6 u in front) and the lane spoke derive from `LOBBY.skillsWall`.
- The `L1:skills` view zone (`camera/orbit.ts`) frames the whole wall at zoom 1.7 (phones 1.15 through `classView`: closer so the text reads, and the visitor pans). Like every zone it does not turn the camera under reduced motion.

## Logo atlas

- Both walls draw their logos from one prebuilt image, `public/atlas/logos.<hash>.webp`, with its manifest `src/experience/logo-atlas.json` (`file`, `cols`, `rows`, `cell`, `pad`, `sources`, `srcs`). One request instead of one per logo, and no canvas drawing on the main thread.
- `bun run logo:atlas` (`scripts/logo-atlas.ts`) writes both. Order: `atlasLayout(wallLogoSrcs(data))`, the skills wall items, then the certification issuers, deduped. Each logo is drawn by headless Chromium with the canvas code the runtime used before: 128 px cells (`ATLAS_CELL`), `atlasPad` (6%, 8 px) on every side, contain fit, centered. On macOS it uses Chrome's GPU raster (Metal, as the visual gate draws), so the cells match the runtime canvas pixel for pixel; elsewhere it falls back to SwiftShader, whose software raster anti-aliases SVG edges slightly differently, so regenerate on macOS. Stored as lossless WebP (effort 6, quality 100: the smallest lossless setting) with `exact` (the RGB of transparent pixels stays, it feeds texture filtering at logo edges); the script checks the pixels round-trip.
- Both outputs are committed (like the troika fonts): the build needs no browser and the dev server serves them as is. `bun run build` and `build:web` run `bun scripts/logo-atlas.ts --check`, which fails when a wall logo was added or removed, the grid changed or a logo file changed (the `sources` hash covers every source file); `tests/unit/logo-atlas.test.ts` checks the same.
- Runtime (`useLogoAtlas` in `floors/lobby/LogoQuads.tsx`): one `Texture` shared by both walls. The atlas is decoded off the main thread by `createImageBitmap` (straight alpha, no color conversion, rows flipped, so `texture.flipY` is off): the same texels as an `<img>` with `flipY`, without the synchronous straight-alpha re-decode Chrome does when it uploads an `<img>` (about 14 ms against 4 ms on a desktop). Browsers without `createImageBitmap` fall back to the `<img>`. sRGB, anisotropy 4, straight alpha and mipmaps, as the canvas atlas had. The last wall to unmount disposes it. UVs come from `LOGO_ATLAS` (the manifest) through `quadBuffers` and `orientedQuadBuffers`; a logo missing from the atlas is skipped.
- Cache: `/atlas/*` is immutable for a year (`public/_headers`); a changed atlas gets a new name.

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

- During the boot and the intro the Lobby is dark: each landmark sits in an `IntroReveal` with its floor rect (hologram and stats ring, skills wall, certification wall, kiosk, observatory, Highlights Hall) and switches on, with a quick neon flicker (on 0.06 s, off until 0.14 s), once the reveal ring around the rover reaches it (`revealDistance`). The grid and the lanes mask themselves in their shaders, so `Lanes` is not wrapped.
- Outside the intro (`introRuntime.active` false: explore, a skipped intro, the reduced-motion fade) every landmark shows.
- `IntroReveal` writes `visible` per frame from `introRuntime`, never through React state. three's `compile` prepares the programs of hidden objects too (it only gathers lights from visible ones), so the boot precompile builds and pins the hidden landmarks' programs; their buffers and textures still upload on the first frame they draw.
- Beacons: `IntroBeacons` is one instanced holo mesh (`HOLO_MODE.beacon`, 5 instances, `aAlpha`) lying on the floor under the five `INTRO_LANDMARKS` (stats, skills, hall, observatory, elevator). After `INTRO.wake` each landmark pulses once (`beaconAlpha`, gone by 2 s) the first frame it projects within `|ndc.x| < 0.55`, `|ndc.y| < 0.75`, and its id goes into `introRuntime.lit` (probe `__hq.intro.lit`; the e2e intro test expects at least three on the lite desktop view; the narrow tablet and phone frames never centre `hall`, so they pulse four).
- `Lobby` mounts the beacons only while `phase` is `intro`, and on the full tier only once the lazy composer exists: mounted earlier, the frame-3 precompile would build a second, canvas-target holo program.
