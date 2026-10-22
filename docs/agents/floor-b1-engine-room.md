# B1 Engine Room

The B1 Engine Room: the basement floor under the Lobby, its layout, stations, scenery, drawers, access and draw budget.

Index: [AGENTS.md](../../AGENTS.md). Shared floor rules: [Floors](floors.md). The Classic counterpart is `/{locale}/build` ([content.md](content.md#accessors-and-types)).

## Layout

- `buildEngineLayout()` in `floors/engine/layout.ts` (pure, no React or three) returns the `FloorLayout`, the road network, `bays`, `racks`, `reactor`, `workbench` and `callPad`. `ENGINE` holds the numbers.
  - Bounds x -24 to 70, z -14 to 14. The door and the call pad stand in front of the elevator (`callPad` x -24 to -16, z -4 to 4, kept free).
  - One aisle (`aisle`, 8 u wide) runs east from the approach (-21, 0) to x 46 and carries the seven bays.
  - Seven bays (`ENGINE_BAYS`, 8 u wide, 6 u deep, 4.6 u high) alternate north and south, starting at x -10 in 7 u steps (north for even indices).
  - All seven bays are stations (`ENGINE_STATIONS` equals `ENGINE_BAYS`): blueprint, timeline, agents, gates, dashboard, brain (Rover's Brain) and rejected (Rejected Designs), each with a room, a door and a pad.
  - The bay order equals `STATION_IDS` of `src/content/build-story.ts` (a unit test checks it; the ids are repeated because that module is server-only).
- Each station has a door pad 1.1 u inside its front and a 4 u spur from the aisle. Doors are `station`s (`DoorTrigger.facing` looks into the bay), rooms `B1:<station>`.
- Server rack rows (`engineRacks`) fill the wall gaps between neighbouring bays on the same side.
- The reactor hall ends the aisle: the reactor core (`ENGINE.reactor`, center (57, 0) on the aisle axis, obstacle x 52 to 62, z -5 to 5, 6 u past the aisle's end) is room `B1:reactor` (`ENGINE_REACTOR_ROOM`), not a bay and not a build-story station. Its door pad is at (50, 0) facing east (`ENGINE.reactorDoor`), at the end of a 4 u spur from the aisle's end; its point-and-go target `B1:station:reactor` covers the core's footprint.
- The workbench (x 42 to 50, z -14 to -11) stands at the hall's north-west, flush with the north wall, out of the core's shadow: 6 u from the Rejected Designs bay and about 6.3 u from the core; its wall screen faces south into the hall.
- The Express Return pad is at (40, 9) (`ENGINE.returnPad`, see [Fast return](floors.md#fast-return)).
- Arrival is (-8, 0) (`ENGINE.arrival`, also `spawn`): east of the shaft-clear line, as on RF. Zone `B1:arrival` is the shared arrival zone ([Arrival](floors.md#arrival)): eastbound only, `arrivalOnly`, zoom 0.95.
  - Phones (camera class mobile, owner review 2026-10-18) use `ENGINE.arrivalPhone`: the camera turns 75 degrees to the north side of the rover, zoom 0.85, pitch -0.2 below the rig's elevation. It looks across the aisle at the Blueprint and Build Timeline signs, both whole (a portrait view straight down the aisle cut every sign at the edges; no pose down the aisle shows two signs readable). Driving out of the zone eases the camera back to east with a level pitch.
- Zones: one per station (`B1:<station>`, on the door pad, the camera on the aisle side looking into the bay), `B1:reactor` (aisle end to the core, x 46 to 52, eastbound only, looking east at the core) and `B1:workbench` (between the aisle and the bench, x 42 to 50, z -11 to -4.5, looking north at the bench, so the follow camera stands over the open aisle, never behind the core).
- Obstacles are the bay rects, the racks, the reactor and the workbench; the navgrid, door triggers, camera collision and the scenery all read the same layout.

## Scenery

- `EngineRoom` (`floors/EngineRoom.tsx`, root group `engine-room`) reads `buildEngineLayout()` and the pure `engineScenery` / `engineSigns` (`floors/engine/scenery.ts`):
  - the aisle through the shared road kit (`RoadMarkings`); cable trays over the aisle edges stop 1 u short of the reactor;
  - one merged solid mesh and its edges (`MergedBoxes`, `MergedEdges` from the roof kit): bay shells, station props, racks, the workbench;
  - `FlowMesh` (`engine/EngineFx.tsx`, holo `strip`, one instanced draw) for ceiling pipes and their drops, cable trays, bay front strips and rack LEDs, with a slow pulse along x and a random phase per instance;
  - the pipe runs hang over the back walls (`PIPE_Z`), held by brackets on each bay's back corners, and their drops meet the back walls, so from the aisle no bracket or drop stands in front of a station sign (a front bracket used to cut the Agents sign on arrival);
  - `PanelMesh` (holo `fall`, one instanced draw) for the screens: the blueprint table top, the timeline wall, the agent monitors, the dashboard wall, the Brain's chunk grid, the Rejected scrap panels (tilted by `PanelInstance.roll`, a roll about the screen's normal) and the workbench wall;
  - station props in the same merged and instanced draws: the blueprint table, the timeline screens, the agents desk, the gate cabinets, the dashboard wall, Rover's Brain (a server column beside a back-wall grid of cyan retrieval chunk screens and one violet answer screen) and Rejected Designs (a scrap rack of dim tilted panels and one amber panel);
  - `FloatingSigns` for the bay names (all amber) and the workbench title and subtitle; no word is painted on the floor.
- Pipes and trays stay calm so the station signs lead: the ceiling is 7.4 u (`ENGINE.ceiling`), runs are thin dim warm lines (pipe tone `#7c2d12`), trays a dim warm strip with a faint cyan data line.
- The lite tier draws half the LEDs (`engineDetail`). Reduced motion freezes `uTime`, so nothing pulses.
- Floor-only code: `useDispose` after every memoized geometry and material; no new light, material or shader program (reuses the holo program).

## Drawers

- Clicking a station (point-and-go `B1:station:<station>`) opens the Glass Drawer for room `B1:<station>`.
- Views come from `buildEngineViews` (`content/room-views/engine.ts`): the build story and the build-time snapshot through the Classic page helpers (`src/lib/build-page.ts`), so a number shows only when the snapshot carries it.
- They live in their own static file, `/data/rooms/b1-<locale>.json` (with its `?v=` content hash), never in a public floor's file. `DrawerHost` fetches it (`loadFloorViews(locale, "B1")`) only once B1 is unlocked (on idle after the rover's floor, or at once when a `B1:` room opens) ([hud-and-drawer.md](hud-and-drawer.md#builders-and-data)).
- `EngineBody` (`hud/drawer/EngineBody.tsx`, in the B1 chunk) renders `RoomView.engine`: a diagram (the Blueprint's site map or the Brain's Ask pipeline), the rounds timeline, the gate list, the plan excerpt, the dashboard tiles or the rejected ideas (title, what was tried, why it was dropped, the pull request when it is linkable), around the generic sections. Each drawer links its Classic section `/{locale}/build#<station>`.
- Story rules (`content/build-story.json`, `BuildStorySchema`): rounds are contiguous pull request ranges, only the last one open; a gate has `where` (`ci`, `nightly` or `local`; a local gate names no job and is never required); Rejected Designs hold 8 to 14 ideas; pull requests whose diff shows a client name (26, 288) are counted but never linked (`unlinkedPrs`), in the timeline and in the ideas. The blocklist is gone, so new story text is checked for client names by hand.
- Each diagram (Blueprint, Brain) ships laid out twice: `layout` (`DIAGRAM_PRESETS.phone`, 318 px) and `wide` (`DIAGRAM_PRESETS.drawer`: top to bottom, three nodes per band, every text at least 12 px, at most 492 px). `Blueprint` in `EngineBody` (used for both) measures its figure before paint and on resize (a `ResizeObserver`, no new CSS) and draws `wide` once the figure is as wide as it: the 560 and 600 px side drawers; phones, the 480 px drawer and the drawer next to the Ask panel keep the phone layout.

## Access

- B1 is reachable only when the store's `b1Unlocked` is set. A visitor unlocks it by reaching all five public floors in explore (`withFloorSeen`, `watchFloorVisits` in `src/experience/b1.ts`; B1 never counts); the store persists `floorsSeen` and `b1Unlocked` in `hq:v1`, so the floor stays open on later visits ([3d-experience.md](3d-experience.md#persistence-and-storage)).
  - The fifth floor also starts the one-time unlock moment: a chime, Rover's offer and a pulsing B1 row ([Unlock moment](hud-and-drawer.md#unlock-moment)).
  - `/{locale}#B1` on the Lobby route starts on B1 when unlocked (`b1FromHash`, `startFloor`; after the intro it continues there); locked, the visitor stays in the Lobby and Rover says how to unlock it (`engine.lockedLine`). Cmd-K lists "Go to B1 Engine Room" in the 3D tower: unlocked it rides there, locked it says the same locked line.
  - `?unlock=b1` stays for dev and tests (`b1UnlockFlag`, applied by `Experience.startSession`): always in a dev build, in production only with `debug` (`?unlock=b1&debug=1`). It unlocks the session only: it is never persisted, never counts floors and never triggers the unlock moment.
- Locked, the elevator rows, the floor picker and the floor sheet show a padlock row "B1" with "Visit all 5 floors (n/5)" (`aria-disabled`, no ride). Nothing else of B1 shows: no tower floor, no chunk or drawer data request, and the store refuses a ride to it (`canEnterFloor`) and `openRoom` of a B1 room is a no-op. A language-switch resume to B1 is dropped while locked.
- Locked sessions load no B1 chunk and no B1 drawer data, and mount no B1 DOM or scene objects. The bay titles (`ExperienceData.engine`, about 0.4 KB) ride in the page data, the B1 UI strings in the 3D-only `engine` message namespace ([styling-and-i18n.md](styling-and-i18n.md#client-messages)), and the main 3D path grew about 0.9 KB for the floor (layout, hum layer, store) and 1.0 KB for the unlock (visit tracking, locked rows, moment).
- B1 has no route of its own: its URL stays `/{locale}`, and station drawers are remembered in the history entry. Browser Back closes an open station drawer (the popstate handler compares route floors with `routeFloor`, B1 being L1's `/{locale}`, not floor ids).

## Draw calls

- Scene calls: the road kit, one merged mesh and its edges, two instanced holo draws and the floating sign pair.
- Settled on B1: 45 scene calls and 8,420 triangles on lite, 48 and 9,335 on full (with seven stations), with 43 and 81 shader programs on CI (`e2e/perf/baseline.json`; B1 is measured after riding down from the Lobby, so its count includes the Lobby's programs, like L1 full at 81).
- `FLOOR_SCENE_CAPS.B1` caps it at 100; the worst ride to B1 draws up to 119 scene calls and 136 whole-frame calls (budget 150) and about 26k triangles at most.
- The B1 chunk (EngineRoom, EngineBody) is 5.3 KB gzip (cap 16 KB). The cap counts B1 plus any modules it shares with the public floors (`?prefetch=off` never loads L3, L4 or RF first), a safe over-count.

## Sky and sound

- No sky underground: while `underground(roverY)` (rover y below `UNDERGROUND_BELOW`, -0.5) the sky group is hidden and the night state holds (`skyRuntime.underground`, `__hq.sky.underground`).
- Ambience: a low machine hum layer (`AMBIENCE_LAYERS.B1` in `lib/audio/ambience.ts`: detuned sawtooth pairs on C2 and G2 under a lowpass, a band-passed noise bed and a soft relay tick every 3 to 6 s), crossfaded like the other floors and, like them, replacing Deep Space Ambient while it plays. It sits about 6 dB under the other floor layers (owner, 2026-10-18): `B1_HUM_LEVEL = FLOOR_TONE_PEAK * B1_UNDER_FLOORS` (0.05 x 0.5), with the air bed and tick scaled with it.

## Tests and captures

- Unit: `tests/unit/engine-layout.test.ts`, `engine-scenery.test.ts`, `engine-views.test.ts`, `b1-unlock-flag.test.ts`, `floor-chunks-graph.test.ts`, `arrivals.test.ts`; the unlock (PR 3): `tests/unit/b1-visits.test.ts`, `b1-deep-link.test.ts`, `tests/hud/EngineUnlockLayer.test.tsx`.
- E2E: `e2e/engine-room.spec.ts` (the flag, a locked session, rides from the Lobby and the roof, every station's drawer), `e2e/memory.spec.ts` (Lobby to B1 round trips), `e2e/b1-unlock.spec.ts` (the locked row, the unlock moment, deep links, Cmd-K); the helpers are in `e2e/b1.ts` (`B1_QUERY`, `enterB1Route`, `rideTo`).
- Captures for review: `bun scripts/b1-shots.ts --base <url> --out <dir>` (arrival, aisle and each station's drawer, desktop full and phone lite).
