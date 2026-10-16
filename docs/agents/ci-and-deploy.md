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

- Before pushing: see [Fast verification](performance.md#fast-verification) (`verify:quick` plus `e2e:changed`); CI runs the full sharded suite.
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
- Force pushes, deletion and direct pushes are rejected.
- Admins can bypass only through a PR, for emergencies.

## CI

`.github/workflows/ci.yml`:

- Runs check and the build in parallel.
- e2e in 4 shards against that one build.
- The 3D perf gates in 2 shards (`perf` job: `bun run e2e:perf`, see [Performance gates and measurement](performance.md#performance-gates-and-measurement)).
- The aggregate required check `Build, CV and e2e`: merged HTML report, the tests that passed only on retry, and the 3D perf summary against the last green main run.
- A blocking `Lighthouse CI` job (`lighthouserc.json`):
  - LCP 2 s, CLS 0.01, TBT 200 ms and transfer budgets for fonts, HTML, CSS and JS fail the aggregate check.
  - The first URL is a warm-up that is never asserted.
  - Its job summary has the Page View JS per chunk against main.
  - See `docs/deploy.md` section 8 ([deploy.md](../deploy.md)) for what keeps LCP low.
- A Cloudflare Pages preview (project `vars.CF_PREVIEW_PROJECT`, default `shinyq-hq`) only when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exist.
- Runs on `main` are never cancelled (the deploy reuses them).

## Production deploy

`.github/workflows/deploy.yml` runs only on `workflow_dispatch`:

- Triggers: by hand, or from `refresh-facts.yml` after it merges the weekly live-facts PR (`AUTO_DEPLOY_FACTS=false` stops that).
- A push to `main` never deploys.
- Steps:
  1. Reuses CI's green `Build, CV and e2e` for the commit (or for a commit with the same tree).
     - `scripts/ci-status.ts` waits up to 40 minutes while CI runs.
     - It keeps waiting past its 3-minute grace while a CI run for the commit is still unfinished.
     - It fails the deploy on a red CI.
     - Without a CI result, or with the `rerun_e2e` input, it runs the 4 e2e shards itself first.
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
- Background music is the procedural Deep Space Ambient track (`src/lib/audio/music.ts`); keep it at `MUSIC_LEVEL` (the old hum's loudness) so it never masks the effects, and stop it through `MusicVoice.stop()` (no leaked nodes or timers).
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
