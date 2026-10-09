import { describe, expect, it } from "vitest";
import { buildFloorLayouts, LOBBY, ROVER, ROVER_HEIGHT } from "@/experience/config";
import { boxesOverlap, lobbyElements, radialSpan, type Box } from "@/experience/floors/lobby/layout";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { getStats } from "@/content/load";

const STATS = getStats().length;
const TURNS = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);
/** The walkable lane ring: the rover's footprint around the lane radius, up to its height. */
const RING = { inner: LOBBY.laneRadius - ROVER.radius - 0.5, outer: LOBBY.laneRadius + ROVER.radius + 0.5 };
/** Elements stacked on the hologram column by design (pedestal, monogram, title above them). */
const COLUMN = new Set(["pedestal", "monogram", "title"]);

const pairs = (boxes: Box[]) => boxes.flatMap((a, i) => boxes.slice(i + 1).map((b) => [a, b] as const));

describe("Lobby layout", () => {
  it("has no overlapping elements at any stats ring rotation", () => {
    for (const turn of TURNS) {
      const clashes = pairs(lobbyElements(STATS, turn))
        .filter(([a, b]) => !(COLUMN.has(a.name) && COLUMN.has(b.name)))
        .filter(([a, b]) => boxesOverlap(a, b))
        .map(([a, b]) => `${a.name} x ${b.name}`);
      expect(clashes).toEqual([]);
    }
  });

  it("keeps the stats tiles above the rover and below the title", () => {
    const boxes = lobbyElements(STATS);
    const title = boxes.find((b) => b.name === "title")!;
    for (const tile of boxes.filter((b) => b.name.startsWith("tile-"))) {
      expect(tile.min[1]).toBeGreaterThan(ROVER_HEIGHT);
      expect(tile.max[1]).toBeLessThan(title.min[1]);
    }
  });

  it("keeps the walkable ring clear of everything at rover height", () => {
    for (const turn of TURNS) {
      const blocking = lobbyElements(STATS, turn)
        .filter((b) => b.min[1] < ROVER_HEIGHT)
        .filter((b) => {
          const { near, far } = radialSpan(b);
          return near < RING.outer && far > RING.inner;
        })
        .map((b) => b.name);
      expect(blocking).toEqual([]);
    }
  });

  it("leaves a walkway of at least 4 u between the ring and each wall", () => {
    const boxes = lobbyElements(STATS);
    for (const name of ["skills-wall", "cert-wall", "kiosk"]) {
      const { near } = radialSpan(boxes.find((b) => b.name === name)!);
      expect(near - RING.outer, name).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps every element on the slab and the ring walkable", () => {
    const { bounds } = LOBBY;
    for (const b of lobbyElements(STATS).filter((e) => e.name !== "elevator-door")) {
      expect(b.min[0]).toBeGreaterThanOrEqual(bounds.minX);
      expect(b.max[0]).toBeLessThanOrEqual(bounds.maxX);
      expect(b.min[2]).toBeGreaterThanOrEqual(bounds.minZ);
      expect(b.max[2]).toBeLessThanOrEqual(bounds.maxZ);
    }
    const l1 = buildFloorLayouts(8).L1;
    const grid = buildNavGrid(l1, ROVER.radius);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const p = { x: LOBBY.hologram.x + Math.cos(a) * LOBBY.laneRadius, z: LOBBY.hologram.z + Math.sin(a) * LOBBY.laneRadius };
      expect(isWalkable(grid, p), `ring point ${i}`).toBe(true);
    }
    expect(isWalkable(grid, l1.spawn)).toBe(true);
    expect(isWalkable(grid, l1.approach)).toBe(true);
  });

  it("gives each skill column room to breathe", () => {
    expect(LOBBY.skillsWall.w / 4).toBeGreaterThanOrEqual(9);
  });
});
