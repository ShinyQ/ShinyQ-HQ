import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildEngineLayout, ENGINE } from "@/experience/floors/engine/layout";
import { ENGINE_TONES, engineScenery, engineSigns, stationProps, type PanelInstance } from "@/experience/floors/engine/scenery";
import type { Rect } from "@/experience/types";

const layout = buildEngineLayout();
const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" }).engine;
const labels = { title: "Engine Room", subtitle: "How this site was built" };
const b = ENGINE.bounds;
const within = (r: Rect) => r.minX >= b.minX - 1e-9 && r.maxX <= b.maxX + 1e-9 && r.minZ >= b.minZ - 1e-9 && r.maxZ <= b.maxZ + 1e-9;
const box = (p: { x: number; z: number; w: number; d: number }): Rect => ({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2 });
const panelRect = (p: PanelInstance): Rect => (p.flat ? box({ x: p.x, z: p.z, w: p.w, d: p.h }) : Math.abs(Math.sin(p.yaw)) > 0.5 ? box({ x: p.x, z: p.z, w: 0, d: p.w }) : box({ x: p.x, z: p.z, w: p.w, d: 0 }));
const inRect = (p: { x: number; z: number }, r: Rect) => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ;
const inside = (r: Rect, o: Rect) => r.minX >= o.minX - 1e-9 && r.maxX <= o.maxX + 1e-9 && r.minZ >= o.minZ - 1e-9 && r.maxZ <= o.maxZ + 1e-9;

describe("B1 Engine Room scenery", () => {
  for (const tier of ["full", "lite"] as const) {
    const s = engineScenery(layout, tier);
    it(`keeps every solid, pipe, LED and screen on the slab (${tier})`, () => {
      for (const solid of s.solids) expect(within(box(solid)), JSON.stringify(solid)).toBe(true);
      for (const f of s.flows) expect(within(box(f)), JSON.stringify(f)).toBe(true);
      for (const p of s.panels) expect(within(panelRect(p)), JSON.stringify(p)).toBe(true);
    });

    it(`lights all seven station bays: a front strip each and screens in every bay but the gates (${tier})`, () => {
      for (const bay of layout.bays) {
        const screens = s.panels.filter((p) => inRect(p, bay.rect));
        const strips = s.flows.filter((f) => f.y < 0.1 && inRect(f, bay.rect));
        expect(strips.length, bay.id).toBe(1);
        if (bay.id !== "gates") expect(screens.length, bay.id).toBeGreaterThan(0);
      }
    });

    it(`keeps the same draws: merged solids, one flow and one panel instancing, no other kind (${tier})`, () => {
      expect(Object.keys(s).sort()).toEqual(["flows", "panels", "solids"]);
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

  it("stands the workbench props inside the moved workbench, its wall screen facing the room (south)", () => {
    const w = layout.workbench;
    const s = engineScenery(layout, "full");
    const bench = s.solids.filter((x) => inRect(x, w));
    expect(bench.length).toBeGreaterThanOrEqual(2);
    for (const solid of bench) expect(inside(box(solid), w), JSON.stringify(solid)).toBe(true);
    const screens = s.panels.filter((p) => inRect(p, w));
    expect(screens).toHaveLength(1);
    // Forward is (sin yaw, cos yaw): the screen on the north wall looks south (+z), into the hall.
    expect(Math.sin(screens[0].yaw)).toBeCloseTo(0);
    expect(Math.cos(screens[0].yaw)).toBeCloseTo(1);
    expect(inside(panelRect(screens[0]), w)).toBe(true);
  });

  it("keeps the reactor footprint free of pipes, trays and screens until the core draws there", () => {
    const s = engineScenery(layout, "full");
    const hit = (r: Rect) => r.minX < layout.reactor.maxX && layout.reactor.minX < r.maxX && r.minZ < layout.reactor.maxZ && layout.reactor.minZ < r.maxZ;
    for (const f of s.flows) expect(hit(box(f)), JSON.stringify(f)).toBe(false);
    for (const p of s.panels) expect(hit(panelRect(p)), JSON.stringify(p)).toBe(false);
  });

  it("names every bay on an upright amber floating sign and titles the workbench; no Coming soon plate", () => {
    const signs = engineSigns(layout, data, labels);
    expect(signs).toHaveLength(layout.bays.length + 2);
    for (const bay of layout.bays) {
      const title = data.bays.find((x) => x.id === bay.id)!.title;
      expect(signs.find((sg) => sg.text === title)?.color, bay.id).toBe(ENGINE_TONES.amber);
    }
    expect(signs.some((sg) => /coming soon|segera hadir/i.test(sg.text))).toBe(false);
    expect(signs.some((sg) => sg.text === "ENGINE ROOM")).toBe(true);
    for (const sg of signs) expect(sg.tilt, sg.text).toBeUndefined();
    for (const sg of signs.slice(-2)) expect(inRect(sg, layout.workbench), sg.text).toBe(true);
  });
});

describe("B1 station props", () => {
  const WALL = 0.8;
  const SIDE = 0.3;
  const bayOf = (id: string) => layout.bays.find((x) => x.id === id)!;
  /** Inside the bay's walls: between its side walls, between its back wall and 0.3 u behind its open front (the strip and the door pad stay clear). */
  const interior = (id: string): Rect => {
    const bay = bayOf(id);
    const north = bay.side === "north";
    return { minX: bay.rect.minX + SIDE, maxX: bay.rect.maxX - SIDE, minZ: north ? bay.rect.minZ + WALL : bay.front + 0.3, maxZ: north ? bay.front - 0.3 : bay.rect.maxZ - WALL };
  };

  for (const bay of layout.bays) {
    it(`keeps the ${bay.id} props inside the bay's walls and clear of its front`, () => {
      const props = stationProps(bay, 8);
      const room = interior(bay.id);
      for (const solid of props.solids) {
        expect(inside(box(solid), room), JSON.stringify(solid)).toBe(true);
        expect(solid.y + solid.h, JSON.stringify(solid)).toBeLessThanOrEqual(ENGINE.bay.h);
      }
      for (const f of props.flows) expect(inside(box(f), room), JSON.stringify(f)).toBe(true);
      for (const p of props.panels) expect(inside(panelRect(p), room), JSON.stringify(p)).toBe(true);
      expect(inRect(bay.pad, bay.rect), bay.id).toBe(false);
    });
  }

  it("gives Rover's Brain a server column of two boxes beside six cyan chunk screens and one violet answer screen", () => {
    const props = stationProps(bayOf("brain"), 8);
    expect(props.solids.filter((x) => x.w === 1.2 && x.h === 4 && x.d === 1.2)).toHaveLength(2);
    expect(props.panels.filter((p) => p.color === ENGINE_TONES.cyan)).toHaveLength(6);
    expect(props.panels.filter((p) => p.color === ENGINE_TONES.violet)).toHaveLength(1);
    const columns = props.solids.map(box);
    for (const p of props.panels) for (const c of columns) expect(p.x - p.w / 2 >= c.maxX || p.x + p.w / 2 <= c.minX, JSON.stringify(p)).toBe(true);
  });

  it("gives Rejected Designs a low scrap rack with four tilted dim panels and one amber panel", () => {
    const props = stationProps(bayOf("rejected"), 8);
    expect(props.solids).toHaveLength(1);
    expect(props.solids[0].h).toBeLessThan(1);
    const dim = props.panels.filter((p) => p.color === ENGINE_TONES.dim);
    expect(dim).toHaveLength(4);
    for (const p of dim) expect(Math.abs(p.roll ?? 0), JSON.stringify(p)).toBeGreaterThan(0.05);
    expect(props.panels.filter((p) => p.color === ENGINE_TONES.amber)).toHaveLength(1);
    for (const p of props.panels) expect(p.y - p.h / 2, JSON.stringify(p)).toBeGreaterThan(props.solids[0].h - 0.3);
  });
});
