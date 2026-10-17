import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_BUT_MEMORY, ALL_PERF_KEYS, FLOORS, perfGrep, perfKeysFor, type PerfKey } from "../../scripts/perf-plan";

const TIERS = ["lite", "full"];
const read = (spec: string) => readFileSync(`e2e/perf/${spec}.spec.ts`, "utf8");
const templates = (source: string) => [...source.matchAll(/\btest\(\s*(["`])((?:(?!\1).)+)\1/g)].map((m) => m[2]);

/** Every perf lane title, with the tier, floor and ride loops of the specs expanded by hand. */
function perfTitles(): string[] {
  const titles: string[] = [];
  for (const t of templates(read("floors"))) for (const tier of TIERS) for (const floor of FLOORS) titles.push(t.replace("${tier}", tier).replace("${floor}", floor));
  const peaks = read("peaks");
  const rides = [...peaks.matchAll(/\{ tier: "(\w+)", from: "(\w+)", to: "(\w+)" \}/g)].map((m) => ({ tier: m[1], from: m[2], to: m[3] }));
  expect(rides.length).toBeGreaterThan(0);
  for (const t of templates(peaks)) {
    if (t.includes("${from}")) for (const r of rides) titles.push(t.replace("${tier}", r.tier).replace("${from}", r.from).replace("${to}", r.to));
    else for (const tier of TIERS) titles.push(t.replace("${tier}", tier));
  }
  for (const t of templates(read("bytes-3d"))) for (const tier of TIERS) titles.push(t.replace("${tier}", tier).replace(/\$\{[^}]+\}/g, "450"));
  titles.push(...templates(read("memory-full")));
  expect(titles.every((t) => !t.includes("${"))).toBe(true);
  return titles;
}

describe("perfKeysFor", () => {
  it("selects the floor, its rides and the bytes gate for L3 code", () => {
    expect(perfKeysFor(["src/experience/floors/labs/OpsRoom.tsx"])).toEqual(["bytes", "floor:L3", "ride:L3"]);
    expect(perfKeysFor(["src/experience/floors/Labs.tsx"])).toEqual(["bytes", "floor:L3", "ride:L3"]);
  });

  it("selects the bytes gate, the B1 settled gate and the B1 rides for B1 code", () => {
    const b1Files = [
      "src/experience/floors/EngineRoom.tsx",
      "src/experience/floors/chunks/engine.ts",
      "src/experience/floors/engine/scenery.ts",
      "src/hud/drawer/EngineBody.tsx",
      "src/content/room-views/engine.ts",
    ];
    for (const file of b1Files) expect(perfKeysFor([file])).toEqual(["bytes", "floor:B1", "ride:B1"]);
    const re = new RegExp(perfGrep(perfKeysFor(["src/experience/floors/EngineRoom.tsx"])));
    for (const t of [
      "B1 lite: settled draw calls and shader programs",
      "B1 full: settled draw calls and shader programs",
      "the ride L1 to B1 stays under the scene budget (lite)",
      "the ride RF to B1 stays under the scene budget (full)",
    ]) expect(t).toMatch(re);
    expect("L3 full: settled draw calls and shader programs").not.toMatch(re);
  });

  it("keeps the full lane, B1 keys included, for the B1 files on the main 3D path", () => {
    for (const file of ["src/experience/floors/engine/layout.ts", "src/experience/b1.ts"]) {
      const keys = perfKeysFor([file]);
      expect(keys).toEqual([...ALL_BUT_MEMORY]);
      for (const k of ["hover", "boot", "boost", "bytes", "floor:B1", "ride:B1"] as const) expect(keys).toContain(k);
    }
  });

  it("does not pull B1 into public-floor changes", () => {
    for (const file of ["src/experience/floors/labs/OpsRoom.tsx", "src/experience/floors/lobby/kiosk.ts", "src/experience/floors/roof/Deck.tsx"]) {
      expect(perfKeysFor([file])).not.toContain("floor:B1");
      expect(perfKeysFor([file])).not.toContain("ride:B1");
    }
  });

  it("selects only the bytes gate for HUD code and floor thumbnails", () => {
    expect(perfKeysFor(["src/hud/menu/RoverMenu.tsx"])).toEqual(["bytes"]);
    expect(perfKeysFor(["public/floors/l3.webp"])).toEqual(["bytes"]);
  });

  it("runs the whole lane, memory included, for the render pipeline and floor mounting", () => {
    expect(perfKeysFor(["src/experience/scene/Effects.tsx"])).toEqual([...ALL_PERF_KEYS]);
    expect(perfKeysFor(["src/experience/tower/Tower.tsx"])).toEqual([...ALL_PERF_KEYS]);
    expect(perfGrep(perfKeysFor(["src/experience/scene/Effects.tsx"]))).toBe("");
  });

  it("runs every key but memory for unmapped 3D files", () => {
    expect(perfKeysFor(["src/experience/camera/orbit.ts"])).toEqual([...ALL_BUT_MEMORY]);
    expect(ALL_BUT_MEMORY).not.toContain("memory");
    expect(ALL_PERF_KEYS).toContain("memory");
  });

  it("selects nothing for the prototype and unions the keys of several files", () => {
    expect(perfKeysFor(["src/experience/prototype/Walk.tsx"])).toEqual([]);
    expect(perfKeysFor([])).toEqual([]);
    expect(perfKeysFor(["src/experience/floors/labs/OpsRoom.tsx", "src/hud/Hud.tsx", "src/experience/floors/roof/Deck.tsx"])).toEqual(["bytes", "floor:L3", "floor:RF", "ride:L3", "ride:RF"]);
    expect(perfKeysFor(["src/store/hq.ts", "src/experience/interact/registry.ts"])).toEqual(["boot", "bytes", "hover"]);
    expect(perfKeysFor(["src/experience/rover/boost.ts"])).toEqual(["boost", "boot", "bytes"]);
    expect(perfKeysFor(["src/experience/floors/lobby/kiosk.ts"])).toEqual(["boot", "bytes", "floor:L1", "hover"]);
    expect(perfKeysFor(["src/experience/floors/filterHash.ts"])).toEqual(["bytes", "floor:L3", "floor:L4"]);
  });
});

describe("perfGrep", () => {
  it("matches the selected floor and its rides, not the others", () => {
    const re = new RegExp(perfGrep(["bytes", "floor:L3", "ride:L3"]));
    for (const t of ["L3 full: settled draw calls and shader programs", "the ride L1 to L3 stays under the scene budget (lite)", "the ride L3 to L2 stays under the scene budget (lite)"]) expect(t).toMatch(re);
    for (const t of ["L2 full: settled draw calls and shader programs", "the ride L1 to L2 stays under the scene budget (lite)"]) expect(t).not.toMatch(re);
  });

  it("returns an empty grep for every key and a group otherwise", () => {
    expect(perfGrep(ALL_PERF_KEYS)).toBe("");
    expect(perfGrep(["bytes"])).toBe("(3D JS after the gate)");
  });

  it("refuses an empty key list (callers plan perf: false instead)", () => {
    expect(() => perfGrep([])).toThrow();
  });

  it("every fragment matches at least one real perf title", () => {
    const titles = perfTitles();
    for (const key of ALL_PERF_KEYS) {
      const re = new RegExp(perfGrep([key] as PerfKey[]));
      expect(titles.some((t) => re.test(t)), `${key}: ${re}`).toBe(true);
    }
  });
});
