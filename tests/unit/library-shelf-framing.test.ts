import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { ARRIVAL_HEADING } from "@/experience/camera/arrival";
import { zoneAt } from "@/experience/camera/orbit";
import type { Vec3 } from "@/experience/camera/rigs";
import { buildFloorLayouts } from "@/experience/config";
import { trackSignSpecs } from "@/experience/floors/library/decor/signs";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { libraryLayoutInput, stationYaw, type LibraryBay, type LibraryLayoutInput } from "@/experience/floors/library/model";
import { SHELF_PLINTH, SHELF_VIEW } from "@/experience/floors/library/shelf";
import { signPlate } from "@/experience/fx/signLayout";
import { expectFramed, FRAME_SIZES, settleFollow } from "../helpers/follow-frame";

/**
 * L4 reader track bays (Task 6 of the Writing revamp): each bay's door zone turns the follow camera to its shelf and
 * zooms out (`SHELF_VIEW`), so at the bay's stop the rover and all 8 corners of every slot (the lead cover and every
 * spine, plinth included) sit inside the HUD-safe box on a laptop, a landscape tablet, a portrait tablet and a phone.
 * The same check runs on a synthetic 40-post bay (three full rows: the longest and tallest shelf), and the arrival
 * view shows the first bay's track sign whole.
 */

const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const real = libraryLayoutInput(data.library);
const posts40 = Array.from({ length: 40 }, (_, i) => ({ slug: `p${i}`, date: `${2026 - Math.floor(i / 12)}-0${1 + (i % 9)}-01`, tags: ["case-study"], external: false }));
const synthetic: LibraryLayoutInput = { posts: posts40, tracks: [{ slug: "forty", posts: posts40.map((p) => p.slug) }], research: 0, models: 0, talks: 0, guides: [] };

/** Every slot's 8 corners: its footprint at its row's shelf and at its top (plinth plus height). */
function slotCorners(bay: LibraryBay): { label: string; at: Vec3 }[] {
  return bay.slots.flatMap((s) =>
    [s.y, s.y + SHELF_PLINTH + s.h].flatMap((y) =>
      [
        [s.rect.minX, s.rect.minZ],
        [s.rect.maxX, s.rect.minZ],
        [s.rect.minX, s.rect.maxZ],
        [s.rect.maxX, s.rect.maxZ],
      ].map(([x, z], k) => ({ label: `${bay.track} ${s.slug} corner ${k} at ${y.toFixed(2)}`, at: [x, y, z] as Vec3 })),
    ),
  );
}

for (const [name, input] of [
  ["real content", real],
  ["a 40-post bay", synthetic],
] as const) {
  describe(`L4 bay camera (${name})`, () => {
    const L4 = buildFloorLayouts(data.years.length, { library: input }).L4;
    const { bays } = buildLibraryLayout(input);

    it("has bays to frame", () => {
      expect(bays.length).toBeGreaterThan(0);
      if (input === synthetic) expect(bays[0].slots).toHaveLength(40);
    });

    for (const bay of bays) {
      it(`${bay.track}: the door zone looks at the shelf, zoomed out (${SHELF_VIEW.zone} u around the door)`, () => {
        const zone = zoneAt("L4", bay.stop, L4.viewZones)!;
        expect(zone.id).toBe(bay.room);
        expect(zone.yaw).toBe(stationYaw(bay.facing));
        expect(zone.zoom).toBe(SHELF_VIEW.zoom);
        expect(zone.classView?.mobile?.zoom).toBe(SHELF_VIEW.zoomPhone);
        expect(zone.area).toEqual({ minX: bay.door.x - SHELF_VIEW.zone, maxX: bay.door.x + SHELF_VIEW.zone, minZ: bay.door.z - SHELF_VIEW.zone, maxZ: bay.door.z + SHELF_VIEW.zone });
        // No other zone overlaps it.
        const others = L4.viewZones!.filter((z) => z !== zone);
        for (const o of others) {
          const a = zone.area;
          const b = o.area;
          expect(a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ, o.id).toBe(false);
        }
      });

      for (const [w, h] of FRAME_SIZES) {
        it(`${bay.track}: frames every slot whole with the rover on the stop at ${w}x${h}`, () => {
          const zone = zoneAt("L4", bay.stop, L4.viewZones)!;
          const settled = settleFollow(L4, zone, bay.stop, w, h);
          expectFramed(settled, [{ label: "rover", at: settled.rover }, ...slotCorners(bay)], w, h);
        });
      }
    }
  });
}

/**
 * The arrival looks north-east along the shared diagonal (`ARRIVAL_YAW`), so the first bay (north of the lane) is in
 * its frame; the second bay stands south of the lane level with the camera, about 37 degrees right of the view axis,
 * out of frame at any zoom the shaft allows (`shaftClearZoom`).
 */
describe("L4 arrival sees the first bay (real content)", () => {
  const L4 = buildFloorLayouts(data.years.length, { library: real }).L4;
  const layout = buildLibraryLayout(real);
  const labels = new Map(data.library.tracks.map((t) => [t.slug, t.label]));
  const signs = trackSignSpecs(layout, labels).slice(0, 1);
  const arrival = L4.arrival!;
  const zone = zoneAt("L4", { ...arrival, heading: ARRIVAL_HEADING }, L4.viewZones)!;
  const viewport = { top: 0, bottom: 0, side: 0 };

  it("the arrival zone is the L4 arrival and the first bay stands north of the lane", () => {
    expect(zone.id).toBe("L4:arrival");
    expect(layout.bays[0].facing.z).toBeLessThan(0);
  });

  for (const [w, h] of FRAME_SIZES) {
    it(`the first track sign projects whole inside the viewport at ${w}x${h}`, () => {
      const settled = settleFollow(L4, zone, arrival, w, h);
      const [cx, , cz] = settled.position;
      // The plate's four corners, turned square to the camera like `FloatingSigns`.
      const points = signs.flatMap((sign) => {
        const plate = signPlate(sign);
        const len = Math.hypot(cx - sign.x, cz - sign.z);
        const along = { x: -(cz - sign.z) / len, z: (cx - sign.x) / len };
        return [-1, 1].flatMap((k) =>
          [-1, 1].map((m) => ({ label: `${sign.text} corner ${k} ${m}`, at: [sign.x + (k * along.x * plate.w) / 2, sign.y + (m * plate.h) / 2, sign.z + (k * along.z * plate.w) / 2] as Vec3 })),
        );
      });
      expectFramed(settled, points, w, h, viewport);
    });
  }
});
