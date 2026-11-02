# CI and deploy

Workflow, scripts, dependencies, the `main` ruleset, CI, production deploy, build-time env, audio and Next.js notes.
Index: [AGENTS.md](../../AGENTS.md).

## Workflow

### Scripts

- Package manager: Bun, the exact version in `packageManager` (`bun@1.4.3` in `package.json`; every CI job reads it through `bun-version-file`).
- Node: one exact version in `.nvmrc` and `.node-version` (24.22.1, the 2026-10-21 security release), with `engines.node` at `>=` that version. `next build`, Playwright, wrangler and `@lhci/cli` run on Node (their bins have a node shebang), so every CI job that runs them sets it up with `actions/setup-node` (`node-version-file: .nvmrc`): the shared `.github/actions/setup` does, and a job without it (Lighthouse CI, the rollback) adds the step itself. Never rely on the runner's preinstalled Node. `tests/unit/workflows.test.ts` checks it. Bump all three files together on a Node security release.

| Script | Notes |
|---|---|
| `dev` | |
| `build` | knowledge pack, logo atlas check, `next build`, then `defer-scripts`, `root-redirect`, `check-client-chunks` and `csp-hashes`; `build:web` is an alias |
| `typecheck` | knowledge pack, `next typegen`, `tsc --noEmit` |
| `lint`, `test`, `test:watch` | |
| `verify:quick` | see [Fast verification](performance.md#fast-verification) |
| `e2e` | plain `playwright test` |
| `e2e:full`, `e2e:changed`, `e2e:smoke`, `e2e:shard` | |
| `e2e:perf` | perf lane (without the nightly-only L1 poses) |
| `e2e:perf:nightly` | perf lane with the nightly-only L1 poses (`@nightly`), as the nightly runs it |
| `e2e:perf:shard` | one CI perf shard |
| `e2e:durations` | refresh the shard timings |
| `e2e:timeline` | nightly timeline |
| `e2e:look` | local look check |
| `screenshots`, `screenshots:pages`, `serve`, `validate:content`, `floor:thumbs`, `og:check`, `og:stills` | |
| `build:knowledge`, `logo:atlas`, `engine:atlas`, `cv:pages`, `paper:pages`, `ask:eval` | content and media tools |
| `bench` | Vitest benches in `tests/bench/` (see [Fast verification](performance.md#fast-verification)) |

### Before pushing and committing

- Before pushing: see [Fast verification](performance.md#fast-verification) (`verify:quick` plus `e2e:changed`); PR CI runs only the heavy jobs the change needs, `main` and the nightly run everything ([CI](#ci)).
- CI runs in flight (GitHub Free plan: 20 concurrent jobs for the account; each job is its own hosted VM, so overlapping runs only queue jobs past the cap). Before pushing, check `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`:
  - every run has at most 10 e2e plus perf shards (`HEAVY_SHARDS` in `scripts/ci-complement.ts`, owner decision [2026-11-01](../decisions/2026-11-01-ci-audit.md)): a full run (pull request, `main`, dispatch or nightly) peaks at 12 jobs (6 e2e and 4 perf shards, `Lighthouse CI` and the unit test job), a typical selective pull request at 5 to 8 (Lighthouse on 2 shards), a `main` complement at up to 12;
  - at most 2 runs in flight, at most one of them a full run: two pull request runs (12 + 8), or a `main` run with one selective pull request run (12 + 1 for `Deploy` + 7); at a rare joint peak a job waits in the queue for a minute, which costs far less than holding every push for a whole `main` run;
  - measured 2026-10-18 before the cap (job `startedAt` to `completedAt` overlap): full `main` runs 39114729615, 39116733269 and 39119431246 peaked at 14 on 8 e2e shards; full PR runs 39122107380 and 39126462529 at 12; selective PR runs 39111135400 and 39108331771 at 7, 39127959018 at 5.
- Bring a pull request up to date with `main` (merge `main` in) and wait for its CI before handing it to the owner (owner decision [2026-11-01](../decisions/2026-11-01-ci-audit.md)): a PR behind `main` merges as a tree its CI never saw, so the deploy waits for a full `main` run (27.4 min median to live in 15 of 52 deploys) instead of its 4 min fast path, and `main` runs everything instead of the complement.
- Commit in logical steps with conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `ci:`, `chore:`).
- Prefer the `rtk` git wrapper.
- One PR per change; do not merge without the owner. PRs land as squash merges.

### Dependencies

- Minor and patch updates land together.
- Each major lands in its own PR with every gate green.
  - 3D library majors also need the strict visual gate, the perf lane and the memory gates ([performance.md](performance.md)).
- A major that cannot pass is pinned with a `# revisit YYYY-MM-DD: reason` ignore in `.github/dependabot.yml` and a row in `docs/deploy.md` section 17 ([deploy.md](../deploy.md)); `tests/unit/dependabot.test.ts` checks it.
- TypeScript stays on `~6.0`: the TypeScript 7 major is skipped until 2027-01-15 (the `typescript` ignore in `.github/dependabot.yml` and its row in `docs/deploy.md` section 17), because typescript-eslint 8 supports TypeScript below 6.1 and TypeScript 7 drops the compiler API a unit test uses.
- Exact pins: `next`, `eslint-config-next`, `react`, `react-dom`, `sharp`, `pdfjs-dist` and `wrangler`. The hq-stats deploy in `deploy.yml` and `rollback.yml` reads its `wranglerVersion` from `package.json` (the rollback from the target commit's), so a `wrangler` bump needs no workflow edit (`tests/unit/workflows.test.ts`); keep the `compatibility_date` of `wrangler.toml` and both Workers on the same date.
- One scheduler: `next.config.ts` aliases npm `scheduler` (imported by the R3F reconciler) to `next/dist/compiled/scheduler`, the copy React DOM runs, so the 3D main path does not ship a second one (1,279 B gzip; every Classic page pays 70 to 73 B for the shared chunk, [decision](../decisions/2026-11-01-budgets-shared-scheduler.md)). `tests/unit/scheduler-alias.test.ts` fails when a `next`, `react` or R3F bump makes the two builds differ; then drop the alias or match the versions.
- Dependabot (`.github/dependabot.yml`): weekly on Monday (Asia/Jakarta), one `minor-and-patch` group for Bun packages (at most 5 open PRs) and one group for GitHub Actions (the workflows and `.github/actions/setup`). Every action is pinned to a full commit SHA with a version comment (`tests/unit/workflows.test.ts`).
- TypeScript 6 does not load every `@types/*` package: `tsconfig.json` lists the global ones in `types` (`["bun"]`, which brings the Node types). Add a package there when its globals are needed.
- Patched dependency: `@react-three/fiber` (`patchedDependencies` in `package.json`, `patches/@react-three%2Ffiber@<version>.patch`, made with `bun patch`). The patch drops `extend(THREE)` from `Canvas`, so the app registers only the three classes it renders ([3d-experience.md](3d-experience.md#three-catalogue)). An R3F bump must re-create it for the new version: `bun patch @react-three/fiber`, delete the `extend(THREE)` line in `dist/react-three-fiber.esm.js`, `.cjs.dev.js` and `.cjs.prod.js`, `bun patch --commit 'node_modules/@react-three/fiber'`, then drop the old patch file. `tests/unit/three-catalogue.test.ts` fails while the installed version has no patch.

### `main` ruleset

- `main` is protected by a repository ruleset (`docs/deploy.md` section 14, [deploy.md](../deploy.md)).
- Changes land only through a pull request whose head has the required checks:
  - `Typecheck, lint, unit tests`
  - `Build, CV and e2e`
  - `Lighthouse CI`
- No shard is a required check (owner decision [2026-10-23](../decisions/2026-10-23-ci-speed.md)): the shard counts follow the plan, `Build, CV and e2e` fails unless every e2e and perf shard passed, and `Lighthouse CI` (the `lighthouse-report` job) unless every Lighthouse shard passed.
- The checks report on selective smart CI runs too ([How the required checks stay green](#how-the-required-checks-stay-green)).
- Force pushes, deletion and direct pushes are rejected.
- Admins can bypass only through a PR, for emergencies.

## CI

`.github/workflows/ci.yml` runs smart CI (owner decisions 2026-10-17 and 2026-10-18, [decisions.md](../decisions.md)): a
pull request runs the fast checks always and only the tests its changed paths affect; a push to `main` runs only what
its merged pull request's green CI run on the same tree did not (the complement, a full run otherwise); dispatches and
the nightly run everything on 6 e2e and 4 perf shards, like a full pull request.

### Jobs

- Always, on every event:
  - `Plan CI` (`changes` job, `scripts/ci-plan.ts`): plans the heavy jobs (see [What a pull request runs](#what-a-pull-request-runs) and [Complement runs on `main`](#complement-runs-on-main)) and uploads the run's record, the `ci-plan` artifact (`ci-plan.json`, 30 days): what the run covers (e2e "all" or the specs plus the single smoke tests, perf "all" or the perf keys, Lighthouse "all" or the URL paths).
  - `Typecheck, lint, unit tests` (`check` job), plus a non-blocking `bun audit --audit-level=high` and the non-blocking Ask staleness check (`scripts/ask-staleness.ts`, one refreshed PR comment when the Ask data is stale).
  - `Secret scan` (gitleaks).
  - `Build static export` (`site` job): the build with its CSP hashes, the script policy check of `out/` (`scripts/scan-export.ts`) and `og:check`.
    - It checks out the full history (`fetch-depth: 0`) and first runs `bun scripts/build-facts.ts --write` (right after the setup action), which rewrites `content/generated/build-facts.json` (commits, PRs per round, unit test files, the end-to-end test count, spec and plan documents, CI jobs, the 3D budgets) for the build page.
    - The `site` job of `deploy.yml` (full-history checkout) runs the same step before its builds, so the shipped build page carries fresh numbers.
    - Local builds use the committed snapshot; refresh it with `bun scripts/build-facts.ts --write`. `--no-runners` skips the `playwright test --list` count and cannot be combined with `--write` (it would drop it from the file). No unit test count is measured (`vitest list` counts each `it.each` template once); only unit test files are. A shallow clone keeps the committed file. A failing runner prints a warning and omits only its number.
- Heavy jobs, against that one build:
  - e2e in duration-balanced shards (`E2E shard n/N`, worker-aware packing from `e2e/durations.json`, [performance.md](performance.md#ci-shards); functional specs run rides, drives, camera eases and the intro 4x faster, [performance.md](performance.md#animation-speed)): 6 on a full run (pull request, `main`, dispatch or nightly); a selective or complement run passes only the planned spec files and smoke tests (`E2E_FILES`) on the shard count the plan sizes (`e2e_shards`, 1 to 8, at most 10 minus its perf shards).
  - The 3D perf gates (`perf` job, `3D perf gates n/N`: `scripts/e2e-shard.ts` with `PERF=1`, see [Performance gates and measurement](performance.md#performance-gates-and-measurement)): the whole lane on 4 shards (full runs, pull requests included), a part on `ceil(seconds / 960)` shards, 1 to 4, from the perf lane of `e2e/durations.json` (a selective pull request and a complement run), running only the planned perf tests (`PERF_GREP`); 1 shard with only the "Not needed" step when no perf gate can move.
    - Every shard skips the look check (`@look`) and the timeline (`@timeline`, `perf-nightly.yml`). The nightly-only L1 poses (`@nightly`: the Needs Kurniadi beacon, the office in view, the Agent Office stop and the day replay, both tiers) run on the nightly schedule, a dispatch with the `nightly` input and a pull request that changes the Lobby or the office (`perf_nightly`, `nightlyPerfFor` in `scripts/perf-plan.ts`); other pull requests and `main` skip them (owner decision [2026-11-01](../decisions/2026-11-01-ci-audit.md)). The shard sizing counts them only when they run.
    - Each shard uploads its blob report (`perf-blob-report-n`) for the flaky summary.
  - Blocking Lighthouse (`lighthouserc.json`), `Lighthouse shard n/N` jobs plus the `Lighthouse CI` job (`lighthouse-report`):
    - The measured URLs split over 2 shards (each takes every second URL) when a run checks 4 or more URLs and has at most 8 e2e plus perf shards (`lighthouse_shards`), so a selective run, where Lighthouse finishes last, halves its 7 min; a full run keeps 1 shard, its e2e and perf shards outlast it. Each shard is its own runner, so no parallel Chrome skews a timing.
    - `Lighthouse CI` always runs: it merges the shards' reports (one folder per shard), adds the source run's reports on a complement run, writes the Page View JS per chunk against main, uploads `lighthouse-reports` and fails unless every shard passed.
    - LCP 2 s, CLS 0.01, TBT 200 ms and transfer budgets for fonts, HTML, CSS and JS fail the aggregate check.
    - The first URL is a warm-up that is never asserted. Each shard runs it once: the step serves `out/` itself, runs a 1-run `lhci collect` of the warm-up, then `lhci autorun` of its measured URLs with the config's 3 runs and assertions (its collect clears the warm-up result). Local runs of `lighthouserc.json` keep the warm-up in the URL list.
    - A selective run checks only the affected URLs (`LHCI_URLS`, written into `lighthouserc.ci.json` with `jq`), warm-up first.
    - See `docs/deploy.md` section 8 ([deploy.md](../deploy.md)) for what keeps LCP low.
- The aggregate required check `Build, CV and e2e`:
  - requires every job before it to succeed (`Plan CI`, check, secret scan, build, e2e, perf, the Lighthouse shards and `Lighthouse CI`), every e2e and perf shard included;
  - runs without the setup action's bun cache and install: its scripts import only node builtins and dependency-free repo files (`tests/unit/workflows.test.ts`), and the blob report merge runs `bunx playwright@<version>` with the `@playwright/test` version of `bun.lock`;
  - merged HTML report, the tests that passed only on retry (e2e, and the perf lane from its merged blob reports: a slow perf test that passes on its retry adds its whole time again to its shard), and the 3D perf summary against the last green main run (when the perf gates ran);
  - uploads the `ci-full` artifact when the plan ran every e2e test, every perf test and every Lighthouse URL, or is a complement run (second line `complement of CI run <id>`), even if the run then turns red; the marker the deploy gate needs, which still treats a red run as red.
- No PR preview job: the deploy token lives only in the `production` environment, so a preview would need its own preview-only repository token (the always-skipped `preview` job was removed on 2026-11-01).
- PR runs replace each other; in-progress runs on `main` are never cancelled (a newer push can replace a queued one; the deploy reuses them).

### What a pull request runs

`Plan CI` lists the PR's changed files from the GitHub API (a rename counts both paths), puts each file in the first
matching class below and writes the plan with its reasons to the job summary: which e2e specs and smoke tests, which
perf tests and which Lighthouse URLs run, and on how many shards. The classes live in `CLASSES` in `scripts/ci-plan.ts`
(the code wins over this table).

| Class | Paths | e2e | 3D perf gates | Lighthouse |
|---|---|---|---|---|
| `planmap` | the spec maps `scripts/e2e-plan.ts` and `scripts/perf-plan.ts` | the specs whose mapping changed (`mapDiff`) | the keys whose mapping changed | no |
| `ci` | `.github/workflows/ci.yml`, `.github/actions/`, `package.json`, `bun.lock`, `bunfig.toml`, `next.config.ts`, `playwright.config.ts`, `tsconfig.json`, `lighthouserc.json`, `postcss.config.*`, `e2e/{hq,routes,budgets}.ts`, `e2e/perf/`, `scripts/{ci-plan,ci-complement,ci-status,merge-gate,e2e-shard,perf-*,serve-static,flaky-report}` | full run | full run | full run |
| `code3d` | `src/experience/`, `src/hud/`, `src/store/`, `src/assets/`, `public/floors/`, `public/fonts/`, `public/atlas/` | mapped specs plus the PR smoke set | affected perf tests | affected URLs |
| `tests` | `tests/`, `e2e/durations.json`, `vitest.config.mts`, `eslint.config.mjs` | none | no | no |
| `e2e` | other `e2e/` files (specs, helpers) | specs: mapped (a changed spec runs itself); helpers: every shard | no | no |
| `content` | `content/`, `public/media/`, `public/papers/`, `public/cv/` | none | no | affected URLs (`site-content.json` and `content/generated/`: all; posts: the blog URL) |
| `functions` | `functions/`, `workers/`, `wrangler.toml` | mapped specs | no | no |
| `ui` | build scripts: `scripts/{build-knowledge,defer-scripts,root-redirect,check-client-chunks,csp-hashes,csp-policy}.ts` | mapped specs plus the PR smoke set | no | all URLs |
| `tooling` | other `scripts/`, `tools/` | mapped specs | no | no |
| `ui` | other `src/`, `messages/`, other `public/` | mapped specs plus the PR smoke set | affected perf tests, only for `src/` files the 3D roots import: the keys of the 3D files that import them | affected URLs |
| `docs` | `docs/`, other `.github/` (the other workflows: `ci.yml` never runs them, `tests/unit/workflows.test.ts` checks them), `*.md`, `LICENSE`, root dotfiles | none | no | no |
| `other` | anything unmatched | full run | full run | full run |

- Mapped specs: `specsForChanges` in `scripts/e2e-plan.ts` (the `e2e:changed` map) over every changed file outside `docs` and `tests`. A changed e2e helper (a non-spec `e2e/` file) runs the whole e2e suite on up to 8 shards; a path no rule maps plans a full run.
- Spec map changes (`planmap`, owner decision [2026-11-01](../decisions/2026-11-01-ci-audit.md)): `Plan CI` loads the PR base's `scripts/e2e-plan.ts` and `scripts/perf-plan.ts` (contents API, `BASE_SHA`) and compares them with the checked-out ones over every tracked file (git trees API): the e2e specs and perf keys either side maps differently, the specs whose smoke entry changed and the keys whose test selection changed run on top of the PR's own plan (`mapDiff` in `scripts/ci-plan.ts`); a path one side sends to the full suite runs every spec. Any failure (an API error, a base map that imports another file) plans a full run. The planner logic stays in the `ci` class.
- PR smoke set (`PR_SMOKE` in `scripts/e2e-plan.ts`), added whenever `code3d` or `ui` files change: `static-routes`, `boot-first` and `deploy`, one elevator ride and the 3D HUD axe check (single tests run as `e2e/<spec>.spec.ts:<line>` filters; a unit test keeps their titles real).
- Shard count of a selective run: the planned tests' worker-seconds from `e2e/durations.json` (an unknown spec counts 150 s, an unknown test 30 s) divided by 2 workers times 240 s, rounded up, 1 to 8, then at most 10 minus the perf shards (`HEAVY_SHARDS`).
- Perf shard count of a selective run: the whole lane 4; a part `ceil(seconds / 960)`, 1 to 4, from the perf lane of `e2e/durations.json` (`perfShardsFor`, as a complement run); no perf 1 ("Not needed").
- 3D perf tests (`scripts/perf-plan.ts`): a `code3d` file maps to perf keys (`PERF_RULES`): a floor folder to its floor gate (both tiers) and the rides to and from it, the HUD to the 3D bytes gate, rover and boost code to the boost and boot peaks, point-and-go to the hover peak, memory-sensitive paths (renderer, `Effects`, the floor chunk loader, the tower mount, `useDispose`, shared geometry and materials) to the whole lane including `memory-full`, anything else in the 3D code to the whole lane except `memory-full`. The keys become one Playwright `--grep`.
- Shared `src/` modules (`sharedPerfKeys` in `scripts/ci-plan.ts`): a `ui` file reachable from the 3D roots (`src/experience`, `src/hud`, `src/store`) through value, re-export, side-effect or dynamic imports (type-only imports do not count) gets the keys of the 3D files that import it, directly or through a chain of non-3D files (the walk stops at the first 3D file), so a module only the Lobby imports selects the Lobby gates, one only the HUD imports the bytes gate, one `Experience.tsx` imports every gate.
  - The payload builder `src/experience/gate-data.ts` (server-only, `experienceDataFor`) is not a 3D importer: a module it reaches moves the floors through the serialized payload, so it gets its module to gate rule (`SHARED_PERF_RULES` in `scripts/perf-plan.ts`: `src/ask/` to `boot` and `bytes`, `src/content/{certs,cert-views,highlights}.ts` to the Lobby gates), else the whole lane except `memory-full`. Rule keys add to the keys of the client 3D files that import the module.
  - Safe fallback: a 3D importer `PERF_RULES` does not know (for example `src/experience/config.ts`) gives the whole lane except `memory-full`, as before.
- Page code with its own perf gate (`pagePerfKeys` in `scripts/perf-plan.ts`): the study guide reader's files (`src/components/guides/`, `src/components/pdf-reader/`, `src/content/guides.ts`, `DialogHost.tsx`, `dialog-loaders.ts`, the `/library` page) add the `guides` key (`e2e/perf/guide-reader.spec.ts`, [performance.md](performance.md#study-guide-reader)), whether or not the 3D roots reach them.
- Lighthouse URLs (`pagesFromRepo` in `scripts/ci-plan.ts`; static imports only, dynamic `import()` does not count):
  - every URL: `messages/`, `public/fonts/`, `public/brand/`, the `ui` build scripts, `content/site-content.json` and `content/generated/` (but `build-facts.json`: `/en/build`), and in the app layouts' static closure the layouts and templates, stylesheets, `src/app/fonts.ts` and `src/i18n/` (the message selection): they change what each page ships differently. `lighthouserc.json` (budgets) is a `ci` file, so a full run;
  - the home page `/en`: any other module in the layouts' closure, since it lands in a chunk every page loads the same way; plus the measured pages whose own closure reaches it, unless every page does (the content loader, metadata helpers);
  - a page's URLs (`LIGHTHOUSE_PAGES`): a file only in that page's closure; a post: the measured post;
  - `/en` too for the Classic office card (`src/components/office/`, `HOME_LAZY`): its panel is a lazy chunk the home page loads near the viewport, with its classes in the shared stylesheet;
  - every selective run adds `/en` to its list; the `main` complement run checks the URLs the PR skipped.
- Full run (every e2e test, every perf test, every Lighthouse URL): `ci` or `other` files, a spec map change whose diff cannot be computed, a path the e2e rules cannot map, the `full-ci` label (add it, then re-run the workflow: the planner reads the labels from the API), a PR at the 3000-file cap of the GitHub API, a file list that cannot be read, or any planner error (the planner fails safe). A full PR run uses 6 e2e and 4 perf shards (12 jobs at its peak).
- Docs-only and tests-only PRs run no heavy job; content-only PRs run only Lighthouse on the affected URLs. Known trade-off: content data (for example `content/site-content.json`) feeds the 3D floors, and a selective PR skips tests the map does not tie to its paths, so such a break is caught by the complement run on `main` after the merge (it runs every test the PR run skipped; a red `main` rolls production back) or by the nightly.
- The local workflow does not change: `verify:quick` plus `e2e:changed` before pushing, plus the perf lane for 3D work ([Fast verification](performance.md#fast-verification)).

### Complement runs on `main`

A push to `main` (`EVENT=push`) runs only what its merged pull request's green CI run did not, so `main` still covers
everything once per merge without repeating the PR's tests (`scripts/ci-complement.ts`, called from `scripts/ci-plan.ts`).

- Source run: the merged PR from `GET /repos/{repo}/commits/{sha}/pulls` (same repository only; GitHub links a merge commit to its PR a few seconds after the push, so the lookup asks again every 5 s for about 30 s while no PR names the commit as its merge, `PR_LOOKUP_RETRIES` in `scripts/ci-complement.ts`); its head tree must equal the merged tree (`GET commits/{sha}`); the newest green `pull_request` run of `ci.yml` on that head; its `ci-plan` record (`gh run download`).
- Plan, the complement of the record:
  - e2e: every spec the PR run did not run whole (a spec it ran only as a single smoke test runs whole), on `ceil(worker-seconds / 480)` shards, 1 to 8, from `e2e/durations.json` (8 when the PR ran no spec whole), at most 10 minus its perf shards (`HEAVY_SHARDS`);
  - 3D perf gates: the perf keys it did not run, on `ceil(seconds / 960)` shards (about one `memory-full` test each), 1 to 4, from the perf lane of `e2e/durations.json`; the whole lane keeps 4;
  - Lighthouse: the URLs it did not check (every URL when it checked none).
- Fallback, a full run with the reason in the job summary: no merged PR from this repository, a different tree (a PR not up to date with `main`), no green run on the head, no readable record (a PR whose green run predates the `ci-plan` record, such as one merged before complement runs existed, or an expired artifact), or any API or planner error.
- The run counts as complete: with its source run it covers every e2e spec, perf gate and Lighthouse URL, so it uploads `ci-full` (second line `complement of CI run <id>`). The deploy gate (`scripts/ci-status.ts`) and the rollback (`scripts/rollback.ts`) read that marker unchanged; a red complement run still triggers `rollback.yml`.
- Baselines stay complete: the aggregate job downloads the source run's `perf-report` and merges it with this run's perf shards before the summary and the `perf-report` upload; the Lighthouse job copies the source run's `lighthouse-reports` `lhr-*` files into `.lighthouseci` (this run's files win) and uploads them, even when this run checked no URL. `scripts/perf-base.sh` keeps reading the newest green push run.
- Measure one by hand: dispatch `ci.yml` with `complement_pr: <number>` (`gh workflow run ci.yml --ref main -f complement_pr=123`) to plan the complement of that PR's green same-tree run.

### How the required checks stay green

- The heavy jobs always start. When the plan does not need one, its "Not needed" step passes and every other step skips, so the job reports success and `Lighthouse CI` and the aggregate check report on every run.
- Their matrices come from the plan (`fromJSON(needs.changes.outputs.e2e_shards)` and `perf_shards`), and so do the shard totals in their names (`E2E shard 3/6`, `3D perf gates 2/4`, `3D perf gates 1/1` with only "Not needed"). No shard name is a required check, so the plan sizes the perf shards like the e2e shards.
- No job-level `if:` on them: a skipped matrix job reports an unexpanded name (`3D perf gates ${{ matrix.shard }}/...`) and the aggregate job would read it as skipped.
- `Build, CV and e2e` requires every job before it (the "Require every job" step reads every `needs` result), so a red shard fails the required check.

### Caches

- Bun: `~/.bun/install/cache` keyed on the `bun.lock` hash, no restore keys (an older entry carried every past package version into each new key, 729 MB for a 0.6 s install); a new lockfile starts clean.
- Playwright Chromium: `~/.cache/ms-playwright` per Playwright version.
- Playwright's system packages (the setup action, every Playwright job): `/etc/apt/apt.conf.d/99ci` bounds each apt fetch (15 s timeouts, 3 retries) and keeps the downloaded `.deb` files; `~/.cache/apt-debs` is restored into `/var/cache/apt/archives` before `playwright install-deps` (key: OS, `ImageOS`, `ImageVersion`, Playwright version). A miss saves the files after the install on `main` only. A stalled Ubuntu mirror once held setups for up to 21 minutes (2026-10-22).
- Next `.next/cache` (`site` job): restored everywhere, saved only by runs on `main` (`actions/cache/restore` elsewhere); a pull request restores main's newest entry through the restore key. Per-PR saves (about 120 MB each) had pushed the repository past the 10 GB Actions cache quota, so GitHub evicted the bun and Playwright caches. `deploy.yml` runs only on `main` and keeps the plain `actions/cache`.

### Full runs and the nightly

- `workflow_dispatch` (without `complement_pr`) and the nightly schedule always run everything: 6 e2e shards and 4 perf shards. A push to `main` runs the complement of its merged PR's green same-tree run ([Complement runs on `main`](#complement-runs-on-main)), else everything as well.
- The nightly-only e2e tests (title ending ` @nightly`, [performance.md](performance.md#nightly-only-e2e-tests)) run only on the nightly schedule and on a dispatch with `nightly: true`; pull requests, pushes to `main` and other dispatches skip them (`--grep-invert @nightly` in the `e2e` job). The nightly-only L1 perf poses follow the same rule, and also run on a pull request that changes the Lobby or the office ([Jobs](#jobs)).
- Nightly: cron `15 20 * * *` (03:15 WIB) on `main`, in its own concurrency group so it never replaces a pending `main` push. It adds one job:
  - `Nightly report` (`scripts/ci-nightly.ts`): opens one issue labelled `ci-nightly` when a job failed, updates it while the nightly keeps failing (a comment only when the failed jobs change) and closes it once a later nightly is green. It writes only on `main`; elsewhere it is a dry run.
- Run it by hand: dispatch `ci.yml` with `nightly: true` (`gh workflow run ci.yml --ref main -f nightly=true`): the nightly-only tests and the report.
- The strict visual gate is not in CI because it needs a real GPU (hosted runners time out on SwiftShader, [run](https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/38966094099)); run it locally per [performance.md](performance.md). Nightly visual captures for review stay in `screenshots.yml`; its own `Nightly report` job (`scripts/ci-nightly.ts` with `NIGHTLY_KIND=screenshots`) opens, updates and closes one `screenshots-nightly` issue the same way, so a red night is seen (owner decision [2026-11-01](../decisions/2026-11-01-ci-audit.md)).

## Production deploy

`.github/workflows/deploy.yml` runs on a push to `main` and on `workflow_dispatch`:

- Triggers: a merge to `main` (push), by hand, or from `refresh-facts.yml` after it merges the weekly live-facts PR (`AUTO_DEPLOY_FACTS=false` stops that; its `GITHUB_TOKEN` merge starts no push run).
- All deploys share the `deploy-production` concurrency group (one at a time, a running one is never cancelled; a newer pending run replaces an older pending one).
- Fast path (push only, `scripts/merge-gate.ts`): deploys at once, without waiting for the push CI on `main`, when all hold:
  - no open issue labelled `deploy-rollback`;
  - the commit is the merge commit of a pull request from this repository (`GET /repos/{repo}/commits/{sha}/pulls`);
  - the PR head's tree equals the merged tree (a squash of an up-to-date PR). The ruleset stays non-strict on purpose: "require up to date" would force a PR CI rerun after every merge; a mismatch falls back;
  - every required check of the `main` ruleset (read from `GET /repos/{repo}/rules/branches/main`) has a green newest GitHub Actions attempt on the PR head. Selective PR runs count: the owner accepted that weaker guarantee, backed by the `main` CI (the complement of the PR run, or a full run) and the rollback.
  - Merge to live: about 4 minutes.
- Otherwise (fallback, every dispatch), `Reuse the CI result` (`scripts/ci-status.ts`) reuses CI's green `Build, CV and e2e` for the commit (or for a commit with the same tree, from a push to `main` or a same-repository PR run only):
  - Only a complete run counts: one that carries the `ci-full` artifact (dispatches and the nightly always do; a push to `main` does when it ran everything or the complement of its PR run, since the two runs together cover everything). Selective PR runs and runs without the marker are never reused.
  - It waits up to 40 minutes while CI runs, and keeps waiting past its 3-minute grace while a CI run for the commit is still unfinished.
  - It fails the deploy on a red CI, marker or not.
  - Without a complete CI result, or with the `rerun_e2e` input, the workflow builds without the beacon and runs the 8 e2e shards itself first.
  - The weekly facts merge always lands here: it gets no push CI, and its PR was tested by a `workflow_dispatch` run, never reused by tree (`refresh-facts.yml` already gated the merge on that full run).
- `Build static export` (both paths): refreshes the build facts, builds for production with `vars.CF_BEACON_TOKEN` and the search engine verification variables, and runs the script policy check (`scripts/scan-export.ts`) on the `out/` that ships.
- `Cloudflare Pages production` (both paths, environment `production`), in order:
  1. Skips with a notice while `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` or `vars.CF_PAGES_PROJECT` is missing.
  2. Builds the Ask knowledge pack. On the fast path it re-checks the `deploy-rollback` label; when the issue opened meanwhile, it waits for the complete green `main` CI on its commit (`scripts/ci-status.ts`) and fails without one.
  3. Deploys the hq-office Worker (below).
  4. Publishes the Ask knowledge pack to Workers KV (`scripts/ask-pack.ts publish`, no flip), deploys `out/` plus `functions/` (`wrangler pages deploy out --branch=main`), then flips `pack:current` to the new pack ([ask.md](ask.md), runbook section 17). A failed KV call exits 1 before the upload, so production is unchanged.
  5. Smoke-checks production (`scripts/deploy-smoke.ts`, up to 5 minutes): `GET /api/ask` enabled with this commit's pack date, `GET /api/rum` and `GET /api/visit` = 405, `GET /api/stats` = 204 or a valid snapshot, `/en` with its script policy, the live contributions number and the beacon and no injected Pages analytics, one file per cached prefix, and the LinkedInBot cards of `/`, `/en` and `/id`. A smoke failure after the flip flips the pack pointer back.
- hq-office Worker, inside the Pages job: after the gates (fast path still open, complete green main CI) and before the pack publish and the Pages upload, because Pages rejects a deploy whose service binding `OFFICE` names a missing Worker.
  - It sets `OFFICE_INGEST_KEY` and `GITHUB_WEBHOOK_SECRET` (from the secret `OFFICE_GITHUB_WEBHOOK_SECRET`: GitHub rejects names starting with `GITHUB_`) from the `production` environment, in step env; a missing secret leaves its route at 503.
  - A commit without `workers/office/` skips it with a notice, and so does the variable `OFFICE_WORKER_DEPLOY = "false"` (unset).
  - The Worker step has `continue-on-error`, so a failure does not stop the upload while the Worker exists; the step "hq-office Worker deploy failed" after the smoke check then fails the job (and opens the `deploy-failed` issue).
  - `office-worker.yml` bundles it with a dry run on pull requests that touch `workers/office/`, `src/lib/office/` or `functions/_lib/security.ts` (not a required check). Runbook: `workers/office/README.md`; rules: [office.md](office.md).
- hq-stats Worker (job "hq-stats Worker", environment `production` without a deployment record), after a successful Pages job ([stats.md](stats.md)): token probes (`scripts/stats-token-check.ts analytics` and `deploy`), then `cloudflare/wrangler-action` with `WA_TOKEN` and `WA_ACCOUNT_ID`. The variable `STATS_WORKER_DEPLOY = "false"` skips it; it is unset, so every deploy runs it. `stats-worker.yml` bundles it with `--dry-run` on pull requests that touch it.
- Any failed job opens or comments on the one `deploy-failed` issue (job "Report a failed deploy"); production keeps serving the previous deployment.
- Rollback (`.github/workflows/rollback.yml`, `scripts/rollback.ts`), on every completed CI run from a push to `main`:
  - Red (failure or timed out):
    - first opens or updates the one `deploy-rollback` issue (failing run link; the last failing commit in a hidden marker), which closes the fast path, so no new fast-path upload can race the rollback;
    - waits up to 10 minutes while a deploy job is uploading, then reads what is live (the Pages project's `canonical_deployment`);
    - rolls back only when production serves the failing commit, or a later commit built on it whose own CI is not green;
    - target: the newest earlier successful production deployment whose commit is a strict ancestor of the failing commit and is proven good: a green complete CI, or no CI run at all (the weekly facts merge, which the deploy shipped after its own e2e shards). A cancelled or unfinished CI (a `main` push whose pending run a newer push replaced) proves nothing, so that deployment is skipped. No stored state: the Cloudflare and GitHub APIs are the record;
    - calls `POST /accounts/{id}/pages/projects/{project}/deployments/{target}/rollback`, then waits until the target is live and `/en` answers 200;
    - redeploys the hq-stats Worker from the target commit when `workers/stats/` differs and `STATS_WORKER_DEPLOY` is not `false`;
    - redeploys the hq-office Worker from the target commit (after `bun install` and `bun scripts/build-knowledge.ts` there) when `workers/office`, `src/lib/office` or `functions/_lib/security.ts` differ and `OFFICE_WORKER_DEPLOY` is not `false`; a target without `workers/office` leaves the live Worker;
    - flips the Ask knowledge pack pointer to the target commit's pack (`ask-pack.ts rollback`, production project only; a commit before the KV pack leaves it);
    - comments the outcome on the issue (from and to deployment ids, or why nothing was rolled back).
  - Green: closes the issue once the green commit equals or follows the last failing commit, then dispatches `deploy.yml` for the tip of `main` (a rollback may have left production behind `main`).
  - The nightly and dispatched CI runs never trigger it.
  - Drill: `gh workflow run rollback.yml --ref main -f sha=<commit>` (a dry run by default: decides and reports, no rollback call, no Worker deploy, no issue); `-f dry_run=false -f project=<throwaway project>` for a real rollback on a drill project.
  - Manual rollback: [deploy.md section 6](../deploy.md#6-rollback).
- Ask pack check (`.github/workflows/ask-pack.yml`, dispatch from `main` only, `production` environment): `-f mode=verify` (the deploy token can read, list, write and delete `pack:` keys, with a probe key), `dry-run` (build and validate the pack and plan the publish, writing only the probe) or `status`. Run it after adding or rotating the token's Workers KV Storage: Edit permission.
- No PR previews ([Jobs](#jobs)).
- Credentials: the deploy token `CLOUDFLARE_API_TOKEN` (the account-owned Cloudflare API token `hq-ci-deploy`) is a secret of the main-only `production` environment, next to `GROQ_API_KEY`, `OFFICE_INGEST_KEY` and `OFFICE_GITHUB_WEBHOOK_SECRET`; `CLOUDFLARE_ACCOUNT_ID`, `CF_EVAL_TOKEN` and `CF_LOGS_TOKEN` are repository secrets. The deploy, rollback, Worker, Ask pack, eval and content-gap jobs declare `environment: production` (with `deployment: false` where nothing deploys) and passes secrets only in step-level `env` (`tests/unit/workflows.test.ts`). Permissions and setup: [deploy.md](../deploy.md) sections 2 and 3.
- Owner setup: `docs/deploy.md` ([deploy.md](../deploy.md)).

## Build-time env

| Variable | Meaning | Source |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | canonical origin: `https://shinyq.my.id` in production, default `https://kurniadi.pages.dev` | `vars.SITE_URL` (`deploy.yml`; in `ci.yml` the site build and the e2e shards, so `e2e/view-links.spec.ts` expects the built origin) |
| `NEXT_PUBLIC_CF_BEACON_TOKEN` | Cloudflare Web Analytics, omitted when unset; only production builds in `deploy.yml` set it | `vars.CF_BEACON_TOKEN` |

## Audio

- Use `audio` / `useAudio` from `@/lib/audio`; never create another `AudioContext`.
- Sounds are synthesized, so there are no audio files to add.
- Background music is the procedural Deep Space Ambient track (`src/lib/audio/music.ts`); keep it at `MUSIC_LEVEL` (the site's ambient level, quiet enough that the effects stay on top), and stop it through `MusicVoice.stop()` (no leaked nodes or timers).
- Floor ambience is one procedural layer per floor (`src/lib/audio/ambience.ts`, layers in `src/lib/audio/README.md`). One soundtrack at a time (owner report 2026-10-18): while the ambience is on and a floor is set, the floor layer replaces the music (the engine crossfades the music out over `AMBIENCE_CROSSFADE`, 2 s, and stops it); the music comes back when the ambience is switched off or the floor is cleared. Never mix a layer on top of the music. Keep `AMBIENCE_LEVEL` (1, about 2 to 3 LU under the music) and `AMBIENCE_CROSSFADE` (2 s, mirrored by `SOUNDTRACK_CROSSFADE` in the engine), and stop a voice through `AmbienceVoice.stop()` (no leaked nodes or timers).
  - It is a lazy chunk (`loadAmbience`, about 3.4 KB gzip): never import `ambience.ts` statically from the engine or the first-frame 3D path.
  - It feeds the `musicBus`, so the music volume scales it, the master mute, pause and tab rules apply, and it never touches the effects path.
  - `Experience` reports the store floor with `audio.setFloor(floor)` (and, on unmount, pauses first and then reports `null`, so the music is not restarted for one fade); the "Floor ambience" setting (`hq:ambience`, `audio.setAmbience`) is its own toggle: the music toggle only matters while the ambience is off.
  - `tests/unit/audio-ambience-handoff.test.ts` runs the real engine and voice on a fake context that models gain automation and the node graph: exactly one floor layer audible after each change (also after quick hops mid-fade), none after a mute, pause, toggle off or dispose, and never the music under a layer.
  - `window.__hq.audio()` is a read-only probe (`floor`, `ambience`, `muted`, `played`: one-shot request counts, used for the B1 chime) for `e2e/ambience.spec.ts` and `e2e/b1-unlock.spec.ts`; e2e never asserts on real sound output.
- Sound is on by default (owner decision):
  - a missing `hq:sound` means on;
  - a stored `"off"` stays muted;
  - the context starts on the first user gesture.
- The engine starts paused; `Experience` calls `audio.setPaused(false/true)` on mount/unmount, so the Page View and static tier stay silent (no AudioContext at all) without changing the stored choice.
- The engine itself (`engine.ts`, `synth.ts`, `music.ts`, about 3.8 KB gzip) is a lazy chunk behind the `audio` facade (`src/lib/audio/singleton.ts`): it loads on the first call that needs sound in the unpaused 3D view (a pointer, touch or key press, or a one-shot or a moving rover after a user activation). Never import `@/lib/audio/engine` outside tests; the facade answers and persists the settings and hands its state to the engine when it arrives (details in `src/lib/audio/README.md`). Still one `AudioContext`: a gesture or an unmute before the engine arrives makes the facade create and resume it inside that gesture (Safari needs that), and the engine adopts it. No idle warm-up of the chunk (the 3D session caps have about 1.7 KB of headroom).

## Next.js version notes

- This repo uses Next.js 16, which differs from older training data:
  - async `params`;
  - global `PageProps`/`LayoutProps` types from `next typegen`;
  - `proxy` instead of `middleware`;
  - `global-not-found`.
- Read the bundled docs in `node_modules/next/dist/docs/` before using an unfamiliar API.
- `agentRules: false` in `next.config.ts` stops `next dev` from injecting its own block into `AGENTS.md`.
