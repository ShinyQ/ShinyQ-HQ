import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

/** The touch controls chunk (touchChunk.ts loads it only on a coarse pointer, spec 2026-10-29, decision 3.8). */
const ENTRY = "src/hud/Joystick.tsx";
/** Main-path modules the chunk must reach only through `bindTouch` (a static import would cost wrapper bytes on the main path). */
const MAIN_ONLY = ["src/experience/input/joystick.ts"];

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full));
  }
  return out;
}

describe("touch controls chunk boundary", () => {
  it("keeps the touch controls and the stick gesture out of the main 3D chunk and the gate", () => {
    for (const entry of ["src/experience/Experience.tsx", "src/experience/ExperienceGate.tsx"]) {
      const closure = staticClosure(entry);
      expect(closure.has(ENTRY), entry).toBe(false);
      expect(closure.has("src/experience/input/floatingStick.ts"), entry).toBe(false);
      expect(closure.has("src/hud/boost.ts"), entry).toBe(false);
    }
  });

  it("keeps the loader and the world input's handler slot on the main path", () => {
    const main = staticClosure("src/experience/Experience.tsx");
    expect(main.has("src/hud/touchChunk.ts")).toBe(true);
    expect(main.has("src/experience/input/joystick.ts")).toBe(true);
  });

  it("imports the entry dynamically from touchChunk.ts only, and never imports a main-path value", () => {
    const importers = files(join(ROOT, "src")).filter((f) => /import\(\s*["'][^"']*\/Joystick["']\s*\)/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(importers).toEqual(["src/hud/touchChunk.ts"]);
    const closure = staticClosure(ENTRY);
    for (const file of MAIN_ONLY) expect(closure.has(file), file).toBe(false);
  }, 60_000);
});
