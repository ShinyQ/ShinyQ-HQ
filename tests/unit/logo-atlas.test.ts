import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { atlasLayout, cellUv, quadBuffers } from "@/experience/floors/lobby/logoAtlas";

describe("skills wall logo atlas", () => {
  it("dedupes logos and skips nulls", () => {
    const layout = atlasLayout(["/a.svg", null, "/b.svg", "/a.svg", "/c.svg"]);
    expect(layout.srcs).toEqual(["/a.svg", "/b.svg", "/c.svg"]);
    expect(layout.cols * layout.rows).toBeGreaterThanOrEqual(3);
  });

  it("maps cells to non-overlapping UV rectangles", () => {
    const layout = atlasLayout(["/a", "/b", "/c", "/d"]);
    expect(cellUv(layout, 0)).toEqual([0, 0.5, 0.5, 1]);
    expect(cellUv(layout, 3)).toEqual([0.5, 0, 1, 0.5]);
  });

  it("builds one indexed quad per placed logo", () => {
    const layout = atlasLayout(["/a", "/b"]);
    const buf = quadBuffers(layout, [
      { src: "/a", x: 0, y: 0, size: 1 },
      { src: "/missing", x: 1, y: 1, size: 1 },
      { src: "/b", x: 2, y: 0, size: 0.5 },
    ]);
    expect(buf.count).toBe(2);
    expect(buf.positions).toHaveLength(24);
    expect(Array.from(buf.indices.slice(6))).toEqual([4, 5, 6, 4, 6, 7]);
    expect(Array.from(buf.positions.slice(12, 15))).toEqual([1.75, -0.25, 0]);
  });

  it("ships skill logos aligned with items in the 3D payload", () => {
    const data = buildExperienceData("en", { L1: "Lobby", L2: "Career", L3: "Labs", L4: "Library", RF: "Roof" });
    for (const group of data.skills) expect(group.logos).toHaveLength(group.items.length);
    const layout = atlasLayout(data.skills.flatMap((g) => g.logos));
    expect(layout.srcs.length).toBeGreaterThan(10);
    expect(layout.srcs.every((s) => s.startsWith("/tech/"))).toBe(true);
  });
});
