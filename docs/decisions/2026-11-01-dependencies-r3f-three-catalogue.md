# Dependencies

- Date: 2026-11-01
- PR: [#373](https://github.com/ShinyQ/ShinyQ-HQ/pull/373)

`@react-three/fiber` is patched with `bun patch` so its `Canvas` no longer registers the whole three namespace (`extend(THREE)`); the app registers only the three classes it renders as JSX elements (`THREE_CATALOGUE` in `src/experience/scene/threeCatalogue.ts`, kept exact by `tests/unit/three-catalogue.test.ts`, which also fails when an R3F bump leaves the installed version unpatched). The owner chose the patch over a project `Canvas` built on R3F's `createRoot` (performance audit Phase 1, candidate 3D-1): one changed line instead of re-implementing R3F's resize, event and error handling, at the cost of re-creating the patch on each R3F version bump. Measured with the bytes gate: the 3D first-frame path drops from 476,341 to 437,196 B gzip on the full tier and from 460,207 to 421,061 B on the lite tier, the session totals from 543,513 to 504,366 B (full) and 527,379 to 488,231 B (lite); floor and office chunks are unchanged. No cap moves in this change.
