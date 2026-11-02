# L1 Proof Park: One Rectangle, Contribution City, Podium of Wins, Benchmark Lab (design)

Status: approved 2026-11-02 (owner, [decision](../../decisions/2026-11-02-l1-proof-park.md)); plans `2026-11-02-l1-proof-park-outline.md` (PR 2), then one plan per later PR; PR 2 in review.

Owner request: "So as you know the L1 was not realy square because the addition of agent office im thinking of how can
we make it square by adding some wow things into it or expand highlights so its fully square and think and become as
creatively as possible".

## 1. The problem

The L1 slab was `LOBBY.bounds` (x -24 to 69, z -27 to 27; the Highlights Hall from x 33) plus one wing, the Agent
Office (x -12 to 18, z 27 to 59, `officeWing(S)` with S = 27). The outline had two empty notches south of the Lobby's
edge: west (x -24 to -12, z 27 to 59, 12 x 32 u) and east (x 18 to 69, z 27 to 59, 51 x 32 u). The owner wants L1 to be
one clean 93 x 86 u rectangle.

## 2. Delivery (one PR at a time, in order)

| PR | Scope |
|---|---|
| 1 (another session) | The daily GitHub contribution calendar in `content/generated/dynamic-facts.json`, with pure helpers (level, busiest day, streak) |
| 2 | The outline: both notches filled, the arch from the hall plaza, the road from the office plaza, road zones; no new chunk |
| 3 | Proof Park: the lazy park chunk with Contribution City and the Podium of Wins, `ParkView`, drawers, deep links, point-and-go, Cmd-K, minimap, budgets, perf and visual poses |
| 4 | Benchmark Lab: the terminal wall in the same chunk, opening the LILT career drawer |

## 3. Outline (PR 2)

### 3.1 One rect, not more wings

`FloorLayout.bounds` for L1 becomes the whole rectangle (`LOBBY.slab`: x -24 to 69, z -27 to 59) and L1 drops
`FloorLayout.wings`. Why:

- Wings model a slab that is not a rectangle (`nav/slab.ts`). With both notches filled the union is one rect, so the
  plain path fits: `clampToSlab` and `inSlabXZ` take the allocation-free single-rect branch, the slab mesh is one box,
  the minimap draws the plain rect, and the navgrid, collision, camera clamp and space rules need no joint bridges.
- Filling each notch with its own wing is not allowed: the main rect, the office wing and a notch wing would share the
  corners (-12, 27) and (18, 27), and `FloorLayout.wings` forbids three rects at one corner (the inset union bridges
  pairwise joints only).
- One full-width south wing (x -24 to 69, z 27 to 59) would also work, but it keeps a joint and the wing code paths for
  no shape reason.
- `slabBox(L1)` is the same rect as before (the wing already reached z 59 and the main rect x -24 to 69), so the tower
  frame (`Tower.tsx`), the grid fade and the minimap's view box do not move.

`LOBBY.bounds` stays the Lobby and hall part north of S (x -24 to 69, z -27 to 27): S is still the line the office wing
(`officeWing(S)`), the hall stations, the observatory and the intro landmarks derive from. Only the floor's slab uses
`LOBBY.slab`. The wing rect (`LOBBY.officeWing.rect`) stays a zone (road zone, ghost-outline area, reveal), not a slab
rect.

### 3.2 What changes for space rules

Obstacles that touched the old edges now have floor beyond them, which the 6 u rules allow (open floor is never a
gap): the observatory's south face, the hall gateway's south pillar, the contact station's south face, the office's
CI tower corner (east face at x 18) and ship dock corner (west face at x -12). Every new obstacle keeps 6 u from them
or touches them. `spaceViolations` on the real L1 stays empty, the pads keep their rules.

### 3.3 Arch from the hall plaza

The gap west of the contact station is not x 33 to 45: the hall gateway's south pillar stood at x 37.4 to 38.6 (z 25.8
to 27), so the opening between it and the contact station (x 45 to 59, z 24 to 27) was x 38.6 to 45, 6.4 u. That
passes the 6 u clear rule but not the 8 u road rule. Assumption (noted in the PR for the owner's review): the gateway
arch moves 2 u west (`HALL.gate.x` from x 38 to 36, pillars x 35.4 to 36.6), which opens the gap to x 36.6 to 45, 8.4 u,
so a real road runs through the park arch and the loop is drawn and driven on roads. Nothing else in the hall moves;
the gateway still spans the lead road 3 u before the hall plaza.

- Two posts like the gateway's (1.2 x 1.2 u, 7.4 u tall, a 1 u lintel), standing just south of the old edge at z 27
  to 28.2: the west post touches the gateway's south pillar (x 35.4 to 36.6), the east post touches the contact
  station's south face at its west end (x 45 to 46.2). Opening x 36.6 to 45 (8.4 u), facing the hall plaza, with the
  park (and Contribution City's skyline, PR 3) seen through it.
- Drawn with the hall's merged solids and line mesh (no new draw call), camera columns in `FloorLayout.tall`. No
  uplights: two more beams in the hall's instanced lights would add about 480 triangles to the elevator ride into L1.
- The floating "PROOF PARK" sign over the lintel ships with the park in PR 3.

### 3.4 Roads

- `park-lead`, 8 u wide, from the office plaza's centre (3, 36.5) east along z 36.5 to the park plaza's centre. Its
  start lies on the office lead road's driving width (3.5 u from its end at (3, 33)), a T junction, so the office and
  park roads are one network part. Drawn from the office plaza's east edge (x 12) to the park plaza's west edge, so its
  fill never doubles a plaza's.
- Both park roads and the park plaza draw in the hall's road mesh (`RoadMarkings`), which the elevator rides into L1
  already draw: in the office wing's road mesh they grew its bounds into the ride's view (4 more scene calls on the
  full-tier ride from L2). They cost 3 calls at the office stop instead (40 to 43 on the full tier, cap 125).
- `park-arch`, 8 u wide, on the arch's axis (x 40.8) from z 26 (5 u south of the hall lead road, so it never joins the
  hall's part) to the park plaza's centre. Drawn from the hall plaza's south edge (z 22) to the park plaza's north edge.
- Park plaza, 22 x 16 u centred on the arch's axis (40.8, 36.5) (x 29.8 to 51.8, z 28.5 to 44.5, the office plaza's
  depth), right south of the arch; both park roads end on its centre.
- Routes: the hall keeps its own network part, so a Lobby drive into the hall still joins the hall lead road at its
  west end. The park joins the office's part: a Lobby drive into the park follows the office lead road and the park
  lead road; a hall drive into the park hops from the hall's part to the arch road's north end and drives south under
  the arch; a park or office drive into the hall leaves by the arch. Office routes do not change: a drive to the
  office stop still leaves the road at the office plaza's centre.
- Loop: Lobby, office lead, office plaza, park lead, park plaza, arch, hall plaza, hall lead, Lobby.
- `roadZone` gains the park (x 18 to 69, z 27 to 59), so drives into or out of the park follow the road.
- The rest of the old south edge between the office and the arch (x 18 to 35.4) is open floor: the Lobby's south-east
  corner opens onto the park directly.

### 3.5 What stays

- The intro orbit and the spawn view (code unchanged; south-facing views show the larger floor, the intended change).
- The office wing, its views, routes, stop and space rules; the hall, its stations, doors and deep links; the contact
  station's place. The hall gateway arch moves 2 u west (3.3), the hall's only change.
- No new chunk, program or string; the elevator rides draw what they drew (section 3.4: 3 more calls at the office stop).

## 4. Proof Park (PR 3, east notch)

Positions are reserved now so PR 2's roads and rules hold; PR 3's plan fixes the details.

- Contribution City along the park's south edge: a plinth x 24 to 69, z 53 to 59 (45 x 6 u, touching the south and east
  edges, 6 u from the office's CI tower corner), one tower per day (53 week columns, oldest west, newest east, x 7 day
  rows; 0.85 u by 0.86 u cells), towers up to about 6 u, colors in GitHub's 5 levels (palette colors only), heights
  from the daily counts (below), one instanced mesh with no bottom faces. The busiest day gets a small beacon. A floating sign reads "N contributions
  in the last year" (`github.contributionsLastYear`). Room `L1:park-city`: total, busiest day, longest streak (PR 1's
  helpers), public repos and Hugging Face models from the existing facts.
- The avenue beside it: an 8 u road on z 49 (z 45 to 53, 4 u from the plinth), joined to the park plaza, with the city's
  elevated camera stop. Tower heights follow the real daily counts on a log scale (owner, 2026-11-02: about
  log1p(count) / log1p(max), a small minimum for a day with contributions, a flat tile for zero), colors stay
  GitHub's 5 levels: with levels alone only 16 days rise above level 1 and the city would read flat.
- Podium of Wins in the park's east half, facing the arch, inside x 52.2 to 63, z 33 to 45 (6 u from the arch, the
  contact station and the east edge; clear of the avenue). Data: the 24 `awards`, grouped by `placement` (gold, silver
  and bronze tiers; the honor rail for the rest), counts derived; the sign "24 placings · 7 wins" derived. Room
  `L1:park-wins`; the drawer lists all 24 grouped by placement, scrolled to the clicked trophy.
- One lazy chunk (park and lab), never on the first frame, loaded near the park or lab roads (about 30 u), on a park deep
  link, mission, `goto:` or drawer, and prefetched on idle after the office has loaded. The shared holo program
  (`HOLO_MODE.stage`) and existing materials only, `HallReady`-style precompile and pinning, at most 8 scene draw calls in
  view, `ParkView` hiding it out of view and during rides (the L1 to L2 ride triangle peak unchanged), `useDispose` on
  every GPU resource, `useFrame` deltas only, still under reduced motion. The chunk's own cap: measured + 0.6 KB.

## 5. Benchmark Lab (PR 4, west notch)

- A terminal rig flush with the west slab edge (x -24 to -20, inside z 33 to 53: 6 u from the observatory and the south
  edge), leaving an 8 u walkway to the office's ship dock corner (x -12).
- A road west from the office plaza into the alcove, 4 u clear of the rig.
- Six stages light in order on a loop: native-language dataset, Docker environment, reference and control solutions,
  pytest verifier (held-out data, sandboxed reruns, tamper checks), probe runs across models, failure analysis. Never
  task names, prompts or data. A click opens the LILT career drawer (`lilt-ai-2026`); no new claims.
