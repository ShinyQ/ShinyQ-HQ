# CI and deploy

Workflow, scripts, dependencies, the `main` ruleset, CI, production deploy, build-time env, audio and Next.js notes.
Index: [AGENTS.md](../../AGENTS.md).

## Workflow

### Scripts

- Package manager: Bun.

| Script | Notes |
|---|---|
| `dev` | |
| `build` | static export; `build:web` is an alias |
| `typecheck` | `next typegen && tsc` |
| `lint`, `test` | |
| `verify:quick` | see [Fast verification](performance.md#fast-verification) |
| `e2e` | plain `playwright test` |
| `e2e:full`, `e2e:changed`, `e2e:smoke`, `e2e:shard` | |
| `e2e:perf` | perf lane |
| `e2e:perf:shard` | one CI perf shard |
| `e2e:durations` | refresh the shard timings |
| `e2e:timeline` | nightly timeline |
| `e2e:look` | local look check |
| `screenshots`, `screenshots:pages`, `serve`, `validate:content`, `floor:thumbs` | |
| `bench` | Vitest benches in `tests/bench/` (see [Fast verification](performance.md#fast-verification)) |

### Before pushing and committing

- Before pushing: see [Fast verification](performance.md#fast-verification) (`verify:quick` plus `e2e:changed`); PR CI runs only the heavy jobs the change needs, `main` and the nightly run everything ([CI](#ci)).
- Commit in logical steps with conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `ci:`, `chore:`).
- Prefer the `rtk` git wrapper.
- One PR per phase; do not merge without the owner.

### Dependencies

- Minor and patch updates land together.
- Each major lands in its own PR with every gate green.
  - 3D library majors also need the strict visual gate, the perf lane and the memory gates ([performance.md](performance.md)).
- A major that cannot pass is pinned with a `# revisit YYYY-MM-DD: reason` ignore in `.github/dependabot.yml` and a row in `docs/deploy.md` section 17 ([deploy.md](../deploy.md)); `tests/unit/dependabot.test.ts` checks it.
- TypeScript stays on `~6.0` until typescript-eslint supports 7.
- TypeScript 6 does not load every `@types/*` package: `tsconfig.json` lists the global ones in `types` (`["bun"]`, which brings the Node types). Add a package there when its globals are needed.

### `main` ruleset

- `main` is protected by a repository ruleset (`docs/deploy.md` section 14, [deploy.md](../deploy.md)).
- Changes land only through a pull request whose head has the required checks:
  - `Typecheck, lint, unit tests`
  - `Build, CV and e2e`
  - `Lighthouse CI`
  - `3D perf gates 1/2` and `2/2`
- The checks report on selective smart CI runs too ([How the required checks stay green](#how-the-required-checks-stay-green)).
- Force pushes, deletion and direct pushes are rejected.
- Admins can bypass only through a PR, for emergencies.

## CI

`.github/workflows/ci.yml` runs smart CI (owner decisions 2026-10-17 and 2026-10-18, [decisions.md](../decisions.md)): a
pull request runs the fast checks always and only the tests its changed paths affect; pushes to `main`, dispatches and
the nightly run everything on 8 e2e and 4 perf shards.

### Jobs

- Always, on every event:
  - `Plan CI` (`changes` job, `scripts/ci-plan.ts`): plans the heavy jobs (see [What a pull request runs](#what-a-pull-request-runs)).
  - `Typecheck, lint, unit tests` (`check` job).
  - `Secret scan` (gitleaks).
  - `Build static export` (`site` job): the build with its CSP hashes, the public-safety scan of `out/` and `og:check`.
    - It checks out the full history (`fetch-depth: 0`) and first runs `bun scripts/build-facts.ts --write` (right after the setup action), which rewrites `content/generated/build-facts.json` (commits, PRs per round, unit test files, the end-to-end test count, spec and plan documents, CI jobs, the 3D budgets) for the build page.
    - The `site` job of `deploy.yml` (full-history checkout) runs the same step before its builds, so the shipped build page carries fresh numbers.
    - Local builds use the committed snapshot; refresh it with `bun scripts/build-facts.ts --write`. `--no-runners` skips the `playwright test --list` count and cannot be combined with `--write` (it would drop it from the file). No unit test count is measured (`vitest list` counts each `it.each` template once); only unit test files are. A shallow clone keeps the committed file. A failing runner prints a warning and omits only its number.
- Heavy jobs, against that one build:
  - e2e in duration-balanced shards (`E2E shard n/N`): 8 on a full run; a selective run passes only the planned spec files and smoke tests (`E2E_FILES`) on the shard count the plan sizes (`e2e_shards`, 1 to 8).
  - The 3D perf gates (`perf` job, `3D perf gates n/N`: `bun run e2e:perf:shard`, see [Performance gates and measurement](performance.md#performance-gates-and-measurement)): 4 shards on pushes, dispatches and the nightly; always 2 on a pull request (the required names `1/2` and `2/2`), running only the planned perf tests (`PERF_GREP`).
  - A blocking `Lighthouse CI` job (`lighthouserc.json`):
    - LCP 2 s, CLS 0.01, TBT 200 ms and transfer budgets for fonts, HTML, CSS and JS fail the aggregate check.
    - The first URL is a warm-up that is never asserted.
    - A selective run checks only the affected URLs (`LHCI_URLS`, written into `lighthouserc.pr.json` with `jq`), warm-up first.
    - Its job summary has the Page View JS per chunk against main.
    - See `docs/deploy.md` section 8 ([deploy.md](../deploy.md)) for what keeps LCP low.
- The aggregate required check `Build, CV and e2e`:
  - requires every job before it to succeed (`Plan CI`, check, secret scan, build, e2e, perf, Lighthouse);
  - merged HTML report, the tests that passed only on retry, and the 3D perf summary against the last green main run (when the perf gates ran);
  - uploads the `ci-full` artifact when the plan ran every e2e test, every perf test and every Lighthouse URL, even if the run then turns red; the marker the deploy gate needs, which still treats a red run as red.
- A Cloudflare Pages preview (project `vars.CF_PREVIEW_PROJECT`, default `shinyq-hq`) only when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist.
- PR runs replace each other; in-progress runs on `main` are never cancelled (a newer push can replace a queued one; the deploy reuses them).

### What a pull request runs

`Plan CI` lists the PR's changed files from the GitHub API (a rename counts both paths), puts each file in the first
matching class below and writes the plan with its reasons to the job summary: which e2e specs and smoke tests, which
perf tests and which Lighthouse URLs run, and on how many shards. The classes live in `CLASSES` in `scripts/ci-plan.ts`
(the code wins over this table).

| Class | Paths | e2e | 3D perf gates | Lighthouse |
|---|---|---|---|---|
| `ci` | `.github/workflows/`, `.github/actions/`, `package.json`, `bun.lock`, `bunfig.toml`, `next.config.ts`, `playwright.config.ts`, `tsconfig.json`, `lighthouserc.json`, `postcss.config.*`, `e2e/{hq,routes,budgets}.ts`, `e2e/perf/`, `scripts/{ci-plan,e2e-plan,e2e-shard,perf-*,serve-static,flaky-report}` | full run | full run | full run |
| `code3d` | `src/experience/`, `src/hud/`, `src/store/`, `src/assets/`, `public/floors/`, `public/fonts/` | mapped specs plus the PR smoke set | affected perf tests | affected URLs |
| `tests` | `tests/`, `e2e/durations.json`, `vitest.config.mts`, `eslint.config.mjs` | none | no | no |
| `e2e` | other `e2e/` files (specs, helpers) | specs: mapped (a changed spec runs itself); helpers: every shard | no | no |
| `content` | `content/`, `public/media/`, `public/papers/`, `public/cv/` | none | no | affected URLs (`site-content.json` and `content/generated/`: all; posts: the blog URL) |
| `functions` | `functions/`, `workers/`, `wrangler.toml` | mapped specs | no | no |
| `ui` | build scripts: `scripts/{build-knowledge,defer-scripts,root-redirect,check-client-chunks,csp-hashes,csp-policy}.ts` | mapped specs plus the PR smoke set | no | all URLs |
| `tooling` | other `scripts/` | mapped specs | no | no |
| `ui` | other `src/`, `messages/`, other `public/` | mapped specs plus the PR smoke set | affected perf tests, only for `src/` files the 3D roots import | affected URLs |
| `docs` | `docs/`, other `.github/`, `*.md`, `LICENSE`, root dotfiles | none | no | no |
| `other` | anything unmatched | full run | full run | full run |

- Mapped specs: `specsForChanges` in `scripts/e2e-plan.ts` (the `e2e:changed` map) over every changed file outside `docs` and `tests`. A changed e2e helper (a non-spec `e2e/` file) runs the whole e2e suite on 8 shards; a path no rule maps plans a full run.
- PR smoke set (`PR_SMOKE` in `scripts/e2e-plan.ts`), added whenever `code3d` or `ui` files change: `static-routes`, `boot-first` and `deploy`, one elevator ride and the 3D HUD axe check (single tests run as `e2e/<spec>.spec.ts:<line>` filters; a unit test keeps their titles real).
- Shard count of a selective run: the planned tests' worker-seconds from `e2e/durations.json` (an unknown spec counts 150 s, an unknown test 30 s) divided by 2 workers times 240 s, rounded up, 1 to 8.
- 3D perf tests (`scripts/perf-plan.ts`): any `code3d` file, or any `src/` file reachable from the 3D roots (`src/experience`, `src/hud`, `src/store`) through value, re-export, side-effect or dynamic imports (type-only imports do not count), maps to perf keys: a floor folder to its floor gate (both tiers) and the rides to and from it, the HUD to the 3D bytes gate, rover and boost code to the boost and boot peaks, point-and-go to the hover peak, memory-sensitive paths (renderer, `Effects`, the floor chunk loader, the tower mount, `useDispose`, shared geometry and materials) to the whole lane including `memory-full`, anything else in the 3D code to the whole lane except `memory-full`. The keys become one Playwright `--grep`.
- Lighthouse URLs: a `src/` file in the static import closure of the app layouts (dynamic `import()` does not count) moves every URL; one only in a page's closure moves that page's URLs (`LIGHTHOUSE_PAGES` in `scripts/ci-plan.ts`); `messages/`, `public/fonts/`, `public/brand/`, the `ui` build scripts and `content/site-content.json` move every URL.
- Full run (every e2e test, every perf test, every Lighthouse URL): `ci` or `other` files, a path the e2e rules cannot map, the `full-ci` label (add it, then re-run the workflow: the planner reads the labels from the API), a PR at the 3000-file cap of the GitHub API, a file list that cannot be read, or any planner error (the planner fails safe). A full PR run uses 8 e2e shards and the 2 required perf shards.
- Docs-only and tests-only PRs run no heavy job; content-only PRs run only Lighthouse on the affected URLs. Known trade-off: content data (for example `content/site-content.json`) feeds the 3D floors, and a selective PR skips tests the map does not tie to its paths, so such a break is caught by the full run on `main` after the merge (and the deploy refuses a red `main`) or by the nightly.
- The local workflow does not change: `verify:quick` plus `e2e:changed` before pushing, plus the perf lane for 3D work ([Fast verification](performance.md#fast-verification)).

### How the required checks stay green

- The heavy jobs always start. When the plan does not need one, its "Not needed" step passes and every other step skips, so the job reports success and the unchanged `main` ruleset is satisfied.
- Their matrices come from the plan (`fromJSON(needs.changes.outputs.e2e_shards)` and `perf_shards`), and so do the shard totals in their names. Pull requests always plan 2 perf shards, so `3D perf gates 1/2` and `2/2` always report; pushes, dispatches and the nightly (no required checks) use 4.
- No job-level `if:` on them: a skipped matrix job reports an unexpanded name (`3D perf gates ${{ matrix.shard }}/...`), so the required checks would never report.
- `Build, CV and e2e` still requires every job before it.

### Full runs and the nightly

- Pushes to `main`, `workflow_dispatch` and the nightly schedule always run everything: 8 e2e shards and 4 perf shards.
- Nightly: cron `15 20 * * *` (03:15 WIB) on `main`, in its own concurrency group so it never replaces a pending `main` push. It adds one job:
  - `Nightly report` (`scripts/ci-nightly.ts`): opens one issue labelled `ci-nightly` when a job failed, updates it while the nightly keeps failing (a comment only when the failed jobs change) and closes it once a later nightly is green. It writes only on `main`; elsewhere it is a dry run.
- Run it by hand: dispatch `ci.yml` with `nightly: true` (`gh workflow run ci.yml --ref main -f nightly=true`).
- The strict visual gate is not in CI because it needs a real GPU (hosted runners time out on SwiftShader, [run](https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/38966094099)); run it locally per [performance.md](performance.md). Nightly visual captures for review stay in `screenshots.yml`.

## Production deploy

`.github/workflows/deploy.yml` runs only on `workflow_dispatch`:

- Triggers: by hand, or from `refresh-facts.yml` after it merges the weekly live-facts PR (`AUTO_DEPLOY_FACTS=false` stops that).
- A push to `main` never deploys.
- Steps:
  1. Reuses CI's green `Build, CV and e2e` for the commit (or for a commit with the same tree, from a push to `main` or a same-repository PR run only).
     - Only a complete run counts: one that carries the `ci-full` artifact (pushes to `main`, dispatches and the nightly always do). Selective PR runs and runs without the marker are never reused.
     - `scripts/ci-status.ts` waits up to 40 minutes while CI runs.
     - It keeps waiting past its 3-minute grace while a CI run for the commit is still unfinished.
     - It fails the deploy on a red CI, marker or not.
     - Without a complete CI result, or with the `rerun_e2e` input, it runs the 8 e2e shards itself first.
     - The weekly facts merge always lands here: it gets no push CI, and its PR was tested by a `workflow_dispatch` run, never reused by tree (`refresh-facts.yml` already gated the merge on that full run).
  2. Builds, deploys `out/` plus `functions/`.
  3. Smoke-checks production (`scripts/deploy-smoke.ts`, including `GET /api/rum` and `GET /api/visit` = 405 and `GET /api/stats` = 204 or a valid snapshot).
  4. Deploys the hq-stats Worker ([stats.md](stats.md)): job "hq-stats Worker", token probes, then `cloudflare/wrangler-action`; `STATS_WORKER_DEPLOY=false` skips it.
  5. Opens a `deploy-failed` issue on failure.
- PR previews are off unless `CF_PREVIEWS=true`.
- Owner setup: `docs/deploy.md` ([deploy.md](../deploy.md)).

## Build-time env

| Variable | Meaning | Source |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | canonical origin, default `https://kurniadi.pages.dev` | `vars.SITE_URL` |
| `NEXT_PUBLIC_CF_BEACON_TOKEN` | Cloudflare Web Analytics, omitted when unset; only production builds in `deploy.yml` set it | `vars.CF_BEACON_TOKEN` |

## Audio

- Use `audio` / `useAudio` from `@/lib/audio`; never create another `AudioContext`.
- Sounds are synthesized, so there are no audio files to add.
- Background music is the procedural Deep Space Ambient track (`src/lib/audio/music.ts`); keep it at `MUSIC_LEVEL` (the site's ambient level, quiet enough that the effects stay on top), and stop it through `MusicVoice.stop()` (no leaked nodes or timers).
- Floor ambience is one quiet procedural layer per floor (`src/lib/audio/ambience.ts`, layers in `src/lib/audio/README.md`) mixed under the music; keep `AMBIENCE_LEVEL` (0.4) and `AMBIENCE_CROSSFADE` (2 s) as the owner approved them, and stop a voice through `AmbienceVoice.stop()` (no leaked nodes or timers).
  - It is a lazy chunk (`loadAmbience`, about 3.4 KB gzip): never import `ambience.ts` statically from the engine or the first-frame 3D path.
  - It feeds the `musicBus`, so the music volume scales it, the master mute, pause and tab rules apply, and it never touches the effects path.
  - `Experience` reports the store floor with `audio.setFloor(floor)` (and `null` on unmount); the "Floor ambience" setting (`hq:ambience`, `audio.setAmbience`) is independent of the music toggle.
  - `window.__hq.audio()` is a read-only probe (`floor`, `ambience`, `muted`) for `e2e/ambience.spec.ts`; e2e never asserts on real sound output.
- Sound is on by default (owner decision):
  - a missing `hq:sound` means on;
  - a stored `"off"` stays muted;
  - the context starts on the first user gesture.
- The engine starts paused; `Experience` calls `audio.setPaused(false/true)` on mount/unmount, so the Page View and static tier stay silent (no AudioContext at all) without changing the stored choice.

## Next.js version notes

- This repo uses Next.js 16, which differs from older training data:
  - async `params`;
  - global `PageProps`/`LayoutProps` types from `next typegen`;
  - `proxy` instead of `middleware`;
  - `global-not-found`.
- Read the bundled docs in `node_modules/next/dist/docs/` before using an unfamiliar API.
- `agentRules: false` in `next.config.ts` stops `next dev` from injecting its own block into `AGENTS.md`.
