# CI

- Date: 2026-10-18

Lighthouse on affected URLs (owner decision; part 3 of `docs/superpowers/plans/2026-10-18-ci-main-complement.md`). A pull request checks only the URLs its files can move plus the home page `/en`. Every URL still runs for the layouts, stylesheets, the font setup, the message files and selection (`src/i18n/`), the build scripts, the dataset and budget changes (`lighthouserc.json` is a CI file); any other module in the layouts' static closure lands in a chunk every page loads the same way, so `/en` measures it (plus the pages that import it, unless every page does). The `main` complement run and the nightly still check every URL the PR skipped. Before: any layout-closure module (for example `src/ask/protocol.ts`) checked all 9 URLs, 8.5 min on PR #217's run 39127959018 and 8.4 min on PR #210's run 39115786663.
