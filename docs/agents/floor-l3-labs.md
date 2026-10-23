# L3 Labs (Project Roads)

The L3 floor: its layout and roads, the directory boards, docked pods, camera views, the Data and ML spine, the Ops Control Room and the Tech Reactor.
Index: [AGENTS.md](../../AGENTS.md).

## Project Roads layout

Source: `floors/labs/layout.ts` (walkable floors plan, part 2). Road kit, pads, Express Return and floating signs: [floors.md](floors.md).

### Output of `buildLabsLayout(pods)`

- The floor (with `road`, `viewZones` and `arrival`).
- `placed` pods, `directory`, `boards`, `network`, `hub`, `east`, `reactor`, `ops`, `wingZ` and packet `lanes`.

### Roads

- A lead road runs from the elevator approach (-21, 0) into a round 26 u hub plaza at (-4, 0).
- Three roads leave the hub center (there is no annex, data plaza or `directory` stub road):
  - `data` road (the Data and ML spine): straight east along z = 0 to the reactor ring's west point. See [Data and ML spine](#data-and-ml-spine).
  - `software` (north) and `ai` (south) roads: each runs `[hub center, mouth, (10, -/+wingZ), (reactor x, -/+wingZ), ring north or south point]`.
  - Each side mouth sits on the hub rim 30 degrees off the spine (`LABS.mouthAngle`), so all three mouths sit in the arrival view.
- `wingZ` (`LabsLayout.wingZ`, 36 today), so the spine pods fit between the inner rows:
  - `max(24, 2 * (road / 2 + forecourt) + deepest spine pod + LABS.rowGap (6) + deepest inner wing pod or OPS.d)`.
- Wing road length: each wing road runs `LABS.tail` (7 u) past the far edge of its own last docked pod.
  - The AI wing also runs half a road width past the Ops Control Room (`sideTurn`).
  - When the spine has pods, at least `tail` past the last spine pod, so its last leg never crosses the spine rows.

### Reactor plaza and ring road

- The 22 u reactor plaza at z = 0 sits at `max(wing turns, last spine pod edge + tail + east / 2)`.
  - 126 with today's content: the Ops Control Room ends at 122, plus half a road.
- The end is mirror-symmetric about the spine (owner decision): both wing roads turn at that x and drop straight onto the ring road's north and south points; the spine enters at its west point.
- The ring road (radius 6.5, 16 sides) runs around the reactor core (`reactor.ts`):
  - The core is a 3.2 u square obstacle at the plaza center and a tall camera column.
  - `Plaza.core` keeps the center out of the road graph, so every route drives around it.
  - The floor is one loop with no dead ends and no empty road ends.
- The slab ends one plaza radius and `LABS.margin` past the plaza (x = 143 today).

### Directory boards

Three free-standing boards stand at the fork (`LABS.board`; owner decision: a neat entrance, no joined wall or shared frame).

| Board | Placement |
|---|---|
| Data and ML | A gate over the spine at x 18 on two posts outside the road's driving width, facing west |
| Product Engineering | At (16, -11.2) on one central pylon beside its road mouth |
| AI Engineering | At (16, 11.2) on one central pylon beside its road mouth |

- Size: each 9 u wide and 0.6 thick, raised from `base` 3.2 to 9.6 u (the rover, 2.8 u, drives under).
- The side boards are turned `turn` (0.33 rad) from west toward the axis, so their fronts face the arrival camera.
- `DirectoryBoard` carries `center`, `normal` (the front face direction), `along` (its reading direction), `yaw` and `stop`.
- Obstacles: `wallPosts()` returns the `BoardPost[]` (two gate posts, two pylons). The board rects are tall camera columns (`FloorLayout.tall`).
- Stops: `directoryBoard(wing)` is a board and `directoryStop(wing)` its stop, `boardStop` (3 u) in front of its front face.
  - Gate: x 14.7 on the spine.
  - Side boards: the end of a short spur straight off the spine, so a click on any board drives straight there (never back through the hub).
  - Listed items end there.
- Clicking a board drives to its stop and opens the pods palette (the full list).

#### Board face content

| Line | Style |
|---|---|
| Wing name, one line | JetBrains Mono Bold 0.6 in the wing tint; `fitTitle` shrinks it only when it would not fit |
| "Directory · N projects" | 0.3 |
| Top `LABS.boardEntries` (5, docking order, gallery first), one line per project | `Pod.shortTitle ?? title` in Inter 400 at 0.37 |
| Tier marks | Their own column |
| "Open the full list · +N more" (`walk.boardMore`) | Only when the wing has more pods than the board lists |

- Titles are measured with `interWidth` from `fx/interWidth.ts`, a pinned Inter 400 advance table. A title that does not fit wraps to at most two lines, the last ending in "..." on a whole word.
- Phones (`device.viewport === "mobile"`): the top three at 0.45 (`LIST_STYLE.compact`).
- Sub, list and marks use `INK`, stored pre-converted so they draw as #a1a1aa, #c4c4cc and #8b8b94, below the full-tier bloom threshold: only the tinted title and footer glow.
- Wing names on the boards come from `ExperienceData.labs.wings` (messages `common.wing`), never literals.

#### Board rendering

- The content is pure (`floors/labs/directory.ts`: `wallSolids`, `wallLines`, `wallLabels`).
- 3 draw calls: `MergedBoxes`, one `LineBatch` boosted on the full tier, one `BatchedLabels`.

### Pod docking (side wings)

- Per wing, hero and featured pods dock along the road from the hub in site order (`dockingOrder`, which sorts with `comparePods`: gallery first).
  - At most `LABS.maxPerWing`; the rest and every listed pod stay on the directory.
  - Today Product Engineering docks 10, AI Engineering 11.
- One `LABS.slot` (12 u) per pod, so both wings stay mirror images whatever their tiers.
- Pods alternate the outer side (from x = 14) and the inner side (from x = 24, half a pitch later and 6 u clear of the boards), 7 u apart.
- Each pod has a 3 u forecourt and a spur to its door.
- Pod labels are billboards.

### Arrival and camera views

- L3 is the reference arrival; the rule for the other floors is in [floors.md](floors.md#arrival). Its zone is the ordinary `L3:overview` (from `LABS.overview.x - 4` to the data board stop x - 1, z +/-2), not an `arrivalOnly` `<floor>:arrival` zone.
- Deep links to `/labs` spawn, and elevator arrivals roll on (`FloorLayout.arrival`), to `LABS.overview` (8.5, 0) on the hub's east rim, more than `HINT.radius` from every board stop.
- `FloorLayout.viewZones` are checked in order: the board stops, the overview, the doors.

| Zone | View |
|---|---|
| Overview | Behind the rover and 35 degrees to its right (`ARRIVAL_YAW`, the elevator diagonal, owner decision 2026-10-23), zoom 1.4 aimed 5.75 u right (`LABS.overviewAim`, the left board clear of the profile card and the right one of the elevator rail), phones 1.45 aimed 2.75 u right (`LABS.overviewZoomPhone`, `overviewAimPhone`; the camera stays east of the elevator shaft) |
| Board stop | Looks at the board head on, zoom 1.05, phones 1 |
| Door | Turns the follow camera so the pod is in front of the rover |

- Overview framing, asserted in `tests/unit/labs-arrival.test.ts`:
  - Desktop and tablet show the three boards whole and apart (at least 40 px between them at 1440x900).
  - Phones show the gate board whole and at least 35 percent of each side board's front.
- A side board's zone is a 3 u square around its stop with the yaw `lookAlong(-normal)`, where `lookAlong(dir)` is the follow camera yaw that looks along `dir`.
- The overview and the Data and ML board zone carry `ViewZone.travel` (east):
  - They apply only while the rover faces within about 104 degrees of it (`TRAVEL_SLACK`, 0.25 cosine past perpendicular, so a rover arriving square to it keeps the zone).
  - So driving the spine west never swings the camera east.

### Floor markings and signs

- L3 paints no wing names and no chevrons on the floor (`RoadNetwork.chevrons: false`).
- No floating road signs (owner decision): the board titles are the one name per path. The `labs-wing-signs` group was removed; do not reintroduce it: `e2e/labs-paths.spec.ts` fails on a floating sign that names a wing.

### Packet lanes and decor

- Packet lanes run on two spines in the row gap between the spine pods and the inner wing rows (z = +/-17 today), from just east of the gate board to the reactor plaza's west rim.
  - Each has a branch into the back wall of every inner wing pod and every spine pod.
- `ReactorCore.tsx` draws the core (column, orbit rings and floor ring, 2 calls) and the data waterfalls off the four slab corners (`waterfallPanels`, one instanced call).

### Layout tests

- The layout test asserts the space rules with the real pods, a lopsided floor and an empty one.

## Data and ML spine

Source: `buildLabsLayout`, `LABS.data`.

### Docking

- Pods with `wing: "data"` dock along the `data` road: the spine from the hub center straight east to the reactor ring's west point (always present, also without data pods).
- They alternate north and south from x 24 (`LABS.data.start`) in even steps of half a pitch, at most `LABS.data.maxPods` (8); the rest and listed pods stay on the directory.
- The pods spread evenly to the reactor plaza:
  - The side wings' turns (without the spine) set the plaza.
  - The pitch `max(slot + gap, 2 * (spineEnd - 24 - slot) / (n - 1))` puts the last slot's end at `spineEnd`, a `tail` before the plaza's west rim.
  - With many pods the pitch stops at 19 u (`slot` 12 plus `gap` 7), so they pack and push the plaza east.
- Today's content: 6 pods at a 28.8 u pitch, slot starts 24, 38.4, 52.8, 67.2, 81.6 and 96.
  - The Fabric demand forecasting pod is first because it has the lowest `order` of the three gallery pods (`comparePods`: gallery first, then tier, then `order`; all six are featured).

### Board, stops and glow

- The Data and ML board (the gate over the road, `layout.boards.data`, stop at x 14.7, camera zone `L3:directory:data` with `travel` east) stands where the spine leaves the hub.
- `FloorLayout.directoryStops` holds every board stop (`roomTarget` for listed pods, `directoryStop(wing, layout)`).
- `wallSolids/wallLines/wallLabels(boards)` draw all boards in 3 calls.
- `roadGlow` lights:
  - a wing road from the ring entry to its turn and back to the westmost lit spur;
  - the spine from the ring entry back to the westmost lit spine spur.

### Interaction with the rest of the floor

- `wingZ` widens to fit the spine pods (see [Roads](#roads)).
- The Express Return pad stands on the axis at the reactor center plus (`LABS.returnPadX` 13, 0) ((139, 0) today).
- The Ops Control Room follows the AI inner row.
- `tests/unit/labs-spine.test.ts` derives every number from these rules, so a larger wing, such as an 11-pod AI wing, passes too.

### Tech ring

- Every data pod needs a tech on the Data ring (`tests/unit/tech-index.test.ts`).
- pandas lights the five repository pods.
- The Fabric demand forecasting pod (the spine's first pod; on-premise data into Fabric with a medallion pattern, owner decision) reaches it through Lakehouse, Spark notebooks and Fabric Data Pipelines.

### Cmd-K

- `HudIndex.wings` rows ("Data and ML projects"): in 3D they ride to the wing's board, on the Classic site they open `/labs?wing=<wing>`.

### E2E

- `e2e/labs-data.spec.ts`: the spine.
- `e2e/labs-paths.spec.ts`: the arrival (board gaps, no floating sign naming a wing, the mirrored end, the L3 budget) at 1440x900 full and 390x844 lite, and the drive to the reactor stop within the budget at 1440x900 full.
  - `LABS_SHOTS=<dir>` adds and saves every pose on both sizes: `entrance-<road>`, `board-<wing>`, `reactor`, `reactor-approach` and `reactor-top`. Without it those poses are not listed (all measured 44 to 67 scene calls of 150); the roads and board stops they drive are pinned by `tests/unit/labs-layout.test.ts` and `labs-arrival.test.ts`.

## Ops Control Room

"How I run AI in production" as a room (owner decision). Source: `floors/labs/ops.ts` (pure), `opsLive.ts`, `OpsRoom.tsx`.

### Placement

- A 6 x 6 u room (`OPS`) that `buildLabsLayout` docks in the AI wing's inner row, `OPS.gap` past the last inner AI pod.
  - x 116 to 122, z 23 to 29 with today's content; it moves east when the AI wing grows.
- It faces the AI wing road like the inner pods: door pad, spur, camera zone (yaw 0), obstacle and tall column (h 5.6).
- The AI road turns at least half a road width past it (`sideTurn`), so the room always fits (`LabsLayout.ops`, `tests/unit/labs-ops.test.ts`).
- Point-and-go: `L3:door:ops` (structural label `hud.rooms.ops`, footprint height `OPS.h`). Hint line: `dialog.hints.object.ops`.

### Screens

- Three screens styled like Grafana and Application Insights (`OPS_SCREENS`: Metrics, Traces, Alerts) show the proof tiles by `panel` and the alert rule families (`ExperienceData.labs.ops`, `buildOpsData`).
- The live panel above them shows this site's own telemetry (`opsLiveRows`):
  - visits in the last 30 days;
  - the 55+ FPS share and the median explore bucket from the snapshot's `perf` block;
  - then "Nightly performance runs" as text, because their results stay in CI artifacts the Worker cannot read.
- The live panel mounts only while the stats store is `ready` (hidden when missing, invalid or older than 7 days). See [stats.md](stats.md).

### Rendering

- Existing programs only: merged boxes, a line batch and a text batch like the directory boards, the floating sign.
- About 5 scene calls, 7 with the live panel. Lite drops the graph lines. Nothing animates.

### Probe, drawer, tests

- Probe: `__hq.probes.ops` (`mounted`, `live`, `rows`).
- Drawer: `OpsBody` (`RoomView.ops`, tiles in `metrics`, case studies in `cards` that ride to their pods).
- E2E: `e2e/production.spec.ts`.

## Tech Reactor

Design: [plan](../superpowers/plans/2026-10-14-l3-tech-reactor.md). Source: `floors/labs/techReactor.ts` (pure), `ReactorCore.tsx`, `ReactorHighlights.tsx`.

### Rings as targets

- The reactor core's six tech rings (`TECH_RINGS`: DevOps at the bottom up to AI and LLM at the top) are point-and-go targets `L3:station:reactor-<ring>`.
  - Stacked over the core (`Interactable.base`, `ringBands`), command `reactor:<ring>`.
- A ring click: the rover drives to the reactor stop and the drawer (`ReactorBody`, `RoomView.reactor`) opens on that ring.
  - The stop is `FloorLayout.stops["L3:reactor"]`, the ring road's east point; `roomTarget` and deep links read `stops` for doorless rooms.
- The three roads meet the ring at its north, west and south points; the stop is its east point, with the Express Return pad behind it on the axis.

### Picking a tech

A pick (`store.reactor.tech`):

- lights the docked pods (`litPods`; one instanced holo `pillar` mesh: a glow curtain on full plus a beacon);
- glows the road to them (`roadGlow`, one instanced `strip` mesh);
- dims other holograms and brightens its ring;
- floats "N projects use X" (one `FloatingSigns` group with the ring labels, `labs-reactor-signs`).

The only other floating sign on L3 is the Ops Control Room's name, `labs-ops-sign`.

### Surprise me

- Surprise me bumps `spin`: the rings spin fast for 1.2 s (never under reduced motion) and `ReactorSurprise` drives to `surprisePod`.

### Deep link and Cmd-K

- The gate starts on `L3:reactor` for `/labs#labs-tech=<slug>` (`gateStartRoom`, `floors/labs/techHash.ts`, import-free for the main bundle).
- Cmd-K: `HudIndex.techs` rows "Show projects using X": in 3D they pick and ride to the reactor, on the Classic site they open `/labs?stack=X`.

### Probe and tests

- Probe: `__hq.probes.reactor` (`tech`, `lit`, `roads`, `surprise`, `boost`).
- E2E: `e2e/reactor.spec.ts`.
