# office-relay

The local half of the L1 Agent Office (`docs/agents/office.md`): hooks of GitHub Copilot, Claude Code and OpenAI Codex
call `office-relay hook <agent> <event>`, which turns the event into a tiny signed beat (agent, a hashed session id, a
state, an activity type, and for allowlisted public repositories the repository, branch and a title from the branch
name) and posts it to `https://kurniadi.pages.dev/api/office/beat` from a detached process. Prompts, commands, file paths,
output and the raw session id never leave the machine.

## Install (owner, once)

1. Put the ingest key in the Keychain (the same value as the `OFFICE_INGEST_KEY` production secret); already done if
   `office-relay status` (before the install: `bun tools/office-relay/src/cli.ts status`) shows `ingest key: found`:
   `security add-generic-password -s hq-office-ingest -a office-relay -w <key>`
2. From the repository root: `bun tools/office-relay/src/cli.ts install`. It writes the shim `~/.local/bin/office-relay`
   (pointing at this checkout and this Bun), `~/.copilot/hooks/office.json`, and merges `~/.claude/settings.json` and
   `~/.codex/hooks.json` (a backup `*.office-backup-<time>` sits next to each changed file). Run it from a checkout
   that stays (not a worktree that will be deleted).
3. Codex: start Codex, open `/hooks`, review and trust the office-relay hooks (again after any reinstall).
4. Check: `office-relay status` shows "active", "ingest key: found" and the three hooks installed. Use each agent once
   and run `office-relay status` again: the last events list `copilot ...`, `claude ...` and `codex ...` lines with
   `sent` and `send 204`. For the GitHub Copilot desktop app, start a session there and look for `copilot` lines too
   (the app is built on Copilot CLI; this confirms it loads `~/.copilot/hooks`).

Every hook command is written as `'<dir>'/office-relay hook <agent> <event> 2>/dev/null || true` (the directory
single-quoted), so a hook never fails, even when Bun or the checkout is missing. Install and uninstall parse every
file before writing anything: a file they cannot parse aborts the command with exit code 1 and nothing changed.

## Use

- `office-relay pause` stops all broadcasting (creates `~/.office-pause`); `office-relay resume` starts it again.
- `office-relay status`: state, endpoint, key, allowlist, hooks and the last ten events (agent, event, state, outcome
  only).
- `office-relay uninstall` removes the office entries, the Copilot file and the shim (other hooks stay).
- Config: `~/.office-relay/config.json` `{ "endpoint": "https://kurniadi.pages.dev/api/office/beat", "allow": ["ShinyQ/*"] }`
  (only `https://` endpoints are accepted). Only repositories in `allow` (and, on the server, only public ones) show a
  title; everything else is "Client project".

## What a beat holds

- State and activity from the event name, the tool name and the first words of a shell command (at most three, after
  `cd x &&`, `export`, `FOO=bar` and the wrappers `env`, `time`, `sudo`, `nohup`). The command itself is never sent.
- An answered ask tool maps to thinking; "Needs Kurniadi" comes only from a permission request or a needs-input
  notification.
- Repository and branch from the `.git` files of the working directory (worktrees included; git is never run). A
  branch that does not match `^[A-Za-z0-9._/-]{1,120}$` is sent without branch and title; the server also drops
  branch names that hold a blocklisted term.
- The session id is an HMAC with a local salt (`~/.office-relay/salt`).

## Test and debugging overrides

These environment variables exist for the tests in `tests/relay` and for local debugging; the installed hooks never
set them.

- `OFFICE_RELAY_KEY`: the ingest key instead of the Keychain item.
- `OFFICE_RELAY_ENDPOINT`: another endpoint, accepted only on `http://127.0.0.1:<port>/`.
- `OFFICE_RELAY_SPOOL`: append beats to this file instead of starting the sender.
- `OFFICE_RELAY_HOME`: the relay directory instead of `~/.office-relay` (an empty `HOME` falls back to the OS home).

## Troubleshooting

- `ingest key: missing` or `send no-key`: the Keychain item is missing or named differently (step 1).
- `send 401`: the key differs from the Worker's `OFFICE_INGEST_KEY`, or the Mac's clock is off by more than 60 s.
- `send 0`: no network or a timeout (2 s); the office shows the agent asleep after 3 minutes.
- No lines for an agent: its hook config is missing (`office-relay status`), or Codex hooks are not trusted yet.
- The relay never blocks an agent: `hook` and `send` exit 0 with no output even when they fail.
