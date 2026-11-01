# Budgets

- Date: 2026-11-01

The owner accepted a small Classic cost for a larger 3D saving (performance audit Phase 1, candidate 3D-2): `next.config.ts` aliases npm `scheduler`, which the R3F reconciler imports, to `next/dist/compiled/scheduler`, the identical build React DOM runs. The 3D first-frame path and both session totals drop by 1,279 B gzip on both tiers (measured on `main` 83236cb6: full 437,165 to 435,886 B, lite 421,030 to 419,751 B). The shared scheduler becomes its own chunk, so it loses Turbopack's scope hoisting, and every Classic page's JS grows by 69 to 71 B gzip (`/en/quick` 219,065 to 219,135 B of the 245,760 B cap; the script count stays 12). This is an exception to the audit's rule that every gate stays equal or better; no cap moves.
