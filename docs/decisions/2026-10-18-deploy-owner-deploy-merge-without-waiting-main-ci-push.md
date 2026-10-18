# Deploy

- Date: 2026-10-18

Owner: "deploy on merge without waiting for main CI". A push to `main` deploys at once when the merged PR's required checks were green on a head with the same tree as the merge commit (verified, the ruleset stays non-strict; otherwise it waits for the complete `main` CI). `main` still runs the full suite; a red `main` CI rolls Cloudflare Pages production (and the hq-stats Worker when it changed) back to the last good deployment, opens or updates the `deploy-rollback` issue and blocks the fast path until `main` is green again. The one-CI-in-flight rule and the manual `gh workflow run deploy.yml` path stay. Supersedes "a push to main never deploys" (2026-10-11).
