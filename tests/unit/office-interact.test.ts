import { describe, expect, it } from "vitest";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import { OFFICE, officeSlots, officeWallRect } from "@/experience/floors/lobby/officeLayout";
import { officeInteractables } from "@/experience/floors/lobby/office/interact";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";

const W = LOBBY.officeWing;
const slots = officeSlots(W);
const items = officeInteractables(slots, { office: "Agent Office: summary", github: "Agent Office: GitHub board", desk: (slot) => `Desk ${slot + 1}` });

describe("Agent Office point-and-go targets", () => {
  it("adds the two wall halves and one target per Rover (both rows), each opening its drawer from the office stop", () => {
    const desks = Array.from({ length: 10 }, (_, i) => i + 1);
    expect(items.map((i) => i.id)).toEqual(["L1:station:office", "L1:station:office-github", ...desks.map((n) => `L1:station:office-desk-${n}`)]);
    expect(items.map((i) => (i.action.type === "open-room" ? i.action.room : null))).toEqual(["L1:office", "L1:office-github", ...desks.map((n) => `L1:office-desk-${n}`)]);
    for (const item of items) {
      expect(item).toMatchObject({ floor: "L1", kind: "station", at: W.stop });
    }
    expect(isWalkable(buildNavGrid(buildFloorLayouts(8).L1, ROVER.radius), W.stop)).toBe(true);
  });

  it("splits the wall: the summary is the east half (the canvas's left half, seen from the plaza), GitHub the west half", () => {
    const wall = officeWallRect(W);
    const [summary, github] = items;
    expect(summary.bounds).toMatchObject({ minX: W.wall.x, maxX: wall.maxX });
    expect(github.bounds).toMatchObject({ minX: wall.minX, maxX: W.wall.x });
    expect(summary.base).toBe(OFFICE.wall.bottom);
    expect(summary.height).toBe(OFFICE.wall.bottom + OFFICE.wall.h);
  });

  it("gives each Rover a turned pick box from its desk front to its back, on its row's floor (the back row's on the riser)", () => {
    for (const s of slots) {
      const item = items[2 + s.slot];
      const row = OFFICE.rows[s.row];
      expect(item.box?.yaw).toBe(s.yaw);
      expect(item.box?.w).toBe(row.deskW);
      expect(item.box?.d).toBeCloseTo(row.roverRadius + OFFICE.rover.radius - (row.deskRadius - OFFICE.desk.d / 2));
      expect(item.base ?? 0).toBe(s.lift);
      expect(item.height).toBeCloseTo(s.lift + 2.7);
      // The box's centre lies on the Rover's radial line, between its desk's front and its back.
      const r = Math.hypot(item.box!.center.x - W.arc.x, item.box!.center.z - W.arc.z);
      expect(r).toBeGreaterThan(row.deskRadius - OFFICE.desk.d / 2);
      expect(r).toBeLessThan(row.roverRadius + OFFICE.rover.radius);
      const c = item.box!.center;
      expect(c.x).toBeGreaterThanOrEqual(item.bounds.minX);
      expect(c.x).toBeLessThanOrEqual(item.bounds.maxX);
      expect(item.label).toBe(`Desk ${s.slot + 1}`);
    }
  });
});
