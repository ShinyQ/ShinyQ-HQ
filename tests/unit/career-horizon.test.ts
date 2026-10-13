import { describe, expect, it } from "vitest";
import { buildCareerData } from "@/content/experience";
import { buildCareerRoad, careerLayoutInput } from "@/experience/floors/career/layout";
import { buildHorizon, HORIZON, stripRect } from "@/experience/floors/career/horizonLayout";
import { distanceToRect } from "@/experience/nav/collision";
import { PAD } from "@/experience/nav/pads";
import { onNetwork } from "@/experience/nav/road";
import { rectGap } from "@/experience/nav/space";
import type { Rect } from "@/experience/types";

const career = buildCareerRoad(careerLayoutInput(buildCareerData("en")));
const full = buildHorizon(career);
const lite = buildHorizon(career, true);
const { bounds } = career;
const inside = (r: Rect, b: Rect) => r.minX >= b.minX && r.maxX <= b.maxX && r.minZ >= b.minZ && r.maxZ <= b.maxZ;
const benchRects: Rect[] = career.workshop.benches.map((b) => b.rect);
const docked: Rect[] = [career.workshop.console.rect, career.workshop.skyline.plinth, ...career.workshop.gateway.rects];
const roomRects: Rect[] = career.rooms.map((r) => ({ minX: r.center.x - r.w / 2, maxX: r.center.x + r.w / 2, minZ: r.center.z - r.d / 2, maxZ: r.center.z + r.d / 2 }));

describe("L2 Horizon (east end)", () => {
  it("runs the light bridge off the slab from the annex window", () => {
    expect(full.bridge.minX).toBe(career.windowX);
    expect(full.bridge.maxX - full.bridge.minX).toBe(HORIZON.bridge.length);
    expect(career.windowX).toBe(bounds.maxX);
    expect((full.bridge.minZ + full.bridge.maxZ) / 2).toBe(0);
  });

  it("stands the skyline off the slab, far below and beyond the tower, fewer towers on lite", () => {
    expect(full.towers).toHaveLength(HORIZON.skyline.count);
    expect(lite.towers).toHaveLength(HORIZON.skyline.liteCount);
    for (const t of full.towers) {
      const r: Rect = { minX: t.x - t.w / 2, maxX: t.x + t.w / 2, minZ: t.z - t.d / 2, maxZ: t.z + t.d / 2 };
      // Never over the L2 slab: at least 60 u from it.
      expect(rectGap(r, bounds)).toBeGreaterThan(60);
      expect(t.top).toBeGreaterThan(HORIZON.skyline.base);
      // Spires rise a little above the floor at most (the skyline reads on the horizon, not as a wall).
      expect(t.top).toBeLessThanOrEqual(20);
    }
    // Some spires reach above the floor, so the skyline reads on the horizon from the annex.
    expect(full.towers.some((t) => t.top > 5)).toBe(true);
    // Deterministic: the same skyline every load.
    expect(buildHorizon(career).towers).toEqual(full.towers);
  });

  it("puts the sunrise glow far beyond the skyline, facing the tower", () => {
    expect(full.glow.x - career.windowX).toBeGreaterThan(HORIZON.skyline.far);
    expect(full.glow.z).toBe(0);
  });

  it("dresses the empty north-east and south-east corners without touching the console, skyline, benches, rooms or pads", () => {
    expect(full.strips).toHaveLength(HORIZON.strips.ne.length + HORIZON.strips.se.length);
    expect(lite.strips).toHaveLength(HORIZON.strips.liteRows * 2);
    const pads = [career.workshop.returnPad, career.workshop.console.stop, ...career.pads.map((p) => p.at), ...career.doors.map((d) => d.at)];
    for (const s of full.strips) {
      const r = stripRect(s);
      expect(inside(r, bounds)).toBe(true);
      // East of the forecourt start, beyond the repo skyline (NE) or the workbenches (SE).
      expect(r.minX).toBeGreaterThanOrEqual(career.forecourt.center.x - career.forecourt.w / 2);
      if (s.from.z < 0) expect(r.maxZ).toBeLessThan(career.workshop.skyline.plinth.minZ - 2);
      else expect(r.minZ).toBeGreaterThan(Math.max(...benchRects.map((b) => b.maxZ)) + 2);
      for (const d of docked) expect(rectGap(r, d)).toBeGreaterThan(2);
      for (const b of benchRects) expect(rectGap(r, b)).toBeGreaterThan(2);
      for (const room of roomRects) expect(rectGap(r, room)).toBeGreaterThan(2);
      for (const p of pads) expect(distanceToRect(p, r)).toBeGreaterThan(PAD.radius + 1);
      // They end at the slab edge, where the bridge starts.
      expect(r.maxX).toBeGreaterThan(career.windowX - 2);
    }
  });
});

describe("L2 Origin (west end)", () => {
  it("raises the light pillar west of the first plaza, clear of the call pad, the teleporter and the road", () => {
    const { at, radius, height } = full.pillar;
    const foot: Rect = { minX: at.x - radius, maxX: at.x + radius, minZ: at.z - radius, maxZ: at.z + radius };
    expect(inside(foot, bounds)).toBe(true);
    const callPad = career.pads.find((p) => p.kind === "teleport" && p.year === career.years[0].year)!;
    expect(Math.hypot(at.x - -21, at.z - 0)).toBeGreaterThan(radius + PAD.radius + 3);
    expect(Math.hypot(at.x - callPad.at.x, at.z - callPad.at.z)).toBeGreaterThan(radius + PAD.radius + 3);
    expect(at.x).toBeLessThan(career.years[0].plaza.center.x - career.years[0].plaza.w / 2);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      expect(onNetwork(career.network, { x: at.x + Math.cos(a) * radius, z: at.z + Math.sin(a) * radius }, 1)).toBe(false);
    }
    for (const room of roomRects) expect(rectGap(foot, room)).toBeGreaterThan(2);
    // Below the L3 slab 14 u up.
    expect(height).toBeLessThan(14);
  });
});
