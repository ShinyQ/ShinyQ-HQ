# Floors

Rules shared by every walkable floor: ready floors, layouts, doors, floor pads, floor chunks, fast return, the road kit, floating signs and point-and-go. Floor specifics live in the per-floor files.

Index: [AGENTS.md](../../AGENTS.md).

Per-floor files: [L1 Lobby](floor-l1-lobby.md), [L2 Career](floor-l2-career.md), [L3 Labs](floor-l3-labs.md), [L4 Library](floor-l4-library.md), [RF Roof](floor-rf-roof.md). Engine, camera, store and render budget: [3D experience](3d-experience.md).

## Ready floors

- `READY_FLOORS` in `src/experience/config.ts` lists floors with real 3D content: `["L1", "L2", "L3", "L4", "RF"]`.
- URL sync writes floor routes only for ready floors.
  - Placeholders keep `/{locale}`, and the HUD links to their HTML page.
- When a new floor ships: add it to `READY_FLOORS` and mount the gate on its route.

## Floor layouts

- `buildFloorLayouts(yearCount, extras: LayoutExtras = {})` builds every floor layout.
- Each floor adds its own optional input field to `LayoutExtras` (`types.ts`; for example `labs` and `career`), never a new positional parameter.

### Arrival

- Every floor sets `FloorLayout.arrival` (Round 8 J): where the rover rolls on after an elevator ride, heading east along the floor's main axis. Ride, glide and camera rules: [Elevator arrival](3d-experience.md#elevator-arrival).
  - L1 (-6, 0), L2 x = 6 in the 2019 plaza, L3 `LABS.overview`, L4 (-4, 0), RF (-8, 0).
- L1, L2, L4 and RF carry a view zone `<floor>:arrival` in the floor's `viewZones`. L3 keeps its ordinary `L3:overview` zone instead (no `arrivalOnly`; [L3 arrival](floor-l3-labs.md#arrival-and-camera-views)). The `<floor>:arrival` zone is:
  - a 4 u box at the arrival point, `yaw` looking east (`yawLooking({ x: 1, z: 0 })`), with `travel` east so only an eastbound rover matches;
  - `arrivalOnly`: active only once an arrival or a deep-link spawn primed it, so driving back through never swings the camera;
  - the L2 zone adds `railYaw` (the rail camera due west of the rover, looking down the Career Road).
- Zooms are the widest view whose camera stays east of the elevator shaft: constants per floor (`LOBBY.arrivalZoom` and `arrivalZoomPhone` on L1 (`src/experience/config.ts`), `CAREER_ROAD.arrivalZoom` on L2, the newsroom concept's `arrivalZoom` on L4, `ROOF_DECK.arrivalZoom` on RF), capped per camera class by `shaftClearZoom`; `tests/unit/arrivals.test.ts` asserts the clearance, the framing and the free roll-on path at four sizes.
- Deep links spawn on the arrival point on L3, L4 and RF (`spawn`). L1 keeps the kiosk spawn and L2 the approach.

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
- `roomTarget` (host3d) drives to `door.at` for any room with a door, and to `FloorLayout.listStop` for a room without one on floors that set it (L4 archive posts).
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
  - primed on deep links, resumes and elevator arrivals, so a rover standing on a pad never opens it.
- On trigger it sets `store.picker`: `{ kind: "floor" }` or `{ kind: "year", from }`.
- Clicking a pad drives there through [point-and-go](#point-and-go), then opens the picker (at once when the rover already stands on it).
- `PadPicker` (`src/hud/pads/`) lists, on the shared `Modal` with `sheet` (bottom sheet on phones):
  - floors: names from `hud.floorLabel` (like the elevator panel, which stays), `hud.pads.floorDesc`, thumbnails `public/floors/{id}.webp`;
  - years: rooms, organizations, the prologue on the first year.
  - Keys: arrows, Home and End move, Enter picks, Esc closes.

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

L3, L4 and RF load on demand; per-floor caps are owner-approved (budgets in [performance](performance.md)).

### Structure

- `floorChunks` (`floors/floorChunks.ts`) does one dynamic import per lazy floor.
- The entries in `floors/chunks/` carry the floor and its floor-only HUD pieces:

  | Floor | Chunk entry contents |
  |---|---|
  | L3 | Labs, OpsBody, ReactorBody, HologramOverlay |
  | L4 | Library, ResearchBody, TopicsBody |
  | RF | Roof |

- L1 and L2 stay in the main 3D chunk.
- Never import `Labs`, `Library`, `Roof` or those HUD pieces statically anywhere in the closure of `Experience.tsx`.
  - `tests/unit/floor-chunks-graph.test.ts` (`tests/helpers/import-graph.ts`) fails otherwise.
- New floor-only HUD code goes into that floor's chunk entry and is reached through `lazyFloors.tsx` or the entry's exports.

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

- Drawer bodies for ops, reactor, research and topics are lazy (fallback "Loading room", the generic sections if the chunk fails).
- `VisitsBody` loads `VisitsPanel` through the Contact page's dynamic import.
- The README renderer (`hud/drawer/ascii.ts`) loads when the README view first opens.
- Hologram overlay and the drawer's chunk bodies go through `lazyFromChunk` (`hud/lazyFromChunk.ts`):
  - a failed import shows a fallback (the hologram view closes, the drawer shows the generic sections);
  - the next open retries.

### Prefetch and rides

- Prefetch covers idle floors only (`floorPrefetch.ts`, `FloorChunkPrefetch.tsx`). Triggers:
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
- Measured: main 3D path lite 403.8 KB and full 427.4 KB gzip; floor chunks L3 13.3, L4 10.1, RF 3.3 KB; Classic site JS +381 B.

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

- The L2 and L3 floor code (`floors/career/*`, `floors/labs/*`) may move the coordinate; the pad rules in `tests/unit/floor-pads.test.ts` check it.
- E2E: `e2e/fast-return.spec.ts`.

## Floating signs and spectacle effects

Design: [spectacle floor ends and hall](../superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md) (`docs/superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md`).

### Floating signs

- No words painted on a floor (owner decision). Every floor word is a `FloatingSigns` entry (`fx/FloatingSign.tsx`, `SignSpec` from `fx/signLayout.ts`):
  - upright, turned to the camera every frame (yaw only, never mirrored);
  - a dark plate with a neon rim in the sign color;
  - all signs of a floor in one group (two draw calls).
- Never lay a `Text` or `BatchedLabel` flat (`rotation` -90 degrees about x, `tilt: Math.PI / 2`).
  - `tests/unit/floor-text.test.ts` and `__hq.probes.flatText()` (`e2e/spectacle.spec.ts`) fail.
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

Design: Part 2 of the walkable floors plan (L2 Career Road, L3 Project Roads). L2, L3, L4 and RF are built on this kit (see the per-floor files); L1 uses it only for the Highlights Hall road.

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
    - it lives apart from the road kit so the navgrid stays out of the store's always-loaded chunk (floor layouts import `road.ts`);
  - also `projectOnRoad`, `sampleRoad`, `onNetwork`, `networkBounds`, `buildRoadGraph`.
- `FloorLayout.roadZone` limits a floor's road to drives that start or end inside it (`routeUsesRoad`).

### Opting in

- A floor opts in by setting `FloorLayout.road`: every autopilot drive (missions, the elevator approach) then follows the road through `roadRoute` in the Director.
- Point-and-go drives are mission legs, so they follow the road too.
- Scrubbing keeps the navgrid.

### Rendering

- `<RoadMarkings network color tier reducedMotion />` (`src/experience/fx/RoadMarkings.tsx`; mesh data in `nav/roadGeometry.ts`).
- The lite tier and reduced motion drop the chevron pulse; the lite tier drops the additive edge glow.

### Space rules

`src/experience/nav/space.ts`, asserted with `expectSpaceRules` from `tests/helpers/space.ts` in every walkable layout test:

- roads at least 8 u wide, plazas at least 16 u;
- roads clear of obstacles over their full width, spurs by the rover radius;
- obstacles either touching or at least 6 u apart (also from the slab edge);
- every door has a spur ending on its pad;
- 6 u wide floor connects the start to within 4 u of every pad.
- Layouts with floor pads pass them as `pads` (see [pad rules](#pad-rules)).

### Career type icons

- Style: "Neon line" (owner decision).
- `CAREER_ICONS` (24 x 24 line art: briefcase, laptop with code, graduation cap, trophy, flag) and `CAREER_TONE` (sky, pink, violet, amber, emerald) in `src/experience/fx/holoIcons.ts` feed:
  - `<HoloIcon strokes instances color tier reducedMotion />`: all instances of a type in one geometry, one draw call plus a halo on the full tier, sway toward the road, still under reduced motion;
  - the SVG `<TypeIcon type />` (`src/components/TypeIcon.tsx`):
    - the `/journey` filter chips;
    - `TypeMarker` on timeline rows (`src/components/page/Layout.tsx`; /journey, the home timeline, /quick, entry pages);
    - the career badge in the [Glass Drawer](hud-and-drawer.md) (`RoomView` badge `type`).
- Use `CAREER_TONE` wherever a career type has a color.

### Prototype

- `/{locale}/dev/floors?floor=L2|L3&road=straight|meander&view=rover|top&sheet=1&at=x,z&tier=full|lite` under `bun run dev`. Picks: meander road, Neon line icons (owner decision).
- `page.dev.tsx` files are routes only when `NODE_ENV` is not production or `HQ_DEV_PAGES=1` (`pageExtensions` in `next.config.ts`), so the static export never contains them.
- The L4 concepts prototype is `/{locale}/dev/library` (pick: newsroom, owner decision); `bun scripts/dev-shots.ts` captures it.

## Point-and-go

### Behaviour

- The rover never drives to a clicked floor point (owner decision).
- Visitors drive with WASD or the arrows (Shift boost) or the joystick (double tap boosts), or point at a glowing target:
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
  | `kind` | `door`, `elevator-pad`, `teleporter`, `station`, `kiosk`, `board` |
  | `label` | resolved for the tower's locale |
  | `at` | approach point |
  | `bounds`, `height` | pick volume |
  | `action` | `open-room`, `elevator-picker`, `teleport-picker` with `year`, `command` |
  | `base` | optional bottom of the pick volume, for stacked targets such as the [Tech Reactor](floor-l3-labs.md) rings |

- Sources:
  - doors from `FloorLayout.doors`, with room footprints from each floor's layout builder (RF doors are `station`s);
  - pads from `FloorLayout.pads`;
  - plus the L1 profile hologram, skills wall and Rover menu kiosk, the L3 wing boards and the L4 archive board.
- Ids: `${floor}:door:${slug}`, `${floor}:pad:elevator`, `L2:teleporter:${year}`, `${floor}:station:${key}`, `L1:kiosk:ask-rover` (the Rover menu kiosk; the id is kept for stored visits), `L3:board:${wing}`, `L4:board:archive`.

### Adding targets

- Add new in-world targets to `baseInteractables` (built-in floor content), or call `registerExtraInteractables(floor, items)` from the feature.
  - It returns the dispose function; ids must be unique, and the built-in entry wins a clash.
- Readers: `extraInteractables(floor)`, `onInteractablesChange(listener)`, `useInteractables(floor, layouts, data)`; inside the canvas `interactRuntime.items` holds the current floor's full list.
- The HUD minimap reads `buildFloorLayouts` and `interactRuntime.items` (`subscribe`, `setItems`): a floor change that alters roads or targets shows up on the minimap and the overview automatically, with no map code to touch (see [Minimap](hud-and-drawer.md#minimap)).
- Never put navigation `onClick` or hover handlers on scene objects.
  - L1 certification badges and pills and L4 research paper plates keep their own clicks (they open previews, not drives).
- Commands (`parseCommand` in `pick.ts`): `terminal`, `palette:pods`, `palette:rooms`, `palette:posts`, `cv`, `reactor:<ring>`, `open:<room id>` (that room's drawer where the rover stands; the L4 research monument).

### Rendering and actions

- `InteractLayer` (mounted in `Scene`) puts every target of the current floor into one invisible instanced unit box (no draw call) and handles hover and clicks.
- Highlight cost while a target is hovered: 4 draw calls on lite (outline, ring, tag text and pill), 5 on full (plus the additive fill). No pulse under reduced motion.
- The name tag stands over the approach point (`labelAnchor`), never over the object, so it never doubles or covers in-world titles.
- The `interact` intent carries the target; the Director runs `performInteract`:
  - rooms through `goToRoom`;
  - everything else as a mission `drive` step followed by its action, so keys and the joystick cancel it.

### Tests

- `tests/unit/interact-registry.test.ts` (real content on every floor), `tests/unit/interact-pick.test.ts`, `tests/unit/interact-missed.test.ts`, `tests/hud/InteractStatus.test.tsx`, `e2e/interact.spec.ts`.
