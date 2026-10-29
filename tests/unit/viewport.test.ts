import { describe, expect, it } from "vitest";
import { buildFloorLayouts, corridorEnd, floorIndex, floorY, LOBBY } from "@/experience/config";
import { cameraClass, viewportClass } from "@/lib/viewport";

describe("viewport classes", () => {
  it("maps widths to HUD breakpoints", () => {
    expect(viewportClass(390, 844)).toBe("mobile");
    expect(viewportClass(800, 1000)).toBe("tablet");
    expect(viewportClass(1024, 1366)).toBe("desktop");
    expect(viewportClass(1440, 900)).toBe("desktop");
  });

  it("keeps mobile HUD and gives landscape phones their own camera", () => {
    expect(viewportClass(844, 390)).toBe("mobile");
    expect(cameraClass(844, 390)).toBe("landscape");
    expect(cameraClass(667, 375)).toBe("landscape");
    expect(cameraClass(932, 430)).toBe("landscape");
    expect(cameraClass(960, 640)).toBe("tablet");
    expect(cameraClass(390, 844)).toBe("mobile");
    expect(cameraClass(1024, 1366)).toBe("mobile");
    expect(cameraClass(800, 1000)).toBe("mobile");
    expect(cameraClass(1366, 1024)).toBe("desktop");
    expect(cameraClass(900, 900)).toBe("tablet");
  });
});

describe("tower config", () => {
  it("stacks floors 14 u apart", () => {
    expect(floorIndex("B1")).toBe(0);
    expect(floorIndex("L1")).toBe(1);
    expect(floorY("L1")).toBe(0);
    expect(floorY("RF")).toBe(56);
  });

  it("parks the rover 3 u in front of each elevator door", () => {
    const layouts = buildFloorLayouts(8);
    expect(layouts.L1.door).toEqual({ x: -24, z: 0 });
    expect(layouts.L1.approach).toEqual({ x: -21, z: 0 });
    expect(layouts.RF.door).toEqual({ x: -20, z: 0 });
    expect(layouts.RF.approach).toEqual({ x: -17, z: 0 });
    expect(layouts.L1.spawn).toEqual(LOBBY.spawn);
  });

  it("sizes the L2 corridor from the year count", () => {
    expect(corridorEnd(8)).toBe(112);
    expect(buildFloorLayouts(3).L2.bounds.maxX).toBe(42);
  });
});
