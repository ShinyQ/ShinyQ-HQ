import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

/** The first-session tour chunk (tourChunk.ts loads it only for a session that plays the tour, or Replay tutorial). */
const ENTRY = "src/hud/dialog/onboarding.ts";

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full));
  }
  return out;
}

describe("tour chunk boundary", () => {
  it("keeps the tour script out of the main 3D chunk and the gate", () => {
    for (const entry of ["src/experience/Experience.tsx", "src/experience/ExperienceGate.tsx"]) {
      expect(staticClosure(entry).has(ENTRY), entry).toBe(false);
    }
  });

  it("keeps the loader on the main path", () => {
    expect(staticClosure("src/experience/Experience.tsx").has("src/hud/dialog/tourChunk.ts")).toBe(true);
  });

  it("imports the entry dynamically from tourChunk.ts only, and the entry imports no values", () => {
    const importers = files(join(ROOT, "src")).filter((f) => /import\(\s*["'][^"']*\/onboarding["']\s*\)/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(importers).toEqual(["src/hud/dialog/tourChunk.ts"]);
    // Type-only imports keep shared modules out of the chunk, so Turbopack never regroups them.
    expect([...staticClosure(ENTRY)]).toEqual([ENTRY]);
  }, 60_000);
});
