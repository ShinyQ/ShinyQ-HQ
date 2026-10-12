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

Footprint: 52 × 42 u, x from -24 to 28 and z from -21 to 21. The west edge stays at the elevator door (the shaft is fixed at x = -28), so the plaza sits east of the origin, centered on the elevator axis (z = 0): the lane ring, the stats ring, the certification arc and the slab line up with the door (owner request, October 2026). Accent: green `#34d399`.

| Element | Position (x, z) | Size (w × d) | Content |
|---|---|---|---|
| Spawn point | (14, 10) | | Rover start on the default camera diagonal from the plaza, turned toward the camera |
| Profile hologram | (6, 0) | Pedestal radius 3 | Rotating wireframe monogram "KAW" (hexagon radius 2.3, center height 3.4) |
| Name and headline | Above the hologram, height 6.4 (name 0.58 u, headline 0.3 u) | Text block up to 14 wide | Billboarded, always above the stats tiles and the monogram, and below the HUD top bar at 1440 x 900 (`tests/unit/lobby-title.test.ts`) |
| Stats ring | Around the hologram, radius 10 | 4 to 6 tiles, 3.4 × 1.9, center height 4.25 (staggered +0.5) | Headline stats (see appendix 07). Tiles billboard toward the camera and float above the rover (bottom above 2.8 u), so they read from any orbit angle and never block the walkway. |
| Lane ring (walkable) | Around the hologram, radius 12 | Rover footprint 10.5 to 13.5 | Clear of every element at rover height |
| Skills wall | (6, -18.5) | 40 × 1, at least 8.5 u tall on a 0.35 u glowing plinth; `skillsWallLayout` measures headings (they may wrap; every column reserves the same heading lines) and grows the wall so the longest column ends 1.8 u above its base | Skill groups: Software Engineering, AI Engineering, Cloud and DevOps, Data (10 u per column, items at 0.4 u) |
| Certifications wall | Footprint (25, 0) | 2.4 × 18, height 6.2 | Curved holo-wall on an arc of radius 19.6 around the hologram, every badge facing the plaza (`CERT_WALL` in `floors/lobby/layout.ts`). Issuer tabs (All, issuers with 2 or more, Other), up to 12 badges per page in two rows (earned newest first, then in progress, then expired), a pager past 12; the panel sizes to the All tab's first page. A badge opens the shared certification preview card. |
| Ask Rover kiosk | (2, 19) | 3 × 2 | Diegetic mirror of Ask Rover (the Rover Terminal missions) |
| Elevator door | (-24, 0) | | |

Lanes: one ring lane around the hologram (radius 12) and spurs leaving the ring outward to the kiosk, both walls and the elevator.

Spacing rules (enforced by `tests/unit/lobby-layout.test.ts`): no two elements' bounding boxes overlap at any stats ring rotation (billboards counted at full width in x and z), nothing reaches into the walkable ring below rover height, and every wall and the kiosk keeps at least 4 u of walkway outside the ring. View zones in front of the skills and certifications walls turn the camera to face them (appendix 03).

## 3. Floor L2: Career Archive (Career Road)

Footprint: one road along +x, forward in time (walkable floors plan, Part 2; owner picks: meander road, guided walk, Neon line icons). Accent: amber `#fbbf24`. Geometry lives in `src/experience/floors/career/layout.ts` (`buildCareerRoad`) and passes the walkable space rules (`src/experience/nav/space.ts`).

| Element | Spec |
|---|---|
| Road | 8 u wide, from the elevator approach (-21, 0) to the Workshop annex. x increases monotonically (rail camera, swipe scrub); every other year plaza shifts 7 u in z (order 0, +7, 0, -7) and S-curves join them. Chevrons point forward in time. |
| Year plazas | One open plaza per year that has entries, ascending (2019 first, pre-2019 entries fold in as the prologue). 18 u deep; length scales with the entry count (10 u bays, sides staggered by 5 u, at least 16 u). The year is written on the plaza floor. Plazas are 10 u apart. |
| Year rooms | Each entry is a room 9 × 8 u (awards 6 × 8) docked in one row on a long plaza edge behind a 2 u apron, alternating sides (north first), door facing the road, with a spur in the type color. No room sits behind another. Only the 2 × 2 pedestal blocks the rover. |
| Room icons | One Neon line icon per type, one hue each (`CAREER_ICONS`, `CAREER_TONE`): employment briefcase (sky), freelance laptop with code (pink), education cap (violet), award trophy (amber, with the year's placings, "×10", on the plinth), milestone flag (emerald). The same icons mark types on the Page View. |
| Room labels | Upright above each room, facing the rail camera; they fade with distance along the road (20 to 30 u). |
| Year arch | A neon arch over the road before each plaza with the year in large mono digits and a signpost ("2021 · 8 rooms"). The HUD shows "You are here: 2021". |
| Workshop annex | At the road's end: a 22 × 18 u plaza with the public-repo wall (north, the Workshop door) and side-project benches (south) |
| Elevator door | (-24, 0) at the road start |
| Guided walk | "Walk my journey": every room oldest first, then the Workshop, with a type filter; offered once on the first L2 visit (the visitor can explore freely instead) and started by the "Follow my career" mission. |

The road's end opens onto a glass window that looks up at the Labs (L3 silhouette). Career rooms linked to a Labs pod show a "See the case study on L3" action that runs an elevator-and-drive mission.

## Door triggers (every floor)

A door trigger is the pad in front of a door: 1.6 u deep along the approach (`DOOR_SIZE`) and 2.4 u wide across the door opening (`DOOR_WIDTH`), drawn by `ProximityGlow`. A room opens only on intent: the rover drives into the door (within 45 degrees of its inward direction), stops or slows below 2 u/s on the pad, or stays on it for 250 ms (`stepDoorLatch`). Driving past a pad, or a click or mission path crossing it, does not open the room; a click on a room or a mission still opens it on arrival. Floor lanes stop 0.5 u before every pad, and neighbouring rooms and pods keep at least 3 u of clear floor between them (layout tests).

## 4. Floor L3: Labs (Project Roads, Product Engineering + AI Engineering wings)

The wings were renamed on 2026-10-11 (owner: AI work is software too). Display names come from `common.wing` in `messages/*.json` ("Product Engineering", "AI Engineering" in both locales); ids, keys and URLs (`wing: "software" | "ai"`, `?wing=`) are unchanged.

Rebuilt as walkable Project Roads (walkable floors plan, part 2; owner decisions: roomy roads with open plazas, a guided project tour offered on the first visit). The footprint follows the content: with today's 18 docked pods it is about 163 × 92 u, from x = -24 to about 139 and z = -46 to 46. Accent: violet `#a78bfa` for the floor and the roads, cyan `#22d3ee` for the Product Engineering wing and violet for the AI Engineering wing, each pod with its own accent. The global elevator shaft stays at x = -28. Software engineering and AI engineering are mirror images, the same distance from the elevator (equal billing). Code: `src/experience/floors/labs/layout.ts`.

| Element | Spec |
|---|---|
| Elevator door | (-24, 0) on the shaft face, like every floor. The rover parks at (-21, 0) on the lead road. |
| Lead road | 8 u wide, from (-21, 0) to the hub center. |
| Hub plaza | Round, 26 u across, centered at (-4, 0). Two double-sided wing directory boards (0.6 × 7 u, 7 u tall, facing east) on its west rim at (-14, ∓9.5) show the wing name, the project count and the top 5 projects (docking order, gallery first) in large type, readable from the board stop on a phone; clicking a board (or Open at the tour's "More projects here" stop) opens the full project list in the palette. Wing names are painted where each wing road leaves the hub and float above it. |
| Wing roads | 8 u wide. The Product Engineering road leaves the hub to (10, -24) and runs east at z = -24; the AI Engineering road mirrors it at z = +24. Both end at the east plaza, so the floor is one loop with no dead ends. Chevrons point away from the hub. |
| East plaza | Round, 18 u across, where the wing roads meet (14 u past the corner after the last pod). |
| Docked pods (per wing) | Hero (12 × 9 u) and featured (8 × 7 u) pods in site order (owner decision 2026-10-12, `comparePods`: pods with a gallery first, then hero before featured, then `order`), one 12 u slot each so both wings stay mirror images whatever the tier in each slot, alternating the outer side (away from the other wing) and the inner side (between the wing roads), starting at x = 14 (outer) and x = 20 (inner), 7 u between slots along the road. Every pod has a 3 u forecourt between the road edge and its front and a 4 u spur to its door. At most 12 per wing; the rest fall back to the directory. |
| Pod door | Front-center of each pod, facing its wing road: the trigger pad (1.6 u deep, 2.4 u wide) is centered 1.1 u in front of the front wall. |
| Listed items | Not pods. They appear on the wing directory board and in ⌘K, and open in the drawer directly (missions stop in front of the board). |
| Packet lanes | A data spine at z = 0 between the inner rows (hub rim to east plaza) with a branch into the back of every inner pod. Packets at 2 u/s. |
| Hologram stage | Inside each hero pod: a 6 u diameter disc at the pod center used by the Hologram view. The diagram board stands on it, facing the pod's road. |
| Pod holograms | One procedural hologram per pod by `hologram` kind (waveform, shield, documents, graph, chart, template, pipeline), floating and slowly rotating above the pod. Pod titles are billboards. |
| Arrival | Deep links to `/labs` spawn, and elevator rides roll on, to the overview spot (12, 0) where the wing roads fork. Its view zone puts the camera west of the rover, zoomed out to 1.3, looking east: the hub and both wing entrances in frame, the shaft behind the camera. |
| Camera | View zones turn the follow camera at each door so the pod is in front of the rover, and face the directory boards. |
| Tour my projects | Guided walk: Product Engineering pods then AI Engineering pods in docking order (gallery pods first), then both directory boards; filter by wing. Offered on the first L3 visit; the `projects` mission starts it. |

The space rules (roads at least 8 u wide, plazas at least 16 u, 6 u of clear floor around obstacles, a spur to every door) are asserted with the real pods in `tests/unit/labs-layout.test.ts`.

## 5. Floor L4: Library (Writing)

Walkable floor on the road kit (walkable floors plan, part 3). Accent: white `#e5e7eb`. Owner pick: Newsroom (concepts prototype at `/{locale}/dev/library`).

| Element | Spec |
|---|---|
| Layout | A press plaza with a headline wall (the newest title in large type over a ticker of every title) and the featured post on a lit stage under a turning open book (the Reading Room's book hologram), then one timeline lane east with the other posts newest first, year marks on the road, and the Research, Models and datasets and Talks and workshops desks |
| Stations | One per post (newest first, at most 12; older posts on the archive board), plus Research (`L4:research`), Models and datasets (`L4:publications`) and Talks and workshops (`L4:talks`). Each docks 6 u from its neighbours with a 3 u forecourt, a door pad facing the road and a spur |
| Papers | Plates in front of the Research station open the paper preview modal |
| Guided walk | "Read my writing": the stations in order, zone filters, offered on the first visit |
| Elevator door | (-24, 0); the call pad spot x -24 to -15, z -4.5 to 4.5 stays free |

## 6. Floor RF: Roof (Comms)

Footprint: 40 × 40 u, open sky (stars and slow-moving particle clouds). Accent: blue `#60a5fa`.

| Element | Position | Function |
|---|---|---|
| Beacon antenna | (0, -6) | Pulsing light. Shows the availability message on a holographic ribbon. |
| Comms terminals | Arc at radius 10 in front of the beacon | Email (copy and mailto), LinkedIn, GitHub, Hugging Face |
| CV kiosk | (10, 6) | Download the CV PDF, or open `/cv` |
| Elevator door | (-20, 0) | |

## 7. Exterior and intro

- The tower is seen from outside during boot: five glowing slabs stacked inside a faint wireframe frame, with the elevator tube on the west side.
- The camera orbits 120° over 2.5 s while descending, then flies through the L1 slab edge into the Lobby.
- Reduced motion: hold one still exterior shot for the same 2.5 s, then cut into the Lobby (the intro is never skipped).
