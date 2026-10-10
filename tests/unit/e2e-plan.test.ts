import { describe, expect, it } from "vitest";
import { ALL_SPECS, assignShard, parseShard, SMOKE_SPECS, specsForChanges } from "../../scripts/e2e-plan";
import { readdirSync } from "node:fs";

describe("specsForChanges", () => {
  it("maps floor code to its spec", () => {
    expect(specsForChanges(["src/experience/floors/labs/Pods.tsx"]).specs).toEqual(["gallery", "labs"]);
    expect(specsForChanges(["src/experience/floors/career/layout.ts"]).specs).toEqual(["career"]);
    expect(specsForChanges(["src/experience/floors/roof/Comms.tsx"]).specs).toEqual(["library-roof"]);
  });

  it("maps static pages and content", () => {
    expect(specsForChanges(["src/app/[locale]/labs/page.tsx"]).specs).toEqual(["gallery", "pageview", "static-routes"]);
    expect(specsForChanges(["content/site-content.json"]).specs).toEqual(["pageview", "seo", "static-routes"]);
  });

  it("runs a changed spec itself and skips docs and unit tests", () => {
    expect(specsForChanges(["e2e/career.spec.ts", "docs/deploy.md", "tests/unit/rover.test.ts"]).specs).toEqual(["career"]);
    expect(specsForChanges(["AGENTS.md"]).specs).toEqual([]);
    expect(specsForChanges(["e2e/screenshots.spec.ts"]).specs).toEqual([]);
  });

  it("runs everything when test infrastructure or dependencies change", () => {
    expect(specsForChanges(["src/hud/Hud.tsx", "e2e/hq.ts"]).specs).toBe("all");
    expect(specsForChanges(["package.json"]).specs).toBe("all");
    expect(specsForChanges(["playwright.config.ts"]).specs).toBe("all");
  });

  it("falls back to the smoke specs for unmapped paths", () => {
    const plan = specsForChanges(["src/unknown/thing.ts"]);
    expect(plan.unmatched).toEqual(["src/unknown/thing.ts"]);
    expect(plan.specs).toEqual([...SMOKE_SPECS].sort());
  });

  it("knows every spec in e2e/", () => {
    const onDisk = readdirSync("e2e")
      .filter((f) => f.endsWith(".spec.ts") && f !== "screenshots.spec.ts" && f !== "pageview-visual.spec.ts")
      .map((f) => f.replace(/\.spec\.ts$/, ""))
      .sort();
    expect(onDisk).toEqual([...ALL_SPECS].sort());
  });
});

describe("assignShard", () => {
  const tests = Array.from({ length: 10 }, (_, i) => i);

  it("interleaves so every shard gets part of every spec", () => {
    expect(assignShard(tests, 1, 4)).toEqual([0, 4, 8]);
    expect(assignShard(tests, 4, 4)).toEqual([3, 7]);
  });

  it("covers every test exactly once", () => {
    const all = [1, 2, 3].flatMap((i) => assignShard(tests, i, 3)).sort((a, b) => a - b);
    expect(all).toEqual(tests);
  });

  it("parses and validates shard arguments", () => {
    expect(parseShard("2/4")).toEqual({ index: 2, total: 4 });
    expect(() => parseShard("5/4")).toThrow();
    expect(() => parseShard("x")).toThrow();
  });
});
