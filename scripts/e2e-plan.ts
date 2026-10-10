/**
 * Pure planning helpers for the e2e scripts (no Bun, no Playwright, so Vitest can run them):
 * - specsForChanges: which Playwright specs cover a set of changed paths (`bun run e2e:changed`).
 * - assignShard: a balanced split of the test list for CI shards (`bun run e2e:shard`).
 */

/** Fast specs that cover routes, SEO, deploy rules and the game-first load (about 1 to 2 minutes). */
export const SMOKE_SPECS = ["static-routes", "seo", "deploy", "boot-first", "pageview"] as const;

/** Every spec in the default (non-screenshot) suite. */
export const ALL_SPECS = [
  "boot-first",
  "career",
  "deploy",
  "drawer-solid",
  "experience",
  "gallery",
  "labs",
  "library-roof",
  "missions",
  "pageview",
  "seo",
  "static-routes",
] as const;

export type Spec = (typeof ALL_SPECS)[number];

interface Rule {
  /** Matched against the repo-relative POSIX path. */
  test: RegExp;
  /** Specs to run, `"all"` for the full suite, or `[]` when the path needs no e2e run. */
  specs: Spec[] | "all";
}

/**
 * First matching rule wins, so specific paths come before their parent folders.
 * Keep this in sync with the "Fast verification" section of AGENTS.md.
 */
export const RULES: Rule[] = [
  // Test infrastructure and dependencies: anything can break.
  { test: /^(package\.json|bun\.lock|next\.config\.ts|playwright\.config\.ts|tsconfig\.json)$/, specs: "all" },
  { test: /^e2e\/(hq|routes)\.ts$/, specs: "all" },
  { test: /^e2e\/screenshots\.spec\.ts$|^e2e\/pageview-visual\.spec\.ts$/, specs: [] },
  // Not part of the site or the e2e suite.
  { test: /^(docs|tests|\.github)\/|\.md$|^scripts\/(e2e-|validate-)|^lighthouserc\.json$|^eslint\.config\.mjs$|^vitest\.config\.mts$/, specs: [] },

  // 3D floors.
  { test: /^src\/experience\/floors\/labs\//, specs: ["labs", "gallery"] },
  { test: /^src\/experience\/floors\/career\//, specs: ["career"] },
  { test: /^src\/experience\/floors\/(library|roof)\/|^src\/experience\/floors\/Library\.tsx$/, specs: ["library-roof"] },
  { test: /^src\/experience\/floors\/lobby\//, specs: ["experience"] },
  { test: /^src\/experience\/floors\//, specs: ["experience", "labs", "career", "library-roof"] },
  { test: /^src\/experience\/missions\//, specs: ["missions", "experience", "library-roof"] },
  { test: /^src\/experience\/camera\//, specs: ["experience", "career"] },
  { test: /^src\/experience\/ExperienceGate\.tsx$|^src\/lib\/(boot-first|gpu-tier)\.ts$|^src\/components\/BootCover\.tsx$/, specs: ["boot-first", "experience"] },
  { test: /^src\/experience\//, specs: ["experience"] },
  { test: /^src\/store\//, specs: ["experience"] },

  // HUD over the canvas.
  { test: /^src\/hud\/drawer\//, specs: ["labs", "gallery", "career", "library-roof", "drawer-solid"] },
  { test: /^src\/hud\//, specs: ["experience", "missions", "drawer-solid"] },
  // Shared tokens (.glass, .glass-solid) style both the HUD and the pages.
  { test: /^src\/app\/globals\.css$/, specs: ["drawer-solid", "pageview", "static-routes"] },

  // Static pages, SEO and hosting.
  { test: /^src\/app\/(sitemap|robots)\.ts$|^src\/app\/og\/|^src\/lib\/(site|jsonld|og|og-cards|routes)\.tsx?$/, specs: ["seo", "static-routes"] },
  { test: /^src\/app\/data\//, specs: ["labs", "library-roof"] },
  { test: /^public\/_(headers|redirects)$|^scripts\/serve-static\.ts$/, specs: ["deploy", "static-routes"] },
  { test: /^src\/components\/(Gallery|Lightbox|Chip)\.tsx$|^src\/content\/(media|tech)\.ts$|^public\/(media|tech)\//, specs: ["gallery", "pageview"] },
  { test: /^src\/(app|components)\/|^src\/content\/pageview\.ts$/, specs: ["pageview", "static-routes", "gallery"] },
  { test: /^src\/i18n\//, specs: ["static-routes", "experience"] },
  { test: /^src\/lib\/(audio\/|url-sync|viewport|reduced-motion)/, specs: ["experience"] },
  { test: /^src\/lib\//, specs: ["static-routes", "pageview"] },
  { test: /^(content|messages)\/|^src\/content\//, specs: ["static-routes", "pageview", "seo"] },
  { test: /^public\//, specs: ["static-routes"] },
];

const SPEC_FILE = /^e2e\/([a-z0-9-]+)\.spec\.ts$/;

export interface ChangePlan {
  /** `"all"`: run the whole suite. Otherwise the spec names (without `.spec.ts`), sorted. */
  specs: Spec[] | "all";
  /** Changed paths no rule covered; they fall back to the smoke specs. */
  unmatched: string[];
}

/** Maps changed paths to the e2e specs that cover them. Unknown paths fall back to SMOKE_SPECS. */
export function specsForChanges(files: readonly string[]): ChangePlan {
  const specs = new Set<Spec>();
  const unmatched: string[] = [];
  for (const raw of files) {
    const file = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    const own = SPEC_FILE.exec(file)?.[1];
    if (own && (ALL_SPECS as readonly string[]).includes(own)) {
      specs.add(own as Spec);
      continue;
    }
    const rule = RULES.find((r) => r.test.test(file));
    if (!rule) {
      unmatched.push(file);
      continue;
    }
    if (rule.specs === "all") return { specs: "all", unmatched: [] };
    for (const s of rule.specs) specs.add(s);
  }
  if (unmatched.length) for (const s of SMOKE_SPECS) specs.add(s);
  return { specs: [...specs].sort(), unmatched };
}

/**
 * Round-robin split of an ordered test list into `total` shards (1-based `index`). Playwright's own
 * `--shard` cuts the list into contiguous blocks, which puts most of the slow 3D specs into one or
 * two shards; interleaving spreads every spec across all shards.
 */
export function assignShard<T>(tests: readonly T[], index: number, total: number): T[] {
  if (!Number.isInteger(total) || total < 1) throw new Error(`invalid shard total ${total}`);
  if (!Number.isInteger(index) || index < 1 || index > total) throw new Error(`invalid shard ${index}/${total}`);
  return tests.filter((_, i) => i % total === index - 1);
}

/** Parses "2/4" into { index: 2, total: 4 }. */
export function parseShard(value: string): { index: number; total: number } {
  const match = /^(\d+)\/(\d+)$/.exec(value.trim());
  if (!match) throw new Error(`expected a shard like 2/4, got "${value}"`);
  const index = Number(match[1]);
  const total = Number(match[2]);
  assignShard([], index, total);
  return { index, total };
}
