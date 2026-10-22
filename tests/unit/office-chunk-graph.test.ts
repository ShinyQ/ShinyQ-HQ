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
  `${DIR}/pipeline.ts`,
  `${DIR}/pipelineFx.ts`,
  `${DIR}/interact.ts`,
  `${DIR}/OfficeScene.tsx`,
  `${DIR}/OfficeChips.tsx`,
  `${DIR}/chipRows.ts`,
  `${DIR}/replayLink.ts`,
  "src/lib/office/poll.ts",
  "src/lib/office/model.ts",
];
/** Office-only modules reached from the drawer body entry only (never from the scene entry). */
const BODY_ONLY = [BODY, `${DIR}/OfficeBody.tsx`, `${DIR}/crewSummary.ts`];
/** The watch chunk entry (idle on L1, in the session total) and the beacon chunk entry (on the first ask). */
const WATCH = `${DIR}/watchChunk.ts`;
const BEACON = `${DIR}/beaconChunk.ts`;
/** Reached from the watch chunk entry, never from the main path (the signal is shared with the scene and beacon chunks). */
const WATCH_ONLY = [WATCH, `${DIR}/officeSignal.ts`, `${DIR}/officeWatch.ts`, "src/hud/minimap/OfficeCue.tsx"];
/** Reached from the beacon chunk entry only: never from the main path or the watch chunk. */
const BEACON_ONLY = [BEACON, `${DIR}/beacon.ts`, `${DIR}/OfficeBeacon.tsx`];
/** The replay chunk entry (on the idle-loop condition or the drawer's replay control, through `replayLink.ts`). */
const REPLAY = `${DIR}/replayChunk.ts`;
/** Reached from the replay chunk entry only: never from the main path, the scene or body entries, the watch, the beacon or the Classic card. */
const REPLAY_ONLY = [REPLAY, `${DIR}/replay.ts`, `${DIR}/replayFeed.ts`, "src/lib/office/protocolHistory.ts"];
/** The drawer's day replay controls: their own lazy chunk, imported from the replay chunk entry (so `replay.ts` is shared, never copied). */
const CONTROLS = `${DIR}/ReplayControls.tsx`;
/** The main-path part of the office: the loaders, the mount with the furniture shell and the layout. */
const MAIN = [`${DIR}/chunk.ts`, `${DIR}/watchLoader.ts`, `${DIR}/OfficeMount.tsx`, "src/experience/floors/lobby/officeLayout.ts", "src/experience/floors/lobby/officeShell.ts", "src/hud/OfficeLayer.tsx"];
/** Main-path entries: the 3D chunk, the gate and the HUD (the minimap draws the cue from the watch chunk). */
const MAIN_ENTRIES = ["src/experience/Experience.tsx", "src/experience/ExperienceGate.tsx", "src/hud/Hud.tsx", "src/hud/minimap/Minimap.tsx", "src/hud/minimap/MapLayers.tsx"];

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full));
  }
  return out;
}

// Walks the import graph of src/; a loaded CI runner can pass the 5 s default.
describe("Agent Office chunk boundary", { timeout: 30_000 }, () => {
  it("keeps the office-only code, the watch and the beacon out of the main 3D chunk, the gate and the HUD", () => {
    for (const entry of MAIN_ENTRIES) {
      const main = staticClosure(entry);
      expect([...OFFICE_ONLY, ...BODY_ONLY, ...WATCH_ONLY, ...BEACON_ONLY, ...REPLAY_ONLY].filter((f) => main.has(f)), entry).toEqual([]);
    }
  });

  it("keeps the beacon mesh out of the watch chunk and both out of the scene and body chunks", () => {
    const watch = staticClosure(WATCH);
    expect(WATCH_ONLY.filter((f) => !watch.has(f))).toEqual([]);
    expect(BEACON_ONLY.filter((f) => watch.has(f))).toEqual([]);
    const beacon = staticClosure(BEACON);
    expect(BEACON_ONLY.filter((f) => !beacon.has(f))).toEqual([]);
    for (const entry of [ENTRY, BODY]) {
      const chunk = staticClosure(entry);
      expect([WATCH, `${DIR}/officeWatch.ts`, "src/hud/minimap/OfficeCue.tsx", ...BEACON_ONLY].filter((f) => chunk.has(f)), entry).toEqual([]);
    }
  });

  it("references the watch and beacon chunks only through the two import() calls of watchLoader.ts", () => {
    const loader = readFileSync(join(ROOT, `${DIR}/watchLoader.ts`), "utf8");
    expect(loader.match(/import\(\s*["'][^"']*["']\s*\)/g)).toEqual([`import("./watchChunk")`, `import("./beaconChunk")`]);
    expect(loader.match(/^import .* from "([^"]+)";$/gm)).toEqual(['import { useSyncExternalStore } from "react";', 'import type * as BeaconChunk from "./beaconChunk";', 'import type * as WatchChunk from "./watchChunk";']);
    for (const name of ["watchChunk", "beaconChunk"]) {
      const importers = files(join(ROOT, "src")).filter((f) => new RegExp(`import\\(\\s*["'][^"']*${name}["']\\s*\\)`).test(readFileSync(join(ROOT, f), "utf8")));
      expect(importers, name).toEqual([`${DIR}/watchLoader.ts`]);
    }
  });

  it("keeps the v4 validators (`protocolV4.ts`) in the scene chunk only: off the drawer body, the watch and the Classic card", () => {
    const v4 = "src/lib/office/protocolV4.ts";
    expect(staticClosure(ENTRY).has(v4)).toBe(true);
    for (const entry of [BODY, WATCH, BEACON, "src/components/office/OfficePanel.tsx"]) expect(staticClosure(entry).has(v4), entry).toBe(false);
    expect(readFileSync(join(ROOT, "src/lib/office/protocol.ts"), "utf8")).not.toMatch(/^export .* from "\.\/protocolV4";$/m);
  });

  it("keeps the replay engine, feed and history validators in the replay chunk, loaded only through replayLink.ts", () => {
    const replay = staticClosure(REPLAY);
    expect(REPLAY_ONLY.filter((f) => !replay.has(f))).toEqual([]);
    for (const entry of [...MAIN_ENTRIES, ENTRY, BODY, WATCH, BEACON, "src/components/office/OfficePanel.tsx", "src/hud/drawer/DrawerHost.tsx"]) {
      const closure = staticClosure(entry);
      expect(REPLAY_ONLY.filter((f) => closure.has(f)), entry).toEqual([]);
    }
    expect(staticClosure(ENTRY).has(`${DIR}/replayLink.ts`)).toBe(true);
    // No three in the replay chunk's closure (the probes import it): a three import from it splits three out of the main 3D chunk.
    expect([...replay].filter((f) => /^import [^;]*from "three";$/m.test(readFileSync(join(ROOT, f), "utf8")))).toEqual([]);
    const importers = files(join(ROOT, "src")).filter((f) => /import\(\s*["'][^"']*replayChunk["']\s*\)/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(importers).toEqual([`${DIR}/replayLink.ts`]);
    expect(readFileSync(join(ROOT, "src/lib/office/protocol.ts"), "utf8")).not.toMatch(/^export .* from "\.\/protocolHistory";$/m);
  });

  it("keeps the day replay controls in their own chunk, imported only from the replay chunk entry", () => {
    expect(staticClosure(REPLAY).has(CONTROLS)).toBe(false);
    for (const entry of [...MAIN_ENTRIES, ENTRY, BODY, WATCH, BEACON, "src/components/office/OfficePanel.tsx", "src/hud/drawer/DrawerHost.tsx"]) expect(staticClosure(entry).has(CONTROLS), entry).toBe(false);
    const controls = [...staticClosure(CONTROLS)];
    expect(controls.filter((f) => /^import [^;]*from "three";$/m.test(readFileSync(join(ROOT, f), "utf8")))).toEqual([]);
    const importers = files(join(ROOT, "src")).filter((f) => /import\(\s*["'][^"']*ReplayControls["']\s*\)/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(importers).toEqual([REPLAY]);
  });

  it("keeps the loader, the mount and the layout on the main path", () => {
    const main = staticClosure("src/experience/Experience.tsx");
    for (const f of MAIN) expect(main.has(f), f).toBe(true);
  });

  it("keeps the chip row's placement in the scene chunk (`chipRows.ts`), off the main path's `officeShell.ts`", () => {
    const shell = readFileSync(join(ROOT, "src/experience/floors/lobby/officeShell.ts"), "utf8");
    for (const name of ["CHIP_ROW", "OFFICE_CHIP_ANCHORS", "OFFICE_CHIP_TOP", "OFFICE_CHIP_FAR", "officeHudBoxes", "segmentHitsBox", "chipRowBounds", "chipMaxWidth", "chipsOneLine", "chipsDotsOnly", "layoutChipRow", "layoutChipRows", "nextChipFar"])
      expect(shell, name).not.toMatch(new RegExp(`export (const|function) ${name}\\b`));
  });

  it("keeps the 3D-only office helpers, the mount and experience/config out of the Classic site's shared page chunk", () => {
    // The Classic drawer host loads the office drawer body through the loader, which reads no layout (the always-live
    // trigger asks no distance).
    const classic = staticClosure("src/hud/drawer/DrawerHost.tsx");
    expect(classic.has(`${DIR}/chunk.ts`)).toBe(true);
    expect(classic.has("src/experience/floors/lobby/officeLayout.ts")).toBe(false);
    expect(classic.has("src/experience/config.ts")).toBe(false);
    const threeD = MAIN.filter((f) => !f.endsWith("officeLayout.ts") && f !== `${DIR}/chunk.ts`);
    expect(threeD.filter((f) => classic.has(f))).toEqual([]);
    const layout = readFileSync(join(ROOT, "src/experience/floors/lobby/officeLayout.ts"), "utf8");
    for (const name of ["officeShellBoxes", "officeBounds"]) expect(layout, name).not.toMatch(new RegExp(`export function ${name}\\b`));
  });

  it("lets no main-path file under src/experience or src/hud import a value from the office chunks", () => {
    const chunks = new Set([...staticClosure(ENTRY), ...staticClosure(BODY), ...staticClosure(WATCH), ...staticClosure(BEACON), ...staticClosure(REPLAY), ...staticClosure(CONTROLS)]);
    const offenders = [...files(join(ROOT, "src/experience")), ...files(join(ROOT, "src/hud"))]
      .filter((f) => !chunks.has(f))
      .filter((f) => [...OFFICE_ONLY, ...BODY_ONLY, ...WATCH_ONLY, ...BEACON_ONLY, ...REPLAY_ONLY].some((only) => staticClosure(f).has(only)));
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
    // The drawer reads the one poller from the loaded scene module (`useOfficeModule`): no copy of it, the poll loop or the protocol validators.
    expect([`${DIR}/live.ts`, "src/lib/office/poll.ts"].filter((f) => body.has(f))).toEqual([]);
    const sceneOnly = ["chipRows.ts", "officeAtlas.ts", "officeWall.ts", "officeRig.ts", "crew.ts", "crewFx.ts", "crewFrame.ts", "OfficeScene.tsx", "OfficeChips.tsx", "interact.ts", "runtime.ts"].map((f) => `${DIR}/${f}`);
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
    expect(mount).toMatch(/afterFirstFrameIdle\(\(\) => \{\s*idle\.current = true;\s*setIdleNow\(true\);\s*\}\)/);
    // The watch chunk loads after that idle flag, on L1 only and with prefetch on; its watch runs once the chunk is here.
    expect(mount).toMatch(/if \(idleNow && onL1 && speculativePrefetchOn\(window\.location\.search\)\) void loadOfficeWatch\(\)/);
    expect(mount.match(/loadOfficeWatch\(\)/g)).toHaveLength(1);
    expect(mount).toMatch(/idleNow && watch \? watch\.startOfficeWatch\(\) : undefined/);
    // The beacon mounts from its chunk once ready (the full tier's composer exists).
    expect(mount).toMatch(/\{ready && beacon && <beacon\.OfficeBeacon \/>\}/);
    // The one loadOffice call is gated by officeLoadWanted fed with that flag and speculativePrefetchOn.
    expect(mount.match(/loadOffice\(\)/g)).toHaveLength(1);
    expect(mount).toMatch(/const want = officeLoadWanted\(\{\s*idle: idle\.current,[^}]*prefetch: prefetch\.current,/);
    expect(mount).toMatch(/prefetch\.current \?\?= speculativePrefetchOn\(window\.location\.search\)/);
    expect(mount).toMatch(/if \(want\) void loadOffice\(\)/);
  });

  it("starts the 3D office beside the body when an office drawer opens (a user action, so even with `?prefetch=off`)", () => {
    const body = readFileSync(join(ROOT, `${DIR}/OfficeBody.tsx`), "utf8");
    expect(body).toMatch(/useEffect\(\(\) => \{\s*\/\/[^\n]*\n\s*void loadOffice\(\)\.catch\(/);
    expect(body).toMatch(/officeLive\.want\("drawer", true\);/);
    expect(readFileSync(join(ROOT, "src/hud/drawer/bodies.tsx"), "utf8")).toMatch(/const OfficeBody = chunkBody\(\(\) => loadOfficeBody\(\)/);
  });
});
