import { describe, expect, it } from "vitest";
import { buildCareerData } from "@/content/experience";
import { getPublicRepos, getSideProjects } from "@/content/load";
import { repoRoom, sideProjectRoom, WORKSHOP_ROOM } from "@/content/workshop";
import { zoneAt } from "@/experience/camera/orbit";
import { buildCareerRoad, careerLayoutInput } from "@/experience/floors/career/layout";
import { benchGroups, WORKSHOP } from "@/experience/floors/career/workshopLayout";
import { distanceToRect } from "@/experience/nav/collision";
import { buildNavGrid, findPath } from "@/experience/nav/navgrid";
import { PAD } from "@/experience/nav/pads";
import { onNetwork } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import { rectGap } from "@/experience/nav/space";
import type { PadTrigger, Rect, Vec2 } from "@/experience/types";
import { expectSpaceRules } from "../helpers/space";

const c = buildCareerRoad(careerLayoutInput(buildCareerData("en")));
const w = c.workshop;
const grid = buildNavGrid(c, 1);
const last = c.years.at(-1)!.plaza;
const lastEnd = last.center.x + last.w / 2;
const plazaRect = (p: { center: Vec2; w: number; d: number }): Rect => ({ minX: p.center.x - p.w / 2, maxX: p.center.x + p.w / 2, minZ: p.center.z - p.d / 2, maxZ: p.center.z + p.d / 2 });
const within = (p: Vec2, r: Rect) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
/** F1's Return pad, placed where the Workshop wants it (beside the console). */
const returnPad: PadTrigger = { id: "return:L2", kind: "elevator", at: w.returnPad, face: 0 };

describe("L2 Workshop: forecourt", () => {
  it("follows the last year plaza one link later, on the road's center line", () => {
    expect(c.forecourt.center.x - c.forecourt.w / 2).toBe(lastEnd + 10);
    expect(c.forecourt.center.z).toBe(0);
    expect([c.forecourt.w, c.forecourt.d]).toEqual([WORKSHOP.forecourt.w, WORKSHOP.forecourt.d]);
    // The Workshop plaza starts where the forecourt ends: no dead strip between them.
    expect(c.annex.center.x - c.annex.w / 2).toBe(c.forecourt.center.x + c.forecourt.w / 2);
  });

  it("docks the time console on the forecourt's north edge, its stop on the forecourt clear of it", () => {
    const fc = plazaRect(c.forecourt);
    expect(w.console.rect.maxZ).toBeLessThan(fc.minZ);
    expect(w.console.center.x).toBe(c.forecourt.center.x);
    expect(within(w.console.stop, fc)).toBe(true);
    expect(distanceToRect(w.console.stop, w.console.rect)).toBeGreaterThan(1.5);
  });

  it("keeps the Return pad beside the console, off the road, clear of the console stop", () => {
    expect(within(w.returnPad, plazaRect(c.forecourt))).toBe(true);
    expect(Math.abs(w.returnPad.z)).toBeGreaterThan(4 + PAD.radius);
    expect(Math.hypot(w.returnPad.x - w.console.stop.x, w.returnPad.z - w.console.stop.z)).toBeGreaterThan(PAD.radius + 2);
    expect(Math.hypot(w.returnPad.x - w.console.center.x, w.returnPad.z - w.console.center.z)).toBeLessThan(8);
  });
});

describe("L2 Workshop: gateway, benches, skyline", () => {
  it("stands the gateway over the road where the Workshop starts, posts clear of the road", () => {
    expect(w.gateway.x).toBe(c.annex.center.x - c.annex.w / 2);
    for (const p of w.gateway.posts) expect(Math.abs(p.z)).toBeGreaterThan(4 + WORKSHOP.gateway.post / 2);
    expect(onNetwork(c.network, w.gateway.stop)).toBe(true);
  });

  it("gives every side project its own bench on the south edge, in two groups of touching benches", () => {
    expect(w.benches.map((b) => b.id)).toEqual(getSideProjects().map((p) => p.id));
    expect(benchGroups(w.benches)).toHaveLength(2);
    const south = plazaRect(c.annex).maxZ;
    for (const b of w.benches) {
      expect(b.rect.minZ).toBeGreaterThan(south);
      expect(b.rect.maxX - b.rect.minX).toBeCloseTo(WORKSHOP.bench.w);
      expect(within(b.stop, plazaRect(c.annex))).toBe(true);
      expect(b.stop.x).toBe(b.center.x);
    }
    // 6 u of floor between the last bench and the window end of the slab.
    expect(c.windowX - Math.max(...w.benches.map((b) => b.rect.maxX))).toBeGreaterThanOrEqual(6);
  });

  it("docks the 20 repo skyline on the north edge, centered, with a stop in front of every bar", () => {
    expect(w.skyline.bars).toHaveLength(getPublicRepos().length);
    expect(w.skyline.plinth.maxZ).toBeLessThan(plazaRect(c.annex).minZ);
    expect((w.skyline.plinth.minX + w.skyline.plinth.maxX) / 2).toBeCloseTo(c.annex.center.x);
    w.skyline.bars.forEach((bar, i) => {
      expect(within(bar, w.skyline.plinth)).toBe(true);
      const stop = w.skyline.stops[i];
      expect(stop.x).toBe(bar.x);
      expect(within(stop, plazaRect(c.annex))).toBe(true);
    });
    expect(c.tall.find((t) => t.minX === w.skyline.plinth.minX)!.h).toBeGreaterThanOrEqual(w.skyline.top);
  });

  it("keeps every stop clear of every obstacle by more than the rover radius", () => {
    const stops = [w.console.stop, w.gateway.stop, ...w.benches.map((b) => b.stop), ...w.skyline.stops];
    for (const s of stops) for (const o of c.obstacles) expect(distanceToRect(s, o)).toBeGreaterThan(1.2);
  });

  it("ends the road on the Horizon deck, 4 u before the window, with open floor around it", () => {
    const end = c.network.roads[0].points.at(-1)!;
    expect(end).toEqual({ x: c.windowX - WORKSHOP.deck, z: 0 });
    for (const o of c.obstacles) expect(distanceToRect(end, o)).toBeGreaterThan(6);
  });

  it("maps every Workshop room to its stop", () => {
    expect(c.roomStops[WORKSHOP_ROOM]).toEqual(w.gateway.stop);
    for (const b of w.benches) expect(c.roomStops[sideProjectRoom(b.id)]).toEqual(b.stop);
    w.skyline.bars.forEach((bar, i) => expect(c.roomStops[repoRoom(bar.slug)]).toEqual(w.skyline.stops[i]));
  });
});

describe("L2 Workshop: routes and camera", () => {
  it("passes the space rules with the real content, the Return pad included", () => {
    expectSpaceRules({ bounds: c.bounds, obstacles: c.obstacles, doors: c.doors, network: c.network, start: c.approach, pads: [...c.pads, returnPad] });
  });

  it("keeps the docked pieces 6 u apart (no dead strips or pinch points)", () => {
    const docked = [w.console.rect, ...w.gateway.rects, ...benchGroups(w.benches), w.skyline.plinth];
    for (const a of docked) for (const b of docked) if (a !== b) expect(rectGap(a, b)).toBeGreaterThanOrEqual(6 - 1e-9);
  });

  it("reaches every stop and the Return pad from the elevator, along the road", () => {
    const stops = [w.console.stop, w.returnPad, w.gateway.stop, ...w.benches.map((b) => b.stop), ...w.skyline.stops];
    for (const s of stops) {
      const path = roadRoute(c.network, grid, c.approach, s);
      expect(path).not.toBeNull();
      expect(Math.hypot(path!.at(-1)!.x - s.x, path!.at(-1)!.z - s.z)).toBeLessThanOrEqual(1);
      expect(findPath(grid, w.console.stop, s)).not.toBeNull();
    }
  });

  it("turns the camera at the console and on the Horizon deck", () => {
    expect(zoneAt("L2", w.console.stop, c.viewZones)?.id).toBe("L2:time-console");
    const deck = zoneAt("L2", { x: w.roadEnd, z: 0 }, c.viewZones);
    expect(deck?.id).toBe("L2:horizon-deck");
    // Camera west of the rover, looking east through the window.
    expect(deck?.yaw).toBeCloseTo(-Math.PI / 2);
    expect(zoneAt("L2", c.annex.center, c.viewZones)).toBeNull();
    expect(zoneAt("L2", w.returnPad, c.viewZones)).toBeNull();
  });
});
