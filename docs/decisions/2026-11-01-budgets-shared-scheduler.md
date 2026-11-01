# Budgets

- Date: 2026-11-01

The owner accepted a small Classic cost for a larger 3D saving (performance audit Phase 1, candidate 3D-2): `next.config.ts` aliases npm `scheduler`, which the R3F reconciler imports, to `next/dist/compiled/scheduler`, the identical build React DOM runs. The 3D first-frame path and both session totals drop by 1,287 B gzip on both tiers (full 476,341 to 475,054 B, lite 460,207 to 458,920 B). The shared scheduler becomes its own chunk, so it loses Turbopack's scope hoisting, and every Classic page's JS grows by 68 to 72 B gzip (`/en/quick` 219,730 to 219,800 B of the 245,760 B cap; the script count stays 12). This is an exception to the audit's rule that every gate stays equal or better; no cap moves.
