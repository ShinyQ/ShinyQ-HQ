import { describe, expect, it } from "vitest";
import { cameraShift, drawerLayout, SHEET_SNAPS, snapSheet } from "@/hud/drawer/layout";

describe("drawer layout", () => {
  it("uses a side panel on desktop and landscape tablets, a bottom sheet otherwise", () => {
    expect(drawerLayout(1440, 900)).toBe("side");
    expect(drawerLayout(1024, 1366)).toBe("side");
    expect(drawerLayout(960, 700)).toBe("side");
    expect(drawerLayout(800, 1000)).toBe("sheet");
    expect(drawerLayout(844, 390)).toBe("sheet");
    expect(drawerLayout(390, 844)).toBe("sheet");
  });

  it("snaps the sheet to 45% or 92% and closes it when dragged low", () => {
    expect(SHEET_SNAPS).toEqual([0.45, 0.92]);
    expect(snapSheet(0.5)).toBe(0.45);
    expect(snapSheet(0.8)).toBe(0.92);
    expect(snapSheet(0.2)).toBe("close");
    expect(snapSheet(0.6, 2)).toBe("close");
    expect(snapSheet(0.5, -2)).toBe(0.92);
  });

  it("shifts the camera 15% left for the side panel and 20% up for the sheet", () => {
    expect(cameraShift("side")).toEqual({ x: 0.15, y: 0 });
    expect(cameraShift("sheet")).toEqual({ x: 0, y: 0.2 });
    expect(cameraShift(null)).toEqual({ x: 0, y: 0 });
  });
});
