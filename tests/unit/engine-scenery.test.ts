import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildEngineLayout, ENGINE } from "@/experience/floors/engine/layout";
import { CORE_FX, coreSolids, PLINTH_STEPS } from "@/experience/floors/engine/reactorFx";
import { END_MASK_H, endMask, engineDetail, ENGINE_TONES, engineScenery, engineSigns, PLATE, stationProps, VENT, type PanelInstance, type PlateInstance } from "@/experience/floors/engine/scenery";
import { signPlate } from "@/experience/fx/signLayout";
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
      for (const solid of [...s.solids, ...s.masks]) expect(within(box(solid)), JSON.stringify(solid)).toBe(true);
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

    it(`keeps the same draws: merged solids, one flow, one panel and one plate instancing, the depth mask, no other kind (${tier})`, () => {
      expect(Object.keys(s).sort()).toEqual(["flows", "masks", "panels", "plates", "solids"]);
    });
  }

  it("draws half the rack LEDs on the lite tier and stays small enough to instance", () => {
    const leds = (tier: "full" | "lite") => engineScenery(layout, tier).flows.filter((f) => f.h === 0.08).length;
    expect(leds("full")).toBe(2 * leds("lite"));
    expect(leds("lite")).toBeGreaterThan(0);
    const full = engineScenery(layout, "full");
    expect(full.solids.length).toBeLessThan(200);
    expect(full.flows.length).toBeLessThan(300);
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

  it("raises the reactor core's solids in the merged mesh: inside the reactor rect, topping out at the core height under the ceiling", () => {
    for (const tier of ["full", "lite"] as const) {
      const s = engineScenery(layout, tier);
      const core = s.solids.filter((x) => inRect(x, layout.reactor));
      expect(core).toEqual(coreSolids());
      for (const solid of core) expect(inside(box(solid), layout.reactor), JSON.stringify(solid)).toBe(true);
      expect(Math.max(...core.map((x) => x.y + x.h))).toBeCloseTo(ENGINE.reactor.h);
      expect(ENGINE.reactor.h).toBeLessThan(ENGINE.ceiling);
      // The energy column is light, open to the top: no solid stands on the plinth's center.
      expect(core.some((x) => x.x === ENGINE.reactor.x && x.z === ENGINE.reactor.z && x.y >= CORE_FX.plinth)).toBe(false);
    }
  });

  it("titles the reactor and shows its counter plate only with numbers, in the same sign set", () => {
    const reactor = { title: "Reactor", visits: (n: string) => `${n} visits since launch`, asks: (n: string) => `${n} questions to Rover` };
    const base = engineSigns(layout, data, labels);
    const titled = engineSigns(layout, data, { ...labels, reactor });
    expect(titled).toHaveLength(base.length + 1);
    const title = titled.find((sg) => sg.text === "REACTOR")!;
    // On the platform's front (west, aisle) edge: its plane stands west of the energy column, outside its footprint
    // (the crown is the column's widest part), so the column never runs through the word, not even in a flash.
    const titlePlate = signPlate(title);
    expect(title.x).toBeLessThan(ENGINE.reactor.x - CORE_FX.crown.r - 2);
    expect(title.x).toBeLessThan(layout.reactor.minX + 1);
    expect(title.x).toBeGreaterThan(ENGINE.reactorDoor.x);
    expect(Math.abs(title.z - ENGINE.reactor.z) + titlePlate.w / 2).toBeLessThan(ENGINE.reactor.r);
    expect(title.y - titlePlate.h / 2).toBeGreaterThan(CORE_FX.plinth);
    const both = engineSigns(layout, data, { ...labels, reactor }, { visits: "1,234", asks: "56" });
    expect(both).toHaveLength(base.length + 2);
    const plate = both.at(-1)!;
    expect(plate.text).toBe("1,234 visits since launch\n56 questions to Rover");
    // In front of the core's west face (toward the aisle), below the lowest ring, right under the title.
    expect(plate.x).toBeLessThan(layout.reactor.minX + 1);
    expect(plate.x).toBeGreaterThan(ENGINE.reactorDoor.x);
    expect(plate.y).toBeLessThan(CORE_FX.rings[0].y);
    expect(plate.x).toBe(title.x);
    expect(plate.y + signPlate(plate).h / 2).toBeLessThan(title.y - titlePlate.h / 2);
    expect(engineSigns(layout, data, { ...labels, reactor }, { visits: null, asks: "56" }).at(-1)!.text).toBe("56 questions to Rover");
    expect(engineSigns(layout, data, { ...labels, reactor }, { visits: null, asks: null })).toHaveLength(base.length + 1);
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

  it("hides the slab outline's far east edge behind a low depth-only mask at the floor's end, clear of every road and the core", () => {
    const mask = endMask(layout);
    expect(engineScenery(layout, "full").masks).toEqual([mask]);
    const r = box(mask);
    // The outline's top edge runs along x = bounds.maxX at y 0, the full width: the curb covers it from the west.
    expect(r.maxX).toBeCloseTo(b.maxX);
    expect(r.minX).toBeLessThan(b.maxX);
    expect(r.minZ).toBeCloseTo(b.minZ);
    expect(r.maxZ).toBeCloseTo(b.maxZ);
    expect(mask.y).toBe(0);
    expect(mask.h).toBe(END_MASK_H);
    expect(END_MASK_H).toBeLessThan(ENGINE.reactor.h);
    expect(r.minX).toBeGreaterThan(layout.reactor.maxX + 4);
    for (const o of layout.floor.obstacles) expect(r.minX >= o.maxX, JSON.stringify(o)).toBe(true);
  });
});

describe("B1 lit-seam plates", () => {
  const s = engineScenery(layout, "full");
  const flat = s.plates.filter((p) => p.flat);
  const upright = s.plates.filter((p) => !p.flat);
  const plateRect = (p: PlateInstance) => panelRect(p as PanelInstance);
  const overlaps = (a: Rect, r: Rect) => a.minX < r.maxX - 1e-9 && r.minX < a.maxX - 1e-9 && a.minZ < r.maxZ - 1e-9 && r.minZ < a.maxZ - 1e-9;
  const spurRect = (sp: { from: { x: number; z: number }; to: { x: number; z: number }; width?: number }): Rect => {
    const half = (sp.width ?? ENGINE.spurWidth) / 2;
    return { minX: Math.min(sp.from.x, sp.to.x) - half, maxX: Math.max(sp.from.x, sp.to.x) + half, minZ: Math.min(sp.from.z, sp.to.z) - half, maxZ: Math.max(sp.from.z, sp.to.z) + half };
  };

  it("draws the same plates on both tiers, all on the slab, in two seam tones", () => {
    expect(engineScenery(layout, "lite").plates).toEqual(s.plates);
    for (const p of s.plates) expect(within(plateRect(p)), JSON.stringify(p)).toBe(true);
    expect(new Set(s.plates.map((p) => p.color))).toEqual(new Set([ENGINE_TONES.tray, ENGINE_TONES.data]));
    expect(s.plates.length).toBeGreaterThan(200);
    expect(s.plates.length).toBeLessThan(400);
  });

  it("clads every bay: 8 back-wall and 4 + 4 side-wall panels behind the screens, and 6 floor plates", () => {
    for (const bay of layout.bays) {
      const walls = upright.filter((p) => inRect(p, bay.rect));
      expect(walls, bay.id).toHaveLength(16);
      const back = walls.filter((p) => Math.abs(Math.sin(p.yaw)) < 0.5);
      expect(back, bay.id).toHaveLength(8);
      for (const p of walls) {
        expect(p.y - p.h / 2, JSON.stringify(p)).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y + p.h / 2, JSON.stringify(p)).toBeLessThanOrEqual(ENGINE.bay.h + 1e-9);
      }
      // Every back-wall screen of the bay stands in front of the back-wall panels (farther from the wall).
      const o = bay.side === "north" ? 1 : -1;
      const backZ = back[0].z;
      for (const screen of s.panels.filter((p) => !p.flat && inRect(p, bay.rect) && Math.abs(Math.sin(p.yaw)) < 0.5)) expect(o * (screen.z - backZ), JSON.stringify(screen)).toBeGreaterThan(0);
      const floor = flat.filter((p) => inRect(p, bay.rect));
      expect(floor, bay.id).toHaveLength(6);
      for (const p of floor) expect(p.y).toBe(PLATE.bayFloor);
    }
  });

  it("lays the deck beside the aisle, never over the aisle, a spur, a door pad, the call pad, the Return pad or the workbench", () => {
    const deck = flat.filter((p) => p.y === PLATE.lift && !layout.bays.some((b) => inRect(p, b.rect)));
    expect(deck.length).toBeGreaterThan(60);
    const aisle: Rect = { minX: ENGINE.approach.x, maxX: ENGINE.aisle.endX, minZ: -ENGINE.aisle.width / 2, maxZ: ENGINE.aisle.width / 2 };
    const pads = (layout.floor.doors ?? []).map((d) => box({ x: d.at.x, z: d.at.z, w: 2, d: 2 }));
    const ret = box({ x: ENGINE.returnPad.x, z: ENGINE.returnPad.z, w: 3, d: 3 });
    const blocked = [aisle, ...layout.network.spurs.map(spurRect), ...pads, layout.callPad, ret, layout.workbench];
    for (const p of deck) for (const r of blocked) expect(overlaps(plateRect(p), r), `${JSON.stringify(p)} over ${JSON.stringify(r)}`).toBe(false);
  });

  it("clads the reactor plinth's two steps and rings it on the hall floor, off the reactor spur", () => {
    const R = layout.reactor;
    const core = s.plates.filter((p) => inRect(p, { minX: R.minX - 1e-6, maxX: R.maxX + 1e-6, minZ: R.minZ - 1e-6, maxZ: R.maxZ + 1e-6 }));
    expect(core.every((p) => p.color === ENGINE_TONES.data)).toBe(true);
    expect(core.filter((p) => !p.flat)).toHaveLength(24);
    const ring = core.filter((p) => p.flat);
    expect(ring).toHaveLength(18);
    const [bottom] = PLINTH_STEPS;
    const plinth = box({ x: ENGINE.reactor.x, z: ENGINE.reactor.z, w: bottom, d: bottom });
    for (const p of ring) {
      expect(overlaps(plateRect(p), plinth), JSON.stringify(p)).toBe(false);
      expect(inside(plateRect(p), R), JSON.stringify(p)).toBe(true);
    }
    expect(PLINTH_STEPS).toEqual([coreSolids()[0].w, coreSolids()[1].w]);
  });
});

describe("B1 vents", () => {
  const slats = (tier: "full" | "lite") => engineScenery(layout, tier).flows.filter((f) => f.h === VENT.h);

  it("hangs one grille on each side wall of every bay, half the slats on lite", () => {
    expect(engineDetail("full").slats).toBe(2 * engineDetail("lite").slats);
    for (const tier of ["full", "lite"] as const) {
      for (const bay of layout.bays) expect(slats(tier).filter((f) => inRect(f, bay.rect)), `${bay.id} ${tier}`).toHaveLength(2 * engineDetail(tier).slats);
    }
  });

  it("keeps every slat dim cyan, mid-height on its wall's inner face, under the station sign and clear of the rack LEDs", () => {
    for (const f of slats("full")) {
      expect(f.color).toBe(ENGINE_TONES.data);
      expect(f.y).toBeGreaterThanOrEqual(VENT.y - 1e-9);
      expect(f.y + f.h / 2).toBeLessThan(ENGINE.bay.h);
      const bay = layout.bays.find((b) => inRect(f, b.rect))!;
      const face = Math.min(Math.abs(f.x - (bay.rect.minX + 0.3)), Math.abs(f.x - (bay.rect.maxX - 0.3)));
      expect(face).toBeCloseTo(VENT.off);
      expect(f.h).not.toBe(0.08);
    }
  });
});
