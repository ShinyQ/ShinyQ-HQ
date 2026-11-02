import type { Plaza, Road, RoadNetwork } from "../../nav/road";
import type { Rect } from "../../types";
import { HALL } from "./hallLayout";
import { OFFICE_WING } from "./officeLayout";
import { LOBBY_SLAB } from "./slab";

/**
 * L1 Proof Park (owner decision 2026-11-02): L1 is one 93 x 86 u rectangle. The old notch east of the Agent Office wing
 * (x 18 to 69, z S to S + 32) becomes the park, entered by an arch from the Highlights Hall plaza (west of the contact
 * station) and by a road east from the office plaza, so the Lobby, the office, the park and the hall form a loop.
 * Pure and import-light: config.ts reads it (obstacles, roads, road zone, camera columns), the hall draws the arch
 * (hallSolids.ts, hallGallery.ts) and the Lobby the roads. Checked by tests/unit/l1-proof-park-layout.test.ts.
 */

/** S, the Lobby's south edge line (the old slab edge), and the floor's south edge (the office wing's). */
const S = LOBBY_SLAB.halfZ;
const SOUTH = S + OFFICE_WING.depth;
const gate = HALL.gate;
const contact = HALL.stations.contact;
/** The office plaza's centre (the office lead road ends 3.5 u short of it, inside its 8 u driving width). */
const OFFICE_PLAZA = { x: OFFICE_WING.x, z: S + OFFICE_WING.plaza.z, w: OFFICE_WING.plaza.w } as const;

/**
 * The arch's opening: from the hall gateway's south pillar (`HALL.gate`, x 35.4 to 36.6) to the contact station's west
 * end (x 45), 8.4 u, so an 8 u road runs through it. Its axis, the park plaza's and the arch road's x.
 */
const OPEN = { minX: gate.x + gate.depth / 2, maxX: contact.minX } as const;
const AXIS = (OPEN.minX + OPEN.maxX) / 2;

export const PARK = {
  /** The old east notch the park fills (`FloorLayout.roadZone`): from the office wing's east edge to the hall's east edge. */
  zone: { minX: OFFICE_WING.maxX, maxX: HALL.maxX, minZ: S, maxZ: SOUTH },
  /**
   * The arch from the hall plaza: two posts like the gateway's (`gate.depth` square, `gate.h` tall, a `gate.lintel` lintel)
   * standing just south of the old edge, the west one touching the gateway's south pillar, the east one the contact
   * station's south face at its west end. The rover drives under the lintel.
   */
  arch: {
    west: { minX: gate.x - gate.depth / 2, maxX: gate.x + gate.depth / 2, minZ: S, maxZ: S + gate.depth },
    east: { minX: contact.minX, maxX: contact.minX + gate.depth, minZ: S, maxZ: S + gate.depth },
    opening: OPEN,
    h: gate.h,
    lintel: gate.lintel,
  },
  /**
   * The park plaza, centred on the arch's axis and on the office plaza's line (the office plaza's depth): 22 u wide, so
   * its east edge stays west of the Podium of Wins' reserved box (from x 52.2, 6 u east of the arch's east post).
   */
  plaza: { x: AXIS, z: OFFICE_PLAZA.z, w: 22, d: OFFICE_WING.plaza.d },
  /** Both park roads are 8 u wide (`ROAD.minWidth`). */
  roadWidth: 8,
  /**
   * The arch road's north end: 5 u south of the hall lead road's line (`HALL.lead`), so it never lies on the hall's
   * road (the hall keeps its own network part and Lobby drives into the hall keep joining it at its west end).
   */
  archFrom: HALL.lead[0].z + 5,
} as const;

/** The arch's posts (obstacles and camera columns). */
export function parkArchPosts(): Rect[] {
  const { west, east } = PARK.arch;
  return [{ ...west }, { ...east }];
}

/** The arch's posts as camera columns (`FloorLayout.tall`), as tall as the gateway's pillars. */
export function parkTall(): (Rect & { h: number })[] {
  return parkArchPosts().map((r) => ({ ...r, h: PARK.arch.h }));
}

/** The park plaza as a network plaza. */
export function parkPlaza(): Plaza {
  const P = PARK.plaza;
  return { id: "park", center: { x: P.x, z: P.z }, w: P.w, d: P.d };
}

/**
 * The park's roads for routing. `park-lead` starts on the office plaza's centre, which lies on the office lead road's
 * driving width (a T junction), so the office and the park are one network part; `park-arch` runs under the arch from
 * `PARK.archFrom`. Both end on the park plaza's centre (a shared vertex).
 */
export function parkRoads(): Road[] {
  const P = PARK.plaza;
  return [
    { id: "park-lead", points: [{ x: OFFICE_PLAZA.x, z: OFFICE_PLAZA.z }, { x: P.x, z: P.z }], width: PARK.roadWidth },
    { id: "park-arch", points: [{ x: P.x, z: PARK.archFrom }, { x: P.x, z: P.z }], width: PARK.roadWidth },
  ];
}

/**
 * The roads as drawn (`RoadMarkings`): only between the plazas they join, from the office plaza's east edge and the hall
 * plaza's south edge to the park plaza's edges, so no road fill doubles a plaza's.
 */
export function parkRoadsDrawn(): RoadNetwork {
  const P = PARK.plaza;
  const hallPlazaSouth = HALL.plaza.z + HALL.plaza.d / 2;
  return {
    roads: [
      { id: "park-lead", points: [{ x: OFFICE_PLAZA.x + OFFICE_PLAZA.w / 2, z: P.z }, { x: P.x - P.w / 2, z: P.z }], width: PARK.roadWidth },
      { id: "park-arch", points: [{ x: P.x, z: hallPlazaSouth }, { x: P.x, z: P.z - P.d / 2 }], width: PARK.roadWidth },
    ],
    plazas: [parkPlaza()],
    spurs: [],
  };
}
