# B1 Engine Room

The B1 Engine Room: the basement floor under the Lobby, its layout, stations, scenery, drawers, access and draw budget.

Index: [AGENTS.md](../../AGENTS.md). Shared floor rules: [Floors](floors.md). The Classic counterpart is `/{locale}/build` ([content.md](content.md#accessors-and-types)).

## Layout

- `buildEngineLayout()` in `floors/engine/layout.ts` (pure, no React or three) returns the `FloorLayout`, the road network, `bays`, `racks`, `workbench` and `callPad`. `ENGINE` holds the numbers.
  - Bounds x -24 to 48, z -14 to 14. The door and the call pad stand in front of the elevator (`callPad` x -24 to -16, z -4 to 4, kept free).
  - One aisle (`aisle`, 8 u wide) runs east from the approach (-21, 0) to x 38 and carries the seven bays.
  - Seven bays (`ENGINE_BAYS`, 8 u wide, 6 u deep, 4.6 u high) alternate north and south, starting at x -10 in 7 u steps (north for even indices).
  - Bays 1 to 5 are the stations (`ENGINE_STATIONS`: blueprint, timeline, agents, gates, dashboard); bays 6 and 7 (brain, rejected) are dark: no room, no door, no pad.
  - The bay order equals `[...STATION_IDS, ...COMING_SOON_IDS]` of `src/content/build-story.ts` (a unit test checks it; the ids are repeated because that module is server-only).
- Each station has a door pad 1.1 u inside its front and a 4 u spur from the aisle. Doors are `station`s (`DoorTrigger.facing` looks into the bay), rooms `B1:<station>`.
- Server rack rows (`engineRacks`) fill the wall gaps between neighbouring bays on the same side; the workbench (x 44 to 48, z -5 to 5) is flush with the east edge.
- The Express Return pad is at (40, 9) (`ENGINE.returnPad`, see [Fast return](floors.md#fast-return)).
- Arrival is (-8, 0) (`ENGINE.arrival`, also `spawn`): east of the shaft-clear line, as on RF. Zone `B1:arrival` is the shared arrival zone ([Arrival](floors.md#arrival)): eastbound only, `arrivalOnly`, zoom 0.95.
  - Phones (camera class mobile, owner review 2026-10-18) use `ENGINE.arrivalPhone`: the camera turns 75 degrees to the north side of the rover, zoom 0.85, pitch -0.2 below the rig's elevation. It looks across the aisle at the Blueprint and Build Timeline signs, both whole (a portrait view straight down the aisle cut every sign at the edges; no pose down the aisle shows two signs readable). Driving out of the zone eases the camera back to east with a level pitch.
- Zones: one per station (`B1:<station>`, on the door pad, the camera on the aisle side looking into the bay) and `B1:workbench` (the aisle end, eastbound only, looking east).
- Obstacles are the bay rects, the racks and the workbench; the navgrid, door triggers, camera collision and the scenery all read the same layout.

## Scenery

- `EngineRoom` (`floors/EngineRoom.tsx`, root group `engine-room`) reads `buildEngineLayout()` and the pure `engineScenery` / `engineSigns` (`floors/engine/scenery.ts`):
  - the aisle through the shared road kit (`RoadMarkings`);
  - one merged solid mesh and its edges (`MergedBoxes`, `MergedEdges` from the roof kit): bay shells, station props, racks, the workbench;
  - `FlowMesh` (`engine/EngineFx.tsx`, holo `strip`, one instanced draw) for ceiling pipes and their drops, cable trays, bay front strips and rack LEDs, with a slow pulse along x and a random phase per instance;
  - the pipe runs hang over the back walls (`PIPE_Z`), held by brackets on each bay's back corners, and their drops meet the back walls, so from the aisle no bracket or drop stands in front of a station sign (a front bracket used to cut the Agents sign on arrival);
  - `PanelMesh` (holo `fall`, one instanced draw) for the screens: the blueprint table top, the timeline wall, the agent monitors, the dashboard wall and the workbench wall;
  - `FloatingSigns` for the bay names (lit amber, the dark bays dim with a "Coming soon" plate) and the workbench title and subtitle; no word is painted on the floor.
- Pipes and trays stay calm so the station signs lead: the ceiling is 7.4 u (`ENGINE.ceiling`), runs are thin dim warm lines (pipe tone `#7c2d12`), trays a dim warm strip with a faint cyan data line.
- The lite tier draws half the LEDs (`engineDetail`). Reduced motion freezes `uTime`, so nothing pulses.
- Floor-only code: `useDispose` after every memoized geometry and material; no new light, material or shader program (reuses the holo program).

## Drawers

- Clicking a station (point-and-go `B1:station:<station>`) opens the Glass Drawer for room `B1:<station>`.
- Views come from `buildEngineViews` (`content/room-views/engine.ts`): the build story and the build-time snapshot through the Classic page helpers (`src/lib/build-page.ts`), so a number shows only when the snapshot carries it.
- They live in their own static file, `/data/rooms/b1-<locale>.json`, never in the shared rooms file. `DrawerHost` fetches it (`loadEngineViews`) only when B1 is unlocked or a `B1:` room opens ([hud-and-drawer.md](hud-and-drawer.md)).
- `EngineBody` (`hud/drawer/EngineBody.tsx`, in the B1 chunk) renders `RoomView.engine`: the blueprint diagram, the rounds timeline, the gate list, the plan excerpt or the dashboard tiles, around the generic sections. Each drawer links its Classic section `/{locale}/build#<station>`.
- The blueprint diagram ships laid out twice: `layout` (`DIAGRAM_PRESETS.phone`, 318 px) and `wide` (`DIAGRAM_PRESETS.drawer`: top to bottom, three nodes per band, every text at least 12 px, at most 492 px). `Blueprint` in `EngineBody` measures its figure before paint and on resize (a `ResizeObserver`, no new CSS) and draws `wide` once the figure is as wide as it: the 560 and 600 px side drawers; phones, the 480 px drawer and the drawer next to the Ask panel keep the phone layout.

## Access

- B1 is reachable only when the store's `b1Unlocked` is set (not persisted). For now the only way is the dev and test flag `?unlock=b1` (`src/experience/b1.ts`, applied by `Experience.startSession`): in a dev build, and in production only with `debug`, so `?unlock=b1&debug=1`.
- Locked sessions show nothing of B1 and load none of it: no elevator or picker row, no Cmd-K entry, no tower floor, no chunk or drawer data request, and the store refuses a ride to it (`canEnterFloor`). A language-switch resume to B1 is dropped without the flag.
- Locked sessions load no B1 chunk and no B1 drawer data, and mount no B1 DOM or scene objects. The bay titles (`ExperienceData.engine`, about 0.4 KB) and the B1 UI strings ride in the page data and client messages, and the main 3D path grew about 0.9 KB (layout, hum layer, store).
- B1 has no route of its own: its URL stays `/{locale}`, and station drawers are remembered in the history entry. Browser Back closes an open station drawer (the popstate handler compares route floors with `routeFloor`, B1 being L1's `/{locale}`, not floor ids).

## Draw calls

- Scene calls: the road kit, one merged mesh and its edges, two instanced holo draws and the floating sign pair.
- Settled on B1: 45 scene calls and 8,100 triangles on lite, 48 and 9,015 on full, with 43 and 81 shader programs on CI (`e2e/perf/baseline.json`; B1 is measured after riding down from the Lobby, so its count includes the Lobby's programs, like L1 full at 81).
- `FLOOR_SCENE_CAPS.B1` caps it at 100; the worst ride to B1 draws up to 110 scene calls and 127 whole-frame calls (budget 150) and about 22k triangles at most.
- The B1 chunk (EngineRoom, EngineBody) is 4.8 KB gzip (cap 16 KB). The cap counts B1 plus any modules it shares with the public floors (`?prefetch=off` never loads L3, L4 or RF first), a safe over-count.

## Sky and sound

- No sky underground: while `underground(roverY)` (rover y below `UNDERGROUND_BELOW`, -0.5) the sky group is hidden and the night state holds (`skyRuntime.underground`, `__hq.sky.underground`).
- Ambience: a low machine hum layer (`AMBIENCE_LAYERS.B1` in `lib/audio/ambience.ts`: detuned sawtooth pairs on C2 and G2 under a lowpass, a band-passed noise bed and a soft relay tick every 3 to 6 s), crossfaded like the other floors.

## Tests and captures

- Unit: `tests/unit/engine-layout.test.ts`, `engine-scenery.test.ts`, `engine-views.test.ts`, `b1-unlock-flag.test.ts`, `floor-chunks-graph.test.ts`, `arrivals.test.ts`.
- E2E: `e2e/engine-room.spec.ts` (the flag, a locked session, rides from the Lobby and the roof, every station's drawer), `e2e/memory.spec.ts` (Lobby to B1 round trips); the helpers are in `e2e/b1.ts` (`B1_QUERY`, `enterB1Route`, `rideTo`).
- Captures for review: `bun scripts/b1-shots.ts --base <url> --out <dir>` (arrival, aisle and each station's drawer, desktop full and phone lite).
