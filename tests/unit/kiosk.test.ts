import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import { fitLine, KIOSK, kioskAllLines, kioskFacing, kioskFontSize, kioskLines, kioskMaxChars, kioskParts, kioskStop } from "@/experience/floors/lobby/kiosk";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

const parts = kioskParts();
const k = LOBBY.kiosk;
const rect = { minX: k.x - k.w / 2, maxX: k.x + k.w / 2, minZ: k.z - k.d / 2, maxZ: k.z + k.d / 2 };
/** World x/z of a group-local point (rotation by the group yaw, then the group position). */
const world = ([x, , z]: [number, number, number]) => {
  const c = Math.cos(parts.group.yaw);
  const s = Math.sin(parts.group.yaw);
  return { x: parts.group.position[0] + x * c + z * s, z: parts.group.position[2] - x * s + z * c };
};

describe("Ask Rover kiosk", () => {
  it("turns body, stand and screen as one unit, square to the grid", () => {
    // The screen and the body have no yaw of their own: both use the group's.
    expect(parts.screen.yaw).toBe(0);
    expect(parts.group.yaw).toBe(KIOSK.yaw);
    expect(Math.abs(KIOSK.yaw / (Math.PI / 2) - Math.round(KIOSK.yaw / (Math.PI / 2)))).toBeLessThan(1e-9);
    expect(parts.screen.tilt).toBeGreaterThan(0);
  });

  it("centers the screen and the stand on the body, the screen as wide as the body and resting on the stand", () => {
    expect(world(parts.screen.position)).toEqual(world(parts.body.position));
    expect(world(parts.stand.position)).toEqual(world(parts.body.position));
    expect(parts.screen.w).toBe(parts.body.size[0]);
    const standTop = parts.stand.position[1] + parts.stand.size[1] / 2;
    const screenBottom = parts.screen.position[1] - (parts.screen.h / 2) * Math.cos(parts.screen.tilt);
    expect(screenBottom).toBeCloseTo(standTop);
    expect(parts.stand.position[1] - parts.stand.size[1] / 2).toBeCloseTo(parts.body.size[1]);
  });

  it("matches the obstacle footprint, touches the south slab edge and keeps clear of the hall passage", () => {
    const [across, , depth] = parts.body.size;
    const f = kioskFacing();
    // Rotated by a quarter turn, the local depth runs along x and the width along z.
    expect(Math.abs(f.x) * depth + Math.abs(f.z) * across).toBeCloseTo(k.w);
    expect(Math.abs(f.x) * across + Math.abs(f.z) * depth).toBeCloseTo(k.d);
    const l1 = buildFloorLayouts(8).L1;
    expect(l1.obstacles[3]).toEqual(rect);
    expect(rect.maxZ).toBe(LOBBY.bounds.maxZ);
    // The Highlights Hall road (Task 7) runs east from (14, 15), 8 u wide: at least 4 u from its center line.
    expect(Math.hypot(14 - rect.maxX, Math.max(0, rect.minZ - 15))).toBeGreaterThanOrEqual(4);
  });

  it("puts the point-and-go stop centered in front of the screen, on open floor, facing the default camera", () => {
    const stop = kioskStop();
    const f = kioskFacing();
    expect(stop).toEqual({ x: 5.5, z: 19.3 });
    expect((stop.x - k.x) * f.x + (stop.z - k.z) * f.z).toBeGreaterThan(0);
    expect((stop.x - k.x) * f.z - (stop.z - k.z) * f.x).toBeCloseTo(0);
    expect(isWalkable(buildNavGrid(buildFloorLayouts(8).L1, ROVER.radius), stop)).toBe(true);
    // The default follow camera sits along (+1, +1): the screen faces it.
    expect((f.x + f.z) / Math.SQRT2).toBeGreaterThan(0.5);
  });

  for (const [locale, m] of [["en", en], ["id", id]] as const) {
    it(`keeps every line on one straight baseline (${locale})`, () => {
      const labels = getContent().missions.map((mission) => mission.label[locale]);
      const width = parts.screen.w;
      const all = kioskAllLines(labels, m.hud.kioskTitle, m.hud.kioskHint);
      const size = kioskFontSize(all, width);
      const usable = width - 2 * KIOSK.screen.pad;
      expect(size).toBeGreaterThanOrEqual(KIOSK.font.min);
      for (let offset = 0; offset < labels.length; offset++) {
        const lines = kioskLines(labels, m.hud.kioskTitle, m.hud.kioskHint, offset, width);
        expect(lines.every((l) => !l.includes("\n"))).toBe(true);
        for (const line of lines) expect(line.length * size * KIOSK.font.advance, line).toBeLessThanOrEqual(usable + 1e-9);
        expect(lines.length * KIOSK.screen.lineHeight * size).toBeLessThanOrEqual(parts.screen.h - 2 * KIOSK.screen.pad);
      }
      // Today's longest mission label (e.g. "Explore my Product Engineering work") fits without truncation.
      const longest = labels.reduce((a, b) => (b.length > a.length ? b : a));
      const at = labels.indexOf(longest);
      expect(kioskLines(labels, m.hud.kioskTitle, m.hud.kioskHint, at, width)).toContain(`${at + 1}. ${longest}`);
    });
  }

  it("shortens a line that could never fit with ASCII dots", () => {
    expect(fitLine("abcdefgh", 6)).toBe("abc...");
    expect(fitLine("abc", 6)).toBe("abc");
    expect(kioskMaxChars(3.4)).toBeGreaterThanOrEqual(50);
  });
});
