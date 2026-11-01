# Stats

- Date: 2026-11-01
- PR: [#367](https://github.com/ShinyQ/ShinyQ-HQ/pull/367)

The first-party visit beacon also sends a private intent ping, once per browser tab session and intent: the CV reader opened (`cv`, counted in `DialogHost`, so every entry point counts), an email link or the copy email button (`email`), a LinkedIn link (`linkedin`) or a GitHub link (`github`). The visit ping carries the landing's `?src=` tag when it is allowlisted (`li`, `gh`, `cv`, `mail`). Counts only, the same skips as visits (automation and crawlers), no identifier, no cookie; the Worker never reads them, so no public number changes. The owner reads them with `bun scripts/intent-report.ts`, which refuses to run in CI. Reason (idea search 2026-11-01): no conversion event existed, and 40 of 43 external landings had no referrer, so nothing showed which channel or change brings recruiters.
