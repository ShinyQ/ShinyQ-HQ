# Floors

Rules shared by every walkable floor: ready floors, layouts, doors, floor pads, floor chunks, fast return, the road kit, floating signs and point-and-go. Floor specifics live in the per-floor files.

Index: [AGENTS.md](../../AGENTS.md).

Per-floor files: [L1 Lobby](floor-l1-lobby.md), [L2 Career](floor-l2-career.md), [L3 Labs](floor-l3-labs.md), [L4 Library](floor-l4-library.md), [RF Roof](floor-rf-roof.md), [B1 Engine Room](floor-b1-engine-room.md). Engine, camera, store and render budget: [3D experience](3d-experience.md).

## Ready floors

- `READY_FLOORS` in `src/experience/floorOrder.ts` (re-exported by `config.ts`) lists floors with real 3D content: `["B1", "L1", "L2", "L3", "L4", "RF"]` (`FLOOR_IDS`).
  - B1 has no route: its URL stays `/{locale}` (Classic counterpart `/build`), and it is reachable only once `b1Unlocked` is set (visiting all five public floors; [B1 access](floor-b1-engine-room.md#access)). Its elevator row is always listed, locked until then.
- URL sync writes floor routes only for ready floors.
  - Placeholders keep `/{locale}`, and the HUD links to their HTML page.
- When a new floor ships: add it to `READY_FLOORS` and mount the gate on its route.

## Floor layouts

- `buildFloorLayouts(yearCount, extras: LayoutExtras = {})` builds every floor layout.
- Each floor adds its own optional input field to `LayoutExtras` (`types.ts`; for example `labs` and `career`), never a new positional parameter.

### Multi-rect slabs (wings)

- `FloorLayout.bounds` is the main slab rect; optional `FloorLayout.wings` lists extensions (L1: the [Agent Office wing](floor-l1-lobby.md#agent-office)). A wing touches the slab (or another wing) along part of an edge and never overlaps it; the shared joint is open floor, not an edge.
- No three rects may share a corner: the inset union bridges pairwise joints only, so such a vertex would hide an invisible post.
- Pure helpers in `src/experience/nav/slab.ts` serve every reader of the walkable shape; a floor without wings takes the plain rect path in each (frozen by `tests/unit/slab-regression.test.ts` on every floor):
  - `slabRects` (`[bounds, ...wings]`), `slabBox` (their bounding box), `inSlab` / `inSlabXZ` (optionally with `inset` u of floor around the point);
  - `clampToSlab(p, s, inset, out)`: the nearest point of the inset union, allocation-free (collision and the camera call it per frame);
  - `slabInsetRects` (each rect inset plus one bridge across each joint; a concave corner keeps the square inset, a little stricter than the rounded one; cached per wings array, so insets come from a small fixed set);
  - `slabEdges` (the outer edges of the union, joints left out) and `slabCorners` (where the outline turns).
- Consumers: the navgrid (`buildNavGrid` over `slabBox`), collision (`resolveCircle`), the space rules (`bounds-gap` against `slabEdges`, `pad-bounds`, `wideGrid`, `reachFrom`), the camera (`cameraWorld` carries the wings; `cameraBlocked`, `viewOnSlab`, `clampCamera`), the slab mesh (`tower/FloorLevel.tsx`: one box per rect and one grid over every rect, its planes merged into one geometry (`gridPlanesGeometry`) and faded as one floor, one outline from `tower/slabOutline.ts` with no edge across a joint; the ride cull gets every rect as an occluder), `Tower.tsx` (`slabBox`) and the minimap (one fill path of every rect plus an outline path of the outer edges). A wing costs 1 draw call on its floor (its box; its grid plane joins the floor's one grid).

### Arrival

- Every floor sets `FloorLayout.arrival` (Round 8 J): where the rover rolls on after an elevator ride, heading east along the floor's main axis. Ride, glide and camera rules: [Elevator arrival](3d-experience.md#elevator-arrival).
  - L1 (-6, 0), L2 x = 6 in the 2019 plaza, L3 `LABS.overview`, L4 (-4, 0), RF (-8, 0), B1 (-8, 0).
- L1, L2, L4, RF and B1 carry a view zone `<floor>:arrival` in the floor's `viewZones`. L3 keeps its ordinary `L3:overview` zone instead (no `arrivalOnly`; [L3 arrival](floor-l3-labs.md#arrival-and-camera-views)). The `<floor>:arrival` zone is:
  - a 4 u box at the arrival point, `yaw` `ARRIVAL_YAW` (`camera/look.ts`: behind the rover and `ELEVATOR_DIAGONAL`, 35 degrees, to its right, owner decision 2026-10-23) on every camera class, with `travel` east so only an eastbound rover matches;
  - `arrivalOnly`: active only once an arrival or a deep-link spawn primed it, so driving back through never swings the camera;
  - the L2 zone adds `railYaw` `ARRIVAL_RAIL_YAW` (the rail camera west of the rover and to its right, looking down the Career Road).
  - `L3:overview` uses the same `ARRIVAL_YAW`.
- Zooms keep the camera east of the elevator shaft: constants per floor (`LOBBY.arrivalZoom` and `arrivalZoomPhone` on L1 (`src/experience/config.ts`), `CAREER_ROAD.arrivalZoom` on L2, `LABS.overviewZoom` and `overviewZoomPhone` on L3, the newsroom concept's `arrivalZoom` on L4, `ROOF_DECK.arrivalZoom` on RF, `ENGINE.arrivalZoom` on B1), capped per camera class by `shaftClearZoom`; `tests/unit/arrivals.test.ts` asserts the clearance, the diagonal, the framing (the rover and the floor's main sight inside the HUD-free box) and the free roll-on path at four sizes.
- On the diagonal the main sight lies right of the rover; where a view cannot hold both, the zone aims sideways with `LookOffset.right` (u, scaled with the zoom; [Orbit](3d-experience.md#orbit)): `LABS.overviewAim` 5.75 and `overviewAimPhone` 2.75 on L3, and on portrait screens `LOBBY.arrivalAimPhone` 4.75, `CAREER_ROAD.arrivalAimPhone` 7 and `ROOF_DECK.arrivalAimPhone` 4.25.
- B1 phones (camera class mobile) keep a `classView` zoom and pitch (`ENGINE.arrivalPhone`; the pitch opts into the turn-back on leaving, as on the L1 Agent Office's tablet and portrait views) on the shared diagonal. The arrivals test checks that this view keeps the sign of the station the diagonal looks at (Working with AI Agents) whole, with a font at least 10 px tall, and its camera east of the shaft; at 35 degrees no portrait pose inside the shaft cap holds two signs whole.
- Phone reading rule (owner decision, spec 2026-10-28 section 4.2; landscape phones, spec 2026-10-29): on portrait screens (camera class `mobile`) every title and name on L2, L3, L4 and RF reads at least 10 CSS px tall (its em box, projected) at 390 x 844 and 9 px at 375 x 667, and on landscape phones (camera class `landscape`) at 844 x 390 and 667 x 375 (932 x 430 reported), from the pose a visitor stops at to read it: the arrival, a view zone's stop, or the label's door, pad, board, bay or vault stop, the rover facing it.
  - It stands in front of the camera with its middle inside the phone's HUD-free box (landscape: 72 px from the top for the floor chip row, 96 px from the right for the minimap and the right column, 24 px from the left and the bottom), the rover stays in frame, and a label with a fixed facing faces the camera within 60 degrees. A label whose ends run off screen is only reported (the visitor can turn the view). Fine print is exempt (ops tile labels and rules, board list lines, subtitles and footers, captions, dates, repo names, the email address, the CV hint, the prologue, console year lines, hologram card text).
  - Fix order: first a phone view on the zone at the stop (`classView.mobile` or `classView.landscape` zoom, pitch or `LookOffset`; a landscape-only zone where none exists, `ViewZone.only`), then a phone type size read from `device.camera` in the store (`phoneCamera(cls)`: portrait and landscape phones; `phone` values next to each label's size, the sign plate growing with it). Desktop and tablet poses and sizes never change.
  - Bytes: zone views live in the floor layouts on the main 3D path, so each costs main-path bytes; portrait type sizes go in the lazy floor components (L3, L4, RF) or, on L2, in the main-path label builders (`career/labels.ts`, `CareerRooms`). The lazy menu and pad picker sheets pay for them (owner decision 2026-10-28): the first frame and both session totals stay below main.
  - Each floor's `readable.ts` (`floors/career`, `labs`, `library`, `roof`) lists its titles and names with their reading stops; only tests import it (a module shared by the main path and a floor chunk costs wrapper bytes), so where a component keeps literals the list holds a copy that names the component. `tests/unit/phone-reading.test.ts` settles each reading pose like `CameraDirector` (`tests/helpers/phone-camera.ts`), checks them and pins the desktop sizes.
- Deep links spawn on the arrival point on L3, L4 and RF (`spawn`); B1 has no route; its one deep link, `/{locale}#B1` (only when unlocked), also spawns on the arrival point. L1 keeps the kiosk spawn and L2 the approach.

## Doors

- Door triggers are generic: fill `FloorLayout.doors` with `{ room, at, size?, facing? }`.
  - A pad centered on `at`, `DOOR_SIZE` 1.6 u deep along `facing` (the unit direction into the room) and `DOOR_WIDTH` 2.4 u across, drawn by `ProximityGlow`.
  - Without a facing the pad is a 1.6 square.
  - Give every new door a `facing` (a unit test checks all floors).
- A room opens only on intent:
  - the rover drives into the door (within 45 degrees of `facing`),
  - stops or slows below `DOOR_SLOW` on the pad,
  - or stays `DOOR_DWELL` (250 ms) on it.
  - Driving past a pad does not open it.
- The Director (`nav/doors.ts`) fires `{ type: "open", room }`, latched until the rover leaves the pad, and handles it with `openRoom`.
- A room opened any other way (mission, click, palette, deep link) consumes its pad:
  - the Director learns of every open from the store (a drawer can open and close between two frames) and stops the rover's drive;
  - the pad stays silent until the rover has been on it and left, or has stopped elsewhere;
  - so a closed room never reopens when the rover rolls onto its pad.
  - the pad under the rover counts as used on any frame a room is open, even another room's (an L4 post opens at its bay door), so a drawer closed before the next frame never lets that pad fire (`stepDoorLatch`).
- `roomTarget` (host3d) drives to `door.at` for any room with a door, and to `FloorLayout.listStop` for a room without one on floors that set it (L4: a post on no reader track, at the featured stage). `FloorLayout.stops` wins over `listStop` (L4: every post drives to its track bay's door).
- Spacing:
  - keep lanes off door pads (`tests/unit/labs-layout.test.ts` checks the L3 packet lanes);
  - layout tests keep 3 u of clear floor between neighbouring rooms, pods and pads.

## Floor pads

Code: `nav/pads.ts` (owner decision).

### Data

- `FloorLayout.pads`: `PadTrigger` with `id`, `kind` `elevator` | `teleport`, `at`, `radius` (default `PAD.radius`, 1.4 u), `year`, icon `face`.
- Every floor has an elevator call pad on its `approach`, added by `buildFloorLayouts`.
  - It sits 3 u in front of the shaft door, so it follows the door constants.
- L2 has a teleporter on every year plaza (`CAREER_ROAD.teleport`: 3.5 u past the plaza start, 6.5 u south of the road center; `CareerYear.teleport`).
- Pads are not obstacles.

### Latch and picker

- The Director runs the door latch over pads (`stepPadLatch`):
  - stop or slow on a pad, or stay `PAD.dwell` 0.6 s on a fast pass;
  - primed on deep links, resumes, elevator arrivals and a beam's landing (on the jump frame, so a beam that also ends on that frame lands quietly), so a rover standing on a pad never opens it.
- On trigger it sets `store.picker`: `{ kind: "floor" }` or `{ kind: "year", from }`.
- Clicking a pad drives there through [point-and-go](#point-and-go), then opens the picker (at once when the rover already stands on it).
- `PadPicker` (`src/hud/pads/`) lists, on the shared `Modal` with `sheet` (bottom sheet on phones):
  - floors: names from `hud.floorLabel` (like the elevator panel, which stays), `hud.pads.floorDesc`, thumbnails `public/floors/{id}.webp`;
  - years: rooms, organizations, the prologue on the first year.
  - Keys: arrows, Home and End move, Enter picks, Esc closes. The hint line names the keys on a fine pointer and says "Tap a floor" (`hud.pads.*HintTouch`) on a coarse one.
  - The sheet is a lazy chunk (owner decision 2026-10-28): `PickerSheet.tsx` (the lists, the option builders in `picker.ts`, the per-kind sheet), loaded by `pickerChunk.ts` (`loadPicker()`, its only `import()`) when a picker first opens. `PadPicker` keeps the store wiring, the close-on-leave rule and the pick intents, and passes the padlock, the accent dot, the floor labels and descriptions in as props, so the chunk shares no hoisted main-path module; a failed load shows Retry (`picker-failed`). `tests/unit/picker-chunk-graph.test.ts` guards the boundary.

### Actions

- A floor emits the panel's `elevator` intent.
- A year emits `{ type: "teleport", pad }`. The Director:
  - cancels any mission, path and autopilot;
  - runs the beam (`nav/teleport.ts`: 0.3 s rise, jump, 0.3 s fade; reduced motion: the 150 ms fade cut with `BeamFade`);
  - sets `roverRuntime.cameraSnap` so the camera cuts;
  - leaves the target pad latched.

### Pad rules

- Pads pass `padViolations` (`nav/space.ts`, `SpaceInput.pads`, `expectPadRules`):
  - inside the slab;
  - the rover radius clear of obstacles;
  - off door pads and spurs;
  - off a road's driving width, except at a dead end (the elevator approach);
  - reachable through 6 u wide floor.
- After a large floor change, regenerate the thumbnails: `bun run build && bun run floor:thumbs` (needs `cwebp`).

## Floor chunks

L3, L4, RF and B1 load on demand; per-floor caps are owner-approved (budgets in [performance](performance.md)).

### Structure

- `floorChunks` (`floors/floorChunks.ts`) does one dynamic import per lazy floor.
- The entries in `floors/chunks/` carry the floor and its floor-only HUD pieces:

  | Floor | Chunk entry contents |
  |---|---|
  | L3 | Labs, OpsBody, ReactorBody, HologramOverlay |
  | L4 | Library, ResearchBody, TopicsBody |
  | RF | Roof |
  | B1 | EngineRoom, EngineBody |

- L1 and L2 stay in the main 3D chunk.
- Never import `Labs`, `Library`, `Roof`, `EngineRoom` or those HUD pieces statically anywhere in the closure of `Experience.tsx`.
  - `tests/unit/floor-chunks-graph.test.ts` (`tests/helpers/import-graph.ts`) fails otherwise.
- New floor-only HUD code goes into that floor's chunk entry and is reached through `lazyFloors.tsx` or the entry's exports.
- Not floor chunks: the L1 Agent Office loads its own lazy chunks (the scene `floors/lobby/office/scene.ts` and the drawer body `floors/lobby/office/body.ts` through `floors/lobby/office/chunk.ts`, the replay `replayChunk.ts` with its controls, the watch `watchChunk.ts` through `watchLoader.ts`, and the beacon `beaconChunk.ts`), with their own triggers and caps; see [floor-l1-lobby.md](floor-l1-lobby.md#agent-office). Never import their modules statically from the `Experience.tsx` closure (`tests/unit/office-chunk-graph.test.ts`).

### Mounting

- `Tower` mounts a lazy floor (with its Return pad sign and `FloorPrep`) only once its chunk is loaded, rendering the loaded component directly.
  - `floorMount` in `floorChunks.ts`; `useFloorChunks` re-renders on chunk state changes and starts the import of a near floor nobody requested yet.
  - The slab shows while a chunk loads, and the floor commits in an ordinary update like L1 and L2.
- Never render a loaded floor through React.lazy.
  - Reason: its commit would be a Suspense retry, which React throttles for up to 300 ms while a nested boundary (the L4 newsroom fonts) suspends.
  - Whether that nested content joined the floor's first commit and `FloorPrep` compiled and pinned its programs then varied run to run (the `floors` perf gate read RF lite 36 or 40 programs).
- Failed imports:
  - a floor whose import failed and that has no module renders through React.lazy, so its rejection reaches the canvas error boundary;
  - once that wrapper is rendered, the floor stays on it (no remount);
  - a floor that recovered before any wrapper rendered (idle prefetch failed, `rideRetry` worked) renders directly.
- Lazy loading does not change the floor component props.

### Lazy HUD pieces

- Drawer bodies for ops, reactor, research and topics are lazy (fallback "Loading room", the generic sections if the chunk fails); so is the Agent Office's `OfficeBody`, in its own chunk.
- `VisitsBody` loads `VisitsPanel` through the Contact page's dynamic import.
- The README renderer (`hud/drawer/ascii.ts`) loads when the README view first opens.
- Hologram overlay and the drawer's chunk bodies go through `lazyFromChunk` (`hud/lazyFromChunk.ts`):
  - a failed import shows a fallback (the hologram view closes, the drawer shows the generic sections);
  - the next open retries.

### Prefetch and rides

- Prefetch covers idle floors only (`floorPrefetch.ts`, `FloorChunkPrefetch.tsx`). B1 only once unlocked (idle, floor picker, call pad hover); a locked session never requests its chunk. Triggers:
  - after the first frame on idle (`afterFirstFrameIdle`);
  - when a ride targets the floor;
  - when the floor picker opens;
  - on elevator call pad hover;
  - on `ElevatorPanel` pointer enter or focus.
- A deep link or resume floor loads at once from `Experience.startSession`.
- The elevator car holds at closed doors while the destination chunk loads (`RideOptions.hold`, `Ride.chunkHeld`, `RideSummary.chunkHeld`, `rideChunkHold`).
  - No timeout; `PREPARE_TIMEOUT` starts after.
  - A failed import counts as settled, and the canvas crash path takes over.
- A failed chunk is retried once at the start of each ride (`rideRetry` in `floorPrefetch.ts`), so the car holds for it.
- `ProgramWarmup` awaits a lazy floor's chunk and skips it on failure.
  - On the full tier its boot warm-up requests the floor chunks during boot (L3 first), independent of `?prefetch=off`.
- `?prefetch=off` turns the speculative prefetches off (tests and the bytes gate); explicit loads (deep links, rides) still run.

### Probes, tests and sizes

- Probe: `__hq.floorChunks`. E2E: `e2e/floor-chunks.spec.ts`.
- Measured: main 3D path lite 450.3 KB and full 466.1 KB gzip; floor chunks L3 14.0, L4 13.2 (13,519 B), RF 3.3, B1 16.5 KB (B1 only in unlocked sessions); session totals lite 515.4 KB and full 531.2 KB (527,810 B and 543,944 B; the office watch, scene and replay chunks included: the scene chunk 28,410 B loads at idle on every L1 visit, the replay chunk 5,313 B on a quiet one), under their caps of 516.0 and 531.8 KB (owner decision 2026-10-25, the L4 reader tracks); the office drawer body 7,171 B stays outside the session total (40,894 B with the scene and replay chunks, office total cap 40 KB) ([performance.md](performance.md#bytes-3d)).

## Fast return

Pure rules in `nav/fastReturn.ts` (owner decision).

### Express Return pad

- A floor that sets `FloorLayout.returnPad: Vec2` gets an Express Return pad:
  - `PadTrigger` kind `return`, id `return:<floor>`, added by `buildFloorLayouts` right after the elevator pad;
  - face from `RETURN_PAD_FACE` in `config.ts`;
  - a green disc and icon in `PadGlow`;
  - a floating "Back to elevator" / "Kembali ke lift" sign (`fx/ReturnPadSign.tsx`, `hud.interact.returnPad`);
  - point-and-go target `${floor}:pad:return` (kind `return-pad`, action `return-beam`).
- Stopping on it (pad latch) or the point-and-go action beams the rover to the elevator call pad facing the car (`elevatorBeam`, `CAR_HEADING`).
  - The call pad stays latched, so no picker opens.

### Smart floor change

- On the first `toDoor` frame of every ride (all triggers go through `requestElevator`):
  - a rover more than `FAST_RETURN.beamDistance` (40 u, straight line to `approach`) from the call pad beams onto it (`shouldBeamToCar`), and the ride boards on the jump frame;
  - closer, it drives as before.
- 40 u is an owner decision: the L3 overview and the RF arrival drive; the L1 spawn, in front of the Rover menu kiosk, is about 16.5 u away.

### Shared behaviour

- Both reuse `store.beam`: a green column in `TeleportBeam` for `isElevatorBeam`, `BeamFade` under reduced motion.
- Esc and manual input wait for the beam.

### Floors with a return pad

| Floor | Where | Source |
|---|---|---|
| L2 | Workshop forecourt, beside the time console (344.5, -8.2) | `workshop.returnPad` |
| L3 | on the spine axis east of the reactor ring: its center plus (`LABS.returnPadX` 13, 0), (139, 0) today; in view below the rover from the reactor stop | `LABS.returnPadX` |
| L4 | south of the end plaza | `LibraryLayout.end.returnPad` |
| B1 | south of the aisle end, (40, 9) | `ENGINE.returnPad` |

- The L2 and L3 floor code (`floors/career/*`, `floors/labs/*`) may move the coordinate; the pad rules in `tests/unit/floor-pads.test.ts` check it.
- E2E: `e2e/fast-return.spec.ts`. The everyday spots within 40 u (the L3 deep-link spawn, the RF plaza corner) are layout distances in `tests/unit/fast-return.test.ts`; the e2e drives from the L1 spawn and within 40 u on L2.

## Floating signs and spectacle effects

Design: [spectacle floor ends and hall](../superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md) (`docs/superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md`).

### Floating signs

- No words painted on a floor (owner decision). Every floor word is a `FloatingSigns` entry (`fx/FloatingSign.tsx`, `SignSpec` from `fx/signLayout.ts`):
  - upright, turned to the camera every frame (yaw only, never mirrored);
  - a dark plate with a neon rim in the sign color;
  - all signs of a floor in one group (two draw calls).
- Never lay a `Text` or `BatchedLabel` flat (`rotation` -90 degrees about x, `tilt: Math.PI / 2`).
  - `tests/unit/floor-text.test.ts` and `__hq.probes.flatText()` (`e2e/spectacle.spec.ts`, on L2, L3, L4 and RF) fail.
  - The facing: `tests/unit/floor-sign-facing.test.ts` (the L2 year markers and the L4 timeline signs, without a renderer) and `e2e/spectacle.spec.ts` (the L3 reactor signs, rendered).
- Road chevrons and other non-text glyphs stay on the floor.
- `FloatingSigns` takes an optional `dropHidden` (frames, off by default).
  - A sign hidden that long leaves the text batch and the plate draw until it shows again (L4 passes 30), so hidden glyphs cost no triangles.

### Holo effects

- Effects use the one holo shader: `createHoloMaterial` in `fx/holoFx.ts`, a `uMode` per pattern.
  - Only on instanced meshes with an instance color (`HoloMesh` for one), so the whole spectacle compiles to one program.
  - `tests/unit/floating-sign.test.ts` rejects a plain `<mesh>` in those files.
- Set instance matrices and colors at creation (attach `instanceMatrix`/`instanceColor`), so the floor's precompile builds the final program and frustum culling sees real bounds.
  - Only meshes that move every frame (sign plates, reactor rings) set `frustumCulled={false}`.
- Fog exempt, with its own distance fade (`fade`).
- Animated through `uTime` (`useUniformTime`, frozen under reduced motion).
- Never culled by the [ride cull](3d-experience.md) (a `ShaderMaterial`).
- Lite draws fewer instances; reduced motion stops every flow and spin (`reactorSpin`).

### Probes

- `__hq.probes.signs[name]`: text and how square it faces the camera.
- `__hq.probes.spectacle`: shader clocks and the reactor angle.

## Road kit

Design: Part 2 of the walkable floors plan (L2 Career Road, L3 Project Roads). L2, L3, L4 and RF are built on this kit (see the per-floor files); L1 uses it only for the Highlights Hall road and the Agent Office wing road.

- Guided tours were removed with their engine, HUD and URL flag; old links with the flag are ignored. Do not reintroduce them.

### Network

- `src/experience/nav/road.ts` (pure): a `RoadNetwork` is
  - `roads`: polylines with a `width`, optional `closed`; points run forward, chevrons point that way;
  - `plazas`: `center`, `w`, `d`, `round`;
  - `spurs`: `room`, `from` on a road or plaza, `to` = the door pad `DoorTrigger.at`, optional `width` and stub `color`;
  - optional `chevrons` (default true; `false` draws no chevrons: `chevronMarks` returns none; L3 uses it).
- Road ends that lie on another road and shared vertices join (loops).
- Helpers:
  - `pathBetween(net, a, b)` returns waypoints along the road (excluding `a`);
  - `roadRoute(net, grid, from, to)` (`nav/roadRoute.ts`) adds navgrid legs on and off the road and falls back to `findPath`;
    - a network may come in parts that do not touch (L1: the hall road and the office wing road), where `pathBetween` finds no route: an end on the network keeps to its own part; a drive between two parts leaves the first where it comes nearest the target and joins the second at its nearest point, with a navgrid leg between; an end off the network joins the other end's part; same-part routes are unchanged;
    - it lives apart from the road kit so the navgrid stays out of the store's always-loaded chunk (floor layouts import `road.ts`);
  - also `projectOnRoad`, `sampleRoad`, `onNetwork`, `networkBounds`, `buildRoadGraph`.
- `FloorLayout.roadZone` (one rect or a list) limits a floor's road to drives that start or end inside it or one of them (`routeUsesRoad`). L1: `[the hall zone, the office wing rect, the wing's lead span]`.

### Opting in

- A floor opts in by setting `FloorLayout.road`: every autopilot drive (missions, the elevator approach) then follows the road through `roadRoute` in the Director.
- Point-and-go drives are mission legs, so they follow the road too.
- Scrubbing keeps the navgrid.

### Rendering

- `<RoadMarkings network color tier reducedMotion />` (`src/experience/fx/RoadMarkings.tsx`; mesh data in `nav/roadGeometry.ts`).
- The chevrons are one instanced mesh placed once with its bounds computed after placement, so three culls them while the road is out of view.
- The lite tier and reduced motion drop the chevron pulse; the lite tier drops the additive edge glow.

### Space rules

`src/experience/nav/space.ts`, asserted with `expectSpaceRules` from `tests/helpers/space.ts` in every walkable layout test:

- roads at least 8 u wide, plazas at least 16 u;
- roads clear of obstacles over their full width, spurs by the rover radius;
- obstacles either touching or at least 6 u apart (also from the slab edges: the outer edges of the slab and its wings, never a joint); a narrower gap passes only when a third obstacle covers the whole strip between the two (`gapFilled`: no floor there, the three touch as one chain, like the Agent Office's CI tower and ship dock beside the end row boxes);
- every door has a spur ending on its pad;
- 6 u wide floor connects the start to within 4 u of every pad.
- Layouts with floor pads pass them as `pads` (see [pad rules](#pad-rules)).

### Floating hologram icons

Owner decisions: "Neon line" style; unique holograms per item on L2, L3 and L4 ([2026-10-23](../decisions/2026-10-23-unique-floating-icons.md), [design](../superpowers/specs/2026-10-23-unique-floating-icons-design.md)).

- Type icons (the fallback and the Classic site): `CAREER_ICONS` (24 x 24 line art: briefcase, laptop with code, graduation cap, trophy, flag) and `CAREER_TONE` (sky, pink, violet, amber, emerald) in `src/experience/fx/holoIcons.ts` feed:
  - `<HoloIcon instances tier reducedMotion />` (3D);
  - the SVG `<TypeIcon type />` (`src/components/TypeIcon.tsx`):
    - the `/journey` filter chips;
    - `TypeMarker` on timeline rows (`src/components/page/Layout.tsx`; /journey, the home timeline, /quick, entry pages);
    - the career badge in the [Glass Drawer](hud-and-drawer.md) (`RoomView` badge `type`).
- Use `CAREER_TONE` wherever a career type has a color.
- `HoloIcon` (`fx/HoloIcon.tsx`) draws any mix of icons in one geometry: each `HoloIconInstance` may carry its own `strokes`, `color` and `size` (the component's are the defaults), baked into per-vertex attributes (`instanced`, over the unit ribbons of `iconMesh`), so a batch is one draw call plus a halo on the full tier. Every user shares one shader source (the `aColor` attribute is always there; `uColor` carries the tier boost, the optional shared `fade` uniform the crossfade), so batching adds no shader program. One batch per user: the floor pads (`PadGlow`, every kind), the RF station icons, the Workshop benches, the L2 rooms and the L4 stations. It sways toward the road, turns around when the camera is behind it and holds still under reduced motion.
- Unique shapes (3D only):
  - Each item names its hologram in the content ([content.md](content.md#hologram-ids)): `icon` (a vendored Lucide icon id) on career entries, posts, publications and talks, `sculpture` on pods.
  - Icons are a curated Lucide subset vendored in `assets/icons/lucide/` (ISC `LICENSE` and attribution in its `README.md`; only the ids the content names). `src/lib/svg-strokes.ts` converts them at build into the 24 x 24 `Stroke` format (paths with M, L, H, V, C, S, Q, T, A, Z, and line, polyline, polygon, circle, ellipse and rect; curves flattened coarsely, dots become small diamonds).
  - L3 sculptures are box recipes in `content/sculptures.json` (`src/content/sculptures.ts`): at most `SCULPTURE_MAX_BOXES` (16) boxes within the bounds, parts may roll (`r`), pulse (`p`) and dim (`k`), no two alike.
  - `scripts/build-shapes.ts` (in `build`, `build:web` and `dev`) writes `public/shapes/<floor>.<hash>.json` for L2, L3 and L4 (`src/content/shapes.ts`; gitignored, immutable cache in `_headers`); the URLs reach the floors as `career.shapes`, `labs.shapes` and `library.shapes`. Items are keyed by entry slug (L2), pod slug (L3) and post slug, publication or talk id (L4). The L4 file also carries `icons`: every item icon already placed on the floor's layout (`libraryIcons` in `floors/library/icons.ts`, run at build over the same `buildLibraryLayout` input as the client), so the client draws them as is. The converter and the recipes never reach a client chunk (`check-client-chunks`).
  - `useShapes` (`fx/shapes.ts`) starts the fetch right before the first render that shows the floor (`whenDrawn`), through the shared client JSON cache (`src/lib/json-cache.ts`, also behind the Glass Drawer room files). L2 and L4 then crossfade over 0.6 s (`HoloSwap`: the fallback batch fades out as the unique one fades in, through the shared `fade` uniforms, then unmounts); L3's sculptures replace the kind holograms in the one instanced mesh (sized for `MAX_PARTS` boxes per pod, so no new mesh). Reduced motion swaps at once. Until then, or on a failed fetch, the type icons and kind holograms stay. A revisit in the session mounts with the unique shapes (parsed per URL once).
  - The L2 and L4 files carry the icons already placed (`careerIcons` in `floors/career/icons.ts`, `libraryIcons` in `floors/library/icons.ts`, run at build over the same layouts as the client; an item without an icon keeps its type or zone icon there), so the client draws them as they are; the L3 file carries the sculptures by pod slug, already at the floor's scale (`SCULPTURE_SCALE`, 1.2).
  - E2E: `e2e/shapes.spec.ts` reads the scene (the batch draws exactly the file's icons, the pod mesh draws the docked pods' sculpture boxes; with `/shapes/*` aborted the fallback batch stays).

### Dev routes

- `page.dev.tsx` files are routes only when `NODE_ENV` is not production or `HQ_DEV_PAGES=1` (`pageExtensions` in `next.config.ts`), so the static export never contains them.
- The only one left is the certification wall harness, `/{locale}/dev/certs` ([folder-layout.md](folder-layout.md#dev-prototypes)).

## Point-and-go

### Behaviour

- The rover never drives to a clicked floor point (owner decision).
- Visitors drive with WASD or the arrows (Shift boost) or the joystick (the Boost button or a double tap boosts), or point at a glowing target:
  - desktop: hover highlights it (outline, destination ring, a name tag on a dark pill over the ring, pointer cursor); a click drives there along the road and runs its action;
  - touch: the first tap selects it (HUD "Go to ..." chip, aria-live text); a second tap or Go drives.
- A click on empty floor only closes an open room, clears a tap selection and shows a hint once per session (`hq:point-hint`).

### Registry

- Targets come from one registry, `src/experience/interact/registry.ts` (pure).
- `interactablesFor(floor, layouts, { experience, labels })` returns `Interactable` entries:

  | Field | Meaning |
  |---|---|
  | `id` | unique id (formats below) |
  | `floor` | floor id |
  | `kind` | `door`, `elevator-pad`, `return-pad`, `teleporter`, `station`, `kiosk`, `board` |
  | `label` | resolved for the tower's locale |
  | `at` | approach point |
  | `bounds`, `height` | pick volume |
  | `box` | optional oriented footprint (`center`, `w`, `d`, `yaw`) for turned targets; the pick volume and the hover outline use it |
  | `action` | `open-room`, `elevator-picker`, `teleport-picker` with `year`, `return-beam`, `console-picker` (the L2 time console), `command` |
  | `base` | optional bottom of the pick volume, for stacked targets such as the [Tech Reactor](floor-l3-labs.md) rings |
  | `group` | optional `{ id, label }` for targets sharing one approach point (the L4 Study Vault's books; an L4 track bay's door and spines, `L4:track:<slug>`): one hint bubble for the group, whose Go keeps the first member's `open-room` (a bay door's track drawer) ([Hint bubbles](hud-and-drawer.md#hint-bubbles)) |

- Sources:
  - doors from `FloorLayout.doors`, with room footprints from each floor's layout builder (RF and B1 doors are `station`s);
  - pads from `FloorLayout.pads`;
  - plus the L1 profile hologram, skills wall, Rover menu kiosk and Visitor Observatory, the L3 wing boards and reactor rings, the L4 reader track shelves (one target per post's spine or lead cover), the end plaza (Topic Constellation, research monument) and Study Vault books;
  - features register the rest through `registerExtraInteractables` (the Highlights Hall stations, the L1 Agent Office desks, the L4 shelf spines and lead covers).
- Ids: `${floor}:door:${slug}`, `${floor}:pad:elevator`, `L2:teleporter:${year}`, `${floor}:station:${key}` (B1: `B1:station:<station>`), `L1:kiosk:ask-rover` (the Rover menu kiosk; the id is kept for stored visits), `L3:board:${wing}`, `L4:shelf:<post slug>` (a spine or lead cover on its reader track bay; registered from the L4 chunk), `L4:vault:<guide slug>`.

### Adding targets

- Add new in-world targets to `baseInteractables` (built-in floor content), or call `registerExtraInteractables(floor, items)` from the feature.
  - It returns the dispose function; ids must be unique, and the built-in entry wins a clash.
- Readers: `extraInteractables(floor)`, `onInteractablesChange(listener)`, `useInteractables(floor, layouts, data)`; inside the canvas `interactRuntime.items` holds the current floor's full list.
- The HUD minimap reads `buildFloorLayouts` and `interactRuntime.items` (`subscribe`, `setItems`): a floor change that alters roads or targets shows up on the minimap and the overview automatically, with no map code to touch (see [Minimap](hud-and-drawer.md#minimap)).
- Never put navigation `onClick` or hover handlers on scene objects.
  - L1 certification badges and pills and L4 research paper plates keep their own clicks (they open previews, not drives).
- Commands (`parseCommand` in `pick.ts`): `terminal`, `palette:pods`, `palette:rooms`, `palette:posts`, `cv`, `reactor:<ring>`, `open:<room id>` (that room's drawer where the rover stands; the L4 research monument), `guide:<slug>` (the study guide reader through the `guide` HUD command; the L4 Study Vault books, `L4:vault:<slug>`, which drive to the vault stop first).

### Rendering and actions

- `InteractLayer` (mounted in `Scene`) puts every target of the current floor into one invisible instanced unit box (no draw call) and handles hover and clicks.
- The highlight draws the pick volume grown by `HIGHLIGHT_MARGIN` (0.06 u) on every side (`highlightVolume` in `interact/pick.ts`), so it never shares a face with a target whose pick volume is the object itself (the L3 directory boards) and never z-fights.
- Highlight cost while a target is hovered: 4 draw calls on lite (outline, ring, tag text and pill), 5 on full (plus the additive fill). No pulse under reduced motion.
- The name tag stands over the approach point (`labelAnchor`), never over the object, so it never doubles or covers in-world titles.
- The `interact` intent carries the target; the Director runs `performInteract`:
  - rooms through `goToRoom`;
  - everything else as a mission `drive` step followed by its action, so keys and the joystick cancel it.

### Tests

- `tests/unit/interact-registry.test.ts` (real content on every floor), `tests/unit/interact-pick.test.ts`, `tests/unit/interact-missed.test.ts`, `tests/hud/InteractStatus.test.tsx`, `e2e/interact.spec.ts`.
