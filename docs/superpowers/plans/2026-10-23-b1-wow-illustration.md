# B1 WOW Pass Implementation Plan

Status: in review

**Goal:** B1 reads as a WOW hidden floor: a data-driven hologram in every station bay and the site's build stack
orbiting the reactor ([spec](../specs/2026-10-23-b1-wow-illustration-design.md)).

**Architecture:** Content first (the stack list, two logos, `RoomEngine.holo`), then a B1-only atlas built by the L1
atlas code, then a pure look module (`floors/engine/holo.ts`) and one renderer (`floors/engine/EngineHolo.tsx`) on
the holo program and the L1 logo material. Everything new ships in the B1 chunk.

## Tasks

- [x] Add `stations.blueprint.stack` (schema and content), `threejs.svg` and `playwright.svg` with their registry
  entries and sources.
- [x] Split `writeAtlas` and `atlasFileProblems` out of `scripts/logo-atlas.ts`, add text cells, write
  `scripts/engine-atlas.ts` with its `--check` in `bun run build`.
- [x] Compute `RoomEngine.holo` in `content/room-views/engine.ts`.
- [x] Write `holo.ts` (shapes, projector, halo, wake) and `EngineHolo.tsx`; mount it in `EngineRoom` with the B1
  drawer data; expose `__hq.reactor().holo()`.
- [x] Unit tests (`tests/unit/engine-holo.test.ts`) and the e2e check in `e2e/engine-room.spec.ts`.
- [x] Measure: the B1 chunk under 16 KB without a cap change, draw calls, programs, memory.
- [x] Captures for the owner, docs (`docs/agents/floor-b1-engine-room.md`, `docs/features.md`, `docs/content.md`).
