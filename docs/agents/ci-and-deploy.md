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

`.github/workflows/ci.yml` runs smart CI (owner decision 2026-10-17, [decisions.md](../decisions.md)): a pull request
runs the fast checks always and the heavy jobs only when its changed paths need them.

### Jobs

- Always, on every event:
  - `Plan CI` (`changes` job, `scripts/ci-plan.ts`): plans the heavy jobs (see [What a pull request runs](#what-a-pull-request-runs)).
  - `Typecheck, lint, unit tests` (`check` job).
  - `Secret scan` (gitleaks).
  - `Build static export` (`site` job): the build with its CSP hashes, the public-safety scan of `out/` and `og:check`.
- Heavy jobs, against that one build:
  - e2e in 4 duration-balanced shards (`E2E shard n/4`); a selective run passes only the planned spec files (`E2E_FILES`), split across the same 4 shards.
  - The 3D perf gates in 2 shards (`perf` job, `3D perf gates n/2`: `bun run e2e:perf`, see [Performance gates and measurement](performance.md#performance-gates-and-measurement)).
  - A blocking `Lighthouse CI` job (`lighthouserc.json`):
    - LCP 2 s, CLS 0.01, TBT 200 ms and transfer budgets for fonts, HTML, CSS and JS fail the aggregate check.
    - The first URL is a warm-up that is never asserted.
    - Its job summary has the Page View JS per chunk against main.
    - See `docs/deploy.md` section 8 ([deploy.md](../deploy.md)) for what keeps LCP low.
- The aggregate required check `Build, CV and e2e`:
  - requires every job before it to succeed (`Plan CI`, check, secret scan, build, e2e, perf, Lighthouse);
  - merged HTML report, the tests that passed only on retry, and the 3D perf summary against the last green main run (when the perf gates ran);
  - uploads the `ci-full` artifact when the plan ran every heavy job (every e2e shard, the perf gates and Lighthouse), even if the run then turns red; the marker the deploy gate needs, which still treats a red run as red.
- A Cloudflare Pages preview (project `vars.CF_PREVIEW_PROJECT`, default `shinyq-hq`) only when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist.
- PR runs replace each other; in-progress runs on `main` are never cancelled (a newer push can replace a queued one; the deploy reuses them).

### What a pull request runs

`Plan CI` lists the PR's changed files from the GitHub API (a rename counts both paths), puts each file in the first
matching class below and writes the plan with its reasons to the job summary. A heavy job runs when any class asks for
it. The classes live in `CLASSES` in `scripts/ci-plan.ts` (the code wins over this table).

| Class | Paths | e2e | 3D perf gates | Lighthouse |
|---|---|---|---|---|
| `ci` | `.github/workflows/`, `.github/actions/`, `package.json`, `bun.lock`, `bunfig.toml`, `next.config.ts`, `playwright.config.ts`, `tsconfig.json`, `lighthouserc.json`, `postcss.config.*`, `e2e/{hq,routes,budgets}.ts`, `e2e/perf/`, `scripts/{ci-plan,e2e-plan,e2e-shard,perf-*,serve-static,flaky-report}` | full run | full run | full run |
| `code3d` | `src/experience/`, `src/hud/`, `src/store/`, `src/assets/`, `public/floors/`, `public/fonts/` | every shard | yes | yes |
| `tests` | `tests/`, `e2e/durations.json`, `vitest.config.mts`, `eslint.config.mjs` | none | no | no |
| `e2e` | other `e2e/` files (specs, helpers) | specs: mapped (a changed spec runs itself); helpers: every shard | no | no |
| `content` | `content/`, `public/media/`, `public/papers/`, `public/cv/` | none | no | no |
| `functions` | `functions/`, `workers/`, `wrangler.toml` | mapped specs | no | no |
| `ui` | build scripts: `scripts/{build-knowledge,defer-scripts,root-redirect,check-client-chunks,csp-hashes,csp-policy}.ts` | mapped specs | no | yes |
| `tooling` | other `scripts/` | mapped specs | no | no |
| `ui` | other `src/`, `messages/`, other `public/` | mapped specs | only for `src/` files the 3D roots import | yes |
| `docs` | `docs/`, other `.github/`, `*.md`, `LICENSE`, root dotfiles | none | no | no |
| `other` | anything unmatched | full run | full run | full run |

- Mapped specs: `specsForChanges` in `scripts/e2e-plan.ts` (the `e2e:changed` map) over the `ui`, `functions`, `e2e` and `tooling` files; when the map asks for the full suite, every shard runs.
- 3D perf gates: any `code3d` file, or any `src/` file reachable from the 3D roots (`src/experience`, `src/hud`, `src/store`) through value, re-export, side-effect or dynamic imports (type-only imports do not count).
- Full run (every heavy job): `ci` or `other` files, a PR at the 3000-file cap of the GitHub API, a file list that cannot be read, or any planner error (the planner fails safe).
- Content-only, docs-only and tests-only PRs run no heavy job. Known trade-off: content data (for example `content/site-content.json`) feeds the 3D floors, so a content change that breaks a 3D budget is caught by the full run on `main` after the merge (and the deploy refuses a red `main`) or by the nightly.
- The local workflow does not change: `verify:quick` plus `e2e:changed` before pushing, plus the perf lane for 3D work ([Fast verification](performance.md#fast-verification)).

### How the required checks stay green

- The heavy jobs keep their names and matrix and always start. When the plan does not need one, its "Not needed" step passes and every other step skips, so the job reports success and the unchanged `main` ruleset is satisfied.
- No job-level `if:` on them: a skipped matrix job reports an unexpanded name (`E2E shard ${{ matrix.shard }}/4`), so the required checks would never report.
- `Build, CV and e2e` still requires every job before it.

### Full runs and the nightly

- Pushes to `main`, `workflow_dispatch` and the nightly schedule always run everything.
- Nightly: cron `15 20 * * *` (03:15 WIB) on `main`, in its own concurrency group so it never replaces a pending `main` push. It adds two jobs:
  - `Visual gate (nightly)`: `scripts/visual-gate.ts --profile strict` of this commit against the previous scheduled run's commit (skipped when there is none, it is the same commit, or that commit is not in this repository's history); diffs in the `visual-gate-diffs` artifact on failure.
  - `Nightly report` (`scripts/ci-nightly.ts`): opens one issue labelled `ci-nightly` when a job failed, updates it while the nightly keeps failing (a comment only when the failed jobs change) and closes it once a later nightly is green. It writes only on `main`; elsewhere it is a dry run.
- Run it by hand: dispatch `ci.yml` with `nightly: true` (`gh workflow run ci.yml --ref main -f nightly=true`).

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
     - Without a complete CI result, or with the `rerun_e2e` input, it runs the 4 e2e shards itself first.
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
