# Agent Office on L1: design

Date: 2026-10-18. Status: approved by the owner on 2026-10-18; assumptions verified against current docs and the
code on 2026-10-19 (corrections are marked **Correction** inline and listed in section 12).

Owner request (verbatim): "im thinking of making something like virtual office animation for the L1 where it shows my
copilot or other agent working and it can show a little on what is it working (include idle, on progress, thinking)
something like that (live, but if its not possible we can search other turn around), its show lot rover workin (or in
sleep position if its not working)".

Mocks (brainstorm artifacts, not committed): the state, face, drawer and GitHub board mock (`office-ring-v6.html`,
approved; its ring layout is superseded by option 1), the L1 placement map (`office-placement.html`, spot A) and the fit
options (`office-fit.html`, option 1 approved).

Plans, one per PR (section 10):

- [Part 1: Worker, Durable Object and `/api/office`](../plans/2026-10-19-agent-office-worker.md)
- [Part 2: office-relay and installer](../plans/2026-10-19-agent-office-relay.md)
- [Part 3: the 3D office on L1](../plans/2026-10-19-agent-office-3d.md)
- [Part 4: Classic card and Ask note](../plans/2026-10-19-agent-office-classic.md)

## 1. Goal

A live "virtual office" on L1 that shows the AI coding agents Kurniadi works with (GitHub Copilot, Claude Code, OpenAI
Codex) as Rovers at desks, with what each one is doing right now, plus public GitHub activity (CI, PRs, deploys). It
must be free to run, safe for privacy, and keep L1 within its performance budgets.

## 2. Owner decisions

Recorded as one decision file: [`docs/decisions/2026-10-18-agent-office.md`](../../decisions/2026-10-18-agent-office.md).

| # | Decision |
|---|---|
| D1 | Layout: mission control as one curved console row plus a big screen wall (owner pick "1" on 2026-10-18, after reviewing a full-ring mock and the space on L1). Five desks on a shallow arc, Rovers sit behind their desks facing visitors with clear space between Rover and desk; one wide screen wall along the south edge behind them holds the mission-control summary (counts, "now" list, today) and the GitHub board. A "+N" chip on the wall shows sessions beyond five. |
| D7 | Location: L1 south plaza (spot A), the free strip between the Rover menu kiosk and the Highlights Hall road, about x -6 to 13 and z 12 to 21 (the lane ring ends at z 12, the slab at z 21, the hall road starts at x 14, z 15). Visible from the spawn, on the way to the hall, and inside the intro orbit's sweep. The slab is not extended. |
| D2 | Source: real live from Kurniadi's machine via agent hooks, combined with semi-live public GitHub activity. Free implementation only. |
| D3 | Privacy: activity type always shown; the task title only for allowlisted public repositories; private work shows "Client project". Code, prompts, file paths and client names never leave the machine. |
| D4 | Agents: GitHub Copilot (the GitHub Copilot desktop app and Copilot CLI share one engine and hook system), Claude Code, OpenAI Codex. Cloud agents (Copilot coding agent, Codex cloud) appear through GitHub activity only. |
| D5 | Nine visible states (section 5) with distinct faces, poses and screens. |
| D6 | Update model: polling every 10 s while the office is visible (not WebSockets). |

## 3. Architecture

```
MAC: agent hooks -> office-relay (sanitize, dedupe, detach) --HMAC--> POST /api/office/beat   (Pages Function)
GITHUB (allowlisted public repos) --webhook (signed)-----------------> POST /api/office/github (Pages Function)
Pages Functions --service binding--> Worker "hq-office" (no public route) --> Durable Object "Office"
Visitor --> GET /api/office (Pages Function, Cache API 5 s per data center) --> Worker --> Durable Object snapshot
```

**Correction (routing):** the spec had the Worker take `/beat` and `/github` on its own public URL. A `workers.dev`
URL contains the account subdomain, which the public-repo rule keeps out of the repository. All three routes are Pages
Functions on the site's own origin (`/api/office`, `/api/office/beat`, `/api/office/github`) that forward to the
Worker through a service binding (`[[services]]` in the root `wrangler.toml`); the Worker has `workers_dev = false`
and no route, like `hq-stats`. Signatures are still verified in the Worker, which alone holds the secrets.

### 3.1 Local hooks (one relay for every agent)

| Agent | Config | Events used |
|---|---|---|
| GitHub Copilot (CLI, and the desktop app, see the note) | `~/.copilot/hooks/office.json` (user-level, applies to every repository) | sessionStart, userPromptSubmitted, preToolUse (matcher `bash\|powershell`), postToolUse, postToolUseFailure, permissionRequest, notification, agentStop, errorOccurred, sessionEnd |
| Claude Code | `~/.claude/settings.json` `hooks` (merged, `async: true` on every handler) | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, Notification, Stop, StopFailure, SessionEnd |
| OpenAI Codex (CLI, IDE extension) | `~/.codex/hooks.json` (merged, `async: true` except SessionEnd), one-time trust in `/hooks` | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PermissionRequest, Stop, SessionEnd |

All three run the same command hook: `office-relay hook <agent> <event>`, which reads the event JSON on stdin. Command
hooks are used, never HTTP hooks, because raw payloads contain prompt text, commands and paths.

**Correction (Copilot):**

- User hooks live in `~/.copilot/hooks/*.json` (or `$COPILOT_HOME/hooks/`) and apply in every repository; the CLI no
  longer reads `~/.copilot/config.json` for hooks. Shape: `{"version":1,"hooks":{"<event>":[{"type":"command","bash":"...","timeoutSec":5}]}}`.
- Copilot also has `postToolUseFailure`, which the relay uses for failed CI commands.
- camelCase event names get camelCase payloads with no event-name field, so the event name is passed on the command
  line (`office-relay hook copilot preToolUse`) for every agent.
- Copilot hooks are synchronous and block the agent (no `async` flag), and a crashing or non-zero `preToolUse` hook
  fails closed (denies the tool). The relay therefore exits 0 with empty stdout in every case, does only local file
  work on the hook path (about 30 ms), and hands the network send to a detached child process. `preToolUse` uses the
  matcher `bash|powershell`, the only tools whose state must show while they run (tests, CI watches); edits and reads
  come from `postToolUse`.
- The desktop app is built on Copilot CLI, but no official page says it loads `~/.copilot/hooks`. PR2 verifies it on
  the owner's Mac with the relay's `status` log before claiming it in the docs.

**Correction (Claude Code):** `MultiEdit` is no longer a listed tool, and `Grep` and `Glob` are absent by default on
macOS, so reviewing also comes from `Read` and from shell commands whose first word is a reader (`rg`, `grep`, `cat`,
`sed`, `head`, `tail`, `ls`, `find`, `git diff`, `git log`, `git show`).

**Correction (Codex):** hooks live in `~/.codex/hooks.json` (same shape as Claude Code's) or inline in
`~/.codex/config.toml`; the installer uses `hooks.json` so it never rewrites the owner's TOML. Codex reports edits as
`apply_patch` and shell as `Bash`. Trust is recorded against the hook's hash, so any change to the hook needs a new
trust in `/hooks`.

### 3.2 office-relay (the privacy boundary)

- A small Bun script in the repo under `tools/office-relay/`, installed as `~/.local/bin/office-relay` (a shell shim
  that runs `bun` on the checked-out script), plus an installer that merges the three hook configs (with backups).
- Maps event and tool names to a state (section 5); it never reads prompt or output text.
- Output is only `{v:1, agent, session, state, activity, repo?, branch?, title?, ts}`:
  - `agent`: copilot | claude | codex.
  - `session`: HMAC-SHA256 of the local session id with a local salt (stable, not reversible).
  - `state` and `activity`: enums.
  - `repo`, `branch` and `title`: only when the git remote is in the local allowlist (default: `ShinyQ/*`). The title
    comes from the branch name (`feat/intro-orbit-reveal` becomes "Intro orbit reveal"); the git data is read from
    files under `.git`, never by running `git` or `gh`.
- **Correction (progress and PR titles):** the relay no longer calls `gh`. The server already receives `workflow_run`,
  `workflow_job` and `pull_request` webhooks for the public repositories, so it attaches CI job progress and the PR
  title to a desk by `repo` and `branch`. This keeps the hook path free of network calls and authentication.
- Sends when the state or activity changes, plus a keepalive at most every 15 s while events keep coming (per-session
  dedupe file in `~/.office-relay/`), fire-and-forget from a detached child, 2 s timeout, never blocks or slows the
  agent, never exits non-zero.
- The ingest key lives in the macOS Keychain (`security find-generic-password -s hq-office-ingest -w`), read only by
  the detached child. `~/.office-pause` (a file) stops all broadcasting; `office-relay pause|resume|status` manages it.

### 3.3 Worker `hq-office` (new, Cloudflare Workers free plan)

- `POST /beat`: header `X-Office-Signature: sha256=<hex>` = HMAC-SHA256(raw body) with `OFFICE_INGEST_KEY`; body `ts`
  within 60 s (replay guard); strict schema (enums, lengths, 2 KB cap); the server re-checks `repo` against
  `OFFICE_REPO_ALLOWLIST` and runs `title` through the public safety blocklist; a blocked or non-allowlisted title is
  dropped and the client shows "Client project".
- **Correction (public only):** `ShinyQ/*` could match a private repository. The Durable Object records repositories
  that webhooks report with `repository.private == false`; a beat's `repo`, `branch` and `title` are kept only when the
  repository is allowlisted and known public.
- `POST /github`: verifies `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET`; dedupes `X-GitHub-Delivery`. Accepts
  `workflow_run`, `workflow_job` (job progress), `pull_request` (opened, closed with merged), `push` (default branch),
  `deployment_status`, `ping`, only for allowlisted public repositories.
- **Correction (webhook scope):** GitHub has no user-level webhooks. The owner adds one repository webhook per public
  repository to show (ShinyQ/ShinyQ-HQ first), or later a GitHub App installed on all repositories (one webhook,
  Actions read permission for `workflow_run` and `workflow_job`).
- Durable Object `Office` (SQLite backend, free plan): holds sessions, desk assignment (stable; up to five desks, extra
  sessions shown as "+N" on the screen wall), the GitHub feed (last 20 events, running workflow runs with job
  progress), PR titles by branch, known public repositories, recent delivery ids, and today's counters (tasks done,
  PRs merged, CI runs and greens) reset at 00:00 WIB.
- **Correction (timers and storage):** no alarms. Time rules (asleep after 3 min, removal after 30 min, Done for 20 s,
  thinking after a quiet 20 s, long waits for tests and CI) are pure functions of `now` applied when a snapshot is read
  and when a beat arrives, which costs no extra rows (each `setAlarm` counts as a row written) and is easy to test.
  The state is one JSON document in the Durable Object's storage API (stored in its SQLite backend): one row read per
  cold start and one row written per accepted beat or webhook.
- `GET /snapshot` for the Pages Function (service binding only; the Worker has no public route).
- Kill switch: `OFFICE_ENABLED` in the root `wrangler.toml` `[vars]` (Pages). Anything but `"true"` makes
  `GET /api/office` return `{v:1, enabled:false}` and the POST routes drop everything with 204.

### 3.4 Pages Function `GET /api/office`

Calls the Worker through the service binding, returns the snapshot JSON (`desks[]`, `extra`, `github`, `today`,
`mode: live | semi-live | off`, `updatedAt`) with an ETag (304 on a matching `If-None-Match`) and
`Cache-Control: public, max-age=5, stale-while-revalidate=30` (the disabled answer `public, max-age=60`), and stores
it in the Cache API
for 5 s. **Correction:** the Cache API is per data center and every poll still runs the Function (one Workers request
from the shared free pool), so the snapshot read is shared per data center, not globally; section 7 counts it.

## 4. Site

### 4.1 3D (L1)

- Location (D7): the south plaza strip, x about -6 to 13, z 12 to 21. Layout: a screen wall 17 u wide and 4 u tall on
  the south edge (plane at z 20.7, facing north), five console desks on an arc of radius 8 whose centre (3.5, 10) lies
  north of the row (toward the plaza), so the row curves around the approaching visitor (end desks at z about 15,
  middle desk at z 18), each Rover 1.2 u behind its desk (toward the wall) facing the centre. Verified against
  `src/experience/config.ts`: the west Rover stays about 3.6 u east of the kiosk box, the east Rover about 2.3 u west
  of the hall road start, the lane ring (radius 12 around (6, 0)) and the stats tiles stay north of z 12, and nothing
  else stands in the strip. The office adds per-desk obstacles and a wall obstacle (camera collision for the wall), a
  point-and-go station `L1:station:office` with its stop at about (3.5, 14.2), and a view zone `L1:office`.
- Neatness: one clean arc, equal spacing, desks and Rovers aligned to the arc normal, the wall centred on the arc, no
  stray props. Cable trays and floor lines follow the arc.
- A lazy chunk loaded after the first frame when the rover is on L1 near the office, or when the visitor opens it from
  the Rover menu. Not on the first-frame path.
- **Correction (bytes, owner approval needed):** the 3D session total has about 2.2 KB (full) and 2.3 KB (lite) of
  headroom, and the spawn is about 13 u from the office, so the chunk loads in almost every L1 session. It cannot fit
  the session total. Like B1, the office chunk gets its own cap (proposed 14 KB gzip, `BYTES_3D_BUDGET.office`) and is
  left out of the session total. Owner decision 2026-10-19: both session caps rise by 3 KB (lite 449.4 KB, full
  473 KB) for the main-path hooks.
- Draw-call plan: instanced Rovers, arms and antenna tips; one merged solid mesh and one merged edge mesh for desks,
  legs, trays and the wall frame (the shared kit materials); faces and desk screens as one quad mesh over one canvas
  atlas, redrawn at 10 fps only for changed cells; the screen wall as one canvas texture (summary and GitHub board
  side by side) at 2 fps. Target: 8 draw calls, at most 12; L1 measures 86 (full) and 84 (lite) at the spawn, so it
  stays under 125. No new shader program as the target, at most the baseline plus 2.
- Labels: HTML chips above Rovers (as in the mock, projected like the hint probe), hidden on far zoom; a drawer per
  Rover (`L1:office-desk-1` to `-5`), one for the summary half of the wall (`L1:office`), one for the GitHub half
  (`L1:office-github`), using the existing drawer component.
- Polling only while the office is in view and the tab is visible; stops otherwise.
- Reduced motion: no bobbing or jumps; state changes crossfade.

### 4.2 Classic

A "Live Agent Office" card on the home page (EN and ID): the counts, the active agents with their activity, the latest
GitHub events, and the same privacy note. It reads the same `/api/office`. **Correction:** the Classic JS budget has
little headroom, so the card is a server-rendered shell with a lazily imported client panel (the `VisitsLazy`
pattern), loaded only when the section nears the viewport, and it polls only while visible.

### 4.3 Ask Rover Assistant

Pack note so Ask can answer "what is the Agent Office" and "is it live" (no live data in the pack).

## 5. States

| State | From | Face | Pose | Screen |
|---|---|---|---|---|
| Working | preToolUse or postToolUse with edit or write tools | focused eyes | typing bob, arms moving | code scrolling (invented snippets) |
| Thinking | userPromptSubmit, a completed non-edit tool, or no beat for over 20 s while working or reviewing | amber eyes looking around | head tilt, antenna pulse | three dots |
| Reviewing | read, view, grep or search tools, or a reader shell command | reading glasses scanning | slow side to side | diff lines |
| Running tests | shell tool whose command matches the test runners (bun test, bun run test, vitest, playwright, pytest, npm test, bun run e2e) | eyes with a progress mouth | leaning in | indeterminate progress bar |
| Waiting on CI | shell tool matching `gh pr checks`, `gh run watch` or `gh run view` | patient eyes, spinner mouth | idle sway | CI progress (jobs done of total, from webhooks) |
| Needs Kurniadi | permissionRequest, or a notification of type `permission_prompt`, `elicitation_dialog` or `agent_needs_input` | raised brow and "?" | arm raised | a generic question card |
| Done | agentStop or Stop after a turn | ^_^ | hop, arms up | check mark |
| CI failed | postToolUseFailure on a CI command, or the desk's watched run fails (webhook) | x_x | slump with a shake | cross and the failed job name (public repositories only) |
| Asleep | no beat for 3 min (15 min while running tests, waiting on CI or needing Kurniadi), sessionEnd, or Done after 20 s | closed eyes | slumped, screen off | sleep |

Command matching uses the tool name and the first two words of the command only, evaluated locally; the command text
is never sent. **Correction:** the mock's question card showed the agent's question; that is prompt text (D3), so the
card shows only "Waiting for Kurniadi".

## 6. Privacy and security

- Three layers: relay sends only enums and allowlisted titles; the server re-validates (allowlisted and known public)
  and redacts; the client renders only known fields.
- No IP, user agent or location is stored for beats; visitor polls are not logged beyond the existing analytics.
- Secrets: `OFFICE_INGEST_KEY` (Keychain locally, Worker secret), `GITHUB_WEBHOOK_SECRET` (Worker secret), both set by
  `deploy.yml` from `production` environment secrets; `SAFETY_BLOCKLIST` is passed to the Worker the same way.
- The page states the privacy rule in the drawers and on the Classic card (EN and ID).

## 7. Free-tier budget (per day)

**Correction:** Durable Object requests have their own 100,000 per day meter; Pages Function invocations count toward
the Workers 100,000 per day pool shared with Ask, stats, visit and RUM; service-binding calls add no request charge.

| Item | Estimate | Free limit |
|---|---|---|
| Beats (changes plus 15 s keepalives) | 2,000 to 6,000 Functions requests and DO requests | 100,000 each |
| GitHub webhooks (`workflow_job` sends about 3 per job) | about 1,000 | same pools |
| Visitor polls (each one runs the Function) | 10 s while a visitor watches the office, 30 s when all asleep, stops after 10 min idle: about 6,000 for 1,000 visitor-minutes | Workers pool |
| Snapshot reads reaching the DO | at most one per 5 s per data center | DO pool |
| DO rows written | one per accepted beat or webhook | 100,000 |
| Durable Object duration | short requests, no WebSockets, no alarms | 13,000 GB-s |
| Storage | under 100 KB | 5 GB |

## 8. Failure modes

| Failure | Behavior |
|---|---|
| Worker or Durable Object down | Client keeps the last snapshot for 60 s, then shows "offline" with the last known GitHub events. |
| Relay fails or the network is down | Agents unaffected (fire and forget from a detached child); the office shows those agents asleep after 3 min. |
| A hook payload format changes | Unknown events map to no beat; the relay logs locally only. |
| Free limit exceeded | Durable Object calls fail; the snapshot endpoint returns `mode: off`; the office shows the "resting" state. |
| A leak attempt (unexpected title text) | Server allowlist, public check and redaction; titles only from public allowlisted repositories. |
| A hook crashes | The relay catches everything and exits 0 with empty stdout, so a Copilot `preToolUse` never fails closed. |

## 9. Testing

- Relay: unit tests for event-to-state mapping per agent (fixtures of hook payloads for Copilot, Claude Code and
  Codex), dedupe and keepalive, pause, git reading, title derivation, installer merges, and a test that no field other
  than the schema leaves the process.
- Worker: unit tests for signature checks, replay guard, allowlist and public check, redaction, time rules (asleep,
  remove, done flash, thinking), desk assignment, GitHub event parsing, the Durable Object over a fake storage.
- Site: unit tests for the snapshot client, poller and state visuals; e2e for the Rover drawer, summary drawer, GitHub
  drawer, Classic card, offline and semi-live modes (mocked API); perf gate for L1 draw calls with the office loaded on
  full and lite.

## 10. Delivery (PRs)

1. Worker and Durable Object, webhook ingest, `/api/office` and the POST routes, docs and runbook (no UI).
2. office-relay and installer for Copilot, Claude Code and Codex, with fixtures (in the repo under
   `tools/office-relay/`).
3. 3D office on L1 (curved console row, Rovers, states, screen wall with summary and GitHub board, drawers),
   performance gated, captures for owner review.
4. Classic card and Ask note.

## 11. Out of scope

WebSocket push, history pages, per-agent analytics, showing private repository titles, controlling agents from the
site.

## 12. Corrections found while verifying (2026-10-19)

| Topic | Spec said | Verified fact and change |
|---|---|---|
| Worker routes | Worker serves `/beat` and `/github` | A `workers.dev` URL exposes the account subdomain; all routes are Pages Functions forwarding over a service binding. |
| Copilot hooks | non-blocking command hooks | Copilot hooks block and `preToolUse` fails closed; the relay detaches the send and always exits 0. Event name comes from argv. Added `postToolUseFailure`. |
| Copilot desktop app | shares `~/.copilot/hooks` | Not documented; verified on the owner's Mac in PR2. |
| Claude Code tools | MultiEdit, Grep, Glob | MultiEdit gone; Grep and Glob absent by default on macOS; reader shell commands count as reviewing. |
| Codex config | `~/.codex/config.toml [hooks]` | `~/.codex/hooks.json` (same shape, merge-safe); trust per hook hash. |
| Relay `gh` calls | PR title and CI progress from `gh` | Server joins webhooks by repo and branch; the relay makes no network call on the hook path. |
| Private repositories | allowlist `ShinyQ/*` | Allowlisted and known public from webhooks. |
| Timers | Durable Object alarms | Pure time rules on read; one JSON document; no alarm writes. |
| Durable Object config | `new_sqlite_classes` | Still supported (`[[migrations]]`); the newer `exports` form is one-way, so the legacy form is used. |
| Request pools | one shared pool | DO requests have their own 100,000 per day; every poll is a Workers request; poll backoff added. |
| Edge cache | shared by all visitors | Cache API is per data center. |
| GitHub webhooks | one for the account | No user-level webhooks: one per repository (or a GitHub App). Job progress needs `workflow_job`. |
| 3D bytes | lazy chunk inside the budgets | Session total has about 2 KB headroom; office chunk gets its own cap (owner approval). |
| 3D main path | trigger and hooks fit the session total | Measured in a scratch build: office chunk 12.2 KB; main path grows 2.4 KB (lite) and 2.5 KB (full), so the session totals land about 0.5 KB over (446.9 of 446.4, 470.5 of 470). Owner decision 2026-10-19: both session caps rise by 3 KB (lite 449.4 KB, full 473 KB) plus the office chunk's own 14 KB cap; part 3 still applies the cheap fallbacks. |
| Space rules | office fits the Lobby rules | Any curved row of five desks breaks the 6 u `SPACE_RULES` (desk gaps, 3.89 u to the kiosk, 2.32 u to the hall road); owner approved 2026-10-19: the office is one fixture with its own clearance tests. |
| Needs Kurniadi card | shows the agent's question | Prompt text; generic card only. |
| Thinking | no tool for 8 s | 20 s without a beat (keepalives every 15 s); visitors poll every 10 s, so 8 s is not observable. |
