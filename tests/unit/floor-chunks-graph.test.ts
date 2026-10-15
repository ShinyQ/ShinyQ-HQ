import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

const MAIN = staticClosure("src/experience/Experience.tsx");

/** Code that must reach the browser only through a floor chunk. */
const LAZY_ONLY = [
  "src/experience/floors/Labs.tsx",
  "src/experience/floors/Library.tsx",
  "src/experience/floors/Roof.tsx",
  "src/experience/floors/chunks/labs.ts",
  "src/experience/floors/chunks/library.ts",
  "src/experience/floors/chunks/roof.ts",
  "src/hud/drawer/ascii.ts",
  "src/hud/drawer/OpsBody.tsx",
  "src/hud/drawer/ReactorBody.tsx",
  "src/hud/drawer/ResearchBody.tsx",
  "src/hud/drawer/TopicsBody.tsx",
  "src/hud/HologramOverlay.tsx",
  "src/components/stats/VisitsPanel.tsx",
];

describe("floor chunk boundaries (Round 7 B)", () => {
  it("keeps L3, L4 and RF code out of the main 3D chunk's static imports", () => {
    expect(LAZY_ONLY.filter((f) => MAIN.has(f))).toEqual([]);
  });

  it("keeps L1 and L2 in the main 3D chunk", () => {
    expect(MAIN.has("src/experience/floors/Lobby.tsx")).toBe(true);
    expect(MAIN.has("src/experience/floors/CareerArchive.tsx")).toBe(true);
  });

  it("puts each floor and its HUD pieces in its chunk entry", () => {
    const labs = staticClosure("src/experience/floors/chunks/labs.ts");
    expect(["src/experience/floors/Labs.tsx", "src/hud/drawer/OpsBody.tsx", "src/hud/drawer/ReactorBody.tsx", "src/hud/HologramOverlay.tsx"].every((f) => labs.has(f))).toBe(true);
    const library = staticClosure("src/experience/floors/chunks/library.ts");
    expect(["src/experience/floors/Library.tsx", "src/hud/drawer/ResearchBody.tsx", "src/hud/drawer/TopicsBody.tsx"].every((f) => library.has(f))).toBe(true);
    expect(staticClosure("src/experience/floors/chunks/roof.ts").has("src/experience/floors/Roof.tsx")).toBe(true);
  });

  it("imports each chunk entry dynamically from floorChunks.ts only", () => {
    const loader = readFileSync(join(ROOT, "src/experience/floors/floorChunks.ts"), "utf8");
    for (const name of ["labs", "library", "roof"]) expect(loader).toContain(`import("./chunks/${name}")`);
  });
});
