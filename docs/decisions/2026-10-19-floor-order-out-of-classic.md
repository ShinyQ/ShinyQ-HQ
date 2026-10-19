# Performance

- Date: 2026-10-19

Owner request (perf assessment item 3): "useHQStore imports @/experience/config, which pulls every floor layout into Classic (25.4 KB gz). Move FLOOR_IDS, floorIndex and the Lobby spawn to a tiny module. Owner decision: moving these bytes from Classic into the 3D path is fine if the 3D session caps still pass. Combine with item 7 to win the bytes back on 3D. Do not raise any budget without asking me." The move pushed the 3D path over its caps, so the owner decided (verbatim): "option A is approved. Ship item 3 and raise the three 3D caps (first frame, full session, lite session) by the moved floor-layout bytes, about +22 KB, then tighten them by whatever item 7 wins back. Two other PRs raise the same caps: Study Vault #247 (+about 0.6 KB) and Agent Office PR3 (full 473, lite 449.4). The caps add up, so whoever merges later rebases on main, re-measures, and sets each cap to the measured value plus about 0.6 KB of headroom. Record it in the decision entry with the measured numbers."

What shipped: the floor order (`FLOOR_IDS`, `READY_FLOORS`, `floorIndex`) moved to `src/experience/floorOrder.ts` and the Lobby spawn with its kiosk axis to `src/experience/floors/lobby/spawn.ts` (both import only `@/lib/floors` and types; `config.ts` re-exports them, values unchanged). The store, the drawer host and the locale switch read them, so no Classic page loads a floor layout, and `bun run build` fails when one does (`scripts/check-client-chunks.ts`). Item 7 (same PR): the full tier's composer is built with `postprocessing` directly instead of `@react-three/postprocessing` (which bundled n8ao): the lazy `Effects` chunk went from 23,881 to 16,038 B gzip, so the full tier's main path went down 8,489 B (lite 425 B, from chunking).

Measured on `main` 59fca844 against this PR rebased on it (gzip, as served; `e2e/perf/bytes-3d.spec.ts`, deterministic over two runs):

- Classic scripts: `/en` 240.6 to 219.8 KB (13 to 12 scripts), `/en/labs` 235.8 to 215.1 KB, `/en/journey` 235.6 to 216.5 KB, `/en/cv` 234.2 to 212.8 KB.
- 3D first frame (`?prefetch=off`): full 441.3 to 456.1 KB (467,012 B), lite 417.7 to 440.3 KB.
- 3D session total (main path plus L3, L4, RF; floor chunks unchanged at 29.0 KB): full 470.4 to 485.1 KB (496,736 B), lite 446.7 to 469.3 KB (480,602 B).
- New caps (measured plus about 0.6 KB): `failAt` (first frame, both tiers, set by full) 450 to 456.7 KB; `session.full` 471 to 485.7 KB; `session.lite` 447.3 to 469.9 KB.
