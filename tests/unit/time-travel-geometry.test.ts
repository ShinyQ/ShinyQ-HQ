import { describe, expect, it } from "vitest";
import { SKY, blockPath, skylineLayout, viewBoxOf } from "@/components/time-travel/geometry";
import { TT_KINDS, type TtKind } from "@/content/time-travel";

const counts = (partial: Partial<Record<TtKind, number>>) => Object.fromEntries(TT_KINDS.map((k) => [k, partial[k] ?? 0])) as Record<TtKind, number>;

describe("skyline layout", () => {
  const stops = [
    { counts: counts({ roles: 1, awards: 3 }), size: 4, height: 0.5 },
    { counts: counts({ projects: 16 }), size: 16, height: 1 },
    { counts: counts({}), size: 0, height: 0 },
  ];
  const layout = skylineLayout(stops);

  it("centers one building per slot on a shared base", () => {
    expect(layout.map((b) => b.x)).toEqual([20, 120, 220]);
    expect(layout.map((b) => b.centerX)).toEqual([50, 150, 250]);
    expect(layout[1]).toMatchObject({ height: SKY.maxHeight, top: SKY.base - SKY.maxHeight });
  });

  it("draws one block per item, bottom up in kind order", () => {
    expect(layout[0].blocks.map((b) => b.kind)).toEqual(["roles", "awards", "awards", "awards"]);
    expect(layout[0].blocks[0].y + layout[0].blocks[0].height).toBeLessThanOrEqual(SKY.base);
    expect(layout[0].blocks[3].y).toBeCloseTo(layout[0].top, 1);
    expect(layout[1].blocks).toHaveLength(16);
  });

  it("draws an empty stop as no blocks", () => {
    expect(layout[2].blocks).toEqual([]);
    expect(layout[2].height).toBe(0);
  });

  it("sizes the view box to the stop count", () => {
    expect(viewBoxOf(9)).toBe("0 0 900 224");
  });

  it("joins blocks into one path with a rectangle subpath each", () => {
    expect(blockPath([])).toBe("");
    expect(blockPath([{ kind: "roles", x: 20, y: 207.5, width: 60, height: 11.5 }, { kind: "awards", x: 20, y: 195, width: 60, height: 11.5 }])).toBe(
      "M20 207.5h60v11.5h-60zM20 195h60v11.5h-60z",
    );
    expect(blockPath(layout[1].blocks.slice(0, 2)).match(/M/g)).toHaveLength(2);
  });
});
