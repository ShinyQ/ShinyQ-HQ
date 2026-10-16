import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, importClosure, planFor, planOutputs, ROOTS } from "../../scripts/ci-plan";

const none = () => false;

describe("ci-plan classify", () => {
  it.each([
    [".github/workflows/ci.yml", "ci"],
    ["package.json", "ci"],
    ["bun.lock", "ci"],
    ["e2e/perf/floors.spec.ts", "ci"],
    ["scripts/e2e-plan.ts", "ci"],
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
  };
  const read = (f: string) => files[f] ?? null;

  it("follows value, re-export, side-effect and dynamic imports, not type-only imports", () => {
    const seen = importClosure(["src/hud/Hud.tsx"], read);
    expect([...seen].sort()).toEqual(["src/hud/Hud.tsx", "src/hud/Lazy.tsx", "src/lib/a.ts", "src/lib/b.ts", "src/lib/side.ts"]);
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

describe("ci-plan planFor", () => {
  it("runs everything when the file list is unknown", () => {
    expect(planFor(null, none)).toMatchObject({ full: true, e2e: "all", perf: true, lighthouse: true });
  });

  it("runs nothing heavy for docs, tests and content", () => {
    const plan = planFor(["docs/a.md", "tests/unit/x.test.ts", "content/site-content.json", "public/media/a.webp"], none);
    expect(plan).toMatchObject({ full: false, e2e: [], perf: false, lighthouse: false });
    expect(planOutputs(plan)).toEqual({ full: "false", e2e: "none", e2e_files: "", perf: "false", lighthouse: "false" });
  });

  it("runs every shard, perf and Lighthouse for a 3D change", () => {
    const plan = planFor(["src/experience/floors/labs/Labs.tsx"], none);
    expect(plan).toMatchObject({ full: false, e2e: "all", perf: true, lighthouse: true });
    expect(planOutputs(plan).full).toBe("true");
  });

  it("runs everything for CI files and unknown paths", () => {
    expect(planFor([".github/workflows/ci.yml"], none).full).toBe(true);
    expect(planFor(["weird/file.bin"], none).full).toBe(true);
  });

  it("runs the mapped specs for Functions, without perf or Lighthouse", () => {
    const plan = planFor(["functions/api/ask.ts"], none);
    expect(plan).toMatchObject({ e2e: ["ask"], perf: false, lighthouse: false });
    expect(planOutputs(plan)).toMatchObject({ e2e: "specs", e2e_files: "e2e/ask.spec.ts" });
  });

  it("runs mapped specs and Lighthouse for a page change, and perf only when the 3D roots import the file", () => {
    const page = planFor(["src/components/page/Hero.tsx"], none);
    expect(page).toMatchObject({ perf: false, lighthouse: true });
    expect(page.e2e).toContain("pageview");
    const shared = planFor(["src/lib/audio/engine.ts"], (f) => f === "src/lib/audio/engine.ts");
    expect(shared).toMatchObject({ perf: true, lighthouse: true });
  });

  it("runs a changed spec by itself", () => {
    expect(planFor(["e2e/topics.spec.ts"], none).e2e).toEqual(["topics"]);
  });

  it("runs every e2e shard for a changed e2e helper", () => {
    expect(planFor(["e2e/edge-audit.ts"], none)).toMatchObject({ e2e: "all", perf: false, lighthouse: false });
    expect(planFor(["e2e/topics.spec.ts", "e2e/edge-audit.ts"], none).e2e).toBe("all");
  });
});
