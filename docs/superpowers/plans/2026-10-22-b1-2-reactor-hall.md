# B1 Living Machine, PR B1-2: The Reactor Hall Implementation Plan

Status: in review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** B1 ends in a reactor hall: a tall core on the aisle axis with rotating rings and a coolant glow that reacts
to live CI lanes, production deploys, active agent desks and the public visit and Ask numbers, with a reactor
station and drawer, and a hum that rises near the core.

**Architecture:** Pure layout and model first (`floors/engine/layout.ts`, new `floors/engine/reactor.ts`), then one
B1-only poller (`floors/engine/reactorLive.ts`, the office's `createOfficePoller` on `/api/office?v=4`) plus the
existing stats store (`requestStats`, one request per page load), then the scene (`floors/engine/ReactorCore.tsx`:
instanced holo `ring` and `core` modes, the program B1 already compiles) and the drawer (`EngineBody`), then the
audio proximity gain. Everything new ships in the B1 chunk except the audio hook (main path, measured plus 0.6 KB).
Spec: `docs/superpowers/specs/2026-10-22-b1-living-machine-design.md` section 3.

**Tech Stack:** React Three Fiber, three.js, zustand, Web Audio, Vitest, Playwright, Bun.

## Global Constraints

- No em dash (U+2014). Bilingual strings. `useDispose` after every memoized geometry, material or texture. Animate
  only with `useFrame` deltas; no new rAF loop. No words painted on the floor (`FloatingSigns`). Point-and-go registry
  for the reactor target.
- Space rules (`tests/helpers/space.ts`): obstacles touching or at least 6 u apart (and from the slab edges), roads
  at least 8 u wide, 6 u floor from the start to within 4 u of every pad; the call pad area, the arrival zone and the
  Express Return pad stay clear.
- B1 under `FLOOR_SCENE_CAPS.B1` (100) scene calls on both tiers, 150 whole-frame calls on rides, 30k triangles,
  shader programs at most `e2e/perf/baseline.json` plus 2 (target: plus 0), memory gates flat.
- B1 chunk cap 16 KB gzip (4.8 KB before B1-1): ask the owner before raising it. Main-path additions follow
  measured plus 0.6 KB; the first-frame cap never moves without asking.
- Polling only while the rover is on B1, the office back-off (`POLL`: 10 s active, 30 s resting, an error keeps the
  last feed for 60 s then offline), a 10 minute idle stop reset by input, the tab turning visible counts as input.
- Offline, stale, disabled or reduced motion: a calm idle pulse and the plate keeps its numbers (or dashes).

## Data available (verified)

- `/api/office?v=4` (`parseOfficeResponseV4`): `desks[]` with `state` (asleep or awake), `pipeline.runs[]` (newest
  first, at most 3) with `jobs[]` (`queued`, `running`, `done`, `failed`, at most 24 lanes), `pipeline.ships[]`
  (`kind: "deploy"`, `status: "success"`, `at` epoch ms).
- `/api/stats` (`useStats()`): rolled up every 2 hours, periods `d30` and `all` only. There is no "today" number:
  the reactor uses `visits.d30` and `asks.d30.total` (the spec's "today" is read as the newest public window;
  noted in the PR and the decision).

## Tasks

### Task 1: The hall layout

**Files:** `src/experience/floors/engine/layout.ts`, `src/experience/floors/engine/scenery.ts` (workbench moves),
`tests/unit/engine-layout.test.ts`, `tests/unit/engine-scenery.test.ts`, `tests/unit/arrivals.test.ts` if it pins B1.

**Produces:** `ENGINE.bounds.maxX` about 68; `ENGINE.reactor = { x, z: 0, r }` (center on the aisle axis);
`EngineLayout.reactor: Rect` (obstacle), `EngineLayout.workbench` beside it (against the north or south wall, still
an obstacle), the aisle extended to 6 u before the reactor; `engineRoom("reactor")` style room `B1:reactor` with a door
pad on the aisle side, a spur, a `B1:reactor` view zone looking east at the core and the `B1:workbench` zone moved
with the workbench; `ENGINE.returnPad` moved into the hall if needed, still passing the pad rules.

Proposed numbers (adjust only if a space-rule test demands it, and say why): `bounds.maxX` 70; `ENGINE.reactor`
`{ x: 57, z: 0, r: 5 }` with the obstacle rect x 52 to 62, z -5 to 5; `aisle.endX` 46; the reactor door pad at (50, 0)
facing (1, 0) (a `DoorTrigger` for room `B1:reactor`, reached from the aisle end, no spur needed when the aisle reaches
it, else a short spur); `B1:reactor` zone x 46 to 52, z -4 to 4, yaw east (eastbound only); the workbench rect x 54 to
62, z 11 to 14 (flush with the south wall, 6 u from the reactor) with its `B1:workbench` zone in the gap north of it,
looking south; `returnPad` stays (40, 9) unless the pad rules fail. `ENGINE_STATIONS` stays the seven content stations:
the reactor is a separate room (`ENGINE_REACTOR_ROOM = "B1:reactor"`), not a bay. Its point-and-go target registers
with the B1 footprints in `src/experience/interact/registry.ts`.

- [ ] Tests first: reactor center z 0 and east of every bay; arrival yaw (east) ray from `ENGINE.arrival` passes
  within `r` of the reactor center; space rules pass; call pad free; the reactor door is a `DoorTrigger`; zones exist.
- [ ] Implement; run `bunx vitest run tests/unit/engine-layout.test.ts tests/unit/engine-scenery.test.ts tests/unit/arrivals.test.ts`.
- [ ] Commit `feat(b1): a reactor hall at the aisle end (B1-2)`.

### Task 2: The reactor model (pure)

**Files:** create `src/experience/floors/engine/reactor.ts`, `tests/unit/engine-reactor.test.ts`.

**Produces:**
```ts
export type ReactorLane = "running" | "failed" | "done" | "queued";
export interface ReactorState {
  live: boolean;            // a ready, fresh office feed and motion allowed
  lanes: ReactorLane[];     // newest run's jobs, at most REACTOR.lanes (24)
  sparks: number;           // awake desks, 0 to 10
  deployAt: number | null;  // newest successful production deploy's `at`
  visits: number | null;    // stats visits.d30
  asks: number | null;      // stats asks.d30.total
  pulseHz: number;          // REACTOR.pulse.idle when not live, else scaled by visits and asks, clamped
}
export const REACTOR: { lanes: 24; sparks: 10; flashMs: 1500; pulse: { idle: 0.25; min: 0.3; max: 1.2 } };
export function reactorState(office: OfficeFeed | null, stats: StatsState | null, opts: { reducedMotion: boolean; now: number }): ReactorState;
export function flashLevel(deployAt: number | null, now: number): number; // 1 at the deploy, 0 after flashMs
```
- [ ] Tests first: idle state for null, offline, disabled and stale feeds; lanes mapped and capped; sparks counts awake
  desks; deploy only `kind: "deploy"` and `status: "success"`; pulse monotonic in visits plus asks and clamped; reduced
  motion forces `pulseHz = idle` but keeps numbers.
- [ ] Implement, run, commit `feat(b1): the reactor's live model (B1-2)`.

### Task 3: The B1 poller

**Files:** create `src/experience/floors/engine/reactorLive.ts`, `tests/unit/engine-reactor-live.test.ts`.

**Produces:** `reactorLive.start()`, `reactorLive.stop()`, `useReactorFeed(): OfficeFeed` built on
`createOfficePoller({ path: OFFICE_V4_PATH, parse: parseOfficeResponseV4, interval: pollInterval })`, the same input
and visibility listeners as `office/live.ts` (attach on start, detach on stop); `start` also calls `requestStats()`.
A `__hq.reactor` test hook (feed, poll now, advance clock) mirroring `officeTest`.
- [ ] Tests with an injected fetcher and clock: no request before `start`; stop aborts and detaches; idle stop after
  10 min without input; visibility resumes.
- [ ] Implement, run, commit `feat(b1): poll the office feed only on B1 (B1-2)`.

### Task 4: The core in the scene

**Files:** create `src/experience/floors/engine/ReactorCore.tsx`; modify `EngineRoom.tsx`, `scenery.ts` (core
solids in the merged mesh, sign plate), `tests/unit/engine-scenery.test.ts`; perf baseline only if a program count
changes (it should not).

- [ ] Core: merged boxes (base, column, cap) in `scene.solids`; one instanced holo mesh in `ring` mode for 3 to 4
  rings of lane segments (instance color per lane status; lite: half the segments), the same mesh's spare instances as
  orbiting sparks (full tier only); one `core` mode instance for the coolant column. Rotation through the group's
  `rotation.y += delta * speed` in `useFrame`, the pulse through `uPulse` or instance color, a deploy flash from
  `flashLevel`; reduced motion: no rotation, pulse frozen.
- [ ] Counter plate: two `FloatingSigns` lines (visits, questions) with the numbers only, formatted with the locale.
- [ ] Mount it in `EngineRoom` with `reactorLive.start()` on mount and `stop()` on unmount.
- [ ] Tests: instance counts per tier, colors per lane status, no rotation when reduced motion.
- [ ] Commit `feat(b1): the living reactor core (B1-2)`.

### Task 5: The reactor station and drawer

**Files:** `src/content/room-views/engine.ts`, `src/content/room-views/types.ts` (`RoomEngine.reactor` labels),
`src/hud/drawer/EngineBody.tsx` (a `ReactorPanel` that reads `useReactorFeed` and `useStats`), `messages/{en,id}.json`
(`engine.reactor*` in the `engine` namespace only if client-side; prefer server-resolved labels in the room view),
`src/experience/interact/registry.ts` if it lists B1 targets, `tests/unit/engine-views.test.ts`, `e2e/engine-room.spec.ts`
(open the reactor drawer with a mocked `/api/office?v=4` and `/api/stats`, see the numbers).
- [ ] The drawer: live numbers (lanes running, failed, done; awake desks; last deploy time; visits and questions in the
  last 30 days) and the mapping in plain words, in both languages; offline shows the idle explanation.
- [ ] Commit `feat(b1): the reactor station and its drawer (B1-2)`.

### Task 6: The hum near the core

**Files:** `src/lib/audio/ambience.ts` (the B1 layer gets a proximity gain), the audio facade (`src/lib/audio/index.ts`
or where `setFloor` is exposed), `ReactorCore.tsx` (distance to the core, 4 updates a second), `tests/unit/ambience*.test.ts`.
- [ ] `nearGain(d) = 1 + REACTOR_HUM.boost * clamp(1 - (d - inner) / (outer - inner), 0, 1)` (boost about 1, i.e.
  up to 6 dB louder at the core); ramped, never above the floor peak times 2.
- [ ] Measure the main-path bytes; record the before and after in the decision.
- [ ] Commit `feat(b1): the hum rises near the reactor (B1-2)`.

### Task 7: Verification, captures, docs

- [ ] `bun run verify:quick`, `bun run e2e:changed`, `E2E_PORT=<port> bun run e2e:perf` (B1 floor gates both tiers,
  rides, memory, bytes); B1 chunk under 16 KB.
- [ ] Captures (`scripts/b1-shots.ts` extended): arrival, aisle, each bay, the reactor with live data (mocked
  routes), at 1440x900, 820x1180, 390x844, full and lite; send them to the coordinator before merging.
- [ ] Docs: `docs/agents/floor-b1-engine-room.md` (hall, reactor, poller, drawer, budgets), `docs/features.md`,
  decision `docs/decisions/2026-10-22-b1-reactor-hall.md` with the request estimate (visits per day on B1 times the
  polls per B1 visit at 10 s or 30 s, capped by the 10 minute idle stop) and the measured bytes.

## Status of tasks

- Tasks 1 to 7 are done and reviewed (subagent-driven, a review per task); verification is green (typecheck, lint, unit,
  build, the B1 perf gates, `e2e/engine-room.spec.ts` and `e2e/memory.spec.ts`), and the owner's reviewer reviewed the
  captures.
- Then one fix round on the owner's review: the rings in the Agent Office tower's CI colors (running violet with a
  chase, done green, failed red, queued dim) on the holo `core` mode, the lanes in the tower's order, a brighter open
  energy column (inner beam, crown ring, no cap) with a glow pool on the plinth, a depth-only mask over the slab
  outline's far east edge (the line across the reactor view), and the reactor drawer going offline with the feed.
