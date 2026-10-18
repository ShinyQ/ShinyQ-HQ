import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { unsafeShaderPows } from "../helpers/shader-pow";

// GLSL pow(x, y) is undefined for x < 0 and returns NaN on Apple GPUs. One NaN pixel in the full tier's HDR buffer
// spreads through the mipmap bloom and turns the whole frame black (the L1 black flicker, 2026-10-18), so every
// pow() in our shaders takes a base that is non-negative by construction.
const root = path.resolve(__dirname, "../..");

function sources(dir: string): string[] {
  return readdirSync(path.join(root, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)));
}

describe("shader pow() bases", () => {
  it("flags a base that may go negative and accepts guarded ones", () => {
    expect(unsafeShaderPows("float f = pow(1.-abs(dot(n, v)), 2.2);")).toEqual(["1.-abs(dot(n, v))"]);
    expect(unsafeShaderPows("float k = exp(-pow((y - p) * 9., 2.));")).toEqual(["(y - p) * 9."]);
    expect(unsafeShaderPows("float f = pow(max(1.-abs(dot(n, v)), 0.), 2.2);")).toEqual([]);
    expect(unsafeShaderPows("float g = pow(clamp(x, 0., 1.), 3.); float h = pow(abs(x), 2.);")).toEqual([]);
    expect(unsafeShaderPows("float s = max(dot(d, uSun), 0.); col += pow(s, 6.);")).toEqual([]);
    expect(unsafeShaderPows("float s = dot(d, uSun); col += pow(s, 6.);")).toEqual(["s"]);
    expect(unsafeShaderPows("float x = pow(2., -y);")).toEqual([]);
    expect(unsafeShaderPows("const k = Math.pow(1 - t, 3);")).toEqual([]);
  });

  it("every GLSL pow() in src takes a non-negative base", () => {
    const offenders = sources("src").flatMap((file) => unsafeShaderPows(readFileSync(path.join(root, file), "utf8")).map((base) => `${file}: pow(${base}, ...)`));
    expect(offenders).toEqual([]);
  });
});
