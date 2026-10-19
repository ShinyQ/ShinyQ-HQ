import { describe, expect, it } from "vitest";
import { buildFloorLayouts, ROVER } from "@/experience/config";
import { OFFICE, officeSlots, officeWallRect } from "@/experience/floors/lobby/officeLayout";
import { officeInteractables } from "@/experience/floors/lobby/office/interact";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";

const slots = officeSlots();
const items = officeInteractables(slots, { office: "Agent Office: summary", github: "Agent Office: GitHub board", desk: (slot) => `Desk ${slot + 1}` });

describe("Agent Office point-and-go targets", () => {
  it("adds the two wall halves and one target per Rover, each opening its drawer from the office stop", () => {
    expect(items.map((i) => i.id)).toEqual(["L1:station:office", "L1:station:office-github", "L1:station:office-desk-1", "L1:station:office-desk-2", "L1:station:office-desk-3", "L1:station:office-desk-4", "L1:station:office-desk-5"]);
    expect(items.map((i) => (i.action.type === "open-room" ? i.action.room : null))).toEqual(["L1:office", "L1:office-github", "L1:office-desk-1", "L1:office-desk-2", "L1:office-desk-3", "L1:office-desk-4", "L1:office-desk-5"]);
    for (const item of items) {
      expect(item).toMatchObject({ floor: "L1", kind: "station", at: OFFICE.stop });
    }
    expect(isWalkable(buildNavGrid(buildFloorLayouts(8).L1, ROVER.radius), OFFICE.stop)).toBe(true);
  });

  it("splits the wall: the summary is the east half (the canvas's left half, seen from the plaza), GitHub the west half", () => {
    const wall = officeWallRect();
    const [summary, github] = items;
    expect(summary.bounds).toMatchObject({ minX: OFFICE.wall.x, maxX: wall.maxX });
    expect(github.bounds).toMatchObject({ minX: wall.minX, maxX: OFFICE.wall.x });
    expect(summary.base).toBe(OFFICE.wall.bottom);
    expect(summary.height).toBe(OFFICE.wall.bottom + OFFICE.wall.h);
  });

  it("gives each Rover a turned pick box from its desk front to its back", () => {
    for (const s of slots) {
      const item = items[2 + s.slot];
      expect(item.box?.yaw).toBe(s.yaw);
      expect(item.box?.w).toBe(OFFICE.desk.w);
      expect(item.box?.d).toBeCloseTo(OFFICE.roverRadius + OFFICE.rover.radius - (OFFICE.deskRadius - OFFICE.desk.d / 2));
      const c = item.box!.center;
      expect(c.x).toBeGreaterThanOrEqual(item.bounds.minX);
      expect(c.x).toBeLessThanOrEqual(item.bounds.maxX);
      expect(item.label).toBe(`Desk ${s.slot + 1}`);
    }
  });
});
