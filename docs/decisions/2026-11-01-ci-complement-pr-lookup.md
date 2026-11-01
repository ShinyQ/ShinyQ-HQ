# CI

- Date: 2026-11-01

Complement runs survive GitHub's merge link lag (owner decision, a follow-up of the CI audit in #363). `Plan CI` on a push to `main` finds the merged pull request through `GET commits/{sha}/pulls`; on the Dependabot merge of #328 (`main` run 41236378655) it asked 2 s after the push, before GitHub had linked the commit to its pull request, found none and ran everything (the deploy merge gate found it about 12 s later). It now asks again every 5 s for about 30 s while no pull request names the commit as its merge (`PR_LOOKUP_RETRIES`, `PR_LOOKUP_DELAY_MS` in `scripts/ci-complement.ts`), then falls back as before. Seen on 1 of 43 merges from 2026-10-23 to 2026-10-31; each such merge saves about 10 to 11 min of `main` CI (the complement instead of a full run). No gate changes.
