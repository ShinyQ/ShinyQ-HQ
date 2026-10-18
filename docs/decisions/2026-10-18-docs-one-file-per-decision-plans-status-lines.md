# Docs

- Date: 2026-10-18

Shared docs stop forcing merge conflicts between parallel PRs (coordinator request, user-directed; plan `docs/superpowers/plans/2026-10-18-conflict-free-docs.md`). Owner decisions are one file each in `docs/decisions/` (`YYYY-MM-DD-slug.md`) instead of rows in one table in `docs/decisions.md`, which becomes a static page; the plans table and counts line leave `docs/superpowers/README.md`, and each plan's own `Status:` line is the only status record. `bun scripts/docs-index.ts` prints both tables at read time and nothing generated is committed, so two PRs that each add a decision and a plan touch no common line. Before: every such PR appended to the same two tables, and each conflict cost a full CI rerun (about 25 min, three times on #221).
