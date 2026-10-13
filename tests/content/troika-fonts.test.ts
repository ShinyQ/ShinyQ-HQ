import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../src/experience/troika-fonts.json";
import { inWorldCodePoints, latinCodePoints } from "../../scripts/troika-glyphs";
import { woffCodePoints } from "../helpers/woff";

/*
 * In-world (troika) fonts: subset to the characters 3D text can render (scripts/troika-fonts.ts),
 * served under content-hashed names so /fonts/* is cached for a year (public/_headers).
 */
const root = process.cwd();
const BUDGET = 64 * 1024;
const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
const fonts = Object.entries(manifest).map(([key, url]) => ({ key, url, bytes: readFileSync(path.join(root, "public", url)) }));

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else out.push(full);
  }
  return out;
}

describe("troika fonts", () => {
  it("are content-hashed WOFF files under /fonts/3d", () => {
    for (const font of fonts) {
      const match = /^\/fonts\/3d\/[a-z0-9-]+\.([0-9a-f]{8})\.woff$/.exec(font.url);
      expect(match, font.url).not.toBeNull();
      expect(createHash("sha256").update(font.bytes).digest("hex").slice(0, 8), font.url).toBe(match![1]);
    }
  });

  it("are the only font files served from public/fonts (immutable cache rule)", () => {
    const served = files(path.join(root, "public", "fonts")).filter((f) => /\.(woff2?|ttf|otf)$/.test(f)).map((f) => `/${path.relative(path.join(root, "public"), f).split(path.sep).join("/")}`);
    expect(served.sort()).toEqual(Object.values(manifest).sort());
  });

  it("stay within the 3D font budget", () => {
    expect(fonts.reduce((sum, f) => sum + f.bytes.length, 0)).toBeLessThanOrEqual(BUDGET);
  });

  it("keep the whole Latin set in every text cut", () => {
    for (const font of fonts.filter((f) => f.key !== "symbols")) {
      const points = woffCodePoints(font.bytes);
      expect(latinCodePoints().filter((cp) => !points.has(cp)).map(hex), font.key).toEqual([]);
    }
  });

  it("cover every in-world character with the text cut or the symbols fallback", () => {
    const symbols = woffCodePoints(fonts.find((f) => f.key === "symbols")!.bytes);
    const used = inWorldCodePoints(root);
    for (const font of fonts.filter((f) => f.key !== "symbols")) {
      const points = woffCodePoints(font.bytes);
      const missing = [...used].filter(([cp]) => !points.has(cp) && !symbols.has(cp)).map(([cp, file]) => `${hex(cp)} ${JSON.stringify(String.fromCodePoint(cp))} (${file})`);
      expect(missing, font.key).toEqual([]);
    }
  });
});
