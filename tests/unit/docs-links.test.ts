import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Docs never point at code that is gone: relative links resolve, repository paths in backticks exist, and the
// current-state docs never name a removed module or setting.
const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function markdownUnder(dir: string): string[] {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    const rel = path.posix.join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    if (statSync(path.join(root, rel)).isDirectory()) return markdownUnder(rel);
    return name.endsWith(".md") ? [rel] : [];
  });
}

// History keeps the facts of its day: plans quote snippets written for other files (their relative links point from
// those files), and plans, specs, decisions and dated measurement reports may name code that later work removed.
const HISTORY = [/^docs\/superpowers\/plans\//, /^docs\/superpowers\/specs\//, /^docs\/decisions\//, /^docs\/perf\//, /^docs\/prototypes\//];
const isHistory = (file: string) => HISTORY.some((re) => re.test(file));

const ALL_DOCS = [
  "AGENTS.md",
  "README.md",
  ...markdownUnder("docs"),
  ...markdownUnder("workers"),
  ...markdownUnder("tools"),
  ...markdownUnder("src"),
  ...markdownUnder("public"),
];
const LINK_CHECKED = ALL_DOCS.filter((f) => !f.startsWith("docs/superpowers/plans/"));
const CURRENT_STATE = ALL_DOCS.filter((f) => !isHistory(f));

// Code (fenced and inline) is not a link.
const withoutCode = (md: string) => md.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

function relativeLinks(markdown: string): string[] {
  return [...withoutCode(markdown).matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map((m) => m[1])
    .filter((href) => !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("#"))
    .map((href) => decodeURI(href.split("#")[0]))
    .filter(Boolean);
}

const REPO_ROOTS = /^(src|scripts|functions|workers|tools|tests|e2e|content|public|messages|docs|\.github)\//;
// Build output that is gitignored, so it exists only after a build.
const GENERATED = [/^functions\/_generated\/$/];

// Repository paths in backticks (`src/lib/x.ts`), without placeholders such as {locale}, <name>, * or YYYY.
function repoPaths(markdown: string): string[] {
  return [...markdown.matchAll(/`([^`\s]+)`/g)]
    .map((m) => m[1].replace(/[),.;:]+$/, "").split(/[#?]/)[0].replace(/:\d+(-\d+)?$/, ""))
    .filter((p) => REPO_ROOTS.test(p) && !/[*{}<>[\]$|]|YYYY|\.\.(?!\/)/.test(p) && !GENERATED.some((re) => re.test(p)));
}

// A path resolves from the repository root, from the doc's own folder (workers/stats/README.md names `src/run.ts`),
// or through the `@/` alias (`content/selectors.ts` is `src/content/selectors.ts`).
function resolves(doc: string, p: string): boolean {
  return [path.join(root, p), path.resolve(root, path.dirname(doc), p), path.join(root, "src", p)].some(existsSync);
}

// Removed code and settings: current-state docs must not name them. Add an entry whenever a PR deletes a module,
// a script, a secret or a variable that docs used to describe; history (plans, specs, decisions) may keep them.
const REMOVED: { term: RegExp; why: string }[] = [
  { term: /SAFETY_BLOCKLIST/, why: "the blocklist secret and its grace variable, removed in #288" },
  { term: /safety-blocklist(\.default)?\.txt/, why: "the committed default blocklist, removed in #288" },
  { term: /safety-match/, why: "the blocklist matcher module, removed in #288" },
  { term: /_generated\/safety\.json/, why: "the Ask output blocklist bundle, removed in #288" },
  { term: /private term #/, why: "private term labelling of blocklist hits, removed in #288" },
];

describe("docs links", () => {
  it("finds the docs", () => {
    expect(CURRENT_STATE.length).toBeGreaterThan(30);
    expect(CURRENT_STATE).toContain("docs/agents/ci-and-deploy.md");
  });

  it.each(LINK_CHECKED)("%s: every relative link resolves", (file) => {
    const missing = relativeLinks(read(file)).filter((href) =>
      !existsSync(href.startsWith("/") ? path.join(root, href) : path.resolve(root, path.dirname(file), href)),
    );
    expect(missing).toEqual([]);
  });
});

describe("current-state docs", () => {
  it.each(CURRENT_STATE)("%s: every repository path in backticks exists", (file) => {
    expect(repoPaths(read(file)).filter((p) => !resolves(file, p))).toEqual([]);
  });

  it.each(CURRENT_STATE)("%s: names no removed module or setting", (file) => {
    const text = read(file);
    expect(REMOVED.filter(({ term }) => term.test(text)).map(({ term, why }) => `${term.source}: ${why}`)).toEqual([]);
  });

  it("the checks catch a dead link, a dead path and a removed name", () => {
    expect(relativeLinks("[a](gone.md) [b](https://x.dev) [c](#top) `[d](code.md)`")).toEqual(["gone.md"]);
    expect(repoPaths("`src/gone.ts` `src/{locale}/x` `bun run build` `docs/decisions/YYYY-MM-DD-x.md`")).toEqual(["src/gone.ts"]);
    expect(resolves("docs/agents/x.md", "src/gone.ts")).toBe(false);
    expect(resolves("workers/stats/README.md", "src/run.ts")).toBe(true);
    expect(REMOVED.some(({ term }) => term.test("set SAFETY_BLOCKLIST"))).toBe(true);
  });
});
