# Agent Office

The L1 Agent Office: AI coding agents shown live as Rovers at desks, plus public GitHub activity. Spec:
[`2026-10-18-agent-office-design.md`](../superpowers/specs/2026-10-18-agent-office-design.md); decision
[`2026-10-18-agent-office.md`](../decisions/2026-10-18-agent-office.md).

Index: [AGENTS.md](../../AGENTS.md).

## Backend

### Contract

- `src/lib/office/protocol.ts` (v1): `OfficeBeatV1` (relay to Worker) and `OfficeResponseV1` (GET /api/office).
- Clients validate with `parseOfficeResponse` and hide on null; the Worker validates beats with `parseOfficeBeat`.
- Fixtures: `OFFICE_FIXTURES` in `src/lib/office/fixtures.ts` (busy, rough, quiet, semiLive, off, disabled).
- Change the contract only with a new version and every side in one PR.

### Privacy (owner decision D3)

- A beat carries only `{v, agent, session, state, activity, repo?, branch?, title?, ts}`; `session` is a salted hash.
- `repo`, `branch` and `title` survive only for repositories in `OFFICE_REPO_ALLOWLIST` that a webhook reported public.
- Titles (beats and GitHub items) go through the public safety blocklist (`cleanTitle`, `findBlockedTerms` from
  `src/content/safety-match.ts`); a blocked title is dropped or replaced by a generic one.
- Branch names go through the same blocklist (also with `/`, `_`, `.` and `-` read as word breaks): a blocked branch
  is dropped from a beat (with its title), and a workflow run or pull request on a blocked branch (or a push to a blocked default branch) is ignored.
- Only same-repository GitHub activity shows: pull requests from forks and workflow runs whose `head_repository` is
  another repository are ignored, and a pull request also needs a sender in `OFFICE_GITHUB_ACTORS` (Worker var,
  default `ShinyQ,Copilot`) or an OWNER, MEMBER or COLLABORATOR author association.
- A `repository` webhook with action `privatized` removes the repository from the known-public set and strips its
  runs, pull requests, feed items and the repository data of its sessions.
- Never add a field that carries prompt text, commands, paths, output or client names.

### Worker and Durable Object

- `workers/office/` (`hq-office`): `worker.ts` verifies signatures (`crypto.ts`) and routes; `ingest.ts` sanitizes
  beats and parses webhooks; `state.ts` is the pure reducer; `office.ts` is the Durable Object.
- `[vars]` in `workers/office/wrangler.toml`: `OFFICE_REPO_ALLOWLIST` (`ShinyQ/*`) and `OFFICE_GITHUB_ACTORS`
  (`ShinyQ,Copilot`).
- One JSON document in the Durable Object's storage API (SQLite backend): one row written per accepted beat or webhook.
- Time rules run at read time (`effective`): thinking after 20 s quiet while working or reviewing, asleep after 3 min
  (15 min while testing, on CI or waiting for input), done for 20 s, failed until the next beat, removed after 30 min.
  No alarms.
- Desks: five stable slots (`assignSlots`); an awake newcomer may take the longest-asleep desk; others are `extra`.
- GitHub: `workflow_run`, `workflow_job` (job progress), `pull_request`, `push` (default branch), `deployment_status`,
  `repository` (`privatized` only); CI progress and PR titles join a desk by repository and branch.
- Workflow runs carry `run_attempt` (deliveries arrive in any order): an older attempt and a late `running` of a
  completed attempt are ignored; only a newer attempt restarts the run (jobs cleared).

### Pages Functions

- `functions/_lib/office.ts`: `GET /api/office` (always 200 JSON: the snapshot, `mode: "off"` on failure, or
  `{v:1, enabled:false}`) with an ETag (304 on a matching `If-None-Match`) and
  `Cache-Control: public, max-age=5, stale-while-revalidate=30` (the disabled answer `public, max-age=60`), stored in
  `caches.default` for 5 s per data center; `POST /api/office/beat` and `/github` forward the raw body and signature
  headers through the service binding `OFFICE`.
- Kill switch `OFFICE_ENABLED` (root `wrangler.toml`).

### Deploy and CI

- `deploy.yml` job `office-worker` deploys the Worker after a successful Pages upload (the same gates as the upload)
  and sets its secrets from the `production` environment; a commit without `workers/office/` skips it. Until the
  Worker first exists, `/api/office` answers mode "off". `office-worker.yml` bundles it on pull requests (no secrets).
- `rollback.yml` redeploys it from the rollback target when `workers/office`, `src/lib/office`,
  `src/content/safety-match.ts` or `functions/_lib/security.ts` differ (secrets persist; a target without
  `workers/office` leaves it at the live version).
- Runbook: `workers/office/README.md`; deploy notes: [`docs/deploy.md`](../deploy.md) section 18.

### Tests

- `tests/office/`: protocol, state, ingest, Worker and Durable Object, Functions; `tests/unit/office-deploy.test.ts`.
