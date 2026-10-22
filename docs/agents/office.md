# Agent Office

The L1 Agent Office: AI coding agents shown live as Rovers at desks, plus public GitHub activity. Spec:
[`2026-10-18-agent-office-design.md`](../superpowers/specs/2026-10-18-agent-office-design.md); decision
[`2026-10-18-agent-office.md`](../decisions/2026-10-18-agent-office.md).

The 3D office stands in its own south wing of the L1 slab, reached by a lead road from the Lobby plaza
([decision](../decisions/2026-10-20-agent-office-wing.md)); its layout, lazy chunks, rendering, chips, rooms, polling and
probes are described in [floor-l1-lobby.md](floor-l1-lobby.md#agent-office).

Index: [AGENTS.md](../../AGENTS.md).

## Backend

### Contract

- `src/lib/office/protocol.ts`: `OfficeBeatV1` (relay to Worker), `OfficeResponseV1` (`GET /api/office`),
  `OfficeResponseV2` (`GET /api/office?v=2`: v1 with `v: 2` and an optional desk `helpers`, 1 to 9, omitted at 0) and
  `OfficeResponseV3` (`GET /api/office?v=3`: v2 with `v: 3` and up to `OFFICE_SEATS` (10) desks, slots 0 to 9, `extra`
  counting sessions past ten; `OfficeSnapshot` is v3) and `OfficeResponseV4` (`GET /api/office?v=4`: `OfficeSnapshotV4`,
  v3 with `v: 4` and `pipeline`, the 3D scene only). The disabled answer `{v:1, enabled:false}` is the same in all.
- Snapshot v4's `pipeline` (`OfficePipeline`, caps in `OFFICE_PIPELINE`: `runs` 3, `jobs` 24, `ships` 10, `jobName` 40,
  `key` 160): `runs`, newest first, each `OfficePipelineRun` `{ id, repo, title, url, status (running, success,
  failure), slot?, at, jobs }` with its jobs (`OfficePipelineJob` `{ name, status }`, `OfficeJobStatus` queued, running,
  done or failed) in first-seen order, `slot` the seat (0 to 9) of the live session on the run's repository and head
  branch, `at` when the Worker first saw this attempt; `ships`, newest first, each `OfficeShip` `{ key, kind (merge,
  deploy), status (running, success, failure, merged), at, slot? }`, `key` the feed key (`pr:<repo>#<number>` or
  `deploy:<id>`), only merged pull requests and production deploys.
- `src/lib/office/protocolV4.ts`: the v4 validators (`parseOfficeResponseV4` and the pipeline checks, `GET /api/office?v=4`),
  imported only by the 3D scene's poller (`office/live.ts`) and the Pages Function, never re-exported from
  `protocol.ts`, so the Classic card and the office watch (both on v3) never carry them; the v4 types and
  `OFFICE_PIPELINE` stay in `protocol.ts`. `parseOfficeResponseV4` is strict on a v4 body (every key, the caps, job
  names and ship keys free of control characters and `<` `>`, seats 0 to 9, URLs `https`) and reads a v3, v2 or v1 body
  (a rolled-back Worker or Function) as v4 with an empty pipeline (`{ runs: [], ships: [] }`), so the scene reads one
  type and shows part A's anonymous tower progress from the GitHub feed; the disabled body passes as is.
- `src/lib/office/protocolHistory.ts`: the day replay's contract (`GET /api/office/history`, `OFFICE_HISTORY_PATH`),
  imported only by the Pages Function, the hq-office Worker and the replay chunk, never re-exported from `protocol.ts`,
  so the Classic card, the watch, the scene chunk and the drawer body never carry it (`tests/unit/office-chunk-graph.test.ts`).
  Caps in `OFFICE_HISTORY`: 8 days, 200 sessions, 3,000 events, 200 merges, 500 runs, 50 deploys, 24 jobs, a 1,800 s
  carry-in. `OfficeHistoryIndexV1` is `{ v: 1, days }`, the 8 WIB days newest first, each `{ day, events, prs, runs,
  deploys }` counts (empty days included). `OfficeHistoryV1` is `{ v: 1, day, start (epoch ms of the WIB midnight, `dayStart`),
  agents, tasks, events, prs, runs, deploys, truncated }`; times are seconds since the WIB midnight, ordinals are per day
  (they never link across days), a seat is 0 to 9 or -1 past the ten seats, states and activities index `OFFICE_STATES` and
  `OFFICE_ACTIVITIES`. Tuples: an event `[t, n, seat, state, activity, until, helpers]` (`until` the session's last beat before
  its next event, down to -1800 for a session carried over midnight), a merge `[t, seat, repo, number, title]` (repo and title
  "" when not public: "Client project"), a run `[t, end, seat, ok, jobs]` (start, finish, the desk, the result and its lane
  count), a deploy `[t, ok]`. No branch is stored or served. `parseOfficeHistory` and `parseOfficeHistoryIndex` are strict
  (every key, tuple lengths and bounds, sorted lists, `start` equal to `dayStart(day)`, ordinals under the agent count) and
  return null on any mismatch; the disabled answer `{v:1, enabled:false}` passes.
- Seats ([decision](../decisions/2026-10-21-office-ten-desks.md)): ten, in two rows of five; slots 0 to 4 are the
  front row (`OFFICE_DESKS`, 5), 5 to 9 the back row. v1 and v2 keep five desks (slots 0 to 4) and count sessions on
  seats 5 to 9 in `extra`: never a slot above 4, never more than five desks, byte for byte as before for documents
  with at most five sessions (part A clients, already deployed and polling v2, see no change for at most five
  sessions). With more than five sessions the eviction rule changed: an awake newcomer takes the longest-asleep seat
  only when all ten are taken, so v1 and v2 clients may show a sleeping front desk while an awake session is in
  `extra`.
- v1 never changes, byte for byte (old clients never see a new field; a golden in `tests/office/state.test.ts`):
  `parseOfficeResponse` rejects any body carrying `helpers`. Only exactly `?v=2` gets v2 and only exactly `?v=3` gets
  v3, and only exactly `?v=4` gets v4; no query, `?v=5` or junk get v1.
- Clients validate with `parseOfficeResponse` (v1), `parseOfficeResponseV2` (strict v2, five desks, plus a v1 body read
  as v2 without helpers), `parseOfficeResponseV3` (strict v3, ten desks, plus a v2 or v1 body read as v3, for a
  rolled-back Worker or Function; only on this path a v1 or v2 body may carry up to ten desks with slots 0 to 9) or
  `parseOfficeResponseV4` (above) and hide on null; the Worker validates beats with `parseOfficeBeat`.
- Who polls what: the 3D office's poller asks `?v=4` (`OFFICE_V4_PATH` with `parseOfficeResponseV4`;
  `createOfficePoller({ path, parse, interval })` in `office/live.ts`: the fast cadence near the office or with a drawer
  open, 30 s from afar, nothing out of view); the Classic card and the L1 beacon's watch ask `?v=3` (`OFFICE_V3_PATH`),
  the watch every 30 s while the scene's poller is not running (so a back-row asker lights the beacon; the same one
  request per 30 s as before). `signalFromBody` reads v1 to v4 bodies with up to ten desks and slots 0 to 9, and the
  newest production deploy success at most 30 s old (v4: `pipeline.ships`; older: the feed item titled
  `Deploy · production`). The 3D scene's `officeView` (with `OfficeView.pipeline`, null when off, offline or disabled)
  and the Classic card both read all ten (slots 0 to 9, `extra` past ten); there `withSeats(snap, OFFICE_SEATS)`
  (`src/lib/office/model.ts`) only guards against a slot past the seat count; the signal keeps every asker.
- Fixtures: `OFFICE_FIXTURES` (v1), `OFFICE_FIXTURES_V2` (busy with helpers 3 and 6), `OFFICE_FIXTURES_V3` (busy
  seats ten: drones at slots 0, 2, 5 and 9, askers at 3 and 7, one more in `extra`) and `OFFICE_FIXTURES_V4` (busy adds
  a pipeline of three runs, 3, 12 and 12 jobs named as the real CI names them, one on back-row desk 6, plus a merge and
  a production deploy; rough fails one of them; the others an empty pipeline) in `src/lib/office/fixtures.ts` (busy,
  rough, quiet, semiLive, off, disabled).
- Change the contract only with a new version and every side in one PR.

### Privacy (owner decision D3)

- A beat carries only `{v, agent, session, state, activity, repo?, branch?, title?, helpers?, ts}`; `session` is a
  salted hash and `helpers` a count of active sub-agents (0 to `OFFICE_HELPERS_MAX`, 9), never their names, types or
  ids. `sanitizeBeat` keeps it for every repository; the session stores it, and only snapshot v2 shows it.
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
- Helpers: a beat's `helpers` replaces the stored count, a beat without it keeps it, 0 clears it; a count change adds
  no `recent` entry; a privatized repository keeps it. `viewV2` and `viewV3` show it (`effectiveHelpers`, capped at 9)
  while the session is awake and beat within `TIMING.helpersTtl` (10 min, so a lost stop event decays); `view` (v1)
  never does. The Durable Object's `/snapshot` answers `viewV4` for `?v=4`, `viewV3` for `?v=3`, `viewV2` for `?v=2`,
  else `view`; the Worker forwards only `?v=2`, `?v=3` and `?v=4`.
- Pipeline (`pipelineOf(doc, now)`, served only by `viewV4`, which is `viewV3` plus it): `RunRecord` keeps `order` (the
  job ids in first-seen order, at most `OFFICE_PIPELINE.jobs`, 24), `names` (each laned job's name, already through
  `cleanTitle` and the blocklist at ingest, cut to 40 characters) and `started` (when this attempt was first seen; a
  newer attempt resets it), all optional, so a document stored before v4 reads with its first job ids, "Job" names and
  `updated`. Jobs past the 24th fold into the last lane (its status the worst of them: failed over running over queued
  over done). The served runs are the 3 newest by `started` that are not stale; the ships are the latest merged pull
  requests and production deploys from the feed (at most 10; a deploy item stored before the `production` flag counts
  by its ingest title). A run or merge links to a desk through the session's effective seat (`seatOf`: the front-row
  `slot` or the back-row `seat`) of the newest live session on the same repository and branch, so `slot` ranges 0 to 9.
  `privatized` strips runs and feed items, so the pipeline empties with them.
- Seats: ten stable seats (`assignSlots`, `OFFICE_SEATS`). The front row fills first: a free seat goes to the lowest
  free seat, and a back-row session moves to a front-row seat as soon as one is free (oldest first), so for at most
  five sessions v1 and v2 show what five desks showed. Only when all ten are taken may an awake newcomer take the
  longest-asleep seat; others are `extra`. `view` and `viewV2` list seats 0 to 4 and count the rest in `extra`;
  `viewV3` lists all ten.
- Stored seats (`SessionRecord`): `slot` holds only a front-row seat (0 to 4, or null) and the optional `seat` only a
  back-row seat (5 to 9); the seat is `slot ?? seat` (`seatOf`; a set `slot` wins and clears `seat`). A Worker from
  before ten seats reads only `slot`, so after a rollback it counts back-row sessions in `extra` and seats them as
  before. `migrateDoc` (on load, written once) moves a back-row seat stored in `slot` to `seat`.
- Replay log (`workers/office/src/history.ts`, `HISTORY`: the contract's caps plus `maxBytes` 120 KB and a 4 KB `headroom`):
  one row per WIB day, `log:YYYY-MM-DD` (`logKey`), at most 8, beside the `doc` row. The Durable Object diffs the doc before
  and after every accepted beat or webhook (`logDoc`, over every session, so a seat that moves because another session left is
  logged too) and writes the doc and the changed rows in one `storage.put`; a keepalive that changes nothing loggable writes the doc
  row alone.
  - Logged: a session's change of state, activity, seat or helper count, a session back from a quiet gap (removed, asleep or helpers
    decayed: `quietGap`; thinking after 20 s is left out, the replay derives it after an event's `until`), a merge (a new
    `merged` feed item, with its desk through `seatFor`), a run that left running or a new finished attempt (`[start, end,
    seat, ok, lanes]`, lanes over `laneOrder` capped at 24) and a production deploy result. Seats 0 to 9 through `seatOf`, -1
    past ten; helper counts as stored. `t` never goes backwards (`lastLogged`).
  - `DayLog` also carries `keys` (the session hash per ordinal) and an open event's `until` as null; both stay inside the Durable Object
    (`historyDay` serves no `keys` and closes every open event from its session's `lastBeat`, `closeLog`). Branches are never
    stored; tasks and merge titles are the doc's, for allowlisted repositories only.
  - Caps: past 200 sessions, 3,000 events or the byte cap (less the headroom, so the closes of a fallback always fit) the row is marked
    `truncated`, only what the change added is dropped and the counts of merges, runs and deploys keep growing to their own caps.
  - Rollover: the first write of a new WIB day starts the row with one carry-in event at t 0 for each session still live at the
    midnight (`startLog`), closes the latest earlier row from the doc (after a cold start it is read from storage, so a quiet day between
    keeps its open events; `closeLog`), and prunes rows older than the 8-day window in the same call (`prune`: normally one delete).
  - Privatize: a `repository` `privatized` scrubs that repository from every stored row and the new one in the same put (`scrubRepo`:
    its tasks go, its merges keep only time, desk and number); the served day also drops tasks and merge titles of repositories no longer
    in `publicRepos`.
  - Served by `GET /history` (the Durable Object: `historyIndex` over the window, 8 rows read in one `get`) and `GET /history?day=` (the
    row of a day in the window, an empty row for a quiet day, 404 outside the window); read-only, GET only. The Worker's `/history` forwards no
    query but a well-formed `day` (any other query is a 404 that never reaches the Durable Object) and cleans a day again at read time
    (`cleanHistory`: `repoAllowed` against `OFFICE_REPO_ALLOWLIST` on every repository and `cleanTitle` with the current blocklist on every
    title, so a later blocklist update applies to stored days); the index (counts only) passes through.
  - Free plan (Workers free: a SQLite-backed Durable Object's 100,000 rows written and 5,000,000 rows read a day, 5 GB stored, 100,000 requests a day; the 2 MB value limit):

    | Item | Busy day (ten seats used: 10 sessions, about 2,800 state, seat or helper changes, 60 merges, 200 runs, 10 deploys) | Limit |
    |---|---|---|
    | Today's row | about 95 KB (events about 78 KB, merges about 10 KB, runs about 4 KB, keys and tasks about 2 KB); a busier day stops at 3,000 events or 120 KB and says `truncated` | 120 KB cap |
    | Rows written | the doc row on every accepted beat or webhook (about 3,000 to 7,000), a log row on each loggable change (about 3,100) and 3 at the rollover: under about 10,000 | 100,000 a day |
    | Rows read | the doc and today's row once per cold start; the index reads 8 rows and a day 1, per edge cache miss | 5,000,000 a day |
    | Stored | at most 8 log rows (under 1 MB) plus the doc | 5 GB |
    | Durable Object requests | history only on edge cache misses: at most about 5,900 a day per data center under continuous load (index and today every 30 s, 7 past days every hour), far fewer in practice | 100,000 a day, shared |
    | Pages Function requests | about 2 per replay start (the index and a day), about 1,000 on a day of 500 L1 sessions | 100,000 a day, shared |
    | CPU | `logDoc` serializes the row once per loggable change to check its size (at most 120 KB, about 1 ms) | free plan CPU per request |

- GitHub: `workflow_run`, `workflow_job` (job progress), `pull_request`, `push` (default branch), `deployment_status`,
  `repository` (`privatized` only); CI progress and PR titles join a desk by repository and branch.
- Workflow runs carry `run_attempt` (deliveries arrive in any order): an older attempt and a late `running` of a
  completed attempt are ignored; only a newer attempt restarts the run (jobs cleared).

### Pages Functions

- `functions/_lib/office.ts`: `GET /api/office` (v1), `GET /api/office?v=2` (v2), `GET /api/office?v=3` (v3) and
  `GET /api/office?v=4` (v4) (always 200 JSON: the snapshot, `mode: "off"` on failure (v4 with an empty pipeline), or
  `{v:1, enabled:false}`) with an ETag (304 on a matching `If-None-Match`) and
  `Cache-Control: public, max-age=5, stale-while-revalidate=30` (the disabled answer `public, max-age=60`), stored in
  `caches.default` for 5 s per data center under one key per version (`VERSIONS`: `/api/office`, `/api/office?v=2`,
  `/api/office?v=3`, `/api/office?v=4`; only exactly `2`, `3` and `4` are honoured, any other query shares the v1
  entry, so junk queries never fill the cache); v2 to v4 fetch the Worker's `/snapshot?v=2`, `?v=3` or `?v=4` and
  validate with `parseOfficeResponseV2`, `parseOfficeResponseV3` or `parseOfficeResponseV4`, so a rolled-back Worker's
  older body is served in the asked version; `POST /api/office/beat` and `/github` forward the raw body and signature
  headers through the service binding `OFFICE`.
- `GET /api/office/history` and `GET /api/office/history?day=YYYY-MM-DD` (`functions/api/office/history.ts`,
  `createOfficeHistoryHandler`, `historyRoute`): GET and HEAD only (405 with `Allow` otherwise). No query is the index; exactly one
  `day` query inside the 8-day WIB window (`historyWindow`) is that day; any other query, a malformed or out-of-window day is the
  fixed 404 `{"v":1,"error":"day"}` (`no-store`, no echo of the input), never reaching the Worker. The edge cache key is built
  from the validated values (`/api/office/history` or `/api/office/history?day=<day>`), so junk queries cannot fill the cache. Both
  fetch the Worker's `/history` through the binding `OFFICE` and validate with `parseOfficeHistoryIndex` or `parseOfficeHistory`,
  with an ETag (304 on a matching `If-None-Match`). Headers: the index and today `public, max-age=30,
  stale-while-revalidate=60`; a past day `public, max-age=3600, stale-while-revalidate=300` (not immutable: a privatize can scrub
  it); the disabled answer `{v:1,enabled:false}` like `/api/office`. A Worker 404 for a day (the window turned over between the edge
  and the Durable Object) is the fixed 404; any other failure (no binding, an error, an invalid body, a Worker rolled back to before
  the replay) is a 503 with no `Cache-Control` and `no-store`, which the replay shows as "Replay unavailable".
- Kill switch `OFFICE_ENABLED` (root `wrangler.toml`).

### Deploy and CI

- `deploy.yml` deploys the Worker inside the Pages job (Cloudflare Pages production), after the gates and before the
  upload, because Pages rejects a deploy whose service binding `OFFICE` (root `wrangler.toml`) names a missing Worker.
  It sets its secrets from the `production` environment; a commit without `workers/office/` or
  `OFFICE_WORKER_DEPLOY = "false"` skips it. A failed Worker step does not stop the upload; a later step fails the job.
  `office-worker.yml` bundles it on pull requests (no secrets).
- `rollback.yml` redeploys it from the rollback target when `workers/office`, `src/lib/office`,
  `src/content/safety-match.ts` or `functions/_lib/security.ts` differ (secrets persist; a target without
  `workers/office` leaves it at the live version). A Worker rolled back to before snapshot v2 rejects beats that carry
  `helpers` (sessions with helpers go missing until the roll forward) and answers v1 to `?v=2` (read as v2). A Worker
  rolled back to before snapshot v3 answers v1 to `?v=3` (read as v3, without helpers) and seats only five: it reads
  only the stored `slot`, so back-row sessions count in `extra` and take a free front desk at the next beat, and its
  snapshots stay valid (no mode off, at any session count; tested against a frozen copy of its rules in
  `tests/office/legacy-five-desks.ts`). A Pages rollback to before v3 serves clients that poll v2 or v1, and a cached v3 client asking that
  Function gets v1 (read as v3). A Worker or Function rolled back to before v4 answers `?v=4` as v1 (the Worker
  forwards no `?v=4`, the Function shares the v1 entry); the v4 Function and the scene read that body as v4 with an
  empty pipeline (part A's anonymous lanes, no effects).
  A Worker rolled back to before the replay has no `/history` (a 404), so the Function answers 503 and the drawer says "Replay
  unavailable"; the stored `log:` rows wait untouched in the Durable Object (that Worker never reads or writes them, and the
  served window only ever names the 8 current days), and the first write of a new WIB day after the roll forward prunes
  those outside the window. A Function rolled back to before the replay has no route: the replay chunk's request gets a non-200
  answer and the replay is unavailable the same way.
- Runbook: `workers/office/README.md`; deploy notes: [`docs/deploy.md`](../deploy.md) section 18.

### Tests

- `tests/office/`: protocol (v4 parse, its fallback and hostile inputs), state (job names, lanes folding past 24,
  `started`, ships, seats, privatized, v4 views), ingest, Worker and Durable Object (`?v=4` routing), Functions
  (`office-endpoint`: the v4 query, cache keys and ETags per version, v1 to v3 unchanged); `tests/office/legacy-five-desks.ts` is
  a frozen copy of the pre-ten-seat Worker's seat and view rules (never update it); `tests/unit/office-deploy.test.ts`.
  The replay's backend: `tests/office/history.test.ts` (the log rules over `logDoc`, `until`, quiet gaps, caps and truncation,
  rollover with carry-ins, prune at 8 rows, the privatize scrub, `keys` never served, the Durable Object's `/history`),
  `tests/office/protocol-history.test.ts` (both parsers with hostile inputs), `tests/office/worker.test.ts` (the `/history` query
  rules and `cleanHistory`) and `tests/office/history-endpoint.test.ts` (`historyRoute`, canonical keys, cache headers, ETag and
  304, HEAD, 404 and 503); fixtures in `tests/helpers/office-history.ts`.

## Relay

- `tools/office-relay/` (Bun CLI, guide in its README): the local privacy boundary. Hooks call
  `office-relay hook <agent> <event>` (the event name comes from argv: Copilot's camelCase payloads carry none),
  written as `'<dir>'/office-relay hook <agent> <event> 2>/dev/null || true` so a hook never fails, even without Bun
  or the program.
  The shim runs Bun from `/` with `--no-env-file` (the detached sender too), so a project's `bunfig.toml` or `.env`
  never affects the relay.
- The relay never runs from a checkout: `install` bundles `cli.ts` and everything it imports (`bun build --target=bun`)
  into `~/.hq-office-relay/office-relay.js`, and the shim runs that file with the absolute path of the Bun that ran the
  install. The detached sender spawns the same file (`import.meta.url` in a Bun bundle is the bundle itself). Reinstall
  to update; `status` shows the program and its install time.
- Mapping (`map.ts`, `command.ts`): tool names and the first words of a shell command only (at most three, after
  `env`, `time`, `sudo` and `nohup`); spec section 5. An answered ask tool maps to thinking; Needs Kurniadi comes only
  from a permission request or a needs-input notification. Tests: `tests/relay/map.test.ts` over
  `tests/relay/fixtures.ts` (payloads of all three agents with planted secrets).
- Copilot permission checks (`hook.ts`, `isPermissionCheck` in `map.ts`): Copilot fires `permissionRequest` before its
  permission service decides (also under autopilot and allow-all, with no auto-approval field in the payload), so a
  Copilot `permissionRequest` within `PERMISSION_CHECK_MS` (1.5 s) of a `preToolUse` for the same tool in the same
  session changes nothing; the relay keeps that session's last `preToolUse` (tool, time) in
  `~/.office-relay/sessions/<hash>.tool.json`. A real Copilot prompt is the `permission_prompt` notification. Claude
  Code and Codex keep `PermissionRequest` as Needs Kurniadi (they fire it only when about to ask). Tests:
  `tests/relay/hook.test.ts`.
- Git data from `.git` files only (`git.ts`, worktrees included); titles from branch names (`title.ts`); a branch
  outside `^[A-Za-z0-9._/-]{1,120}$` is sent without branch and title (`beat.ts`); the session id is an HMAC with a
  local salt (`session.ts`). Relay files live in `~/.office-relay/` (the OS home when `HOME` is empty).
- Hook path (`hook.ts`): local work, the per-session throttle (`decide` in `beat.ts`, under `withSessionLock` in
  `store.ts`, the same bounded lock as the helpers file, on `<hash>.json`), then a detached `send` child, dispatched
  before the beat is recorded as sent; `hook`, `send` and `flush` always exit 0 with empty stdout (a failing Copilot
  `preToolUse` hook would deny the tool).
- Throttle (the relay README has the rules): a change (state, activity, helpers, repository, title) goes out at once
  when the last beat is at least `COALESCE_MS` (10 s, the visitors' `POLL.activeMs`) old, else it waits and a trailing
  send at the end of the window carries the newest state; final states (`done`, `asleep`, `failed`, `input`) go out
  at once and cancel a waiting change; an awake session with events since its last beat gets a keepalive at
  `KEEPALIVE_MS` (15 s). At most one beat per 10 s per busy session plus its final states. The trailing send and the
  keepalive come from one detached `flush <session> <due> <token>` child per session (`flushSession` in `hook.ts`;
  the token in the sent record names the owner, a new child starts only when none wakes in time or the owner is
  `DUE_GRACE_MS` (5 s) late; it drops a send whose event is over `FLUSH_STALE_MS` (60 s) old). Keep
  `KEEPALIVE_MS` plus `DUE_GRACE_MS` at most `TIMING.thinkingAfter` (20 s) and `COALESCE_MS` below `KEEPALIVE_MS`, so
  an active desk never falls to thinking (tested). Tests: `tests/relay/throttle.test.ts` replays a busy Copilot
  session (`tests/relay/busy-session.ts`, about 300 hook events over ten minutes shaped like the relay log) and checks
  the cut, the final desk through `applyBeat`, a desk at most one window late, no rule-made thinking, and the rules.
- Sender (`send.ts`): Keychain item `hq-office-ingest` (account `office-relay`), `X-Office-Signature`, 2 s timeout to
  `https://kurniadi.pages.dev/api/office/beat` by default; logs the status only.
- Installer (`install.ts`): `~/.copilot/hooks/office.json`, merges `~/.claude/settings.json` and `~/.codex/hooks.json`
  (async handlers, backups, only entries containing `office-relay hook` are replaced); install and uninstall parse
  every file (and install builds the bundle) before writing and exit 1 on failure; uninstall also removes the program
  and keeps `~/.office-relay/`. Codex needs a trust in `/hooks`.
- `OFFICE_RELAY_KEY`, `OFFICE_RELAY_ENDPOINT` (`http://127.0.0.1` only), `OFFICE_RELAY_SPOOL`, `OFFICE_RELAY_HOME`,
  `OFFICE_RELAY_COALESCE_MS` (0 to 60000) and `OFFICE_RELAY_INSTALL_DIR` are test and debugging overrides; the
  installed hooks never set them.
- Helpers (`helpers.ts`, mapping table in the relay README): Copilot `subagentStart` / `subagentStop`, Claude Code and
  Codex `SubagentStart` / `SubagentStop` keep a per-session list in `~/.office-relay/sessions/<hash>.helpers.json`
  (salted id hashes; Copilot sends the same `agentId` on start and stop, and a start without one, from the npm build,
  gets an anonymous key that a stop with an unknown id ends, oldest first), counted
  while younger than `HELPER_TTL_MS` (30 min) and capped at 9. Every tool's sub-agent hooks carry the parent's session
  id; an event without one is ignored. A start or stop offers the session's newest state with the new count (through the
  throttle) only when the count changes; other beats carry the count while it is above 0 and once more as 0. The session end deletes the
  helpers file and its beat carries `helpers: 0` only when the last sent count was above 0. The helpers file is read,
  applied and written (and the beat sent) under a bounded lock (`withHelpersLock` in `store.ts`: exclusive
  `<file>.lock`, a try every 2 ms for at most 30 ms, stale after 1 s, then unlocked so the hook stays fast) and written atomically
  (temp file plus rename, mode 0600; also the sent and last-tool files). A helper counts once, as a drone, never as
  its own desk: Copilot events other than `subagentStart` / `subagentStop` with a non-empty `agentId` / `agent_id`
  (from inside a helper, under the helper's own session id) never move a desk. With a `parentAgentId` (the parent's
  `sessionId`) whose desk has sent a beat, they count the helper there (`helper-event helpers N`) and refresh its
  TTL, and the helper's own `agentStop` ends it; otherwise (a nested helper, no parent) they are ignored
  (`helper-event ignored`). Copilot loads hooks when a session starts, so a session older than the install fires no
  `subagentStart` / `subagentStop`; its helpers count this way. Claude Code and
  Codex helper tool events carry the parent's `session_id` and move the parent's desk. Tests:
  `tests/relay/helpers.test.ts`, `tests/relay/hook.test.ts` (planted prompt, client name, private transcript paths,
  helper id and type never reach a beat or the log; dispatch is the only sink), `tests/relay/store.test.ts` (two
  processes, torn reads, stale and held locks), `tests/relay/cli.test.ts` (two concurrent stops).
- Never add a beat field, a log field or a debug mode that records payload text.

## Classic card and Ask

- `#office` on the Classic home page, after `#intro`, titled "Live Agent Office" (ID "Kantor Agen Langsung"): code in
  `src/components/office/`.
  - `OfficeSection` (server) resolves every string on the server (`officeCardLabels`: `office.classic.*` plus the shared
    `office.agent`, `office.state`, `office.activity`, `office.clientProject` and `office.helpers`, and the 3D office's
    `office.3d.drawer.disabled`) and passes them as props (`OfficeCardLabels` in `labels.ts`).
  - `office.classic` is a server-only path (`SERVER_PATHS` in `src/i18n/client-messages.ts`): `ClientMessages` drops it
    with `omitMessages`, so the card's copy never rides in the client messages
    ([styling-and-i18n.md](styling-and-i18n.md)).
  - `OfficeShell` and `OfficeLazy` (client, tiny) import the `OfficePanel` chunk only when the section comes within a
    screen of the viewport (the `VisitsLazy` pattern); until then a static loading line and a short note (what the card
    shows, so a reader without JavaScript gets something) hold the card's height. A chunk that fails to load leaves the
    offline line, reports `offline` and releases the height.
- The panel reuses part 3's `createOfficePoller` and `src/lib/office/model.ts` (`officeCounts`, `deskTitle`,
  `STATE_TONE`, `sinceLabel`, `safeGithubUrl`): it polls only while the section is within a screen of the viewport, and
  the poller skips hidden tabs and stops after 10 min without input (pointer moves, presses, keys and scrolling count;
  the tab turning visible while the card is near restarts it and fetches at once, as the 3D office does; scrolling the
  card back near waits out the rest of the cadence since the last request).
- What it shows (the panel polls `OFFICE_V3_PATH` with `parseOfficeResponseV3`, which reads a v2 or v1 body too, and
  seats it with `withSeats(snapshot, OFFICE_SEATS)`): the counts over the ten seats (`officeCounts(desks,
  OFFICE_SEATS)`: active, thinking, waiting, asleep, with empty seats asleep, the same numbers as the 3D wall; 2 by 2
  below 768 px), five desk rows, the idle summary line, the latest 4 public GitHub events and today's numbers (without
  the CI clause on a day with no runs). No privacy note shows on the card or in the 3D drawers (owner request
  2026-10-20); the rule itself is unchanged ([Privacy](#privacy-owner-decision-d3)).
  - Desk rows (owner decision 2026-10-21, [ten desks](../decisions/2026-10-21-office-ten-desks.md)): only awake desks
    (any state but asleep) take a row, by seat (front row first). Up to five fill the rows; past five, four show and
    the fifth row reads "+N more desks" / "+N meja lainnya" (`office.classic.moreDesks`, N the awake desks
    beyond the four, `data-testid="office-more"`; "desks", not "active desks", so it never seems to contradict the Active
    count, which counts only the Active state; [more desks](../decisions/2026-10-21-office-card-more-desks.md)). With no awake desk (and a snapshot) the first row reads "Every Rover
    is asleep." (`office-none`). Unused rows are quiet, aria-hidden rows (`office-desk-empty`) with the same two lines.
  - An awake desk shows agent, activity (plus "· 3 helpers" on the same truncating line when it has helpers:
    `office.helpers`, resolved raw into `OfficeCardLabels.helpers` and filled by `fill`), state and task: its title for
    an allowlisted public repository, else "Client project".
  - The summary line under the rows (`office-extra`) collapses asleep desks and empty seats into the idle count, which
    is the Asleep count (`office.classic.idle`: "No desks idle", "1 desk idle", "8 desks idle" / "Tidak ada meja yang
    menganggur", "8 meja menganggur"); sessions past the ten seats add " · +N more sessions" (`office.classic.extra`).
    A v1 or v2 body (a rolled-back Worker) seats five, so the other five seats read as idle.
  - States: Live (with "updated HH:MM", outside the `role="status"` line), Paused (a live snapshot older than the 60 s
    keep-last window: the poller stopped for idleness or the tab was hidden), Semi-live (no agent reporting), Resting
    (`mode: "off"`), Offline (after 60 s without a good snapshot: the last known rows stay in place, dimmed, with "as of
    HH:MM"; before any snapshot, five quiet desk rows (`office-desk-empty`) and empty GitHub rows under the offline line). The dimmed rows keep
    their "· 3 helpers", like their last known activity, whereas the 3D office zeroes the helpers offline
    (`OfficeRoverView.helpers`: no drones, no helpers on the chips or in the drawers).
  - English counts are ICU plurals in `office.classic` ("+1 more session", "1 task done", "1 of 1 CI run green"),
    filled on the client by `fill` (`src/components/office/fill.ts`: `{name}` and `{n, plural, ...}`).
  - A disabled office (`{"v":1,"enabled":false}`) hides the whole section, but only once it is off screen: while the
    visitor can see it, the card keeps its height with "The live office is off right now." (the panel holds the
    `disabled` report until a 0 px margin observer says it left the viewport). The panel loads a screen ahead, so in a
    normal scroll the answer arrives below the viewport and the section hides without a visible shift.
- One height in every state (CLS): every state draws the same rows (five desk rows, each with two lines: a desk, "+N
  more desks", "Every Rover is asleep." or a quiet row; four GitHub rows with quiet empty rows filling the slots
  and "No public activity yet today." when a snapshot has none; the idle summary line, which truncates; today's line),
  titles and heads truncate, and the status line and today's line hold two lines below `md`. `OFFICE_RESERVE` (per locale, in `labels.ts`) is that height per breakpoint, held from the loading line
  on: 889 px from 768 (measured 881 in every state, both locales) and 1028 px below (measured 1004 from 360 to 414 px in
  both locales, 1020 for an Indonesian semi-live line at 320), about 8 px of headroom over the tallest.
  The ten-desk states measure the same 881 and 1004 px.
  `e2e/office-classic.spec.ts` checks that no state (busy, semi-live, quiet, off, busy with helpers, ten desks with
  nine and with ten awake, offline before and after a snapshot) moves the next section or reports a layout shift, at
  1440x900 and 390x844 in both locales.
- Tests: `tests/unit/office-card-labels.test.ts`, `tests/unit/office-section.test.ts`,
  `tests/unit/client-namespaces.test.ts`, `tests/hud/OfficePanel.test.tsx`, `e2e/office-classic.spec.ts` (mocks
  `/api/office` from `OFFICE_FIXTURES`, `OFFICE_FIXTURES_V2` and `OFFICE_FIXTURES_V3`; `OFFICE_SHOTS=<dir>` writes the
  owner's review captures, the ten-desk ones in their own test, `-g "ten desks"`).
- Ask: one paragraph in `content/ask/site-build.json` (what the office is, in its own wing of the Lobby, and its privacy
  rule); "Agent Office" and "kantor agen" questions are site questions (`SITE` in `functions/_lib/scope.ts`), but not
  the business sense ("a travel agent office", "kantor agen asuransi"); golden q92 and q93. Never put live office data
  in the pack.
