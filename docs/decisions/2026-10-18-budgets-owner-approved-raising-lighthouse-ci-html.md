# Budgets

- Date: 2026-10-18
- PR: [#199](https://github.com/ShinyQ/ShinyQ-HQ/pull/199)

Owner approved raising the Lighthouse CI HTML document budget from 81,920 B (80 KB) to 83,968 B (82 KB) as a stopgap: `/en/quick` sat about 6 B under 80 KB because every Classic page inlines the whole `hud` message namespace, so any new HUD string (the Floor ambience hint in #199, the cert and B1 PRs) failed it. Follow-up: inline only the keys a page renders, trim the RSC duplication on `/en/quick`, and keep at least 4 KB headroom under 82 KB on every page.
