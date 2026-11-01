import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, HEAD_MAPS, HEAVY_SHARDS, importClosure, importing3d, LIGHTHOUSE_PAGES, locateFromDisk, mapDiff, pagesFromRepo, planFor, planOutputs, reverseImports, ROOTS, sharedPerfKeys, type PlanMaps, type PlanOptions } from "../../scripts/ci-plan";
import { locateTest, type DurationsFile } from "../../scripts/e2e-plan";
import { ALL_BUT_MEMORY, ALL_PERF_KEYS } from "../../scripts/perf-plan";

const none = () => [];

describe("ci-plan classify", () => {
  it.each([
    [".github/workflows/ci.yml", "ci"],
    [".github/actions/setup/action.yml", "ci"],
    // Other workflows cannot change a test result of ci.yml (owner decision 2026-11-01).
    [".github/workflows/deploy.yml", "docs"],
    [".github/workflows/ask-eval.yml", "docs"],
    ["package.json", "ci"],
    ["bun.lock", "ci"],
    ["e2e/perf/floors.spec.ts", "ci"],
    ["scripts/e2e-plan.ts", "planmap"],
    ["scripts/perf-plan.ts", "planmap"],
    ["scripts/perf-report.ts", "ci"],
    ["scripts/e2e-shard.ts", "ci"],
    ["scripts/ci-complement.ts", "ci"],
    ["scripts/ci-status.ts", "ci"],
    ["scripts/merge-gate.ts", "ci"],
    ["src/experience/tower/Tower.tsx", "code3d"],
    ["src/hud/HudRoot.tsx", "code3d"],
    ["public/floors/l3.webp", "code3d"],
    ["src/app/[locale]/page.tsx", "ui"],
    ["messages/en.json", "ui"],
    ["public/brand/portrait.webp", "ui"],
    ["scripts/csp-hashes.ts", "ui"],
    ["functions/api/ask.ts", "functions"],
    ["workers/stats/src/index.ts", "functions"],
    ["e2e/pageview.spec.ts", "e2e"],
    ["scripts/refresh-facts.ts", "tooling"],
    ["tools/office-relay/src/cli.ts", "tooling"],
    ["tools/office-relay/README.md", "tooling"],
    ["content/site-content.json", "content"],
    ["content/posts/a.mdx", "content"],
    ["public/media/x/1.webp", "content"],
    ["docs/agents/ci-and-deploy.md", "docs"],
    ["AGENTS.md", "docs"],
    [".github/dependabot.yml", "docs"],
    ["tests/unit/x.test.ts", "tests"],
    ["e2e/durations.json", "tests"],
    ["weird/file.bin", "other"],
  ])("%s is %s", (file, cls) => {
    expect(classify(file)).toBe(cls);
  });
});

describe("ci-plan importClosure", () => {
  const files: Record<string, string> = {
    "src/hud/Hud.tsx": 'import { a } from "@/lib/a";\nimport type { T } from "@/lib/types";\nconst L = lazy(() => import("./Lazy"));',
    "src/hud/Lazy.tsx": 'export { b } from "../lib/b";',
    "src/lib/a.ts": 'import "./side";',
    "src/lib/side.ts": "",
    "src/lib/b.ts": "",
    "src/lib/types.ts": "",
    "src/lib/page-only.ts": "",
    "src/app/globals.css": '@import "tailwindcss";\n@import "./pageview.css";\n@import url("./landing.css");\n@import url(./print.css);',
    "src/app/pageview.css": "",
    "src/app/landing.css": "",
    "src/app/print.css": "",
    "src/app/Page.tsx": 'import "./globals.css";',
  };
  const read = (f: string) => files[f] ?? null;

  it("follows value, re-export, side-effect and dynamic imports, not type-only imports", () => {
    const seen = importClosure(["src/hud/Hud.tsx"], read);
    expect([...seen].sort()).toEqual(["src/hud/Hud.tsx", "src/hud/Lazy.tsx", "src/lib/a.ts", "src/lib/b.ts", "src/lib/side.ts"]);
  });

  it("follows relative CSS @import from imported stylesheets", () => {
    const seen = importClosure(["src/app/Page.tsx"], read);
    expect([...seen].sort()).toEqual(["src/app/Page.tsx", "src/app/globals.css", "src/app/landing.css", "src/app/pageview.css", "src/app/print.css"]);
  });

  it("skips dynamic imports when asked (static closures for Lighthouse)", () => {
    const seen = importClosure(["src/hud/Hud.tsx"], read, { dynamic: false });
    expect([...seen].sort()).toEqual(["src/hud/Hud.tsx", "src/lib/a.ts", "src/lib/side.ts"]);
  });

  it("on this repo: the 3D roots import shared modules but not the pages", () => {
    const roots = execSync("git ls-files src/experience src/hud src/store").toString().split("\n").filter((f) => ROOTS.test(f));
    const read = (f: string) => (existsSync(f) && statSync(f).isFile() ? readFileSync(f, "utf8") : null);
    const seen = importClosure(roots, read);
    expect(seen.has("src/lib/motion.ts")).toBe(true);
    expect(seen.has("src/app/[locale]/page.tsx")).toBe(false);
    expect(seen.has("src/lib/seo.ts")).toBe(false);
  });
});

const repoRead = (f: string) => (existsSync(f) && statSync(f).isFile() ? readFileSync(f, "utf8") : null);
const durationsFile = JSON.parse(readFileSync("e2e/durations.json", "utf8")) as DurationsFile;
const durations = durationsFile.e2e;
const perfDurations = durationsFile.perf;
const locate = locateFromDisk(".");
const opts: PlanOptions = { durations, perfDurations, locate };
const line = (spec: string, title: string) => `e2e/${spec}.spec.ts:${locateTest(readFileSync(`e2e/${spec}.spec.ts`, "utf8"), title)}`;
const RIDE_SMOKE = line("ride", "the car waits for the new floor with the doors closed, then compiles nothing while it moves");
const HUD_SMOKE = line("experience", "the 3D HUD has no serious accessibility violations");
const lhciUrls = (JSON.parse(readFileSync("lighthouserc.json", "utf8")) as { ci: { collect: { url: string[] } } }).ci.collect.url;

describe("ci-plan shared perf keys", () => {
  const files: Record<string, string> = {
    "src/experience/Experience.tsx": 'import { core } from "@/lib/core";\nimport { X } from "./floors/lobby/X";',
    "src/experience/floors/lobby/X.tsx": 'import { l } from "@/lib/lobby-only";\nimport { d } from "@/lib/deep";',
    "src/experience/Unknown.tsx": 'import { o } from "@/lib/odd";',
    "src/experience/gate-data.ts": 'import { p } from "@/content/payload-only";\nimport { c } from "@/content/certs";\nimport { q } from "@/content/asks";\nimport { e } from "@/content/room-views/engine";',
    "src/hud/A.tsx": 'import { b } from "@/lib/b";\nimport { a } from "@/ask/protocol";',
    "src/lib/b.ts": 'import { h } from "./hud-only";',
    "src/lib/hud-only.ts": "",
    "src/lib/lobby-only.ts": "",
    "src/lib/deep.ts": "",
    "src/lib/core.ts": "",
    "src/lib/odd.ts": "",
    "src/lib/page-only.ts": "",
    "src/content/payload-only.ts": "",
    "src/content/certs.ts": "",
    "src/content/asks.ts": 'import { a } from "@/ask/protocol";',
    "src/ask/protocol.ts": "",
    "src/content/room-views/engine.ts": "",
  };
  const read = (f: string) => files[f] ?? null;
  const roots = Object.keys(files).filter((f) => ROOTS.test(f));
  const importers = reverseImports(roots, read);
  const keys = (f: string) => sharedPerfKeys(f, importers);

  it("walks importers up to the nearest 3D files, through non-3D files", () => {
    expect(importing3d("src/lib/hud-only.ts", importers)).toEqual(["src/hud/A.tsx"]);
    expect(importing3d("src/lib/deep.ts", importers)).toEqual(["src/experience/floors/lobby/X.tsx"]);
    expect(importing3d("src/lib/page-only.ts", importers)).toEqual([]);
  });

  it("gives a shared module the keys of the 3D files that import it", () => {
    expect(keys("src/lib/lobby-only.ts")).toEqual(["boot", "bytes", "floor:L1", "hover"]);
    // Stops at the Lobby file: Experience.tsx importing the Lobby does not widen it.
    expect(keys("src/lib/deep.ts")).toEqual(["boot", "bytes", "floor:L1", "hover"]);
    expect(keys("src/lib/hud-only.ts")).toEqual(["bytes"]);
    expect(keys("src/lib/core.ts")).toEqual([...ALL_PERF_KEYS]);
    expect(keys("src/lib/page-only.ts")).toEqual([]);
  });

  it("falls back to every key but memory for an unknown 3D importer or an unmapped payload module", () => {
    expect(keys("src/lib/odd.ts")).toEqual([...ALL_BUT_MEMORY]);
    expect(keys("src/content/payload-only.ts")).toEqual([...ALL_BUT_MEMORY]);
  });

  it("uses the module to gate map for the payload path", () => {
    expect(keys("src/content/certs.ts")).toEqual(["boot", "bytes", "floor:L1", "hover"]);
    expect(keys("src/ask/protocol.ts")).toEqual(["boot", "bytes"]);
    // A shared module PERF_RULES names keeps its own keys.
    expect(keys("src/content/room-views/engine.ts")).toEqual(["bytes", "floor:B1", "ride:B1"]);
  });

  it("on this repo: content and Ask modules select only their floors", () => {
    const real = execSync("git ls-files src/experience src/hud src/store").toString().split("\n").filter((f) => ROOTS.test(f));
    const repo = reverseImports(real, repoRead);
    const floorsOf = (f: string) => sharedPerfKeys(f, repo).filter((k) => k.startsWith("floor:") || k.startsWith("ride:"));
    expect(sharedPerfKeys("src/content/certs.ts", repo)).toEqual(["boot", "bytes", "floor:L1", "hover"]);
    expect(floorsOf("src/content/cert-views.ts")).toEqual(["floor:L1"]);
    for (const f of ["src/ask/client.ts", "src/ask/protocol.ts"]) expect(sharedPerfKeys(f, repo), f).toEqual(["boot", "bytes"]);
    expect(sharedPerfKeys("src/lib/audio/engine.ts", repo)).toEqual([...ALL_PERF_KEYS]);
    expect(sharedPerfKeys("src/components/stats/VisitsPanel.tsx", repo)).toEqual(["bytes"]);
    expect(sharedPerfKeys("src/lib/seo.ts", repo)).toEqual([]);
  });
});

describe("ci-plan planFor: full runs", () => {
  const fullOutputs = (perfShards: string, perfTotal: string, e2eShards = 6) => ({
    full: "true",
    e2e: "all",
    e2e_files: "",
    e2e_shards: JSON.stringify(Array.from({ length: e2eShards }, (_, i) => i + 1)),
    e2e_total: String(e2eShards),
    perf: "true",
    perf_grep: "",
    perf_shards: perfShards,
    perf_total: perfTotal,
    perf_nightly: "false",
    lighthouse: "true",
    lighthouse_urls: "",
    lighthouse_shards: "[1]",
    lighthouse_total: "1",
    source_run: "",
  });

  it("runs everything on 6 e2e and 4 perf shards when the file list is unknown (push), like every full run", () => {
    const plan = planFor(null, none);
    expect(plan).toMatchObject({ full: true, e2e: "all", e2eTests: [], e2eShards: 6, perf: [...ALL_PERF_KEYS], perfShards: 4, lighthouse: "all" });
    expect(planOutputs(plan, lhciUrls)).toEqual(fullOutputs("[1,2,3,4]", "4"));
  });

  it("runs a full pull request on 6 e2e and 4 perf shards, so it peaks at 12 jobs", () => {
    expect(planFor(null, none, { event: "pull_request" })).toMatchObject({ full: true, e2eShards: 6, perfShards: 4 });
    expect(HEAVY_SHARDS).toBe(10);
  });

  it("runs everything for a non-PR event even with a file list", () => {
    expect(planFor(["docs/a.md"], none, { event: "other" })).toMatchObject({ full: true, e2eShards: 6, perfShards: 4 });
  });

  it("runs everything on 6 e2e and 4 perf shards for the full-ci label", () => {
    const plan = planFor(["docs/a.md"], none, { ...opts, fullLabel: true });
    expect(plan).toMatchObject({ full: true, e2e: "all", e2eShards: 6, perfShards: 4, lighthouse: "all" });
    expect(plan.reasons.join(" ")).toContain("full-ci");
    expect(planOutputs(plan, lhciUrls)).toEqual(fullOutputs("[1,2,3,4]", "4", 6));
  });

  it("runs everything for CI files and unknown paths", () => {
    expect(planFor([".github/workflows/ci.yml"], none)).toMatchObject({ full: true, e2eShards: 6, perfShards: 4 });
    expect(planFor(["weird/file.bin"], none).full).toBe(true);
    // A spec map change whose diff is unknown (no base maps) runs everything.
    expect(planFor(["scripts/perf-plan.ts"], none).full).toBe(true);
    expect(planFor(["scripts/e2e-plan.ts"], none).reasons).toContain("the spec maps changed and what they move is unknown: full run");
    // Another workflow: no heavy job (its own unit tests always run).
    expect(planFor([".github/workflows/ask-eval.yml"], none, opts)).toMatchObject({ full: false, e2e: [], perf: false, lighthouse: false });
  });
});

describe("ci-plan spec map changes", () => {
  const maps = (e2e: Record<string, string[] | "all">, perf: Record<string, string[]>, extra: { smoke?: { spec: string; title?: string }[]; grep?: Record<string, string> } = {}): PlanMaps => ({
    e2e: { specsForChanges: (files) => ({ specs: e2e[files[0]] ?? [] }), PR_SMOKE: extra.smoke ?? [], SMOKE_SPECS: ["static-routes"] },
    perf: { perfKeysFor: (files) => perf[files[0]] ?? [], perfGrep: (keys) => extra.grep?.[keys[0]] ?? `(${keys[0]})` },
  });
  const tracked = ["src/components/page/A.tsx", "src/experience/floors/labs/OpsRoom.tsx", "docs/a.md"];

  it("runs the specs and perf keys whose mapping changed, in both directions", () => {
    const base = maps({ "src/components/page/A.tsx": ["pageview", "seo"] }, { "src/experience/floors/labs/OpsRoom.tsx": ["floor:L3"] });
    const head = maps({ "src/components/page/A.tsx": ["pageview", "topics"] }, { "src/experience/floors/labs/OpsRoom.tsx": ["bytes", "floor:L3"] });
    expect(mapDiff(base, head, tracked)).toEqual({ specs: ["seo", "topics"], keys: ["bytes"] });
    expect(mapDiff(base, base, tracked)).toEqual({ specs: [], keys: [] });
  });

  it("runs the full suite when one side sends a path there, a changed smoke entry's spec and a changed perf selection", () => {
    const base = maps({ "src/components/page/A.tsx": ["pageview"] }, {}, { smoke: [{ spec: "ride", title: "a" }] });
    expect(mapDiff(base, maps({ "src/components/page/A.tsx": "all" }, {}, { smoke: [{ spec: "ride", title: "a" }] }), tracked).specs).toBe("all");
    expect(mapDiff(base, maps({ "src/components/page/A.tsx": ["pageview"] }, {}, { smoke: [{ spec: "ride", title: "b" }] }), tracked).specs).toEqual(["ride"]);
    expect(mapDiff(base, maps({ "src/components/page/A.tsx": ["pageview"] }, {}, { smoke: [{ spec: "ride", title: "a" }], grep: { hover: "(new)" } }), tracked).keys).toEqual(["hover"]);
  });

  it("on this repo: the checked-out maps against themselves move nothing", () => {
    const files = execSync("git ls-files").toString().split("\n").filter(Boolean);
    expect(mapDiff(HEAD_MAPS, HEAD_MAPS, files)).toEqual({ specs: [], keys: [] });
  });

  it("plans the PR's own files plus what the map change moves, without a full run", () => {
    const plan = planFor(["scripts/e2e-plan.ts", "e2e/topics.spec.ts"], none, { ...opts, mapDiff: { specs: ["seo"], keys: ["floor:L3"] } });
    expect(plan).toMatchObject({ full: false, e2e: ["seo", "topics"], perf: ["floor:L3"] });
    expect(plan.reasons).toContain("spec map change: e2e specs seo");
    expect(plan.reasons).toContain("spec map change: perf keys floor:L3");
    expect(planFor(["scripts/perf-plan.ts"], none, { ...opts, mapDiff: { specs: [], keys: [] } })).toMatchObject({ full: false, e2e: [], perf: false, lighthouse: false });
    expect(planFor(["scripts/e2e-plan.ts"], none, { ...opts, mapDiff: { specs: "all", keys: [] } })).toMatchObject({ full: false, e2e: "all" });
  });
});

describe("ci-plan nightly-only L1 perf poses and Lighthouse shards", () => {
  it("runs the nightly-only L1 poses on a pull request that changes the Lobby or the office, and sizes its shards with them", () => {
    const nightly = "floors.spec.ts \u203a L1 full: settled draw calls and shader programs with the day replay looping @nightly";
    const perfDurations = { [nightly]: 3000, "floors.spec.ts \u203a L1 full: settled draw calls and shader programs": 200 };
    const lobby = planFor(["src/experience/floors/lobby/Lanes.tsx"], none, { ...opts, perfDurations });
    expect(lobby).toMatchObject({ perfNightly: true, perfShards: 4 });
    expect(planOutputs(lobby, lhciUrls).perf_nightly).toBe("true");
    expect(lobby.reasons).toContain("the Lobby or the office changed: the nightly-only L1 perf poses run too");
    // A shared module the Lobby imports moves the L1 gates, not the nightly-only poses.
    const shared = planFor(["src/lib/office/fixtures.ts"], () => ["floor:L1"], { ...opts, perfDurations });
    expect(shared).toMatchObject({ perfNightly: false, perfShards: 1 });
    expect(planFor(["src/experience/floors/labs/OpsRoom.tsx"], none, opts).perfNightly).toBe(false);
  });

  it("splits Lighthouse over 2 shards from 4 measured URLs in a run with at most 8 e2e plus perf shards", () => {
    const pages = (urls: string[]) => (f: string) => (f === "src/components/page/A.tsx" ? urls : []);
    const three = planFor(["src/components/page/A.tsx"], none, { ...opts, pages: pages(["/en/quick", "/en/cv"]) });
    expect(planOutputs(three, lhciUrls)).toMatchObject({ lighthouse_shards: "[1]", lighthouse_total: "1" });
    const four = planFor(["src/components/page/A.tsx"], none, { ...opts, pages: pages(["/en/quick", "/en/cv", "/en/contact"]) });
    expect(planOutputs(four, lhciUrls)).toMatchObject({ lighthouse_shards: "[1,2]", lighthouse_total: "2" });
    expect(planOutputs(planFor(["docs/a.md"], none, opts), lhciUrls)).toMatchObject({ lighthouse: "false", lighthouse_shards: "[1]" });
    // A full run (10 e2e plus perf shards) keeps one Lighthouse job: its e2e and perf shards outlast it.
    expect(planOutputs(planFor(null, none), lhciUrls)).toMatchObject({ lighthouse_urls: "", lighthouse_shards: "[1]" });
    const all = planFor(["src/components/page/A.tsx"], none, { ...opts, pages: () => "all" as const });
    expect(all.e2eShards + all.perfShards).toBeLessThanOrEqual(8);
    expect(planOutputs(all, lhciUrls)).toMatchObject({ lighthouse_urls: "", lighthouse_shards: "[1,2]" });
  });
});

describe("ci-plan planFor: selective pull request runs", () => {
  it("runs nothing heavy for docs and tests", () => {
    const plan = planFor(["docs/a.md", "tests/unit/x.test.ts", "e2e/durations.json"], none, opts);
    expect(plan).toMatchObject({ full: false, e2e: [], e2eTests: [], e2eShards: 1, perf: false, lighthouse: false });
    expect(planOutputs(plan, lhciUrls)).toEqual({
      full: "false",
      e2e: "none",
      e2e_files: "",
      e2e_shards: "[1]",
      e2e_total: "1",
      perf: "false",
      perf_grep: "",
      perf_shards: "[1]",
      perf_total: "1",
      perf_nightly: "false",
      lighthouse: "false",
      lighthouse_urls: "",
      lighthouse_shards: "[1]",
      lighthouse_total: "1",
      source_run: "",
    });
  });

  it("runs the mapped specs for content, without smoke, perf or Lighthouse by default", () => {
    const plan = planFor(["content/site-content.json", "public/media/a.webp"], none, opts);
    expect(plan).toMatchObject({ e2e: ["gallery", "pageview", "seo", "static-routes", "time-travel"], e2eTests: [], perf: false, lighthouse: false });
  });

  it("HUD change: its specs plus the smoke set, the bytes gate, 1 to 3 e2e shards", () => {
    const plan = planFor(["src/hud/menu/RoverMenu.tsx"], none, opts);
    expect(plan.e2e).toEqual(["boot-first", "deploy", "hud", "hud-corners", "onboarding", "static-routes"]);
    expect(plan.e2eTests).toEqual([RIDE_SMOKE, HUD_SMOKE]);
    expect(plan.perf).toEqual(["bytes"]);
    expect(plan.lighthouse).toBe("all");
    expect(plan.e2eShards).toBeGreaterThanOrEqual(1);
    expect(plan.e2eShards).toBeLessThanOrEqual(3);
    const out = planOutputs(plan, lhciUrls);
    expect(out).toMatchObject({ full: "false", e2e: "specs", perf: "true", perf_grep: "(3D JS after the gate)", perf_shards: "[1]", perf_total: "1", lighthouse: "true", lighthouse_urls: "" });
    // Whole spec files first (sorted as file names), then the smoke test filters.
    expect(out.e2e_files).toBe(["boot-first", "deploy", "hud-corners", "hud", "onboarding", "static-routes"].map((s) => `e2e/${s}.spec.ts`).concat(RIDE_SMOKE, HUD_SMOKE).join(" "));
    expect(out.e2e_shards).toBe(JSON.stringify(Array.from({ length: plan.e2eShards }, (_, i) => i + 1)));
    expect(out.e2e_total).toBe(String(plan.e2eShards));
  });

  it("L3 change: the L3 specs plus the smoke set and the L3 perf keys", () => {
    const plan = planFor(["src/experience/floors/labs/OpsRoom.tsx"], none, opts);
    expect(plan.e2e).toEqual(["boot-first", "deploy", "labs", "pageview", "production", "static-routes"]);
    expect(plan.e2eTests).toEqual([RIDE_SMOKE, HUD_SMOKE]);
    expect(plan.perf).toEqual(["bytes", "floor:L3", "ride:L3"]);
    const out = planOutputs(plan, lhciUrls);
    expect(out.perf_grep).toBe("(3D JS after the gate|L3 (full|lite): settled|the ride (L3 to \\S+|\\S+ to L3) stays)");
    expect(out.full).toBe("false");
  });

  it("skips a smoke test whose spec is already selected", () => {
    const plan = planFor(["src/experience/tower/rideClock.ts"], none, opts);
    expect(plan.e2e).toEqual(expect.arrayContaining(["ride", "experience", "static-routes", "boot-first", "deploy"]));
    expect(plan.e2eTests).toEqual([]);
  });

  it("drops a smoke test it cannot locate, with a reason", () => {
    const plan = planFor(["src/hud/menu/RoverMenu.tsx"], none, { durations, locate: () => null });
    expect(plan.e2eTests).toEqual([]);
    expect(plan.reasons.filter((r) => r.includes("smoke test not found"))).toHaveLength(2);
  });

  it("runs the ask spec for Functions, without smoke, perf or Lighthouse", () => {
    const plan = planFor(["functions/api/ask.ts"], none, opts);
    expect(plan).toMatchObject({ e2e: ["ask"], e2eTests: [], e2eShards: 1, perf: false, lighthouse: false });
    expect(planOutputs(plan, lhciUrls)).toMatchObject({ full: "false", e2e: "specs", e2e_files: "e2e/ask.spec.ts", e2e_shards: "[1]", perf: "false", lighthouse: "false" });
  });

  it("plans a full run for a path no e2e rule maps, listing it", () => {
    const plan = planFor(["src/unknown/thing.ts"], none, opts);
    expect(plan).toMatchObject({ full: true, e2e: "all", e2eTests: [], e2eShards: 6, perf: [...ALL_PERF_KEYS], perfShards: 4, lighthouse: "all" });
    expect(plan.reasons.join(" ")).toContain("src/unknown/thing.ts");
    expect(planOutputs(plan, lhciUrls)).toMatchObject({ full: "true", e2e: "all", e2e_files: "", e2e_shards: "[1,2,3,4,5,6]", perf: "true", perf_grep: "", perf_shards: "[1,2,3,4]", lighthouse: "true", lighthouse_urls: "" });
  });

  it("runs perf for page code only when the 3D roots import it", () => {
    const page = planFor(["src/components/page/Hero.tsx"], none, opts);
    expect(page).toMatchObject({ perf: false, lighthouse: "all" });
    expect(page.e2e).toContain("pageview");
    const shared = planFor(["src/lib/audio/engine.ts"], (f) => (f === "src/lib/audio/engine.ts" ? ALL_BUT_MEMORY : []), opts);
    expect(shared).toMatchObject({ perf: [...ALL_BUT_MEMORY], lighthouse: "all" });
  });

  it("study guide reader code: the guides spec plus the reader's own perf gate, no 3D keys", () => {
    const plan = planFor(["src/components/pdf-reader/PdfReader.tsx"], none, opts);
    expect(plan.e2e).toContain("guides");
    expect(plan.perf).toEqual(["guides"]);
    expect(plan.reasons).toContain("perf gate of page code: src/components/pdf-reader/PdfReader.tsx (guides)");
    expect(planOutputs(plan, lhciUrls).perf_grep).toBe("(the study guide reader stays)");
    const cert = planFor(["src/components/certs/CertDialog.tsx", "content/study-guides.json"], none, opts);
    expect(cert.e2e).toEqual(expect.arrayContaining(["guides", "pageview"]));
    expect(cert.perf).toBe(false);
  });

  it("unions the shared keys with the 3D file keys and lists each shared module", () => {
    const perf3d = (f: string) => (f === "src/ask/protocol.ts" ? (["boot", "bytes"] as const) : []);
    const plan = planFor(["src/ask/protocol.ts", "src/experience/floors/labs/OpsRoom.tsx", "src/components/page/Hero.tsx"], perf3d, opts);
    expect(plan.perf).toEqual(["boot", "bytes", "floor:L3", "ride:L3"]);
    expect(plan.reasons).toContain("imported by the 3D roots: src/ask/protocol.ts (boot, bytes)");
  });

  it("runs a changed spec by itself", () => {
    expect(planFor(["e2e/topics.spec.ts"], none, opts)).toMatchObject({ e2e: ["topics"], e2eTests: [], perf: false, lighthouse: false });
  });

  it("runs every e2e shard for a changed e2e helper", () => {
    expect(planFor(["e2e/edge-audit.ts"], none, opts)).toMatchObject({ e2e: "all", e2eShards: 8, perf: false, perfShards: 1, lighthouse: false });
    expect(planFor(["e2e/topics.spec.ts", "e2e/edge-audit.ts"], none, opts).e2e).toBe("all");
  });

  it("sizes the perf shards of a pull request from the perf durations: the whole lane 4, a part ceil(seconds / 960), 1 to 4", () => {
    const l3 = (seconds: number) => ({ "floors.spec.ts \u203a L3 full: settled draw calls and shader programs": seconds });
    const plan = (seconds: number) => planFor(["src/experience/floors/labs/OpsRoom.tsx"], none, { ...opts, perfDurations: l3(seconds) });
    expect(plan(100).perfShards).toBe(1);
    expect(plan(1000).perfShards).toBe(2);
    expect(plan(2000).perfShards).toBe(3);
    expect(plan(100_000).perfShards).toBe(4);
    expect(plan(2000).reasons).toContain("3D perf gates: bytes, floor:L3, ride:L3 on 3 shards");
    // Without perf durations a part runs on 1 shard, as in a complement run; the whole lane always on 4.
    expect(planFor(["src/experience/floors/labs/OpsRoom.tsx"], none, { durations, locate }).perfShards).toBe(1);
    expect(planFor(["src/lib/audio/engine.ts"], () => [...ALL_PERF_KEYS], { ...opts, perfDurations: l3(1) }).perfShards).toBe(4);
  });

  it("keeps e2e plus perf shards of a pull request within HEAVY_SHARDS (6 e2e beside the whole perf lane)", () => {
    const plan = planFor(["e2e/edge-audit.ts", "src/lib/audio/engine.ts"], (f) => (f === "src/lib/audio/engine.ts" ? [...ALL_PERF_KEYS] : []), opts);
    expect(plan).toMatchObject({ full: false, e2e: "all", e2eShards: 6, perfShards: 4 });
    expect(plan.reasons).toContain("e2e on 6 shards beside 4 perf shards (at most 10 per run)");
    const d = (seconds: number) => ({ "topics.spec.ts \u203a a": seconds });
    const l3 = { "floors.spec.ts \u203a L3 full: settled draw calls and shader programs": 2000 };
    const both = planFor(["e2e/topics.spec.ts", "src/experience/floors/labs/OpsRoom.tsx"], none, { durations: d(100_000), perfDurations: l3, locate });
    expect(both).toMatchObject({ e2eShards: 7, perfShards: 3 });
    expect(both.e2eShards + both.perfShards).toBeLessThanOrEqual(HEAVY_SHARDS);
  });

  it("sizes e2e shards from the durations: ceil(seconds / 480), 1 to 8", () => {
    const d = (seconds: number) => ({ "topics.spec.ts \u203a a": seconds });
    expect(planFor(["e2e/topics.spec.ts"], none, { durations: d(100) }).e2eShards).toBe(1);
    expect(planFor(["e2e/topics.spec.ts"], none, { durations: d(1000) }).e2eShards).toBe(3);
    expect(planFor(["e2e/topics.spec.ts"], none, { durations: d(100_000) }).e2eShards).toBe(8);
    // No durations: 150 s per unknown spec.
    expect(planFor(["e2e/topics.spec.ts"], none).e2eShards).toBe(1);
  });

  it("adds the home page to every selective Lighthouse list", () => {
    const pages = (f: string) => (f === "src/components/page/A.tsx" ? ["/en/quick"] : []);
    expect(planFor(["src/components/page/A.tsx"], none, { ...opts, pages }).lighthouse).toEqual(["/en", "/en/quick"]);
    expect(planFor(["src/components/page/Z.tsx"], none, { ...opts, pages }).lighthouse).toBe(false);
  });

  it("selects Lighthouse URLs from the pages each file can move; all wins", () => {
    const pages = (f: string) => (f === "src/components/page/A.tsx" ? ["/en/quick"] : f === "src/components/page/B.tsx" ? ["/en/cv", "/en"] : f === "messages/en.json" ? ("all" as const) : []);
    const some = planFor(["src/components/page/A.tsx", "src/components/page/B.tsx", "content/x.json"], none, { ...opts, pages });
    expect(some.lighthouse).toEqual(["/en", "/en/quick", "/en/cv"]);
    expect(JSON.parse(planOutputs(some, lhciUrls).lighthouse_urls)).toEqual([
      "http://127.0.0.1:4320/en?lhci-warmup=1",
      "http://127.0.0.1:4320/en",
      "http://127.0.0.1:4320/en/quick",
      "http://127.0.0.1:4320/en/cv",
    ]);
    // Without the config URLs, run every URL rather than guess.
    expect(planOutputs(some).lighthouse_urls).toBe("");
    expect(planFor(["src/components/page/A.tsx", "messages/en.json"], none, { ...opts, pages }).lighthouse).toBe("all");
    expect(planFor(["src/components/page/Z.tsx"], none, { ...opts, pages }).lighthouse).toBe(false);
  });
});

describe("ci-plan Lighthouse pages", () => {
  it("covers exactly the measured URLs of lighthouserc.json, each with a real page file", () => {
    const paths = lhciUrls.filter((u) => !u.includes("lhci-warmup")).map((u) => new URL(u).pathname);
    expect(Object.keys(LIGHTHOUSE_PAGES)).toEqual(paths);
    for (const file of Object.values(LIGHTHOUSE_PAGES)) expect(existsSync(file), file).toBe(true);
  });

  it("maps a layout-closure module to the home page, plus the pages that import it unless every page does", () => {
    const files: Record<string, string> = {
      "src/app/[locale]/layout.tsx": 'import "../globals.css";\nimport { f } from "../fonts";\nimport { s } from "@/lib/shared";\nimport { o } from "@/lib/some";\nimport { l } from "@/lib/layout-only";',
      "src/app/(root)/layout.tsx": "",
      "src/app/globals.css": "",
      "src/app/fonts.ts": "",
      "src/lib/shared.ts": "",
      "src/lib/some.ts": "",
      "src/lib/layout-only.ts": "",
      "src/lib/page-only.ts": "",
    };
    for (const page of new Set(Object.values(LIGHTHOUSE_PAGES))) {
      files[page] = `import { s } from "@/lib/shared";${page.includes("/quick/") ? '\nimport { o } from "@/lib/some";\nimport { p } from "@/lib/page-only";' : ""}`;
    }
    const pages = pagesFromRepo((f) => files[f] ?? null);
    expect(pages("src/app/[locale]/layout.tsx")).toBe("all");
    expect(pages("src/app/globals.css")).toBe("all");
    expect(pages("src/app/fonts.ts")).toBe("all");
    expect(pages("src/lib/layout-only.ts")).toEqual(["/en"]);
    expect(pages("src/lib/shared.ts")).toEqual(["/en"]);
    expect(pages("src/lib/some.ts")).toEqual(["/en", "/en/quick"]);
    expect(pages("src/lib/page-only.ts")).toEqual(["/en/quick"]);
  });

  it("on this repo: maps files to the pages they can move through static imports", () => {
    const pages = pagesFromRepo(repoRead);
    expect(pages("src/app/[locale]/quick/page.tsx")).toEqual(["/en/quick"]);
    expect(pages("src/app/[locale]/page.tsx")).toEqual(["/en", "/id"]);
    expect(pages("src/app/[locale]/layout.tsx")).toBe("all");
    expect(pages("src/app/(root)/layout.tsx")).toBe("all");
    expect(pages("src/app/fonts.ts")).toBe("all");
    expect(pages("src/i18n/client-messages.ts")).toBe("all");
    // A shared layout module lands in a chunk every page loads the same way: the home page measures it.
    expect(pages("src/ask/protocol.ts")).toEqual(["/en"]);
    expect(pages("src/components/SiteFooter.tsx")).toEqual(["/en"]);
    // Shared by the layout and every page: still the home page only.
    expect(pages("src/lib/seo.ts")).toEqual(["/en"]);
    expect(pages("src/content/load.ts")).toEqual(["/en"]);
    expect(pages("src/app/globals.css")).toBe("all");
    expect(pages("src/app/pageview.css")).toBe("all");
    expect(pages("src/app/landing.css")).toBe("all");
    expect(pages("src/i18n/request.ts")).toBe("all");
    expect(pages("messages/id.json")).toBe("all");
    expect(pages("public/fonts/x.woff2")).toBe("all");
    expect(pages("scripts/csp-hashes.ts")).toBe("all");
    expect(pages("content/site-content.json")).toBe("all");
    expect(pages("content/generated/dynamic-facts.json")).toBe("all");
    expect(pages("content/generated/build-facts.json")).toEqual(["/en/build"]);
    expect(pages("content/blog/making-a-voice-agent-interruptible.en.mdx")).toEqual(["/en/blog/making-a-voice-agent-interruptible"]);
    expect(pages("public/media/a.webp")).toEqual([]);
    expect(pages("functions/api/ask.ts")).toEqual([]);
    expect(pages("src/experience/floors/labs/OpsRoom.tsx")).toEqual([]);
    // The Classic office card: the shell is in the home page's static imports, the panel is a lazy chunk the home
    // page loads near the viewport (its classes ship in the shared stylesheet), so the home page measures both.
    expect(pages("src/components/office/OfficeSection.tsx")).toEqual(["/en", "/id"]);
    expect(pages("src/components/office/OfficePanel.tsx")).toEqual(["/en"]);
  });
});
