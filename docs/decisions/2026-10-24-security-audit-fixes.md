# Security

- Date: 2026-10-24
- PR: [#319](https://github.com/ShinyQ/ShinyQ-HQ/pull/319)

A scoped security audit (Cloudflare `security-audit` skill: Pages Functions, both Workers, the office relay, headers and CSP, and the workflows) confirmed no vulnerability. It left six source-grounded leads, and the owner chose to fix the real ones and add two cheap guards:
- **Ask answer cache:** only a request with no verified history writes the shared cache (the same gate as the read). `INVISIBLE` now also strips Unicode tag characters, variation selectors and the combining grapheme joiner from questions and answers. Before, a signed turn that `usableHistory` drops could skip the read and still overwrite another visitor's cached answer, and hidden tag text reached the model without changing the cache key.
- **Ask breaker:** grounding blocks a visitor can invite (numeric, entity, employer, code, defamation, personal-data) no longer count, so one visitor cannot pause Ask for everyone with ordinary questions.
- **Office:** `deleted`, `renamed` and `transferred` revoke a name as `privatized` does. Revoked names go on a `revoked` list that a stale public-looking delivery cannot undo, until `publicized` or a webhook `ping`. `deployment_status` counts only for the default branch.
- **`ask-samples.yml`:** no longer runs the sampled branch's setup action and never saves a cache (install cache restore-only, `setup-bun` `no-cache`), because its branch code runs in main's cache scope, which the production deploy restores.
- **Not changed:** forged visit and RUM beacons below the `VISIT_FREEZE` / `MODE_FREEZE` / `PERF_FREEZE` ceilings stay an accepted tolerance. Beacons carry no proof of a browser, and the 5x visit ratio allows for ad blockers. The comments and docs now say the ratio bounds forged pings rather than preventing them.
