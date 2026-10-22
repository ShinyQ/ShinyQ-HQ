# B1 Living Machine, PR B1-3: Bay Power-Up and Tour Implementation Plan

Status: dropped by owner 2026-10-23 ("Skip the tour things"): no tour, no Rover menu replay, no bay power-up; the bays stay lit as shipped in #291. Nothing of this plan merged.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** B1's bays stay dark until powered; on the first visit after the unlock Rover drives the aisle while each bay
powers up in turn and parks at the reactor as it spins up; any input skips it; a B1-only Rover menu entry replays it;
reduced motion fades the bays on in place with a short Rover line.

**Architecture:** A pure power model (`floors/engine/power.ts`: which bays are lit, the tour's timeline, levels per
bay at time t), persisted per visitor in the store (`b1Powered: EngineBayId[]`, `b1Toured: boolean`, filled by the
persist `merge`, `STORE_VERSION` unchanged), a tour runner in the B1 chunk (`floors/engine/tour.ts`) that drives the
shared autopilot (`rover.autopilot`, road route) stop by stop and powers bays as Rover passes, and the scene reading a
per-bay level (instance color scale in `FlowMesh`/`PanelMesh`, sign opacity) with no new draw call or program. The
Rover menu gains one B1-only entry. Spec: `docs/superpowers/specs/2026-10-22-b1-living-machine-design.md` section 4.

**Tech Stack:** React Three Fiber, zustand (persist), next-intl, Vitest, Playwright, Bun.

## Global Constraints

- No em dash (U+2014). Bilingual strings (`engine` namespace for 3D-only strings; `/en/quick` is at its HTML budget).
- `useDispose`, `useFrame` deltas only, no new rAF loop, no words painted on the floor.
- B1 under 100 scene calls both tiers, 150 whole-frame on rides, no new shader program, memory gates flat.
- B1 chunk 16 KB gzip cap (ask the owner before raising). Main-path additions (store keys, the menu entry) follow
  measured plus 0.6 KB; the first-frame cap never moves without asking.
- Locked visitors see nothing of B1 (no chunk, no drawer data, no DOM).
- Any visitor input (pointer, key, wheel, touch, joystick) during the tour skips it and powers everything at once.

## Tasks

### Task 1: The power model and store keys

**Files:** create `src/experience/floors/engine/power.ts`, `tests/unit/engine-power.test.ts`; modify
`src/store/useHQStore.ts` (persisted `b1Powered`, `b1Toured`, actions `powerBay(id)`, `powerAllBays()`,
`replayB1Tour()` that clears `b1Toured` for the session only), `tests/unit/store*.test.ts`.

**Produces:** `TOUR = { stepS: 1.6, sparkS: 0.35, flickerS: 0.5 }`; `tourPlan(layout): { bay: EngineBayId; at: Vec2; t: number }[]`
(bays in aisle order, stops on the aisle at each bay's x, ending at the reactor door); `bayLevel(id, powered, tourT | null): number`
(0 dark, 1 lit, a flicker ramp during the tour); `allPowered(powered)`.
- [ ] Tests first: dark by default; a visited bay (door reached or drawer opened) powers; the tour powers in aisle
  order; old payloads without the keys merge to `[]` and `false`.
- [ ] Commit `feat(b1): bays power up and the state persists per visitor (B1-3)`.

### Task 2: Dark and powered bays in the scene

**Files:** `engine/scenery.ts` (per-bay instance ranges), `engine/EngineFx.tsx` (a per-instance level applied to the
instance color at a low rate), `EngineRoom.tsx`, `engine/scenery.ts` signs (dim amber when dark), `tests/unit/engine-scenery.test.ts`.
- [ ] A dark bay: front strip off, screens at 10 percent, sign dim; powered: today's look. No new draw call.
- [ ] Commit `feat(b1): dark bays until powered (B1-3)`.

### Task 3: The tour runner

**Files:** create `engine/tour.ts` (B1 chunk), `tests/unit/engine-tour.test.ts`; modify `EngineRoom.tsx` (start the
tour on the first B1 arrival when `b1Toured` is false), the reactor (spin-up boost at the end).
- [ ] Drives `rover.autopilot` stop by stop (`AutopilotRequest`, road route), powers each bay as Rover reaches it
  (light cascade, sign flicker, a short spark from the bay's front strip), ends parked at the reactor door; any input
  aborts and powers all; reduced motion: no drive, all bays fade on over 1.5 s and Rover says `engine.tourReduced`.
- [ ] `__hq.reactor`-style test hook: `tour.state()`, `tour.skip()`.
- [ ] Commit `feat(b1): the power-up tour (B1-3)`.

### Task 4: Replay from the Rover menu

**Files:** `src/hud/RoverTerminal.tsx`, `src/hud/terminal.ts`, `messages/{en,id}.json` (`hud.terminal.b1Tour`
"Replay the power-up tour" / "Putar ulang tur menyalakan mesin"), `tests/hud/RoverTerminal.test.tsx`, `e2e/engine-room.spec.ts`.
- [ ] The entry shows only while the rover is on B1 (after the missions, before "explore on my own"), runs the tour.
- [ ] Commit `feat(b1): replay the power-up tour from the Rover menu (B1-3)`.

### Task 5: Verification, captures, video, docs

- [ ] `bun run verify:quick`, `bun run e2e:changed`, the B1 perf gates; bytes measured.
- [ ] Captures (each powered bay, the tour mid-way) and a tour video (`page.video` in a capture script), sent to the
  coordinator before the merge.
- [ ] Docs: `docs/agents/floor-b1-engine-room.md`, `docs/agents/hud-and-drawer.md` (menu entry, storage keys),
  `docs/features.md`, decision `docs/decisions/2026-10-22-b1-power-up-tour.md`.
