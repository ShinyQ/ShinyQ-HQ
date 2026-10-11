import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cameraShift, drawerLayout, SHEET_SNAPS, SIDE_WIDTHS, sideWidth, snapSheet } from "@/hud/drawer/layout";

describe("drawer layout", () => {
  it("uses a side panel on desktop and landscape tablets, a bottom sheet otherwise", () => {
    expect(drawerLayout(1440, 900)).toBe("side");
    expect(drawerLayout(1024, 1366)).toBe("side");
    expect(drawerLayout(960, 700)).toBe("side");
    expect(drawerLayout(800, 1000)).toBe("sheet");
    expect(drawerLayout(844, 390)).toBe("sheet");
    expect(drawerLayout(390, 844)).toBe("sheet");
  });

  it("widens the side panel with the viewport and keeps it inside small windows", () => {
    expect(sideWidth(1440)).toBe(600);
    expect(sideWidth(1400)).toBe(600);
    expect(sideWidth(1280)).toBe(560);
    expect(sideWidth(1024)).toBe(480);
    expect(sideWidth(960)).toBe(480);
    expect(sideWidth(400)).toBe(376);
  });

  it("mirrors the --hq-drawer-w breakpoints in globals.css", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const declared = [...css.matchAll(/(?:@media \(min-width: (\d+)px\) \{\s*)?:root \{\s*--hq-drawer-w: (\d+)px;/g)].map((m) => ({
      min: Number(m[1] ?? 0),
      width: Number(m[2]),
    }));
    expect(declared.sort((a, b) => b.min - a.min)).toEqual(SIDE_WIDTHS.map((s) => ({ ...s })));
  });

  it("snaps the sheet to 55% or 92% and closes it when dragged low", () => {
    expect(SHEET_SNAPS).toEqual([0.55, 0.92]);
    expect(snapSheet(0.5)).toBe(0.55);
    expect(snapSheet(0.8)).toBe(0.92);
    expect(snapSheet(0.2)).toBe("close");
    expect(snapSheet(0.6, 2)).toBe("close");
    expect(snapSheet(0.5, -2)).toBe(0.92);
  });

  it("centres the rover in the uncovered part of the screen", () => {
    // (600 + 16) / 1440 / 2
    expect(cameraShift("side", 1440)).toEqual({ x: 0.214, y: 0 });
    expect(cameraShift("side", 1280)).toEqual({ x: 0.225, y: 0 });
    expect(cameraShift("side", 960).x).toBe(0.25);
    expect(cameraShift("sheet")).toEqual({ x: 0, y: 0.275 });
    expect(cameraShift(null)).toEqual({ x: 0, y: 0 });
  });
});
