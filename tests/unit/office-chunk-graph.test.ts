import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

const DIR = "src/experience/floors/lobby/office";
const ENTRY = `${DIR}/scene.ts`;
/** Office-only modules: the chunk entry reaches them; the main 3D path never does. */
const OFFICE_ONLY = [
  ENTRY,
  `${DIR}/live.ts`,
  `${DIR}/runtime.ts`,
  `${DIR}/officeVisual.ts`,
  `${DIR}/officeRig.ts`,
  `${DIR}/officeAtlas.ts`,
  `${DIR}/officeModel.ts`,
  `${DIR}/officeWall.ts`,
  `${DIR}/interact.ts`,
  `${DIR}/OfficeScene.tsx`,
  `${DIR}/OfficeChips.tsx`,
  "src/lib/office/poll.ts",
  "src/lib/office/model.ts",
];
/** The main-path part of the office: the loader, the mount with the furniture shell and the layout. */
const MAIN = [`${DIR}/chunk.ts`, `${DIR}/OfficeMount.tsx`, "src/experience/floors/lobby/officeLayout.ts", "src/hud/OfficeLayer.tsx"];

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full));
  }
  return out;
}

describe("Agent Office chunk boundary", () => {
  it("keeps the office-only code out of the main 3D chunk and the gate", () => {
    for (const entry of ["src/experience/Experience.tsx", "src/experience/ExperienceGate.tsx"]) {
      const main = staticClosure(entry);
      expect(OFFICE_ONLY.filter((f) => main.has(f)), entry).toEqual([]);
    }
  });

  it("keeps the loader, the mount and the layout on the main path", () => {
    const main = staticClosure("src/experience/Experience.tsx");
    for (const f of MAIN) expect(main.has(f), f).toBe(true);
  });

  it("lets no main-path file under src/experience or src/hud import a value from the office chunk", () => {
    const chunk = staticClosure(ENTRY);
    const offenders = [...files(join(ROOT, "src/experience")), ...files(join(ROOT, "src/hud"))]
      .filter((f) => !chunk.has(f))
      .filter((f) => OFFICE_ONLY.some((only) => staticClosure(f).has(only)));
    expect(offenders).toEqual([]);
    // One closure per file under two folders: slower than the default 5 s on a busy machine.
  }, 60_000);

  it("reaches every office-only module from the entry, imported dynamically from chunk.ts only", () => {
    const chunk = staticClosure(ENTRY);
    expect(OFFICE_ONLY.filter((f) => !chunk.has(f))).toEqual([]);
    expect(readFileSync(join(ROOT, `${DIR}/chunk.ts`), "utf8")).toContain(`import("./scene")`);
    // A relative `./scene` is the office entry only from inside the office folder (the intro chunk has its own).
    const importers = files(join(ROOT, "src")).filter((f) => {
      const text = readFileSync(join(ROOT, f), "utf8");
      return /import\(\s*["'][^"']*office\/scene["']\s*\)/.test(text) || (f.startsWith(`${DIR}/`) && /import\(\s*["']\.\/scene["']\s*\)/.test(text));
    });
    expect(importers).toEqual([`${DIR}/chunk.ts`]);
  });

  it("starts the speculative load only after the first frame went idle and with prefetch on (`?prefetch=off`)", () => {
    const mount = readFileSync(join(ROOT, `${DIR}/OfficeMount.tsx`), "utf8");
    // The idle flag starts false and flips only inside the afterFirstFrameIdle callback.
    expect(mount).toMatch(/const idle = useRef\(false\)/);
    expect(mount.match(/idle\.current = true/g)).toHaveLength(1);
    expect(mount).toMatch(/afterFirstFrameIdle\(\(\) => \{\s*idle\.current = true;\s*\}\)/);
    // The one loadOffice call is gated by officeLoadWanted fed with that flag and speculativePrefetchOn.
    expect(mount.match(/loadOffice\(\)/g)).toHaveLength(1);
    expect(mount).toMatch(/const want = officeLoadWanted\(\{\s*idle: idle\.current,[^}]*prefetch: prefetch\.current,/);
    expect(mount).toMatch(/prefetch\.current \?\?= speculativePrefetchOn\(window\.location\.search\)/);
    expect(mount).toMatch(/if \(want\) void loadOffice\(\)/);
  });
});
