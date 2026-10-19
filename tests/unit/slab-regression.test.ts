import { describe, expect, it } from "vitest";
import type { FloorId } from "@/content/schema";
import { cameraBlocked, cameraWorld, clampCamera, viewOnSlab, CAMERA_CLEARANCE, type CameraWorld } from "@/experience/camera/collision";
import type { Vec3 } from "@/experience/camera/rigs";
import { floorY, LOBBY, ROVER } from "@/experience/config";
import { resolveCircle } from "@/experience/nav/collision";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { spaceViolations } from "@/experience/nav/space";
import type { Rect, Vec2 } from "@/experience/types";
import * as legacy from "../helpers/navgrid-legacy";
import { realLayouts } from "../helpers/real-layouts";

/**
 * Multi-rect slabs (`nav/slab.ts`) must leave every floor without wings exactly as it was: the navgrid,
 * the rover's collision, the camera's slab tests and clamp, and the space rules' slab edges, compared
 * with frozen copies of the single-rect code on sampled points.
 */

// Frozen single-rect copies (before wings).
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function oldResolveCircle(p: Vec2, radius: number, obstacles: readonly Rect[], bounds: Rect): Vec2 {
  let { x, z } = p;
  for (let pass = 0; pass < 3; pass++) {
    x = clamp(x, bounds.minX + radius, bounds.maxX - radius);
    z = clamp(z, bounds.minZ + radius, bounds.maxZ - radius);
    let moved = false;
    for (const o of obstacles) {
      const cx = clamp(x, o.minX, o.maxX);
      const cz = clamp(z, o.minZ, o.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius - 1e-9) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      } else {
        const pushes = [
          { d: x - o.minX, apply: () => (x = o.minX - radius) },
          { d: o.maxX - x, apply: () => (x = o.maxX + radius) },
          { d: z - o.minZ, apply: () => (z = o.minZ - radius) },
          { d: o.maxZ - z, apply: () => (z = o.maxZ + radius) },
        ];
        pushes.reduce((a, b) => (b.d < a.d ? b : a)).apply();
      }
      moved = true;
    }
    if (!moved) break;
  }
  return { x: clamp(x, bounds.minX + radius, bounds.maxX - radius), z: clamp(z, bounds.minZ + radius, bounds.maxZ - radius) };
}

const inside = (x: number, z: number, o: Rect, r: number) => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r;
const onSlab = (x: number, z: number, b: Rect) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

function oldBlockHeight(w: CameraWorld): number {
  let h: number = CAMERA_CLEARANCE.obstacle;
  for (const t of w.tall ?? []) h = Math.max(h, t.h);
  return h;
}

function oldCameraBlocked(p: Vec3, w: CameraWorld): boolean {
  const h = p[1] - w.floorY;
  if (h < CAMERA_CLEARANCE.ground) return true;
  const [x, , z] = p;
  const r = CAMERA_CLEARANCE.radius;
  if (w.tall?.some((t) => h < t.h && inside(x, z, t, r))) return true;
  if (h >= CAMERA_CLEARANCE.obstacle) return false;
  const b = w.bounds;
  if (h < CAMERA_CLEARANCE.edge && (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)) return true;
  return w.obstacles.some((o) => inside(x, z, o, r));
}

function oldViewOnSlab(camera: Vec3, target: Vec3, w: CameraWorld, fov: number): boolean {
  if (onSlab(camera[0], camera[2], w.bounds)) return true;
  const dx = target[0] - camera[0];
  const dz = target[2] - camera[2];
  const run = Math.hypot(dx, dz);
  const h = camera[1] - w.floorY;
  const down = Math.atan2(camera[1] - target[1], run) + (fov * Math.PI) / 360;
  if (h <= 0 || down <= 0) return false;
  if (run < 1e-9 || down >= Math.PI / 2) return false;
  const d = h / Math.tan(down);
  return onSlab(camera[0] + (dx / run) * d, camera[2] + (dz / run) * d, w.bounds);
}

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function oldStartParam(target: Vec3, camera: Vec3, from: Vec3): number {
  const dx = camera[0] - target[0];
  const dz = camera[2] - target[2];
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return 0;
  const t = ((from[0] - target[0]) * dx + (from[2] - target[2]) * dz) / len2;
  return Math.max(0, Math.min(1, t));
}

function oldClampCamera(target: Vec3, camera: Vec3, w: CameraWorld, from: Vec3 = target, fov?: number): Vec3 {
  const STEPS = 32;
  const REFINE = 6;
  const offSlab = fov !== undefined && !onSlab(camera[0], camera[2], w.bounds);
  if (camera[1] - w.floorY >= oldBlockHeight(w) && !offSlab) return camera;
  const blocked = (p: Vec3) => oldCameraBlocked(p, w) || (fov !== undefined && !oldViewOnSlab(p, target, w, fov));
  let t0 = oldStartParam(target, camera, from);
  if (blocked(lerp3(target, camera, t0))) {
    let next = -1;
    for (let i = 1; i <= STEPS && next < 0; i++) {
      const t = t0 + ((1 - t0) * i) / STEPS;
      if (!blocked(lerp3(target, camera, t))) next = t;
    }
    if (next < 0) return camera;
    t0 = next;
  }
  let free = t0;
  for (let i = 1; i <= STEPS; i++) {
    const t = t0 + ((1 - t0) * i) / STEPS;
    if (!blocked(lerp3(target, camera, t))) {
      free = t;
      continue;
    }
    let hit = t;
    for (let k = 0; k < REFINE; k++) {
      const mid = (free + hit) / 2;
      if (blocked(lerp3(target, camera, mid))) hit = mid;
      else free = mid;
    }
    return lerp3(target, camera, free);
  }
  return camera;
}

/** The old `bounds-gap` measure: the axis gap to each side of the bounds, the first tight one. */
function oldBoundsGap(o: Rect, bounds: Rect, clear = 6): number | undefined {
  const edges = [o.minX - bounds.minX, bounds.maxX - o.maxX, o.minZ - bounds.minZ, bounds.maxZ - o.maxZ];
  return edges.find((d) => d > 1e-6 && d < clear - 1e-6);
}

const rng = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

describe("a slab without wings behaves exactly as the single-rect code did", () => {
  const layouts = realLayouts();
  // L1 carries the Agent Office wing (checked below, away from the joint).
  for (const id of (Object.keys(layouts) as FloorId[]).filter((f) => !layouts[f].wings?.length)) {
    const layout = layouts[id];
    const { bounds } = layout;

    it(`${id}: has no wings, so every check below runs on the plain slab`, () => {
      expect(layout.wings ?? []).toEqual([]);
    });

    it(`${id}: the navgrid is cell for cell the frozen build`, () => {
      for (const radius of [ROVER.radius, 3]) {
        const grid = buildNavGrid(layout, radius, radius === 3 ? 0.5 : 1);
        const old = legacy.buildNavGrid(layout, radius, radius === 3 ? 0.5 : 1);
        expect([grid.minX, grid.minZ, grid.cols, grid.rows]).toEqual([old.minX, old.minZ, old.cols, old.rows]);
        expect(grid.walkable).toEqual(old.walkable);
      }
    });

    it(`${id}: rover collision gives the same point on 400 seeded samples, on and off the slab`, () => {
      const rand = rng(id.charCodeAt(0) * 977 + id.charCodeAt(1));
      for (let k = 0; k < 400; k++) {
        const p = { x: bounds.minX - 4 + rand() * (bounds.maxX - bounds.minX + 8), z: bounds.minZ - 4 + rand() * (bounds.maxZ - bounds.minZ + 8) };
        expect(resolveCircle(p, ROVER.radius, layout.obstacles, layout), `${id} ${JSON.stringify(p)}`).toEqual(oldResolveCircle(p, ROVER.radius, layout.obstacles, bounds));
      }
    });

    it(`${id}: the camera's blocked test, view test and clamp match on 300 seeded rays`, () => {
      const w = cameraWorld(layout, floorY(id));
      const rand = rng(id.charCodeAt(0) * 313 + id.charCodeAt(1));
      const y0 = floorY(id);
      for (let k = 0; k < 300; k++) {
        const x = bounds.minX - 6 + rand() * (bounds.maxX - bounds.minX + 12);
        const z = bounds.minZ - 6 + rand() * (bounds.maxZ - bounds.minZ + 12);
        const cam: Vec3 = [x, y0 + 0.2 + rand() * 6, z];
        const rover: Vec3 = [clamp(x + (rand() - 0.5) * 20, bounds.minX, bounds.maxX), y0 + 1, clamp(z + (rand() - 0.5) * 20, bounds.minZ, bounds.maxZ)];
        const label = `${id} ${JSON.stringify([cam, rover])}`;
        expect(cameraBlocked(cam, w), label).toBe(oldCameraBlocked(cam, w));
        expect(viewOnSlab(cam, rover, w, 40), label).toBe(oldViewOnSlab(cam, rover, w, 40));
        expect(clampCamera(rover, cam, w, rover, 40), label).toEqual(oldClampCamera(rover, cam, w, rover, 40));
        expect(clampCamera(rover, cam, w), label).toEqual(oldClampCamera(rover, cam, w));
      }
    });

    it(`${id}: the space rules' slab edges flag the same obstacles`, () => {
      const rand = rng(id.charCodeAt(0) * 59 + id.charCodeAt(1));
      const empty = { bounds, obstacles: [] as Rect[], doors: [], network: { roads: [], plazas: [], spurs: [] }, start: layout.approach };
      for (let k = 0; k < 80; k++) {
        const w = 0.5 + rand() * 4;
        const d = 0.5 + rand() * 4;
        const minX = bounds.minX + rand() * (bounds.maxX - bounds.minX - w);
        const minZ = bounds.minZ + rand() * (bounds.maxZ - bounds.minZ - d);
        const o = { minX, maxX: minX + w, minZ, maxZ: minZ + d };
        const got = spaceViolations({ ...empty, obstacles: [o] }).filter((v) => v.rule === "bounds-gap");
        const old = oldBoundsGap(o, bounds);
        expect(got.length, JSON.stringify(o)).toBe(old === undefined ? 0 : 1);
        if (old !== undefined) expect(got[0].detail).toContain(`${old.toFixed(2)} u between`);
      }
    });

    it(`${id}: the space rules' slab edges flag the same real obstacles (some cross or leave the slab)`, () => {
      const empty = { bounds, obstacles: [] as Rect[], doors: [], network: { roads: [], plazas: [], spurs: [] }, start: layout.approach };
      for (const o of layout.obstacles) {
        const got = spaceViolations({ ...empty, obstacles: [o] }).filter((v) => v.rule === "bounds-gap");
        expect(got.length, JSON.stringify(o)).toBe(oldBoundsGap(o, bounds) === undefined ? 0 : 1);
      }
    });
  }
});

describe("L1 with the Agent Office wing behaves as the single-rect code did away from the joint", () => {
  const layout = realLayouts().L1;
  const { bounds } = layout;
  const wing = LOBBY.officeWing.rect;
  /** Within `m` of the joint's span (the wing's north edge on the Lobby's south edge), where the wing opens the floor. */
  const nearJoint = (p: Vec2, m: number) => Math.abs(p.z - wing.minZ) <= m && p.x >= wing.minX - m && p.x <= wing.maxX + m;

  it("has exactly the office wing", () => {
    expect(layout.wings).toEqual([wing]);
    expect(layout.wings!.length).toBe(1);
  });

  it("keeps every navgrid cell of the main rect away from the joint", () => {
    for (const radius of [ROVER.radius, 3]) {
      const cell = radius === 3 ? 0.5 : 1;
      const grid = buildNavGrid(layout, radius, cell);
      const old = legacy.buildNavGrid(layout, radius, cell);
      for (let idx = 0; idx < old.walkable.length; idx++) {
        const p = { x: old.minX + ((idx % old.cols) + 0.5) * old.cell, z: old.minZ + (Math.floor(idx / old.cols) + 0.5) * old.cell };
        if (nearJoint(p, radius + cell)) continue;
        expect(isWalkable(grid, p), JSON.stringify([radius, p])).toBe(old.walkable[idx] === 1);
      }
    }
  });

  it("gives the same rover collision on 400 seeded samples inside the main rect away from the joint", () => {
    const rand = rng(4242);
    let checked = 0;
    for (let k = 0; k < 400; k++) {
      const p = { x: bounds.minX + rand() * (bounds.maxX - bounds.minX), z: bounds.minZ + rand() * (bounds.maxZ - bounds.minZ) };
      if (nearJoint(p, ROVER.radius + 1)) continue;
      checked++;
      expect(resolveCircle(p, ROVER.radius, layout.obstacles, layout), JSON.stringify(p)).toEqual(oldResolveCircle(p, ROVER.radius, layout.obstacles, bounds));
    }
    expect(checked).toBeGreaterThan(300);
  });
});
