import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

/** The Corners menu sheet chunk (menuChunk.ts loads it on the menu button's first press, owner decision 2026-10-28). */
const ENTRY = "src/hud/menu/MenuSheet.tsx";

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full));
  }
  return out;
}

describe("menu sheet chunk boundary", () => {
  it("keeps the sheet body out of the main 3D chunk and the gate", () => {
    for (const entry of ["src/experience/Experience.tsx", "src/experience/ExperienceGate.tsx", "src/hud/menu/HudMenu.tsx"]) {
      expect(staticClosure(entry).has(ENTRY), entry).toBe(false);
    }
  });

  it("keeps the loader and the menu button on the main path", () => {
    const main = staticClosure("src/experience/Experience.tsx");
    expect(main.has("src/hud/menu/menuChunk.ts")).toBe(true);
    expect(main.has("src/hud/menu/HudMenu.tsx")).toBe(true);
  });

  it("imports the entry dynamically from menuChunk.ts only", () => {
    const importers = files(join(ROOT, "src")).filter((f) => /import\(\s*["'][^"']*\/MenuSheet["']\s*\)/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(importers).toEqual(["src/hud/menu/menuChunk.ts"]);
  }, 60_000);
});
