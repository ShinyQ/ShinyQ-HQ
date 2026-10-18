# CI

- Date: 2026-10-18

Narrower PR perf selection (owner decision; part 2 of `docs/superpowers/plans/2026-10-18-ci-main-complement.md`). A shared `src/` module the 3D roots import no longer selects every floor and ride: it gets the perf keys of the 3D files that import it (directly or through non-3D files, stopping at the first 3D file), plus a module to gate map for the server payload path (`SHARED_PERF_RULES`: `src/ask/` to `boot` and `bytes`, certifications and highlights to the Lobby gates); shared 3D core (`Experience.tsx`, the store, the renderer) still selects everything and an unknown 3D importer or unmapped payload module the whole lane except `memory-full`. No perf test leaves the suite: the `main` complement run covers what a PR skips. Before (PR #210, run 39115786663, `src/ask/client.ts` and `protocol.ts`): every floor and ride, perf shards 11.2 and 9.1 min, PR wall 13.75 min, 40 runner-min. After: `boot` and `bytes` only (about 170 s of tests on the 2 required shards).
