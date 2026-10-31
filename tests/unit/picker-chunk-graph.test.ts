import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

/** The pad picker sheet chunk (pickerChunk.ts loads it when a pad picker first opens, owner decision 2026-10-28). */
const ENTRY = "src/hud/pads/PickerSheet.tsx";

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full));
  }
  return out;
}

describe("pad picker sheet chunk boundary", () => {
  it("keeps the sheet out of the main 3D chunk and the gate", () => {
    for (const entry of ["src/experience/Experience.tsx", "src/experience/ExperienceGate.tsx", "src/hud/pads/PadPicker.tsx"]) {
      expect(staticClosure(entry).has(ENTRY), entry).toBe(false);
    }
  });

  it("keeps the loader and the picker wiring on the main path", () => {
    const main = staticClosure("src/experience/Experience.tsx");
    expect(main.has("src/hud/pads/pickerChunk.ts")).toBe(true);
    expect(main.has("src/hud/pads/PadPicker.tsx")).toBe(true);
  });

  it("imports the entry dynamically from pickerChunk.ts only", () => {
    const importers = files(join(ROOT, "src")).filter((f) => /import\(\s*["'][^"']*\/PickerSheet["']\s*\)/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(importers).toEqual(["src/hud/pads/pickerChunk.ts"]);
  }, 60_000);
});
