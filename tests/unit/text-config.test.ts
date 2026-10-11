import { describe, expect, it } from "vitest";
import { GlyphsGeometry } from "troika-three-text";
import "@/experience/text-config";

describe("troika glyph geometry before its first sync", () => {
  it("reports 0 instances instead of Infinity, so renderer.info stays finite", () => {
    const geometry = new GlyphsGeometry();
    expect(geometry.instanceCount).toBe(0);
  });

  it("keeps the real counts from typesetting and clipping", () => {
    const geometry = new GlyphsGeometry();
    geometry.updateGlyphs(new Float32Array(12), new Float32Array(3), [0, 0, 1, 1], undefined, new Uint8Array(9));
    expect(geometry.instanceCount).toBe(3);
    geometry.instanceCount = Infinity;
    expect(geometry.instanceCount).toBe(0);
  });
});
