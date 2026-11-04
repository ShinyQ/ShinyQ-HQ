import { describe, expect, it } from "vitest";
import { createHoloMaterial, HOLO_FS, HOLO_MODE, HOLO_VS } from "@/experience/fx/holoFx";
import { hallAtlas, hallPhoto, hallShots, SHOT_CELL } from "@/experience/floors/lobby/hallContent";
import { contactBeacon, gateOpening, hallLights, statTiles } from "@/experience/floors/lobby/hallGallery";
import { HALL, HALL_LAYOUT, hallPartitions } from "@/experience/floors/lobby/hallLayout";
import { curtainInstance, hallShellInstances, lightInstances, panelInstances, portalInstance, ribLines, ringInstances, SHELL, STAGE_KIND, stageAttributes, yawOfRight } from "@/experience/floors/lobby/hallStage";

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

  it("never names a variable after a GLSL ES 3 keyword (three compiles the holo shader as GLSL 3 on WebGL2)", () => {
    for (const word of ["flat", "smooth", "centroid", "sample", "patch", "input", "output", "filter", "active", "common", "partition"])
      for (const src of [HOLO_VS, HOLO_FS]) expect(src, word).not.toMatch(new RegExp(`\\b(?:bool|float|int|vec[234])\\s+${word}\\b`));
  });

  it("builds one light per gallery light; lite draws them fainter", () => {
    const full = lightInstances(hallLights(), "full");
    const lite = lightInstances(hallLights(), "lite");
    expect(full.length).toBe(lite.length);
    expect(full.filter((l) => l.stage2[0] === 1)).toHaveLength(0);
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

describe("B4 shell (owner decision 2026-11-04)", () => {
  const full = hallShellInstances("full");
  const lite = hallShellInstances("lite");
  const count = (list: typeof full, kind: number) => list.filter((i) => i.stage[0] === kind).length;

  it("spans the hall with a rib every 12 u, between the east stations and off the lead road, alternating cyan and violet", () => {
    const z = ribLines();
    expect(count(full, STAGE_KIND.rib)).toBe(z.length);
    expect(z.length).toBe(7);
    for (let i = 1; i < z.length; i++) expect(z[i] - z[i - 1]).toBe(12);
    expect(z[0]).toBeGreaterThan(HALL.zone.minZ);
    expect(z.at(-1)!).toBeLessThan(HALL.zone.maxZ);
    const centres = (["experience", "wins", "now"] as const).map((n) => (HALL.stations[n].minZ + HALL.stations[n].maxZ) / 2);
    for (const c of [...centres, HALL.lead[0].z]) for (const r of z) expect(Math.abs(r - c), `rib ${r} near ${c}`).toBeGreaterThanOrEqual(3);
    const ribs = full.filter((i) => i.stage[0] === STAGE_KIND.rib);
    expect(ribs[0].color).not.toEqual(ribs[1].color);
    expect(ribs[0].color).toEqual(ribs[2].color);
  });

  it("has no rings in front of the gate (owner, 2026-11-04): one runway from west of the arch into the spine and two packets", () => {
    expect(full.some((i) => i.tag === "gate-ring")).toBe(false);
    expect(full.filter((i) => i.tag === "runway")).toHaveLength(1);
    expect(full.filter((i) => i.tag === "spine")).toHaveLength(2);
    expect(count(full, STAGE_KIND.packet)).toBe(2);
    const runway = full.find((i) => i.tag === "runway")!;
    expect(runway.at[0] + runway.stage[1] / 2).toBeCloseTo(HALL.plaza.x);
    expect(runway.at[0] - runway.stage[1] / 2).toBeLessThan(HALL.gate.x - HALL.gate.depth / 2);
    expect(runway.at[2]).toBe(HALL.lead[0].z);
  });

  it("draws motes on the full tier only, inside the hall, from a fixed seed", () => {
    expect(count(full, STAGE_KIND.mote)).toBe(SHELL.mote.count);
    expect(count(lite, STAGE_KIND.mote)).toBe(0);
    expect(hallShellInstances("full")).toEqual(full);
    for (const m of full.filter((i) => i.stage[0] === STAGE_KIND.mote)) {
      expect(m.at[0]).toBeGreaterThan(HALL.zone.minX);
      expect(m.at[0]).toBeLessThan(HALL.zone.maxX);
      expect(m.at[2]).toBeGreaterThan(HALL.zone.minZ);
      expect(m.at[2]).toBeLessThan(HALL.zone.maxZ);
    }
  });

  it("puts glass on the slab edges and over every west partition, one step under the gate", () => {
    const walls = full.filter((i) => i.tag === "wall");
    const glass = full.filter((i) => i.tag === "partition");
    expect(walls.length).toBe(5);
    expect(glass.length).toBe(3);
    // Above the low partitions, clear glass up to the wall top.
    expect(full.filter((i) => i.tag === "glass")).toHaveLength(3);
    for (const g of glass) expect(g.stage[2]).toBe(HALL.partition.height);
    expect(hallPartitions()).toHaveLength(4);
    // One step under the stations: walls, ribs and the runway stay under full alpha.
    for (const w of [...walls, full.find((i) => i.tag === "rib")!, full.find((i) => i.tag === "runway")!]) expect(w.stage2[3]).toBeLessThan(1);
  });

  it("rings every door pad on the floor in its station's accent (no filled stubs)", () => {
    const halos = full.filter((i) => i.tag === "halo");
    expect(halos).toHaveLength(HALL_LAYOUT.stations.length);
    HALL_LAYOUT.stations.forEach((s, k) => {
      expect(halos[k].at[0]).toBe(s.pad.x);
      expect(halos[k].at[2]).toBe(s.pad.z);
      expect(halos[k].stage[0]).toBe(STAGE_KIND.halo);
    });
  });

  it("drops the two fountains", () => {
    expect(full.some((i) => i.tag === "fountain")).toBe(false);
  });
});
