import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildEngineLayout, ENGINE } from "@/experience/floors/engine/layout";
import { ENGINE_TONES, engineScenery, engineSigns, type PanelInstance } from "@/experience/floors/engine/scenery";
import type { Rect } from "@/experience/types";

const layout = buildEngineLayout();
const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" }).engine;
const labels = { title: "Engine Room", subtitle: "How this site was built", soon: "Coming soon" };
const b = ENGINE.bounds;
const within = (r: Rect) => r.minX >= b.minX - 1e-9 && r.maxX <= b.maxX + 1e-9 && r.minZ >= b.minZ - 1e-9 && r.maxZ <= b.maxZ + 1e-9;
const box = (p: { x: number; z: number; w: number; d: number }): Rect => ({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2 });
const panelRect = (p: PanelInstance): Rect => (p.flat ? box({ x: p.x, z: p.z, w: p.w, d: p.h }) : Math.abs(Math.sin(p.yaw)) > 0.5 ? box({ x: p.x, z: p.z, w: 0, d: p.w }) : box({ x: p.x, z: p.z, w: p.w, d: 0 }));
const inRect = (p: { x: number; z: number }, r: Rect) => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ;

describe("B1 Engine Room scenery", () => {
  for (const tier of ["full", "lite"] as const) {
    const s = engineScenery(layout, tier);
    it(`keeps every solid, pipe, LED and screen on the slab (${tier})`, () => {
      for (const solid of s.solids) expect(within(box(solid)), JSON.stringify(solid)).toBe(true);
      for (const f of s.flows) expect(within(box(f)), JSON.stringify(f)).toBe(true);
      for (const p of s.panels) expect(within(panelRect(p)), JSON.stringify(p)).toBe(true);
    });

    it(`lights the five station bays and leaves bays 6 and 7 dark (${tier})`, () => {
      for (const bay of layout.bays) {
        const screens = s.panels.filter((p) => inRect(p, bay.rect));
        const strips = s.flows.filter((f) => f.y < 0.1 && inRect(f, bay.rect));
        expect(strips.length, bay.id).toBe(bay.lit ? 1 : 0);
        if (!bay.lit) expect(screens, bay.id).toEqual([]);
        if (bay.lit && bay.id !== "gates") expect(screens.length, bay.id).toBeGreaterThan(0);
      }
    });
  }

  it("draws half the rack LEDs on the lite tier and stays small enough to instance", () => {
    const leds = (tier: "full" | "lite") => engineScenery(layout, tier).flows.filter((f) => f.h === 0.08).length;
    expect(leds("full")).toBe(2 * leds("lite"));
    expect(leds("lite")).toBeGreaterThan(0);
    const full = engineScenery(layout, "full");
    expect(full.solids.length).toBeLessThan(200);
    expect(full.flows.length).toBeLessThan(250);
    expect(full.panels.length).toBeLessThan(40);
  });

  it("names every bay on an upright floating sign, adds Coming soon to the dark bays and titles the workbench", () => {
    const signs = engineSigns(layout, data, labels);
    expect(signs).toHaveLength(layout.bays.length + 2 + 2);
    for (const bay of layout.bays) {
      const title = data.bays.find((x) => x.id === bay.id)!.title;
      expect(signs.find((sg) => sg.text === title)?.color, bay.id).toBe(bay.lit ? ENGINE_TONES.amber : ENGINE_TONES.dim);
    }
    expect(signs.filter((sg) => sg.text === labels.soon)).toHaveLength(2);
    expect(signs.some((sg) => sg.text === "ENGINE ROOM")).toBe(true);
    for (const sg of signs) expect(sg.tilt, sg.text).toBeUndefined();
  });
});
