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

- `src/lib/office/protocol.ts`: `OfficeBeatV1` (relay to Worker), `OfficeResponseV1` (`GET /api/office`) and
  `OfficeResponseV2` (`GET /api/office?v=2`: v1 with `v: 2` and an optional desk `helpers`, 1 to 9, omitted at 0;
  `OfficeSnapshot` is v2). The disabled answer `{v:1, enabled:false}` is the same in both.
- v1 never changes, byte for byte (old clients never see a new field; a golden in `tests/office/state.test.ts`):
  `parseOfficeResponse` rejects any body carrying `helpers`. Only exactly `?v=2` gets v2; no query, `?v=3` or junk
  get v1.
- Clients validate with `parseOfficeResponse` (v1) or `parseOfficeResponseV2` (strict v2, plus a v1 body read as v2
  without helpers, for a rolled-back Worker) and hide on null; the Worker validates beats with `parseOfficeBeat`.
- Who polls what: the 3D office's poller (`createOfficePoller({ path, parse })` in `office/live.ts`) and the Classic
  card v2; the L1 beacon's watch v1. `signalFromBody` reads both.
- Fixtures: `OFFICE_FIXTURES` (v1) and `OFFICE_FIXTURES_V2` (busy with helpers 3 and 6) in
  `src/lib/office/fixtures.ts` (busy, rough, quiet, semiLive, off, disabled).
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
  no `recent` entry; a privatized repository keeps it. `viewV2` shows it (`effectiveHelpers`, capped at 9) while the
  session is awake and beat within `TIMING.helpersTtl` (10 min, so a lost stop event decays); `view` (v1) never does.
  The Durable Object's `/snapshot` answers `viewV2` for `?v=2`, else `view`; the Worker forwards only `?v=2`.
- Desks: five stable slots (`assignSlots`); an awake newcomer may take the longest-asleep desk; others are `extra`.
- GitHub: `workflow_run`, `workflow_job` (job progress), `pull_request`, `push` (default branch), `deployment_status`,
  `repository` (`privatized` only); CI progress and PR titles join a desk by repository and branch.
- Workflow runs carry `run_attempt` (deliveries arrive in any order): an older attempt and a late `running` of a
  completed attempt are ignored; only a newer attempt restarts the run (jobs cleared).

### Pages Functions

- `functions/_lib/office.ts`: `GET /api/office` (v1) and `GET /api/office?v=2` (v2) (always 200 JSON: the snapshot,
  `mode: "off"` on failure, or `{v:1, enabled:false}`) with an ETag (304 on a matching `If-None-Match`) and
  `Cache-Control: public, max-age=5, stale-while-revalidate=30` (the disabled answer `public, max-age=60`), stored in
  `caches.default` for 5 s per data center under one key per version (`/api/office`, `/api/office?v=2`); v2 fetches
  the Worker's `/snapshot?v=2` and validates with `parseOfficeResponseV2`, so a rolled-back Worker's v1 body is served
  as v2 without helpers; `POST /api/office/beat` and `/github` forward the raw body and signature
  headers through the service binding `OFFICE`.
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
  `helpers` (sessions with helpers go missing until the roll forward) and answers v1 to `?v=2` (read as v2).
- Runbook: `workers/office/README.md`; deploy notes: [`docs/deploy.md`](../deploy.md) section 18.

### Tests

- `tests/office/`: protocol, state, ingest, Worker and Durable Object, Functions; `tests/unit/office-deploy.test.ts`.

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
- Hook path (`hook.ts`): local work, dedupe per session with a 15 s keepalive (`beat.ts`), then a detached `send`
  child, dispatched before the beat is recorded as sent; `hook` and `send` always exit 0 with empty stdout (a failing
  Copilot `preToolUse` hook would deny the tool).
- Sender (`send.ts`): Keychain item `hq-office-ingest` (account `office-relay`), `X-Office-Signature`, 2 s timeout to
  `https://kurniadi.pages.dev/api/office/beat` by default; logs the status only.
- Installer (`install.ts`): `~/.copilot/hooks/office.json`, merges `~/.claude/settings.json` and `~/.codex/hooks.json`
  (async handlers, backups, only entries containing `office-relay hook` are replaced); install and uninstall parse
  every file (and install builds the bundle) before writing and exit 1 on failure; uninstall also removes the program
  and keeps `~/.office-relay/`. Codex needs a trust in `/hooks`.
- `OFFICE_RELAY_KEY`, `OFFICE_RELAY_ENDPOINT` (`http://127.0.0.1` only), `OFFICE_RELAY_SPOOL`, `OFFICE_RELAY_HOME`
  and `OFFICE_RELAY_INSTALL_DIR` are test and debugging overrides; the installed hooks never set them.
- Helpers (`helpers.ts`, mapping table in the relay README): Copilot `subagentStart` / `subagentStop`, Claude Code and
  Codex `SubagentStart` / `SubagentStop` keep a per-session list in `~/.office-relay/sessions/<hash>.helpers.json`
  (salted id hashes; Copilot sends the same `agentId` on start and stop, and a start without one, from the npm build,
  gets an anonymous key that a stop with an unknown id ends, oldest first), counted
  while younger than `HELPER_TTL_MS` (30 min) and capped at 9. Every tool's sub-agent hooks carry the parent's session
  id; an event without one is ignored. A start or stop sends the session's last state with the new count only when the
  count changes; other beats carry the count while it is above 0 and once more as 0. The session end deletes the
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
    `office.agent`, `office.state`, `office.activity` and `office.clientProject`, and the 3D office's `office.3d.offDuty`
    and `office.3d.drawer.disabled`) and passes them as props (`OfficeCardLabels` in `labels.ts`).
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
  the tab turning visible while the card is near restarts it and fetches at once, as the 3D office does).
- What it shows: the counts (active, thinking, waiting, asleep; 2 by 2 below 768 px), the five desks with agent, state,
  activity (plus "· 3 helpers" on the same truncating line for an awake desk with helpers: `office.helpers`, resolved
  raw into `OfficeCardLabels.helpers` and filled by `fill`; the panel polls `OFFICE_V2_PATH` with
  `parseOfficeResponseV2`, which reads a v1 body as a desk list without helpers) and task, the latest 4 public GitHub
  events and today's numbers (without the CI clause on a day with no runs). No privacy note shows on the card or in
  the 3D drawers (owner request 2026-10-20); the rule itself is unchanged ([Privacy](#privacy-owner-decision-d3)).
  - A desk's task is its title for an allowlisted public repository, else "Client project" (an asleep desk without a
    title shows none); a desk without a session is "Off duty" / "Tidak bertugas", asleep, like the 3D office; sessions
    beyond the five desks show as "+N more sessions" (that line says "Every Rover is asleep." when no desk has one).
  - States: Live (with "updated HH:MM", outside the `role="status"` line), Paused (a live snapshot older than the 60 s
    keep-last window: the poller stopped for idleness or the tab was hidden), Semi-live (no agent reporting), Resting
    (`mode: "off"`), Offline (after 60 s without a good snapshot: the last known rows stay in place, dimmed, with "as of
    HH:MM"; before any snapshot, off-duty desks and empty GitHub rows under the offline line). The dimmed rows keep
    their "· 3 helpers", like their last known activity, whereas the 3D office zeroes the helpers offline
    (`OfficeRoverView.helpers`: no drones, no helpers on the chips or in the drawers).
  - English counts are ICU plurals in `office.classic` ("+1 more session", "1 task done", "1 of 1 CI run green"),
    filled on the client by `fill` (`src/components/office/fill.ts`: `{name}` and `{n, plural, ...}`).
  - A disabled office (`{"v":1,"enabled":false}`) hides the whole section, but only once it is off screen: while the
    visitor can see it, the card keeps its height with "The live office is off right now." (the panel holds the
    `disabled` report until a 0 px margin observer says it left the viewport). The panel loads a screen ahead, so in a
    normal scroll the answer arrives below the viewport and the section hides without a visible shift.
- One height in every state (CLS): every state draws the same rows (five desks with a task line or an empty one, four
  GitHub rows with quiet empty rows filling the slots and "No public activity yet today." when a snapshot has none,
  the "+N more" line, today's line), titles and heads truncate, and the status line and today's line hold two lines
  below `md`. `OFFICE_RESERVE` (per locale, in `labels.ts`) is that height per breakpoint, held from the loading line
  on: 889 px from 768 (measured 881 in every state, both locales) and 1028 px below (measured 1004 from 360 to 414 px in
  both locales, 1020 for an Indonesian semi-live line at 320), about 8 px of headroom over the tallest.
  `e2e/office-classic.spec.ts` checks that no state (busy, semi-live, quiet, off, busy with helpers, offline before and after a snapshot)
  moves the next section or reports a layout shift, at 1440x900 and 390x844 in both locales.
- Tests: `tests/unit/office-card-labels.test.ts`, `tests/unit/office-section.test.ts`,
  `tests/unit/client-namespaces.test.ts`, `tests/hud/OfficePanel.test.tsx`, `e2e/office-classic.spec.ts` (mocks
  `/api/office` from `OFFICE_FIXTURES`; `OFFICE_SHOTS=<dir>` writes the owner's review captures).
- Ask: one paragraph in `content/ask/site-build.json` (what the office is, in its own wing of the Lobby, and its privacy
  rule); "Agent Office" and "kantor agen" questions are site questions (`SITE` in `functions/_lib/scope.ts`), but not
  the business sense ("a travel agent office", "kantor agen asuransi"); golden q92 and q93. Never put live office data
  in the pack.
