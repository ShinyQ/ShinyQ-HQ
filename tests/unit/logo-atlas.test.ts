import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { ATLAS_CELL, atlasLayout, atlasPad, cellUv, quadBuffers, wallLogoSrcs } from "@/experience/floors/lobby/logoAtlas";
import manifest from "@/experience/logo-atlas.json";
import { atlasProblems } from "../../scripts/logo-atlas";

const data = () => buildExperienceData("en", { L1: "Lobby", L2: "Career", L3: "Labs", L4: "Library", RF: "Roof" });

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
    const { skills } = data();
    for (const group of skills) expect(group.logos).toHaveLength(group.items.length);
    const layout = atlasLayout(skills.flatMap((g) => g.logos));
    expect(layout.srcs.length).toBeGreaterThan(10);
    expect(layout.srcs.every((s) => s.startsWith("/tech/"))).toBe(true);
  });
});

describe("prebuilt L1 logo atlas (scripts/logo-atlas.ts)", () => {
  it("holds every skills and certification wall logo in the runtime layout order", () => {
    const d = data();
    const layout = atlasLayout(wallLogoSrcs(d));
    expect(manifest.srcs, "stale atlas: run bun scripts/logo-atlas.ts").toEqual(layout.srcs);
    expect([manifest.cols, manifest.rows, manifest.cell]).toEqual([layout.cols, layout.rows, ATLAS_CELL]);
    expect(manifest.pad).toBe(atlasPad(ATLAS_CELL));
    for (const c of d.certifications) if (c.logo) expect(manifest.srcs).toContain(c.logo);
    for (const g of d.skills) for (const src of g.logos) if (src) expect(manifest.srcs).toContain(src);
  });

  it("is fresh: same logo bytes, content-hashed file name, one cell per logo at 128 px", () => {
    expect(atlasProblems(manifest)).toEqual([]);
    expect(manifest.file).toMatch(/^\/atlas\/logos\.[0-9a-f]{10}\.webp$/);
    const file = path.join(process.cwd(), "public", manifest.file);
    expect(existsSync(file)).toBe(true);
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");
    // VP8L (lossless) header: 14-bit width and height minus one.
    expect(bytes.subarray(12, 16).toString("latin1")).toBe("VP8L");
    const bits = bytes.readUInt32LE(21);
    expect([(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]).toEqual([manifest.cols * manifest.cell, manifest.rows * manifest.cell]);
  });
});
