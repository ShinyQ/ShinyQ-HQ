import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../helpers/import-graph";

const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
/** The scheduler build without indentation, so the npm and Next copies compare on code alone. */
const code = (file: string) => read(file).replace(/^\s+/gm, "");

describe("one scheduler for React DOM and R3F (perf 3D-2)", () => {
  it("aliases npm scheduler to Next's compiled copy in the Turbopack build", () => {
    expect(read("next.config.ts")).toMatch(/resolveAlias:\s*\{[^}]*\bscheduler:\s*"next\/dist\/compiled\/scheduler"/);
  });

  it("is safe because both copies are the same build (re-check after a next or React bump)", () => {
    for (const build of ["scheduler.production.js", "scheduler.development.js"]) {
      expect(code(`node_modules/next/dist/compiled/scheduler/cjs/${build}`), build).toBe(code(`node_modules/scheduler/cjs/${build}`));
    }
  });
});
