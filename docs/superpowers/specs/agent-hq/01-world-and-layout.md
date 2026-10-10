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

Footprint: 52 × 42 u, x from -24 to 28 and z from -24 to 18. The west edge stays at the elevator door (the shaft is fixed at x = -28), so the plaza sits east of the origin. Accent: green `#34d399`.

| Element | Position (x, z) | Size (w × d) | Content |
|---|---|---|---|
| Spawn point | (14, 6) | | Rover start on the default camera diagonal from the plaza, turned toward the camera |
| Profile hologram | (6, -4) | Pedestal radius 3 | Rotating wireframe monogram "KAW" (hexagon radius 2.3, center height 3.4) |
| Name and headline | Above the hologram, height 7.6 | Text block up to 14 wide | Billboarded, always above the stats tiles |
| Stats ring | Around the hologram, radius 10 | 4 to 6 tiles, 3.4 × 1.9, center height 4.25 (staggered +0.5) | Headline stats (see appendix 07). Tiles billboard toward the camera and float above the rover (bottom above 2.8 u), so they read from any orbit angle and never block the walkway. |
| Lane ring (walkable) | Around the hologram, radius 12 | Rover footprint 10.5 to 13.5 | Clear of every element at rover height |
| Skills wall | (6, -22.5) | 40 × 1, at least 8.5 u tall on a 0.35 u glowing plinth; `skillsWallLayout` measures headings (they may wrap; every column reserves the same heading lines) and grows the wall so the longest column ends 1.8 u above its base | Skill groups: Software Engineering, AI Engineering, Cloud and DevOps, Data (10 u per column, items at 0.4 u) |
| Certifications wall | (25.5, -4) | 1 × 16, height 5 | Certification badges with "verify" links, louvered 45° toward the plaza |
| Mission kiosk | (2, 15) | 3 × 2 | Diegetic mirror of the Rover Terminal missions |
| Elevator door | (-24, 0) | | |

Lanes: one ring lane around the hologram (radius 12) and spurs leaving the ring outward to the kiosk, both walls and the elevator.

Spacing rules (enforced by `tests/unit/lobby-layout.test.ts`): no two elements' bounding boxes overlap at any stats ring rotation (billboards counted at full width in x and z), nothing reaches into the walkable ring below rover height, and every wall and the kiosk keeps at least 4 u of walkway outside the ring. View zones in front of the skills and certifications walls turn the camera to face them (appendix 03).

## 3. Floor L2: Career Archive (timeline corridor)

Footprint: a corridor along +x. Accent: amber `#fbbf24`.

| Element | Spec |
|---|---|
| Corridor | From x = -20 to x = `-20 + 14 * yearCount + 20`, width 8 u (z from -4 to 4), glowing floor strip with year markers every 14 u |
| Year segments | One segment per year that has entries, in ascending order (2019 first). Segment length 14 u. |
| Year rooms | Each entry in a year becomes a room 9 × 8 u. Rooms alternate sides (north for even index, south for odd) within the segment; the first row's doors sit at \|z\| = 6. If a year has more than 2 entries, extra rooms stack outward behind a 5 u aisle (the 1.6 u door pad plus 3.4 u of clear floor), reached through the 5 u alleys between year columns, so no path crosses another room (`buildCorridor`). |
| Room labels | North rooms: a low sign at the door; south rooms: flat inside the back wall, nearer the rail camera than the pedestal. Outer rows show their label only once the rover is in their aisle (`labelVisible`), so stacked labels never overlap. |
| Room types | `job`, `freelance`, `education`, `award` (smaller 6 × 6 trophy plinth), `milestone` (tall pillar). Each type has its own hologram. |
| Year gate | An arch at the start of each segment showing the year in large mono digits |
| Workshop annex | At the corridor end: a 20 × 16 u hall with side-project benches and a public-repo wall |
| Elevator door | (-24, 0) at the corridor start |

The corridor's end opens onto a glass window that looks up at the Labs (L3 silhouette). Career rooms linked to a Labs pod show a "See the case study on L3" action that runs an elevator-and-drive mission.

## Door triggers (every floor)

A door trigger is the 1.6 × 1.6 u pad in front of a door (`DOOR_SIZE`, drawn by `ProximityGlow`). A room opens only on intent: the rover stops or slows below 2 u/s on the pad, or stays on it for 250 ms (`stepDoorLatch`). Driving past a pad, or a click or mission path crossing it, does not open the room; a click on a room or a mission still opens it on arrival. Floor lanes stop 0.5 u before every pad, and neighbouring rooms and pods keep at least 3 u of clear floor between them (layout tests).

## 4. Floor L3: Labs (Software Wing + AI Wing)

Footprint: 81 × 56 u, from x = -24 to 57 and z = -28 to 28. Accent: violet `#a78bfa` for the floor, with each pod using its own accent. The global elevator shaft stays at x = -28 (as on every floor), so the elevator lands in an **atrium** right in front of its door. Both wings start at the atrium and run east as mirror-image halls on either side of a spine lane, so software engineering and AI engineering are the same distance from the elevator and get equal billing. (Phase 4 resolved the earlier conflict between an atrium door at (0, -7) and the shaft at x = -28 this way; the code lives in `src/experience/floors/labs/layout.ts`.)

| Element | Spec |
|---|---|
| Elevator door | (-24, 0) on the shaft face, like L1, L2 and L4. The rover parks at (-21, 0), inside the atrium. |
| Atrium | x from -24 to -10, z from -7 to 7. Wing signs painted on the floor ("SOFTWARE WING →" in cyan north of the spine, "AI WING →" in violet south of it). Two wing directory boards (0.6 × 4.4 u, 6.4 u tall, facing east) at (-12, -5.4) for the Software Wing and (-12, 5.4) for the AI Wing list every pod of their wing, listed items included. |
| Spine lane | z = 0 from the atrium to the east end. Data packets animate along every lane at 2 u/s. |
| Software Wing | The hall north of the spine (z < 0). Floor tint cyan `#22d3ee`. Pods with `wing: "software"`. |
| AI Wing | The hall south of the spine (z > 0), the mirror image of the Software Wing. Floor tint violet `#a78bfa`. Pods with `wing: "ai"`. |
| Hero row (per wing) | Up to 3 hero pods of 12 × 9 u next to the spine, centers at \|z\| = 8.5 and x = 6, 22 and 38 (4 u apart, nearest the atrium first) |
| Featured row (per wing) | Up to 6 featured pods of 8 × 7 u, centers at \|z\| = 22.5 and x = -5 + 11 i (3 u apart), west to east |
| Back lane (per wing) | \|z\| = 15, between the hero row and the featured row, joined to the spine at x = -7 and x = 47 |
| Listed items | Not pods. They appear on the wing directory board and in ⌘K, and open in the drawer directly (missions stop in front of the board). |
| Pod door | Front-center of each pod: hero doors face the spine (door trigger centered at \|z\| = 2.9), featured doors face the back lane (\|z\| = 17.9). Each trigger is the 1.6 × 1.6 u glowing pad in front of the door; no lane runs over a pad. |
| Hologram stage | Inside each hero pod: a 6 u diameter disc at the pod center used by the Hologram view. The diagram board stands on it, facing the spine. |
| Pod holograms | One procedural hologram per pod by `hologram` kind (waveform, shield, documents, graph, chart, template, pipeline), floating and slowly rotating above the pod |

Pod order within a wing: by `tier` (hero first) and then by `order` in the data. Pods beyond the row capacity (more than 3 heroes or 6 featured) fall back to the wing directory.

## 5. Floor L4: Library

Footprint: 48 × 32 u. Accent: white `#e5e7eb`.

| Element | Spec |
|---|---|
| Blog shelves | 2 rows of shelves at z = -10 and z = -2. Each post is a glowing book spine with a hover title, and a reading lectern opens the post. |
| Publications shelf | At z = +8. Papers, theses and Hugging Face models as framed plates. |
| Talks stage | At (16, 10): a small stage with a screen for talks and workshops |
| Language badges | Every book shows `EN`, `ID` or `EN/ID` |
| Elevator door | (-24, 0) |

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
- Reduced motion: skip the orbit and fade straight into the Lobby.
