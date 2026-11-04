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
  gateCrossed,
  gateOpening,
  hallLights,
  hallTall,
  monoliths,
  MONOLITH,
  NOW_ARCH,
  nowArch,
  onFace,
  statTiles,
  winsFace,
} from "@/experience/floors/lobby/hallGallery";
import { gatePillars, HALL, HALL_LAYOUT, hallPartitions, stationOf } from "@/experience/floors/lobby/hallLayout";
import { officeTall, officeTowerTall } from "@/experience/floors/lobby/officeLayout";
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
    // Rover radius plus one grid cell from each pillar; the 8 u road (z 17 to 25) fits inside.
    for (let z = o.minZ + ROVER.radius + 1; z <= o.maxZ - ROVER.radius - 1; z += 0.5) expect(isWalkable(grid, { x: o.x, z }), `z ${z}`).toBe(true);
    const graph = buildRoadGraph(l1.road!);
    for (const s of HALL_LAYOUT.stations) {
      const route = [l1.spawn, ...roadRoute(l1.road!, grid, l1.spawn, s.pad, graph)!];
      const crossed = route.some((p, i) => i > 0 && gateCrossed(route[i - 1], p));
      expect(crossed, s.room).toBe(true);
    }
  });

  it("fires the curtain only for an eastward pass inside the opening", () => {
    // The gate stands at x 36 over the lead road (z 21) (owner decision 2026-11-02, from 38: room for the Proof Park arch road).
    expect(HALL.gate.x).toBe(36);
    expect(gateCrossed({ x: 33, z: 21 }, { x: 37, z: 21 })).toBe(true);
    expect(gateCrossed({ x: 37, z: 21 }, { x: 33, z: 21 })).toBe(false);
    expect(gateCrossed({ x: 33, z: 11 }, { x: 37, z: 11 })).toBe(false);
    expect(gateCrossed({ x: 34, z: 21 }, { x: 35.9, z: 21 })).toBe(false);
    expect(gateCrossed({ x: 35.9, z: 21 }, { x: 36, z: 21 })).toBe(true);
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
    // Two columns either side of the portrait (2026-11-04), turned symmetrically toward it, two rows.
    expect(tiles[0].face.origin.z).toBeCloseTo(tiles[1].face.origin.z);
    expect(tiles[0].face.yaw).toBeCloseTo(-tiles[1].face.yaw);
    expect(tiles[0].face.origin).toEqual(tiles[2].face.origin);
    expect(tiles[0].y).toBeGreaterThan(tiles[2].y + tiles[2].h);
    // No tile touches the portrait disc; every tile stays inside the footprint and 1.5 u or more from the west wall.
    const wall = hallPartitions()[0].maxX;
    for (const t of tiles) {
      expect(Math.abs(t.face.origin.x - ABOUT.center.x) - t.w / 2).toBeGreaterThan(ABOUT.disc.r + 0.2);
      expect(Math.abs(t.face.origin.x - ABOUT.center.x) + t.w / 2).toBeLessThan((s.rect.maxX - s.rect.minX) / 2);
      expect(Math.min(t.face.origin.x, ABOUT.center.x - Math.abs(t.face.origin.x - ABOUT.center.x)) - t.w / 2 - wall).toBeGreaterThanOrEqual(1.5);
    }
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
  it("lights every station and the gate; no fountains (owner decision 2026-11-04); no light is real", () => {
    const full = hallLights();
    // No light turns (the fountains are gone); a spotlight per station.
    expect(full.filter((l) => l.spin)).toHaveLength(0);
    expect(full.filter((l) => l.kind === "beam" && l.r0 === 0.14)).toHaveLength(0);
    expect(full.filter((l) => l.kind === "cone")).toHaveLength(7);
    for (const l of full) {
      expect(l.alpha).toBeGreaterThan(0);
      expect(l.alpha).toBeLessThanOrEqual(0.6);
      expect(inside(l, HALL.zone)).toBe(true);
    }
  });

  it("puts every tall shape into the camera collision, so a low camera never sits inside one", () => {
    const tall = hallTall();
    // Gate pillars, project monoliths, experience arch pillars, now arch pillars, result monoliths, beacon mast and card.
    expect(tall.length).toBe(2 + 3 + 2 + 2 + 3 + 2);
    for (const t of tall) expect(t.h).toBeGreaterThan(3.2);
    // The L1 layout carries them (`FloorLayout.tall`), so CameraDirector clamps against them.
    expect(l1.tall).toEqual([...tall, LOBBY.observatory, officeTall(LOBBY.officeWing), officeTowerTall(LOBBY.officeWing)]);
    const world: CameraWorld = { obstacles: l1.obstacles, bounds: l1.bounds, floorY: 0, tall };
    const m = monoliths(3)[1];
    expect(cameraBlocked([m.box.x, 6, m.box.z], world)).toBe(true);
    expect(cameraBlocked([contactBeacon().mast.x, 8.5, contactBeacon().mast.z], world)).toBe(true);
    const r = monoliths(3, "results")[1];
    expect(cameraBlocked([r.box.x, 6, r.box.z], world)).toBe(true);
    const now = nowArch().pillars[0];
    expect(cameraBlocked([now.x, NOW_ARCH.h, now.z], world)).toBe(true);
    // Under the gate lintel, in the opening, the camera is free.
    expect(cameraBlocked([HALL.gate.x, 4, HALL.lead[0].z], world)).toBe(false);
  });

  it("stands the new stations' shapes inside their footprints, facing the plaza: wins pedestal, now arch, result monoliths", () => {
    const inRect = (x: number, z: number, r: Rect) => x >= r.minX - 1e-6 && x <= r.maxX + 1e-6 && z >= r.minZ - 1e-6 && z <= r.maxZ + 1e-6;
    const wins = stationOf("wins");
    const w = winsFace();
    expect(inRect(w.origin.x, w.origin.z, wins.rect)).toBe(true);
    expect(w.out).toEqual({ x: -wins.facing.x, z: -wins.facing.z });
    // The pedestal's base keeps clear of the pad.
    expect(Math.hypot(w.origin.x - wins.pad.x, w.origin.z - wins.pad.z)).toBeGreaterThan(ABOUT.base.r + 0.9);
    const now = stationOf("now");
    for (const p of nowArch().pillars) expect(inRect(p.x, p.z, now.rect)).toBe(true);
    const results = stationOf("results");
    for (const m of monoliths(3, "results")) {
      expect(inRect(m.box.x, m.box.z, results.rect)).toBe(true);
      expect(m.face.out.z).toBeLessThan(0);
    }
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
