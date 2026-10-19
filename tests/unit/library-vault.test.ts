import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { guideViews } from "@/content/guide-views";
import { cameraWorld, clampCamera } from "@/experience/camera/collision";
import { followOffsetScale } from "@/experience/camera/offset";
import { ZOOM_RANGE, zoneAt, zoneView } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followForward, followPose, type Vec3 } from "@/experience/camera/rigs";
import { buildFloorLayouts, ROVER } from "@/experience/config";
import { NEWSROOM } from "@/experience/floors/library/concepts/newsroom";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { LIBRARY_FLOOR, libraryLayoutInput, type LibraryLayoutInput, type VaultBook } from "@/experience/floors/library/model";
import { ringRoadPoints } from "@/experience/nav/ringRoad";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import { PAD } from "@/experience/nav/pads";
import { pathBetween, projectOnRoad } from "@/experience/nav/road";
import { rectGap } from "@/experience/nav/space";
import type { Rect, Vec2 } from "@/experience/types";
import { cameraClass } from "@/lib/viewport";
import { expectPadRules, expectSpaceRules } from "../helpers/space";

/**
 * The L4 Study Vault (PR2): an alcove off the end plaza's ring road (south-east) with the certification study guides
 * as four tall books on an arc east of the stop `L4:vault`, each facing it. Pure layout checks; the scene and the spine
 * signs are tested with the end plaza (Task 3).
 */

const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const data = buildExperienceData("en", FLOOR_NAMES);
const real = libraryLayoutInput(data.library);
const crowded: LibraryLayoutInput = {
  ...real,
  posts: Array.from({ length: LIBRARY_FLOOR.maxPosts + 6 }, (_, i) => ({ slug: `p${i}`, date: `${2026 - Math.floor(i / 4)}-01-01`, tags: ["case-study"], external: false })),
};
const V = NEWSROOM.end.vault;
const VAULT = "L4:vault";
const inside = (p: Vec2, r: Rect) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const around = (p: Vec2, r: number): Rect => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
/** The input without the field: the floor as it was before the vault. */
function withoutGuides(input: LibraryLayoutInput): LibraryLayoutInput {
  const rest = { ...input };
  delete rest.guides;
  return rest;
}

/** The four corners of a book's footprint (thickness along the arc, depth along its facing). */
function footprint(b: VaultBook): Vec2[] {
  const t = { x: -b.facing.z, z: b.facing.x };
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => ({ x: b.at.x + (i * t.x * V.book.w) / 2 + (j * b.facing.x * V.book.d) / 2, z: b.at.z + (i * t.z * V.book.w) / 2 + (j * b.facing.z * V.book.d) / 2 }));
}

/** Separating axis test on two convex quads: true when their interiors overlap. */
function quadsOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const n = { x: q.z - p.z, z: p.x - q.x };
      const proj = (pts: Vec2[]) => pts.map((v) => v.x * n.x + v.z * n.z);
      const pa = proj(a);
      const pb = proj(b);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
    }
  return true;
}

describe.each([
  ["real content", real],
  ["crowded (archive board)", crowded],
  ["no research metrics", { ...real, metrics: false }],
])("L4 Study Vault with %s", (_, input) => {
  const layout = buildLibraryLayout(input);
  const end = layout.end!;
  const vault = end.vault!;
  const L4 = buildFloorLayouts(data.years.length, { library: input }).L4;
  const net = L4.road!;
  const grid = buildNavGrid(L4, ROVER.radius);

  it("stands the guides as four books in file order, with their spine, issuer and code", () => {
    expect(vault).not.toBeNull();
    const guides = guideViews("en");
    expect(vault.books).toHaveLength(4);
    expect(vault.books.map((b) => b.slug)).toEqual(guides.map((g) => g.slug));
    for (const [i, b] of vault.books.entries()) expect({ spine: b.spine, issuer: b.issuer, code: b.code }).toEqual({ spine: guides[i].spine, issuer: guides[i].issuer, code: guides[i].code });
  });

  it("passes the space and pad rules with the vault road, plaza and books", () => {
    expectSpaceRules({ bounds: L4.bounds, obstacles: L4.obstacles, doors: L4.doors ?? [], network: net, start: L4.approach, pads: L4.pads });
    expectPadRules({ bounds: L4.bounds, obstacles: L4.obstacles, doors: L4.doors ?? [], network: net, start: L4.approach, pads: L4.pads ?? [] });
  });

  it("branches a road off the ring road's south-east vertex to a round vault plaza", () => {
    const ring = ringRoadPoints(end.center, NEWSROOM.end.ring, NEWSROOM.end.segments);
    expect(vault.entry).toEqual(ring[V.entryVertex]);
    expect(vault.entry.x).toBeGreaterThan(end.center.x);
    expect(vault.entry.z).toBeGreaterThan(end.center.z);
    const road = net.roads.find((r) => r.id === "vault")!;
    expect(road.width).toBe(LIBRARY_FLOOR.road);
    expect(road.points[0]).toEqual(vault.entry);
    expect(road.points.at(-1)).toEqual(vault.center);
    const plaza = net.plazas.find((p) => p.id === "vault")!;
    expect(plaza).toMatchObject({ center: vault.center, w: V.plaza, d: V.plaza, round: true });
    expect(vault.radius).toBe(V.plaza / 2);
    // The diagonal from the end plaza center: entry, stop and vault center line up.
    const dir = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
    for (const p of [vault.entry, vault.stop, vault.center]) {
      const dx = p.x - end.center.x;
      const dz = p.z - end.center.z;
      expect(Math.abs(dx * dir.z - dz * dir.x)).toBeLessThan(1e-6);
    }
    expect(dist(vault.center, end.center)).toBeCloseTo(V.distance, 6);
    // The stop is on the ring side of the plaza center, on the road.
    expect(dist(vault.stop, end.center)).toBeLessThan(dist(vault.center, end.center));
    expect(projectOnRoad(road, vault.stop).distance).toBeLessThan(1e-6);
  });

  it("stops the rover at `L4:vault`, reachable on the road from the arrival and on the navgrid from the elevator", () => {
    expect(L4.stops?.[VAULT]).toEqual(vault.stop);
    const path = pathBetween(net, L4.arrival!, vault.stop);
    expect(path).not.toBeNull();
    expect(dist(path!.at(-1)!, vault.stop)).toBeLessThan(1e-6);
    expect(isWalkable(grid, vault.stop)).toBe(true);
    expect(findPath(grid, L4.approach, vault.stop)?.length).toBeGreaterThan(0);
  });

  it("arcs the books on the far side of the vault plaza, north to south about 3 u apart, each facing the stop", () => {
    for (const b of vault.books) {
      const to = { x: vault.stop.x - b.at.x, z: vault.stop.z - b.at.z };
      const len = Math.hypot(to.x, to.z);
      expect(b.facing.x).toBeCloseTo(to.x / len, 6);
      expect(b.facing.z).toBeCloseTo(to.z / len, 6);
      expect(len).toBeCloseTo(V.arc, 6);
      // On the plaza's east side, past its center as seen from the stop, and inside the plaza.
      expect(b.at.x).toBeGreaterThan(vault.center.x);
      expect(b.facing.x).toBeLessThan(0);
      expect(dist(b.at, vault.center)).toBeLessThan(vault.radius);
    }
    // Centered due east of the stop.
    const mid = vault.books.reduce((z, b) => z + b.at.z, 0) / vault.books.length;
    expect(mid).toBeCloseTo(vault.stop.z, 6);
    for (let i = 1; i < vault.books.length; i++) {
      expect(vault.books[i].at.z).toBeGreaterThan(vault.books[i - 1].at.z);
      const gap = dist(vault.books[i - 1].at, vault.books[i].at);
      expect(gap).toBeGreaterThan(2.8);
      expect(gap).toBeLessThan(3.2);
    }
  });

  it("bounds each book's footprint with its rect (a tall camera column), no two overlapping, and blocks the shelf they share", () => {
    for (const b of vault.books) {
      for (const c of footprint(b)) expect(inside(c, { minX: b.rect.minX - 1e-9, maxX: b.rect.maxX + 1e-9, minZ: b.rect.minZ - 1e-9, maxZ: b.rect.maxZ + 1e-9 })).toBe(true);
      expect(L4.tall).toContainEqual({ ...b.rect, h: V.book.h });
      expect(inside(b.at, L4.bounds)).toBe(true);
    }
    for (let i = 0; i < vault.books.length; i++)
      for (let j = i + 1; j < vault.books.length; j++) {
        const [a, b] = [vault.books[i], vault.books[j]];
        expect(quadsOverlap(footprint(a), footprint(b)), `${a.slug} x ${b.slug}`).toBe(false);
        expect(rectGap(a.rect, b.rect), `${a.slug} x ${b.slug} rects`).toBeGreaterThan(0);
      }
    // One obstacle for the row: separate book rects would leave gaps under the 6 u clear floor rule between them.
    const rects = vault.books.map((b) => b.rect);
    expect(vault.shelf).toEqual({
      minX: Math.min(...rects.map((r) => r.minX)),
      maxX: Math.max(...rects.map((r) => r.maxX)),
      minZ: Math.min(...rects.map((r) => r.minZ)),
      maxZ: Math.max(...rects.map((r) => r.maxZ)),
    });
    expect(L4.obstacles).toContainEqual(vault.shelf);
    for (const r of rects) expect(L4.obstacles).not.toContainEqual(r);
    // A thin strip on the plaza's east side, clear of the stop by more than the rover.
    expect(vault.shelf.maxX - vault.shelf.minX).toBeLessThan(4);
    expect(vault.shelf.minX - vault.stop.x).toBeGreaterThan(ROVER.radius + 3);
  });

  it("keeps every book at least 3 u from the Return pad, the board, the monument, the ring road and the slab edge", () => {
    const pad = around(end.returnPad, PAD.radius);
    const ring = net.roads.find((r) => r.id === "end-ring")!;
    for (const b of [...vault.books, { slug: "shelf", rect: vault.shelf }]) {
      expect(rectGap(b.rect, pad), `${b.slug} to the Return pad`).toBeGreaterThanOrEqual(3);
      if (layout.board) expect(rectGap(b.rect, layout.board.rect), `${b.slug} to the board`).toBeGreaterThanOrEqual(3);
      if (end.monument) expect(rectGap(b.rect, end.monument.rect), `${b.slug} to the monument`).toBeGreaterThanOrEqual(3);
      expect(rectGap(b.rect, end.core), `${b.slug} to the pedestal`).toBeGreaterThanOrEqual(3);
      const { minX, maxX, minZ, maxZ } = b.rect;
      for (const c of [
        { x: minX, z: minZ },
        { x: maxX, z: minZ },
        { x: minX, z: maxZ },
        { x: maxX, z: maxZ },
      ])
        expect(projectOnRoad(ring, c).distance - ring.width / 2, `${b.slug} to the ring road`).toBeGreaterThanOrEqual(3);
      const slab = L4.bounds;
      expect(Math.min(b.rect.minX - slab.minX, slab.maxX - b.rect.maxX, b.rect.minZ - slab.minZ, slab.maxZ - b.rect.maxZ), `${b.slug} to the slab edge`).toBeGreaterThanOrEqual(3);
    }
    // The vault road and plaza stay clear of the Return pad and the board.
    expect(dist(vault.center, end.returnPad)).toBeGreaterThan(vault.radius + PAD.radius + 3);
    if (layout.board) expect(rectGap(around(vault.center, vault.radius), layout.board.rect)).toBeGreaterThanOrEqual(3);
  });

  it("turns the camera at the stop toward the books (any heading), zoomed out to fit them", () => {
    const zone = L4.viewZones!.find((z) => z.id === VAULT)!;
    expect(inside(vault.stop, zone.area)).toBe(true);
    for (const heading of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2]) expect(zoneAt("L4", { ...vault.stop, heading }, L4.viewZones)?.id).toBe(VAULT);
    expect(zone.zoom).toBe(V.zoom);
    expect(zone.classView?.mobile?.zoom).toBe(V.zoomPhone);
    for (const z of [V.zoom, V.zoomPhone]) {
      expect(z).toBeGreaterThanOrEqual(ZOOM_RANGE[0]);
      expect(z).toBeLessThanOrEqual(ZOOM_RANGE[1]);
    }
    // No other zone overlaps the vault zone.
    for (const other of L4.viewZones!.filter((z) => z.id !== VAULT))
      expect(zone.area.maxX < other.area.minX || zone.area.minX > other.area.maxX || zone.area.maxZ < other.area.minZ || zone.area.minZ > other.area.maxZ, other.id).toBe(true);
  });

  it("keeps everything else as it was without guides: the vault only adds its road, plaza, books, stop, zone and slab", () => {
    const old = buildLibraryLayout(withoutGuides(input));
    expect(old.end?.vault).toBeNull();
    expect(buildLibraryLayout({ ...input, guides: [] })).toEqual(old);
    const vaultRoad = (id: string) => id === "vault";
    expect(layout.network.roads.filter((r) => !vaultRoad(r.id))).toEqual(old.network.roads);
    expect(layout.network.plazas.filter((p) => !vaultRoad(p.id))).toEqual(old.network.plazas);
    expect(layout.network.spurs).toEqual(old.network.spurs);
    expect(layout.stations).toEqual(old.stations);
    expect(layout.floor.doors).toEqual(old.floor.doors);
    expect(layout.floor.obstacles.slice(0, -1)).toEqual(old.floor.obstacles);
    expect(layout.floor.obstacles.at(-1)).toEqual(vault.shelf);
    expect(layout.floor.viewZones!.filter((z) => z.id !== VAULT)).toEqual(old.floor.viewZones);
    const { [VAULT]: stop, ...stops } = layout.floor.stops ?? {};
    expect(stop).toEqual(vault.stop);
    expect(stops).toEqual(old.floor.stops);
    expect(layout.floor.tall!.slice(0, old.floor.tall!.length)).toEqual(old.floor.tall);
    // The slab only grows (south and east) to hold the vault.
    expect(layout.floor.bounds.minX).toBe(old.floor.bounds.minX);
    expect(layout.floor.bounds.minZ).toBe(old.floor.bounds.minZ);
    expect(layout.floor.bounds.maxX).toBeGreaterThanOrEqual(old.floor.bounds.maxX);
    expect(layout.floor.bounds.maxZ).toBeGreaterThanOrEqual(old.floor.bounds.maxZ);
    for (const c of [
      { x: vault.center.x + vault.radius + LIBRARY_FLOOR.margin, z: vault.center.z + vault.radius + LIBRARY_FLOOR.margin },
      { x: vault.center.x - vault.radius, z: vault.center.z - vault.radius },
    ])
      expect(inside(c, layout.floor.bounds)).toBe(true);
  });
});

describe("L4 Study Vault camera (real content)", () => {
  const input = real;
  const L4 = buildFloorLayouts(data.years.length, { library: input }).L4;
  const vault = buildLibraryLayout(input).end!.vault!;
  const zone = zoneAt("L4", vault.stop, L4.viewZones)!;
  const world = cameraWorld(L4, 0);
  /** HUD-free boxes (`DESKTOP_SAFE`, `PHONE_SAFE` in e2e/hq.ts), as in arrivals.test.ts. */
  const DESKTOP_SAFE = { top: 90, bottom: 90, side: 40 };
  const PHONE_SAFE = { top: 120, bottom: 140, side: 24 };

  for (const [w, h] of [
    [1440, 900],
    [1194, 834],
    [834, 1194],
    [390, 844],
  ] as const) {
    it(`frames all four books whole with the rover on the stop at ${w}x${h}`, () => {
      const cls = cameraClass(w, h);
      const view = zoneView(zone, cls);
      const forward = followForward(cls, view.yaw);
      const ahead = FOLLOW_LOOK_AHEAD[cls];
      const rover: Vec3 = [vault.stop.x, 1, vault.stop.z];
      const target: Vec3 = [vault.stop.x + forward.x * ahead, 1, vault.stop.z + forward.z * ahead];
      const pose = followPose(cls, target, view.yaw, (view.zoom ?? 1) * followOffsetScale(cls, w / h), view.pitch ?? 0);
      const position = clampCamera(target, pose.position, world, rover, pose.fov);
      // The camera looks from the ring side toward the books.
      const look = { x: target[0] - position[0], z: target[2] - position[2] };
      const toBooks = { x: vault.books[1].at.x - vault.stop.x, z: 0 };
      expect(look.x * toBooks.x + look.z * toBooks.z).toBeGreaterThan(0);
      const camera = new PerspectiveCamera(pose.fov, w / h, 0.1, 500);
      camera.position.set(...position);
      camera.lookAt(new Vector3(...target));
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      const safe = cls === "mobile" ? PHONE_SAFE : DESKTOP_SAFE;
      const points: { label: string; at: Vec3 }[] = [
        { label: "rover", at: rover },
        ...vault.books.flatMap((b) => footprint(b).flatMap((c, k) => [0, V.book.h].map((y) => ({ label: `${b.slug} corner ${k} at ${y}`, at: [c.x, y, c.z] as Vec3 })))),
      ];
      for (const { label, at } of points) {
        const v = new Vector3(...at).project(camera);
        const sx = ((v.x + 1) / 2) * w;
        const sy = ((1 - v.y) / 2) * h;
        expect(v.z, label).toBeLessThan(1);
        expect(sx, label).toBeGreaterThanOrEqual(safe.side);
        expect(sx, label).toBeLessThanOrEqual(w - safe.side);
        expect(sy, label).toBeGreaterThanOrEqual(safe.top);
        expect(sy, label).toBeLessThanOrEqual(h - safe.bottom);
      }
    });
  }
});
