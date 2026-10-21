# office-relay

The local half of the L1 Agent Office (`docs/agents/office.md`): hooks of GitHub Copilot, Claude Code and OpenAI Codex
call `office-relay hook <agent> <event>`, which turns the event into a tiny signed beat (agent, a hashed session id, a
state, an activity type, and for allowlisted public repositories the repository, branch and a title from the branch
name, and the number of active helpers) and posts it to `https://kurniadi.pages.dev/api/office/beat` from a detached
process. Prompts, commands, file paths, output and the raw session id never leave the machine; of sub-agents, only the
number of active helpers leaves the machine.

## Install (owner, once)

1. Put the ingest key in the Keychain (the same value as the `OFFICE_INGEST_KEY` production secret); already done if
   `office-relay status` (before the install: `bun tools/office-relay/src/cli.ts status`) shows `ingest key: found`:
   `security add-generic-password -s hq-office-ingest -a office-relay -w <key>`
2. From the root of any checkout (a worktree is fine): `bun tools/office-relay/src/cli.ts install`. It bundles the relay
   into one self-contained file, `~/.hq-office-relay/office-relay.js` (printed as `program:`), writes the shim
   `~/.local/bin/office-relay` (running that file with the Bun that ran the install, by absolute path),
   `~/.copilot/hooks/office.json`, and merges `~/.claude/settings.json` and `~/.codex/hooks.json` (a backup
   `*.office-backup-<time>` sits next to each changed file). The checkout can be deleted afterwards. To update the
   relay, run the install again from a newer checkout; reinstall too after moving or reinstalling Bun.
3. Codex: start Codex, open `/hooks`, review and trust the office-relay hooks (again after any reinstall).
4. Check: `office-relay status` shows "active", "ingest key: found" and the three hooks installed. Use each agent once
   and run `office-relay status` again: the last events list `copilot ...`, `claude ...` and `codex ...` lines with
   `sent` and `send 204`. For the GitHub Copilot desktop app, start a session there and look for `copilot` lines too
   (the app is built on Copilot CLI; this confirms it loads `~/.copilot/hooks`).

After an update that adds hook events (the sub-agent events below, for example), reinstall from the newer checkout
(step 2) only after the Worker and Pages from that change are deployed: a Worker without snapshot v2 and helpers support
rejects every beat that carries `helpers`, so a relay that sends them too early hides busy desks while helpers run. Then
trust the new Codex hooks in `/hooks` (step 3) and restart running agent sessions, which load their hooks at start
(Copilot snapshots them per session, so a Copilot app session that predates the install never fires the new events;
the relay still counts its helpers from the helpers' own events, see below).
Then start a helper in each tool (Copilot: an explore or task agent; Claude Code: any subagent; Codex: a
subagent) and look for `<agent> <event> helpers 1 sent` in `office-relay status`.

After the throttle update (below), reinstall from a checkout that has it: `bun tools/office-relay/src/cli.ts install`
(step 2; no Worker deploy and no new Codex trust are needed: the beats and the hook commands are unchanged). Running
agent sessions use the new program from their next hook call, because the shim always runs the installed file. Check
with `office-relay status`: busy sessions now log `queued`, then `flush <state> trailing sent`.

Every hook command is written as `'<dir>'/office-relay hook <agent> <event> 2>/dev/null || true` (the directory
single-quoted), so a hook never fails, even when Bun or the program is missing. The shim runs Bun from `/` with
`--no-env-file`, so a project's `bunfig.toml` or `.env` never affects the relay. Install and uninstall parse every
file before writing anything: a file they cannot parse aborts the command with exit code 1 and nothing changed.

## Use

- `office-relay pause` stops all broadcasting (creates `~/.office-pause`); `office-relay resume` starts it again.
- `office-relay status`: state, the program (`~/.hq-office-relay/office-relay.js` and its install time, or "running from
  a checkout" when it is not installed), endpoint, key, allowlist, hooks and the last ten events (agent, event, state,
  outcome only).
- `office-relay uninstall` removes the office entries, the Copilot file, the shim and `~/.hq-office-relay/office-relay.js`
  (other hooks stay, and so does the data in `~/.office-relay/`: salt, config, log, sessions).
- Config: `~/.office-relay/config.json` `{ "endpoint": "https://kurniadi.pages.dev/api/office/beat", "allow": ["ShinyQ/*"] }`
  (only `https://` endpoints are accepted). Only repositories in `allow` (and, on the server, only public ones) show a
  title; everything else is "Client project".

## What a beat holds

- State and activity from the event name, the tool name and the first words of a shell command (at most three, after
  `cd x &&`, `export`, `FOO=bar` and the wrappers `env`, `time`, `sudo`, `nohup`). The command itself is never sent.
- An answered ask tool maps to thinking; "Needs Kurniadi" comes only from a permission request or a needs-input
  notification.
- GitHub Copilot fires `permissionRequest` before its permission service decides, so it follows the `preToolUse` of
  nearly every tool call, also under autopilot or allow-all, and its payload says nothing about auto-approval. A
  Copilot `permissionRequest` within 1.5 s of a `preToolUse` for the same tool in the same session is therefore a
  permission check: it changes nothing (logged as `permissionRequest after-tool ignored`). A prompt Copilot really
  shows arrives as the `permission_prompt` notification, which is "Needs Kurniadi". The last `preToolUse` tool name
  and time per session live in `~/.office-relay/sessions/<hash>.tool.json`. Claude Code and Codex fire their
  `PermissionRequest` only when they are about to ask, so it stays "Needs Kurniadi".
- Repository and branch from the `.git` files of the working directory (worktrees included; git is never run). A
  branch that does not match `^[A-Za-z0-9._/-]{1,120}$` is sent without branch and title; the server also drops
  branch names that hold a blocklisted term.
- The session id is an HMAC with a local salt (`~/.office-relay/salt`).
- Helpers: the count of active sub-agents of a session, 0 to 9 (`helpers`; see below). Nothing else about a helper
  leaves the machine.

## How often a beat goes out (the throttle)

A busy agent fires two or three hook events per tool call, and the desk state flips on most of them (a shell command's
`preToolUse` is working, its `postToolUse` thinking). Per session, the relay therefore sends:

- a change (state, activity, helper count, repository or title) at once when the last beat is 10 s old or more
  (`COALESCE_MS`, the visitors' active poll); a change inside those 10 s waits, and a trailing send at the end of the
  window carries the newest state. A change that flaps back to the sent state inside the window sends nothing;
- a final state (stop, session end, failure, "Needs Kurniadi") at once, always, cancelling a waiting change;
- a keepalive (the last beat again) 15 s after the last beat while the session is awake and its events keep coming
  (`KEEPALIVE_MS`), so the office never shows a busy desk as thinking (it does after 20 s without a beat);
- nothing else: so at most one beat per 10 s per busy session, plus its final states.

The hook still exits at once: the trailing send and the keepalive come from one detached `flush` child per session,
which sleeps until it is due, sends, and ends when nothing is left (it gives up a send whose event is more than 60 s old,
after the Mac slept). The throttle state (the last sent beat, the waiting change, the newest event time and the
child's wake time and token) lives in the session's `~/.office-relay/sessions/<hash>.json`, read and written under a
short lock like the helpers file. The log shows `queued` for a waiting change and `flush <state> trailing sent` or
`flush <state> keepalive sent` for the child's beats.

## Helpers (sub-agents)

Each tool's sub-agent start and stop hooks update a per-session list in `~/.office-relay/sessions/<hash>.helpers.json`
(salted hashes of the helper ids, or anonymous keys, with their latest start or activity times; never names, types,
prompts or paths). A
start or stop offers a beat with the session's newest state and activity (or working / editing for a session with no
beat yet) and the new count, only when the count changes; the throttle above decides when it goes out. Other beats carry the count while it is above 0 and once more as
0. A helper with no stop event for 30 minutes no longer counts. A start or stop without a parent session id is ignored
(logged `no-parent ignored`). The session end (Copilot `sessionEnd`, Claude Code and Codex `SessionEnd`) deletes the
session's helpers file; its beat carries `helpers: 0` when the last sent count was above 0, else no count. Hook
processes run concurrently, so the helpers file is updated under a short lock (`<file>.lock`, created exclusively, a try
every 2 ms, a lock older than 1 s is removed; after 30 ms the hook goes on unlocked so it stays fast) and
replaced whole through a temp file and a rename (a reader never sees a truncated file).

A helper counts once, as a drone on its parent's desk, never as a desk of its own. Copilot reports a helper's own
events under the helper's own session id with `agentId` (or `agent_id`) and `parentAgentId` (the parent's `sessionId`)
set, so no Copilot event other than `subagentStart` / `subagentStop` that carries a non-empty `agentId` moves a desk.
Instead it counts that helper on the parent's desk, if that desk has sent a beat (logged `helper-event helpers N sent`
or `skipped`), keeps it alive past the 30 minute TTL while it works, and the helper's own `agentStop` ends it. Without
a `parentAgentId`, or for a nested helper whose parent is itself a helper, it is ignored (logged `helper-event
ignored`). This also counts the helpers of a Copilot session that started before the sub-agent hooks were installed:
Copilot loads hooks when a session starts, so such a session fires no `subagentStart` or `subagentStop`. Claude Code
and Codex report a helper's tool events under the parent's `session_id`, so they move the parent's desk (state and
activity) as the main agent's own events do.

| Tool (version checked) | Events | Parent session | Helper id | Notes |
|---|---|---|---|---|
| GitHub Copilot CLI (1.0.99, captured 2026-10-21) | `subagentStart`, `subagentStop`, plus the helper's own events | `sessionId` on the start and stop, `parentAgentId` on the helper's own events (both the parent's session id) | `agentId`, the same on start, stop and the helper's own events (it is also the helper's own `sessionId`) | Every built-in agent fires both events (general-purpose, explore and task checked, sync and background). The npm build of the same version sends no `agentId` on the start: that helper counts anonymously and the stop, whose `agentId` it never saw, ends the oldest anonymous helper. The helper's own `agentStop` ends it just before `subagentStop`. A session older than the install fires neither event; its helpers count from their own events. A helper that fails or is cancelled fires no stop and expires 30 minutes after its last event. Nested helpers: a helper that starts its own helper fires `subagentStart` under the helper's own session id, which opens a desk of its own (a known limit; nested helpers are rare) |
| Claude Code (2.1.223) | `SubagentStart`, `SubagentStop` | `session_id` (the main session) | `agent_id` | A resumed subagent or a teammate's new message repeats the start (deduped by id); a stop of an internal agent (prompt suggestions, `/btw`) with no start changes nothing |
| OpenAI Codex (0.154.0) | `SubagentStart`, `SubagentStop` | `session_id` (the parent's) | `agent_id` | Both events are async hooks like the others; trust them in `/hooks` |

## Test and debugging overrides

These environment variables exist for the tests in `tests/relay` and for local debugging; the installed hooks never
set them.

- `OFFICE_RELAY_KEY`: the ingest key instead of the Keychain item.
- `OFFICE_RELAY_ENDPOINT`: another endpoint, accepted only on `http://127.0.0.1:<port>/`.
- `OFFICE_RELAY_SPOOL`: append beats to this file instead of starting the sender (the `flush` child appends there too).
- `OFFICE_RELAY_COALESCE_MS`: the coalescing window in ms (0 to 60000) instead of 10 s.
- `OFFICE_RELAY_HOME`: the relay directory instead of `~/.office-relay` (an empty `HOME` falls back to the OS home).
- `OFFICE_RELAY_INSTALL_DIR`: the program directory instead of `~/.hq-office-relay` (tests only).

## Troubleshooting

- `ingest key: missing` or `send no-key`: the Keychain item is missing or named differently (step 1).
- `send 401`: the key differs from the Worker's `OFFICE_INGEST_KEY`, or the Mac's clock is off by more than 60 s.
- `send 0`: no network or a timeout (2 s); the office shows the agent asleep after 3 minutes.
- No lines for an agent: its hook config is missing (`office-relay status`), or Codex hooks are not trusted yet.
- The relay never blocks an agent: `hook` and `send` exit 0 with no output even when they fail.
