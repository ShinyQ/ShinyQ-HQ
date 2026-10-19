import { describe, expect, it } from "vitest";
import { cameraBlocked, type CameraWorld } from "@/experience/camera/collision";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import {
  ABOUT,
  arcFace,
  BEACON,
  contactBeacon,
  experienceArch,
  faceOf,
  FOUNTAIN,
  gateCrossed,
  gateOpening,
  hallLights,
  hallTall,
  monoliths,
  MONOLITH,
  onFace,
  statTiles,
} from "@/experience/floors/lobby/hallGallery";
import { gatePillars, HALL, HALL_LAYOUT, stationOf } from "@/experience/floors/lobby/hallLayout";
import { officeTall } from "@/experience/floors/lobby/officeLayout";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { buildRoadGraph } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import type { Rect, Vec2 } from "@/experience/types";

const l1 = buildFloorLayouts(8).L1;
const gap = (a: Rect, b: Rect) => Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ));
const inside = (p: Vec2, r: Rect, eps = 1e-6) => p.x >= r.minX - eps && p.x <= r.maxX + eps && p.z >= r.minZ - eps && p.z <= r.maxZ + eps;
/** The four corners of a turned box in plan view. */
function corners(b: { x: number; z: number; w: number; d: number; yaw?: number }): Vec2[] {
  const c = Math.cos(b.yaw ?? 0);
  const s = Math.sin(b.yaw ?? 0);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sz]) => {
    const lx = (sx * b.w) / 2;
    const lz = (sz * b.d) / 2;
    return { x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c };
  });
}
/** A face reads toward the plaza when its `out` points at the station's pad side. */
const readsToward = (out: Vec2, from: Vec2, to: Vec2) => out.x * (to.x - from.x) + out.z * (to.z - from.z) > 0;

describe("Highlights Hall gallery: gateway arch", () => {
  it("spans the 8 u lead road with pillars that keep the space rules (south touches the slab, 6 u from the cert wall)", () => {
    const [north, south] = gatePillars();
    const o = gateOpening();
    const road = HALL_LAYOUT.network.roads[0];
    const roadZ = road.points[0].z;
    expect(o.minZ).toBeLessThanOrEqual(roadZ - road.width / 2);
    expect(o.maxZ).toBeGreaterThanOrEqual(roadZ + road.width / 2);
    expect(south.maxZ).toBe(LOBBY.bounds.maxZ);
    const cert = l1.obstacles[2];
    expect(gap(north, cert)).toBeGreaterThanOrEqual(6);
    expect(gap(south, stationOf("contact").rect)).toBeGreaterThanOrEqual(6);
    for (const p of gatePillars()) expect(l1.obstacles).toContainEqual(p);
    // The rover drives under the lintel: the opening is far taller than the rover.
    expect(o.top).toBeGreaterThan(5);
  });

  it("is passable: the opening is walkable and every station route from the spawn runs through it", () => {
    const grid = buildNavGrid(l1, ROVER.radius);
    const o = gateOpening();
    // Rover radius plus one grid cell from each pillar; the 8 u road (z 11 to 19) fits inside.
    for (let z = o.minZ + ROVER.radius + 1; z <= o.maxZ - ROVER.radius - 1; z += 0.5) expect(isWalkable(grid, { x: o.x, z }), `z ${z}`).toBe(true);
    const graph = buildRoadGraph(l1.road!);
    for (const s of HALL_LAYOUT.stations) {
      const route = [l1.spawn, ...roadRoute(l1.road!, grid, l1.spawn, s.pad, graph)!];
      const crossed = route.some((p, i) => i > 0 && gateCrossed(route[i - 1], p));
      expect(crossed, s.room).toBe(true);
    }
  });

  it("fires the curtain only for an eastward pass inside the opening", () => {
    expect(gateCrossed({ x: 30, z: 15 }, { x: 34, z: 15 })).toBe(true);
    expect(gateCrossed({ x: 34, z: 15 }, { x: 30, z: 15 })).toBe(false);
    expect(gateCrossed({ x: 30, z: 5 }, { x: 34, z: 5 })).toBe(false);
    expect(gateCrossed({ x: 31, z: 15 }, { x: 32.9, z: 15 })).toBe(false);
    expect(gateCrossed({ x: 32.9, z: 15 }, { x: 33, z: 15 })).toBe(true);
  });
});

describe("Highlights Hall gallery: stations", () => {
  it("About me: the pedestal fills its footprint and the four tiles curve toward the plaza, readable from the pad", () => {
    const s = stationOf("about");
    expect(ABOUT.center.z - ABOUT.base.r).toBeCloseTo(s.rect.minZ);
    expect(ABOUT.center.z + ABOUT.base.r).toBeCloseTo(s.rect.maxZ);
    const tiles = statTiles();
    expect(tiles).toHaveLength(4);
    for (const t of tiles) expect(readsToward(t.face.out, t.face.origin, s.pad)).toBe(true);
    // The outer tiles come forward and turn inward (symmetric arc).
    expect(tiles[0].face.origin.z).toBeCloseTo(tiles[3].face.origin.z);
    expect(tiles[0].face.origin.z).toBeGreaterThan(tiles[1].face.origin.z);
    expect(tiles[0].face.yaw).toBeCloseTo(-tiles[3].face.yaw);
    // No tile touches the portrait disc.
    for (const t of tiles) expect(Math.abs(t.face.origin.x - ABOUT.center.x) - t.w / 2).toBeGreaterThan(ABOUT.disc.r + 0.2);
  });

  it("Top projects: three monoliths in a shallow arc inside the footprint, faces toward the pad, clear of it", () => {
    const s = stationOf("projects");
    const list = monoliths(3);
    expect(list).toHaveLength(3);
    for (const m of list) {
      for (const c of corners(m.box)) expect(inside(c, s.rect), JSON.stringify(c)).toBe(true);
      expect(readsToward(m.face.out, m.face.origin, s.pad)).toBe(true);
      expect(Math.hypot(m.face.origin.x - s.pad.x, m.face.origin.z - s.pad.z)).toBeGreaterThan(0.9);
      expect(m.box.h).toBe(MONOLITH.h);
    }
    expect(list[1].box.yaw).toBeCloseTo(0);
    expect(list[0].box.yaw!).toBeCloseTo(-list[2].box.yaw!);
    expect(monoliths(2)).toHaveLength(2);
  });

  it("Work experience: two pillars with the text columns and an opening centered on the door pad", () => {
    const s = stationOf("experience");
    const arch = experienceArch();
    const [px, , pz] = onFace(arch.face, 0, 0);
    expect(Math.abs((pz - s.pad.z) * arch.face.right.z + (px - s.pad.x) * arch.face.right.x)).toBeCloseTo(0);
    for (const p of [...arch.pillars, arch.lintel]) for (const c of corners(p)) expect(inside(c, s.rect), JSON.stringify(c)).toBe(true);
    expect(arch.columns.map((c) => c.w)).toEqual([7.2, 7.2]);
    expect(arch.opening.w).toBeGreaterThan(3);
  });

  it("Contact: the beacon mast and the floating card stay inside the footprint, clear of each other", () => {
    const s = stationOf("contact");
    const b = contactBeacon();
    expect(inside(b.mast, s.rect)).toBe(true);
    for (const c of corners(b.card.box)) expect(inside(c, s.rect)).toBe(true);
    expect(b.card.box.y).toBeGreaterThan(1);
    const cardLeft = Math.min(...corners(b.card.box).map((c) => Math.abs(c.x - b.mast.x)));
    expect(cardLeft).toBeGreaterThan(BEACON.base.w / 2 + 0.5);
    expect(readsToward(b.card.face.out, b.card.face.origin, s.pad)).toBe(true);
    expect(b.pulses.filter((p) => p.y > 5)).toHaveLength(3);
  });
});

describe("Highlights Hall gallery: lights and camera", () => {
  it("lights every station and the fountain; lite gets fewer fountain beams; no light is real", () => {
    const full = hallLights("full");
    const lite = hallLights("lite");
    expect(full.filter((l) => l.spin)).toHaveLength(FOUNTAIN.beams.full);
    expect(lite.filter((l) => l.spin)).toHaveLength(FOUNTAIN.beams.lite);
    expect(full.filter((l) => l.kind === "cone")).toHaveLength(4);
    for (const l of full) {
      expect(l.alpha).toBeGreaterThan(0);
      expect(l.alpha).toBeLessThanOrEqual(0.6);
      expect(inside(l, HALL.zone)).toBe(true);
    }
    // The fountain is light only: nothing blocks the plaza center.
    const grid = buildNavGrid(l1, ROVER.radius);
    expect(isWalkable(grid, { x: FOUNTAIN.x, z: FOUNTAIN.z })).toBe(true);
  });

  it("puts every tall shape into the camera collision, so a low camera never sits inside one", () => {
    const tall = hallTall();
    expect(tall.length).toBe(2 + 3 + 2 + 2);
    for (const t of tall) expect(t.h).toBeGreaterThan(3.2);
    // The L1 layout carries them (`FloorLayout.tall`), so CameraDirector clamps against them.
    expect(l1.tall).toEqual([...tall, LOBBY.observatory, officeTall()]);
    const world: CameraWorld = { obstacles: l1.obstacles, bounds: l1.bounds, floorY: 0, tall };
    const m = monoliths(3)[1];
    expect(cameraBlocked([m.box.x, 6, m.box.z], world)).toBe(true);
    expect(cameraBlocked([contactBeacon().mast.x, 8.5, contactBeacon().mast.z], world)).toBe(true);
    // Under the gate lintel, in the opening, the camera is free.
    expect(cameraBlocked([HALL.gate.x, 4, 15], world)).toBe(false);
  });

  it("builds faces that read left to right toward `out`", () => {
    const f = faceOf({ x: 0, z: 0 }, { x: 0, z: 1 });
    expect(f.right).toEqual({ x: 1, z: 0 });
    expect(f.yaw).toBe(0);
    expect(onFace(f, 2, 1, 0.5)).toEqual([2, 1, 0.5]);
    const a = arcFace(f, 0, 8);
    expect(a.origin).toEqual({ x: 0, z: 0 });
  });
});
