import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assignRounds, collectFacts, gitFacts, parseCiJobs, parsePlaywrightList, parsePrNumbers, serialize } from "../../scripts/build-facts";

const scratchRoot = path.join(process.cwd(), "test-results");
mkdirSync(scratchRoot, { recursive: true });
const scratch = mkdtempSync(path.join(scratchRoot, "build-facts-"));
const repo = path.join(scratch, "repo");
const shallow = path.join(scratch, "shallow");

function git(cwd: string, args: string[], date?: string) {
  const env = { ...process.env, ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) };
  return execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function write(file: string, text = "x\n") {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), text);
}

const rounds = [
  { id: "r1", prs: { from: 1, to: 2 } },
  { id: "r2", prs: { from: 3, to: null } },
];

beforeAll(() => {
  // The scratch dir sits inside this repository: stop git from discovering it for the non-git case.
  process.env.GIT_CEILING_DIRECTORIES = scratchRoot;
  mkdirSync(repo, { recursive: true });
  git(repo, ["init", "-q"]);
  write("tests/unit/a.test.ts");
  write("tests/unit/b.test.ts");
  write("tests/helpers/not-a-test.ts");
  write("tests/hud/Panel.test.tsx");
  write("tests/ask/node_modules/dep.test.ts");
  write("e2e/hud.spec.ts");
  write("e2e/screenshots.spec.ts");
  write("e2e/perf/gate.spec.ts");
  write("docs/superpowers/plans/p1.md");
  write("docs/superpowers/plans/p2.md");
  write("docs/superpowers/specs/s.md");
  write("docs/superpowers/specs/agent-hq/01.md");
  write(".github/workflows/ci.yml", "name: CI\njobs:\n  a:\n    name: First job\n    steps:\n      - name: not a job\n  b:\n    name: Second job\n");
  write(".github/workflows/deploy.yml");
  const commits: [string, string][] = [
    ["chore: init", "2026-10-01T12:00:00Z"],
    ["feat: a (#1)", "2026-10-02T12:00:00Z"],
    ["feat: b (#2)", "2026-10-03T23:30:00Z"],
  ];
  for (const [subject, date] of commits) {
    git(repo, ["add", "-A"], date);
    git(repo, ["commit", "-q", "--allow-empty", "-m", subject], date);
  }
  git(scratch, ["clone", "-q", "--depth", "1", `file://${repo}`, shallow]);
});

afterAll(() => {
  delete process.env.GIT_CEILING_DIRECTORIES;
  rmSync(scratch, { recursive: true, force: true });
});

describe("parsePrNumbers", () => {
  it("takes the trailing (#N) of each subject, unique and ascending", () => {
    expect(parsePrNumbers(["feat: a (#12)", "docs: b", "x (#3) y", "fix: c (#3)"])).toEqual([3, 12]);
  });
});

describe("assignRounds", () => {
  it("puts each PR in its round with the first and last date", () => {
    const prs = [
      { n: 1, date: "2026-10-01" },
      { n: 2, date: "2026-10-03" },
      { n: 3, date: "2026-10-05" },
    ];
    expect(assignRounds(prs, rounds)).toEqual([
      { id: "r1", prs: [1, 2], first: "2026-10-01", last: "2026-10-03" },
      { id: "r2", prs: [3], first: "2026-10-05", last: "2026-10-05" },
    ]);
  });

  it("leaves dates off a round without PRs", () => {
    expect(assignRounds([], rounds)).toEqual([
      { id: "r1", prs: [] },
      { id: "r2", prs: [] },
    ]);
  });
});

describe("parseCiJobs", () => {
  it("returns job names in order, ignoring step names and quotes", () => {
    const yaml = 'name: CI\non:\n  push:\njobs:\n  a:\n    name: One\n    steps:\n      - name: step\n  b:\n    name: "Two ${{ matrix.n }}"\nenv:\n    name: nope\n';
    expect(parseCiJobs(yaml)).toEqual(["One", "Two ${{ matrix.n }}"]);
  });
});

describe("parsePlaywrightList", () => {
  it("reads the total line", () => {
    expect(parsePlaywrightList("Listing tests:\n  [chromium] › a.spec.ts\nTotal: 580 tests in 46 files\n")).toEqual({ tests: 580, files: 46 });
    expect(parsePlaywrightList("nothing")).toBeUndefined();
  });
});

describe("gitFacts", () => {
  it("measures a fixture repository in UTC", () => {
    const facts = gitFacts(repo);
    expect(facts).toEqual({
      generatedAt: "2026-10-03",
      commit: expect.stringMatching(/^[0-9a-f]{7}$/),
      git: { commits: 3, firstCommit: "2026-10-01", mergedPrs: 2, latestPr: 2 },
      prs: [
        { n: 1, date: "2026-10-02" },
        { n: 2, date: "2026-10-03" },
      ],
    });
  });

  it("returns undefined for a shallow clone and for a non-git directory", () => {
    expect(gitFacts(shallow)).toBeUndefined();
    expect(gitFacts(scratch)).toBeUndefined();
  });
});

describe("collectFacts", () => {
  it("counts files (vitest includes `.test.tsx` too), docs and CI without spawning the runner", () => {
    const facts = collectFacts(repo, { runners: false, rounds });
    expect(facts.rounds).toEqual([
      { id: "r1", prs: [1, 2], first: "2026-10-02", last: "2026-10-03" },
      { id: "r2", prs: [] },
    ]);
    expect(facts.tests).toEqual({ unitFiles: 3, e2eFiles: 1 });
    expect(facts.docs).toEqual({ specs: 2, plans: 2 });
    expect(facts.ci).toEqual({ jobs: ["First job", "Second job"], workflows: 2 });
    expect(facts.budgets).toMatchObject({ js3dKb: 466.4, sessionFullKb: 518.7, sceneCalls: 150, triangles: 30000, floorChunkKb: { L3: 20, L4: 16, RF: 8 } });
  });

  it("is deterministic and keeps a stable key order", () => {
    const a = serialize(collectFacts(repo, { runners: false, rounds }));
    const b = serialize(collectFacts(repo, { runners: false, rounds }));
    expect(a).toBe(b);
    expect(a.endsWith("}\n")).toBe(true);
    expect(Object.keys(JSON.parse(a))).toEqual(["generatedAt", "commit", "git", "rounds", "tests", "docs", "ci", "budgets"]);
  });

  it("uses a precomputed git result instead of reading history again", () => {
    const precomputed = gitFacts(repo);
    expect(precomputed).toBeDefined();
    expect(serialize(collectFacts(shallow, { runners: false, rounds, git: precomputed }))).toContain(`"commit": "${precomputed?.commit}"`);
  });

  it("throws without usable git history", () => {
    expect(() => collectFacts(shallow, { runners: false, rounds })).toThrow(/unavailable/);
  });
});

describe("CLI", () => {
  it("rejects --write with --no-runners and leaves the file alone", () => {
    const result = spawnSync("bun", ["scripts/build-facts.ts", "--write", "--no-runners"], { cwd: process.cwd(), encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/cannot be combined/);
  });
});
