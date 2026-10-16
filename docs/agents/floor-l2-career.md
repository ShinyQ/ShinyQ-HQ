# L2 Career Road

The L2 Career floor: the Career Road with its year plazas, the Workshop annex, the Horizon and Origin floor ends, and the rail camera.
Index: [AGENTS.md](../../AGENTS.md).

Related: road kit, floor pads, Express Return pad, floating signs and point-and-go live in [floors.md](floors.md); the career type icons (`HoloIcon`, `CAREER_TONE`) too.

## Career Road

Code: `floors/career/layout.ts`. Design: walkable floors plan Part 2. Meander road and Neon line icons (owner decision).

### Road and year plazas

- `buildCareerRoad(input)` lays one 8 u road forward in time from the elevator approach to the Workshop annex.
- Each year from `getYears()` is an open plaza (18 u deep).
  - Its length scales with its entries (`plazaLength`: 10 u bays, staggered sides, at least 16 u).
- Meander: every other plaza shifts 7 u in z (`CAREER_ROAD.meander`, order 0, +7, 0, -7), joined by S-curves, while x keeps increasing.

### Rooms

- Rooms dock in one row on both long plaza edges: alternating, north first, a 2 u apron, doors facing the road.
- Sizes: award rooms 6 x 8, others 9 x 8.
- Each room has a spur in its `CAREER_TONE`.
- Rooms are open bays: only the 2 x 2 pedestal blocks the rover.
- Rooms show one Neon line `HoloIcon` per type, facing the rail camera.
- Award plinths show the year's placings ("×10") under the trophy icon.

### Year markers and labels

- A neon arch with the year digits and a signpost ("2021 · 8 rooms") stands on the link before each plaza; posts are obstacles.
- The year floats as a big sign behind the plaza's north room row (`yearMarkerSigns` in `labels.ts`, on `FloatingSigns`), never between the rail camera and the road.
- Labels, signposts and year markers fade with distance along x (`labelFade`, 20 to 30 u).
- `placeAt(layout, x)` drives the HUD "You are here" chip (`src/hud/YearChip.tsx`).

### Data and mounting

- The 3D chunk gets `ExperienceData.career` (`buildCareerData`); drawer content comes from `room-views/career.ts`.
- The road mounts only while the rover is on L2 or riding there, which keeps L2 under 150 draw calls and the Lobby intro light.

## Workshop

Code: `workshopLayout.ts` (`buildWorkshop`), scene `WorkshopAnnex.tsx`. The Workshop closes the road.

### Layout

- Forecourt: 18 x 18, with the time console docked on its north edge and the Return pad beside it (`workshop.returnPad`).
- A gateway arch leads into the Workshop plaza (18 deep, at least 34 long).
- Repo skyline, docked north (`skyline.ts`):
  - `skylineBars`; height `skylineHeight` on a log scale of stars; `languageColor`; top three labeled.
- Workbenches, docked south: one per side project, in two groups of touching benches, centered under the skyline.
  - `benchGroups` are the obstacles.
  - A project with a full L3 pod gets no bench (see `sideProjects` under "Content access" in [content.md](content.md)).
- The road ends 4 u before the window (the Horizon deck).

### Stops, tall shapes and views

- The Workshop rooms have no doors. `FloorLayout.stops` (shared with the L3 Tech Reactor, [floor-l3-labs.md](floor-l3-labs.md)) maps them to their stops, and `roomTarget` reads it:

  | Room | Stop |
  |---|---|
  | `L2:workshop` | gateway |
  | `L2:side-<id>` | bench |
  | `L2:repo-<slug>` | skyline bar |

- `tall` lists the gateway posts and the skyline.
- `viewZones` turn the camera at the console (zoom 0.85) and on the Horizon deck (look east).

### Point-and-go targets

- `L2:station:workshop`
- `L2:station:time-console`: action `console-picker`, picker `{ kind: "console" }`:
  - Back to elevator (green): a `teleport` intent to `elevator:L2` that the Director runs as the Express Return pad beam (`beamHome`; see [floors.md](floors.md));
  - every year (pink): a `teleport` intent to `teleport:<year>`.
- `L2:station:bench-<id>`
- `L2:station:repo-<slug>`

### Scene

- `WorkshopAnnex.tsx` draws merged solids, merged edges, one instanced holo plate mesh (bars, bench cards, console screen), one `BatchedLabels` (`workshopLabelSet`), the bench icons (full tier) and the `career-workshop-signs` floating signs.
- The window has glass and sight lines only, no text (owner decision: no "L3 Labs above" label).

## Layout tests and outputs

- The layout passes `expectSpaceRules` with the real content and the Return pad (`tests/unit/career-layout.test.ts`, `career-workshop.test.ts`).
- It feeds `FloorLayout.road`, `doors`, `obstacles`, `stops`, `tall`, `viewZones` and `scrubStops` (plaza centers, then the forecourt and the Workshop).

## Floor ends: Horizon and Origin

- Code: `horizonLayout.ts` (pure, `buildHorizon`) and `Horizon.tsx` (owner decision).
- East "Horizon": a light bridge off the slab past the window, a skyline 200 to 400 u out and far below, a sunrise glow, glow strips in the empty north-east and south-east corners.
- West "Origin": a light pillar.
- Cost: 5 frustum-culled holo draw calls, decor only (no obstacles).

## Rail floors

- `FloorLayout.scrubStops` are the x stops a horizontal swipe (`scrub` intent) drives to.
  - `scrubTarget`: one stop per 30% of the screen width; swipe left goes forward in time.
  - It lands on the road (`roadZAt`).
- The rail camera (`RAIL` in `camera/rigs.ts`) is high enough for both room rows of a plaza.
  - It steers along the x and z axes and follows the road's z (`railPose(..., axisZ)`, fed by `CameraDirector railAxis`).
  - Once the rover leaves the road it slides in z by `|z - axis| - 4`, so rooms stay in frame.
