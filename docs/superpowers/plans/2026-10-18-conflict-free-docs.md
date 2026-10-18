# Conflict-Free Decisions and Plans Docs Implementation Plan

Status: in review, 2026-10-18 (coordinator request, user-directed).

**Goal:** Two pull requests that each add an owner decision and a plan never edit the same lines of any committed
file, so parallel PRs stop forcing merge conflicts (and the full CI rerun each conflict costs: three times on #221).

**Cause:** every decision appended a row to the one table in `docs/decisions.md`, and every plan added a row to the
table in `docs/superpowers/README.md` and edited its counts line ("88 plans: 54 shipped ...").

**Design:** nothing shared is edited per PR.

- Decisions: one file per decision, `docs/decisions/YYYY-MM-DD-slug.md` (`YYYY-MM-slug.md` when only the month is
  known): an `# Area` heading, a `- Date:` line, an optional `- PR:` line of PR links, then the decision text.
  History, so it sits next to `docs/decisions.md`, not in `docs/agents/` (current rules only).
- `docs/decisions.md` stays (every existing link keeps working) as a static page: how to add a decision and how to
  print the log. No table, no rows, no counts.
- Plans: each plan's own `Status:` line (within the first 12 lines) is the only status record. The README keeps
  its intro and the specs table but drops the plans table and the counts line.
- `bun scripts/docs-index.ts` prints the decisions table and the plans table (status and PRs derived from each
  status line, with counts) to stdout; nothing generated is committed, so no regeneration conflicts.
- `tests/unit/docs-index.test.ts` enforces the structure: entry file names and fields, no table in the two shared
  files, a parseable status line in every plan.
- Tooling and docs only: no `package.json` script (that file classes as `ci` and would force a full CI run).

## Tasks

- [x] **Task 1: index script.** `scripts/docs-index.ts`: pure `parseDecision`, `planStatus`, `listDecisions`,
  `listPlans`, `renderDecisions`, `renderPlans`; the CLI prints both tables, or one with `decisions` / `plans`.
- [x] **Task 2: migrate the decisions losslessly.** A one-off script (not committed) splits the 159 rows into
  files; the rendered table must equal the old rows as a multiset, byte for byte. Rebased on #221: its two
  rows became files too (the L4 sweep row it duplicated with `#219` filled in keeps that PR; its own row gets `#221`).
- [x] **Task 3: migrate the plan rows.** Every PR number and status in the old table must be in the plan's status
  line. Stale lines are brought up to date from `git log` (merged PRs #176, #187, #190, #191, #192, #193, #195,
  #196, #200, #202, #213, #220); plans an open PR edits (`2026-10-18-l4-label-sweep-unit.md` in #221,
  `2026-10-18-ci-main-complement.md`, part 3 pending) are left to that PR.
- [x] **Task 4: docs.** `AGENTS.md` (source of truth, folder map, key commands), `docs/agents/folder-layout.md`,
  `docs/decisions.md`, `docs/superpowers/README.md`; one decision entry for this change.
- [x] **Task 5: test.** `tests/unit/docs-index.test.ts`; `bun run verify:quick`.
