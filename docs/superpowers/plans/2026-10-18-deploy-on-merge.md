# Deploy On Merge With Auto-Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: implemented in the PR "ci: deploy on merge with auto-rollback" (third PR of the faster-CI work, after the
test-suite trim and the affected-tests PR CI).

**Goal:** A merge to `main` goes live in minutes, without waiting for the push CI on `main`, when the merged pull
request's required checks were green on the exact tree that landed; a red `main` CI rolls production back
automatically and blocks the fast path until `main` is green again.

**Architecture:** `deploy.yml` gains a `push` trigger on `main`. Its `verify` job first asks a new gate,
`scripts/merge-gate.ts`, whether the pushed commit qualifies for the fast path (merged same-repository PR, PR head
tree equals the merged tree, every required check green on the PR head, no open `deploy-rollback` issue). If yes,
it skips the wait; if not, it falls back to today's `scripts/ci-status.ts` wait for the complete `main` CI. A new
`rollback.yml` (`workflow_run` on CI for `main` pushes, plus a `workflow_dispatch` drill with `dry_run`) runs
`scripts/rollback.ts`: on a red run it rolls Cloudflare Pages production back through the Pages rollback API to the
newest earlier production deployment that does not contain the failing commit and is not known red, redeploys the
hq-stats Worker from that commit when `workers/stats/` differs (and Worker deploys are on), and opens or updates
the `deploy-rollback` issue; on a green run it closes the issue once `main` has moved past the failure.

**Tech Stack:** GitHub Actions, Bun scripts with `fetch` only (GitHub REST, Cloudflare REST), Vitest,
`cloudflare/wrangler-action` (same pinned wrangler as `deploy.yml`).

## Global Constraints

- No em dashes (U+2014) anywhere, including commits and PR text.
- Every action pinned by full commit SHA with a version comment; wrangler only from the lockfile (`bunx wrangler`)
  or the pinned `wranglerVersion` of `cloudflare/wrangler-action`, never `wrangler@range`.
- Every `actions/checkout` sets `persist-credentials: false` (only `refresh-facts.yml` may not).
- Cloudflare secrets only in the `production` environment, passed in step-level `env`.
- One CI run in flight; never cancel others' runs; the manual `gh workflow run deploy.yml` path keeps working.
- Required checks stay `Typecheck, lint, unit tests`, `Build, CV and e2e`, `Lighthouse CI`, `3D perf gates 1/2`,
  `3D perf gates 2/2`. The ruleset stays non-strict (branches need not be up to date); tree equality is verified
  instead (decision below).

## Decisions

- **Tree equality instead of a strict ruleset.** "Require branches to be up to date" would force a PR CI rerun
  after every merge (against the one-CI-in-flight rule) and block the bot facts merge when `main` moved. The gate
  compares `commits/{merge_sha}.commit.tree.sha` with the PR head's tree: a squash of an up-to-date PR (or one
  whose rebase yields the same tree) matches; anything else falls back to waiting for `main` CI.
- **Merged PR lookup:** `GET /repos/{repo}/commits/{sha}/pulls`, keep the PR with `merged_at`, `base.ref == main`,
  `merge_commit_sha == sha` and `head.repo.full_name == repo` (forks fall back).
- **Required checks:** read from `GET /repos/{repo}/rules/branches/main` (the `required_status_checks` rule), with
  the five names above as the fallback. On the PR head, the newest check run per name from the `github-actions`
  app must be `completed/success`. Selective PR runs count (owner-accepted trade, mitigated by the rollback).
- **Block:** an open issue labelled `deploy-rollback` sends every push to the fallback (wait for `main` CI). The
  deploy job re-checks the label right before uploading on the fast path.
- **Rollback target from the Cloudflare API, not stored state:** project `canonical_deployment` is what is live.
  Roll back only when the live commit is the failing commit or descends from it and is not itself green. Target:
  newest successful earlier production deployment whose commit is a strict ancestor of the failing commit and
  whose own `Build, CV and e2e` is not red. Ancestry by `GET /repos/{repo}/compare/{base}...{head}`.
- **Race with an in-flight deploy:** the rollback waits up to 10 minutes for running `deploy.yml` runs before it
  reads the live deployment.
- **Worker:** "rollback" means redeploying `workers/stats` from the target commit with the same pinned wrangler
  (deterministic, secrets persist across deploys), only when `git diff` shows `workers/stats/` changed between
  target and live, and `STATS_WORKER_DEPLOY != false`.
- **Close:** a green push CI on `main` closes the open issue when its commit equals or descends from the last
  failing commit recorded in the issue body (`<!-- failing-sha: ... -->`).

## File Structure

- Create `scripts/merge-gate.ts`: fast-path verdict (pure helpers plus a `fetch` CLI).
- Create `scripts/rollback.ts`: `pages` (roll back), `issue` (open or update), `clear` (close) subcommands.
- Modify `scripts/ci-status.ts`: export `gh` and `checkRuns` for reuse.
- Modify `.github/workflows/deploy.yml`: `push` trigger, fast-path step, label re-check, summary.
- Create `.github/workflows/rollback.yml`.
- Tests: `tests/unit/merge-gate.test.ts`, `tests/unit/rollback.test.ts`, `tests/unit/workflows.test.ts`.
- Docs: `docs/agents/ci-and-deploy.md`, `docs/deploy.md` (intro, Actions deploy, section 6 Rollback),
  `AGENTS.md` workflow bullet, `README.md` Deploy line, `content/build-story.json` Deploy step, `docs/decisions.md`.

### Task 1: Fast-path gate (`scripts/merge-gate.ts`)

**Interfaces (produces):**
- `REQUIRED_CHECKS: readonly string[]`, `ROLLBACK_LABEL = "deploy-rollback"`.
- `mergedPrFor(sha, prs, repo): MergedPr | undefined`.
- `checksVerdict(required, runs): { ok: true } | { ok: false; missing: string[]; failed: string[] }`.
- `decideFastPath(input): { fast: true; pr: number; note: string } | { fast: false; note: string }` with input
  `{ blockedBy?: number; pr?: MergedPr; mergedTree: string; prTree?: string; checks?: ReturnType<typeof checksVerdict> }`.
- CLI: `bun scripts/merge-gate.ts --repo o/r --sha <sha> [--check-block-only]` writes `fast=true|false` and `pr=` to `$GITHUB_OUTPUT`.

- [ ] Tests first: merged PR selection (unmerged, other base, other merge sha, fork), checks (latest attempt wins, other app ignored, missing, failed), verdict reasons (blocked, no PR, tree mismatch, red checks, fast).
- [ ] Run `bunx vitest run tests/unit/merge-gate.test.ts` (fails), implement, rerun (passes), commit `feat(ci): fast-path deploy gate for merged pull requests`.

### Task 2: Rollback (`scripts/rollback.ts`)

**Interfaces (produces):**
- `needsRollback({ relation, liveGreen }): boolean` where `relation` is the compare status of failing...live.
- `pickTarget(deployments, live, { isStrictAncestor(c), isRed(c) }): Promise<PagesDeployment | undefined>`.
- `issueBody(...)`, `failingShaFrom(body)`.
- CLI: `bun scripts/rollback.ts pages --repo --sha --project [--dry-run true] [--site URL]`; `issue --sha --run-url --result-file`; `clear --sha --run-url`.

- [ ] Tests first: decision table, target selection (skips live, newer, failed stages, previews, no hash, descendants, red), issue marker round trip.
- [ ] Implement, run the tests, commit `feat(ci): roll production back on a red main CI`.

### Task 3: Workflows

- [ ] `deploy.yml`: `on.push.branches: [main]`; resolve uses `github.sha` on push; verify runs `merge-gate.ts` on push and `ci-status.ts` only when not fast; deploy job re-checks the block label on the fast path.
- [ ] `rollback.yml`: `workflow_run` (CI, completed, main) filtered to `push` events of this repository; jobs `rollback` (red: production environment, waits for deploys, `rollback.ts pages`, Worker redeploy, issue) and `clear` (green); `workflow_dispatch` drill with `sha`, `dry_run` (default true) and `project`.
- [ ] `tests/unit/workflows.test.ts`: triggers, environment, step-level secrets, pinned wrangler version in both files.
- [ ] Commit `ci: deploy on push to main and auto-rollback workflow`.

### Task 4: Docs and evidence

- [ ] Update the docs listed above, add the dated decision row, run `bun run verify:quick`.
- [ ] Evidence: local real rollback on a throwaway Pages project (`hq-rollback-drill`) and a dry run against
  `kurniadi`; after merge, a `rollback.yml` dispatch with `dry_run=true`, and the merge-to-live time of this PR's
  own merge against the before numbers (#190 65 min, #193 50 min, #195 29 min, #191 28 min, each with a manual
  dispatch after the push CI).
