import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FLOOR_IDS, floorIndex, LOBBY, READY_FLOORS } from "@/experience/config";
import * as order from "@/experience/floorOrder";
import { LOBBY_SPAWN, LOBBY_SPAWN_HEADING } from "@/experience/floors/lobby/spawn";
import { ROOT, staticClosure } from "../helpers/import-graph";

const LIGHT = ["src/experience/floorOrder.ts", "src/experience/floors/lobby/spawn.ts"];
/** Light 3D modules Classic code reads on purpose: the Visitor Observatory room id and the career type icons (TypeIcon). */
const CLASSIC_OK = ["src/experience/floors/lobby/visitsRoom.ts", "src/experience/fx/holoIcons.ts"];

/** Value imports the light modules may make: the floor lists only (types are erased). */
const ALLOWED_VALUE_IMPORTS = new Set(["@/lib/floors"]);
const ALLOWED_TYPE_IMPORTS = new Set(["@/lib/floors", "@/content/schema", "../types", "../../types"]);

/** Modules every Classic page loads (the store and the HUD pieces the layout mounts) that must stay off the floor layouts. */
const CLASSIC_ENTRIES = ["src/store/useHQStore.ts", "src/hud/drawer/DrawerHost.tsx", "src/hud/switchLocale.ts"];

describe("floor order module (perf item 3)", () => {
  it("keeps the floor order and index of experience/config", () => {
    expect(order.FLOOR_IDS).toEqual(FLOOR_IDS);
    expect(READY_FLOORS).toEqual(order.FLOOR_IDS);
    for (const id of FLOOR_IDS) expect(order.floorIndex(id)).toBe(floorIndex(id));
  });

  it("keeps the Lobby spawn and heading of experience/config", () => {
    expect(LOBBY.spawn).toBe(LOBBY_SPAWN);
    expect(LOBBY.spawnHeading).toBe(LOBBY_SPAWN_HEADING);
  });

  it("imports only the floor lists and types", () => {
    for (const file of LIGHT) {
      const src = readFileSync(join(ROOT, file), "utf8");
      for (const m of src.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^"';]*?from\s+["']([^"']+)["']/gm)) {
        const allowed = m[1] ? ALLOWED_TYPE_IMPORTS : ALLOWED_VALUE_IMPORTS;
        expect(allowed.has(m[2]), `${file} imports ${m[2]}`).toBe(true);
      }
    }
  });

  it("keeps experience/config and the floor layouts out of the Classic modules", () => {
    const light = new Set([...LIGHT, ...CLASSIC_OK].flatMap((f) => [...staticClosure(f)]));
    const heavy = [...staticClosure("src/experience/config.ts")].filter((f) => f.startsWith("src/experience/") && !light.has(f));
    expect(heavy).toContain("src/experience/floors/labs/layout.ts");
    for (const entry of CLASSIC_ENTRIES) {
      const closure = staticClosure(entry);
      expect(heavy.filter((f) => closure.has(f)), entry).toEqual([]);
    }
  });
});
