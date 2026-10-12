import { Color, Object3D } from "three";
import { describe, expect, it } from "vitest";
import { applyLabel, batchColor, type LabelTarget } from "@/experience/fx/labelProps";

function target(): LabelTarget {
  return Object.assign(new Object3D(), {
    text: "",
    font: null as string | null,
    fontSize: 0.1,
    color: null as string | number | null,
    anchorX: "left" as LabelTarget["anchorX"],
    anchorY: "top" as LabelTarget["anchorY"],
    textAlign: "left" as LabelTarget["textAlign"],
    maxWidth: Infinity,
    lineHeight: "normal" as LabelTarget["lineHeight"],
    letterSpacing: 0,
    outlineWidth: 0.5 as LabelTarget["outlineWidth"],
    outlineColor: "#fff" as LabelTarget["outlineColor"],
    fillOpacity: 0.2,
    outlineOpacity: 0.2,
  });
}

describe("applyLabel", () => {
  it("copies text, font, size, color and layout, with centered defaults", () => {
    const t = target();
    applyLabel(t, { text: "Hello", position: [1, 2, 3], font: "/fonts/a.woff", fontSize: 0.3, color: "#fff" });
    expect(t).toMatchObject({ text: "Hello", font: "/fonts/a.woff", fontSize: 0.3, color: "#fff", anchorX: "center", anchorY: "middle", textAlign: "left", maxWidth: Infinity, lineHeight: "normal", letterSpacing: 0 });
    expect(t.position.toArray()).toEqual([1, 2, 3]);
    expect(t.rotation.toArray()).toEqual([0, 0, 0, "YXZ"]);
  });

  it("turns by yaw first, then leans back by tilt", () => {
    const t = target();
    applyLabel(t, { text: "x", position: [0, 0, 0], font: "f", fontSize: 1, color: "#000", yaw: Math.PI / 2, tilt: 0.3, maxWidth: 4, textAlign: "center", lineHeight: 1.2, letterSpacing: 0.1 });
    expect(t.rotation.order).toBe("YXZ");
    expect(t.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(t.rotation.x).toBeCloseTo(-0.3);
    expect(t).toMatchObject({ maxWidth: 4, textAlign: "center", lineHeight: 1.2, letterSpacing: 0.1 });
  });

  it("writes troika's outline and opacity defaults unless the label sets them", () => {
    const t = target();
    applyLabel(t, { text: "x", position: [0, 0, 0], font: "f", fontSize: 1, color: "#000" });
    expect(t).toMatchObject({ outlineWidth: 0, outlineColor: 0x000000, fillOpacity: 1, outlineOpacity: 1 });
    applyLabel(t, { text: "x", position: [0, 0, 0], font: "f", fontSize: 1, color: "#000", outlineWidth: 0.03, outlineColor: "#05050c", fillOpacity: 0.3 });
    expect(t).toMatchObject({ outlineWidth: 0.03, outlineColor: "#05050c", fillOpacity: 0.3, outlineOpacity: 1 });
  });
});

describe("batchColor", () => {
  it("packs to the linear color drei Text would draw (troika packs getHex, sRGB, and reads it as linear)", () => {
    for (const hex of ["#34d399", "#d4d4d8", "#0a0a0f", "#ffffff"]) {
      const linear = new Color(hex);
      const packed = batchColor(hex).getHex();
      expect((packed >> 16) & 255).toBe(Math.round(linear.r * 255));
      expect((packed >> 8) & 255).toBe(Math.round(linear.g * 255));
      expect(packed & 255).toBe(Math.round(linear.b * 255));
    }
  });
});
