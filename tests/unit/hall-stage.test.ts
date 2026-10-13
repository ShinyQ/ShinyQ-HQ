import { describe, expect, it } from "vitest";
import { createHoloMaterial, HOLO_FS, HOLO_MODE, HOLO_VS } from "@/experience/fx/holoFx";
import { hallAtlas, hallPhoto, hallShots, SHOT_CELL } from "@/experience/floors/lobby/hallContent";
import { contactBeacon, FOUNTAIN, gateOpening, hallLights, statTiles } from "@/experience/floors/lobby/hallGallery";
import { curtainInstance, lightInstances, panelInstances, portalInstance, ringInstances, STAGE_KIND, stageAttributes, yawOfRight } from "@/experience/floors/lobby/hallStage";

describe("Highlights Hall stage effects on the shared holo program", () => {
  it("use the holo shader source (one program with the floating signs and the other floors)", () => {
    const stage = createHoloMaterial({ mode: HOLO_MODE.stage, additive: true });
    const plate = createHoloMaterial({ mode: HOLO_MODE.plate });
    expect(stage.vertexShader).toBe(plate.vertexShader);
    expect(stage.fragmentShader).toBe(plate.fragmentShader);
    expect(stage.side).toBe(plate.side);
    expect(stage.transparent).toBe(plate.transparent);
    expect(stage.toneMapped).toBe(plate.toneMapped);
    // Only the stage mode reads the stage attributes (other holo meshes never set them).
    expect(HOLO_VS).toContain("if (uMode == 9)");
    expect(HOLO_VS.indexOf("aStage.x")).toBeGreaterThan(HOLO_VS.indexOf("if (uMode == 9)"));
    expect(HOLO_FS).toContain("uniform sampler2D uMap");
  });

  it("builds one light per gallery light; lite has fewer fountain beams and draws them fainter", () => {
    const full = lightInstances(hallLights("full"), "full");
    const lite = lightInstances(hallLights("lite"), "lite");
    expect(full.length).toBeGreaterThan(lite.length);
    const spin = full.filter((l) => l.stage2[0] === 1);
    expect(spin).toHaveLength(FOUNTAIN.beams.full);
    for (const l of full) expect([STAGE_KIND.beam, STAGE_KIND.cone, STAGE_KIND.pool]).toContain(l.stage[0]);
    const fullPool = full.find((l) => l.stage[0] === STAGE_KIND.pool)!;
    const litePool = lite.find((l) => l.stage[0] === STAGE_KIND.pool)!;
    expect(litePool.stage2[3]).toBeCloseTo(fullPool.stage2[3] * 0.8);
  });

  it("turns planes so their +x runs along the face's right", () => {
    for (const right of [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0.6, z: -0.8 }]) {
      const yaw = yawOfRight(right);
      expect(Math.cos(yaw)).toBeCloseTo(right.x);
      expect(-Math.sin(yaw)).toBeCloseTo(right.z);
    }
  });

  it("puts tiles, screenshots and the portrait in one panel draw with their atlas cells", () => {
    const thumbs = ["a", "b", "c"];
    const atlas = hallAtlas(thumbs, SHOT_CELL.full);
    const panels = panelInstances(statTiles(), hallShots(3), hallPhoto(3), atlas.cells, "full");
    expect(panels.map((p) => p.stage[0])).toEqual([...Array(4).fill(STAGE_KIND.tile), ...Array(3).fill(STAGE_KIND.image), STAGE_KIND.portrait]);
    expect(panels[4].uv).toEqual([0, 0, 480 / 1740, 1]);
    expect(panels[7].uv).toEqual([1440 / 1740, 0, 1, 1]);
    const attrs = stageAttributes(panels);
    expect(attrs.aStage).toHaveLength(panels.length * 4);
    expect(attrs.color).toHaveLength(panels.length * 3);
  });

  it("fills the gateway opening with the curtain and pulses rings from the beacon", () => {
    const o = gateOpening();
    const c = curtainInstance("lite");
    expect(c.stage[0]).toBe(STAGE_KIND.curtain);
    expect(c.stage[1]).toBeCloseTo(o.maxZ - o.minZ);
    expect(c.stage[2]).toBeCloseTo(o.top);
    expect(portalInstance("full").stage[0]).toBe(STAGE_KIND.portal);
    const rings = ringInstances(contactBeacon().pulses, "#60a5fa", "full");
    expect(rings.map((r) => r.stage[0])).toEqual(rings.map(() => STAGE_KIND.ring));
  });
});
