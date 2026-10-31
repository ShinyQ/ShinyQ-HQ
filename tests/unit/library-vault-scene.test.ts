import { Matrix4, Vector3, type InstancedMesh } from "three";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { NEWSROOM } from "@/experience/floors/library/concepts/newsroom";
import { bookMatrix, bookOpen, coverMatrix, coverOpen, issuerTone, ISSUER_TONE, plinthMatrix, VAULT_SCENE } from "@/experience/floors/library/decor/vault";
import { endPlazaSigns } from "@/experience/floors/library/decor/EndPlaza";
import { vaultMeshes } from "@/experience/floors/library/decor/StudyVault";
import { END_SIGN_NEAR, VAULT_PRIORITY, vaultZone } from "@/experience/floors/library/decor/signFrame";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { orbSlots } from "@/experience/floors/library/topics";
import { libraryLayoutInput, type LibraryVault } from "@/experience/floors/library/model";

/**
 * The L4 Study Vault scene's pure helpers (`decor/vault.ts`): how far each book's cover opens with the rover's distance,
 * the instance matrices of the books and their covers (spine toward the stop, cover hinged on the spine edge) and the
 * issuer tones. The unit box the matrices scale is `BoxGeometry(1, 1, 1)` lifted so its base sits at y 0.
 */

const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const data = buildExperienceData("en", FLOOR_NAMES);
const layout = buildLibraryLayout(libraryLayoutInput(data.library));
const vault = layout.end!.vault!;
const B = NEWSROOM.end.vault.book;

/** A point of the unit box (x and z in -0.5..0.5, y in 0..1) through `m`. */
const at = (m: Matrix4, x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(m);
const flat = (v: Vector3) => ({ x: v.x, z: v.z });
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe("coverOpen", () => {
  it("is shut beyond the far distance, fully open within the near one", () => {
    expect(coverOpen(VAULT_SCENE.far + 0.01)).toBe(0);
    expect(coverOpen(100)).toBe(0);
    expect(coverOpen(VAULT_SCENE.near)).toBe(1);
    expect(coverOpen(0)).toBe(1);
  });

  it("stands half open from the stop (on either arc) and shut from the ring road, opening fully at the book", () => {
    for (const book of vault.books) {
      expect(bookOpen(book, vault.stop, vault.stop.x, vault.stop.z)).toBeCloseTo(0.5, 6);
      expect(bookOpen(book, vault.stop, vault.entry.x, vault.entry.z)).toBe(0);
      expect(bookOpen(book, vault.stop, book.at.x, book.at.z)).toBe(1);
    }
  });

  it("opens monotonically, smoothly, as the rover comes nearer", () => {
    let prev = -1;
    for (let d = 10; d >= 0; d -= 0.1) {
      const k = coverOpen(d);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(1);
      expect(k).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = k;
    }
    expect(coverOpen((VAULT_SCENE.near + VAULT_SCENE.far) / 2)).toBeCloseTo(0.5, 6);
  });
});

describe("bookMatrix", () => {
  it("stands each book upright on the plinth with its spine toward the stop", () => {
    for (const book of vault.books) {
      const m = bookMatrix(book, new Matrix4());
      const base = at(m, 0, 0, 0);
      expect(base.x).toBeCloseTo(book.at.x, 6);
      expect(base.z).toBeCloseTo(book.at.z, 6);
      expect(base.y).toBeCloseTo(VAULT_SCENE.plinth + book.rise, 6);
      expect(at(m, 0, 1, 0).y - base.y).toBeCloseTo(B.h, 6);
      // The spine face (local +z) is the face nearest the stop, square to it.
      const spine = flat(at(m, 0, 0, 0.5));
      const back = flat(at(m, 0, 0, -0.5));
      expect(dist(spine, base)).toBeCloseTo(B.d / 2, 6);
      expect(dist(spine, vault.stop)).toBeLessThan(dist(back, vault.stop));
      const dir = { x: (spine.x - base.x) / (B.d / 2), z: (spine.z - base.z) / (B.d / 2) };
      expect(dir.x).toBeCloseTo(book.facing.x, 6);
      expect(dir.z).toBeCloseTo(book.facing.z, 6);
      // Its thickness runs along the arc.
      expect(dist(flat(at(m, 0.5, 0, 0)), base)).toBeCloseTo(B.w / 2, 6);
    }
  });
});

describe("plinthMatrix", () => {
  it("lies under each book from the floor up, its top at the book's base (the riser on the back arc), wider and deeper than the book", () => {
    for (const book of vault.books) {
      const m = plinthMatrix(book, new Matrix4());
      const body = bookMatrix(book, new Matrix4());
      // The unit box's y (0 to 1) runs along the depth and its z (-0.5 to 0.5) up.
      const ys = [0, 1].flatMap((y) => [-0.5, 0.5].map((z) => at(m, 0.5, y, z).y));
      expect(Math.min(...ys)).toBeCloseTo(0, 6);
      expect(Math.max(...ys)).toBeCloseTo(VAULT_SCENE.plinth + book.rise, 6);
      // Every corner of the book's base lies within the plinth's footprint.
      const inverse = m.clone().invert();
      for (const [x, z] of [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5]]) {
        const p = at(body, x, 0, z).applyMatrix4(inverse);
        expect(Math.abs(p.x)).toBeLessThan(0.5);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(1);
      }
    }
  });
});

describe("coverMatrix", () => {
  it("lies shut against the book's right side when closed", () => {
    for (const book of vault.books) {
      const body = bookMatrix(book, new Matrix4());
      const cover = coverMatrix(book, 0, new Matrix4());
      const inner = flat(at(cover, -0.5, 0, 0));
      const side = flat(at(body, 0.5, 0, 0));
      expect(dist(inner, side)).toBeLessThan(1e-6);
      // Right as seen from the stop: (facing.z, -facing.x).
      const c = flat(at(cover, 0, 0, 0));
      const right = { x: book.facing.z, z: -book.facing.x };
      expect((c.x - book.at.x) * right.x + (c.z - book.at.z) * right.z).toBeCloseTo(B.w / 2 + VAULT_SCENE.cover.t / 2, 6);
    }
  });

  it("slides out from the spine edge and swings its far edge outward, its front still toward the stop", () => {
    for (const book of vault.books) {
      const body = bookMatrix(book, new Matrix4());
      const cover = coverMatrix(book, 1, new Matrix4());
      const right = { x: book.facing.z, z: -book.facing.x };
      const along = (p: { x: number; z: number }) => (p.x - book.at.x) * right.x + (p.z - book.at.z) * right.z;
      // The hinge (the cover's inner front edge) slid out by `slide`, still level with the spine face.
      const hinge = flat(at(cover, -0.5, 0, 0.5));
      const spineEdge = flat(at(body, 0.5, 0, 0.5));
      expect(dist(hinge, spineEdge)).toBeCloseTo(VAULT_SCENE.cover.slide, 6);
      // The back edge swung outward by the turn.
      const backInner = flat(at(cover, -0.5, 0, -0.5));
      expect(along(backInner) - (B.w / 2 + VAULT_SCENE.cover.slide)).toBeCloseTo(B.d * Math.sin(VAULT_SCENE.cover.turn), 6);
      // Its front (local +z) still points toward the stop, within the turn.
      const front = flat(at(cover, 0, 0, 0.5));
      const middle = flat(at(cover, 0, 0, 0));
      const dir = { x: (front.x - middle.x) / (B.d / 2), z: (front.z - middle.z) / (B.d / 2) };
      expect(dir.x * book.facing.x + dir.z * book.facing.z).toBeCloseTo(Math.cos(VAULT_SCENE.cover.turn), 6);
    }
  });

  it("never reaches another book (either arc) when fully open", () => {
    for (const book of vault.books)
      vault.books.filter((b) => b !== book).forEach((next) => {
      const cover = coverMatrix(book, 1, new Matrix4());
      const nextBody = bookMatrix(next, new Matrix4());
      const inverse = nextBody.clone().invert();
      for (const [x, z] of [[0.5, -0.5], [0.5, 0.5], [-0.5, -0.5], [-0.5, 0.5]]) {
        const p = at(cover, x, 0.5, z).applyMatrix4(inverse);
        const inside = Math.abs(p.x) <= 0.5 && Math.abs(p.z) <= 0.5;
        expect(inside, `${book.slug} cover corner in ${next.slug}`).toBe(false);
      }
    });
  });
});

describe("issuer tones", () => {
  it("matches the Classic shelf's issuer colors, neutral for any other issuer", () => {
    expect(ISSUER_TONE).toEqual({ Microsoft: "#22d3ee", GitHub: "#a78bfa", Google: "#fbbf24" });
    expect(issuerTone("GitHub")).toBe("#a78bfa");
    expect(issuerTone("Someone else")).toBe("#f4f4f5");
  });
});

describe("the vault's signs", () => {
  const labels = { pieces: () => "", monument: null, vault: "Study Vault" };
  const { signs, meta } = endPlazaSigns(layout, data.library.topics, orbSlots(data.library.topics), labels, null);
  const end = layout.end!.center;

  it("floats each spine in its issuer's tone just in front of its book's spine face, and the Study Vault sign over the arc", () => {
    const spines = signs.filter((_, i) => meta[i].kind === "guide");
    expect(meta.filter((m) => m.kind === "guide").map((m) => m.slug)).toEqual(vault.books.map((b) => b.slug));
    vault.books.forEach((book, i) => {
      const s = spines[i];
      expect(s.text.replace(/\s+/g, " ")).toBe(book.spine);
      expect(s.color).toBe(issuerTone(book.issuer));
      const at = { x: end.x + s.x, z: end.z + s.z };
      // In front of the spine face (toward the stop), upright within the book's height.
      const ahead = (at.x - book.at.x) * book.facing.x + (at.z - book.at.z) * book.facing.z;
      expect(ahead).toBeGreaterThan(B.d / 2);
      expect(ahead).toBeLessThan(B.d / 2 + 1);
      expect(s.y).toBeLessThan(VAULT_SCENE.plinth + book.rise + B.h);
    });
    const title = signs[meta.findIndex((m) => m.kind === "vault")];
    expect(title.text).toBe("STUDY VAULT");
    expect(title.y).toBeGreaterThan(VAULT_SCENE.plinth + Math.max(...vault.books.map((b) => b.rise)) + B.h);
    expect(END_SIGN_NEAR.guide).toBe(0);
    expect(END_SIGN_NEAR.vault).toBe(0);
  });

  it("outranks the topic labels in the vault plaza, follows them near it and stays hidden from the constellation", () => {
    expect(vaultZone(vault.stop, vault)).toBe("inside");
    expect(vaultZone(vault.entry, vault)).toBe("near");
    expect(vaultZone(layout.end!.ringStop, vault)).toBe("far");
    expect(vaultZone(null, vault)).toBe("far");
    expect(VAULT_PRIORITY.inside.guide).toBeGreaterThan(VAULT_PRIORITY.inside.vault);
    expect(VAULT_PRIORITY.inside.vault).toBeGreaterThan(2000);
    expect(VAULT_PRIORITY.near.guide).toBeLessThan(0);
  });
});

describe("the vault's culling sphere", () => {
  const input = libraryLayoutInput(data.library);
  const guides = input.guides!;
  /** The vault with `n` guides (the real ones repeated, fresh slugs) through the layout builder. */
  const withGuides = (n: number): LibraryVault =>
    buildLibraryLayout({ ...input, guides: Array.from({ length: n }, (_, i) => ({ ...guides[i % guides.length], slug: `g${i}` })) }).end!.vault!;

  /** Every vertex of every instance (floor-local, relative to the vault's group origin), covers also half and fully open. */
  function points(v: LibraryVault, meshes: InstancedMesh[], shift: Matrix4): Vector3[] {
    const out: Vector3[] = [];
    const m = new Matrix4();
    const each = (mesh: InstancedMesh, matrix: Matrix4) => {
      const pos = mesh.geometry.getAttribute("position");
      for (let k = 0; k < pos.count; k++) out.push(new Vector3().fromBufferAttribute(pos, k).applyMatrix4(matrix));
    };
    for (const mesh of meshes) for (let i = 0; i < mesh.count; i++) each(mesh, (mesh.getMatrixAt(i, m), m.clone()));
    for (const open of [0.5, 1]) for (const book of v.books) each(meshes[1], coverMatrix(book, open, new Matrix4()).premultiply(shift));
    return out;
  }

  for (const [label, v] of [
    ["the real guides", vault],
    ["7 guides", withGuides(7)],
    ["8 guides", withGuides(8)],
  ] as const)
    for (const tier of ["full", "lite"] as const)
      it(`holds every book, plinth, cover (open too), track dash and pool with ${label} on ${tier}`, () => {
        const kit = vaultMeshes(v, tier, false);
        try {
          expect(kit.meshes).toHaveLength(tier === "full" ? 4 : 3);
          const sphere = kit.meshes[0].boundingSphere!;
          for (const mesh of kit.meshes) expect(mesh.boundingSphere).toBe(sphere);
          const pts = points(v, kit.meshes, kit.shift);
          expect(pts.length).toBeGreaterThan(0);
          const far = Math.max(...pts.map((p) => p.distanceTo(sphere.center)));
          expect(far).toBeLessThanOrEqual(sphere.radius + 1e-6);
        } finally {
          kit.dispose();
        }
      });
});
