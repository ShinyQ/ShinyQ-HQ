# CI

- Date: 2026-10-18

Two CI runs in flight (owner decision; task 9 of `docs/superpowers/plans/2026-10-18-ci-main-complement.md`), from the measured peak concurrent jobs against the GitHub Free plan cap of 20: full `main` runs 14 (39114729615, 39116733269, 39119431246), a complement dispatch 14 (39128755562), `Deploy` about 1 more, full PR runs 12 (39122107380, 39126462529), selective PR runs 5 to 7 (39111135400, 39108331771, 39127959018). Rule: at most 2 runs in flight, both pull request runs and at most one of them a full run (12 + 7 = 19); a `main` run stays the only run in flight (14 + 1 + 7 = 22 is over the cap). Supersedes "one CI run at a time".
