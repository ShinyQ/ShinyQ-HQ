# L3 Project Roads and "Tour my projects"

Phase plan for the L3 part of the walkable floors work (part 2 of the coordinator plan). Built on the road kit, space rules and walk engine from PR #36.

## Owner request and decisions

- "also for l2 i think there should be space too walk too also for l3"
- L2 and L3 both get roomy roads with open plazas to roam.
- L3 also gets a guided walk through the projects, offered with a prompt on the first L3 visit; visitors can skip it and roam freely.
- Wing display names come from messages (`common.wing`), never hard-coded, so a rename flows through to the boards and signs.

## Scope

1. Layout (`src/experience/floors/labs/layout.ts`, replacing the atrium and mirror halls): lead road from the elevator approach (-21, 0) into a round 26 u hub plaza; wing directory boards on the hub's west rim; Software road (z = -24) and AI road (z = +24) leaving the hub, running east and meeting at an 18 u east plaza (one loop, no dead ends); hero then featured pods docked on both sides of each wing road, 7 u apart, with 3 u forecourts and spurs; listed pods stay on the boards. `FloorLayout.road` is set so every autopilot drive follows the roads.
2. Rendering: `RoadMarkings`, `Hub` (double-sided directory boards, wing signs), pod forecourts, packet lanes on a spine between the inner rows, billboard pod labels; hologram stages move with the pods.
3. Camera: data-driven `FloorLayout.viewZones` (pods at their doors, directory boards, the arrival on the lead road), so a pod never sits between the rover and the camera.
4. Tour: `WALK_FLOORS = ["L3"]`; `labsWalk` wing by wing in docking order, ending at both directory boards; mission step `{ kind: "walk", walk }` with `MissionHost.walk` (3D starts the walk, the static tier shows `/labs` and the pods palette); the `projects` mission becomes "Tour my projects".
5. Tests: layout and space rules with the real pods, view zones, walk order, hosts; e2e for the default L3 prompt, the Missions tour and `?walk=off`.
6. Docs: AGENTS.md, README, appendix 01 section 4, appendix 02 missions table, design spec floor table.

## Must keep

Deep links to the pod door, hologram view, directory boards, rooms visited counter, elevator door at x = -24 (shaft at x = -28), tiers and reduced motion, Lighthouse budgets (3D is off the LCP path), Page View and crawlers unaffected.

## Verification

`bun run verify:quick`, `bun run e2e:changed`, screenshots at 1440x900, 834x1112 and 390x844 (top-down from the dev prototype, rover views, the first-visit prompt and the tour HUD) on SwiftShader WebGL.
