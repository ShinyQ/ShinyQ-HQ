import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { prepareFade, setFadeOpacity } from "@/experience/rover/fade";

describe("rover body fade", () => {
  it("turns on hashed alpha once on every body material and keeps them opaque", () => {
    const root = new Group();
    const shared = new MeshStandardMaterial();
    root.add(new Mesh(new BoxGeometry(), shared), new Mesh(new BoxGeometry(), shared));
    const inner = new Group();
    const basic = new MeshBasicMaterial();
    inner.add(new InstancedMesh(new BoxGeometry(), basic, 6));
    root.add(inner);
    const materials = prepareFade(root);
    expect(materials).toHaveLength(2);
    for (const m of materials) {
      expect(m.alphaHash).toBe(true);
      expect(m.transparent).toBe(false);
      expect(m.opacity).toBe(1);
    }
    const version = shared.version;
    prepareFade(root);
    expect(shared.version).toBe(version);
  });

  it("changes the opacity without recompiling", () => {
    const m = new MeshStandardMaterial();
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), m));
    const materials = prepareFade(root);
    const version = m.version;
    setFadeOpacity(materials, 0.4);
    expect(m.opacity).toBe(0.4);
    expect(m.version).toBe(version);
  });
});
