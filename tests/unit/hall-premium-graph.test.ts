import { describe, expect, it } from "vitest";
import { staticClosure } from "../helpers/import-graph";

const DIR = "src/experience/floors/lobby/hallPremium";
const MAIN_ENTRIES = ["src/experience/Experience.tsx", "src/experience/ExperienceGate.tsx", "src/hud/Hud.tsx"];
/** The loader and the pure wake easing are main-path modules; everything else is reached only from the chunk entry. */
const MAIN_ALLOWED = [`${DIR}/chunk.ts`, `${DIR}/wake.ts`];

describe("hall interiors chunk boundary", { timeout: 30_000 }, () => {
  it("keeps the interiors out of the main 3D path", () => {
    for (const entry of MAIN_ENTRIES) {
      const main = staticClosure(entry);
      expect([...main].filter((f) => f.startsWith(DIR) && !MAIN_ALLOWED.includes(f)), entry).toEqual([]);
    }
  });
  it.todo("reaches HallPremium.tsx from the scene entry (enabled in Task 5)");
});
