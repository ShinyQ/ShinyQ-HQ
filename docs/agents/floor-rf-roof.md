# RF Roof

The RF roof deck: its layout, stations, the Signal Garden scenery and its draw budget.

Index: [AGENTS.md](../../AGENTS.md). Shared floor rules: [Floors](floors.md).

## Layout

- `buildRoofLayout(input)` in `floors/roof/layout.ts` (RF revamp plan) returns:
  - the floor: lead road, round 20 u plaza, doors, view zones, `arrival`;
  - the stations: centerpiece, comms north, CV east, about south-west, each flush with a slab edge;
  - `stops` and `channelSlots`.
- `ROOF_DECK.callPad` (x -20 to -12, z -4 to 4) stays free for the elevator call pad.
- `ROOF_DECK.signYaw` turns the availability sign square to the overview camera (`overviewYaw`).
- The layout feeds the navgrid, the door triggers, `roomTarget` and the R3F components, so scene and autopilot never disagree.
- Deep links spawn in front of the content (`spawn` in `buildFloorLayouts`).
- In-world targets are point-and-go registry entries (see [Point-and-go](floors.md#point-and-go)); floors add no click handlers of their own.

## Scenery: Signal Garden

- Signal Garden with the courier drone (owner decision).
- The scenery reads `RoofSceneryProps`: layout, roof, profile, labels, tier, reducedMotion, `active` from `roofActive`.
- It reacts while RF:contact or RF:cv is open: faster rings, the drone flies over that station.
- Clicks go through the point-and-go registry: `RF:station:contact`, `RF:station:cv`.

## Draw calls

- Solids and edges are merged meshes, labels one `BatchedLabels`, rings one instanced `PulseRings` per group.
- The whole RF frame draws about 64 calls on lite at 1440x900.
- `e2e/roof.spec.ts` caps it at 79 scene calls (`FLOOR_SCENE_CAPS`).

## Motion and tiers

- Reduced motion freezes the drone patrol, pulses and bobbing.
- The lite tier drops additive glow, icon halos and part of the floor lights (`roofDetail`).
