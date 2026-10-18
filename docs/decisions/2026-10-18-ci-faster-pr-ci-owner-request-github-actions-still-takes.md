# CI

- Date: 2026-10-18

Faster PR CI (owner request: "The github actions still takes very very long. DOnt u have anything you can do to faster this?"; owner chose option C). Pull requests run only the affected tests: the mapped e2e specs plus a smoke set (static routes, boot, deploy rules, one ride, the 3D HUD axe check) on 1 to 8 shards sized from `e2e/durations.json`, the affected 3D perf tests (`memory-full` only for memory-sensitive paths) and the affected Lighthouse URLs. Unmapped paths, CI or dependency changes, e2e helpers and the `full-ci` label run everything. Pushes to `main`, dispatches and the nightly run the full suite on 8 e2e and 4 perf shards; deploys still require a complete green run. PR perf keeps 2 shards so the required check names stay.
