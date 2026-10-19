import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { ATLAS_CELL, atlasLayout, atlasTextureFlags, canDecodeAtlasBitmap, cellUv, quadBuffers, wallLogoSrcs } from "@/experience/floors/lobby/logoAtlas";
import manifest from "@/experience/logo-atlas.json";
import lock from "../../scripts/logo-atlas.lock.json";
import { atlasProblems, expectedLayout, QUANT, sourcesHash } from "../../scripts/logo-atlas";

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
    for (const c of d.certifications) if (c.logo) expect(manifest.srcs).toContain(c.logo);
    for (const g of d.skills) for (const src of g.logos) if (src) expect(manifest.srcs).toContain(src);
  });

  it("is fresh: same logo bytes, content-hashed file name, one cell per logo at 128 px", () => {
    expect(atlasProblems(manifest, lock)).toEqual([]);
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

  it("ships only what the runtime needs in the client manifest", () => {
    expect(Object.keys(manifest).sort()).toEqual(["cell", "cols", "file", "rows", "srcs"]);
    expect(lock.file).toBe(manifest.file);
  });

  it("fails the freshness check when an atlas setting or the lock changes", () => {
    const layout = expectedLayout();
    const before = sourcesHash(layout);
    const q = QUANT as { alpha: number };
    const alpha = q.alpha;
    try {
      q.alpha = alpha + 1;
      expect(sourcesHash(layout)).not.toBe(before);
    } finally {
      q.alpha = alpha;
    }
    expect(sourcesHash(layout)).toBe(before);
    expect(atlasProblems(manifest, { ...lock, sources: "000000000000" })).toEqual(["a logo file or an atlas setting changed (sources hash differs)"]);
    expect(atlasProblems(manifest, { ...lock, file: "/atlas/logos.0000000000.webp" })).toContain("scripts/logo-atlas.lock.json belongs to another atlas");
  });
});

describe("logo atlas decode path", () => {
  const ua = {
    safari16: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    safari17: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    firefox97: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:97.0) Gecko/20100101 Firefox/97.0",
    firefox98: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:98.0) Gecko/20100101 Firefox/98.0",
    chrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  };

  it("gates createImageBitmap like three's GLTFLoader", () => {
    expect(canDecodeAtlasBitmap(ua.safari16, true)).toBe(false);
    expect(canDecodeAtlasBitmap(ua.safari17, true)).toBe(true);
    expect(canDecodeAtlasBitmap(ua.firefox97, true)).toBe(false);
    expect(canDecodeAtlasBitmap(ua.firefox98, true)).toBe(true);
    expect(canDecodeAtlasBitmap(ua.chrome, true)).toBe(true);
    expect(canDecodeAtlasBitmap(ua.android, true)).toBe(true);
    expect(canDecodeAtlasBitmap(undefined, true)).toBe(true);
  });

  it("takes the <img> path without createImageBitmap", () => {
    for (const agent of [...Object.values(ua), undefined]) expect(canDecodeAtlasBitmap(agent, false)).toBe(false);
  });

  it("flips the <img> on upload and never the pre-flipped bitmap, straight alpha on both", () => {
    expect(atlasTextureFlags(false)).toEqual({ flipY: true, premultiplyAlpha: false });
    expect(atlasTextureFlags(true)).toEqual({ flipY: false, premultiplyAlpha: false });
  });
});
