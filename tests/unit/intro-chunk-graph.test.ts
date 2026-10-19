import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

/** The intro chunk entry and the modules only it may reach (intro/chunk.ts loads it for a session that plays the intro). */
const ENTRY = "src/experience/intro/scene.ts";
const INTRO_ONLY = [
  "src/experience/camera/intro.ts",
  ENTRY,
  "src/experience/intro/IntroBeacons.tsx",
  "src/experience/intro/IntroVeil.tsx",
  "src/experience/intro/beacons.ts",
  "src/experience/intro/landmarks.ts",
];

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full));
  }
  return out;
}

describe("intro chunk boundary", () => {
  it("keeps the intro-only code out of the main 3D chunk and the gate", () => {
    for (const entry of ["src/experience/Experience.tsx", "src/experience/ExperienceGate.tsx"]) {
      const main = staticClosure(entry);
      expect(INTRO_ONLY.filter((f) => main.has(f)), entry).toEqual([]);
    }
  });

  it("lets no main-path file under src/experience import a value from the intro chunk", () => {
    const chunk = staticClosure(ENTRY);
    const offenders = files(join(ROOT, "src/experience"))
      .filter((f) => !chunk.has(f))
      .filter((f) => INTRO_ONLY.some((only) => staticClosure(f).has(only)));
    expect(offenders).toEqual([]);
  });

  it("keeps the shared intro state on the main path", () => {
    const main = staticClosure("src/experience/Experience.tsx");
    for (const f of ["src/experience/intro/runtime.ts", "src/experience/intro/IntroReveal.tsx", "src/experience/intro/chunk.ts"]) expect(main.has(f), f).toBe(true);
  });

  it("puts the beacons and the veil in the chunk entry, imported dynamically from intro/chunk.ts only", () => {
    const chunk = staticClosure(ENTRY);
    expect(INTRO_ONLY.every((f) => chunk.has(f))).toBe(true);
    expect(readFileSync(join(ROOT, "src/experience/intro/chunk.ts"), "utf8")).toContain(`import("./scene")`);
    // A relative `./scene` is the intro entry only from inside src/experience/intro (the office chunk has its own).
    const importers = files(join(ROOT, "src")).filter((f) => {
      const text = readFileSync(join(ROOT, f), "utf8");
      return /import\(\s*["'][^"']*intro\/scene["']\s*\)/.test(text) || (f.startsWith("src/experience/intro/") && /import\(\s*["']\.\/scene["']\s*\)/.test(text));
    });
    expect(importers).toEqual(["src/experience/intro/chunk.ts"]);
  });
});
