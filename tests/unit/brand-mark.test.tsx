import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BOOT_MARK_SRC } from "@/components/BootCard";
import { RoverMark } from "@/components/RoverMark";
import { HOLOGRAM } from "@/experience/floors/lobby/layout";
import { antenna, faceLabels, ROVER_MARK_3D, roverMarkExtent, screenPlate, treadBoxes } from "@/experience/floors/lobby/roverMark3d";
import { MARK, MARK_FILES, roverMarkBody, roverMarkSvg } from "@/lib/brand-mark";

const root = process.cwd();

describe("rover brand mark", () => {
  it("keeps the committed SVG files equal to src/lib/brand-mark.ts (run bun scripts/brand-marks.ts)", () => {
    for (const [file, make] of Object.entries(MARK_FILES)) {
      expect(readFileSync(path.join(root, file), "utf8"), file).toBe(make());
    }
  });

  it("follows the 3D rover: head about 1.2 by 1.1, antenna right of center, a tread per side", () => {
    const { head, screen, antenna: a, treads } = MARK;
    expect(head.w / head.h).toBeCloseTo(1.2 / 1.1, 1);
    expect(screen.w / head.w).toBeCloseTo(0.75, 1);
    expect(a.x).toBeGreaterThan(head.x + head.w / 2);
    expect(treads.map((t) => t.x + t.w / 2 < MARK.size / 2)).toEqual([true, false]);
  });

  it("stays inside the tile with a margin", () => {
    const { head, antenna: a, treads } = MARK;
    expect(a.tip.y - a.tip.r).toBeGreaterThanOrEqual(4);
    expect(Math.max(...treads.map((t) => t.y + t.h))).toBeLessThanOrEqual(MARK.size - 8);
    expect(head.x - head.stroke / 2).toBeGreaterThanOrEqual(12);
  });

  it("prefixes its definition ids, so inline copies never collide", () => {
    const body = roverMarkBody("tile", "x1");
    expect(body).toContain('id="x1-g"');
    expect(body).not.toMatch(/id="(?!x1-)/);
    expect(roverMarkBody("mono")).not.toContain("<defs>");
    expect(roverMarkBody("mono")).toContain("currentColor");
  });

  it("names the standalone files and hides the inline mark from assistive tech (a name or title sits next to it)", () => {
    expect(roverMarkSvg("glyph")).toContain('aria-label="ShinyQ HQ rover mark"');
    const html = renderToStaticMarkup(<RoverMark id="t" size={34} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('width="34"');
  });

  it("shows the committed tile on the boot card (a file, so the 3D chunk never bundles the mark module)", () => {
    expect(readFileSync(path.join(root, "public", BOOT_MARK_SRC), "utf8")).toBe(MARK_FILES["public/brand/rover-mark.svg"]());
  });
});

describe("L1 hologram rover mark", () => {
  it("uses the rover's proportions", () => {
    const { head, screen, scale } = ROVER_MARK_3D;
    expect([head.w, head.h, head.d].map((v) => v / scale)).toEqual([1.2, 1.1, 0.9].map((v) => expect.closeTo(v, 5)));
    expect([screen.w / scale, screen.h / scale]).toEqual([expect.closeTo(0.9, 5), expect.closeTo(0.7, 5)]);
    expect(antenna().from[0] / scale).toBeCloseTo(0.35);
  });

  it("fits the pedestal column: inside the old monogram radius, above the pedestal, below the title", () => {
    const e = roverMarkExtent();
    expect(e.radius).toBeLessThanOrEqual(2.3);
    expect(e.bottom).toBeGreaterThan(0.62 + 0.2);
    expect(HOLOGRAM.top).toBe(e.top);
    expect(treadBoxes()).toHaveLength(2);
  });

  it("has one front screen whose mirror-symmetric face reads from both sides while it turns", () => {
    const { text } = ROVER_MARK_3D.face;
    expect([...text].reverse().join("")).toBe(text);
    expect(screenPlate().at[2]).toBeGreaterThan(ROVER_MARK_3D.head.d / 2);
    expect(faceLabels().map((f) => f.yaw)).toEqual([0, Math.PI]);
  });
});
