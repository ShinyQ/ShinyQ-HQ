// Mutation testing (owner decision 2026-11-11, docs/agents/performance.md "Mutation testing"): scoped to the modules whose
// tests a pruning change touched, never the whole repo. Run `bun run mutation`; pass `--mutate <file[:lines]>` to scope
// another module. The report lands in reports/mutation/ (git-ignored).
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.config.mts", related: true },
  coverageAnalysis: "perTest",
  mutate: [
    "src/lib/gpu-tier.ts:31-41",
    "src/lib/quality-pref.ts",
    "src/hud/dialog/floorIntro.ts",
    "src/experience/fx/materials.ts",
    "scripts/uptime.ts:66-91",
    "functions/_lib/scope.ts:107-114",
    "src/hud/ask/AskDock.tsx:94-114",
    "src/experience/nav/navgrid.ts:306-339",
    "src/experience/camera/rigs.ts:75-90",
    "scripts/ci-plan.ts:145-156",
    "scripts/ci-plan.ts:182-221",
    "scripts/perf-plan.ts:122-124",
  ],
  reporters: ["clear-text", "progress", "json"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  // In place: several suites read the repo through git (ls-files, the import graph), which a sandbox copy lacks.
  // Stryker restores every mutated file when it ends; do not edit the mutated files while it runs.
  inPlace: true,
  tempDirName: ".stryker-tmp",
  concurrency: 4,
  timeoutMS: 30_000,
};
