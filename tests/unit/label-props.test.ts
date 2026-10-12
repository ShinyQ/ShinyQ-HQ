import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import { applyLabel, type LabelTarget } from "@/experience/fx/labelProps";

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
});
