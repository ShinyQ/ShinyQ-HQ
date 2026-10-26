import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { DOCK, LIBRARY_FLOOR, libraryLayoutInput, type LibraryBay } from "@/experience/floors/library/model";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { SHELF, shelfSize } from "@/experience/floors/library/shelf";
import { baySlots, SHELF_PLINTH } from "@/experience/floors/library/slots";
import { bayZone, frameMatrices, leadMatrix, pickSpine, SHELF_SCENE, spineMatrix } from "@/experience/floors/library/decor/shelf3d";
import { VAULT_SCENE } from "@/experience/floors/library/decor/vault";
import { shelfMeshes } from "@/experience/floors/library/decor/TrackShelves";

/**
 * The L4 track shelves' pure scene helpers (`decor/shelf3d.ts`) and their instanced kit (`shelfMeshes`). A spine stands
 * on its row with its spine face (local +z) toward the road (`-bay.facing`); the lead's cover follows the Study Vault's
 * cover conventions (hinged on the spine edge, on the right as seen from the road). The unit box is lifted so its base
 * sits at y 0.
 */

const at = (m: Matrix4, x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(m);
const flat = (v: Vector3) => ({ x: v.x, z: v.z });
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** A bay north of an east-west road at z 0 (facing -z) or south of it (facing +z), holding `n` posts. */
function bay(n: number, side: 1 | -1 = 1): LibraryBay {
  const { along } = shelfSize(n);
  const facing = { x: 0, z: -side };
  const center = { x: 10, z: -side * 10 };
  const rect = { minX: 10 - along / 2, maxX: 10 + along / 2, minZ: center.z - SHELF.across / 2, maxZ: center.z + SHELF.across / 2 };
  const posts = Array.from({ length: n }, (_, i) => `p${i}`);
  const door = { x: 10, z: -side * 5 };
  return { track: `t${side}`, room: `L4:track:t${side}` as LibraryBay["room"], rect, center, door, facing, from: { x: 10, z: 0 }, stop: door, posts };
}

describe("spineMatrix", () => {
  for (const side of [1, -1] as const)
    it(`stands each spine on its row, face toward the road, sized to the slot (${side > 0 ? "north" : "south"} bay)`, () => {
      const b = bay(30, side);
      for (const slot of baySlots(b).slice(1)) {
        const m = spineMatrix(slot, 0, b.facing, new Matrix4());
        const base = at(m, 0, 0, 0);
        expect(base.x).toBeCloseTo(slot.at.x, 6);
        expect(base.y).toBeCloseTo(slot.y + SHELF_PLINTH, 6);
        expect(base.z).toBeCloseTo(slot.at.z, 6);
        expect(at(m, 0, 1, 0).y - base.y).toBeCloseTo(slot.h, 6);
        const face = flat(at(m, 0, 0, 0.5));
        expect((face.x - base.x) / (slot.d / 2)).toBeCloseTo(-b.facing.x, 6);
        expect((face.z - base.z) / (slot.d / 2)).toBeCloseTo(-b.facing.z, 6);
        expect(dist(flat(at(m, 0.5, 0, 0)), base)).toBeCloseTo(slot.w / 2, 6);
      }
    });

  it("slides a pulled spine toward the road by SHELF_SCENE.pull", () => {
    const b = bay(10);
    const slot = baySlots(b)[3];
    const c = at(spineMatrix(slot, 1, b.facing, new Matrix4()), 0, 0, 0);
    expect(c.x).toBeCloseTo(slot.at.x - b.facing.x * SHELF_SCENE.pull, 6);
    expect(c.z).toBeCloseTo(slot.at.z - b.facing.z * SHELF_SCENE.pull, 6);
    expect(SHELF_SCENE).toEqual({ pull: 0.3, rate: 1.6 });
    expect(SHELF_PLINTH).toBe(VAULT_SCENE.plinth);
  });
});

describe("leadMatrix", () => {
  for (const side of [1, -1] as const)
    it(`holds the lead's cover half open, hinged on its spine edge on the right as seen from the road (${side > 0 ? "north" : "south"} bay)`, () => {
      const b = bay(6, side);
      const lead = baySlots(b)[0];
      const body = spineMatrix(lead, 0, b.facing, new Matrix4());
      const cover = leadMatrix(lead, 0.5, b.facing, new Matrix4());
      // Right of a viewer on the road looking into the bay along `facing`.
      const right = { x: -b.facing.z, z: b.facing.x };
      const along = (p: { x: number; z: number }) => (p.x - lead.at.x) * right.x + (p.z - lead.at.z) * right.z;
      const hinge = flat(at(cover, -0.5, 0, 0.5));
      const spineEdge = flat(at(body, 0.5, 0, 0.5));
      expect(dist(hinge, spineEdge)).toBeCloseTo(VAULT_SCENE.cover.slide * 0.5, 6);
      expect(along(hinge)).toBeCloseTo(lead.w / 2 + VAULT_SCENE.cover.slide * 0.5, 6);
      const front = flat(at(cover, 0, 0, 0.5));
      const middle = flat(at(cover, 0, 0, 0));
      const dir = { x: (front.x - middle.x) / (lead.d / 2), z: (front.z - middle.z) / (lead.d / 2) };
      expect(-(dir.x * b.facing.x + dir.z * b.facing.z)).toBeCloseTo(Math.cos(VAULT_SCENE.cover.turn * 0.5), 6);
      expect(at(cover, 0, 0, 0).y).toBeGreaterThanOrEqual(lead.y + SHELF_PLINTH);
      // The open cover stays clear of the first spine, even pulled out.
      const inverse = spineMatrix(baySlots(b)[1], 1, b.facing, new Matrix4()).invert();
      for (const x of [-0.5, 0.5])
        for (let z = -0.5; z <= 0.5; z += 0.05) {
          const p = at(cover, x, 0.2, z).applyMatrix4(inverse);
          expect(Math.abs(p.x) <= 0.5 && Math.abs(p.z) <= 0.5).toBe(false);
        }
    });
});

describe("frameMatrices", () => {
  it("lays a board under every row and one back panel behind the shelf", () => {
    for (const n of [1, 14, 15, 40]) {
      const b = bay(n);
      const { rows } = shelfSize(n);
      const frames = frameMatrices(b);
      expect(frames).toHaveLength(rows + 1);
      for (let r = 0; r < rows; r++) {
        const top = Math.max(...[-0.5, 0.5].flatMap((z) => [0, 1].map((y) => at(frames[r], 0.5, y, z).y)));
        expect(top).toBeCloseTo(r * SHELF.rowH + SHELF_PLINTH, 6);
      }
      // Every spine of a row stands within its board along the bay.
      for (const slot of baySlots(b)) {
        const board = frames[Math.round(slot.y / SHELF.rowH)];
        const p = new Vector3(slot.at.x, slot.y + SHELF_PLINTH - 0.01, slot.at.z).applyMatrix4(board.clone().invert());
        expect(Math.abs(p.x)).toBeLessThan(0.5);
      }
      // The back panel stands behind the boards, square to the road.
      const back = flat(at(frames[rows], 0, 0, 0));
      expect((back.z - b.center.z) * b.facing.z).toBeCloseTo(SHELF.lead.d / 2, 6);
    }
  });
});

describe("pickSpine", () => {
  const b = bay(10);
  const spines = baySlots(b).slice(1).map((slot) => ({ slot, zone: bayZone(b) }));

  it("reaches from the bay to the road's centerline", () => {
    const z = bayZone(b);
    expect(z.minZ).toBeCloseTo(b.rect.minZ, 6);
    expect(z.maxZ).toBeCloseTo(b.rect.maxZ + LIBRARY_FLOOR.road / 2 + DOCK.forecourt, 6);
    expect(z.minX).toBe(b.rect.minX);
  });

  it("picks the hovered spine, else the nearest within 6 u inside the bay zone, else none", () => {
    expect(pickSpine(spines, "L4:shelf:p4", 0, 100)).toBe(3);
    const s = spines[5].slot;
    expect(pickSpine(spines, undefined, s.at.x, b.door.z)).toBe(5);
    expect(pickSpine(spines, "L4:vault:x", s.at.x, b.door.z)).toBe(5);
    expect(pickSpine(spines, undefined, s.at.x, 3)).toBe(-1);
    expect(pickSpine(spines, undefined, b.rect.maxX + 0.5, b.door.z)).toBe(-1);
  });
});

describe("shelfMeshes", () => {
  const data = buildExperienceData("en", { L1: "", L2: "", L3: "", L4: "", RF: "" });
  const layout = buildLibraryLayout(libraryLayoutInput(data.library));

  for (const tier of ["full", "lite"] as const)
    it(`spans every bay with one mesh per part (bodies, covers; no light pools), culled by one sphere (${tier})`, () => {
      const kit = shelfMeshes(layout.bays, tier);
      try {
        expect(kit.meshes).toHaveLength(2);
        const posts = layout.bays.reduce((n, b) => n + b.posts.length, 0);
        const frames = layout.bays.reduce((n, b) => n + shelfSize(b.posts.length).rows + 1, 0);
        expect(kit.meshes[0].count).toBe(posts + frames);
        expect(kit.meshes[1].count).toBe(layout.bays.length);
        expect(kit.spines).toBe(posts - layout.bays.length);
        const sphere = kit.meshes[0].boundingSphere!;
        for (const m of kit.meshes) {
          expect(m.boundingSphere).toBe(sphere);
          expect(m.raycast({} as never, [])).toBeNull();
        }
        // Every spine stays inside the sphere when pulled.
        layout.bays.forEach((b) =>
          baySlots(b).forEach((slot) => {
            const p = at(spineMatrix(slot, 1, b.facing, new Matrix4()).premultiply(kit.shift), 0, 1, 0.5);
            expect(p.distanceTo(sphere.center)).toBeLessThanOrEqual(sphere.radius + 1e-6);
          }),
        );
      } finally {
        kit.dispose();
      }
    });
});
