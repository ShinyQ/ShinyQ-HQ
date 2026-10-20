import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

const DIR = "src/experience/floors/lobby/office";
const ENTRY = `${DIR}/scene.ts`;
/** The drawer body entry: a second lazy chunk, loaded only when an office drawer opens. */
const BODY = `${DIR}/body.ts`;
/** Office-only modules: the scene entry reaches them; the main 3D path never does. */
const OFFICE_ONLY = [
  ENTRY,
  `${DIR}/live.ts`,
  `${DIR}/runtime.ts`,
  `${DIR}/officeVisual.ts`,
  `${DIR}/officeRig.ts`,
  `${DIR}/officeAtlas.ts`,
  `${DIR}/officeModel.ts`,
  `${DIR}/officeWall.ts`,
  `${DIR}/crew.ts`,
  `${DIR}/crewFx.ts`,
  `${DIR}/crewFrame.ts`,
  `${DIR}/interact.ts`,
  `${DIR}/OfficeScene.tsx`,
  `${DIR}/OfficeChips.tsx`,
  "src/lib/office/poll.ts",
  "src/lib/office/model.ts",
];
/** Office-only modules reached from the drawer body entry only (never from the scene entry). */
const BODY_ONLY = [BODY, `${DIR}/OfficeBody.tsx`];
/** The main-path part of the office: the loader, the mount with the furniture shell, the beacon signal and its watch, and the layout. */
const MAIN = [`${DIR}/chunk.ts`, `${DIR}/OfficeMount.tsx`, `${DIR}/officeSignal.ts`, `${DIR}/officeWatch.ts`, "src/experience/floors/lobby/officeLayout.ts", "src/experience/floors/lobby/officeShell.ts", "src/hud/OfficeLayer.tsx"];

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
      expect([...OFFICE_ONLY, ...BODY_ONLY].filter((f) => main.has(f)), entry).toEqual([]);
    }
  });

  it("keeps the loader, the mount and the layout on the main path", () => {
    const main = staticClosure("src/experience/Experience.tsx");
    for (const f of MAIN) expect(main.has(f), f).toBe(true);
  });

  it("keeps the 3D-only office helpers, the mount and experience/config out of the Classic site's shared page chunk", () => {
    // The Classic drawer host loads the office drawer body through the loader, which reads officeLayout.ts only.
    const classic = staticClosure("src/hud/drawer/DrawerHost.tsx");
    expect(classic.has(`${DIR}/chunk.ts`)).toBe(true);
    expect(classic.has("src/experience/floors/lobby/officeLayout.ts")).toBe(true);
    expect(classic.has("src/experience/config.ts")).toBe(false);
    const threeD = MAIN.filter((f) => !f.endsWith("officeLayout.ts") && f !== `${DIR}/chunk.ts`);
    expect(threeD.filter((f) => classic.has(f))).toEqual([]);
    const layout = readFileSync(join(ROOT, "src/experience/floors/lobby/officeLayout.ts"), "utf8");
    for (const name of ["officeShellBoxes", "officeBounds"]) expect(layout, name).not.toMatch(new RegExp(`export function ${name}\\b`));
  });

  it("lets no main-path file under src/experience or src/hud import a value from the office chunks", () => {
    const chunks = new Set([...staticClosure(ENTRY), ...staticClosure(BODY)]);
    const offenders = [...files(join(ROOT, "src/experience")), ...files(join(ROOT, "src/hud"))]
      .filter((f) => !chunks.has(f))
      .filter((f) => [...OFFICE_ONLY, ...BODY_ONLY].some((only) => staticClosure(f).has(only)));
    expect(offenders).toEqual([]);
    // One closure per file under two folders: slower than the default 5 s on a busy machine.
  }, 60_000);

  it("reaches every office-only module from its entry, imported dynamically from chunk.ts only", () => {
    const chunk = staticClosure(ENTRY);
    expect(OFFICE_ONLY.filter((f) => !chunk.has(f))).toEqual([]);
    // The drawer body is its own chunk: the scene never pulls it in.
    expect(BODY_ONLY.filter((f) => chunk.has(f))).toEqual([]);
    const body = staticClosure(BODY);
    expect(BODY_ONLY.filter((f) => !body.has(f))).toEqual([]);
    // Turbopack copies a module shared by the two async chunks into each one: the body stays off the canvas and 3D code.
    const sceneOnly = ["officeAtlas.ts", "officeWall.ts", "officeRig.ts", "crew.ts", "crewFx.ts", "crewFrame.ts", "OfficeScene.tsx", "OfficeChips.tsx", "interact.ts", "runtime.ts"].map((f) => `${DIR}/${f}`);
    expect(sceneOnly.filter((f) => body.has(f))).toEqual([]);
    const loader = readFileSync(join(ROOT, `${DIR}/chunk.ts`), "utf8");
    expect(loader.match(/import\(\s*["'][^"']*["']\s*\)/g)).toEqual([`import("./scene")`, `import("./body")`]);
    // A relative `./scene` or `./body` is an office entry only from inside the office folder (the intro chunk has its own scene).
    for (const name of ["scene", "body"]) {
      const importers = files(join(ROOT, "src")).filter((f) => {
        const text = readFileSync(join(ROOT, f), "utf8");
        return new RegExp(`import\\(\\s*["'][^"']*office/${name}["']\\s*\\)`).test(text) || (f.startsWith(`${DIR}/`) && new RegExp(`import\\(\\s*["']\\./${name}["']\\s*\\)`).test(text));
      });
      expect(importers, name).toEqual([`${DIR}/chunk.ts`]);
    }
  });

  it("starts the speculative load only after the first frame went idle and with prefetch on (`?prefetch=off`)", () => {
    const mount = readFileSync(join(ROOT, `${DIR}/OfficeMount.tsx`), "utf8");
    // The idle flag starts false and flips only inside the afterFirstFrameIdle callback.
    expect(mount).toMatch(/const idle = useRef\(false\)/);
    expect(mount.match(/idle\.current = true/g)).toHaveLength(1);
    expect(mount).toMatch(/afterFirstFrameIdle\(\(\) => \{\s*idle\.current = true;\s*stop = startOfficeWatch\(\);\s*\}\)/);
    // The one loadOffice call is gated by officeLoadWanted fed with that flag and speculativePrefetchOn.
    expect(mount.match(/loadOffice\(\)/g)).toHaveLength(1);
    expect(mount).toMatch(/const want = officeLoadWanted\(\{\s*idle: idle\.current,[^}]*prefetch: prefetch\.current,/);
    expect(mount).toMatch(/prefetch\.current \?\?= speculativePrefetchOn\(window\.location\.search\)/);
    expect(mount).toMatch(/if \(want\) void loadOffice\(\)/);
  });

  it("starts the 3D office beside the body when an office drawer opens (a user action, so even with `?prefetch=off`)", () => {
    const body = readFileSync(join(ROOT, `${DIR}/OfficeBody.tsx`), "utf8");
    expect(body).toMatch(/officeLive\.want\("drawer", true\);[^}]*void loadOffice\(\)\.catch\(\(\) => null\);/);
    expect(readFileSync(join(ROOT, "src/hud/drawer/bodies.tsx"), "utf8")).toMatch(/const OfficeBody = chunkBody\(\(\) => loadOfficeBody\(\)/);
  });
});
