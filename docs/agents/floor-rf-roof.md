# RF Roof

The RF roof deck: its layout, stations, the Signal Garden scenery and its draw budget.

Index: [AGENTS.md](../../AGENTS.md). Shared floor rules: [Floors](floors.md).

## Layout

- `buildRoofLayout(input)` in `floors/roof/layout.ts` (RF revamp plan) returns:
  - the floor: lead road, round 20 u plaza, doors, view zones, `arrival`;
  - the stations: centerpiece, comms north, CV east, about south-west, each flush with a slab edge;
  - `stops` and `channelSlots`.
- `ROOF_DECK.callPad` (x -20 to -12, z -4 to 4) stays free for the elevator call pad.
- `ROOF_DECK.signYaw` (-PI/2) turns the availability sign west, square to the availability stop's camera; the arrival camera reads it at the elevator diagonal's 35 degrees (owner decisions 2026-10-17: the sign is in view with the mast on arrival; 2026-10-23: the diagonal).
- The availability stop (`ROOF_DECK.availability`, (-4, 0)) stands on the axis between the arrival point and the mast; its zone `RF:availability` (`availabilityYaw`, looking east) applies to eastbound rovers only (`travel`), so driving back to the elevator never turns the camera.
- The layout feeds the navgrid, the door triggers, `roomTarget` and the R3F components, so scene and autopilot never disagree.
- Deep links spawn on the arrival point and elevator arrivals roll on to it (`ROOF_DECK.spawn`, (-8, 0): the end of the lead road at the plaza rim; `FloorLayout.arrival` is the same point).
- Zone `RF:arrival` (`arrivalOnly`, `travel` east): the camera stands behind the rover and 35 degrees to its right and looks over the plaza at the centerpiece mast and its availability sign (asserted at four sizes in `tests/unit/arrivals.test.ts`); zoom 0.95, phones 0.88 aimed 4.25 u right (`arrivalAimPhone`), the camera east of the glass shaft.
- Zones `RF:contact` and `RF:cv` look at their stations; on portrait phones (`ROOF_DECK.contactPhone`, `cvPhone`) they come in to zoom 0.9 and 0.65, 0.3 lower, and the channel names take `CHANNEL_LABEL.phone` 0.41 (`readable.ts`), so the names read ([phone reading rule](floors.md#arrival)).
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
