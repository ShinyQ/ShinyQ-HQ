import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import { fitLine, KIOSK, KIOSK_AXIS, kioskAllLines, kioskBounds, kioskFacing, kioskFontSize, kioskLaneEnd, kioskLines, kioskMaxChars, kioskParts, kioskStop, SPAWN_HEADING } from "@/experience/floors/lobby/kiosk";
import { initialRover } from "@/store/useHQStore";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

const parts = kioskParts();
const k = LOBBY.kiosk;
const H = LOBBY.hologram;
const cross = (a: { x: number; z: number }, b: { x: number; z: number }) => a.x * b.z - a.z * b.x;
const along = (p: { x: number; z: number }) => (p.x - H.x) * KIOSK_AXIS.x + (p.z - H.z) * KIOSK_AXIS.z;
const off = (p: { x: number; z: number }) => cross(KIOSK_AXIS, { x: p.x - H.x, z: p.z - H.z });
/** World x/z of a group-local point (rotation by the group yaw, then the group position). */
const world = ([x, , z]: [number, number, number]) => {
  const c = Math.cos(parts.group.yaw);
  const s = Math.sin(parts.group.yaw);
  return { x: parts.group.position[0] + x * c + z * s, z: parts.group.position[2] - x * s + z * c };
};

describe("Ask Rover kiosk", () => {
  it("turns body, stand and screen as one unit, facing the hologram", () => {
    // The screen and the body have no yaw of their own: both use the group's.
    expect(parts.screen.yaw).toBe(0);
    expect(parts.group.yaw).toBe(k.yaw);
    expect(parts.screen.tilt).toBeGreaterThan(0);
    const f = kioskFacing();
    const toH = { x: H.x - k.x, z: H.z - k.z };
    expect(cross(f, toH)).toBeCloseTo(0);
    expect(f.x * toH.x + f.z * toH.z).toBeGreaterThan(0);
  });

  it("centers the screen and the stand on the body, the screen as wide as the body and resting on the stand", () => {
    expect(world(parts.screen.position).x).toBeCloseTo(world(parts.body.position).x);
    expect(world(parts.screen.position).z).toBeCloseTo(world(parts.body.position).z);
    expect(world(parts.stand.position).x).toBeCloseTo(world(parts.body.position).x);
    expect(parts.screen.w).toBe(parts.body.size[0]);
    expect(parts.body.size[0]).toBe(k.width);
    expect(parts.body.size[2]).toBe(k.depth);
    const standTop = parts.stand.position[1] + parts.stand.size[1] / 2;
    const screenBottom = parts.screen.position[1] - (parts.screen.h / 2) * Math.cos(parts.screen.tilt);
    expect(screenBottom).toBeCloseTo(standTop);
    expect(parts.stand.position[1] - parts.stand.size[1] / 2).toBeCloseTo(parts.body.size[1]);
  });

  it("sits on a straight radial spoke: hologram, lane end, stop and kiosk on one line (owner: not a straight line into the circle)", () => {
    // Owner review 2026-10-14: the lane must run straight from the ring into the kiosk front.
    const stop = kioskStop();
    const end = kioskLaneEnd();
    for (const p of [k, stop, end]) expect(off(p), JSON.stringify(p)).toBeCloseTo(0);
    expect(along(end)).toBeGreaterThan(LOBBY.laneRadius);
    expect(along(stop)).toBeLessThan(along(end));
    expect(along(end)).toBeLessThan(along(k));
    // The lane ends 0.4 u in front of the kiosk front face.
    expect(along(k) - k.depth / 2 - along(end)).toBeCloseTo(0.4);
    // The kiosk axis points at the Visitor Observatory, so the spawn view looks past the kiosk at it.
    const o = LOBBY.observatory;
    expect(off({ x: (o.minX + o.maxX) / 2, z: (o.minZ + o.maxZ) / 2 })).toBeCloseTo(0);
  });

  it("matches the obstacle footprint and keeps clear of the hall passage, the elevator lane and the observatory", () => {
    const b = kioskBounds();
    const f = kioskFacing();
    const halfX = (Math.abs(f.x) * k.depth + Math.abs(f.z) * k.width) / 2;
    const halfZ = (Math.abs(f.z) * k.depth + Math.abs(f.x) * k.width) / 2;
    expect(b).toEqual({ minX: k.x - halfX, maxX: k.x + halfX, minZ: k.z - halfZ, maxZ: k.z + halfZ });
    expect(buildFloorLayouts(8).L1.obstacles[3]).toEqual(b);
    // The Highlights Hall road runs east from (14, 15), 8 u wide; the elevator lane along z = 0.
    expect(b.maxX).toBeLessThan(14 - 4);
    expect(b.minZ).toBeGreaterThan(ROVER.radius * 2);
    // The rover passes between the kiosk and the observatory.
    const o = LOBBY.observatory;
    expect(Math.max(o.minX - b.maxX, b.minX - o.maxX, o.minZ - b.maxZ, b.minZ - o.maxZ)).toBeGreaterThanOrEqual(ROVER.radius * 2 + 0.5);
  });

  it("puts the point-and-go stop centered in front of the screen, on open floor, and starts the session there", () => {
    const stop = kioskStop();
    const f = kioskFacing();
    expect((stop.x - k.x) * f.x + (stop.z - k.z) * f.z).toBeCloseTo(k.depth / 2 + KIOSK.stopGap);
    expect(cross(f, { x: stop.x - k.x, z: stop.z - k.z })).toBeCloseTo(0);
    const l1 = buildFloorLayouts(8).L1;
    expect(isWalkable(buildNavGrid(l1, ROVER.radius), stop)).toBe(true);
    // Owner 2026-10-14: "first rover placement should be infront of his kiosk".
    expect(Math.hypot(l1.spawn.x - stop.x, l1.spawn.z - stop.z)).toBeLessThan(1e-9);
    expect(l1.spawn).toEqual(LOBBY.spawn);
    // The rover faces the screen: heading (sin, cos) points from the stop to the kiosk.
    const h = { x: Math.sin(SPAWN_HEADING), z: Math.cos(SPAWN_HEADING) };
    expect(h.x).toBeCloseTo(-f.x);
    expect(h.z).toBeCloseTo(-f.z);
    expect(initialRover).toMatchObject({ x: LOBBY.spawn.x, z: LOBBY.spawn.z, heading: SPAWN_HEADING });
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
      // Today's longest mission label (e.g. "Follow my career, 2019 to 2026") fits without truncation.
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
