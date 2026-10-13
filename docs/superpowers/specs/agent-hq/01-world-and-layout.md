# Appendix 01: World and Layout

Part of [Agent HQ design spec](../2026-10-09-agent-hq-design.md).

All units are world units (1 u ≈ 1 m). Y is up. Each floor is a separate group positioned at `y = floorIndex * FLOOR_GAP`.

## 1. Tower constants

| Constant | Value | Notes |
|---|---|---|
| `FLOOR_GAP` | 14 u | Vertical distance between floor slabs |
| `FLOORS` | `["L1","L2","L3","L4","RF"]` | Index 0 to 4 |
| Elevator shaft | Center `(-28, *, 0)`, footprint 6 × 6 u | Glass tube, cyan edges, runs the full tower height |
| Elevator door | On every floor at `(-24, 0, 0)` (RF: `(-20, 0, 0)`), facing +x. On L3 it opens into the atrium. | The rover parks 3 u in front of the door when calling the elevator |
| Floor slab edge | 0.4 u thick, emissive edge line in the floor accent color | Edges are visible from outside during the intro reveal |
| Navgrid cell | 1 u | Generated per floor from room AABBs (inflated by the rover radius) |

## 2. Floor L1: Lobby (spawn)

Footprint: 88 × 42 u, x from -24 to 64 and z from -21 to 21 (the plaza ends at x = 28; the Highlights Hall fills x 28 to 64). The west edge stays at the elevator door (the shaft is fixed at x = -28), so the plaza sits east of the origin, centered on the elevator axis (z = 0): the lane ring, the stats ring, the certification arc and the slab line up with the door (owner request, October 2026). Accent: green `#34d399`.

| Element | Position (x, z) | Size (w × d) | Content |
|---|---|---|---|
| Spawn point | (14, 10) | | Rover start on the default camera diagonal from the plaza, turned toward the camera |
| Profile hologram | (6, 0) | Pedestal radius 3 | Rotating wireframe monogram "KAW" (hexagon radius 2.3, center height 3.4) |
| Name and headline | Above the hologram, height 6.4 (name 0.58 u, headline 0.3 u) | Text block up to 14 wide | Billboarded, always above the stats tiles and the monogram, and below the HUD top bar at 1440 x 900 (`tests/unit/lobby-title.test.ts`) |
| Stats ring | Around the hologram, radius 10 | 4 to 6 tiles, 3.4 × 1.9, center height 4.25 (staggered +0.5) | Headline stats (see appendix 07). Tiles billboard toward the camera and float above the rover (bottom above 2.8 u), so they read from any orbit angle and never block the walkway. |
| Lane ring (walkable) | Around the hologram, radius 12 | Rover footprint 10.5 to 13.5 | Clear of every element at rover height |
| Skills wall | (6, -18.5) | 40 × 1, at least 8.5 u tall on a 0.35 u glowing plinth; `skillsWallLayout` measures headings (they may wrap; every column reserves the same heading lines) and grows the wall so the longest column ends 1.8 u above its base | Four of the CV's seven skill groups, Backend, AI and LLM, Azure, DevOps (`wallSkillGroups`; 10 u per column, items at 0.4 u, at most 12 items per column so the wall stays at or under 9.85 u); the skills drawer lists all seven |
| Certifications wall | Footprint (25, 0) | 2.4 × 18, height 6.2 | Curved holo-wall on an arc of radius 19.6 around the hologram, every badge facing the plaza (`CERT_WALL` in `floors/lobby/layout.ts`). Issuer tabs (All, issuers with 2 or more, Other), up to 12 badges per page in two rows (earned newest first, then in progress, then expired), a pager past 12; the panel sizes to the All tab's first page. A badge opens the shared certification preview card. |
| Ask Rover kiosk | (2, 19.3), touching the south edge | 2 × 3.4 | Diegetic mirror of Ask Rover: body, stand and screen as one unit square to the grid, facing east (`floors/lobby/kiosk.ts`); lines never wrap |
| Highlights Hall lead road | (14, 15) to (36, 15), 8 u wide | | Passes the certification wall's south end; nothing written on the floor |
| Gateway arch | x 32.4 to 33.6; pillars z 9.4 to 10.6 and 19.8 to 21 | 1.2 × 11.6, 7.4 tall | The rover drives under the 1 u lintel; floating "Highlights Hall" sign (`hall.hall`) turns to the camera; a light curtain sweeps once per session (`hq:hall-gate`), never under reduced motion |
| Highlights Hall plaza | (46, 3) | 24 × 26 | Open floor; spurs to the four stations; light fountain at the center (light only, the rover drives through it) |
| About me station | x 32 to 42, z -21 to -18 | 10 × 3 | Round holo pedestal (r 1.5); the portrait as a hologram disc, name and headline above it, the first four stats on tiles in an arc, the one-line intro in front of the column; room `L1:highlights-about` |
| Top projects station | x 48 to 64, z -21 to -18 | 16 × 3 | Three monolith screens (4.9 × 7.6) in a shallow arc with the landing's three featured projects; room `L1:highlights-projects` |
| Work experience station | x 61 to 64, z -8 to 10 | 3 × 18 | Lit arch: Employment and Freelance columns on the two pillars, newest first, the title on the lintel, an amber glow in the opening in front of the door pad; room `L1:highlights-experience` |
| Contact station | x 40 to 54, z 18 to 21 | 14 × 3 | Signal beacon (lattice mast, 9.5 tall, pulsing rings) and a floating card: availability, email, channels, CV hint; room `L1:highlights-contact` |
| Elevator door | (-24, 0) | | |

Lanes: one ring lane around the hologram (radius 12) and spurs leaving the ring outward to the kiosk, both walls and the elevator.

Spacing rules (enforced by `tests/unit/lobby-layout.test.ts`): no two elements' bounding boxes overlap at any stats ring rotation (billboards counted at full width in x and z), nothing reaches into the walkable ring below rover height, and every wall and the kiosk keeps at least 4 u of walkway outside the ring. View zones in front of the skills and certifications walls turn the camera to face them (appendix 03).

## 3. Floor L2: Career Archive (Career Road)

Footprint: one road along +x, forward in time (walkable floors plan, Part 2; owner picks: meander road, guided walk, Neon line icons). Accent: amber `#fbbf24`. Geometry lives in `src/experience/floors/career/layout.ts` (`buildCareerRoad`) and passes the walkable space rules (`src/experience/nav/space.ts`).

| Element | Spec |
|---|---|
| Road | 8 u wide, from the elevator approach (-21, 0) to the Horizon deck at the end of the Workshop. x increases monotonically (rail camera, swipe scrub); every other year plaza shifts 7 u in z (order 0, +7, 0, -7) and S-curves join them. Chevrons point forward in time. |
| Year plazas | One open plaza per year that has entries, ascending (2019 first, pre-2019 entries fold in as the prologue). 18 u deep; length scales with the entry count (10 u bays, sides staggered by 5 u, at least 16 u). The year floats as a big sign in the floor accent behind the plaza's north room row (spectacle round: no words on the floor; `yearMarkerSigns`), so it never stands between the rail camera and the road. Plazas are 10 u apart. |
| Year rooms | Each entry is a room 9 × 8 u (awards 6 × 8) docked in one row on a long plaza edge behind a 2 u apron, alternating sides (north first), door facing the road, with a spur in the type color. No room sits behind another. Only the 2 × 2 pedestal blocks the rover. |
| Room icons | One Neon line icon per type, one hue each (`CAREER_ICONS`, `CAREER_TONE`): employment briefcase (sky), freelance laptop with code (pink), education cap (violet), award trophy (amber, with the year's placings, "×10", on the plinth), milestone flag (emerald). The same icons mark types on the Page View. |
| Room labels | Upright above each room, facing the rail camera; they fade with distance along the road (20 to 30 u). |
| Year arch | A neon arch over the road before each plaza with the year in large mono digits and a signpost ("2021 · 8 rooms"). The HUD shows "You are here: 2021". |
| Workshop forecourt | F3 (owner approved 2026-10-14, `floors/career/workshopLayout.ts`): an 18 × 18 u plaza one link after the last year plaza, on the road's center line. The **time console** (5 × 1.2 u desk with a vertical screen listing every year and "→ Back to elevator", facing the rail camera) is docked on its north edge behind a 1.5 u apron; its stop sits 1 u inside the edge. The Return pad (F1, `FloorLayout.returnPad`) stands 5.5 u west of the console on the stop line (its sign clear of the WORKSHOP sign). The south half stays open floor (clear routes, no dead strips). A camera zone at the console squares the view on and zooms to 0.85. |
| Workshop | The next plaza (18 u deep, at least 34 u long; today 39 u, x 359 to 398), entered under a gateway arch over the road (posts at z ±5, a floating WORKSHOP sign; clicking it opens the Workshop overview, `L2:workshop`). North edge: the **repo skyline**, one bar per public repo on an 18 × 3.6 u plinth (10 columns × 2 rows, 1.8 u pitch, 1.5 u bars), height `0.8 + 7.2 · ln(1 + stars) / ln(1 + max)` (`skyline.ts`), rim color by language, the most starred ten in the back row with the top three spread apart and labeled (name and stars), a language legend on the plinth (full tier). South edge: **one workbench per side project** (2.2 × 1.2 u) in two groups of touching benches 6 u apart, starting 4 u past the gateway, each with a hologram card (title and year) and a Neon line laptop icon (full tier). Every bench and bar has a stop 1 u inside the plaza edge (`FloorLayout.stops`). |
| Horizon deck | The road ends 4 u before the window (slab end). A camera zone on the deck turns the view east (yaw -π/2, zoom 1.2) through the window at the Horizon. |
| Elevator door | (-24, 0) at the road start |
| Guided walk | "Walk my journey": every room oldest first, then the Workshop, with a type filter; offered once on the first L2 visit (the visitor can explore freely instead) and started by the "Follow my career" mission. |
| Horizon (east end) | Spectacle round (owner pick 2026-10-13, `floors/career/horizonLayout.ts`, `Horizon.tsx`): an 80 × 4 u light bridge runs east off the slab from the Workshop window, toward a holographic skyline 200 to 400 u beyond it and far below the slab (36 towers, 20 on lite, from 80 u under the floor to a few u above it, fog exempt with their own fade, so they read in the top right of the rail view and on the horizon from the annex), with a sunrise glow behind it. Glow strips in the empty north-east and south-east corners (3 rows each, 2 on lite) run from the forecourt east to the slab edge, beyond the skyline and the benches. Decor only: no obstacles. |
| Origin (west end) | A 12 u light pillar at (-15, -19), west of the first plaza, clear of the call pad, the 2019 teleporter, the road and the rooms; streaks rise slowly (still under reduced motion). |

The road's end opens onto a glass window that looks up at the Labs (L3 silhouette). Career rooms linked to a Labs pod show a "See the case study on L3" action that runs an elevator-and-drive mission.

## Floating signs (every floor)

Spectacle round (owner request 2026-10-13: "i dont like wording on floor"): no word lies flat on a floor. Every floor word is a floating sign (`fx/FloatingSign.tsx`, pure placement in `fx/signLayout.ts`): upright, turned to the camera every frame (yaw only, never mirrored), a dark plate with a neon rim in the sign color, all signs of a floor in two draw calls (one instanced plate mesh, one `BatchedLabels`). L2 year markers, L3 wing names and L4 zone names and timeline years use it; the L1 "HIGHLIGHTS HALL" sign moves onto the Highlights Hall gateway arch. Road chevrons and other non-text glyphs stay on the floor. `tests/unit/floor-text.test.ts` (static scan) and `__hq.probes.flatText()` in `e2e/spectacle.spec.ts` fail if a flat floor text comes back.

## Door triggers (every floor)

A door trigger is the pad in front of a door: 1.6 u deep along the approach (`DOOR_SIZE`) and 2.4 u wide across the door opening (`DOOR_WIDTH`), drawn by `ProximityGlow`. A room opens only on intent: the rover drives into the door (within 45 degrees of its inward direction), stops or slows below 2 u/s on the pad, or stays on it for 250 ms (`stepDoorLatch`). Driving past a pad, or a click or mission path crossing it, does not open the room; a click on a room or a mission still opens it on arrival. Floor lanes stop 0.5 u before every pad, and neighbouring rooms and pods keep at least 3 u of clear floor between them (layout tests).

## 4. Floor L3: Labs (Project Roads, Product Engineering + AI Engineering wings)

The wings were renamed on 2026-10-11 (owner: AI work is software too). Display names come from `common.wing` in `messages/*.json` ("Product Engineering", "AI Engineering" in both locales); ids, keys and URLs (`wing: "software" | "ai"`, `?wing=`) are unchanged.

Rebuilt as walkable Project Roads (walkable floors plan, part 2; owner decisions: roomy roads with open plazas, a guided project tour offered on the first visit). The footprint follows the content: with today's 18 docked pods it is about 148 × 92 u, from x = -24 to 124 and z = -46 to 46 (round 5 consolidation, owner request 2026-10-13: the wing roads used to run on to x = 139 past their last pods). Accent: violet `#a78bfa` for the floor and the roads, cyan `#22d3ee` for the Product Engineering wing and violet for the AI Engineering wing, each pod with its own accent. The global elevator shaft stays at x = -28. Software engineering and AI engineering are mirror images, the same distance from the elevator (equal billing). Code: `src/experience/floors/labs/layout.ts`.

| Element | Spec |
|---|---|
| Elevator door | (-24, 0) on the shaft face, like every floor. The rover parks at (-21, 0) on the lead road. |
| Lead road | 8 u wide, from (-21, 0) to the hub center. |
| Hub plaza | Round, 26 u across, centered at (-4, 0): the lead road ends here and both wing roads start. |
| Directory wall | Where the wing roads fork, at x = 17: two touching double-sided panels (0.6 × 7.5 u each, 9.5 u tall; Product Engineering north of z = 0, AI Engineering south), their west faces toward the arrival camera. Each face: the wing name from `common.wing` in two lines (wing tint), "Directory · N projects", the top 5 projects (docking order, gallery first, at most two lines each) and "Open the full list" (phones: the top 3 in larger type), with neon rims and a title underline in the wing tint. Clicking a panel (point-and-go, or Open at the tour's "More projects here" stop) drives to its stop 3 u in front of the west face and opens the full project list in the palette. A short road stub runs from the hub center to 4 u before the wall, so the arrival spot and both stops lie on the road and that drive goes straight. 3 draw calls for the whole wall. |
| Wing signs | The wing name floats 4.2 u above each wing road just past the hub rim on the shared floating sign (`fx/FloatingSign.tsx`): turned to the camera every frame (yaw only) on a dark plate with a rim in the wing tint, so it reads left to right from any camera angle. Nothing is painted on the L3 floor: no wing names, no arrows. |
| Wing roads | 8 u wide. The Product Engineering road leaves the hub to (10, -24) and runs east at z = -24; the AI Engineering road mirrors it at z = +24. Each turns 7 u past the far edge of its last pod and runs into the east plaza, ending on the ring road around the reactor core, so the floor is one loop with no dead ends and no empty road ends. No chevrons on L3 (owner decision 2026-10-13; other floors keep theirs). |
| East plaza | Round, 22 u across, at z = 0 on the later of the two wing road turns (x = 107 today). The slab ends 17 u past its center (x = 124). |
| Reactor core | Spectacle round (owner pick 2026-10-13), a project filter since the Tech Reactor (design 2026-10-14, `floors/labs/reactor.ts`, `techReactor.ts`, `ReactorCore.tsx`, `ReactorHighlights.tsx`): a glowing column (11 u tall, bands rising) at the east plaza center with six tilted tech rings (DevOps at y 2.6 up to AI and LLM at y 10.6, every 1.6 u; the CV skill groups) and a floor ring (full tier), 2 draw calls, plus the ring labels (alternating north and south of the column) and the "N projects use X" sign at y 12.6 on one floating sign group (2 calls). Its 3.2 u square footprint is an obstacle and a tall camera column (`FloorLayout.tall`). A closed 8 u ring road (radius 6.5, 16 sides) runs around it; the wing roads end on it due north and south, and the plaza center never joins the road graph (`Plaza.core`), so point-and-go, missions and walks drive around the core. The reactor stop (`FloorLayout.stops["L3:reactor"]`) is the ring road's east point; its camera zone looks west over the core to both wings. A pick adds the pod highlights (a glow curtain and a beacon per lit pod, one instanced draw) and the road glow (one instanced draw). Reduced motion stops the spin and the bands. |
| Data waterfalls | Two panels at each slab corner (one on lite), 9 u along the rim and falling 12 u below it, drops running down columns in the wing tints, one instanced draw (frozen under reduced motion). They fall clear of the L2 slab below. |
| Docked pods (per wing) | Hero (12 × 9 u) and featured (8 × 7 u) pods in site order (owner decision 2026-10-12, `comparePods`: pods with a gallery first, then hero before featured, then `order`), one 12 u slot each so both wings stay mirror images whatever the tier in each slot, alternating the outer side (away from the other wing) and the inner side (between the wing roads), starting at x = 14 (outer) and x = 24 (inner, half a pitch later, 6 u clear of the directory wall), 7 u between slots along the road. Every pod has a 3 u forecourt between the road edge and its front and a 4 u spur to its door. At most 12 per wing; the rest fall back to the directory. |
| Pod door | Front-center of each pod, facing its wing road: the trigger pad (1.6 u deep, 2.4 u wide) is centered 1.1 u in front of the front wall. |
| Listed items | Not pods. They appear on the wing directory board and in ⌘K, and open in the drawer directly (missions stop in front of the board). |
| Packet lanes | A data spine at z = 0 between the inner rows (from just east of the directory wall into the reactor core's west face) with a branch into the back of every inner pod. Packets at 2 u/s. |
| Hologram stage | Inside each hero pod: a 6 u diameter disc at the pod center used by the Hologram view. The diagram board stands on it, facing the pod's road. |
| Pod holograms | One procedural hologram per pod by `hologram` kind (waveform, shield, documents, graph, chart, template, pipeline), floating and slowly rotating above the pod. Pod titles are billboards. |
| Arrival | Deep links to `/labs` spawn, and elevator rides roll on, to the overview spot (8.5, 0) on the hub's east rim, facing the directory wall. Its view zone puts the camera west of the rover, zoomed out to 1.3, looking east: both wall panels whole in the middle of the frame at 1440×900, 2560×1440 and 390×844, the wing roads beside them, the shaft behind the camera. |
| Camera | View zones turn the follow camera at each door so the pod is in front of the rover, and look east at a directory panel from its stop (zoom 0.9, the whole panel under the HUD). |
| Tour my projects | Guided walk: Product Engineering pods then AI Engineering pods in docking order (gallery pods first), then both directory boards; filter by wing. Offered on the first L3 visit; the `projects` mission starts it. |

The space rules (roads at least 8 u wide, plazas at least 16 u, 6 u of clear floor around obstacles, a spur to every door) are asserted with the real pods in `tests/unit/labs-layout.test.ts`.

## 5. Floor L4: Library (Writing)

Walkable floor on the road kit (walkable floors plan, part 3). Accent: white `#e5e7eb`. Owner pick: Newsroom (concepts prototype at `/{locale}/dev/library`).

| Element | Spec |
|---|---|
| Layout | A press plaza with a headline wall (the newest title in large type over a ticker of every title) and the featured post on a lit stage under a turning open book (the Reading Room's book hologram), then one timeline lane east with the other posts newest first, year marks floating over the lane, and the Research, Models and datasets and Talks and workshops desks |
| Stations | One per post (newest first, at most 12; older posts on the archive board), plus Research (`L4:research`), Models and datasets (`L4:publications`) and Talks and workshops (`L4:talks`). Each docks 6 u from its neighbours with a 3 u forecourt, a door pad facing the road and a spur |
| Papers | Plates in front of the Research station open the paper preview modal |
| Zone signs | Each zone's name floats 3.4 u up where its road starts, with the timeline year marks, on one shared floating sign group (`floors/library/decor/signs.ts`); nothing is written on the L4 floor |
| Guided walk | "Read my writing": the stations in order, zone filters, offered on the first visit |
| Elevator door | (-24, 0); the call pad spot x -24 to -15, z -4.5 to 4.5 stays free |

## 6. Floor RF: Roof (Comms)

Footprint: the deck runs x -20 to 22, z -20 to 20 (`ROOF_DECK` in `src/experience/floors/roof/layout.ts`, the source of truth), open sky. Accent: blue `#60a5fa`. A road leads east from the elevator into a round 20 u plaza at (2, 0).

| Element | Position | Function |
|---|---|---|
| Lattice mast with the availability sign | Plaza center (2, 0) | The availability as a large neon sign facing the spawn camera; a courier drone patrols the mast |
| Comms station (`RF:contact`) | x -4 to 8, z -20 to -14 | Email (copy and mailto) and every contact channel, one antenna per channel |
| CV kiosk (`RF:cv`) | x 16 to 22, z -3 to 3 | Opens the CV viewer, or the PDF |
| About board | x -8 to 0, z 16 to 20 | Name, headline, role, location and timezone |
| Visitor Observatory (`RF:visits`) | x 14 to 22, z -20 to -14 (north-east corner, flush with the slab edges); door pad at (18, -12.9) facing north, spur from the plaza at (11, -4) | Public visit stats (owner plan "Public visit stats, Layer 1"): a hologram globe (land dots, one glowing dot per country with visits, never a number per country) and a floating panel (visits in the last 30 complete days and since launch, countries, questions asked, the most explored floor, 3D vs Classic, the source and "Updated daily"). The drawer adds the Topic and Period radio groups and "Don't count my visits". The globe column (7.4 u) is a camera collision column (`FloorLayout.tall`); it turns slowly, faster while the room is open, and holds Indonesia toward the plaza under reduced motion. Hidden or stale stats leave the land only and "Stats offline". |
| Elevator door | (-20, 0) | The call pad keeps x -20 to -12, z -4 to 4 free |

## 7. Exterior and intro

- The tower is seen from outside during boot: five glowing slabs stacked inside a faint wireframe frame, with the elevator tube on the west side.
- The camera orbits 120° over 2.5 s while descending, then flies through the L1 slab edge into the Lobby.
- Reduced motion: hold one still exterior shot for the same 2.5 s, then cut into the Lobby (the intro is never skipped).
