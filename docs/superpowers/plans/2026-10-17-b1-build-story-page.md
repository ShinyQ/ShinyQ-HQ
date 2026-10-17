# B1 Engine Room, PR 1: Build Story Data and the Classic Page Implementation Plan

Status: in progress (PR 1 of 3; PR 2 floor and PR 3 unlock follow in their own plans)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, always open "How this site was built" Classic page (`/en/build`, `/id/build`) rendered from a schema-validated `content/build-story.json` plus a build-time snapshot `content/generated/build-facts.json`, linked from the footer, About, README and Ask the HQ, ready for the B1 Engine Room floor (PR 2) to reuse the same data.

**Architecture:** Authored copy (stations, rounds, gates, agent workflow, the site diagram) lives in `content/build-story.json` (zod: `BuildStorySchema` in `src/content/build-story.ts`). Numbers come only from `scripts/build-facts.ts`, which reads git, the test runners, `ci.yml`, `docs/superpowers/` and `e2e/budgets.ts`, and omits any block it cannot compute reliably (shallow clone, failed command). CI's build job runs it with full history before `bun run build`; local builds use the committed snapshot. The page is a server component composed from small section components under `src/components/build/`, so PR 2's drawer bodies can import the same pieces.

**Tech Stack:** Next.js 16 static export, next-intl, zod, Bun, Vitest, Playwright, Lighthouse CI.

## Global Constraints

- Spec (binding): `2026-10-17-b1-engine-room-design.md` (coordinator session files), sections 4 to 7.
- Owner request (verbatim): "Lets plan special place how this portfolio app was built (This will be a new floor for secret area done after user finish visiting all i planned add other component later".
- No em dashes (U+2014) anywhere, including commits and PR text.
- Every user-facing string `{ en, id }` (content) or in both `messages/en.json` and `messages/id.json` with identical keys. Indonesian natural and professional; technical terms stay English.
- Titles (round, station, gate, coming-soon titles and the page title) are Title Case (`isTitleCase` from `@/content/title-case`) and contain no first person (`hasFirstPerson`).
- Public repo rules: no client names, no cloud resource names or ids (no KV ids, gateway ids, site tags), no hostnames other than the public site, no money amounts.
- Numbers are true or absent: `build-facts.ts` omits a value it cannot compute; the page hides a tile whose value is absent. Never hard-code a count in copy.
- Static export: the route pre-renders through `generateStaticParams` from the locale layout, `dynamicParams = false` stays as in sibling routes; `generateMetadata` returns `seoMetadata(locale, "/build")`; the path goes into `STATIC_PATHS` in `src/lib/routes.ts`.
- Client bundles: client components import `Locale` from `@/content/locales`, never values from `@/content/schema` or `@/content/load`.
- Classic site budgets (`lighthouserc.json`): LCP 2 s, CLS 0.01, TBT 200 ms, JS 240 KB, CSS 20,480 B, fonts 60 KB, HTML 80 KB. `/en/build` is added to the Lighthouse URL list and must pass them.
- Stations (fixed ids and order, reused by PR 2): `blueprint`, `timeline`, `agents`, `gates`, `dashboard`; coming soon: `brain` ("Rover's Brain"), `rejected` ("Rejected Designs").
- Rounds are defined by merged PR number ranges (`prs.from`, `prs.to`, `to` null for the open round); the facts script assigns merged PRs from `(#N)` commit subjects on the first-parent history. Round boundaries are an authoring choice flagged to the owner in the PR text.
- One CI run at a time on the shared runners; check `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued` before pushing.

---

### Task 1: Build story content and schema

**Files:**
- Create: `src/content/build-story.ts` (schemas, types, `getBuildStory()`, `getBuildFacts()`)
- Create: `content/build-story.json`
- Create: `public/build-story/*.webp` (three before/after pairs from committed captures)
- Test: `tests/content/build-story.test.ts`
- Modify: `tests/content/safety.test.ts` (lint `content/build-story.json`)

**Interfaces:**
- Produces:
  - `STATION_IDS = ["blueprint", "timeline", "agents", "gates", "dashboard"] as const`, `COMING_SOON_IDS = ["brain", "rejected"] as const`, `type StationId`, `type ComingSoonId`.
  - `BuildStorySchema`, `type BuildStory`, `type BuildRound`, `type BuildGate`.
  - `BuildFactsSchema`, `type BuildFacts` (shape below; Task 2 writes it).
  - `getBuildStory(): BuildStory`, `getBuildFacts(): BuildFacts` (parse the JSON files once, memoized).

Schema (zod 4, `z.strictObject`, reuse `LocalizedTextSchema`, `SlugSchema`, `IsoDateSchema`, `ArchitectureSchema` from `./schema`):

```ts
const shot = z.strictObject({ src: z.string().regex(/^\/build-story\/[a-z0-9-]+\.webp$/), width: z.number().int().positive(), height: z.number().int().positive(), alt: LocalizedTextSchema });
export const BuildRoundSchema = z.strictObject({
  id: z.string().regex(/^r[1-9][0-9]?$/),
  number: z.number().int().min(1),
  title: LocalizedTextSchema,
  summary: LocalizedTextSchema,
  prs: z.strictObject({ from: z.number().int().min(1), to: z.number().int().min(1).nullable() }),
  shots: z.strictObject({ before: shot, after: shot, caption: LocalizedTextSchema }).optional(),
});
export const BuildGateSchema = z.strictObject({
  id: SlugSchema,
  title: LocalizedTextSchema,
  text: LocalizedTextSchema,      // one line: what it checks
  budget: LocalizedTextSchema,    // e.g. "Under 450 KB gzip on the first-frame path"
  /** Display names of the ci.yml jobs that run it (checked against the facts' ci.jobs). */
  jobs: z.array(z.string().min(1)).min(1),
  required: z.boolean(),          // a required check on main's ruleset
});
const station = <T extends z.ZodRawShape>(extra: T) => z.strictObject({ title: LocalizedTextSchema, summary: LocalizedTextSchema, ...extra });
export const BuildStorySchema = z.strictObject({
  $comment: z.string().optional(),
  title: LocalizedTextSchema,
  lead: LocalizedTextSchema,
  stations: z.strictObject({
    blueprint: station({ architecture: ArchitectureSchema, steps: z.array(LocalizedTextSchema).min(3).max(10) }),
    timeline: station({ rounds: z.array(BuildRoundSchema).min(1) }),
    agents: station({
      steps: z.array(z.strictObject({ title: LocalizedTextSchema, text: LocalizedTextSchema })).min(4).max(8),
      tools: z.array(z.string().min(1)).min(1),
      excerpt: z.strictObject({ path: z.string().regex(/^docs\/superpowers\/plans\/[a-z0-9-]+\.md$/), text: z.string().min(40).max(1600) }),
    }),
    gates: station({ gates: z.array(BuildGateSchema).min(4) }),
    dashboard: station({}),
  }),
  comingSoon: z.strictObject({ brain: station({}), rejected: station({}) }),
}).superRefine(/* rounds: numbers 1..n in order, ids `r${number}`, ranges ascending and contiguous (next.from === prev.to + 1), only the last may have `to: null` */);

export const BuildFactsSchema = z.strictObject({
  generatedAt: IsoDateSchema,                 // date of the HEAD commit, so output is deterministic per commit
  commit: z.string().regex(/^[0-9a-f]{7}$/).optional(),
  git: z.strictObject({ commits: count, firstCommit: IsoDateSchema, mergedPrs: count, latestPr: count }).optional(),
  rounds: z.array(z.strictObject({ id: z.string(), prs: z.array(z.number().int().min(1)), first: IsoDateSchema.optional(), last: IsoDateSchema.optional() })).optional(),
  tests: z.strictObject({ unit: count.optional(), unitFiles: count, e2e: count.optional(), e2eFiles: count }).optional(),
  docs: z.strictObject({ specs: count, plans: count }).optional(),
  ci: z.strictObject({ jobs: z.array(z.string()).min(1), workflows: count }).optional(),
  budgets: z.strictObject({ js3dKb: z.number(), sessionFullKb: z.number(), sceneCalls: count, triangles: count, floorChunkKb: z.record(z.string(), z.number()) }).optional(),
});
```

- [ ] **Step 1: Write the failing test** `tests/content/build-story.test.ts`: parses `content/build-story.json` with `BuildStorySchema`; every title in `title`, stations, rounds, gates and coming soon passes `isTitleCase` and not `hasFirstPerson` (both locales); no string contains U+2014 (`collectStrings`); every `shots.*.src` file exists under `public/` and is under 120 KB; every gate's `jobs` entry appears in `.github/workflows/ci.yml` as a job `name:`; `excerpt.path` exists and its file contains `excerpt.text` lines (after trimming each line); round `to` of the last round is `null`; `getBuildFacts()` parses (fallback committed in Task 2, so for now assert the module exports it).
- [ ] **Step 2: Run** `bunx vitest run tests/content/build-story.test.ts`; expect FAIL (module missing).
- [ ] **Step 3: Implement** `src/content/build-story.ts` and author `content/build-story.json`:
  - Blueprint diagram nodes (labels plain, sublabels `{ en, id }`), no resource ids: Kurniadi (human), AI coding agents (ai: GitHub Copilot and Claude Code), GitHub (external: pull requests and Actions CI), Cloudflare Pages (service: Next.js static export, group "Cloudflare"), Visitor browser (client), Pages Functions (service: ask, rum, visit, stats), Workers AI (ai: through AI Gateway, Gemma 4 with a Mistral Small 3.1 fallback), KV and Analytics Engine (data), hq-stats Cron Worker (service). Edges: owner to GitHub (specs, review, merge), agents to GitHub (pull requests), GitHub to Pages (deploy after green CI), visitor to Pages (HTML, JS, 3D), visitor to Functions (Ask, beacons, stats), Functions to Workers AI, Functions to KV, Cron to KV (async).
  - Rounds r1 to r9 with ranges #1-15, #16-51, #52-58, #59-65, #66-88, #89-145, #146-171, #172-186, #187-open.
  - Gates (ci.yml job names): typecheck/lint/unit ("Typecheck, lint, unit tests"), secret scan ("Secret scan"), public-safety scan of `out/` and social cards ("Build static export"), e2e shards ("E2E shard ${{ matrix.shard }}/4" as written in ci.yml), 3D perf gates and memory ("3D perf gates ${{ matrix.shard }}/2"), Lighthouse ("Lighthouse CI"), CSP hashes ("Build static export"), Smart CI plan ("Plan CI"). The look-preserving visual gate is a local script with no CI job, so it is described in the agents station, not in this list (the test accepts only real ci.yml job names).
  - Before/after pairs (webp, 960 px wide, `cwebp -q 72`): r2 Classic site home mockup (`docs/design/pageview/screenshots/home-desktop-fold.webp`) vs built (`docs/design/pageview/built/home-1440x900-fold.webp`); r3 landing mockup vs built (`docs/design/landing/screenshots|built/home-1440x900-fold.png`); r7 README L3 still at #140 (`git show 0c17bd65:docs/readme/floor-L3.jpg`) vs #169 (`git show 1a447c5a:docs/readme/floor-L3.jpg`).
  - Excerpt: a short task block quoted from `docs/superpowers/plans/2026-10-15-floor-chunks.md`.
- [ ] **Step 4: Run** the test and `bunx vitest run tests/content/safety.test.ts`; expect PASS.
- [ ] **Step 5: Commit** `feat(build): build story content, schema and before/after captures`.

### Task 2: Build-time snapshot script

**Files:**
- Create: `scripts/build-facts.ts`
- Create: `content/generated/build-facts.json` (committed fallback, written by the script locally)
- Modify: `.github/workflows/ci.yml` (`site` job: `fetch-depth: 0`, step `bun scripts/build-facts.ts --write` before "Build static export")
- Test: `tests/unit/build-facts.test.ts`

**Interfaces:**
- Consumes: `BuildFactsSchema`, `getBuildStory()` rounds (Task 1).
- Produces (exported, pure where possible):
  - `parsePrNumbers(subjects: string[]): number[]` (trailing `(#N)` only, unique, ascending).
  - `assignRounds(prs: { n: number; date: string }[], rounds: { id: string; prs: { from: number; to: number | null } }[]): BuildFacts["rounds"]`.
  - `parseCiJobs(yaml: string): string[]` (job `name:` values at 4-space indent under `jobs:`).
  - `parsePlaywrightList(stdout: string): { tests: number; files: number } | undefined` (`Total: N tests in M files`).
  - `gitFacts(cwd: string): Pick<BuildFacts, "generatedAt" | "commit" | "git"> & { prs: { n: number; date: string }[] } | undefined` (undefined when `git rev-parse --is-shallow-repository` prints `true` or git fails).
  - `collectFacts(cwd: string, opts: { runners: boolean }): BuildFacts`.
  - CLI: `bun scripts/build-facts.ts [--write] [--no-runners]`; prints the JSON; `--write` writes `content/generated/build-facts.json` only when the JSON differs; when git history is shallow it keeps the committed file and exits 0 with a notice.

- [ ] **Step 1: Write failing tests**: `parsePrNumbers(["feat: a (#12)", "docs: b", "x (#3) y", "fix: c (#3)"])` is `[3, 12]`; `assignRounds` puts #1 and #2 in r1 (1-2), #3 in r2 (3-open), with first/last dates; `parseCiJobs` on a small YAML returns names in order; `parsePlaywrightList("...\nTotal: 580 tests in 46 files\n")`; a fixture repo test: `git init` in a temp dir, three commits with fixed `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` and subjects `chore: init`, `feat: a (#1)`, `feat: b (#2)`, then `gitFacts(dir)` equals `{ generatedAt: "2026-10-03", commit: <7 hex>, git: { commits: 3, firstCommit: "2026-10-01", mergedPrs: 2, latestPr: 2 }, prs: [...] }`; a shallow clone (`git clone --depth 1 file://...`) returns undefined. Running `collectFacts` twice on the fixture gives identical JSON (determinism).
- [ ] **Step 2: Run** `bunx vitest run tests/unit/build-facts.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** with `node:child_process` `execFileSync` (no shell). Runners: `bunx vitest list --json` (count of entries) and `bunx playwright test --list` (parse), each wrapped in try/catch with a 120 s timeout; a failure omits that number only. File counts: `tests/**/*.test.ts` and `e2e/**/*.spec.ts` excluding `e2e/perf/` (exact, by walking the dirs). Docs: files in `docs/superpowers/plans/*.md` and `docs/superpowers/specs/**/*.md`. Budgets: import `RENDER_BUDGET`, `BYTES_3D_BUDGET` from `e2e/budgets.ts` (KB = bytes / 1024 rounded to 0.1). `ci.workflows`: number of `.github/workflows/*.yml`. Validate with `BuildFactsSchema.parse` before writing; key order stable.
- [ ] **Step 4: Run** tests (PASS), then `bun scripts/build-facts.ts --write` to commit a real fallback; `bunx vitest run tests/content/build-story.test.ts` (facts parse; rounds ids match the story).
- [ ] **Step 5: CI wiring**: in `.github/workflows/ci.yml` job `site`, add `fetch-depth: 0` to its checkout and a step `- name: Build facts snapshot` `run: bun scripts/build-facts.ts --write` before "Build static export". Document in `docs/agents/ci-and-deploy.md`.
- [ ] **Step 6: Commit** `feat(build): build-time facts snapshot (git, tests, CI, budgets)`.

### Task 3: The Classic page `/[locale]/build`

**Files:**
- Create: `src/app/[locale]/build/page.tsx`
- Create: `src/components/build/` (`BuildSections.tsx` server sections: `BlueprintSection`, `TimelineSection`, `AgentsSection`, `GatesSection`, `DashboardSection`, `ComingSoonSection`; `BuildVisits.tsx` client island)
- Modify: `src/lib/routes.ts` (`STATIC_PATHS` adds `"/build"`; `lastModified("/build")` = `getBuildFacts().generatedAt`), `src/app/sitemap.ts` (priority 0.6 default is fine)
- Modify: `src/lib/site.ts` (`OG_PAGES` adds `"build"`), `src/lib/og-cards.ts` (`PAGE_FLOOR.build = "L1"`, eyebrow for build from `seo.og.pages.build.eyebrow`), `src/lib/seo.ts` (`SECTION_PAGES["/build"] = "build"`), `src/lib/jsonld.ts` (`Section` adds `"build"`; `/build` adds `techArticleJsonLd(locale)`)
- Modify: `messages/en.json`, `messages/id.json` (`meta.build`, `nav.build`, `seo.buildTitle`, `seo.buildDescription`, `seo.more.build.{1,2,3}`, `seo.og.pages.build.{title,subtitle,eyebrow}`, a `build` namespace for section UI labels)
- Modify: `src/components/SiteFooter.tsx` (pages list adds `/build`), `src/app/[locale]/contact/page.tsx` (a "How this site was built" link in the header block after the story), `lighthouserc.json` (URL `/en/build`), `e2e/routes.ts` (`staticRoutes` adds `/${locale}/build`)
- Test: `tests/unit/build-page.test.ts` (JSON-LD and section data helpers), existing `tests/unit/seo*.test.ts`, `tests/unit/og-cards.test.ts`, `e2e/pageview.spec.ts` (one test: sections, ToC, diagram figure, no first person in h1)

**Interfaces:**
- Consumes: `getBuildStory()`, `getBuildFacts()`, `STATION_IDS`, `COMING_SOON_IDS` (Task 1), facts shape (Task 2), `ArchitectureDiagram`, `PageIntro`, `SectionSplit`, `useStats`/`requestStats` from `@/lib/visits/store`, `formatCount` from `@/lib/visits/model`.
- Produces: `techArticleJsonLd(locale: Locale): JsonLdObject` (`@type: TechArticle`, `headline`, `description` from `seoFor`, `url`, `inLanguage`, `dateModified` = facts `generatedAt`, `author`/`publisher` person ref, `about` ["Next.js", "React Three Fiber", "Cloudflare Pages", "AI coding agents"], `isPartOf`); section components each take `{ locale: Locale }` and render a `<SectionSplit id={stationId}>` so PR 2 drawers can reuse the bodies (export the inner body components too: `BlueprintBody`, `TimelineBody`, `AgentsBody`, `GatesBody`, `DashboardBody`).

- [ ] **Step 1: Failing tests**: `techArticleJsonLd("en")` has `@type` `TechArticle`, the `/en/build` url and a description of 140 to 160 characters; `seoFor("id", "/build")` passes the existing copy tests (they iterate `allPagePaths()` and `allOgTargets()`, so they fail until messages exist); `pageJsonLd("en", "/build")` returns a breadcrumb plus the TechArticle.
- [ ] **Step 2: Run** `bunx vitest run tests/unit` and confirm the new failures.
- [ ] **Step 3: Implement** the page like `/quick` (no `ExperienceGate` in PR 1): `PageIntro` (title, lead, snapshot line "Snapshot of {date}, commit {sha}" when present, a source code link to the repo), a ToC chip row (stations plus coming soon), then the six sections. Timeline rows show "Round N", title, merge date range, summary, PR count and every PR as a small `#N` link to `https://github.com/ShinyQ/ShinyQ-HQ/pull/N` (opens in a new tab via `ExternalLink`), and the optional before/after figure (two `<img loading="lazy" decoding="async" width height>` with alt text, captions). Gates: a table (gate, what it checks, budget, Required or Runs when needed). Dashboard: `StatLedger`-style grid of present numbers only (merged PRs, commits, unit tests, e2e tests, specs, plans, 3D JS budget, scene calls, triangles, floors 5), "Monitored hourly" for uptime and `BuildVisits` (30-day visits from the stats store once ready; renders nothing until then). Coming soon: two dimmed plates. All copy from content or `build` messages; no `text-transform`.
- [ ] **Step 4: Wire** routes, sitemap, SEO, OG, JSON-LD, footer, About link, Lighthouse URL and e2e routes; run `bun run og:check` after `bun run build` (new OG cards `/og/{en,id}/page/build.jpg`).
- [ ] **Step 5: Verify**: `bunx vitest run tests/unit tests/content`, `bun run build`, then check `out/en/build.html` size under 80 KB and grep for U+2014; `bunx playwright test e2e/pageview.spec.ts e2e/static-routes.spec.ts e2e/seo.spec.ts`.
- [ ] **Step 6: Commit** `feat(build): How this site was built Classic page (/build)`.

### Task 4: Ask link, docs and README

**Files:**
- Modify: `src/ask/protocol.ts` (`ASK_CITE_PATTERN` accepts `/build`; `AskCiteKind` adds `"build"`; `citeKind("/build") === "build"`), `functions/_lib/messages.ts` (`WHERE.build`), `messages/*.json` (`ask.cite.build`), `src/ask/pack.ts` (site chunk `url: "/build"`), `content/ask/site-build.json` (text gains one sentence pointing to the page; `$comment` updated: the page exists now; `asOf` 2026-10-17), `src/content/schema.ts` (comment on `SiteBuildSchema`)
- Modify tests: `tests/ask/pack.test.ts` (chunk url `/build`, `isAskCite`), `tests/ask/*` that expect the repo cite for site answers, `tests/ask/golden.json` only if a fact moved
- Docs: `README.md` (routes table and docs index link), `docs/features.md` (Classic site section and status row), `docs/content.md` (editing the build story, refreshing the snapshot), `docs/agents/content.md` (`getBuildStory`, `getBuildFacts`, schema), `docs/agents/page-view.md` (route), `docs/agents/ask.md` (cite kinds), `docs/decisions.md` (dated row: B1 Engine Room owner decisions), `docs/superpowers/README.md` (plan row, count 71)

- [ ] **Step 1: Failing tests**: pack test expects `chunk.url === "/build"` and `citeKind("/build") === "build"`; protocol test `isAskCite("/build")`.
- [ ] **Step 2: Implement**; if `functions/_lib/prompt.ts` text mentions citing the repository for site questions, update it and bump `PROMPT_VERSION`.
- [ ] **Step 3: Run** `bunx vitest run tests/ask` (PASS) and `bun run validate:content`.
- [ ] **Step 4: Docs** as listed; no feature detail in the README beyond one route row and one docs link.
- [ ] **Step 5: Commit** `feat(ask): cite the How this site was built page; docs`.

### Task 5: Verify and open the PR

- [ ] `bun run verify:quick`, then `bun run e2e:changed`.
- [ ] Check CI capacity (`gh run list -R ShinyQ/ShinyQ-HQ -s in_progress`, `-s queued`), push, open the PR with the round boundaries flagged for the owner, watch CI, merge when green (pre-approved), report the merge sha to the coordinator.
