import { describe, expect, it } from "vitest";
import { allBlack, bisectCulprit, decodeHalf, halfNotFinite, scanHalfRgba } from "@/experience/scene/blackFrame";

const NAN = 0x7e00;
const INF = 0x7c00;
const ONE = 0x3c00;

describe("black-frame probe helpers", () => {
  it("decodes halves", () => {
    expect(decodeHalf(ONE)).toBe(1);
    expect(decodeHalf(0xc000)).toBe(-2);
    expect(decodeHalf(0x7bff)).toBe(65504);
    expect(decodeHalf(0x0001)).toBeCloseTo(2 ** -24, 12);
    expect(decodeHalf(NAN)).toBeNaN();
    expect(decodeHalf(INF)).toBe(Infinity);
    expect(halfNotFinite(NAN) && halfNotFinite(INF) && !halfNotFinite(0x7bff)).toBe(true);
  });

  it("finds the first NaN pixel of an RGBA half buffer in GL order", () => {
    // 3 x 2 pixels; pixel (1, 1) is NaN in all four channels, as the glass shader wrote it.
    const data = new Uint16Array(3 * 2 * 4).fill(ONE);
    data.set([NAN, NAN, NAN, NAN], (1 * 3 + 1) * 4);
    expect(scanHalfRgba(data, 3)).toEqual({ nan: 4, inf: 0, max: 1, first: [1, 1] });
    expect(scanHalfRgba(new Uint16Array(8).fill(ONE), 2).first).toBeNull();
  });

  it("bisects to the one object that writes the bad pixel", () => {
    const items = Array.from({ length: 37 }, (_, i) => i);
    let renders = 0;
    const culprit = bisectCulprit(items, (shown) => {
      renders += 1;
      return shown.has(23);
    });
    expect(culprit).toBe(23);
    expect(renders).toBeLessThanOrEqual(1 + 2 * Math.ceil(Math.log2(items.length)));
    expect(bisectCulprit(items, () => false)).toBeNull();
    // Only a pair together reproduces it: no single culprit.
    expect(bisectCulprit(items, (shown) => shown.has(3) && shown.has(30))).toBeNull();
  });

  it("calls a frame black only when every sample has zero color", () => {
    expect(allBlack([[0, 0, 0, 255], [0, 0, 0, 0]])).toBe(true);
    expect(allBlack([[0, 0, 0, 255], [2, 1, 15, 255]])).toBe(false);
  });
});
