import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Spectacle round (owner request 2026-10-13: "i dont like wording on floor"): no text lies flat on a
 * floor; words float as signs (`fx/FloatingSign.tsx`). This scan fails when a drei or troika text is
 * laid flat (rotated -90 degrees about x, or a BatchedLabel tilted back a quarter turn) anywhere in the
 * 3D code. The runtime check is `__hq.probes` in e2e/spectacle.spec.ts.
 */

const ROOT = join(__dirname, "../../src/experience");
/** Dev-only routes (never in the export). */
const SKIP_DIRS = new Set(["prototype"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const FLAT_ROTATION = /rotation=\{\[\s*-\s*Math\.PI\s*\/\s*2\b/;
const FLAT_TILT = /tilt:\s*Math\.PI\s*\/\s*2\b/;

/** Each `<Text ...>` opening tag with its props (up to the end of the opening tag). */
function textTags(source: string): string[] {
  const out: string[] = [];
  for (let i = source.indexOf("<Text"); i >= 0; i = source.indexOf("<Text", i + 5)) {
    if (/[A-Za-z]/.test(source[i + 5] ?? "")) continue;
    let depth = 0;
    let j = i;
    for (; j < source.length; j++) {
      const ch = source[j];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    out.push(source.slice(i, j + 1));
  }
  return out;
}

export function flatTextOffenders(root = ROOT): string[] {
  const out: string[] = [];
  for (const path of files(root)) {
    const rel = relative(root, path);
    const source = readFileSync(path, "utf8");
    if (textTags(source).some((tag) => FLAT_ROTATION.test(tag))) out.push(`${rel}: <Text> rotated flat`);
    if (FLAT_TILT.test(source)) out.push(`${rel}: label tilted flat`);
  }
  return out;
}

describe("floor text audit", () => {
  it("finds a flat text in a fixture", () => {
    expect(textTags(`<Text font={a} rotation={[-Math.PI / 2, 0, 0]}>x</Text>`).some((t) => FLAT_ROTATION.test(t))).toBe(true);
    expect(textTags(`<Text font={a} rotation={[-0.55, 0, 0]}>x</Text>`).some((t) => FLAT_ROTATION.test(t))).toBe(false);
    expect(textTags(`<TextArea rotation={[-Math.PI / 2, 0, 0]} />`)).toEqual([]);
    expect(FLAT_TILT.test(`{ text: "A", tilt: Math.PI / 2 }`)).toBe(true);
  });

  it("lays no words flat on any floor", () => {
    expect(flatTextOffenders()).toEqual([]);
  });
});
