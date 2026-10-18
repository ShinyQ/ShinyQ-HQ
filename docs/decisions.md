# Owner decisions log

Dated owner decisions and the history behind the current rules. The rules themselves (current state only) live in
[`AGENTS.md`](../AGENTS.md) and [`docs/agents/`](agents/); content decisions C1 to C9 are in appendix 07 section 7
([`superpowers/specs/agent-hq/07-content-map.md`](superpowers/specs/agent-hq/07-content-map.md)).

Each decision is its own file in [`decisions/`](decisions/), so parallel PRs never edit the same lines. This page
has no table to update; do not add rows here.

## Read the log

- Browse [`decisions/`](decisions/): file names start with the date, so the listing is the log in date order.
- Print the whole log as one table: `bun scripts/docs-index.ts decisions`.
- Search: `grep -ril "<term>" docs/decisions/`.

## Add a decision

Add one file in the same PR as the decision, named `docs/decisions/YYYY-MM-DD-slug.md` (`YYYY-MM-slug.md` when only
the month is known), with a short kebab-case slug of the area and the gist:

```markdown
# Area

- Date: 2026-10-18
- PR: [#123](https://github.com/ShinyQ/ShinyQ-HQ/pull/123)

The decision, in one paragraph (what was decided and why; numbers before and after when it is a measured change).
```

- The heading is the area (`3D experience`, `CI`, `Content: CV`, a floor name, ...), the same areas as before.
- `- Date:` is when the decision was made and must equal the file name's date prefix.
- `- PR:` links the PR that shipped it (comma separated when several); leave the line out until the PR number is
  known, and add it in a later PR if needed.
- Never edit another PR's decision file to add yours; a later decision that changes an earlier one gets its own
  file that says what it replaces.

`tests/unit/docs-index.test.ts` checks every file against this format.
